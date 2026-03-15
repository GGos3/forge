import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { VsTerminalLinux } from "solid-icons/vs";
import { tabStore } from "../stores/tab";
import { dragStore, FORGE_TAB_MIME } from "../stores/drag";
import NewTabDialog from "./NewTabDialog";
import type { ShellType } from "../types/session";
import type { TabId } from "../types/tab";
import {
  getCloseTabShortcutLabel,
  getCurrentPlatform,
  getNewTabShortcutLabel,
  getTabIndexFromShortcut,
  matchesCloseTabShortcut,
  matchesNewTabShortcut,
  matchesNextTabShortcut,
  matchesPrevTabShortcut,
  shouldHandleGlobalShortcuts,
} from "../utils/platform";

export default function TabBar() {
  const [showNewTabDialog, setShowNewTabDialog] = createSignal(false);
  const [dragTabId, setDragTabId] = createSignal<TabId | null>(null);
  const [dragOverTabId, setDragOverTabId] = createSignal<TabId | null>(null);
  const platform = getCurrentPlatform();
  const closeTabShortcutLabel = getCloseTabShortcutLabel(platform);
  const newTabShortcutLabel = getNewTabShortcutLabel(platform);

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!shouldHandleGlobalShortcuts()) {
        return;
      }

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

  const handleDragStart = (tabId: TabId, e: DragEvent) => {
    setDragTabId(tabId);
    dragStore.startDrag({ type: "tab", tabId });
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", tabId);
      e.dataTransfer.setData(FORGE_TAB_MIME, tabId);
    }
  };

  const handleDragOver = (tabId: TabId, e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    if (dragTabId() && dragTabId() !== tabId) {
      setDragOverTabId(tabId);
    }
  };

  const handleDragLeave = () => {
    setDragOverTabId(null);
  };

  const handleDrop = (targetTabId: TabId, e: DragEvent) => {
    e.preventDefault();
    const sourceTabId = dragTabId();
    if (!sourceTabId || sourceTabId === targetTabId) return;

    const fromIndex = tabStore.tabs.findIndex((t) => t.id === sourceTabId);
    const toIndex = tabStore.tabs.findIndex((t) => t.id === targetTabId);

    if (fromIndex >= 0 && toIndex >= 0) {
      tabStore.reorderTab(fromIndex, toIndex);
    }

    setDragTabId(null);
    setDragOverTabId(null);
  };

  const handleDragEnd = () => {
    setDragTabId(null);
    setDragOverTabId(null);
    dragStore.endDrag();
  };

  const cancelInteractiveDrag = (e: MouseEvent | PointerEvent | DragEvent) => {
    e.stopPropagation();
    if ("preventDefault" in e) {
      e.preventDefault();
    }
  };

  return (
    <>
      <div class="forge-tab-bar" data-testid="tab-bar">
        <div class="forge-tab-bar__tabs">
          <For each={tabStore.tabs}>
            {(tab) => (
              <div
                class="forge-tab"
                classList={{
                  "forge-tab--dragging": dragTabId() === tab.id,
                  "forge-tab--drag-over": dragOverTabId() === tab.id,
                }}
                data-testid={`tab-${tab.id}`}
                data-active={tabStore.activeTabId === tab.id}
                draggable={true}
                onClick={() => tabStore.switchTab(tab.id)}
                onDragStart={(e) => handleDragStart(tab.id, e)}
                onDragOver={(e) => handleDragOver(tab.id, e)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(tab.id, e)}
                onDragEnd={handleDragEnd}
              >
                <span class="forge-tab__icon">
                  <VsTerminalLinux size={14} />
                </span>
                <span class="forge-tab-title">
                  {tab.title}
                </span>
                <button
                  class="forge-tab-close"
                  data-testid={`close-tab-${tab.id}`}
                  draggable={false}
                  onPointerDown={cancelInteractiveDrag}
                  onMouseDown={cancelInteractiveDrag}
                  onDragStart={cancelInteractiveDrag}
                  onClick={(e) => {
                    e.stopPropagation();
                    void tabStore.closeTab(tab.id);
                  }}
                  title={`Close Tab (${closeTabShortcutLabel})`}
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
                    <line x1="2" y1="2" x2="10" y2="10" />
                    <line x1="10" y1="2" x2="2" y2="10" />
                  </svg>
                </button>
              </div>
            )}
          </For>
        </div>
        <button
          class="forge-tab-new"
          data-testid="new-tab-button"
          onClick={() => setShowNewTabDialog(true)}
          title={`New Tab (${newTabShortcutLabel})`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
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
