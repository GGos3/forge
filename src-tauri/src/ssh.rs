use std::collections::HashMap;
use std::future::Future;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use russh::client::{self, Handle};
use russh::keys::{self, Algorithm, PrivateKeyWithHashAlg};
use russh::Disconnect;
use russh_sftp::client::SftpSession;
use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncWriteExt;
use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

use crate::connection_store::ConnectionStore;
use crate::explorer::{ExplorerError, FileMetadata, FileNode, FileSystemProvider, is_binary_content};
use crate::known_hosts::KnownHostsStore;
use crate::types::{
    ExplorerEntry, ReadFileResponse, SshAuthMethod, SshConnectRequest,
    SshConnectionLifecycleEvent, SshConnectionProfile, SshConnectionStatus,
};

/// Timeout for the user to respond to a host-key verification prompt.
const HOST_KEY_VERIFY_TIMEOUT: Duration = Duration::from_secs(120);

/// Shared map of pending host-key verification requests.
/// Key: unique request ID.  Value: oneshot sender that delivers the user's decision (true = allow).
pub type PendingVerifications = Mutex<HashMap<String, oneshot::Sender<bool>>>;

/// Payload emitted to the frontend when a host-key needs user approval.
#[derive(serde::Serialize, Clone)]
struct HostKeyVerificationPayload {
    id: String,
    host: String,
    port: u16,
    key_type: String,
    fingerprint: String,
    known_fingerprint: Option<String>,
    mode: String,
}

const SSH_KEEPALIVE_INTERVAL: Duration = Duration::from_secs(15);
const SSH_INACTIVITY_TIMEOUT: Duration = Duration::from_secs(90);
const SSH_KEEPALIVE_MAX: usize = 3;
const SSH_MONITOR_POLL_INTERVAL: Duration = Duration::from_secs(5);
const REMOTE_DIR_CACHE_TTL: Duration = Duration::from_secs(5);

#[derive(Clone)]
struct SshClientHandler {
    host: String,
    port: u16,
    known_hosts: KnownHostsStore,
    app_handle: AppHandle,
    pending: Arc<PendingVerifications>,
}

impl client::Handler for SshClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        let fingerprint = server_public_key.fingerprint(Default::default()).to_string();
        let key_type = server_public_key.algorithm().to_string();
        let host_port = format!("{}:{}", self.host, self.port);

        let saved = self.known_hosts.get_fingerprint(&host_port).unwrap_or(None);

        if let Some(ref saved_fp) = saved {
            if *saved_fp == fingerprint {
                return Ok(true);
            }
        }

        let mode = if saved.is_none() { "first-use" } else { "mismatch" };
        let id = Uuid::new_v4().to_string();

        let (tx, rx) = oneshot::channel::<bool>();
        {
            let mut map = self.pending.lock().await;
            map.insert(id.clone(), tx);
        }

        let _ = self.app_handle.emit(
            "ssh://host-key-verification",
            HostKeyVerificationPayload {
                id: id.clone(),
                host: self.host.clone(),
                port: self.port,
                key_type,
                fingerprint: fingerprint.clone(),
                known_fingerprint: saved.clone(),
                mode: mode.to_string(),
            },
        );

        let allowed = tokio::time::timeout(HOST_KEY_VERIFY_TIMEOUT, rx)
            .await
            .unwrap_or(Ok(false))
            .unwrap_or(false);

        {
            let mut map = self.pending.lock().await;
            map.remove(&id);
        }

        if allowed {
            let _ = self.known_hosts.save_fingerprint(&host_port, &fingerprint);
        }

        Ok(allowed)
    }
}

#[async_trait::async_trait]
trait SshConnector: Send + Sync + 'static {
    type Connection: Send + 'static;

    async fn connect(&self, request: &SshConnectRequest) -> Result<Self::Connection, String>;
    async fn disconnect(&self, connection: Self::Connection) -> Result<(), String>;
    fn is_closed(&self, connection: &Self::Connection) -> bool;
}

struct RusshConnector {
    known_hosts: KnownHostsStore,
    app_handle: AppHandle,
    pending: Arc<PendingVerifications>,
}

#[async_trait::async_trait]
impl SshConnector for RusshConnector {
    type Connection = Handle<SshClientHandler>;

    async fn connect(&self, request: &SshConnectRequest) -> Result<Self::Connection, String> {
        let config = Arc::new(client::Config {
            inactivity_timeout: Some(SSH_INACTIVITY_TIMEOUT),
            keepalive_interval: Some(SSH_KEEPALIVE_INTERVAL),
            keepalive_max: SSH_KEEPALIVE_MAX,
            ..Default::default()
        });

        let handler = SshClientHandler {
            host: request.profile.host.clone(),
            port: request.profile.port,
            known_hosts: self.known_hosts.clone(),
            app_handle: self.app_handle.clone(),
            pending: self.pending.clone(),
        };

        let mut handle = client::connect(
            config,
            (request.profile.host.as_str(), request.profile.port),
            handler,
        )
        .await
        .map_err(|e| format!("ssh connection failed: {e}"))?;

        authenticate(&mut handle, request).await?;
        Ok(handle)
    }

    async fn disconnect(&self, connection: Self::Connection) -> Result<(), String> {
        connection
            .disconnect(Disconnect::ByApplication, "", "English")
            .await
            .map_err(|e| format!("ssh disconnect failed: {e}"))
    }

    fn is_closed(&self, connection: &Self::Connection) -> bool {
        connection.is_closed()
    }
}

#[cfg(windows)]
async fn connect_windows_ssh_agent(
) -> Result<
    keys::agent::client::AgentClient<tokio::net::windows::named_pipe::NamedPipeClient>,
    String,
