use std::sync::Mutex;

use tauri::{AppHandle, Emitter, State};

use crate::explorer::{is_binary_content, FileSystemProvider, LocalFileSystem};
use crate::session::SessionManager;
use crate::shell::ShellInfo;
use crate::types::{
    ExplorerEntry, ReadFileResponse, ResizePayload, SessionConfig, SessionExitEvent, SessionId,
    SessionOutputEvent, ShellType, WriteFileRequest,
};

const MAX_EDITOR_FILE_SIZE_BYTES: u64 = 5 * 1024 * 1024;

pub struct AppState {
    pub session_manager: Mutex<SessionManager>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            session_manager: Mutex::new(SessionManager::new()),
        }
    }
}

#[tauri::command]
pub fn create_session(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    config: SessionConfig,
) -> Result<SessionId, String> {
    let output_handle = app_handle.clone();
    let output_callback = std::sync::Arc::new(move |event: SessionOutputEvent| {
        let _ = output_handle.emit("session-output", event);
    });

    let exit_handle = app_handle.clone();
    let exit_callback = std::sync::Arc::new(move |event: SessionExitEvent| {
        let _ = exit_handle.emit("session-exit", event);
    });

    let mut manager = state
        .session_manager
        .lock()
        .map_err(|_| "session manager lock poisoned".to_string())?;

    manager.create_session(config, Some(output_callback), Some(exit_callback))
}

#[tauri::command]
pub fn write_to_session(
    state: State<'_, AppState>,
    session_id: SessionId,
    data: Vec<u8>,
) -> Result<(), String> {
    let mut manager = state
        .session_manager
        .lock()
        .map_err(|_| "session manager lock poisoned".to_string())?;

    manager.write_to_session(&session_id, &data)
}

#[tauri::command]
pub fn resize_session(state: State<'_, AppState>, payload: ResizePayload) -> Result<(), String> {
    let mut manager = state
        .session_manager
        .lock()
        .map_err(|_| "session manager lock poisoned".to_string())?;

    manager.resize_session(&payload.session_id, payload.cols, payload.rows)
}

#[tauri::command]
pub fn close_session(state: State<'_, AppState>, session_id: SessionId) -> Result<(), String> {
    let mut manager = state
        .session_manager
        .lock()
        .map_err(|_| "session manager lock poisoned".to_string())?;

    manager.close_session(&session_id)
}

#[tauri::command]
pub fn has_running_processes(state: State<'_, AppState>) -> Result<bool, String> {
    let mut manager = state
        .session_manager
        .lock()
        .map_err(|_| "session manager lock poisoned".to_string())?;

    Ok(manager.has_running_processes())
}

#[tauri::command]
pub fn list_available_shells() -> Vec<ShellInfo> {
    crate::shell::list_available_shells()
}

#[tauri::command]
pub fn get_default_shell() -> ShellType {
    crate::shell::get_default_shell()
}

#[tauri::command]
pub fn list_directory(
    root: String,
    path: String,
    show_hidden: bool,
) -> Result<Vec<ExplorerEntry>, String> {
    let provider = LocalFileSystem::new_with_visibility(root.into(), show_hidden)
        .map_err(|e| e.to_string())?;
    list_directory_with_provider(&provider, &path)
}

