import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { tabStore } from "./tab";
import type { SessionId } from "../types/session";

describe("tab store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tabStore.reset();
  });

  it("creates a tab", () => {
    const id = tabStore.createTab();
    expect(id).toBeDefined();
    
    const tab = tabStore.tabs.find((t) => t.id === id);
    expect(tab).toBeDefined();
    expect(tab?.title).toBe("Terminal");
    expect(tabStore.activeTabId).toBe(id);
  });

  it("switches tabs", () => {
    const id1 = tabStore.createTab();
    const id2 = tabStore.createTab();
    
    expect(tabStore.activeTabId).toBe(id2);
    
    tabStore.switchTab(id1);
    expect(tabStore.activeTabId).toBe(id1);
  });

  it("sets tab title", () => {
    const id = tabStore.createTab();
    tabStore.setTabTitle(id, "Server Logs");
    
    const tab = tabStore.tabs.find((t) => t.id === id);
    expect(tab?.title).toBe("Server Logs");
  });

  it("prevents closing the last tab", () => {
    const id = tabStore.createTab();
    const allIds = tabStore.tabs.map((t) => t.id);
    for (const tId of allIds) {
      if (tId !== id) {
        tabStore.closeTab(tId);
      }
    }
    
    expect(tabStore.tabs.length).toBe(1);
    tabStore.closeTab(id);
    expect(tabStore.tabs.length).toBe(1);
    expect(tabStore.tabs[0].id).toBe(id);
  });

  it("closes a tab and switches active tab correctly", () => {
    const id1 = tabStore.createTab();
    const id2 = tabStore.createTab();
    const id3 = tabStore.createTab();
    const allIds = tabStore.tabs.map((t) => t.id);
    for (const tId of allIds) {
      if (tId !== id1 && tId !== id2 && tId !== id3) {
        tabStore.closeTab(tId);
      }
    }
    
    tabStore.switchTab(id2);
    tabStore.closeTab(id2);
    expect(tabStore.tabs.find((t) => t.id === id2)).toBeUndefined();
    expect(tabStore.activeTabId).toBe(id1);
  });

  it("closeTab closes all non-pending pane sessions in a tab", async () => {
    const id1 = tabStore.createTab();
    const id2 = tabStore.createTab();

    tabStore.setTabPaneTree(id1, {
      type: "split",
      id: "split-1",
      direction: "vertical",
      ratio: 0.5,
      first: {
        type: "terminal",
        id: "pane-a",
        sessionId: { value: "session-a" } as SessionId,
      },
      second: {
        type: "terminal",
        id: "pane-b",
        sessionId: { value: "session-b" } as SessionId,
      },
    });

    await tabStore.closeTab(id1);

    expect(invoke).toHaveBeenCalledWith("close_session", { session_id: "session-a" });
    expect(invoke).toHaveBeenCalledWith("close_session", { session_id: "session-b" });
    expect(tabStore.tabs.find((t) => t.id === id1)).toBeUndefined();
    expect(tabStore.activeTabId).toBe(id2);
  });

  it("cycles to next and previous tabs", () => {
    tabStore.reset();
    const id1 = tabStore.createTab();
    const id2 = tabStore.createTab();
    const id3 = tabStore.createTab();

    expect(tabStore.activeTabId).toBe(id3);

    tabStore.nextTab();
    expect(tabStore.activeTabId).toBe(id1);

    tabStore.nextTab();
    expect(tabStore.activeTabId).toBe(id2);

    tabStore.prevTab();
    expect(tabStore.activeTabId).toBe(id1);

    tabStore.prevTab();
    expect(tabStore.activeTabId).toBe(id3);
  });

  it("sets default tab title based on shell", () => {
    tabStore.reset();
    const bashId = tabStore.createTab("bash");
    expect(tabStore.tabs.find(t => t.id === bashId)?.title).toBe("Bash");

    const powershellId = tabStore.createTab("powershell");
    expect(tabStore.tabs.find(t => t.id === powershellId)?.title).toBe("PowerShell");

    const cmdId = tabStore.createTab("cmd");
    expect(tabStore.tabs.find(t => t.id === cmdId)?.title).toBe("Cmd");

    const zshId = tabStore.createTab("zsh");
    expect(tabStore.tabs.find(t => t.id === zshId)?.title).toBe("Zsh");
  });
});
