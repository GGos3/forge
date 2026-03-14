use git2::{ErrorCode, Repository, Status, StatusOptions};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const GIT_STATUS_CACHE_TTL: Duration = Duration::from_secs(2);

#[derive(Debug, Clone)]
struct CachedGitStatus {
    cached_at: Instant,
    statuses: HashMap<String, GitStatusKind>,
}

static GIT_STATUS_CACHE: OnceLock<Mutex<HashMap<PathBuf, CachedGitStatus>>> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum GitStatusKind {
    Modified,
    Staged,
    Untracked,
}

#[tauri::command]
pub fn get_git_status(repo_root: String) -> Result<HashMap<String, GitStatusKind>, String> {
    read_git_statuses_cached(Path::new(&repo_root), Instant::now(), GIT_STATUS_CACHE_TTL)
}

fn git_status_cache() -> &'static Mutex<HashMap<PathBuf, CachedGitStatus>> {
    GIT_STATUS_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn read_git_statuses_cached(
    repo_root: &Path,
    now: Instant,
    ttl: Duration,
) -> Result<HashMap<String, GitStatusKind>, String> {
    let canonical_root = match fs::canonicalize(repo_root) {
        Ok(path) => path,
        Err(_) => return Ok(HashMap::new()),
    };

    {
        let cache = git_status_cache()
            .lock()
            .map_err(|_| "git status cache lock poisoned".to_string())?;
        if let Some(cached) = cache.get(&canonical_root) {
            if now.saturating_duration_since(cached.cached_at) <= ttl {
                return Ok(cached.statuses.clone());
            }
        }
    }

    let statuses = read_git_statuses_uncached(&canonical_root)?;

    let mut cache = git_status_cache()
        .lock()
        .map_err(|_| "git status cache lock poisoned".to_string())?;
    cache.insert(
        canonical_root,
        CachedGitStatus {
            cached_at: now,
            statuses: statuses.clone(),
        },
    );

    Ok(statuses)
}

fn read_git_statuses_uncached(
    canonical_root: &Path,
) -> Result<HashMap<String, GitStatusKind>, String> {
    debug_assert!(canonical_root.is_absolute());

    let repository = match Repository::discover(&canonical_root) {
        Ok(repository) => repository,
        Err(error) if error.code() == ErrorCode::NotFound => return Ok(HashMap::new()),
        Err(error) => return Err(error.to_string()),
    };

    let workdir = match repository.workdir() {
        Some(path) => path,
        None => return Ok(HashMap::new()),
    };

    let canonical_workdir = fs::canonicalize(workdir).map_err(|error| error.to_string())?;
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_ignored(false);

    let statuses = repository
        .statuses(Some(&mut options))
        .map_err(|error| error.to_string())?;

    let mut git_statuses = HashMap::new();
    for entry in statuses.iter() {
        let Some(repo_relative_path) = entry.path() else {
            continue;
        };
        let Some(status_kind) = classify_status(entry.status()) else {
            continue;
        };

        let absolute_path = canonical_workdir.join(repo_relative_path);
        if !absolute_path.starts_with(&canonical_root) {
            continue;
        }

        let Ok(relative_path) = absolute_path.strip_prefix(&canonical_root) else {
            continue;
        };
        if relative_path.as_os_str().is_empty() {
            continue;
        }

        git_statuses.insert(normalize_relative_path(relative_path), status_kind);
    }

    Ok(git_statuses)
}

fn classify_status(status: Status) -> Option<GitStatusKind> {
    if status.is_wt_new() {
        return Some(GitStatusKind::Untracked);
    }

    if status.is_conflicted()
        || status.is_wt_modified()
        || status.is_wt_deleted()
        || status.is_wt_renamed()
        || status.is_wt_typechange()
    {
        return Some(GitStatusKind::Modified);
    }

    if status.is_index_new()
        || status.is_index_modified()
        || status.is_index_deleted()
        || status.is_index_renamed()
        || status.is_index_typechange()
    {
        return Some(GitStatusKind::Staged);
    }

    None
}

