import { For, onCleanup, onMount, Show } from "solid-js";
import PaneContainer from "./components/PaneContainer";
import TabBar from "./components/TabBar";
import StatusBar from "./components/StatusBar";
import Sidebar from "./components/Sidebar";
import HostKeyVerificationDialog from "./components/HostKeyVerificationDialog";
import InlineEditor from "./components/InlineEditor";
import UpdaterBanner from "./components/UpdaterBanner";
import Toast from "./components/ui/Toast";
import ShortcutOverlay, { setIsShortcutOverlayOpen, isShortcutOverlayOpen } from "./components/ShortcutOverlay";
import { tabStore } from "./stores/tab";
import { paneStore } from "./stores/pane";
import { sidebarStore } from "./stores/sidebar";
import { editorStore } from "./stores/editor";
import { connectionStore, ensureHostKeyListener } from "./stores/connection";
import { settingsStore } from "./stores/settings";
import {
  getCurrentPlatform,
  getPaneFocusDirection,
  isMacPlatform,
  matchesClosePaneShortcut,
  matchesHorizontalSplitShortcut,
  matchesVerticalSplitShortcut,
  matchesToggleSidebarShortcut,
} from "./utils/platform";
import "./App.css";

function App() {
  onMount(() => {
    settingsStore.load();
    void ensureHostKeyListener();

    const platform = getCurrentPlatform();

    if (tabStore.tabs.length === 0) {
      tabStore.createTab();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const isShortcutToggle =
        e.key === "/" &&
        !e.shiftKey &&
        !e.altKey &&
        (isMacPlatform(platform) ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey);

      if (isShortcutToggle) {
        e.preventDefault();
        setIsShortcutOverlayOpen(!isShortcutOverlayOpen());
        return;
      }

      if (e.key === "Escape" && sidebarStore.isPanelOpen) {
        e.preventDefault();
        sidebarStore.closePanel();
        return;
      }

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
      <StatusBar />
      <Show when={connectionStore.pendingHostKeyVerification}>
        <HostKeyVerificationDialog onClose={handleHostKeyVerificationClose} />
      </Show>
      <ShortcutOverlay />
      <Toast />
    </main>
  );
}

export default App;
