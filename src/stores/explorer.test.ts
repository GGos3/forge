import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { explorerStore } from "./explorer";
import type { FileNode } from "../types/file-node";

const rootPath = "/workspace";

function directory(path: string, name: string): FileNode {
  return {
    name,
    path,
    type: "directory",
    size: 0,
    modified: 0,
    permissions: 0,
  };
}

function file(path: string, name: string): FileNode {
  return {
    name,
    path,
    type: "file",
    size: 10,
    modified: 0,
    permissions: 0,
  };
}

function withCollapsed(nodes: FileNode[]): FileNode[] {
  return nodes.map((node) => ({
    ...node,
    isExpanded: false,
  }));
}

describe("explorer store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listen).mockResolvedValue(() => {});
    explorerStore.reset();
  });

  it("toggles sidebar visibility", () => {
    expect(explorerStore.isVisible).toBe(false);
    explorerStore.toggleSidebar();
    expect(explorerStore.isVisible).toBe(true);
    explorerStore.toggleSidebar();
    expect(explorerStore.isVisible).toBe(false);
  });

  it("clamps sidebar width to min/max", () => {
    explorerStore.setSidebarWidth(100);
    expect(explorerStore.width).toBe(180);

    explorerStore.setSidebarWidth(260);
    expect(explorerStore.width).toBe(260);

    explorerStore.setSidebarWidth(700);
    expect(explorerStore.width).toBe(500);
  });

  it("sets root, refreshes nodes, and starts the local watcher", async () => {
    const topLevelNodes = [directory("/workspace/src", "src"), file("/workspace/README.md", "README.md")];
    vi.mocked(invoke)
      .mockResolvedValueOnce(topLevelNodes)
      .mockResolvedValueOnce({ "README.md": "Modified" })
      .mockResolvedValueOnce(undefined);

    await explorerStore.setRoot(rootPath, "local");

    expect(invoke).toHaveBeenNthCalledWith(1, "list_directory", {
      root: rootPath,
      path: ".",
      show_hidden: false,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "get_git_status", { repo_root: rootPath });
    expect(invoke).toHaveBeenNthCalledWith(3, "start_local_watcher", { root: rootPath });
    expect(explorerStore.root?.rootPath).toBe(rootPath);
    expect(explorerStore.root?.provider).toBe("local");
    expect(explorerStore.root?.nodes).toEqual(withCollapsed(topLevelNodes));
    expect(explorerStore.root?.gitStatuses).toEqual({ "/workspace/README.md": "Modified" });
  });

  it("toggleExpand lazily loads children and tracks expanded paths", async () => {
    const srcNode = directory("/workspace/src", "src");
    vi.mocked(invoke)
      .mockResolvedValueOnce([srcNode])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([file("/workspace/src/main.ts", "main.ts")]);

    await explorerStore.setRoot(rootPath, "local");
    await explorerStore.toggleExpand(srcNode.path);

    const listDirectoryCalls = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "list_directory");
    expect(listDirectoryCalls).toEqual([
      ["list_directory", { root: rootPath, path: ".", show_hidden: false }],
      ["list_directory", { root: rootPath, path: "src", show_hidden: false }],
    ]);
    expect(explorerStore.expandedPaths.has(srcNode.path)).toBe(true);
    expect(explorerStore.root?.nodes[0].children).toEqual([file("/workspace/src/main.ts", "main.ts")]);
    expect(explorerStore.root?.nodes[0].isExpanded).toBe(true);

    await explorerStore.toggleExpand(srcNode.path);
    expect(explorerStore.expandedPaths.has(srcNode.path)).toBe(false);
    expect(explorerStore.root?.nodes[0].isExpanded).toBe(false);
  });

  it("toggleExpand does not refetch when children already loaded", async () => {
    const srcNode = directory("/workspace/src", "src");
    vi.mocked(invoke)
      .mockResolvedValueOnce([srcNode])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([file("/workspace/src/main.ts", "main.ts")]);

    await explorerStore.setRoot(rootPath, "local");
    await explorerStore.toggleExpand(srcNode.path);
    await explorerStore.toggleExpand(srcNode.path);
    await explorerStore.toggleExpand(srcNode.path);

    const listDirectoryCalls = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "list_directory");
    expect(listDirectoryCalls).toHaveLength(2);
  });

  it("selects node path", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(undefined);

    await explorerStore.setRoot(rootPath, "local");

    explorerStore.selectNode("/workspace/src/main.ts");
    expect(explorerStore.selectedPath).toBe("/workspace/src/main.ts");
  });

  it("refreshTree sets error on failure and clearError resets it", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("listing failed"));

    await explorerStore.setRoot(rootPath, "local");
    await explorerStore.refreshTree();

    expect(explorerStore.error).toBe("listing failed");
    explorerStore.clearError();
    expect(explorerStore.error).toBeNull();
  });

  it("refreshes the tree when a debounced explorer event arrives", async () => {
    let refreshHandler: ((event: { payload: { root: string; changed_paths: string[] } }) => void) | undefined;
    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      refreshHandler = handler as (event: { payload: { root: string; changed_paths: string[] } }) => void;
      return () => {};
    });

    vi.mocked(invoke)
      .mockResolvedValueOnce([directory("/workspace/src", "src")])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([file("/workspace/README.md", "README.md")])
      .mockResolvedValueOnce({});

    await explorerStore.setRoot(rootPath, "local");
    refreshHandler?.({ payload: { root: rootPath, changed_paths: [rootPath] } });
    await vi.waitFor(() => {
      expect(explorerStore.root?.nodes).toEqual(withCollapsed([file("/workspace/README.md", "README.md")]));
    });

    const listDirectoryCalls = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "list_directory");
    expect(listDirectoryCalls).toEqual([
      ["list_directory", { root: rootPath, path: ".", show_hidden: false }],
      ["list_directory", { root: rootPath, path: ".", show_hidden: false }],
    ]);
  });

  it("watcher refresh invalidates affected expanded directory cache", async () => {
    const srcNode = directory("/workspace/src", "src");
    let refreshHandler: ((event: { payload: { root: string; changed_paths: string[] } }) => void) | undefined;
    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      refreshHandler = handler as (event: { payload: { root: string; changed_paths: string[] } }) => void;
      return () => {};
    });

    vi.mocked(invoke)
      .mockResolvedValueOnce([srcNode])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([file("/workspace/src/main.ts", "main.ts")])
      .mockResolvedValueOnce([srcNode])
      .mockResolvedValueOnce([file("/workspace/src/new.ts", "new.ts")])
      .mockResolvedValueOnce({});

    await explorerStore.setRoot(rootPath, "local");
    await explorerStore.toggleExpand(srcNode.path);

    refreshHandler?.({
      payload: {
        root: rootPath,
        changed_paths: ["/workspace/src/new.ts"],
      },
    });

    await vi.waitFor(() => {
      expect(explorerStore.root?.nodes[0].children).toEqual(withCollapsed([file("/workspace/src/new.ts", "new.ts")]));
    });

    const listDirectoryCalls = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "list_directory");
    expect(listDirectoryCalls).toEqual([
      ["list_directory", { root: rootPath, path: ".", show_hidden: false }],
      ["list_directory", { root: rootPath, path: "src", show_hidden: false }],
      ["list_directory", { root: rootPath, path: ".", show_hidden: false }],
      ["list_directory", { root: rootPath, path: "src", show_hidden: false }],
    ]);
  });

  it("rebuilds expanded directories during refresh", async () => {
    const srcNode = directory("/workspace/src", "src");
    const nestedNode = directory("/workspace/src/nested", "nested");
    const leafNode = file("/workspace/src/nested/file.ts", "file.ts");

    vi.mocked(invoke)
      .mockResolvedValueOnce([srcNode])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([nestedNode])
      .mockResolvedValueOnce([srcNode])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([leafNode]);

    await explorerStore.setRoot(rootPath, "local");
    await explorerStore.toggleExpand(srcNode.path);
    explorerStore.expandedPaths.add(nestedNode.path);

    await explorerStore.refreshTree();

    const listDirectoryCalls = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "list_directory");
    expect(listDirectoryCalls).toEqual([
      ["list_directory", { root: rootPath, path: ".", show_hidden: false }],
      ["list_directory", { root: rootPath, path: "src", show_hidden: false }],
      ["list_directory", { root: rootPath, path: ".", show_hidden: false }],
      ["list_directory", { root: rootPath, path: "src/nested", show_hidden: false }],
    ]);
    expect(explorerStore.root?.nodes[0].children?.[0].children).toEqual(withCollapsed([leafNode]));
  });

  it("reuses cached expanded directory contents on refresh", async () => {
    const srcNode = directory("/workspace/src", "src");
    const srcChildren = [file("/workspace/src/main.ts", "main.ts")];

    vi.mocked(invoke)
      .mockResolvedValueOnce([srcNode])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(srcChildren)
      .mockResolvedValueOnce([srcNode])
      .mockResolvedValueOnce({});

    await explorerStore.setRoot(rootPath, "local");
    await explorerStore.toggleExpand(srcNode.path);
    await explorerStore.refreshTree();

    const listDirectoryCalls = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "list_directory");

    expect(listDirectoryCalls).toEqual([
      ["list_directory", { root: rootPath, path: ".", show_hidden: false }],
      ["list_directory", { root: rootPath, path: "src", show_hidden: false }],
      ["list_directory", { root: rootPath, path: ".", show_hidden: false }],
    ]);
    expect(explorerStore.root?.nodes[0].children).toEqual(withCollapsed(srcChildren));
  });

  it("deduplicates concurrent expand fetches for the same directory", async () => {
    const srcNode = directory("/workspace/src", "src");
    let resolveChildren!: (nodes: FileNode[]) => void;
    const pendingChildren = new Promise<FileNode[]>((resolve) => {
      resolveChildren = resolve;
    });

    vi.mocked(invoke)
      .mockResolvedValueOnce([srcNode])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => pendingChildren);

    await explorerStore.setRoot(rootPath, "local");

    const firstExpand = explorerStore.toggleExpand(srcNode.path);
    const secondExpand = explorerStore.toggleExpand(srcNode.path);

    resolveChildren([file("/workspace/src/app.ts", "app.ts")]);
    await Promise.all([firstExpand, secondExpand]);

    const srcCalls = vi
      .mocked(invoke)
      .mock.calls.filter(([command, payload]) => command === "list_directory" && (payload as { path: string }).path === "src");
    expect(srcCalls).toHaveLength(1);
  });

  it("reset stops the local watcher", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await explorerStore.setRoot(rootPath, "local");
    explorerStore.reset();
    await Promise.resolve();

    expect(invoke).toHaveBeenLastCalledWith("stop_local_watcher");
  });

  it("supports remote root refresh without local watcher/git status", async () => {
    const remoteRoot = "/";
    const remoteConnectionId = "connection-1";
    const remoteNodes = [directory("/src", "src"), file("/README.md", "README.md")];
    vi.mocked(invoke).mockResolvedValueOnce(remoteNodes);

    await explorerStore.setRoot(remoteRoot, "remote", remoteConnectionId);

    const remoteCalls = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "list_remote_directory");
    expect(remoteCalls).toEqual([["list_remote_directory", {
      connection_id: remoteConnectionId,
      path: remoteRoot,
      show_hidden: false,
    }]]);
    expect(explorerStore.root?.provider).toBe("remote");
    expect(explorerStore.root?.connectionId).toBe(remoteConnectionId);
    expect(explorerStore.root?.gitStatuses).toEqual({});
  });

  it("remote toggleExpand loads children using remote list command", async () => {
    const remoteConnectionId = "connection-1";
    const srcNode = directory("/src", "src");
    vi.mocked(invoke)
      .mockResolvedValueOnce([srcNode])
      .mockResolvedValueOnce([file("/src/main.ts", "main.ts")]);

    await explorerStore.setRoot("/", "remote", remoteConnectionId);
    await explorerStore.toggleExpand(srcNode.path);

    const remoteCalls = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "list_remote_directory");
    expect(remoteCalls).toEqual([
      ["list_remote_directory", { connection_id: remoteConnectionId, path: "/", show_hidden: false }],
      ["list_remote_directory", { connection_id: remoteConnectionId, path: "/src", show_hidden: false }],
    ]);
    expect(explorerStore.root?.nodes[0].children).toEqual([file("/src/main.ts", "main.ts")]);
  });

  it("rejects remote setRoot without connection id", async () => {
    await expect(explorerStore.setRoot("/", "remote")).rejects.toThrow(
      "Remote explorer root requires a connection id."
    );
  });

  it("clears remote explorer root and shows reconnect message on disconnect", async () => {
    const remoteConnectionId = "connection-1";
    vi.mocked(invoke).mockResolvedValueOnce([directory("/src", "src")]);

    await explorerStore.setRoot("/", "remote", remoteConnectionId);
    explorerStore.selectNode("/src");
    explorerStore.handleConnectionDisconnected(remoteConnectionId);

    expect(explorerStore.root).toBeNull();
    expect(explorerStore.selectedPath).toBeNull();
    expect(explorerStore.expandedPaths.size).toBe(0);
    expect(explorerStore.error).toBe("SSH connection lost. Reconnect and reopen the remote workspace.");
  });

  it("ignores disconnect events for unrelated connections", async () => {
    const remoteConnectionId = "connection-1";
    vi.mocked(invoke).mockResolvedValueOnce([directory("/src", "src")]);

    await explorerStore.setRoot("/", "remote", remoteConnectionId);
    explorerStore.handleConnectionDisconnected("other-connection");

    expect(explorerStore.root?.provider).toBe("remote");
    expect(explorerStore.root?.connectionId).toBe(remoteConnectionId);
    expect(explorerStore.error).toBeNull();
  });
});
