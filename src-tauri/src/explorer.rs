use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use walkdir::WalkDir;

const MAX_PATH_LENGTH: usize = 4096;
const BINARY_DETECTION_SAMPLE_BYTES: usize = 8 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: PathBuf,
    pub is_dir: bool,
    pub is_hidden: bool,
    pub is_symlink: bool,
    pub permission_denied: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileMetadata {
    pub path: PathBuf,
    pub is_dir: bool,
    pub is_file: bool,
    pub len: u64,
    pub is_read_only: bool,
    pub is_symlink: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExplorerError {
    PathTraversal,
    NullByte,
    PathTooLong,
    AbsolutePathNotAllowed,
    RootPathInvalid,
    Io(String),
}

impl std::fmt::Display for ExplorerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PathTraversal => write!(f, "path traversal is not allowed"),
            Self::NullByte => write!(f, "null bytes are not allowed in path"),
            Self::PathTooLong => write!(f, "path exceeds maximum allowed length"),
            Self::AbsolutePathNotAllowed => write!(f, "absolute paths are not allowed"),
            Self::RootPathInvalid => write!(f, "root path is invalid or inaccessible"),
            Self::Io(message) => write!(f, "io error: {message}"),
        }
    }
}

impl std::error::Error for ExplorerError {}

pub trait FileSystemProvider: Send + Sync {
    fn list_dir(&self, path: &str) -> Result<Vec<FileNode>, ExplorerError>;
    fn read_file(&self, path: &str) -> Result<Vec<u8>, ExplorerError>;
    fn write_file(&self, path: &str, content: &[u8]) -> Result<(), ExplorerError>;
    fn stat(&self, path: &str) -> Result<FileMetadata, ExplorerError>;
}

#[derive(Debug, Clone)]
pub struct LocalFileSystem {
    root: PathBuf,
    show_hidden: bool,
}

impl LocalFileSystem {
    pub fn new(root: PathBuf) -> Result<Self, ExplorerError> {
        Self::new_with_visibility(root, false)
    }

    pub fn new_with_visibility(root: PathBuf, show_hidden: bool) -> Result<Self, ExplorerError> {
        let canonical_root = fs::canonicalize(root).map_err(|_| ExplorerError::RootPathInvalid)?;
        Ok(Self {
            root: canonical_root,
            show_hidden,
        })
    }

    fn root_path(&self) -> &Path {
        &self.root
    }

    fn resolve_existing_scoped_path(&self, relative_path: &str) -> Result<PathBuf, ExplorerError> {
        let sanitized_relative = validate_relative_path(relative_path)?;
        let target = self.root.join(sanitized_relative);
        let canonical_target =
            fs::canonicalize(&target).map_err(|e| ExplorerError::Io(e.to_string()))?;

        if !canonical_target.starts_with(self.root_path()) {
            return Err(ExplorerError::PathTraversal);
        }

        Ok(canonical_target)
    }

    fn resolve_writable_scoped_path(&self, relative_path: &str) -> Result<PathBuf, ExplorerError> {
        let sanitized_relative = validate_relative_path(relative_path)?;
        let target = self.root.join(sanitized_relative);
        let parent = target.parent().unwrap_or(self.root_path());
        let canonical_parent =
            fs::canonicalize(parent).map_err(|e| ExplorerError::Io(e.to_string()))?;

        if !canonical_parent.starts_with(self.root_path()) {
            return Err(ExplorerError::PathTraversal);
        }

        Ok(target)
    }
}

impl FileSystemProvider for LocalFileSystem {
    fn list_dir(&self, path: &str) -> Result<Vec<FileNode>, ExplorerError> {
        let scoped_path = self.resolve_existing_scoped_path(path)?;
        if !scoped_path.is_dir() {
            return Err(ExplorerError::Io(
                "target path is not a directory".to_string(),
            ));
        }

        let mut output: Vec<FileNode> = WalkDir::new(&scoped_path)
            .follow_links(false)
            .min_depth(1)
            .max_depth(1)
            .into_iter()
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| {
                let full_path: PathBuf = entry.path().to_path_buf();
                let is_hidden = is_hidden_path(&full_path);
                if !self.show_hidden && is_hidden {
                    return None;
                }

                Some(FileNode {
                    name: entry.file_name().to_string_lossy().into_owned(),
                    path: full_path,
                    is_dir: entry.file_type().is_dir(),
                    is_hidden,
                    is_symlink: entry.path_is_symlink(),
                    permission_denied: entry.file_type().is_dir()
                        && matches!(
                            fs::read_dir(entry.path()),
                            Err(ref error) if error.kind() == std::io::ErrorKind::PermissionDenied
                        ),
                })
            })
            .collect();

