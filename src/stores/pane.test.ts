import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { paneStore } from "./pane";
import { tabStore } from "./tab";
import type { SessionId } from "../types/session";

function activeTabOrThrow() {
  const tab = tabStore.activeTab;
  if (!tab) {
    throw new Error("Expected active tab");
  }

  return tab;
}

describe("pane store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tabStore.reset();

    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === "list_available_shells") {
        return [{ name: "bash", path: "/bin/bash", shell_type: "bash" }];
      }
      if (command === "get_default_shell") {
        return "bash";
      }
      return "session-default";
    });

    const createdTabId = tabStore.createTab();
    const rootPaneId = activeTabOrThrow().activePane;
    tabStore.setTerminalSessionId(createdTabId, rootPaneId, { value: "session-root" } as SessionId);
  });

  it("splitActivePane creates split and focuses new pane", async () => {
    const createdPaneId = await paneStore.splitActivePane("vertical");
    const tab = activeTabOrThrow();

    expect(createdPaneId).toBeTruthy();
    expect(tab.root.type).toBe("split");
    expect(tab.activePane).toBe(createdPaneId);
    expect(invoke).not.toHaveBeenCalledWith("create_session", expect.anything());
  });

  it("closeActivePane collapses split and closes removed session", async () => {
    await paneStore.splitActivePane("horizontal");

    const tabBeforeClose = activeTabOrThrow();
    if (tabBeforeClose.root.type !== "split" || tabBeforeClose.root.second.type !== "terminal") {
      throw new Error("Expected split with second terminal");
    }
    tabStore.setTerminalSessionId(tabBeforeClose.id, tabBeforeClose.root.second.id, { value: "session-new" } as SessionId);

    vi.clearAllMocks();

    await paneStore.closeActivePane();
    const tab = activeTabOrThrow();

    expect(tab.root.type).toBe("terminal");
    expect(invoke).toHaveBeenCalledWith("close_session", { session_id: "session-new" });
  });

  it("closePaneById closes the clicked pane directly", async () => {
    await paneStore.splitActivePane("horizontal");

    const tabBeforeClose = activeTabOrThrow();
    if (tabBeforeClose.root.type !== "split" || tabBeforeClose.root.second.type !== "terminal") {
      throw new Error("Expected split with second terminal");
    }

    const secondPaneId = tabBeforeClose.root.second.id;
    tabStore.setTerminalSessionId(tabBeforeClose.id, secondPaneId, { value: "session-clicked" } as SessionId);
    paneStore.focusPane(tabBeforeClose.root.first.id);

    vi.clearAllMocks();

    await paneStore.closePaneById(secondPaneId);
    const tab = activeTabOrThrow();

    expect(tab.root.type).toBe("terminal");
    expect(invoke).toHaveBeenCalledWith("close_session", { session_id: "session-clicked" });
  });

  it("focusPane changes active pane when pane exists", async () => {
    vi.mocked(invoke).mockResolvedValueOnce("session-new");
    await paneStore.splitActivePane("vertical");

    const tab = activeTabOrThrow();
    if (tab.root.type !== "split" || tab.root.first.type !== "terminal") {
      throw new Error("Expected split with first terminal");
    }

    paneStore.focusPane(tab.root.first.id);

    expect(activeTabOrThrow().activePane).toBe(tab.root.first.id);
  });

  it("focusDirection moves focus to adjacent pane", async () => {
    vi.mocked(invoke).mockResolvedValue("session-new");

    await paneStore.splitActivePane("vertical");
    paneStore.focusDirection("left");

    const tab = activeTabOrThrow();
    expect(tab.root.type).toBe("split");
    if (tab.root.type !== "split" || tab.root.first.type !== "terminal") {
      throw new Error("Expected split tree");
    }

    expect(tab.activePane).toBe(tab.root.first.id);
  });

  it("resizeSplit updates split ratio and clamps bounds", async () => {
    vi.mocked(invoke).mockResolvedValueOnce("session-new");
    await paneStore.splitActivePane("vertical");

    const tab = activeTabOrThrow();
    if (tab.root.type !== "split") {
      throw new Error("Expected split tree");
    }

    paneStore.resizeSplit(tab.root.id, 5);

    const resized = activeTabOrThrow();
    expect(resized.root.type).toBe("split");
    if (resized.root.type === "split") {
      expect(resized.root.ratio).toBe(0.9);
    }
  });
});
