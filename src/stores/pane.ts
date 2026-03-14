import { invoke } from "@tauri-apps/api/core";
import {
  closePane,
  findPane,
  getAdjacentPane,
  getAllTerminalPanes,
  resizePane,
  splitPane,
} from "../models/pane-tree";
import { sessionStore } from "./session";
import { tabStore } from "./tab";
import type { PaneId, PaneNode, SplitDirection } from "../types/pane";
import type { SessionId } from "../types/session";

type FocusDirection = "up" | "down" | "left" | "right";

function getRemovedTerminalSessionIds(before: PaneNode, after: PaneNode | null): SessionId[] {
  const beforeTerminalById = new Map(
    getAllTerminalPanes(before)
      .filter((pane): pane is Extract<PaneNode, { type: "terminal" }> => pane.type === "terminal")
      .map((pane) => [pane.id, pane.sessionId])
  );

  const afterIds = new Set(
    after
      ? getAllTerminalPanes(after)
          .filter((pane): pane is Extract<PaneNode, { type: "terminal" }> => pane.type === "terminal")
          .map((pane) => pane.id)
      : []
  );

  return [...beforeTerminalById.entries()]
    .filter(([id]) => !afterIds.has(id))
    .map(([, sessionId]) => sessionId);
}

function isPendingSessionId(sessionId: SessionId): boolean {
  return sessionId.value.startsWith("pending-session-");
}

export const paneStore = {
  get activeTab() {
    return tabStore.activeTab;
  },

  get activeTree() {
    return tabStore.activeTab?.root ?? null;
  },

  get activePaneId() {
    return tabStore.activeTab?.activePane ?? null;
  },

  async splitActivePane(direction: SplitDirection): Promise<PaneId | null> {
    const activeTab = tabStore.activeTab;
    if (!activeTab) {
      return null;
    }

    const beforeIds = new Set(getAllTerminalPanes(activeTab.root).map((pane) => pane.id));
    const nextTree = splitPane(activeTab.root, activeTab.activePane, direction);
    if (nextTree === activeTab.root) {
      return null;
    }

    const insertedPane = getAllTerminalPanes(nextTree).find((pane) => !beforeIds.has(pane.id));
    if (!insertedPane || insertedPane.type !== "terminal") {
      tabStore.setTabPaneTree(activeTab.id, nextTree, activeTab.activePane);
      return null;
    }

    tabStore.setTabPaneTree(activeTab.id, nextTree, insertedPane.id);
    return insertedPane.id;
  },

  async closeActivePane(): Promise<void> {
    const activeTab = tabStore.activeTab;
    if (!activeTab) {
      return;
    }

    const nextTree = closePane(activeTab.root, activeTab.activePane);
    if (!nextTree) {
      await tabStore.closeTab(activeTab.id);
      return;
    }

    const removedSessions = getRemovedTerminalSessionIds(activeTab.root, nextTree);

    for (const sessionId of removedSessions.filter((id) => !isPendingSessionId(id))) {
      await invoke("close_session", { sessionId: sessionId.value });
      sessionStore.removeSession(sessionId);
    }

    const terminals = getAllTerminalPanes(nextTree);
    const nextActivePane = terminals[0]?.id ?? activeTab.activePane;
    tabStore.setTabPaneTree(activeTab.id, nextTree, nextActivePane);
  },

  async closePaneById(id: PaneId): Promise<void> {
    const activeTab = tabStore.activeTab;
    if (!activeTab) {
      return;
    }

    if (!findPane(activeTab.root, id)) {
      return;
    }

    const nextTree = closePane(activeTab.root, id);
    if (!nextTree) {
      await tabStore.closeTab(activeTab.id);
      return;
    }

    const removedSessions = getRemovedTerminalSessionIds(activeTab.root, nextTree);

    for (const sessionId of removedSessions.filter((session) => !isPendingSessionId(session))) {
      await invoke("close_session", { sessionId: sessionId.value });
      sessionStore.removeSession(sessionId);
    }

    const terminals = getAllTerminalPanes(nextTree);
    const nextActivePane = terminals[0]?.id ?? activeTab.activePane;
    tabStore.setTabPaneTree(activeTab.id, nextTree, nextActivePane);
  },

  focusPane(id: PaneId): void {
    const activeTab = tabStore.activeTab;
    if (!activeTab) {
      return;
    }

    if (!findPane(activeTab.root, id)) {
      return;
    }

    tabStore.setActivePane(activeTab.id, id);
  },

  focusDirection(direction: FocusDirection): void {
    const activeTab = tabStore.activeTab;
    if (!activeTab) {
      return;
    }

    const adjacentPaneId = getAdjacentPane(activeTab.root, activeTab.activePane, direction);
    if (!adjacentPaneId) {
      return;
    }

    tabStore.setActivePane(activeTab.id, adjacentPaneId);
  },

  resizeSplit(splitId: PaneId, ratio: number): void {
    const activeTab = tabStore.activeTab;
    if (!activeTab) {
      return;
    }

    const nextTree = resizePane(activeTab.root, splitId, ratio);
    if (nextTree === activeTab.root) {
      return;
    }

    tabStore.setTabPaneTree(activeTab.id, nextTree);
  },
};