        output.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
                .then_with(|| a.name.cmp(&b.name))
        });
        Ok(output)
    }

    fn read_file(&self, path: &str) -> Result<Vec<u8>, ExplorerError> {
        let scoped_path = self.resolve_existing_scoped_path(path)?;
        fs::read(scoped_path).map_err(|e| ExplorerError::Io(e.to_string()))
    }

    fn write_file(&self, path: &str, content: &[u8]) -> Result<(), ExplorerError> {
        let scoped_path = self.resolve_writable_scoped_path(path)?;
        fs::write(scoped_path, content).map_err(|e| ExplorerError::Io(e.to_string()))
    }

    fn stat(&self, path: &str) -> Result<FileMetadata, ExplorerError> {
        let scoped_path = self.resolve_existing_scoped_path(path)?;
        let metadata = fs::metadata(&scoped_path).map_err(|e| ExplorerError::Io(e.to_string()))?;
        let symlink_metadata =
            fs::symlink_metadata(&scoped_path).map_err(|e| ExplorerError::Io(e.to_string()))?;

        Ok(FileMetadata {
            path: scoped_path,
            is_dir: metadata.is_dir(),
            is_file: metadata.is_file(),
            len: metadata.len(),
            is_read_only: metadata.permissions().readonly(),
            is_symlink: symlink_metadata.file_type().is_symlink(),
        })
    }
}

pub fn validate_relative_path(relative_path: &str) -> Result<PathBuf, ExplorerError> {
    if relative_path.len() > MAX_PATH_LENGTH {
        return Err(ExplorerError::PathTooLong);
    }

    if relative_path.contains('\0') {
        return Err(ExplorerError::NullByte);
    }

    let path = Path::new(relative_path);
    if path.is_absolute() {
        return Err(ExplorerError::AbsolutePathNotAllowed);
    }

    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(ExplorerError::PathTraversal);
    }

    Ok(path.to_path_buf())
}

pub fn is_hidden_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with('.'))
        .unwrap_or(false)
}