> {
    const OPENSSH_AGENT_PIPE: &str = r"\\.\pipe\openssh-ssh-agent";
    const ERROR_PIPE_BUSY: i32 = 231;

    let stream = loop {
        match tokio::net::windows::named_pipe::ClientOptions::new().open(OPENSSH_AGENT_PIPE) {
            Ok(client) => break client,
            Err(e) if e.raw_os_error() == Some(ERROR_PIPE_BUSY) => {
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            Err(e) => {
                return Err(format!(
                    "failed to connect to OpenSSH agent ({}): {e}",
                    OPENSSH_AGENT_PIPE
                ));
            }
        }
    };

    Ok(keys::agent::client::AgentClient::connect(stream))
}

async fn authenticate(
    handle: &mut Handle<SshClientHandler>,
    request: &SshConnectRequest,
) -> Result<(), String> {
    let auth_result = match request.profile.auth_method {
        SshAuthMethod::Password => {
            let password = request
                .password
                .as_deref()
                .ok_or_else(|| "password auth requires password".to_string())?;

            handle
                .authenticate_password(request.profile.username.clone(), password.to_string())
                .await
                .map_err(|e| format!("password authentication failed: {e}"))?
        }
        SshAuthMethod::Key => {
            let key_path = request
                .profile
                .key_path
                .as_deref()
                .ok_or_else(|| "key auth requires keyPath".to_string())?;

            let private_key = keys::load_secret_key(key_path, request.key_passphrase.as_deref())
                .map_err(|e| format!("failed to load private key: {e}"))?;

            let rsa_hash = match private_key.algorithm() {
                Algorithm::Rsa { .. } => handle
                    .best_supported_rsa_hash()
                    .await
                    .map_err(|e| format!("failed to determine rsa hash algorithm: {e}"))?
                    .flatten(),
                _ => None,
            };

            handle
                .authenticate_publickey(
                    request.profile.username.clone(),
                    PrivateKeyWithHashAlg::new(Arc::new(private_key), rsa_hash),
                )
                .await
                .map_err(|e| format!("public key authentication failed: {e}"))?
        }
        SshAuthMethod::Agent => {
            #[cfg(unix)]
            let mut agent = keys::agent::client::AgentClient::connect_env()
                .await
                .map_err(|e| format!("failed to connect to ssh-agent: {e}"))?;

            #[cfg(windows)]
            let mut agent = connect_windows_ssh_agent().await?;

            #[cfg(not(any(unix, windows)))]
            return Err("SSH agent authentication is not supported on this platform".to_string());

            let identities = agent
                .request_identities()
                .await
                .map_err(|e| format!("failed to request ssh-agent identities: {e}"))?;
            let key = identities
                .into_iter()
                .next()
                .ok_or_else(|| "ssh-agent has no available identities".to_string())?;

            let rsa_hash = match key.algorithm() {
                Algorithm::Rsa { .. } => handle
                    .best_supported_rsa_hash()
                    .await
                    .map_err(|e| format!("failed to determine rsa hash algorithm: {e}"))?
                    .flatten(),
                _ => None,
            };

            handle
                .authenticate_publickey_with(
                    request.profile.username.clone(),
                    key,
                    rsa_hash,
                    &mut agent,
                )
                .await
                .map_err(|e| format!("agent authentication failed: {e}"))?
        }
    };

    if auth_result.success() {
        Ok(())
    } else {
        Err("authentication rejected by remote host".to_string())
    }
}

#[derive(Clone)]
struct CachedRemoteDirectory {
    entries: Vec<FileNode>,
    cached_at: Instant,
}

#[async_trait::async_trait]
trait SftpClient: Send + Sync {
    async fn list_dir(&self, path: &str) -> Result<Vec<FileNode>, String>;
    async fn read_file(&self, path: &str) -> Result<Vec<u8>, String>;
    async fn write_file(&self, path: &str, content: &[u8]) -> Result<(), String>;
    async fn stat(&self, path: &str) -> Result<FileMetadata, String>;
    async fn close(&self) -> Result<(), String>;
}

struct RusshSftpClient {
    session: SftpSession,
}

impl RusshSftpClient {
    fn new(session: SftpSession) -> Self {
        Self { session }
    }
}

#[async_trait::async_trait]
impl SftpClient for RusshSftpClient {
    async fn list_dir(&self, path: &str) -> Result<Vec<FileNode>, String> {
        let target = validate_remote_path(path).map_err(|e| e.to_string())?;
        let directory = self
            .session
            .read_dir(target.clone())
            .await
            .map_err(|e| format!("sftp list_dir failed: {e}"))?;

        let mut output = Vec::new();
        for entry in directory {
            let name = entry.file_name();
            let is_hidden = name.starts_with('.');
            let full_path = join_remote_path(&target, &name);
            output.push(FileNode {
                name,
                path: PathBuf::from(full_path),
                is_dir: entry.file_type().is_dir(),
                is_hidden,
                is_symlink: entry.file_type().is_symlink(),
                permission_denied: false,
            });
        }

        sort_nodes(&mut output);
        Ok(output)
    }

    async fn read_file(&self, path: &str) -> Result<Vec<u8>, String> {
        let target = validate_remote_path(path).map_err(|e| e.to_string())?;
        self.session
            .read(target)
            .await
            .map_err(|e| format!("sftp read_file failed: {e}"))
    }

    async fn write_file(&self, path: &str, content: &[u8]) -> Result<(), String> {
        let target = validate_remote_path(path).map_err(|e| e.to_string())?;
        let mut file = self
            .session
            .create(target)
            .await
            .map_err(|e| format!("sftp create failed: {e}"))?;

        file.write_all(content)
            .await
            .map_err(|e| format!("sftp write failed: {e}"))?;
        file.shutdown()
            .await
            .map_err(|e| format!("sftp close failed: {e}"))
    }

    async fn stat(&self, path: &str) -> Result<FileMetadata, String> {
        let target = validate_remote_path(path).map_err(|e| e.to_string())?;
        let metadata = self
            .session
            .metadata(target.clone())
            .await
            .map_err(|e| format!("sftp stat failed: {e}"))?;

        Ok(FileMetadata {
            path: PathBuf::from(target),
            is_dir: metadata.is_dir(),
            is_file: metadata.is_regular(),
            len: metadata.len(),
            is_read_only: false,
            is_symlink: metadata.is_symlink(),
        })
    }

    async fn close(&self) -> Result<(), String> {
        self.session
            .close()
            .await
            .map_err(|e| format!("sftp close failed: {e}"))
    }
}

#[derive(Clone)]
struct RemoteSession {
    client: Arc<dyn SftpClient>,
    dir_cache: Arc<Mutex<HashMap<String, CachedRemoteDirectory>>>,
}

#[derive(Clone)]
struct RemoteFileSystem {
    connection_id: String,
    client: Arc<dyn SftpClient>,
    dir_cache: Arc<Mutex<HashMap<String, CachedRemoteDirectory>>>,
    show_hidden: bool,
    cache_ttl: Duration,
}

impl RemoteFileSystem {
    fn new(
        connection_id: String,
        client: Arc<dyn SftpClient>,
        dir_cache: Arc<Mutex<HashMap<String, CachedRemoteDirectory>>>,
        show_hidden: bool,
    ) -> Self {
        Self {
            connection_id,
            client,
            dir_cache,
            show_hidden,
            cache_ttl: REMOTE_DIR_CACHE_TTL,
        }
    }

    #[cfg(test)]
    fn with_ttl(
        connection_id: String,
        client: Arc<dyn SftpClient>,
        dir_cache: Arc<Mutex<HashMap<String, CachedRemoteDirectory>>>,
        show_hidden: bool,
        cache_ttl: Duration,
    ) -> Self {
        Self {
            connection_id,
            client,
            dir_cache,
            show_hidden,
            cache_ttl,
        }
    }

    async fn list_dir_async(&self, path: &str) -> Result<Vec<FileNode>, ExplorerError> {
        let normalized_path = validate_remote_path(path)?;

        {
            let cache = self.dir_cache.lock().await;
            if let Some(cached) = cache.get(&normalized_path) {
                if cached.cached_at.elapsed() <= self.cache_ttl {
                    return Ok(cached.entries.clone());
                }
            }
        }

        let mut entries = self
            .client
            .list_dir(&normalized_path)
            .await
            .map_err(|e| ExplorerError::Io(format!("{}: {e}", self.connection_id)))?;

        if !self.show_hidden {
            entries.retain(|entry| !entry.is_hidden);
        }
        sort_nodes(&mut entries);

        let mut cache = self.dir_cache.lock().await;
        cache.insert(
            normalized_path,
            CachedRemoteDirectory {
                entries: entries.clone(),
                cached_at: Instant::now(),
            },
        );

        Ok(entries)
    }

    async fn read_file_async(&self, path: &str) -> Result<Vec<u8>, ExplorerError> {
        let target = validate_remote_path(path)?;
        self.client
            .read_file(&target)
            .await
            .map_err(|e| ExplorerError::Io(format!("{}: {e}", self.connection_id)))
    }

    async fn write_file_async(&self, path: &str, content: &[u8]) -> Result<(), ExplorerError> {
        let target = validate_remote_path(path)?;
        self.client
            .write_file(&target, content)
            .await
            .map_err(|e| ExplorerError::Io(format!("{}: {e}", self.connection_id)))?;

        let mut cache = self.dir_cache.lock().await;
        cache.remove(&target);
        cache.remove(&remote_parent_path(&target));
        Ok(())
    }

    async fn stat_async(&self, path: &str) -> Result<FileMetadata, ExplorerError> {
        let target = validate_remote_path(path)?;
        self.client
            .stat(&target)
            .await
            .map_err(|e| ExplorerError::Io(format!("{}: {e}", self.connection_id)))
    }

    fn run_sync<T>(&self, fut: impl Future<Output = Result<T, ExplorerError>>) -> Result<T, ExplorerError> {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| ExplorerError::Io(format!("failed to initialize remote runtime: {e}")))?;
        runtime.block_on(fut)
    }
}

