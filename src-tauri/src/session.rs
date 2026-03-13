use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use uuid::Uuid;

use crate::shell::resolve_shell_path;
use crate::types::{
    SessionConfig, SessionExitEvent, SessionId, SessionInfo, SessionOutputEvent, ShellType,
};

type OutputCallback = Arc<dyn Fn(SessionOutputEvent) + Send + Sync + 'static>;
type ExitCallback = Arc<dyn Fn(SessionExitEvent) + Send + Sync + 'static>;

pub struct PtySession {
    pub master: Box<dyn MasterPty + Send>,
    pub child: Box<dyn Child + Send + Sync>,
    pub writer: Box<dyn Write + Send>,
    pub shell: ShellType,
    pub pid: u32,
}

pub struct SessionManager {
    sessions: HashMap<SessionId, PtySession>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    pub fn create_session(
        &mut self,
        config: SessionConfig,
        output_callback: Option<OutputCallback>,
        exit_callback: Option<ExitCallback>,
    ) -> Result<SessionId, String> {
        self.reap_exited_sessions();

        let SessionConfig { shell, cwd, env } = config;
        let shell_path = resolve_shell_path(&shell)?;
        let pty_system = native_pty_system();
        let pty_pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("failed to open PTY: {e}"))?;

        let mut command = CommandBuilder::new(shell_path);
        let integration_dir = shell_integration_dir();
        command.env(
            "FORGE_SHELL_INTEGRATION_DIR",
            integration_dir.to_string_lossy().to_string(),
        );

        let launch_config = shell_integration_launch_config(&shell, &integration_dir);
        for (key, value) in launch_config.env {
            command.env(key, value);
        }
        for arg in launch_config.args {
            command.arg(arg);
        }

        if let Some(cwd) = cwd {
            command.cwd(cwd);
        }
        if let Some(env) = env {
            for (key, value) in env {
                command.env(key, value);
            }
        }

        let child = pty_pair
            .slave
            .spawn_command(command)
            .map_err(|e| format!("failed to spawn shell process: {e}"))?;
        let pid = child.process_id().unwrap_or(0);