pub fn is_binary_content(content: &[u8]) -> bool {
    content
        .iter()
        .take(BINARY_DETECTION_SAMPLE_BYTES)
        .any(|byte| *byte == 0)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ActiveProvider {
    Local,
}

#[allow(dead_code)]
pub struct ExplorerState {
    pub current_root_path: Mutex<PathBuf>,
    pub tree_cache: Mutex<HashMap<PathBuf, Vec<FileNode>>>,
    pub active_provider: Mutex<ActiveProvider>,
    pub provider: Arc<dyn FileSystemProvider>,
    pub show_hidden: Mutex<bool>,
}

impl Default for ExplorerState {
    fn default() -> Self {
        let root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"));
        let provider = LocalFileSystem::new(root.clone())
            .expect("current dir must be valid for LocalFileSystem");

        Self {
            current_root_path: Mutex::new(root),
            tree_cache: Mutex::new(HashMap::new()),
            active_provider: Mutex::new(ActiveProvider::Local),
            provider: Arc::new(provider),
            show_hidden: Mutex::new(false),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
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
            let path = std::env::temp_dir().join(format!("forge-{prefix}-{unique}"));
            fs::create_dir_all(&path).expect("test dir should be created");
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn setup_local_fs() -> (TestDir, LocalFileSystem) {
        let root = TestDir::new("explorer-fs");
        fs::create_dir_all(root.path.join("dir")).expect("dir should be created");
        fs::create_dir_all(root.path.join("dir/nested")).expect("nested dir should be created");
        fs::write(root.path.join("dir/nested/deep.txt"), "deep").expect("deep file should exist");
        fs::write(root.path.join("visible.txt"), "visible-content")
            .expect("visible file should be created");
        fs::write(root.path.join(".hidden.txt"), "hidden-content")
            .expect("hidden file should be created");

        let local = LocalFileSystem::new(root.path.clone()).expect("local fs should init");
        (root, local)
    }

    #[test]
    fn filesystem_provider_supports_list_read_write_stat() {
        let (_root, local) = setup_local_fs();
        let provider: &dyn FileSystemProvider = &local;

        let listed = provider.list_dir(".").expect("list_dir should work");
        assert!(listed.iter().any(|node| node.name == "visible.txt"));

        provider
            .write_file("new.txt", b"hello")
            .expect("write_file should work");
        let content = provider
            .read_file("new.txt")
            .expect("read_file should work");
        assert_eq!(content, b"hello");

        let metadata = provider.stat("new.txt").expect("stat should work");
        assert!(metadata.is_file);
        assert_eq!(metadata.len, 5);
        assert!(!metadata.is_read_only);
        assert!(!metadata.is_symlink);
    }

    #[test]
    fn list_dir_uses_hidden_filtering_and_single_level_walk() {
        let (root, _local) = setup_local_fs();

        let without_hidden_local =
            LocalFileSystem::new_with_visibility(root.path.clone(), false).expect("local fs init");
        let with_hidden_local =
            LocalFileSystem::new_with_visibility(root.path.clone(), true).expect("local fs init");

        let without_hidden = without_hidden_local
            .list_dir(".")
            .expect("list without hidden should work");
        assert!(!without_hidden.iter().any(|node| node.name == ".hidden.txt"));
        assert!(!without_hidden.iter().any(|node| node.name == "deep.txt"));

        let with_hidden = with_hidden_local
            .list_dir(".")
            .expect("list with hidden should work");
        assert!(with_hidden.iter().any(|node| node.name == ".hidden.txt"));
    }

    #[test]
    fn validate_relative_path_rejects_path_traversal() {
        assert_eq!(
            validate_relative_path("../etc/passwd"),
            Err(ExplorerError::PathTraversal)
        );
    }

    #[test]
    fn validate_relative_path_rejects_null_bytes() {
        assert_eq!(
            validate_relative_path("bad\0path"),
            Err(ExplorerError::NullByte)
        );
    }

    #[test]
    fn validate_relative_path_rejects_excessive_length() {
        let too_long = "a".repeat(MAX_PATH_LENGTH + 1);
        assert_eq!(
            validate_relative_path(&too_long),
            Err(ExplorerError::PathTooLong)
        );
    }

    #[test]
    fn local_filesystem_rejects_escape_attempts() {
        let (_root, local) = setup_local_fs();
        assert_eq!(
            local.read_file("../escape"),
            Err(ExplorerError::PathTraversal)
        );
        assert_eq!(local.list_dir("../"), Err(ExplorerError::PathTraversal));
    }

    #[test]
    fn list_dir_sorts_directories_first_then_case_insensitive_names() {
        let root = TestDir::new("explorer-sort");
        fs::create_dir_all(root.path.join("zeta")).expect("zeta dir should be created");
        fs::create_dir_all(root.path.join("Alpha")).expect("Alpha dir should be created");
        fs::write(root.path.join("beta.txt"), "beta").expect("beta file should be created");
        fs::write(root.path.join("apple.txt"), "apple").expect("apple file should be created");

        let local = LocalFileSystem::new(root.path.clone()).expect("local fs should init");
        let listed = local.list_dir(".").expect("list_dir should work");

        let names: Vec<&str> = listed.iter().map(|node| node.name.as_str()).collect();
        assert_eq!(names, vec!["Alpha", "zeta", "apple.txt", "beta.txt"]);
        assert!(listed[0].is_dir);
        assert!(listed[1].is_dir);
        assert!(!listed[2].is_dir);
    }

    #[test]
    fn binary_detection_only_checks_first_8kb_for_null_bytes() {
        let mut null_after_window = vec![b'a'; BINARY_DETECTION_SAMPLE_BYTES + 100];
        null_after_window[BINARY_DETECTION_SAMPLE_BYTES] = 0;
        assert!(!is_binary_content(&null_after_window));

        let mut null_within_window = vec![b'a'; BINARY_DETECTION_SAMPLE_BYTES];
        null_within_window[123] = 0;
        assert!(is_binary_content(&null_within_window));
    }

    #[test]
    fn write_file_rejects_parent_symlink_escape() {
        let root = TestDir::new("explorer-root-containment");
        let outside = TestDir::new("explorer-outside");
        let linked_dir = root.path.join("linked");

        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside.path, &linked_dir).expect("symlink should be created");
        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&outside.path, &linked_dir)
            .expect("symlink should be created");

        let local = LocalFileSystem::new(root.path.clone()).expect("local fs should init");
        assert_eq!(
            local.write_file("linked/escape.txt", b"escape"),
            Err(ExplorerError::PathTraversal)
        );
    }

    #[test]
    fn list_dir_marks_symlink_entries_without_following() {
        let root = TestDir::new("explorer-symlink-entry");
        fs::write(root.path.join("target.txt"), "target").expect("target should exist");

        #[cfg(unix)]
        std::os::unix::fs::symlink(root.path.join("target.txt"), root.path.join("linked.txt"))
            .expect("symlink should be created");
        #[cfg(windows)]
        std::os::windows::fs::symlink_file(
            root.path.join("target.txt"),
            root.path.join("linked.txt"),
        )
        .expect("symlink should be created");

        let local = LocalFileSystem::new(root.path.clone()).expect("local fs should init");
        let listed = local.list_dir(".").expect("list should work");
        let linked = listed
            .iter()
            .find(|entry| entry.name == "linked.txt")
            .expect("symlink entry should be listed");
        assert!(linked.is_symlink);
    }

    #[test]
    fn stat_reports_read_only_metadata_for_readonly_file() {
        let root = TestDir::new("explorer-readonly-stat");
        let file = root.path.join("readonly.txt");
        fs::write(&file, "content").expect("readonly file should exist");

        let mut permissions = fs::metadata(&file)
            .expect("metadata should exist")
            .permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&file, permissions).expect("permissions should be set");

        let local = LocalFileSystem::new(root.path.clone()).expect("local fs should init");
        let metadata = local.stat("readonly.txt").expect("stat should work");
        assert!(metadata.is_read_only);
    }
}