impl FileSystemProvider for RemoteFileSystem {
    fn list_dir(&self, path: &str) -> Result<Vec<FileNode>, ExplorerError> {
        self.run_sync(self.list_dir_async(path))
    }

    fn read_file(&self, path: &str) -> Result<Vec<u8>, ExplorerError> {
        self.run_sync(self.read_file_async(path))
    }

    fn write_file(&self, path: &str, content: &[u8]) -> Result<(), ExplorerError> {
        self.run_sync(self.write_file_async(path, content))
    }

    fn stat(&self, path: &str) -> Result<FileMetadata, ExplorerError> {
        self.run_sync(self.stat_async(path))
    }
}

fn normalize_remote_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        ".".to_string()
    } else {
        trimmed.replace('\\', "/")
    }
}

fn validate_remote_path(path: &str) -> Result<String, ExplorerError> {
    let normalized = normalize_remote_path(path);

    if normalized.contains('\0') {
        return Err(ExplorerError::NullByte);
    }

    let parsed = Path::new(&normalized);
    if parsed
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(ExplorerError::PathTraversal);
    }

    Ok(normalized)
}

fn join_remote_path(base: &str, name: &str) -> String {
    if base == "." || base.is_empty() {
        name.to_string()
    } else if base == "/" {
        format!("/{name}")
    } else {
        format!("{}/{}", base.trim_end_matches('/'), name)
    }
}

