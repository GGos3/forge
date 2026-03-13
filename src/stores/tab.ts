import { createStore, produce } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";
import type { Tab, TabId } from "../types/tab";
import type { PaneId, TerminalPane } from "../types/pane";
import type { SessionId, ShellType } from "../types/session";
import { getAllTerminalPanes, updateTerminalPaneSessionId } from "../models/pane-tree";
import { sessionStore } from "./session";

export interface TabState {
  tabs: Tab[];
  activeTabId: TabId | null;
}

const [state, setState] = createStore<TabState>({
  tabs: [],
  activeTabId: null,
});

function getDefaultTabTitle(shell?: ShellType): string {
  if (!shell) return "Terminal";
  switch (shell) {
    case "powershell":
      return "PowerShell";
    case "cmd":
      return "Cmd";
    default:
      return shell.charAt(0).toUpperCase() + shell.slice(1);
  }
}

function isPendingSessionId(sessionId: SessionId): boolean {
  return sessionId.value.startsWith("pending-session-");
}

export const tabStore = {
  get tabs() {
    return state.tabs;
  },

  get activeTabId() {
    return state.activeTabId;
  },

  get activeTab() {
    if (!state.activeTabId) {
      return null;
    }

    return state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
  },

  reset() {
    setState({
      tabs: [],
      activeTabId: null,
    });
  },

  createTab(shell?: ShellType) {
    const newTabId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const newPaneId = `pane-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    const rootPane: TerminalPane = {
      type: "terminal",
      id: newPaneId,
      sessionId: { value: `pending-session-${newPaneId}` } as SessionId,
      shell,
    };

    const newTab: Tab = {
      id: newTabId,
      title: getDefaultTabTitle(shell),
      root: rootPane,
      activePane: newPaneId,
    };

    setState(
      produce((s) => {
        s.tabs.push(newTab);
        s.activeTabId = newTabId;
      })
    );

    return newTabId;
  },

  async closeTab(id: TabId) {
    const tab = state.tabs.find((entry) => entry.id === id);
    if (!tab || state.tabs.length === 1) {
      return;
    }

    const sessionIds = [...new Set(
      getAllTerminalPanes(tab.root)
        .filter((pane): pane is TerminalPane => pane.type === "terminal")
        .map((pane) => pane.sessionId)
        .filter((sessionId) => !isPendingSessionId(sessionId))
    )];

    for (const sessionId of sessionIds) {
      await invoke("close_session", { session_id: sessionId.value });
      sessionStore.removeSession(sessionId);
    }

    setState(
      produce((s) => {
        const index = s.tabs.findIndex((t) => t.id === id);
        if (index === -1) return;

        if (s.tabs.length === 1) {
          return;
        }

        s.tabs.splice(index, 1);

        if (s.activeTabId === id) {
          const newActiveIndex = index > 0 ? index - 1 : 0;
          s.activeTabId = s.tabs[newActiveIndex].id;
        }
      })
    );
  },

  switchTab(id: TabId) {
    setState("activeTabId", id);
  },

  nextTab() {
    setState((s) => {
      if (s.tabs.length <= 1) return s;
      const index = s.tabs.findIndex((t) => t.id === s.activeTabId);
      if (index === -1) return s;
      const nextIndex = (index + 1) % s.tabs.length;
      return { activeTabId: s.tabs[nextIndex].id };
    });
  },

  prevTab() {
    setState((s) => {
      if (s.tabs.length <= 1) return s;
      const index = s.tabs.findIndex((t) => t.id === s.activeTabId);
      if (index === -1) return s;
      const prevIndex = (index - 1 + s.tabs.length) % s.tabs.length;
      return { activeTabId: s.tabs[prevIndex].id };
    });
  },

  setTabTitle(id: TabId, title: string) {
    setState("tabs", (t) => t.id === id, "title", title);
  },

  setTerminalSessionId(tabId: TabId, paneId: PaneId, sessionId: SessionId) {
    setState(
      produce((s) => {
        const tab = s.tabs.find((entry) => entry.id === tabId);
        if (!tab) {
          return;
        }

        tab.root = updateTerminalPaneSessionId(tab.root, paneId, sessionId);
      })
    );
  },

  setTabPaneTree(tabId: TabId, root: Tab["root"], activePane?: PaneId) {
    setState(
      produce((s) => {
        const tab = s.tabs.find((entry) => entry.id === tabId);
        if (!tab) {
          return;
        }

        tab.root = root;
        if (activePane) {
          tab.activePane = activePane;
        }
      })
    );
  },

  setActivePane(tabId: TabId, paneId: PaneId) {
    setState(
      produce((s) => {
        const tab = s.tabs.find((entry) => entry.id === tabId);
        if (!tab) {
          return;
        }

        tab.activePane = paneId;
      })
    );
  },
};
