import { Component, Match, Show, Switch } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import NavRail from "./NavRail";
import FileTree from "./FileTree";
import ConnectionList from "./ConnectionList";
import SnippetList from "./SnippetList";
import TransferPanel from "./TransferPanel";
import PortForwardPanel from "./PortForwardPanel";
import SettingsPanel from "./SettingsPanel";
import PaneDivider from "./PaneDivider";
import { sidebarStore } from "../stores/sidebar";
import { explorerStore } from "../stores/explorer";
import { editorStore } from "../stores/editor";
import { connectionStore } from "../stores/connection";

const Sidebar: Component = () => {
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
    if (!root) return;

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
    if (!root) return "No folder open";

    if (root.provider === "local") return root.rootPath;

    const activeConnection = connectionStore.activeConnections.find(
      (conn) => conn.connectionId === root.connectionId,
    );
    if (!activeConnection) return `Remote ${root.rootPath}`;

    const profile = activeConnection.profile;
    return `${profile.username}@${profile.host}:${profile.port}${root.rootPath}`;
  };

  const handlePanelResize = (ratio: number) => {
    const el = document.querySelector(".forge-sidebar-panel");
    if (!el) return;
    const parentWidth = (el.parentElement?.getBoundingClientRect().width ?? 800);
    sidebarStore.setPanelWidth(ratio * parentWidth);
  };

  return (
    <div class="forge-sidebar" data-testid="sidebar">
      <NavRail />

      <Show when={sidebarStore.isPanelOpen}>
        <div
          class="forge-sidebar-panel forge-animate-slide-in-right"
          style={{ width: `${sidebarStore.panelWidth}px` }}
          data-testid="sidebar-panel"
        >
          <Switch>
            <Match when={sidebarStore.activeSection === "explorer"}>
              <div class="forge-sidebar-panel__header">
                <span class="forge-sidebar-panel__title">
                  EXPLORER
                  <Show when={explorerStore.root}>
                    {" "}({explorerStore.root?.provider === "remote" ? "REMOTE" : "LOCAL"})
                  </Show>
                </span>
                <Show when={explorerStore.root}>
                  <span class="forge-sidebar-panel__subtitle" title={rootContext()} data-testid="explorer-root-path-placeholder">
                    {rootContext()}
                  </span>
                </Show>
                <div class="forge-sidebar-panel__actions">
                  <button
                    class="forge-sidebar-panel__action-btn"
                    data-testid="explorer-open-folder-btn"
                    title="Open Folder"
                    onClick={() => void openFolder()}
                  >
                    Open
                  </button>
                </div>
              </div>

              <Show when={explorerStore.error}>
                <div class="forge-sidebar-panel__error" data-testid="explorer-error-banner">
                  {explorerStore.error}
                </div>
              </Show>

              <div class="forge-sidebar-panel__content" data-testid="explorer-file-tree">
                <Show
                  when={explorerStore.root}
                  fallback={
                    <div class="forge-sidebar-panel__empty" data-testid="explorer-no-root-empty-state">
                      <p>Open a folder to get started</p>
                      <button
                        type="button"
                        class="forge-sidebar-panel__action-btn forge-sidebar-panel__action-btn--primary"
                        data-testid="explorer-empty-open-folder-btn"
                        onClick={() => void openFolder()}
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
                    onToggle={(path) => void explorerStore.toggleExpand(path)}
                    onOpen={(path) => void openNode(path)}
                  />
                </Show>
              </div>
            </Match>

            <Match when={sidebarStore.activeSection === "connections"}>
              <ConnectionList />
            </Match>

            <Match when={sidebarStore.activeSection === "snippets"}>
              <SnippetList />
            </Match>

            <Match when={sidebarStore.activeSection === "transfers"}>
              <TransferPanel />
            </Match>

            <Match when={sidebarStore.activeSection === "portforward"}>
              <PortForwardPanel />
            </Match>

            <Match when={sidebarStore.activeSection === "settings"}>
              <SettingsPanel />
            </Match>
          </Switch>
        </div>

        <PaneDivider
          direction="vertical"
          ratio={0}
          onRatioChange={handlePanelResize}
        />
      </Show>
    </div>
  );
};

export default Sidebar;