fn remote_parent_path(path: &str) -> String {
    let normalized = normalize_remote_path(path);
    let as_path = PathBuf::from(normalized);
    as_path
        .parent()
        .map(|parent| {
            if parent.as_os_str().is_empty() {
                ".".to_string()
            } else {
                parent.to_string_lossy().replace('\\', "/")
            }
        })
        .unwrap_or_else(|| ".".to_string())
}

fn sort_nodes(entries: &mut [FileNode]) {
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });
}

struct ActiveConnection<T> {
    profile_id: String,
    connection: T,
}

enum ConnectionLiveness {
    Open,
    Closed { profile_id: String },
    NotFound,
}

struct SshManager<C: SshConnector> {
    connector: C,
    active_connections: HashMap<String, ActiveConnection<C::Connection>>,
    remote_sessions: HashMap<String, RemoteSession>,
}

impl<C: SshConnector> SshManager<C> {
    fn new(connector: C) -> Self {
        Self {
            connector,
            active_connections: HashMap::new(),
            remote_sessions: HashMap::new(),
        }
    }

    async fn connect(&mut self, request: SshConnectRequest) -> Result<SshConnectionStatus, String> {
        let profile_id = request.profile.id.clone();
        let connection = self.connector.connect(&request).await?;
        let connection_id = format!("connection-{}", Uuid::new_v4());

        self.active_connections.insert(
            connection_id.clone(),
            ActiveConnection {
                profile_id: profile_id.clone(),
                connection,
            },
        );

        Ok(SshConnectionStatus {
            connection_id,
            profile_id,
        })
    }

    async fn disconnect(&mut self, connection_id: &str) -> Result<(), String> {
        if let Some(remote) = self.remote_sessions.remove(connection_id) {
            let _ = remote.client.close().await;
        }

        let Some(active) = self.active_connections.remove(connection_id) else {
            return Ok(());
        };

        self.connector.disconnect(active.connection).await
    }

    async fn close_all(&mut self) {
        let remote_sessions = std::mem::take(&mut self.remote_sessions)
            .into_values()
            .collect::<Vec<_>>();
        for remote in remote_sessions {
            let _ = remote.client.close().await;
        }

        let active_connections = std::mem::take(&mut self.active_connections)
            .into_values()
            .map(|active| active.connection)
            .collect::<Vec<_>>();

        for connection in active_connections {
            let _ = self.connector.disconnect(connection).await;
        }
    }

    fn connection_profile_id(&self, connection_id: &str) -> Option<String> {
        self.active_connections
            .get(connection_id)
            .map(|active| active.profile_id.clone())
    }

    fn prune_if_closed(&mut self, connection_id: &str) -> ConnectionLiveness {
        let Some(active) = self.active_connections.get(connection_id) else {
            return ConnectionLiveness::NotFound;
        };

        if !self.connector.is_closed(&active.connection) {
            return ConnectionLiveness::Open;
        }

        let profile_id = active.profile_id.clone();
        self.active_connections.remove(connection_id);
        ConnectionLiveness::Closed { profile_id }
    }

    async fn test_connection(&self, request: SshConnectRequest) -> Result<bool, String> {
        let connection = self.connector.connect(&request).await?;
        self.connector.disconnect(connection).await?;
        Ok(true)
    }
}

impl SshManager<RusshConnector> {
    async fn open_sftp(&mut self, connection_id: &str) -> Result<(), String> {
        if self.remote_sessions.contains_key(connection_id) {
            return Ok(());
        }

        let connection = self
            .active_connections
            .get(connection_id)
            .ok_or_else(|| format!("unknown connection id: {connection_id}"))?;

        let channel = connection
            .connection
            .channel_open_session()
            .await
            .map_err(|e| format!("failed to open ssh session channel: {e}"))?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| format!("failed to request sftp subsystem: {e}"))?;

        let session = SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| format!("failed to initialize sftp session: {e}"))?;

        self.remote_sessions.insert(
            connection_id.to_string(),
            RemoteSession {
                client: Arc::new(RusshSftpClient::new(session)),
                dir_cache: Arc::new(Mutex::new(HashMap::new())),
            },
        );

        Ok(())
    }

    async fn close_sftp(&mut self, connection_id: &str) -> Result<(), String> {
        let Some(remote) = self.remote_sessions.remove(connection_id) else {
            return Ok(());
        };

        remote.client.close().await
    }

    fn remote_fs(&self, connection_id: &str, show_hidden: bool) -> Result<RemoteFileSystem, String> {
        let remote = self
            .remote_sessions
            .get(connection_id)
            .ok_or_else(|| format!("sftp session is not open for connection: {connection_id}"))?;

        Ok(RemoteFileSystem::new(
            connection_id.to_string(),
            remote.client.clone(),
            remote.dir_cache.clone(),
            show_hidden,
        ))
    }

    async fn list_remote_directory(
        &mut self,
        connection_id: &str,
        path: &str,
        show_hidden: bool,
    ) -> Result<Vec<FileNode>, String> {
        self.open_sftp(connection_id).await?;
        self.remote_fs(connection_id, show_hidden)?
            .list_dir_async(path)
            .await
            .map_err(|e| e.to_string())
    }

    async fn open_remote_file(
        &mut self,
        connection_id: &str,
        path: &str,
    ) -> Result<FileMetadata, String> {
        self.open_sftp(connection_id).await?;
        self.remote_fs(connection_id, true)?
            .stat_async(path)
            .await
            .map_err(|e| e.to_string())
    }

    async fn read_remote_file(&mut self, connection_id: &str, path: &str) -> Result<Vec<u8>, String> {
        self.open_sftp(connection_id).await?;
        self.remote_fs(connection_id, true)?
            .read_file_async(path)
            .await
            .map_err(|e| e.to_string())
    }

    async fn write_remote_file(
        &mut self,
        connection_id: &str,
        path: &str,
        content: &[u8],
    ) -> Result<(), String> {
        self.open_sftp(connection_id).await?;
        self.remote_fs(connection_id, true)?
            .write_file_async(path, content)
            .await
            .map_err(|e| e.to_string())
    }
}

