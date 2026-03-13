import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { tabStore } from "../stores/tab";
import NewTabDialog from "./NewTabDialog";
import type { ShellType } from "../types/session";
import {
  getCloseTabShortcutLabel,
  getCurrentPlatform,
  getNewTabShortcutLabel,
  getTabIndexFromShortcut,
  matchesCloseTabShortcut,
  matchesNewTabShortcut,
  matchesNextTabShortcut,
  matchesPrevTabShortcut,
} from "../utils/platform";

export default function TabBar() {
  const [showNewTabDialog, setShowNewTabDialog] = createSignal(false);
  const platform = getCurrentPlatform();
  const closeTabShortcutLabel = getCloseTabShortcutLabel(platform);
  const newTabShortcutLabel = getNewTabShortcutLabel(platform);

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesNewTabShortcut(e, platform)) {
        e.preventDefault();
        setShowNewTabDialog(true);
        return;
      }

      if (matchesCloseTabShortcut(e, platform)) {
        const activeTab = tabStore.activeTab;
        if (activeTab && activeTab.root.type === "terminal") {
          e.preventDefault();
          void tabStore.closeTab(activeTab.id);
        }
        return;
      }

      if (matchesNextTabShortcut(e, platform)) {
        e.preventDefault();
        tabStore.nextTab();
        return;
      }

      if (matchesPrevTabShortcut(e, platform)) {
        e.preventDefault();
        tabStore.prevTab();
        return;
      }

      const tabIndex = getTabIndexFromShortcut(e, platform);
      if (tabIndex !== null) {
        e.preventDefault();
        if (tabIndex >= 0 && tabIndex < tabStore.tabs.length) {
          tabStore.switchTab(tabStore.tabs[tabIndex].id);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

  const handleCreateTab = (shell?: ShellType) => {
    tabStore.createTab(shell);
    setShowNewTabDialog(false);
  };

  return (
    <>
      <div class="forge-tab-bar" data-testid="tab-bar">
        <For each={tabStore.tabs}>
          {(tab) => (
            <div
              class="forge-tab"
              data-testid={`tab-${tab.id}`}
              data-active={tabStore.activeTabId === tab.id}
              onClick={() => tabStore.switchTab(tab.id)}
            >
              <span class="forge-tab-title">
                {tab.title}
              </span>
              <button
                class="forge-tab-close"
                data-testid={`close-tab-${tab.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void tabStore.closeTab(tab.id);
                }}
                title={`Close Tab (${closeTabShortcutLabel})`}
              >
                ✕
              </button>
            </div>
          )}
        </For>
        <button
          class="forge-tab-new"
          data-testid="new-tab-button"
          onClick={() => setShowNewTabDialog(true)}
          title={`New Tab (${newTabShortcutLabel})`}
        >
          +
        </button>
      </div>

      <Show when={showNewTabDialog()}>
        <NewTabDialog
          onSelect={(shell) => handleCreateTab(shell)}
          onClose={() => setShowNewTabDialog(false)}
        />
      </Show>
    </>
  );
}
