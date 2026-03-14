use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

const WATCH_DEBOUNCE: Duration = Duration::from_millis(500);
const WATCH_POLL_INTERVAL: Duration = Duration::from_millis(50);
const MAX_LOCAL_WATCHERS: usize = 5;

type RefreshCallback = Arc<dyn Fn(ExplorerRefreshEvent) + Send + Sync + 'static>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExplorerRefreshEvent {
    pub root: String,
    pub changed_paths: Vec<String>,
}

pub struct WatcherState {
    pub manager: Mutex<WatcherManager>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self {
            manager: Mutex::new(WatcherManager::new()),
        }
    }
}

#[tauri::command]
pub fn start_local_watcher(
    app_handle: AppHandle,
    state: State<'_, WatcherState>,
    root: String,
) -> Result<(), String> {
    let refresh_handle = app_handle.clone();
    let refresh_callback: RefreshCallback = Arc::new(move |event| {
        let _ = refresh_handle.emit("explorer-refresh", event);
    });

    let mut manager = state
        .manager
        .lock()
        .map_err(|_| "watcher manager lock poisoned".to_string())?;

    manager.watch_local_root(root.into(), refresh_callback)
}

#[tauri::command]
pub fn stop_local_watcher(state: State<'_, WatcherState>) -> Result<(), String> {
    let mut manager = state
        .manager
        .lock()
        .map_err(|_| "watcher manager lock poisoned".to_string())?;

    manager.stop_local_watcher();
    Ok(())
}

pub struct WatcherManager {
    local_watchers: HashMap<PathBuf, ActiveWatcher>,
}

impl WatcherManager {
    pub fn new() -> Self {
        Self {
            local_watchers: HashMap::new(),
        }
    }

    pub fn watch_local_root(
        &mut self,
        root: PathBuf,
        refresh_callback: RefreshCallback,
    ) -> Result<(), String> {
        let canonical_root = fs::canonicalize(&root)
            .map_err(|e| format!("failed to resolve watcher root {}: {e}", root.display()))?;

        if !canonical_root.is_dir() {
            return Err(format!(
                "watcher root must be an existing directory: {}",
                canonical_root.display()
            ));
        }

        if self.local_watchers.contains_key(&canonical_root) {
            return Ok(());
        }

        if self.active_watcher_count() >= MAX_LOCAL_WATCHERS {
            return Err(format!(
                "local watcher limit reached ({MAX_LOCAL_WATCHERS})"
            ));
        }

        let watcher = ActiveWatcher::new(canonical_root.clone(), refresh_callback)?;
        self.local_watchers.insert(canonical_root, watcher);
        Ok(())
    }

    pub fn stop_local_watcher(&mut self) {
        for watcher in self.local_watchers.drain().map(|(_, watcher)| watcher) {
            watcher.stop();
        }
    }

    pub fn close_all(&mut self) {
        self.stop_local_watcher();
    }

    fn active_watcher_count(&self) -> usize {
        self.local_watchers.len()
    }

    #[cfg(test)]
    fn watched_roots(&self) -> Vec<&Path> {
        let mut roots: Vec<&Path> = self.local_watchers.keys().map(PathBuf::as_path).collect();
        roots.sort();
        roots
    }
}

struct ActiveWatcher {
    _watcher: RecommendedWatcher,
    stop_tx: mpsc::Sender<()>,
    worker: Option<JoinHandle<()>>,
}

impl ActiveWatcher {
    fn new(root: PathBuf, refresh_callback: RefreshCallback) -> Result<Self, String> {
        let (event_tx, event_rx) = mpsc::channel::<notify::Result<Event>>();
        let mut watcher = RecommendedWatcher::new(
            move |event_result| {
                let _ = event_tx.send(event_result);
            },
            Config::default(),
        )
        .map_err(|e| format!("failed to create watcher for {}: {e}", root.display()))?;

        watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|e| format!("failed to watch {}: {e}", root.display()))?;

        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let worker = spawn_debounce_worker(root.clone(), event_rx, stop_rx, refresh_callback);