pub struct SshState {
    manager: Arc<Mutex<SshManager<RusshConnector>>>,
    store: ConnectionStore,
    pending: Arc<PendingVerifications>,
}

impl SshState {
    pub fn new(app_handle: AppHandle) -> Self {
        let store = ConnectionStore::new().unwrap_or_else(|_| {
            let fallback_root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
            ConnectionStore::with_path(fallback_root.join("forge").join("ssh-connections.json"))
        });

        let known_hosts = KnownHostsStore::new().unwrap_or_else(|_| {
            let fallback_root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
            KnownHostsStore::with_path(fallback_root.join("forge").join("known_hosts.json"))
        });

        let pending = Arc::new(Mutex::new(HashMap::new()));

        let connector = RusshConnector {
            known_hosts: known_hosts.clone(),
            app_handle,
            pending: pending.clone(),
        };

        Self {
            manager: Arc::new(Mutex::new(SshManager::new(connector))),
            store,
            pending,
        }
    }
}

impl SshState {
    pub async fn close_all_connections(&self) {
        let mut manager = self.manager.lock().await;
        manager.close_all().await;
    }
}

fn emit_lifecycle_event(app_handle: &AppHandle, payload: SshConnectionLifecycleEvent) {
    let _ = app_handle.emit("ssh-connection-lifecycle", payload);
}

fn spawn_connection_monitor(
    app_handle: AppHandle,
    manager: Arc<Mutex<SshManager<RusshConnector>>>,
    connection_id: String,
) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(SSH_MONITOR_POLL_INTERVAL).await;

            let liveness = {
                let mut guard = manager.lock().await;
                guard.prune_if_closed(&connection_id)
            };

            match liveness {
                ConnectionLiveness::Open => {}
                ConnectionLiveness::Closed { profile_id } => {
                    emit_lifecycle_event(
                        &app_handle,
                        SshConnectionLifecycleEvent {
                            connection_id,
                            profile_id,
                            status: "disconnected".to_string(),
                            reason: Some("remote host closed connection".to_string()),
                        },
                    );
                    break;
                }
                ConnectionLiveness::NotFound => break,
            }
        }
    });
}

#[tauri::command]
pub async fn connect_ssh(
    app_handle: AppHandle,
    state: State<'_, SshState>,
    profile: SshConnectionProfile,
    password: Option<String>,
    key_passphrase: Option<String>,
) -> Result<SshConnectionStatus, String> {
    let request = SshConnectRequest {
        profile,
        password,
        key_passphrase,
    };

    let manager = state.manager.clone();
    let status = {
        let mut guard = manager.lock().await;
        guard.connect(request).await?
    };

    emit_lifecycle_event(
        &app_handle,
        SshConnectionLifecycleEvent {
            connection_id: status.connection_id.clone(),
            profile_id: status.profile_id.clone(),
            status: "connected".to_string(),
            reason: None,
        },
    );

    spawn_connection_monitor(app_handle, manager, status.connection_id.clone());
    Ok(status)
}

#[tauri::command]
pub async fn disconnect_ssh(
    app_handle: AppHandle,
    state: State<'_, SshState>,
    connection_id: String,
) -> Result<(), String> {
    let profile_id = {
        let manager = state.manager.lock().await;
        manager.connection_profile_id(&connection_id)
    };

    let mut manager = state.manager.lock().await;
    let result = manager.disconnect(&connection_id).await;

    if let Some(profile_id) = profile_id {
        emit_lifecycle_event(
            &app_handle,
            SshConnectionLifecycleEvent {
                connection_id,
                profile_id,
                status: "disconnected".to_string(),
                reason: None,
            },
        );
    }

    result
}

#[tauri::command]
pub async fn open_remote_sftp(
    state: State<'_, SshState>,
    connection_id: String,
) -> Result<(), String> {
    let mut manager = state.manager.lock().await;
    manager.open_sftp(&connection_id).await
}

#[tauri::command]
pub async fn close_remote_sftp(
    state: State<'_, SshState>,
    connection_id: String,
) -> Result<(), String> {
    let mut manager = state.manager.lock().await;
    manager.close_sftp(&connection_id).await
}

#[tauri::command]
pub async fn list_remote_directory(
    state: State<'_, SshState>,
    connection_id: String,
    path: String,
    show_hidden: bool,
) -> Result<Vec<ExplorerEntry>, String> {
    let mut manager = state.manager.lock().await;
    let nodes = manager
        .list_remote_directory(&connection_id, &path, show_hidden)
        .await?;

    Ok(nodes
        .into_iter()
        .map(|node| ExplorerEntry {
            name: node.name,
            path: node.path.to_string_lossy().into_owned(),
            is_dir: node.is_dir,
            is_hidden: node.is_hidden,
            is_symlink: node.is_symlink,
            permission_denied: node.permission_denied,
        })
        .collect())
}

#[tauri::command]
pub async fn open_remote_file(
    state: State<'_, SshState>,
    connection_id: String,
    path: String,
) -> Result<FileMetadata, String> {
    let mut manager = state.manager.lock().await;
    manager.open_remote_file(&connection_id, &path).await
}

