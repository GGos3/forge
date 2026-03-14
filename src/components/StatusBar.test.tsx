import { render, screen } from "@solidjs/testing-library";
import { describe, it, expect, beforeEach, vi } from "vitest";
import StatusBar from "./StatusBar";
import { tabStore } from "../stores/tab";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("StatusBar", () => {
  beforeEach(() => {
    tabStore.reset();
  });

  it("renders the status bar", () => {
    tabStore.createTab();
    render(() => <StatusBar />);
    expect(screen.getByTestId("status-bar")).toBeTruthy();
  });

  it("shows shell label for active tab", () => {
    tabStore.createTab("bash");
    render(() => <StatusBar />);
    expect(screen.getByTestId("status-bar-shell").textContent).toBe("Bash");
  });

  it("shows default Terminal label when no shell specified", () => {
    tabStore.createTab();
    render(() => <StatusBar />);
    expect(screen.getByTestId("status-bar-shell").textContent).toBe("Terminal");
  });

  it("shows tab count when multiple tabs exist", () => {
    tabStore.createTab();
    tabStore.createTab();
    tabStore.createTab();

    render(() => <StatusBar />);
    expect(screen.getByTestId("status-bar-tab-info").textContent).toBe("Tab 3/3");
  });

  it("hides tab info when only one tab exists", () => {
    tabStore.createTab();
    render(() => <StatusBar />);
    expect(screen.queryByTestId("status-bar-tab-info")).toBeNull();
  });

  it("shows Forge branding", () => {
    tabStore.createTab();
    render(() => <StatusBar />);
    expect(screen.getByTestId("status-bar-channel").textContent).toBe("Forge");
  });
});
