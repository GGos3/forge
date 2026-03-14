import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createStore, produce } from "solid-js/store";
import type { FileNode, FileTreeProvider, FileTreeRoot, GitStatusMap } from "../types/file-node";

const DEFAULT_SIDEBAR_WIDTH = 260;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 500;
const DEFAULT_SHOW_HIDDEN = false;
const DIRECTORY_CACHE_TTL_MS = 1_000;

export interface ExplorerState {
  root: FileTreeRoot | null;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  isVisible: boolean;
  width: number;
  isLoading: boolean;
  error: string | null;
}

interface ExplorerRefreshEvent {
  root: string;
  changed_paths: string[];
}

interface ExplorerEntryResponse {
  name: string;
  path: string;
  is_dir?: boolean;
  is_symlink?: boolean;
  permission_denied?: boolean;
  type?: FileNode["type"];
  size?: number;
  modified?: number;
  permissions?: number;
}

interface RemoteDirectoryRequest {
  connection_id: string;
  path: string;
  show_hidden: boolean;
}

const [state, setState] = createStore<ExplorerState>({
  root: null,
  expandedPaths: new Set<string>(),
  selectedPath: null,
  isVisible: false,
  width: DEFAULT_SIDEBAR_WIDTH,
  isLoading: false,
  error: null,
});

let activeWatcherRoot: string | null = null;
let refreshListenerPromise: Promise<void> | null = null;
let refreshUnlisten: (() => void) | null = null;
const directoryCache = new Map<string, { fetchedAt: number; nodes: FileNode[] }>();
const directoryInflight = new Map<string, Promise<FileNode[]>>();

function clampSidebarWidth(width: number): number {
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, width));
}

function updateNodeByPath(nodes: FileNode[], targetPath: string, updater: (node: FileNode) => FileNode): FileNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return updater(node);
    }

    if (!node.children || node.children.length === 0) {
      return node;
    }

    return {
      ...node,
      children: updateNodeByPath(node.children, targetPath, updater),
    };
  });
}

function findNodeByPath(nodes: FileNode[], targetPath: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return node;
    }

    if (node.children?.length) {
      const found = findNodeByPath(node.children, targetPath);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function normalizeGitStatusPath(rootPath: string, statusPath: string): string {
  if (statusPath.startsWith(rootPath)) {
    return statusPath;
  }

  const sanitizedRoot = rootPath.replace(/\/$/, "");
  const sanitizedStatusPath = statusPath.replace(/^\.\//, "").replace(/^\//, "");
  return sanitizedStatusPath.length > 0 ? `${sanitizedRoot}/${sanitizedStatusPath}` : sanitizedRoot;
}

function normalizeGitStatuses(rootPath: string, gitStatuses: GitStatusMap | undefined): GitStatusMap {
  if (!gitStatuses) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(gitStatuses).map(([statusPath, status]) => [normalizeGitStatusPath(rootPath, statusPath), status])
  );
}

function toRelativeExplorerPath(rootPath: string, path: string): string {
  const sanitizedRoot = rootPath.replace(/\/$/, "");
  const sanitizedPath = path.replace(/\/$/, "");

  if (sanitizedPath === sanitizedRoot) {
    return ".";
  }

  if (sanitizedPath.startsWith(`${sanitizedRoot}/`)) {
    return sanitizedPath.slice(sanitizedRoot.length + 1);
  }

  return path;
}

function toRelativeChangedPath(rootPath: string, changedPath: string): string | null {
  const sanitizedRoot = rootPath.replace(/\/$/, "");
  const sanitizedChangedPath = changedPath.replace(/\/$/, "");

  if (sanitizedChangedPath === sanitizedRoot) {
    return ".";
  }

  if (sanitizedChangedPath.startsWith(`${sanitizedRoot}/`)) {
    return sanitizedChangedPath.slice(sanitizedRoot.length + 1);
  }

  return null;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getDirectoryCacheKey(root: FileTreeRoot, path: string): string {
  return `${root.provider}:${root.connectionId ?? "local"}:${root.rootPath}:${path}`;
}

function clearDirectoryCache() {
  directoryCache.clear();
  directoryInflight.clear();
}

function clearDirectoryCacheForRoot(root: FileTreeRoot) {
  const cachePrefix = `${root.provider}:${root.connectionId ?? "local"}:${root.rootPath}:`;

  for (const cacheKey of Array.from(directoryCache.keys())) {
    if (cacheKey.startsWith(cachePrefix)) {
      directoryCache.delete(cacheKey);
    }
  }

  for (const cacheKey of Array.from(directoryInflight.keys())) {
    if (cacheKey.startsWith(cachePrefix)) {
      directoryInflight.delete(cacheKey);
    }
  }
}

function applyExpandedState(nodes: FileNode[], expandedPaths: Set<string>): FileNode[] {
  return nodes.map((node) => {
    const nextNode: FileNode = {
      ...node,
      isExpanded: expandedPaths.has(node.path),
    };

    if (!node.children?.length) {
      return nextNode;
    }

    nextNode.children = applyExpandedState(node.children, expandedPaths);
    return nextNode;
  });
}

function toListPath(root: FileTreeRoot, path: string): string {
  if (root.provider === "remote") {
    if (path === ".") {
      return root.rootPath;
    }

    return path;
  }

  return path;
}

function invalidateLocalDirectoryCache(root: FileTreeRoot, changedPaths: string[]) {
  if (root.provider !== "local") {
    return;
  }

  if (changedPaths.length === 0 || changedPaths.some((changedPath) => toRelativeChangedPath(root.rootPath, changedPath) === ".")) {
    clearDirectoryCacheForRoot(root);
    return;
  }

  const affectedPaths = new Set<string>(["."]);

  for (const changedPath of changedPaths) {
    const relativePath = toRelativeChangedPath(root.rootPath, changedPath);
    if (!relativePath || relativePath === ".") {
      continue;
    }

    const segments = relativePath.split("/").filter(Boolean);
    let currentPath = "";

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      affectedPaths.add(currentPath);
    }
  }

  for (const affectedPath of affectedPaths) {
    const cacheKey = getDirectoryCacheKey(root, affectedPath);
    directoryCache.delete(cacheKey);
    directoryInflight.delete(cacheKey);
  }
}

async function listDirectory(root: FileTreeRoot, path: string): Promise<FileNode[]> {
  const requestPath = toListPath(root, path);
  let entries: ExplorerEntryResponse[];

  if (root.provider === "remote") {
    if (!root.connectionId) {
      throw new Error("Remote explorer root requires a connection id.");
    }

    entries = await invoke<ExplorerEntryResponse[]>("list_remote_directory", {
      connection_id: root.connectionId,
      path: requestPath,
      show_hidden: DEFAULT_SHOW_HIDDEN,
    } satisfies RemoteDirectoryRequest);
  } else {
    entries = await invoke<ExplorerEntryResponse[]>("list_directory", {
      root: root.rootPath,
      path: requestPath,
      show_hidden: DEFAULT_SHOW_HIDDEN,
    });
  }

  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    type: entry.type ?? (entry.is_symlink ? "symlink" : entry.is_dir ? "directory" : "file"),
    size: entry.size ?? 0,
    modified: entry.modified ?? 0,
    permissions: entry.permissions ?? 0,
    ...(entry.permission_denied ? { permissionDenied: true } : {}),
  }));
}

