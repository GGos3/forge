import { For, onCleanup, onMount } from "solid-js";
import PaneContainer from "./components/PaneContainer";
import TabBar from "./components/TabBar";
import { tabStore } from "./stores/tab";
import { paneStore } from "./stores/pane";
import {
  getCurrentPlatform,
  getPaneFocusDirection,
  matchesClosePaneShortcut,
  matchesHorizontalSplitShortcut,
  matchesVerticalSplitShortcut,
} from "./utils/platform";
import "./App.css";

function App() {
  onMount(() => {
    const platform = getCurrentPlatform();

    if (tabStore.tabs.length === 0) {
      tabStore.createTab();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
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

  return (
    <main class="forge-app">
      <TabBar />
      <div class="forge-viewport">
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
    </main>
  );
}

export default App;