fn normalize_relative_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::{Repository, Signature};
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
            let path = std::env::temp_dir().join(format!("forge-git-status-{prefix}-{unique}"));
            fs::create_dir_all(&path).expect("test dir should be created");
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn commit_all(repository: &Repository, message: &str) {
        let mut index = repository.index().expect("index should open");
        index
            .add_all(["*"], git2::IndexAddOption::DEFAULT, None)
            .expect("files should be added");
        index.write().expect("index should write");

        let tree_id = index.write_tree().expect("tree should write");
        let tree = repository.find_tree(tree_id).expect("tree should load");
        let signature =
            Signature::now("Forge", "forge@example.com").expect("signature should be created");

        let parent_commit = repository
            .head()
            .ok()
            .and_then(|head| head.target())
            .and_then(|oid| repository.find_commit(oid).ok());

        match parent_commit {
            Some(parent) => repository
                .commit(
                    Some("HEAD"),
                    &signature,
                    &signature,
                    message,
                    &tree,
                    &[&parent],
                )
                .expect("commit should succeed"),
            None => repository
                .commit(Some("HEAD"), &signature, &signature, message, &tree, &[])
                .expect("initial commit should succeed"),
        };
    }

    #[test]
    fn get_git_status_returns_empty_map_for_non_repo_paths() {
        let dir = TestDir::new("non-repo");
        fs::write(dir.path.join("notes.txt"), "hello").expect("file should be created");

        let statuses = get_git_status(dir.path.to_string_lossy().into_owned())
            .expect("non-repo status lookup should succeed");
        assert!(statuses.is_empty());
    }

    #[test]
    fn read_git_statuses_reports_modified_staged_and_untracked_files() {
        clear_git_status_cache();
        let repo_dir = TestDir::new("repo-statuses");
        let repository = Repository::init(&repo_dir.path).expect("repository should initialize");

        fs::write(repo_dir.path.join("tracked-modified.txt"), "before")
            .expect("tracked file should be created");
        fs::write(repo_dir.path.join("staged.txt"), "before")
            .expect("staged file should be created");
        fs::write(repo_dir.path.join("unchanged.txt"), "stable")
            .expect("unchanged file should be created");
        commit_all(&repository, "initial commit");

        fs::write(repo_dir.path.join("tracked-modified.txt"), "after")
            .expect("tracked file should be modified");
        fs::write(repo_dir.path.join("staged.txt"), "after")
            .expect("staged file should be modified");
        repository
            .index()
            .and_then(|mut index| {
                index.add_path(Path::new("staged.txt"))?;
                index.write()
            })
            .expect("staged file should be added to index");
        fs::write(repo_dir.path.join("untracked.txt"), "new")
            .expect("untracked file should be created");

        let statuses =
            read_git_statuses_uncached(&repo_dir.path).expect("status lookup should succeed");

        assert_eq!(
            statuses.get("tracked-modified.txt"),
            Some(&GitStatusKind::Modified)
        );
        assert_eq!(statuses.get("staged.txt"), Some(&GitStatusKind::Staged));
        assert_eq!(
            statuses.get("untracked.txt"),
            Some(&GitStatusKind::Untracked)
        );
        assert!(!statuses.contains_key("unchanged.txt"));
    }

    #[test]
    fn read_git_statuses_filters_results_to_requested_subdirectory() {
        clear_git_status_cache();
        let repo_dir = TestDir::new("repo-subdir");
        let repository = Repository::init(&repo_dir.path).expect("repository should initialize");

        fs::create_dir_all(repo_dir.path.join("nested")).expect("nested dir should exist");
        fs::write(repo_dir.path.join("root.txt"), "root").expect("root file should be created");
        fs::write(repo_dir.path.join("nested/inside.txt"), "inside")
            .expect("nested file should be created");
        commit_all(&repository, "initial commit");

        fs::write(repo_dir.path.join("root.txt"), "root updated")
            .expect("root file should be modified");
        fs::write(repo_dir.path.join("nested/inside.txt"), "inside updated")
            .expect("nested file should be modified");

        let statuses = read_git_statuses_uncached(&repo_dir.path.join("nested"))
            .expect("status lookup should work");

        assert_eq!(statuses.len(), 1);
        assert_eq!(statuses.get("inside.txt"), Some(&GitStatusKind::Modified));
    }

    #[test]
    fn read_git_statuses_cached_reuses_results_within_ttl() {
        clear_git_status_cache();
        let repo_dir = TestDir::new("repo-cache-hit");
        let repository = Repository::init(&repo_dir.path).expect("repository should initialize");

        fs::write(repo_dir.path.join("tracked.txt"), "stable")
            .expect("tracked file should be created");
        commit_all(&repository, "initial commit");

        let now = Instant::now();
        let first = read_git_statuses_cached(&repo_dir.path, now, Duration::from_secs(2))
            .expect("initial cached read should succeed");
        assert!(first.is_empty());

        fs::write(repo_dir.path.join("new.txt"), "later")
            .expect("untracked file should be created");

        let cached = read_git_statuses_cached(
            &repo_dir.path,
            now + Duration::from_millis(500),
            Duration::from_secs(2),
        )
        .expect("cached read should succeed");
        assert!(cached.is_empty());

        let uncached =
            read_git_statuses_uncached(&repo_dir.path).expect("uncached read should succeed");
        assert_eq!(uncached.get("new.txt"), Some(&GitStatusKind::Untracked));
    }

    #[test]
    fn read_git_statuses_cached_refreshes_after_ttl_expires() {
        clear_git_status_cache();
        let repo_dir = TestDir::new("repo-cache-expire");
        let repository = Repository::init(&repo_dir.path).expect("repository should initialize");

        fs::write(repo_dir.path.join("tracked.txt"), "stable")
            .expect("tracked file should be created");
        commit_all(&repository, "initial commit");

        let now = Instant::now();
        let first = read_git_statuses_cached(&repo_dir.path, now, Duration::from_secs(2))
            .expect("initial cached read should succeed");
        assert!(first.is_empty());

        fs::write(repo_dir.path.join("new.txt"), "later")
            .expect("untracked file should be created");

        let refreshed = read_git_statuses_cached(
            &repo_dir.path,
            now + Duration::from_millis(2500),
            Duration::from_secs(2),
        )
        .expect("expired cache should refresh");
        assert_eq!(refreshed.get("new.txt"), Some(&GitStatusKind::Untracked));
    }

    fn clear_git_status_cache() {
        git_status_cache()
            .lock()
            .expect("git status cache lock should be available")
            .clear();
    }
}
