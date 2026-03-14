import { For, onCleanup, onMount, Show } from "solid-js";
import PaneContainer from "./components/PaneContainer";
import TabBar from "./components/TabBar";
import Sidebar from "./components/Sidebar";
import HostKeyVerificationDialog from "./components/HostKeyVerificationDialog";
import InlineEditor from "./components/InlineEditor";
import UpdaterBanner from "./components/UpdaterBanner";
import { tabStore } from "./stores/tab";
import { paneStore } from "./stores/pane";
import { sidebarStore } from "./stores/sidebar";
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
        sidebarStore.togglePanel();
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

  const handleHostKeyVerificationClose = () => {
    connectionStore.clearPendingHostKeyVerification();
  };

  const saveBuffer = async (nextContent: string) => {
    editorStore.updateContent(nextContent);
    try {
      await editorStore.saveFile();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Save failed:", message);
    }
  };

  return (
    <main class="forge-app">
      <UpdaterBanner />
      <TabBar />
      <div class="forge-main-content" style={{ display: "flex", flex: 1, height: "100%", width: "100%", overflow: "hidden" }}>
        <Sidebar />
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
