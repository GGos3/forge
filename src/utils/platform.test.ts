import { describe, expect, it } from "vitest";
import {
  getCurrentPlatform,
  getPaneFocusDirection,
  getTabIndexFromShortcut,
  matchesClosePaneShortcut,
  matchesHorizontalSplitShortcut,
  matchesNewTabShortcut,
  matchesVerticalSplitShortcut,
} from "./platform";

describe("platform utils", () => {
  it("detects macOS, Windows, and Linux consistently", () => {
    expect(getCurrentPlatform({ platform: "MacIntel" })).toBe("macos");
    expect(getCurrentPlatform({ platform: "Win32" })).toBe("windows");
    expect(getCurrentPlatform({ platform: "Linux x86_64" })).toBe("linux");
  });

  it("falls back to user agent data when navigator.platform is unavailable", () => {
    expect(getCurrentPlatform({ userAgentData: { platform: "Windows" } })).toBe("windows");
  });

  it("matches split shortcuts by platform", () => {
    expect(
      matchesVerticalSplitShortcut(
        { key: "d", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false },
        "macos"
      )
    ).toBe(true);
    expect(
      matchesHorizontalSplitShortcut(
        { key: "e", metaKey: false, ctrlKey: true, shiftKey: true, altKey: false },
        "windows"
      )
    ).toBe(true);
  });

  it("uses platform-specific tab shortcuts", () => {
    expect(
      matchesNewTabShortcut(
        { key: "t", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false },
        "macos"
      )
    ).toBe(true);
    expect(
      getTabIndexFromShortcut(
        { key: "3", metaKey: false, ctrlKey: false, shiftKey: false, altKey: true },
        "linux"
      )
    ).toBe(2);
    expect(
      getTabIndexFromShortcut(
        { key: "3", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false },
        "linux"
      )
    ).toBeNull();
  });

  it("keeps pane close and focus navigation centralized", () => {
    expect(
      matchesClosePaneShortcut(
        { key: "w", metaKey: false, ctrlKey: true, shiftKey: true, altKey: false },
        "linux"
      )
    ).toBe(true);
    expect(
      getPaneFocusDirection({ key: "ArrowLeft", metaKey: false, ctrlKey: false, shiftKey: false, altKey: true })
    ).toBe("left");
  });
});
