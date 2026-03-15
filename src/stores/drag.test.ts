import { describe, expect, it, beforeEach } from "vitest";
import { dragStore } from "./drag";

describe("drag store", () => {
  beforeEach(() => {
    dragStore.endDrag();
  });

  it("starts with no drag source", () => {
    expect(dragStore.source).toBeNull();
    expect(dragStore.isDragging).toBe(false);
  });

  it("startDrag sets source and isDragging", () => {
    dragStore.startDrag({ type: "tab", tabId: "tab-1" });
    expect(dragStore.source).toEqual({ type: "tab", tabId: "tab-1" });
    expect(dragStore.isDragging).toBe(true);
  });

  it("updateTarget sets drop target", () => {
    dragStore.updateTarget({ paneId: "pane-1", zone: "left" });
    expect(dragStore.target).toEqual({ paneId: "pane-1", zone: "left" });
  });

  it("endDrag clears source and target", () => {
    dragStore.startDrag({ type: "tab", tabId: "tab-1" });
    dragStore.updateTarget({ paneId: "pane-1", zone: "top" });
    dragStore.endDrag();
    expect(dragStore.source).toBeNull();
    expect(dragStore.target).toBeNull();
    expect(dragStore.isDragging).toBe(false);
  });
});