        let mut reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("failed to clone PTY reader: {e}"))?;
        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| format!("failed to take PTY writer: {e}"))?;

        let session_id = SessionId(Uuid::new_v4().to_string());
        let session_id_for_thread = session_id.clone();

        thread::spawn(move || {
            let mut buffer = [0_u8; 8192];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => {
                        if let Some(exit_cb) = &exit_callback {
                            exit_cb(SessionExitEvent {
                                session_id: session_id_for_thread.0.clone(),
                                exit_code: None,
                            });
                        }
                        break;
                    }
                    Ok(n) => {
                        if let Some(output_cb) = &output_callback {
                            output_cb(SessionOutputEvent {
                                session_id: session_id_for_thread.0.clone(),
                                data: buffer[..n].to_vec(),
                            });
                        }
                    }
                    Err(_) => {
                        if let Some(exit_cb) = &exit_callback {
                            exit_cb(SessionExitEvent {
                                session_id: session_id_for_thread.0.clone(),
                                exit_code: None,
                            });
                        }
                        break;
                    }
                }
            }
        });

        self.sessions.insert(
            session_id.clone(),
            PtySession {
                master: pty_pair.master,
                child,
                writer,
                shell,
                pid,
            },
        );

        Ok(session_id)
    }

    pub fn write_to_session(&mut self, session_id: &SessionId, data: &[u8]) -> Result<(), String> {
        self.reap_exited_sessions();

        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("session not found: {}", session_id.0))?;

        session
            .writer
            .write_all(data)
            .map_err(|e| format!("failed to write to session {}: {e}", session_id.0))?;
        session
            .writer
            .flush()
            .map_err(|e| format!("failed to flush session {}: {e}", session_id.0))
    }

    pub fn resize_session(
        &mut self,
        session_id: &SessionId,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        self.reap_exited_sessions();

        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("session not found: {}", session_id.0))?;

        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("failed to resize session {}: {e}", session_id.0))
    }

    pub fn close_session(&mut self, session_id: &SessionId) -> Result<(), String> {
        self.reap_exited_sessions();

        let Some(mut session) = self.sessions.remove(session_id) else {
            return Ok(());
        };

        drop(session.writer);

        if self
            .wait_for_exit(&mut *session.child, Duration::from_secs(2))
            .is_some()
        {
            return Ok(());
        }

        #[cfg(unix)]
        {
            if session.pid > 0 {
                unsafe {
                    libc::kill(session.pid as i32, libc::SIGTERM);
                }
                if self
                    .wait_for_exit(&mut *session.child, Duration::from_secs(2))
                    .is_some()
                {
                    return Ok(());
                }
            }
        }

        session
            .child
            .kill()
            .map_err(|e| format!("failed to kill session {}: {e}", session_id.0))?;
        let _ = self.wait_for_exit(&mut *session.child, Duration::from_secs(2));

        Ok(())
    }

    pub fn close_all_sessions(&mut self) {
        self.reap_exited_sessions();
        let session_ids: Vec<SessionId> = self.sessions.keys().cloned().collect();
        for session_id in session_ids {
            let _ = self.close_session(&session_id);
        }
    }

    pub fn get_session_info(&mut self, session_id: &SessionId) -> Option<SessionInfo> {
        self.reap_exited_sessions();
        self.sessions.get(session_id).map(|session| SessionInfo {
            id: session_id.clone(),
            shell: session.shell.clone(),
            pid: session.pid,
            alive: true,
        })
    }

    pub fn has_running_processes(&mut self) -> bool {
        self.reap_exited_sessions();
        !self.sessions.is_empty()
    }

    pub fn session_count(&self) -> usize {
        self.sessions.len()
    }

    fn reap_exited_sessions(&mut self) {
        let exited_ids: Vec<SessionId> = self
            .sessions
            .iter_mut()
            .filter_map(|(session_id, session)| match session.child.try_wait() {
                Ok(Some(_)) => Some(session_id.clone()),
                Ok(None) => None,
                Err(_) => Some(session_id.clone()),
            })
            .collect();

        for session_id in exited_ids {
            self.sessions.remove(&session_id);
        }
    }

    fn wait_for_exit(
        &self,
        child: &mut (dyn Child + Send + Sync),
        timeout: Duration,
    ) -> Option<i32> {
        let deadline = Instant::now() + timeout;

        loop {
            match child.try_wait() {
                Ok(Some(status)) => return Some(status.exit_code() as i32),
                Ok(None) => {
                    if Instant::now() >= deadline {
                        return None;
                    }
                    thread::sleep(Duration::from_millis(25));
                }
                Err(_) => return None,
            }
        }
    }
}

fn shell_integration_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("shell-integration")
}

struct ShellLaunchConfig {
    args: Vec<String>,
    env: Vec<(String, String)>,
}