        Ok(Self {
            _watcher: watcher,
            stop_tx,
            worker: Some(worker),
        })
    }

    fn stop(mut self) {
        let _ = self.stop_tx.send(());
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn spawn_debounce_worker(
    root: PathBuf,
    event_rx: mpsc::Receiver<notify::Result<Event>>,
    stop_rx: mpsc::Receiver<()>,
    refresh_callback: RefreshCallback,
) -> JoinHandle<()> {
    thread::spawn(move || {
        let mut last_change_at: Option<Instant> = None;
        let mut changed_paths = BTreeSet::new();

        loop {
            if stop_rx.try_recv().is_ok() {
                break;
            }

            match event_rx.recv_timeout(WATCH_POLL_INTERVAL) {
                Ok(Ok(event)) => {
                    let refresh_paths = collect_refresh_paths(&root, &event);
                    if !refresh_paths.is_empty() {
                        changed_paths.extend(refresh_paths);
                        last_change_at = Some(Instant::now());
                    }
                }
                Ok(Err(_)) => {
                    changed_paths.insert(root.to_string_lossy().into_owned());
                    last_change_at = Some(Instant::now());
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }

            if let Some(last_change) = last_change_at {
                if last_change.elapsed() >= WATCH_DEBOUNCE {
                    refresh_callback(ExplorerRefreshEvent {
                        root: root.to_string_lossy().into_owned(),
                        changed_paths: changed_paths.iter().cloned().collect(),
                    });
                    last_change_at = None;
                    changed_paths.clear();
                }
            }
        }
    })
}

fn collect_refresh_paths(root: &Path, event: &Event) -> BTreeSet<String> {
    if event.kind.is_access() {
        return BTreeSet::new();
    }

    if event.paths.is_empty() || event.need_rescan() {
        return BTreeSet::from([root.to_string_lossy().into_owned()]);
    }

    event
        .paths
        .iter()
        .filter(|path| path == &root || path.starts_with(root))
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, CreateKind, Flag, ModifyKind};
    use notify::EventKind;
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
            let path = std::env::temp_dir().join(format!("forge-watcher-{prefix}-{unique}"));
            fs::create_dir_all(&path).expect("test dir should be created");
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn refresh_callback(tx: mpsc::Sender<ExplorerRefreshEvent>) -> RefreshCallback {
        Arc::new(move |event| {
            let _ = tx.send(event);
        })
    }

    #[test]
    fn debounce_worker_emits_single_refresh_for_burst_changes() {
        let root = TestDir::new("debounce");
        let changed_file = root.path.join("alpha.txt");
        let (event_tx, event_rx) = mpsc::channel::<notify::Result<Event>>();
        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let (refresh_tx, refresh_rx) = mpsc::channel::<ExplorerRefreshEvent>();

        let worker = spawn_debounce_worker(
            root.path.clone(),
            event_rx,
            stop_rx,
            refresh_callback(refresh_tx),
        );

        event_tx
            .send(Ok(
                Event::new(EventKind::Create(CreateKind::File)).add_path(changed_file.clone())
            ))
            .expect("first event should send");
        thread::sleep(Duration::from_millis(100));
        event_tx
            .send(Ok(
                Event::new(EventKind::Modify(ModifyKind::Any)).add_path(changed_file.clone())
            ))
            .expect("second event should send");

        let refresh = refresh_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("debounced refresh should arrive");
        assert_eq!(refresh.root, root.path.to_string_lossy());
        assert_eq!(
            refresh.changed_paths,
            vec![changed_file.to_string_lossy().into_owned()]
        );
        assert!(
            refresh_rx.recv_timeout(Duration::from_millis(700)).is_err(),
            "burst changes should collapse into a single refresh"
        );

        stop_tx.send(()).expect("stop signal should send");
        worker.join().expect("worker should shut down cleanly");
    }

    #[test]
    fn debounce_worker_ignores_access_events() {
        let root = TestDir::new("access-only");
        let (event_tx, event_rx) = mpsc::channel::<notify::Result<Event>>();
        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let (refresh_tx, refresh_rx) = mpsc::channel::<ExplorerRefreshEvent>();

        let worker = spawn_debounce_worker(
            root.path.clone(),
            event_rx,
            stop_rx,
            refresh_callback(refresh_tx),
        );

        event_tx
            .send(Ok(Event::new(EventKind::Access(AccessKind::Any))
                .add_path(root.path.join("alpha.txt"))))
            .expect("access event should send");

        assert!(
            refresh_rx.recv_timeout(Duration::from_millis(700)).is_err(),
            "access-only activity should not trigger refresh"
        );

        stop_tx.send(()).expect("stop signal should send");
        worker.join().expect("worker should shut down cleanly");
    }

    #[test]
    fn watcher_manager_allows_five_concurrent_roots_and_rejects_sixth() {
        let roots: Vec<TestDir> = (0..MAX_LOCAL_WATCHERS)
            .map(|index| TestDir::new(&format!("manager-{index}")))
            .collect();
        let (refresh_tx, _refresh_rx) = mpsc::channel::<ExplorerRefreshEvent>();
        let callback = refresh_callback(refresh_tx);
        let mut manager = WatcherManager::new();

        for root in &roots {
            manager
                .watch_local_root(root.path.clone(), callback.clone())
                .expect("root should be watched");
        }

        assert_eq!(manager.active_watcher_count(), MAX_LOCAL_WATCHERS);
        assert_eq!(manager.watched_roots().len(), MAX_LOCAL_WATCHERS);

        let overflow = TestDir::new("manager-overflow");
        let overflow_result = manager.watch_local_root(overflow.path.clone(), callback.clone());
        assert!(overflow_result.is_err(), "sixth root should be rejected");
        assert_eq!(manager.active_watcher_count(), MAX_LOCAL_WATCHERS);

        manager
            .watch_local_root(roots[0].path.clone(), callback)
            .expect("watching the same root should be idempotent");
        assert_eq!(manager.active_watcher_count(), MAX_LOCAL_WATCHERS);

        manager.close_all();
        assert_eq!(manager.active_watcher_count(), 0);
    }

    #[test]
    fn watcher_manager_rejects_missing_root() {
        let missing = std::env::temp_dir().join(format!(
            "forge-watcher-missing-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after epoch")
                .as_nanos()
        ));
        let (refresh_tx, _refresh_rx) = mpsc::channel::<ExplorerRefreshEvent>();
        let mut manager = WatcherManager::new();

        let result = manager.watch_local_root(missing, refresh_callback(refresh_tx));
        assert!(result.is_err(), "missing root should be rejected");
        assert_eq!(manager.active_watcher_count(), 0);
    }

    #[test]
    fn collect_refresh_paths_returns_root_for_rescan_events() {
        let root = PathBuf::from("/tmp/forge-root");
        let event = Event::new(EventKind::Modify(ModifyKind::Any)).set_flag(Flag::Rescan);

        assert_eq!(
            collect_refresh_paths(&root, &event),
            BTreeSet::from([root.to_string_lossy().into_owned()])
        );
    }
}