fn list_directory_with_provider(
    provider: &dyn FileSystemProvider,
    path: &str,
) -> Result<Vec<ExplorerEntry>, String> {
    let nodes = provider.list_dir(path).map_err(|e| e.to_string())?;

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
pub fn read_file(root: String, path: String) -> Result<ReadFileResponse, String> {
    let provider = LocalFileSystem::new(root.clone().into()).map_err(|e| e.to_string())?;
    read_file_with_provider(&provider, &root, &path)
}

fn read_file_with_provider(
    provider: &dyn FileSystemProvider,
    root: &str,
    path: &str,
) -> Result<ReadFileResponse, String> {
    let metadata = provider.stat(path).map_err(|e| e.to_string())?;
    if metadata.len > MAX_EDITOR_FILE_SIZE_BYTES {
        return Err(format_file_too_large_message(metadata.len));
    }

    let content_bytes = provider.read_file(path).map_err(|e| e.to_string())?;
    let is_binary = is_binary_content(&content_bytes);
    let is_unsupported_encoding = !is_binary && std::str::from_utf8(&content_bytes).is_err();
    let content = if is_binary || is_unsupported_encoding {
        String::new()
    } else {
        String::from_utf8_lossy(&content_bytes).into_owned()
    };

    Ok(ReadFileResponse {
        root: root.to_string(),
        path: path.to_string(),
        content,
        size: metadata.len,
        is_binary,
        is_read_only: metadata.is_read_only,
        is_unsupported_encoding,
    })
}

fn format_file_too_large_message(size_bytes: u64) -> String {
    let size_mb = size_bytes as f64 / (1024.0 * 1024.0);
    format!("File too large ({size_mb:.2} MB). Maximum: 5MB.")
}

#[tauri::command]
pub fn write_file(request: WriteFileRequest) -> Result<(), String> {
    let provider = LocalFileSystem::new(request.root.into()).map_err(|e| e.to_string())?;
    write_file_with_provider(&provider, &request.path, request.content.as_bytes())
}

fn write_file_with_provider(
    provider: &dyn FileSystemProvider,
    path: &str,
    content: &[u8],
) -> Result<(), String> {
    provider
        .write_file(path, content)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::explorer::{FileMetadata, FileNode, LocalFileSystem};
    use std::collections::HashMap;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(prefix: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("forge-commands-{prefix}-{unique}"));
            fs::create_dir_all(&path).expect("test dir should be created");
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[derive(Default)]
    struct MemoryProvider {
        files: std::sync::Mutex<HashMap<String, Vec<u8>>>,
        listing: Vec<FileNode>,
        metadata: std::sync::Mutex<HashMap<String, FileMetadata>>,
    }

    impl FileSystemProvider for MemoryProvider {
        fn list_dir(&self, _path: &str) -> Result<Vec<FileNode>, crate::explorer::ExplorerError> {
            Ok(self.listing.clone())
        }

        fn read_file(&self, path: &str) -> Result<Vec<u8>, crate::explorer::ExplorerError> {
            self.files
                .lock()
                .expect("memory provider lock should be available")
                .get(path)
                .cloned()
                .ok_or_else(|| crate::explorer::ExplorerError::Io("missing file".to_string()))
        }

        fn write_file(
            &self,
            path: &str,
            content: &[u8],
        ) -> Result<(), crate::explorer::ExplorerError> {
            self.files
                .lock()
                .expect("memory provider lock should be available")
                .insert(path.to_string(), content.to_vec());
            Ok(())
        }

        fn stat(&self, path: &str) -> Result<FileMetadata, crate::explorer::ExplorerError> {
            let metadata = self
                .metadata
                .lock()
                .expect("memory provider lock should be available");
            metadata
                .get(path)
                .cloned()
                .ok_or_else(|| crate::explorer::ExplorerError::Io("missing file".to_string()))
        }
    }

    #[test]
    fn list_directory_uses_root_path_and_hidden_flag() {
        let root = TestDir::new("list-directory");
        fs::create_dir_all(root.path.join("dir")).expect("dir should be created");
        fs::write(root.path.join("file.txt"), "x").expect("file should exist");
        fs::write(root.path.join(".hidden"), "h").expect("hidden file should exist");

        let listed = list_directory(
            root.path.to_string_lossy().into_owned(),
            ".".to_string(),
            false,
        )
        .expect("list should succeed");
        assert!(listed
            .iter()
            .any(|entry| entry.name == "dir" && entry.is_dir));
        assert!(listed
            .iter()
            .any(|entry| entry.name == "file.txt" && !entry.is_dir));
        assert!(!listed.iter().any(|entry| entry.name == ".hidden"));

        let listed_with_hidden = list_directory(
            root.path.to_string_lossy().into_owned(),
            ".".to_string(),
            true,
        )
        .expect("list should succeed with hidden");
        assert!(listed_with_hidden
            .iter()
            .any(|entry| entry.name == ".hidden"));
    }

    #[test]
    fn read_file_returns_size_binary_flag_and_text_content() {
        let mut content = vec![b'a'; (8 * 1024) + 10];
        content[8 * 1024] = 0;

        let provider = MemoryProvider {
            files: std::sync::Mutex::new(HashMap::from([("sample".to_string(), content)])),
            listing: Vec::new(),
            metadata: std::sync::Mutex::new(HashMap::from([(
                "sample".to_string(),
                FileMetadata {
                    path: PathBuf::from("sample"),
                    is_dir: false,
                    is_file: true,
                    len: (8 * 1024 + 10) as u64,
                    is_read_only: false,
                    is_symlink: false,
                },
            )])),
        };

        let response =
            read_file_with_provider(&provider, "/tmp/root", "sample").expect("read should work");
        assert!(!response.is_binary);
        assert_eq!(response.size, (8 * 1024 + 10) as u64);
        assert_eq!(response.root, "/tmp/root");
        assert_eq!(response.path, "sample");
        assert_eq!(response.content.len(), 8 * 1024 + 10);
        assert!(!response.is_read_only);
        assert!(!response.is_unsupported_encoding);
    }

    #[test]
    fn read_file_reports_binary_non_editor_message_metadata() {
        let provider = MemoryProvider {
            files: std::sync::Mutex::new(HashMap::from([("binary".to_string(), vec![0, 1, 2, 3])])),
            listing: Vec::new(),
            metadata: std::sync::Mutex::new(HashMap::from([(
                "binary".to_string(),
                FileMetadata {
                    path: PathBuf::from("binary"),
                    is_dir: false,
                    is_file: true,
                    len: 4,
                    is_read_only: false,
                    is_symlink: false,
                },
            )])),
        };

        let response =
            read_file_with_provider(&provider, "/tmp/root", "binary").expect("read should work");
        assert!(response.is_binary);
        assert_eq!(response.content, "");
    }

    #[test]
    fn read_file_rejects_files_larger_than_5mb_before_reading() {
        let provider = MemoryProvider {
            files: std::sync::Mutex::new(HashMap::new()),
            listing: Vec::new(),
            metadata: std::sync::Mutex::new(HashMap::from([(
                "huge".to_string(),
                FileMetadata {
                    path: PathBuf::from("huge"),
                    is_dir: false,
                    is_file: true,
                    len: MAX_EDITOR_FILE_SIZE_BYTES + 1024,
                    is_read_only: false,
                    is_symlink: false,
                },
            )])),
        };

        let error = read_file_with_provider(&provider, "/tmp/root", "huge")
            .expect_err("large files should fail");
        assert!(error.starts_with("File too large ("));
        assert!(error.ends_with("Maximum: 5MB."));
    }

    #[test]
    fn read_file_marks_unsupported_utf8_encoding() {
        let provider = MemoryProvider {
            files: std::sync::Mutex::new(HashMap::from([("latin1".to_string(), vec![0xFF, 0xFE])])),
            listing: Vec::new(),
            metadata: std::sync::Mutex::new(HashMap::from([(
                "latin1".to_string(),
                FileMetadata {
                    path: PathBuf::from("latin1"),
                    is_dir: false,
                    is_file: true,
                    len: 2,
                    is_read_only: false,
                    is_symlink: false,
                },
            )])),
        };

        let response =
            read_file_with_provider(&provider, "/tmp/root", "latin1").expect("read should work");
        assert!(!response.is_binary);
        assert!(response.is_unsupported_encoding);
        assert_eq!(response.content, "");
    }

    #[test]
    fn write_file_uses_underlying_provider_and_path_validation() {
        let root = TestDir::new("write-command");
        let local = LocalFileSystem::new(root.path.clone()).expect("local fs should initialize");

        write_file_with_provider(&local, "notes.md", b"hello").expect("write should succeed");
        let saved = fs::read(root.path.join("notes.md")).expect("file should be created");
        assert_eq!(saved, b"hello");

        let escaped = write_file_with_provider(&local, "../escape.md", b"bad");
        assert!(escaped.is_err());
    }

    #[test]
    fn read_file_rejects_path_escape_using_request_root() {
        let root = TestDir::new("read-escape");
        let outside = TestDir::new("read-escape-outside");
        fs::write(outside.path.join("secret.txt"), "secret").expect("secret file should exist");

        let request_root = root.path.to_string_lossy().into_owned();
        let result = read_file(request_root, "../secret.txt".to_string());
        assert!(result.is_err());
    }
}