#[tauri::command]
pub async fn read_remote_file(
    state: State<'_, SshState>,
    connection_id: String,
    path: String,
) -> Result<ReadFileResponse, String> {
    let mut manager = state.manager.lock().await;
    let bytes = manager.read_remote_file(&connection_id, &path).await?;
    let is_binary = is_binary_content(&bytes);
    let content = if is_binary {
        String::new()
    } else {
        String::from_utf8_lossy(&bytes).into_owned()
    };

    Ok(ReadFileResponse {
        root: connection_id,
        path,
        content,
        size: bytes.len() as u64,
        is_binary,
        is_read_only: false,
        is_unsupported_encoding: false,
    })
}

#[tauri::command]
pub async fn write_remote_file(
    state: State<'_, SshState>,
    connection_id: String,
    path: String,
    content: String,
) -> Result<(), String> {
    let mut manager = state.manager.lock().await;
    manager
        .write_remote_file(&connection_id, &path, content.as_bytes())
        .await
}

#[tauri::command]
pub async fn test_connection(
    state: State<'_, SshState>,
    profile: SshConnectionProfile,
    password: Option<String>,
    key_passphrase: Option<String>,
) -> Result<bool, String> {
    let request = SshConnectRequest {
        profile,
        password,
        key_passphrase,
    };

    let manager = state.manager.lock().await;
    manager.test_connection(request).await
}