async function listDirectoryWithCache(root: FileTreeRoot, path: string, forceRefresh = false): Promise<FileNode[]> {
  const cacheKey = getDirectoryCacheKey(root, path);
  const now = Date.now();

  if (!forceRefresh) {
    const cached = directoryCache.get(cacheKey);
    if (cached && now - cached.fetchedAt <= DIRECTORY_CACHE_TTL_MS) {
      return cached.nodes;
    }
  }

  const inflight = directoryInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const fetchPromise = listDirectory(root, path)
    .then((nodes) => {
      directoryCache.set(cacheKey, {
        fetchedAt: Date.now(),
        nodes,
      });
      return nodes;
    })
    .finally(() => {
      directoryInflight.delete(cacheKey);
    });

  directoryInflight.set(cacheKey, fetchPromise);
  return fetchPromise;
}

async function getGitStatuses(root: FileTreeRoot): Promise<GitStatusMap> {
  if (root.provider !== "local") {
    return {};
  }

  return invoke<GitStatusMap>("get_git_status", {
    repo_root: root.rootPath,
  });
}

async function hydrateExpandedNodes(root: FileTreeRoot, nodes: FileNode[], expandedPaths: Set<string>): Promise<FileNode[]> {
  let nextNodes = applyExpandedState(nodes, expandedPaths);

  for (const expandedPath of expandedPaths) {
    const node = findNodeByPath(nextNodes, expandedPath);
    if (!node || node.type !== "directory") {
      continue;
    }

    const childPath = root.provider === "local"
      ? toRelativeExplorerPath(root.rootPath, expandedPath)
      : expandedPath;
    const children = await listDirectoryWithCache(root, childPath);
    nextNodes = updateNodeByPath(nextNodes, expandedPath, (target) => ({
      ...target,
      isExpanded: true,
      children: applyExpandedState(children, expandedPaths),
    }));
  }

  return nextNodes;
}

async function ensureRefreshListener(): Promise<void> {
  if (refreshUnlisten) {
    return;
  }

  if (refreshListenerPromise) {
    return refreshListenerPromise;
  }

  refreshListenerPromise = listen<ExplorerRefreshEvent>("explorer-refresh", (event) => {
    if (!state.root || state.root.provider !== "local" || event.payload.root !== state.root.rootPath) {
      return;
    }

    invalidateLocalDirectoryCache(state.root, event.payload.changed_paths ?? []);
    void explorerStore.refreshTree();
  }).then((unlisten) => {
    refreshUnlisten = unlisten;
    refreshListenerPromise = null;
  });

  return refreshListenerPromise;
}

function disposeRefreshListener() {
  refreshUnlisten?.();
  refreshUnlisten = null;
  refreshListenerPromise = null;
}

