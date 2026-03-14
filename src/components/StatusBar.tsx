import { Component, Show } from "solid-js";
import { VsTerminalLinux } from "solid-icons/vs";
import { tabStore } from "../stores/tab";
import type { TerminalPane } from "../types/pane";

const StatusBar: Component = () => {
  const activeShellType = () => {
    const tab = tabStore.activeTab;
    if (!tab) return null;

    if (tab.root.type === "terminal") {
      return (tab.root as TerminalPane).shell ?? null;
    }

    return null;
  };

  const shellLabel = () => {
    const shell = activeShellType();
    if (!shell) return "Terminal";
    switch (shell) {
      case "powershell":
        return "PowerShell";
      case "cmd":
        return "Cmd";
      default:
        return shell.charAt(0).toUpperCase() + shell.slice(1);
    }
  };

  const tabCount = () => tabStore.tabs.length;

  const activeTabIndex = () => {
    const id = tabStore.activeTabId;
    if (!id) return 0;
    const idx = tabStore.tabs.findIndex((t) => t.id === id);
    return idx >= 0 ? idx + 1 : 0;
  };

  return (
    <div class="forge-status-bar" data-testid="status-bar">
      <div class="forge-status-bar__section">
        <span class="forge-status-bar__icon">
          <VsTerminalLinux size={12} />
        </span>
        <span class="forge-status-bar__label" data-testid="status-bar-shell">
          {shellLabel()}
        </span>
      </div>

      <div class="forge-status-bar__separator" />

      <Show when={tabCount() > 1}>
        <div class="forge-status-bar__section">
          <span class="forge-status-bar__label" data-testid="status-bar-tab-info">
            Tab {activeTabIndex()}/{tabCount()}
          </span>
        </div>
      </Show>

      <div class="forge-status-bar__right">
        <div class="forge-status-bar__section">
          <span class="forge-status-bar__label" data-testid="status-bar-channel">
            Forge
          </span>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