fn shell_integration_launch_config(shell: &ShellType, integration_dir: &Path) -> ShellLaunchConfig {
    match shell {
        ShellType::Bash => {
            let integration_path = integration_dir.join("bash-integration.sh");
            let rcfile_path = integration_dir.join("bashrc");
            ShellLaunchConfig {
                args: vec![
                    "--rcfile".to_string(),
                    rcfile_path.to_string_lossy().to_string(),
                    "-i".to_string(),
                ],
                env: vec![(
                    "FORGE_SHELL_INTEGRATION_PATH".to_string(),
                    integration_path.to_string_lossy().to_string(),
                )],
            }
        }
        ShellType::Zsh => {
            let integration_path = integration_dir.join("zsh-integration.zsh");
            ShellLaunchConfig {
                args: vec!["-i".to_string()],
                env: vec![
                    (
                        "FORGE_SHELL_INTEGRATION_PATH".to_string(),
                        integration_path.to_string_lossy().to_string(),
                    ),
                    (
                        "ZDOTDIR".to_string(),
                        integration_dir.to_string_lossy().to_string(),
                    ),
                ],
            }
        }
        _ => ShellLaunchConfig {
            args: vec![],
            env: vec![],
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shell::list_available_shells;
    use std::path::PathBuf;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    fn test_shell() -> ShellType {
        list_available_shells()
            .into_iter()
            .next()
            .expect("at least one shell must be available for tests")
            .shell_type
    }

    fn test_config() -> SessionConfig {
        SessionConfig {
            shell: test_shell(),
            cwd: None,
            env: None,
        }
    }

    #[test]
    fn test_create_session() {
        let mut manager = SessionManager::new();
        let session_id = manager
            .create_session(test_config(), None, None)
            .expect("session should be created");

        let info = manager
            .get_session_info(&session_id)
            .expect("session info should exist");
        assert_eq!(info.id, session_id);
        assert!(info.pid > 0, "pid should be non-zero");

        manager
            .close_session(&session_id)
            .expect("session should close cleanly");
    }

    #[test]
    fn test_create_and_write() {
        let mut manager = SessionManager::new();
        let (tx, rx) = mpsc::channel::<SessionOutputEvent>();
        let output_cb: OutputCallback = Arc::new(move |event| {
            let _ = tx.send(event);
        });

        let session_id = manager
            .create_session(test_config(), Some(output_cb), None)
            .expect("session should be created");

        manager
            .write_to_session(&session_id, b"echo forge-session-test\r")
            .expect("write should succeed");

        let deadline = Instant::now() + Duration::from_secs(5);
        let mut output = String::new();
        while Instant::now() < deadline {
            if let Ok(event) = rx.recv_timeout(Duration::from_millis(200)) {
                output.push_str(&String::from_utf8_lossy(&event.data));
                if output.contains("forge-session-test") {
                    break;
                }
            }
        }

        assert!(
            output.contains("forge-session-test"),
            "expected shell output to include written echo marker"
        );

        manager
            .close_session(&session_id)
            .expect("session should close cleanly");
    }

    #[test]
    fn test_resize_session() {
        let mut manager = SessionManager::new();
        let session_id = manager
            .create_session(test_config(), None, None)
            .expect("session should be created");

        manager
            .resize_session(&session_id, 120, 40)
            .expect("resize should succeed");

        manager
            .close_session(&session_id)
            .expect("session should close cleanly");
    }

    #[test]
    fn test_close_session() {
        let mut manager = SessionManager::new();
        let session_id = manager
            .create_session(test_config(), None, None)
            .expect("session should be created");

        manager
            .close_session(&session_id)
            .expect("session should close cleanly");
        assert!(manager.get_session_info(&session_id).is_none());
    }

    #[test]
    fn test_close_session_invalid_id() {
        let mut manager = SessionManager::new();
        let result = manager.close_session(&SessionId("does-not-exist".to_string()));
        assert!(
            result.is_ok(),
            "closing invalid session id should be idempotent"
        );
    }

    #[test]
    fn test_write_to_closed_session_returns_error() {
        let mut manager = SessionManager::new();
        let session_id = manager
            .create_session(test_config(), None, None)
            .expect("session should be created");

        manager
            .close_session(&session_id)
            .expect("session should close cleanly");

        let result = manager.write_to_session(&session_id, b"echo should-fail\r");
        assert!(result.is_err(), "write to closed session must fail");
    }

    #[test]
    fn test_duplicate_close_is_idempotent() {
        let mut manager = SessionManager::new();
        let session_id = manager
            .create_session(test_config(), None, None)
            .expect("session should be created");

        manager
            .close_session(&session_id)
            .expect("first close should succeed");
        manager
            .close_session(&session_id)
            .expect("second close should be a no-op and succeed");
    }

    #[test]
    fn test_shell_exit_emits_event_and_is_cleaned_up() {
        let mut manager = SessionManager::new();
        let (exit_tx, exit_rx) = mpsc::channel::<SessionExitEvent>();
        let exit_cb: ExitCallback = Arc::new(move |event| {
            let _ = exit_tx.send(event);
        });

        let session_id = manager
            .create_session(test_config(), None, Some(exit_cb))
            .expect("session should be created");

        manager
            .write_to_session(&session_id, b"exit\r")
            .expect("write exit command should succeed");

        let event = exit_rx
            .recv_timeout(Duration::from_secs(5))
            .expect("session-exit should be emitted after natural shell exit");
        assert_eq!(event.session_id, session_id.0);

        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline && manager.has_running_processes() {
            thread::sleep(Duration::from_millis(25));
        }
        assert!(
            !manager.has_running_processes(),
            "exited session should be cleaned up"
        );

        let write_after_exit = manager.write_to_session(&session_id, b"echo after-exit\r");
        assert!(
            write_after_exit.is_err(),
            "writes after natural shell exit must fail"
        );
    }

    #[test]
    fn test_rapid_create_close_sessions() {
        let mut manager = SessionManager::new();

        for _ in 0..20 {
            let session_id = manager
                .create_session(test_config(), None, None)
                .expect("session should be created");
            manager
                .close_session(&session_id)
                .expect("session should close cleanly");
        }

        assert!(!manager.has_running_processes());
    }

    #[test]
    fn test_resize_during_active_output_no_crash() {
        let mut manager = SessionManager::new();
        let session_id = manager
            .create_session(test_config(), None, None)
            .expect("session should be created");

        manager
            .write_to_session(&session_id, b"yes forge | head -n 1000\r")
            .expect("write should succeed");

        for (cols, rows) in [(100, 30), (120, 40), (80, 24), (140, 50)] {
            manager
                .resize_session(&session_id, cols, rows)
                .expect("resize should succeed while output is active");
        }

        manager
            .close_session(&session_id)
            .expect("session should close cleanly");
    }

    #[test]
    fn test_close_all_sessions_cleans_up_all_processes() {
        let mut manager = SessionManager::new();

        for _ in 0..3 {
            manager
                .create_session(test_config(), None, None)
                .expect("session should be created");
        }

        assert!(manager.has_running_processes());
        manager.close_all_sessions();
        assert!(!manager.has_running_processes());
    }

    #[test]
    fn test_multiple_sessions_have_unique_ids_and_pids() {
        let mut manager = SessionManager::new();
        let first = manager
            .create_session(test_config(), None, None)
            .expect("first session should be created");
        let second = manager
            .create_session(test_config(), None, None)
            .expect("second session should be created");

        let first_info = manager
            .get_session_info(&first)
            .expect("first session info should exist");
        let second_info = manager
            .get_session_info(&second)
            .expect("second session info should exist");

        assert_ne!(first.0, second.0, "session ids must be unique");
        assert_ne!(
            first_info.pid, second_info.pid,
            "session pids must be unique"
        );

        manager
            .close_session(&first)
            .expect("first session should close cleanly");
        manager
            .close_session(&second)
            .expect("second session should close cleanly");
    }

    #[test]
    fn test_list_available_shells_has_at_least_one_entry() {
        let shells = list_available_shells();
        assert!(
            !shells.is_empty(),
            "at least one shell must be available on target system"
        );
    }

    #[test]
    fn test_shell_integration_launch_config_for_bash_uses_rcfile_and_interactive_mode() {
        let integration_dir = PathBuf::from("/tmp/forge-shell-integration");
        let launch = shell_integration_launch_config(&ShellType::Bash, &integration_dir);

        assert_eq!(
            launch.args,
            vec![
                "--rcfile".to_string(),
                "/tmp/forge-shell-integration/bashrc".to_string(),
                "-i".to_string()
            ]
        );
        assert!(launch.env.contains(&(
            "FORGE_SHELL_INTEGRATION_PATH".to_string(),
            "/tmp/forge-shell-integration/bash-integration.sh".to_string()
        )));
    }

    #[test]
    fn test_shell_integration_launch_config_for_zsh_sets_zdotdir_and_interactive_mode() {
        let integration_dir = PathBuf::from("/tmp/forge-shell-integration");
        let launch = shell_integration_launch_config(&ShellType::Zsh, &integration_dir);

        assert_eq!(launch.args, vec!["-i".to_string()]);
        assert!(launch.env.contains(&(
            "FORGE_SHELL_INTEGRATION_PATH".to_string(),
            "/tmp/forge-shell-integration/zsh-integration.zsh".to_string()
        )));
        assert!(launch.env.contains(&(
            "ZDOTDIR".to_string(),
            "/tmp/forge-shell-integration".to_string()
        )));
    }

    #[test]
    fn test_shell_integration_launch_config_other_shells_unchanged() {
        let integration_dir = PathBuf::from("/tmp/forge-shell-integration");
        let launch = shell_integration_launch_config(&ShellType::Fish, &integration_dir);

        assert!(launch.args.is_empty());
        assert!(launch.env.is_empty());
    }
}
