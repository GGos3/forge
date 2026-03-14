use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SessionId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ShellType {
    Bash,
    Zsh,
    Fish,
    PowerShell,
    Cmd,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionConfig {
    pub shell: ShellType,
    pub cwd: Option<PathBuf>,
    pub env: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct SessionInfo {
    pub id: SessionId,
    pub shell: ShellType,
    pub pid: u32,
    pub alive: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResizePayload {
    pub session_id: SessionId,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionOutputEvent {
    pub session_id: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionExitEvent {
    pub session_id: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct ListDirectoryRequest {
    pub root: String,
    pub path: String,
    pub show_hidden: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExplorerEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_hidden: bool,
    pub is_symlink: bool,
    pub permission_denied: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct ReadFileRequest {
    pub root: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReadFileResponse {
    pub root: String,
    pub path: String,
    pub content: String,
    pub size: u64,
    pub is_binary: bool,
    pub is_read_only: bool,
    pub is_unsupported_encoding: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WriteFileRequest {
    pub root: String,
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SshAuthMethod {
    Password,
    Key,
    Agent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectionProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: SshAuthMethod,
    pub key_path: Option<String>,
    pub group: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectRequest {
    pub profile: SshConnectionProfile,
    pub password: Option<String>,
    pub key_passphrase: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectionStatus {
    pub connection_id: String,
    pub profile_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectionLifecycleEvent {
    pub connection_id: String,
    pub profile_id: String,
    pub status: String,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_config_roundtrip() {
        let config = SessionConfig {
            shell: ShellType::Bash,
            cwd: Some(PathBuf::from("/home/user")),
            env: Some(HashMap::from([
                ("TERM".to_string(), "xterm-256color".to_string()),
                ("HOME".to_string(), "/home/user".to_string()),
            ])),
        };

        let json = serde_json::to_string(&config).expect("Failed to serialize SessionConfig");
        let deserialized: SessionConfig =
            serde_json::from_str(&json).expect("Failed to deserialize SessionConfig");

        assert_eq!(config.shell, deserialized.shell);
        assert_eq!(config.cwd, deserialized.cwd);
        assert_eq!(config.env, deserialized.env);
    }

    #[test]
    fn test_session_id_roundtrip() {
        let id = SessionId("test-id".to_string());
        let json = serde_json::to_string(&id).expect("Failed to serialize SessionId");
        let deserialized: SessionId =
            serde_json::from_str(&json).expect("Failed to deserialize SessionId");
        assert_eq!(id, deserialized);
    }

    #[test]
    fn test_shell_type_roundtrip() {
        let shells = vec![
            ShellType::Bash,
            ShellType::Zsh,
            ShellType::Fish,
            ShellType::PowerShell,
            ShellType::Cmd,
        ];

        for shell in shells {
            let json = serde_json::to_string(&shell).expect("Failed to serialize ShellType");
            let deserialized: ShellType =
                serde_json::from_str(&json).expect("Failed to deserialize ShellType");
            assert_eq!(shell, deserialized);
        }
    }

    #[test]
    fn test_resize_payload_roundtrip() {
        let payload = ResizePayload {
            session_id: SessionId("test-session".to_string()),
            cols: 80,
            rows: 24,
        };

        let json = serde_json::to_string(&payload).expect("Failed to serialize ResizePayload");
        let deserialized: ResizePayload =
            serde_json::from_str(&json).expect("Failed to deserialize ResizePayload");

        assert_eq!(payload.session_id, deserialized.session_id);
        assert_eq!(payload.cols, deserialized.cols);
        assert_eq!(payload.rows, deserialized.rows);
    }

    #[test]
    fn test_session_output_event_roundtrip() {
        let event = SessionOutputEvent {
            session_id: "test-session".to_string(),
            data: b"Hello, World!".to_vec(),
        };

        let json = serde_json::to_string(&event).expect("Failed to serialize SessionOutputEvent");
        let deserialized: SessionOutputEvent =
            serde_json::from_str(&json).expect("Failed to deserialize SessionOutputEvent");

        assert_eq!(event.session_id, deserialized.session_id);
        assert_eq!(event.data, deserialized.data);
    }

    #[test]
    fn test_session_exit_event_roundtrip() {
        let event = SessionExitEvent {
            session_id: "test-session".to_string(),
            exit_code: Some(0),
        };

        let json = serde_json::to_string(&event).expect("Failed to serialize SessionExitEvent");
        let deserialized: SessionExitEvent =
            serde_json::from_str(&json).expect("Failed to deserialize SessionExitEvent");

        assert_eq!(event.session_id, deserialized.session_id);
        assert_eq!(event.exit_code, deserialized.exit_code);
    }

    #[test]
    fn test_explorer_types_roundtrip() {
        let list_request = ListDirectoryRequest {
            root: "/workspace".to_string(),
            path: ".".to_string(),
            show_hidden: true,
        };
        let entry = ExplorerEntry {
            name: "src".to_string(),
            path: "/workspace/src".to_string(),
            is_dir: true,
            is_hidden: false,
            is_symlink: false,
            permission_denied: false,
        };
        let read_request = ReadFileRequest {
            root: "/workspace".to_string(),
            path: "README.md".to_string(),
        };
        let read_response = ReadFileResponse {
            root: "/workspace".to_string(),
            path: "README.md".to_string(),
            content: "hello".to_string(),
            size: 5,
            is_binary: false,
            is_read_only: false,
            is_unsupported_encoding: false,
        };
        let write_request = WriteFileRequest {
            root: "/workspace".to_string(),
            path: "notes.txt".to_string(),
            content: "updated".to_string(),
        };

        let list_json = serde_json::to_string(&list_request).expect("serialize list request");
        let entry_json = serde_json::to_string(&entry).expect("serialize explorer entry");
        let read_request_json =
            serde_json::to_string(&read_request).expect("serialize read request");
        let read_response_json =
            serde_json::to_string(&read_response).expect("serialize read response");
        let write_request_json =
            serde_json::to_string(&write_request).expect("serialize write request");

        let list_roundtrip: ListDirectoryRequest =
            serde_json::from_str(&list_json).expect("deserialize list request");
        let entry_roundtrip: ExplorerEntry =
            serde_json::from_str(&entry_json).expect("deserialize explorer entry");
        let read_request_roundtrip: ReadFileRequest =
            serde_json::from_str(&read_request_json).expect("deserialize read request");
        let read_response_roundtrip: ReadFileResponse =
            serde_json::from_str(&read_response_json).expect("deserialize read response");
        let write_request_roundtrip: WriteFileRequest =
            serde_json::from_str(&write_request_json).expect("deserialize write request");

        assert_eq!(list_request, list_roundtrip);
        assert_eq!(entry, entry_roundtrip);
        assert_eq!(read_request, read_request_roundtrip);
        assert_eq!(read_response, read_response_roundtrip);
        assert_eq!(write_request, write_request_roundtrip);
    }

    #[test]
    fn test_ssh_types_roundtrip() {
        let profile = SshConnectionProfile {
            id: "profile-1".to_string(),
            name: "Prod".to_string(),
            host: "example.com".to_string(),
            port: 22,
            username: "forge".to_string(),
            auth_method: SshAuthMethod::Key,
            key_path: Some("/home/user/.ssh/id_ed25519".to_string()),
            group: Some("ops".to_string()),
            color: Some("#22c55e".to_string()),
        };

        let connect = SshConnectRequest {
            profile: profile.clone(),
            password: None,
            key_passphrase: Some("secret".to_string()),
        };

        let status = SshConnectionStatus {
            connection_id: "conn-1".to_string(),
            profile_id: profile.id.clone(),
        };

        let lifecycle = SshConnectionLifecycleEvent {
            connection_id: "conn-1".to_string(),
            profile_id: profile.id.clone(),
            status: "disconnected".to_string(),
            reason: Some("remote host closed connection".to_string()),
        };

        let profile_json = serde_json::to_string(&profile).expect("serialize profile");
        let connect_json = serde_json::to_string(&connect).expect("serialize connect request");
        let status_json = serde_json::to_string(&status).expect("serialize status");
        let lifecycle_json = serde_json::to_string(&lifecycle).expect("serialize lifecycle");

        let profile_roundtrip: SshConnectionProfile =
            serde_json::from_str(&profile_json).expect("deserialize profile");
        let connect_roundtrip: SshConnectRequest =
            serde_json::from_str(&connect_json).expect("deserialize connect request");
        let status_roundtrip: SshConnectionStatus =
            serde_json::from_str(&status_json).expect("deserialize status");
        let lifecycle_roundtrip: SshConnectionLifecycleEvent =
            serde_json::from_str(&lifecycle_json).expect("deserialize lifecycle");

        assert_eq!(profile, profile_roundtrip);
        assert_eq!(connect, connect_roundtrip);
        assert_eq!(status, status_roundtrip);
        assert_eq!(lifecycle, lifecycle_roundtrip);
    }
}
