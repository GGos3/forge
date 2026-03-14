import { render, fireEvent, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, beforeEach, vi } from "vitest";
import TabBar from "./TabBar";
import { tabStore } from "../stores/tab";
import { shellStore } from "../stores/shell";
import type { ShellType } from "../types/session";
import type { SessionId } from "../types/session";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("TabBar", () => {
  const setNavigatorPlatform = (platform: string) => {
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: platform,
    });
  };

  beforeEach(() => {
    setNavigatorPlatform("MacIntel");
    tabStore.reset();
    shellStore.reset();
    vi.mocked(invoke).mockClear();
  });

  it("renders the tabs from the store", async () => {
    const id1 = tabStore.createTab();
    const id2 = tabStore.createTab();

    const { getByTestId, getAllByText } = render(() => <TabBar />);

    const tab1 = getByTestId(`tab-${id1}`);
    const tab2 = getByTestId(`tab-${id2}`);
    expect(tab1).toBeTruthy();
    expect(tab2).toBeTruthy();
    expect(getAllByText("Terminal")).toHaveLength(2);
  });

  it("adds a new tab when new tab button is clicked", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "list_available_shells") {
        return [{ name: "Bash", shell_type: "bash" as ShellType, path: "/bin/bash" }];
      }
      if (cmd === "get_default_shell") {
        return "bash";
      }
      return undefined;
    });

    const { getByTestId } = render(() => <TabBar />);
    
    expect(tabStore.tabs.length).toBe(0);

    const newTabButton = getByTestId("new-tab-button");
    fireEvent.click(newTabButton);

    await waitFor(() => {
      expect(getByTestId("new-tab-dialog")).toBeTruthy();
    });

    await waitFor(() => {
      expect(getByTestId("shell-option-bash")).toBeTruthy();
    });

    const shellOption = getByTestId("shell-option-bash");
    fireEvent.click(shellOption);

    expect(tabStore.tabs.length).toBe(1);
    expect(tabStore.tabs[0].root.type).toBe("terminal");
    if (tabStore.tabs[0].root.type === "terminal") {
      expect(tabStore.tabs[0].root.shell).toBe("bash");
    }
  });

  it("closes a tab when close button is clicked", () => {
    const id1 = tabStore.createTab();
    const id2 = tabStore.createTab();

    expect(tabStore.tabs.length).toBe(2);

    const { getByTestId } = render(() => <TabBar />);
    
    const closeBtn = getByTestId(`close-tab-${id1}`);
    fireEvent.click(closeBtn);

    expect(tabStore.tabs.length).toBe(1);
    expect(tabStore.tabs[0].id).toBe(id2);
  });

  it("switches tabs when clicked", () => {
    const id1 = tabStore.createTab();
    const id2 = tabStore.createTab();

    expect(tabStore.activeTabId).toBe(id2);

    const { getByTestId } = render(() => <TabBar />);
    
    const tab1 = getByTestId(`tab-${id1}`);
    fireEvent.click(tab1);

    expect(tabStore.activeTabId).toBe(id1);
  });

  it("handles keyboard shortcuts", async () => {
    const { getByTestId } = render(() => <TabBar />);

    fireEvent.keyDown(document, { key: "t", metaKey: true });
    
    await waitFor(() => {
      expect(getByTestId("new-tab-dialog")).toBeTruthy();
    });

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      const dialog = document.querySelector('[data-testid="new-tab-dialog"]');
      expect(dialog).toBeNull();
    });

    const id1 = tabStore.createTab();
    const id2 = tabStore.createTab();
    expect(tabStore.activeTabId).toBe(id2);

    fireEvent.keyDown(document, { key: "1", metaKey: true });
    expect(tabStore.activeTabId).toBe(id1);

    fireEvent.keyDown(document, { key: "w", metaKey: true });
    expect(tabStore.tabs.length).toBe(1);
    expect(tabStore.tabs[0].id).toBe(id2);
  });

  it("uses Alt+digit tab switching on Windows/Linux", () => {
    setNavigatorPlatform("Win32");

    const id1 = tabStore.createTab();
    const id2 = tabStore.createTab();
    expect(tabStore.activeTabId).toBe(id2);

    render(() => <TabBar />);

    fireEvent.keyDown(document, { key: "1", ctrlKey: true });
    expect(tabStore.activeTabId).toBe(id2);

    fireEvent.keyDown(document, { key: "1", altKey: true });
    expect(tabStore.activeTabId).toBe(id1);
  });

  it("Mod+W closes tab only when root is a single terminal pane (no splits)", () => {
    const id1 = tabStore.createTab();
    const id2 = tabStore.createTab();

    tabStore.switchTab(id1);
    expect(tabStore.activeTabId).toBe(id1);
    expect(tabStore.activeTab?.root.type).toBe("terminal");

    render(() => <TabBar />);

    fireEvent.keyDown(document, { key: "w", metaKey: true });
    expect(tabStore.tabs.length).toBe(1);
    expect(tabStore.tabs[0].id).toBe(id2);
  });

  it("handles next and prev tab shortcuts on Mac", () => {
    setNavigatorPlatform("MacIntel");
    const id1 = tabStore.createTab();
    const id2 = tabStore.createTab();
    const id3 = tabStore.createTab();

    expect(tabStore.activeTabId).toBe(id3);

    render(() => <TabBar />);

    fireEvent.keyDown(document, { key: "[", metaKey: true, shiftKey: true });
    expect(tabStore.activeTabId).toBe(id2);

    fireEvent.keyDown(document, { key: "]", metaKey: true, shiftKey: true });
    expect(tabStore.activeTabId).toBe(id3);

    fireEvent.keyDown(document, { key: "]", metaKey: true, shiftKey: true });
    expect(tabStore.activeTabId).toBe(id1);

    fireEvent.keyDown(document, { key: "[", metaKey: true, shiftKey: true });
    expect(tabStore.activeTabId).toBe(id3);
  });

  it("handles next and prev tab shortcuts on Windows/Linux", () => {
    setNavigatorPlatform("Win32");
    const id1 = tabStore.createTab();
    const id2 = tabStore.createTab();
    const id3 = tabStore.createTab();

    expect(tabStore.activeTabId).toBe(id3);

    render(() => <TabBar />);

    fireEvent.keyDown(document, { key: "Tab", ctrlKey: true, shiftKey: true });
    expect(tabStore.activeTabId).toBe(id2);

    fireEvent.keyDown(document, { key: "Tab", ctrlKey: true, shiftKey: false });
    expect(tabStore.activeTabId).toBe(id3);

    fireEvent.keyDown(document, { key: "Tab", ctrlKey: true, shiftKey: false });
    expect(tabStore.activeTabId).toBe(id1);
  });

  it("Mod+W does not close tab when root is a split pane", () => {
    const id1 = tabStore.createTab();
    tabStore.switchTab(id1);

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

    expect(tabStore.activeTab?.root.type).toBe("split");

    render(() => <TabBar />);

    fireEvent.keyDown(document, { key: "w", metaKey: true });
    expect(tabStore.tabs.length).toBe(1);
  });

  it("reorders tabs via drag and drop", () => {
    const id1 = tabStore.createTab();
    const id2 = tabStore.createTab();
    const id3 = tabStore.createTab();

    expect(tabStore.tabs.map((t) => t.id)).toEqual([id1, id2, id3]);

    const { getByTestId } = render(() => <TabBar />);

    const tab1 = getByTestId(`tab-${id1}`);
    const tab3 = getByTestId(`tab-${id3}`);

    fireEvent.dragStart(tab1, { dataTransfer: { effectAllowed: "", setData: () => {} } });
    fireEvent.dragOver(tab3, { dataTransfer: { dropEffect: "" } });
    fireEvent.drop(tab3, { dataTransfer: {} });
    fireEvent.dragEnd(tab1);

    expect(tabStore.tabs.map((t) => t.id)).toEqual([id2, id3, id1]);
  });

  it("renders tabs as draggable", () => {
    const id1 = tabStore.createTab();
    const { getByTestId } = render(() => <TabBar />);

    const tab = getByTestId(`tab-${id1}`);
    expect(tab.getAttribute("draggable")).toBe("true");
  });
});
