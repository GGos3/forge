import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@solidjs/testing-library";

// Mock platform utils - provide default implementation
vi.mock("../utils/platform", () => ({
  getCurrentPlatform: vi.fn(() => "linux"),
  isMacPlatform: vi.fn(() => false),
}));

// Must import AFTER mock
import StatusBar from "./StatusBar";
import { getCurrentPlatform, isMacPlatform } from "../utils/platform";

describe("StatusBar", () => {
  beforeEach(() => {
    vi.mocked(getCurrentPlatform).mockReturnValue("linux");
    vi.mocked(isMacPlatform).mockReturnValue(false);
  });

  it("renders the shortcut bar", () => {
    render(() => <StatusBar />);
    expect(screen.getByTestId("status-bar")).toBeTruthy();
  });

  it("renders shortcut keys", () => {
    render(() => <StatusBar />);
    const keys = screen.getAllByTestId("shortcut-key");
    expect(keys.length).toBeGreaterThan(0);
  });

  it("shows group separators", () => {
    render(() => <StatusBar />);
    const container = screen.getByTestId("status-bar");
    expect(container.textContent).toContain("│");
  });

  it("shows item separators", () => {
    render(() => <StatusBar />);
    const container = screen.getByTestId("status-bar");
    expect(container.textContent).toContain("·");
  });

  it("shows Linux shortcuts by default", () => {
    render(() => <StatusBar />);
    const container = screen.getByTestId("status-bar");
    expect(container.textContent).toContain("Ctrl");
  });

  it("shows Mac shortcuts on macOS", () => {
    vi.mocked(getCurrentPlatform).mockReturnValue("macos");
    vi.mocked(isMacPlatform).mockReturnValue(true);
    render(() => <StatusBar />);
    const container = screen.getByTestId("status-bar");
    expect(container.textContent).toContain("⌘");
  });
});