async function stopLocalWatcher(): Promise<void> {
  if (!activeWatcherRoot) {
    return;
  }

  activeWatcherRoot = null;

  try {
    await invoke("stop_local_watcher");
  } catch (error) {
    console.warn("Failed to stop local watcher during explorer cleanup.", error);
  }
}

async function syncLocalWatcher(root: FileTreeRoot | null): Promise<void> {
  if (!root || root.provider !== "local") {
    await stopLocalWatcher();
    return;
  }

  await ensureRefreshListener();

  if (activeWatcherRoot === root.rootPath) {
    return;
  }

  await stopLocalWatcher();
  await invoke("start_local_watcher", { root: root.rootPath });
  activeWatcherRoot = root.rootPath;
}

export const explorerStore = {
  get root() {
    return state.root;
  },

  get expandedPaths() {
    return state.expandedPaths;
  },

  get selectedPath() {
    return state.selectedPath;
  },

  get isVisible() {
    return state.isVisible;
  },

  get width() {
    return state.width;
  },

  get isLoading() {
    return state.isLoading;
  },

  get error() {
    return state.error;
  },

  reset() {
    void stopLocalWatcher();
    disposeRefreshListener();
    clearDirectoryCache();
    setState({
      root: null,
      expandedPaths: new Set<string>(),
      selectedPath: null,
      isVisible: false,
      width: DEFAULT_SIDEBAR_WIDTH,
      isLoading: false,
      error: null,
    });
  },

  toggleSidebar() {
    setState("isVisible", (visible) => !visible);
  },

  setSidebarWidth(width: number) {
    setState("width", clampSidebarWidth(width));
  },

  async setRoot(path: string, provider: FileTreeProvider, connectionId?: string): Promise<void> {
    if (provider === "remote" && !connectionId) {
      throw new Error("Remote explorer root requires a connection id.");
    }

    clearDirectoryCache();

    const root: FileTreeRoot = {
      rootPath: path,
      provider,
      connectionId,
      nodes: [],
      gitStatuses: {},
    };

    setState({
      root,
      expandedPaths: new Set<string>(),
      selectedPath: null,
      isLoading: false,
      error: null,
    });

    await this.refreshTree();

    try {
      await syncLocalWatcher(root);
    } catch (error) {
      setState("error", toErrorMessage(error));
    }
  },

  async refreshTree(): Promise<void> {
    const root = state.root;
    if (!root) {
      return;
    }

    setState("isLoading", true);
    setState("error", null);

    try {
      const topLevelNodes = await listDirectoryWithCache(root, ".", true);
      const [nodes, gitStatuses] = await Promise.all([
        hydrateExpandedNodes(root, topLevelNodes, state.expandedPaths),
        getGitStatuses(root),
      ]);

      setState(
        produce((s) => {
          if (!s.root) {
            return;
          }

          if (
            s.root.rootPath !== root.rootPath ||
            s.root.provider !== root.provider ||
            s.root.connectionId !== root.connectionId
          ) {
            return;
          }

          s.root.nodes = nodes;
          s.root.gitStatuses = normalizeGitStatuses(root.rootPath, gitStatuses);
        })
      );
    } catch (error) {
      setState("error", toErrorMessage(error));
    } finally {
      setState("isLoading", false);
    }
  },

  async toggleExpand(path: string): Promise<void> {
    const currentlyExpanded = state.expandedPaths.has(path);

    if (!currentlyExpanded) {
      const root = state.root;
      if (root) {
        const node = findNodeByPath(root.nodes, path);
        if (node?.type === "directory" && node.children === undefined) {
          try {
            const childPath = root.provider === "local" ? toRelativeExplorerPath(root.rootPath, path) : path;
            const children = await listDirectoryWithCache(root, childPath);

            setState(
              produce((s) => {
                if (!s.root) {
                  return;
                }

                s.root.nodes = updateNodeByPath(s.root.nodes, path, (target) => ({
                  ...target,
                  isExpanded: true,
                  children,
                }));
              })
            );
          } catch (error) {
            setState("error", toErrorMessage(error));
            return;
          }
        }
      }
    }

    setState("expandedPaths", (paths) => {
      const next = new Set(paths);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });

    setState(
      produce((s) => {
        if (!s.root) {
          return;
        }

        s.root.nodes = updateNodeByPath(s.root.nodes, path, (target) => ({
          ...target,
          isExpanded: s.expandedPaths.has(path),
        }));
      })
    );
  },

  selectNode(path: string) {
    setState("selectedPath", path);
  },

  clearError() {
    setState("error", null);
  },

  setError(message: string) {
    setState("error", message);
  },

  handleConnectionDisconnected(connectionId: string) {
    const root = state.root;
    if (!root || root.provider !== "remote" || root.connectionId !== connectionId) {
      return;
    }

    void stopLocalWatcher();
    disposeRefreshListener();
    setState(
      produce((s) => {
        s.root = null;
        s.expandedPaths = new Set<string>();
        s.selectedPath = null;
        s.isLoading = false;
        s.error = "SSH connection lost. Reconnect and reopen the remote workspace.";
      })
    );
  },
};
