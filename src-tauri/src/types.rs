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
        let deserialized: SessionConfig = serde_json::from_str(&json).expect("Failed to deserialize SessionConfig");
        
        assert_eq!(config.shell, deserialized.shell);
        assert_eq!(config.cwd, deserialized.cwd);
        assert_eq!(config.env, deserialized.env);
    }

    #[test]
    fn test_session_id_roundtrip() {
        let id = SessionId("test-id".to_string());
        let json = serde_json::to_string(&id).expect("Failed to serialize SessionId");
        let deserialized: SessionId = serde_json::from_str(&json).expect("Failed to deserialize SessionId");
        assert_eq!(id, deserialized);
    }

    #[test]
    fn test_shell_type_roundtrip() {
        let shells = vec![ShellType::Bash, ShellType::Zsh, ShellType::Fish, ShellType::PowerShell, ShellType::Cmd];
        
        for shell in shells {
            let json = serde_json::to_string(&shell).expect("Failed to serialize ShellType");
            let deserialized: ShellType = serde_json::from_str(&json).expect("Failed to deserialize ShellType");
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
        let deserialized: ResizePayload = serde_json::from_str(&json).expect("Failed to deserialize ResizePayload");
        
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
        let deserialized: SessionOutputEvent = serde_json::from_str(&json).expect("Failed to deserialize SessionOutputEvent");
        
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
        let deserialized: SessionExitEvent = serde_json::from_str(&json).expect("Failed to deserialize SessionExitEvent");
        
        assert_eq!(event.session_id, deserialized.session_id);
        assert_eq!(event.exit_code, deserialized.exit_code);
    }
}
