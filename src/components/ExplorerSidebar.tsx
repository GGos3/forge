import { Component, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { explorerStore } from "../stores/explorer";
import { editorStore } from "../stores/editor";
import { connectionStore } from "../stores/connection";
import FileTree from "./FileTree";
import ConnectionList from "./ConnectionList";
import "../styles/explorer.css";
import "../styles/editor.css";

interface ExplorerSidebarProps {
  width: number;
}

const ExplorerSidebar: Component<ExplorerSidebarProps> = (props) => {
  const openFolder = async () => {
    try {
      const selected = await invoke<string | string[] | null>("plugin:dialog|open", {
        options: {
          directory: true,
          multiple: false,
        },
      });

      if (!selected || Array.isArray(selected)) {
        return;
      }

      await explorerStore.setRoot(selected, "local");
    } catch (error) {
      explorerStore.clearError();
      const message = error instanceof Error ? error.message : String(error);
      explorerStore.setError(message);
    }
  };

  const openNode = async (path: string) => {
    const root = explorerStore.root;
    if (!root) {
      return;
    }

    try {
      await editorStore.openFile(path, root.provider, { connectionId: root.connectionId });
      explorerStore.selectNode(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      explorerStore.setError(message);
    }
  };

  const rootContext = () => {
    const root = explorerStore.root;
    if (!root) {
      return "Root Path";
    }

    if (root.provider === "local") {
      return root.rootPath;
    }

    const activeConnection = connectionStore.activeConnections.find((conn) => conn.connectionId === root.connectionId);
    if (!activeConnection) {
      return `Remote ${root.rootPath}`;
    }

    const profile = activeConnection.profile;
    return `${profile.username}@${profile.host}:${profile.port}${root.rootPath}`;
  };

  return (
    <div 
      class="forge-explorer" 
      style={{ 
        width: `${props.width}px`,
        "--explorer-width": `${props.width}px` 
      }}
      data-testid="explorer-sidebar"
    >
      <div class="forge-explorer-header" data-testid="explorer-header">
        <span style={{ "flex-grow": 1, "font-weight": "bold", "font-size": "11px", "color": "var(--text-secondary)" }}>
          EXPLORER {explorerStore.root?.provider === "remote" ? "(REMOTE)" : "(LOCAL)"}
        </span>
        <div data-testid="explorer-root-path-placeholder" style={{ "font-size": "11px", color: "var(--text-secondary)", overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap", "max-width": "180px" }}>
          {rootContext()}
        </div>
        <button
          data-testid="explorer-open-folder-btn"
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            padding: "2px 6px",
            "font-size": "11px",
            "border-radius": "4px",
          }}
          onClick={() => {
            void openFolder();
          }}
        >
          Open Folder
        </button>
        <button 
          data-testid="explorer-close-btn"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            padding: "2px 4px",
            "font-size": "14px"
          }}
          onClick={() => explorerStore.toggleSidebar()}
        >
          ×
        </button>
      </div>
      <Show when={explorerStore.error}>
        <div class="forge-tree-error" data-testid="explorer-error-banner">
          {explorerStore.error}
        </div>
      </Show>
      <div data-testid="explorer-file-tree">
        <Show
          when={explorerStore.root}
          fallback={
            <div class="forge-tree-empty" data-testid="explorer-no-root-empty-state" style={{ padding: "12px" }}>
              <div style={{ "margin-bottom": "8px" }}>Open a folder to get started</div>
              <button
                type="button"
                class="forge-editor-button"
                data-testid="explorer-empty-open-folder-btn"
                onClick={() => {
                  void openFolder();
                }}
              >
                Open Folder
              </button>
            </div>
          }
        >
          <FileTree
            nodes={explorerStore.root?.nodes ?? []}
            selectedPath={explorerStore.selectedPath}
            expandedPaths={explorerStore.expandedPaths}
            gitStatuses={explorerStore.root?.gitStatuses}
            isLoading={explorerStore.isLoading}
            error={explorerStore.error}
            onSelect={(path) => explorerStore.selectNode(path)}
            onToggle={(path) => {
              void explorerStore.toggleExpand(path);
            }}
            onOpen={(path) => {
              void openNode(path);
            }}
          />
        </Show>
      </div>
      <div class="forge-connection-list" data-testid="explorer-connections">
        <ConnectionList />
      </div>
    </div>
  );
};

export default ExplorerSidebar;