#[tauri::command]
pub fn list_connections(state: State<'_, SshState>) -> Result<Vec<SshConnectionProfile>, String> {
    state.store.list_profiles().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_connection(
    state: State<'_, SshState>,
    profile: SshConnectionProfile,
) -> Result<(), String> {
    state
        .store
        .upsert_profile(profile)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_connection(state: State<'_, SshState>, id: String) -> Result<(), String> {
    state.store.delete_profile(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn verify_host_key_response(
    state: State<'_, SshState>,
    id: String,
    allow: bool,
) -> Result<(), String> {
    let mut map = state.pending.lock().await;
    if let Some(tx) = map.remove(&id) {
        let _ = tx.send(allow);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::explorer::FileSystemProvider;
    use std::sync::Arc;
    use tokio::sync::Mutex as AsyncMutex;

    #[derive(Clone)]
    struct FakeConnector {
        inner: Arc<AsyncMutex<FakeConnectorState>>,
    }

    struct FakeConnectorState {
        should_fail: bool,
        connect_calls: usize,
        disconnect_calls: usize,
        closed: bool,
    }

    impl FakeConnector {
        fn new(should_fail: bool, closed: bool) -> Self {
            Self {
                inner: Arc::new(AsyncMutex::new(FakeConnectorState {
                    should_fail,
                    connect_calls: 0,
                    disconnect_calls: 0,
                    closed,
                })),
            }
        }

        async fn counts(&self) -> (usize, usize) {
            let state = self.inner.lock().await;
            (state.connect_calls, state.disconnect_calls)
        }
    }

    #[async_trait::async_trait]
    impl SshConnector for FakeConnector {
        type Connection = String;

        async fn connect(&self, _request: &SshConnectRequest) -> Result<Self::Connection, String> {
            let mut state = self.inner.lock().await;
            state.connect_calls += 1;
            if state.should_fail {
                return Err("connect failed".to_string());
            }
            Ok(format!("conn-{}", state.connect_calls))
        }

        async fn disconnect(&self, _connection: Self::Connection) -> Result<(), String> {
            let mut state = self.inner.lock().await;
            state.disconnect_calls += 1;
            Ok(())
        }

        fn is_closed(&self, _connection: &Self::Connection) -> bool {
            if let Ok(state) = self.inner.try_lock() {
                state.closed
            } else {
                false
            }
        }
    }

    fn sample_request() -> SshConnectRequest {
        SshConnectRequest {
            profile: SshConnectionProfile {
                id: "profile-1".to_string(),
                name: "Primary".to_string(),
                host: "127.0.0.1".to_string(),
                port: 22,
                username: "forge".to_string(),
                auth_method: SshAuthMethod::Password,
                key_path: None,
                group: None,
                color: None,
            },
            password: Some("pw".to_string()),
            key_passphrase: None,
        }
    }

    #[tokio::test]
    async fn manager_connect_tracks_active_connection() {
        let connector = FakeConnector::new(false, false);
        let mut manager = SshManager::new(connector.clone());

        let status = manager
            .connect(sample_request())
            .await
            .expect("connect should succeed");
        assert!(status.connection_id.starts_with("connection-"));
        assert_eq!(status.profile_id, "profile-1");
        assert_eq!(manager.active_connections.len(), 1);

        let counts = connector.counts().await;
        assert_eq!(counts, (1, 0));
    }

    #[tokio::test]
    async fn manager_disconnect_removes_connection_and_calls_connector() {
        let connector = FakeConnector::new(false, false);
        let mut manager = SshManager::new(connector.clone());

        let status = manager
            .connect(sample_request())
            .await
            .expect("connect should succeed");

        manager
            .disconnect(&status.connection_id)
            .await
            .expect("disconnect should succeed");
        assert!(manager.active_connections.is_empty());

        let counts = connector.counts().await;
        assert_eq!(counts, (1, 1));
    }

    #[tokio::test]
    async fn manager_test_connection_connects_then_disconnects_without_tracking() {
        let connector = FakeConnector::new(false, false);
        let manager = SshManager::new(connector.clone());

        let ok = manager
            .test_connection(sample_request())
            .await
            .expect("test connection should succeed");
        assert!(ok);
        assert!(manager.active_connections.is_empty());

        let counts = connector.counts().await;
        assert_eq!(counts, (1, 1));
    }

    #[tokio::test]
    async fn manager_connect_propagates_connection_error() {
        let connector = FakeConnector::new(true, false);
        let mut manager = SshManager::new(connector.clone());

        let error = manager
            .connect(sample_request())
            .await
            .expect_err("connect should fail");
        assert_eq!(error, "connect failed");
        assert!(manager.active_connections.is_empty());

        let counts = connector.counts().await;
        assert_eq!(counts, (1, 0));
    }

    #[tokio::test]
    async fn manager_prune_if_closed_removes_disconnected_connection() {
        let connector = FakeConnector::new(false, true);
        let mut manager = SshManager::new(connector);

        let status = manager
            .connect(sample_request())
            .await
            .expect("connect should succeed");

        let liveness = manager.prune_if_closed(&status.connection_id);
        assert!(matches!(
            liveness,
            ConnectionLiveness::Closed { ref profile_id } if profile_id == "profile-1"
        ));
        assert!(manager.active_connections.is_empty());
    }

    #[tokio::test]
    async fn manager_close_all_disconnects_everything() {
        let connector = FakeConnector::new(false, false);
        let mut manager = SshManager::new(connector.clone());

        let _ = manager.connect(sample_request()).await.expect("connect works");
        let _ = manager.connect(sample_request()).await.expect("connect works");

        manager.close_all().await;
        assert!(manager.active_connections.is_empty());

        let counts = connector.counts().await;
        assert_eq!(counts, (2, 2));
    }

    #[derive(Clone, Default)]
    struct FakeSftpClient {
        inner: Arc<AsyncMutex<FakeSftpState>>,
    }

    #[derive(Default)]
    struct FakeSftpState {
        list_calls: usize,
        read_calls: usize,
        write_calls: usize,
        stat_calls: usize,
        fail: bool,
        files: HashMap<String, Vec<u8>>,
        listing: Vec<FileNode>,
    }

    impl FakeSftpClient {
        fn with_listing(listing: Vec<FileNode>) -> Self {
            Self {
                inner: Arc::new(AsyncMutex::new(FakeSftpState {
                    listing,
                    ..Default::default()
                })),
            }
        }

        async fn set_fail(&self, fail: bool) {
            let mut state = self.inner.lock().await;
            state.fail = fail;
        }

        async fn list_calls(&self) -> usize {
            self.inner.lock().await.list_calls
        }

        async fn write_calls(&self) -> usize {
            self.inner.lock().await.write_calls
        }

        async fn read_calls(&self) -> usize {
            self.inner.lock().await.read_calls
        }

        async fn stat_calls(&self) -> usize {
            self.inner.lock().await.stat_calls
        }
    }

    #[async_trait::async_trait]
    impl SftpClient for FakeSftpClient {
        async fn list_dir(&self, _path: &str) -> Result<Vec<FileNode>, String> {
            let mut state = self.inner.lock().await;
            state.list_calls += 1;
            if state.fail {
                return Err("disconnected".to_string());
            }

            Ok(state.listing.clone())
        }

        async fn read_file(&self, path: &str) -> Result<Vec<u8>, String> {
            let mut state = self.inner.lock().await;
            state.read_calls += 1;
            if state.fail {
                return Err("disconnected".to_string());
            }

            state
                .files
                .get(path)
                .cloned()
                .ok_or_else(|| "missing file".to_string())
        }

        async fn write_file(&self, path: &str, content: &[u8]) -> Result<(), String> {
            let mut state = self.inner.lock().await;
            state.write_calls += 1;
            if state.fail {
                return Err("disconnected".to_string());
            }

            state.files.insert(path.to_string(), content.to_vec());
            Ok(())
        }

        async fn stat(&self, path: &str) -> Result<FileMetadata, String> {
            let mut state = self.inner.lock().await;
            state.stat_calls += 1;
            if state.fail {
                return Err("disconnected".to_string());
            }

            let content = state
                .files
                .get(path)
                .ok_or_else(|| "missing file".to_string())?;

            Ok(FileMetadata {
                path: PathBuf::from(path),
                is_dir: false,
                is_file: true,
                len: content.len() as u64,
                is_read_only: false,
                is_symlink: false,
            })
        }

        async fn close(&self) -> Result<(), String> {
            Ok(())
        }
    }

    #[test]
    fn remote_filesystem_implements_provider_contract() {
        let client = Arc::new(FakeSftpClient::with_listing(vec![
            FileNode {
                name: "src".to_string(),
                path: PathBuf::from("/remote/src"),
                is_dir: true,
                is_hidden: false,
                is_symlink: false,
                permission_denied: false,
            },
            FileNode {
                name: ".hidden".to_string(),
                path: PathBuf::from("/remote/.hidden"),
                is_dir: false,
                is_hidden: true,
                is_symlink: false,
                permission_denied: false,
            },
            FileNode {
                name: "README.md".to_string(),
                path: PathBuf::from("/remote/README.md"),
                is_dir: false,
                is_hidden: false,
                is_symlink: false,
                permission_denied: false,
            },
        ]));
        let cache = Arc::new(Mutex::new(HashMap::new()));
        let fs = RemoteFileSystem::new("connection-1".to_string(), client, cache, false);

        let provider: &dyn FileSystemProvider = &fs;
        let nodes = provider.list_dir("/remote").expect("list should work");
        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[0].name, "src");
        assert_eq!(nodes[1].name, "README.md");
    }

    #[tokio::test]
    async fn remote_list_dir_uses_ttl_cache() {
        let client = Arc::new(FakeSftpClient::with_listing(vec![FileNode {
            name: "src".to_string(),
            path: PathBuf::from("/remote/src"),
            is_dir: true,
            is_hidden: false,
            is_symlink: false,
            permission_denied: false,
        }]));
        let cache = Arc::new(Mutex::new(HashMap::new()));
        let fs = RemoteFileSystem::with_ttl(
            "connection-1".to_string(),
            client.clone(),
            cache,
            true,
            Duration::from_millis(40),
        );

        fs.list_dir_async("/remote")
            .await
            .expect("first list should work");
        fs.list_dir_async("/remote")
            .await
            .expect("second list should use cache");
        assert_eq!(client.list_calls().await, 1);

        tokio::time::sleep(Duration::from_millis(60)).await;
        fs.list_dir_async("/remote")
            .await
            .expect("third list should refresh cache");
        assert_eq!(client.list_calls().await, 2);
    }

    #[tokio::test]
    async fn remote_read_surfaces_disconnect_error_and_write_invalidates_parent_cache() {
        let client = Arc::new(FakeSftpClient::default());
        let cache = Arc::new(Mutex::new(HashMap::new()));
        let fs = RemoteFileSystem::new("connection-1".to_string(), client.clone(), cache.clone(), true);

        {
            let mut guard = cache.lock().await;
            guard.insert(
                "/remote".to_string(),
                CachedRemoteDirectory {
                    entries: vec![],
                    cached_at: Instant::now(),
                },
            );
        }

        fs.write_file_async("/remote/file.txt", b"hello")
            .await
            .expect("write should work");
        assert_eq!(client.write_calls().await, 1);
        assert!(!cache.lock().await.contains_key("/remote"));

        client.set_fail(true).await;
        let error = fs
            .read_file_async("/remote/file.txt")
            .await
            .expect_err("read should fail");
        assert!(error.to_string().contains("connection-1"));
    }

    #[tokio::test]
    async fn remote_path_validation_rejects_parent_traversal_for_all_operations() {
        let client = Arc::new(FakeSftpClient::default());
        let cache = Arc::new(Mutex::new(HashMap::new()));
        let fs = RemoteFileSystem::new("connection-1".to_string(), client.clone(), cache, true);

        let list_err = fs
            .list_dir_async("../escape")
            .await
            .expect_err("list should reject traversal");
        assert!(matches!(list_err, ExplorerError::PathTraversal));

        let read_err = fs
            .read_file_async("safe/../secret.txt")
            .await
            .expect_err("read should reject traversal");
        assert!(matches!(read_err, ExplorerError::PathTraversal));

        let write_err = fs
            .write_file_async("../../overwrite.txt", b"x")
            .await
            .expect_err("write should reject traversal");
        assert!(matches!(write_err, ExplorerError::PathTraversal));

        let stat_err = fs
            .stat_async("../stat.txt")
            .await
            .expect_err("stat should reject traversal");
        assert!(matches!(stat_err, ExplorerError::PathTraversal));

        assert_eq!(client.list_calls().await, 0);
        assert_eq!(client.read_calls().await, 0);
        assert_eq!(client.write_calls().await, 0);
        assert_eq!(client.stat_calls().await, 0);
    }

    #[tokio::test]
    async fn pending_verifications_allow_sends_true_through_channel() {
        let pending: Arc<PendingVerifications> = Arc::new(Mutex::new(HashMap::new()));
        let id = "req-1".to_string();

        let (tx, rx) = oneshot::channel::<bool>();
        pending.lock().await.insert(id.clone(), tx);

        {
            let mut map = pending.lock().await;
            if let Some(sender) = map.remove(&id) {
                let _ = sender.send(true);
            }
        }

        let result = rx.await.expect("channel should not be dropped");
        assert!(result, "allow=true should be received");
    }

    #[tokio::test]
    async fn pending_verifications_deny_sends_false_through_channel() {
        let pending: Arc<PendingVerifications> = Arc::new(Mutex::new(HashMap::new()));
        let id = "req-2".to_string();

        let (tx, rx) = oneshot::channel::<bool>();
        pending.lock().await.insert(id.clone(), tx);

        {
            let mut map = pending.lock().await;
            if let Some(sender) = map.remove(&id) {
                let _ = sender.send(false);
            }
        }

        let result = rx.await.expect("channel should not be dropped");
        assert!(!result, "allow=false should be received");
    }

    #[tokio::test]
    async fn pending_verifications_timeout_yields_false() {
        let (_tx, rx) = oneshot::channel::<bool>();

        let result = tokio::time::timeout(std::time::Duration::from_millis(10), rx)
            .await
            .unwrap_or(Ok(false))
            .unwrap_or(false);

        assert!(!result, "timed-out verification should default to deny");
    }

    #[tokio::test]
    async fn pending_verifications_unknown_id_is_noop() {
        let pending: Arc<PendingVerifications> = Arc::new(Mutex::new(HashMap::new()));

        let mut map = pending.lock().await;
        let removed = map.remove("nonexistent-id");
        assert!(removed.is_none(), "removing unknown id should return None");
    }

    #[tokio::test]
    async fn known_hosts_store_roundtrip_in_temp_dir() {
        use std::time::{SystemTime, UNIX_EPOCH};
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time should be after epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("forge-known-hosts-test-{unique}"));
        std::fs::create_dir_all(&dir).expect("temp dir should be created");
        let store = KnownHostsStore::with_path(dir.join("known_hosts.json"));

        assert!(store.get_fingerprint("host:22").unwrap().is_none());

        store.save_fingerprint("host:22", "SHA256:abc123").unwrap();
        let fp = store.get_fingerprint("host:22").unwrap();
        assert_eq!(fp.as_deref(), Some("SHA256:abc123"));

        store.save_fingerprint("host:22", "SHA256:newkey").unwrap();
        let updated = store.get_fingerprint("host:22").unwrap();
        assert_eq!(updated.as_deref(), Some("SHA256:newkey"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
