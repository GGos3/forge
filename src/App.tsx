import { For, onCleanup, onMount, Show } from "solid-js";
import PaneContainer from "./components/PaneContainer";
import TabBar from "./components/TabBar";
import ExplorerSidebar from "./components/ExplorerSidebar";
import PaneDivider from "./components/PaneDivider";
import HostKeyVerificationDialog from "./components/HostKeyVerificationDialog";
import InlineEditor from "./components/InlineEditor";
import UpdaterBanner from "./components/UpdaterBanner";
import { tabStore } from "./stores/tab";
import { paneStore } from "./stores/pane";
import { explorerStore } from "./stores/explorer";
import { editorStore } from "./stores/editor";
import { connectionStore, ensureHostKeyListener } from "./stores/connection";
import {
  getCurrentPlatform,
  getPaneFocusDirection,
  matchesClosePaneShortcut,
  matchesHorizontalSplitShortcut,
  matchesVerticalSplitShortcut,
  matchesToggleSidebarShortcut,
} from "./utils/platform";
import "./App.css";

function App() {
  onMount(() => {
    void ensureHostKeyListener();

    const platform = getCurrentPlatform();

    if (tabStore.tabs.length === 0) {
      tabStore.createTab();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesToggleSidebarShortcut(e, platform)) {
        e.preventDefault();
        explorerStore.toggleSidebar();
        return;
      }

      if (matchesVerticalSplitShortcut(e, platform)) {
        e.preventDefault();
        void paneStore.splitActivePane("vertical");
        return;
      }

      if (matchesHorizontalSplitShortcut(e, platform)) {
        e.preventDefault();
        void paneStore.splitActivePane("horizontal");
        return;
      }

      if (matchesClosePaneShortcut(e, platform)) {
        const activeTab = tabStore.activeTab;
        if (activeTab && activeTab.root.type === "split") {
          e.preventDefault();
          void paneStore.closeActivePane();
        }

        return;
      }

      const focusDirection = getPaneFocusDirection(e);
      if (focusDirection) {
        e.preventDefault();
        paneStore.focusDirection(focusDirection);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  const handleSidebarResize = (ratio: number) => {
    const mainContent = document.querySelector(".forge-main-content");
    if (!mainContent) return;
    const parentWidth = mainContent.getBoundingClientRect().width;
    explorerStore.setSidebarWidth(ratio * parentWidth);
  };

  const handleHostKeyVerificationClose = () => {
    connectionStore.clearPendingHostKeyVerification();
  };

  const saveBuffer = async (nextContent: string) => {
    editorStore.updateContent(nextContent);
    try {
      await editorStore.saveFile();
      explorerStore.clearError();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      explorerStore.setError(message);
    }
  };

  return (
    <main class="forge-app">
      <UpdaterBanner />
      <TabBar />
      <div class="forge-main-content" style={{ display: "flex", flex: 1, height: "100%", width: "100%", overflow: "hidden" }}>
        <Show when={explorerStore.isVisible}>
          <ExplorerSidebar width={explorerStore.width} />
          <PaneDivider 
            direction="vertical" 
            ratio={0} 
            onRatioChange={handleSidebarResize} 
          />
        </Show>
        <div class="forge-viewport">
          <Show when={editorStore.activeBuffer}>
            {(buffer) => (
              <InlineEditor
                content={buffer().content}
                filePath={buffer().filePath}
                language={buffer().language}
                isReadOnly={buffer().isReadOnly}
                isConnectionLost={buffer().isConnectionLost}
                isDirty={buffer().isDirty}
                onChange={(content) => editorStore.updateContent(content)}
                onSave={(content) => {
                  void saveBuffer(content);
                }}
                onClose={() => editorStore.closeFile()}
              />
            )}
          </Show>
          <For each={tabStore.tabs}>
            {(tab) => (
              <div
                class="forge-tab-panel"
                style={{
                  display: tabStore.activeTabId === tab.id ? "block" : "none",
                }}
              >
                <PaneContainer tabId={tab.id} node={tab.root} />
              </div>
            )}
          </For>
        </div>
      </div>
      <Show when={connectionStore.pendingHostKeyVerification}>
        <HostKeyVerificationDialog onClose={handleHostKeyVerificationClose} />
      </Show>
    </main>
  );
}

export default App;
