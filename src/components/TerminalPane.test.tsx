import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createComponent } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shellStore } from "../stores/shell";
import { tabStore } from "../stores/tab";
import { paneStore } from "../stores/pane";
import type { SessionId } from "../types/session";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("./Terminal", () => ({
  default: (props: {
    sessionId: { value: string };
    focused: boolean;
    onLastCommand?: (command: string, isRunning: boolean) => void;
  }) => {
    props.onLastCommand?.("", false);
    const element = document.createElement("div");
    element.setAttribute("data-testid", "mock-terminal");
    element.setAttribute("data-focused", String(props.focused));
    element.setAttribute("data-session-id", props.sessionId.value);
    return element;
  },
}));

import { invoke } from "@tauri-apps/api/core";
import TerminalPane from "./TerminalPane";

describe("TerminalPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shellStore.reset();
    tabStore.reset();
  });

  it("creates a session only for pending pane sessions and renders terminal", async () => {
    const tabId = tabStore.createTab();
    const paneId = tabStore.activeTab?.activePane;
    if (!paneId) {
      throw new Error("Expected root pane id");
    }

    vi.mocked(invoke)
      .mockResolvedValueOnce([{ name: "bash", path: "/bin/bash", shell_type: "bash" }])
      .mockResolvedValueOnce("bash")
      .mockResolvedValueOnce("session-123");

    const { unmount } = render(() =>
      createComponent(TerminalPane, { tabId, paneId, focused: true, showHeader: false })
    );

    expect(screen.getByText("Starting terminal...")).toBeDefined();

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("create_session", {
      config: { shell: "bash" },
    }));

    const terminal = await screen.findByTestId("mock-terminal");
    expect(terminal.getAttribute("data-session-id")).toBe("session-123");
    expect(terminal.getAttribute("data-focused")).toBe("true");

    unmount();
  });

  it("does not create a new session when pane already has a real session id", async () => {
    const tabId = tabStore.createTab();
    const paneId = tabStore.activeTab?.activePane;
    if (!paneId) {
      throw new Error("Expected root pane id");
    }
    tabStore.setTerminalSessionId(tabId, paneId, { value: "session-existing" } as SessionId);

    render(() =>
      createComponent(TerminalPane, { tabId, paneId, focused: false, showHeader: false })
    );

    const terminal = await screen.findByTestId("mock-terminal");
    expect(terminal.getAttribute("data-session-id")).toBe("session-existing");
    expect(invoke).not.toHaveBeenCalledWith("create_session", expect.anything());
  });

  it("shows an error when pane cannot be found", async () => {
    const tabId = tabStore.createTab();

    render(() =>
      createComponent(TerminalPane, { tabId, paneId: "missing-pane", focused: false, showHeader: false })
    );

    await waitFor(() => {
      expect(screen.getByText("Terminal pane not found")).toBeDefined();
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("renders pane close button and closes the clicked pane directly", async () => {
    const closePaneById = vi.spyOn(paneStore, "closePaneById").mockResolvedValue();

    const tabId = tabStore.createTab();
    const paneId = tabStore.activeTab?.activePane;
    if (!paneId) {
      throw new Error("Expected root pane id");
    }

    tabStore.setTerminalSessionId(tabId, paneId, { value: "session-existing" } as SessionId);

    render(() => createComponent(TerminalPane, { tabId, paneId, focused: false, showHeader: true }));

    const closeButton = await screen.findByTestId(`close-pane-${paneId}`);
    fireEvent.click(closeButton);

    expect(closePaneById).toHaveBeenCalledWith(paneId);
  });
});
