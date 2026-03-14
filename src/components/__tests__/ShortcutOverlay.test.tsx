import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, it, expect, beforeEach } from "vitest";
import ShortcutOverlay, { setIsShortcutOverlayOpen } from "../ShortcutOverlay";

describe("ShortcutOverlay", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    setIsShortcutOverlayOpen(false);
  });

  it("does not render when closed", () => {
    render(() => <ShortcutOverlay />);
    expect(screen.queryByTestId("shortcut-overlay")).toBeNull();
  });

  it("renders when opened", () => {
    setIsShortcutOverlayOpen(true);
    render(() => <ShortcutOverlay />);
    expect(screen.getByTestId("shortcut-overlay")).toBeTruthy();
  });

  it("displays shortcut groups", () => {
    setIsShortcutOverlayOpen(true);
    render(() => <ShortcutOverlay />);

    const groups = document.querySelectorAll(".forge-shortcut-group");
    expect(groups.length).toBeGreaterThanOrEqual(3);
  });

  it("closes when close button clicked", () => {
    setIsShortcutOverlayOpen(true);
    render(() => <ShortcutOverlay />);

    fireEvent.click(screen.getByTestId("btn-close-shortcuts"));
    expect(screen.queryByTestId("shortcut-overlay")).toBeNull();
  });

  it("closes when backdrop clicked", () => {
    setIsShortcutOverlayOpen(true);
    render(() => <ShortcutOverlay />);

    fireEvent.click(screen.getByTestId("shortcut-overlay-backdrop"));
    expect(screen.queryByTestId("shortcut-overlay")).toBeNull();
  });
});
