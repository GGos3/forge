import { describe, expect, it } from "vitest";
import { computeDropZone, zoneToSplit } from "./drop-zone";

function makeRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x, y, left: x, top: y, width, height,
    right: x + width, bottom: y + height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("computeDropZone", () => {
  const rect = makeRect(0, 0, 400, 400);

  it("returns 'top' when cursor is in top 25%", () => {
    expect(computeDropZone(200, 50, rect)).toBe("top");
  });

  it("returns 'bottom' when cursor is in bottom 25%", () => {
    expect(computeDropZone(200, 350, rect)).toBe("bottom");
  });

  it("returns 'left' when cursor is in left 25% (mid vertical)", () => {
    expect(computeDropZone(50, 200, rect)).toBe("left");
  });

  it("returns 'right' when cursor is in right 25% (mid vertical)", () => {
    expect(computeDropZone(350, 200, rect)).toBe("right");
  });

  it("returns closest edge when in center (closer to top)", () => {
    // relY=0.35 (dist to top=0.35), relX=0.5 (dist to left/right=0.5)
    expect(computeDropZone(200, 140, rect)).toBe("top");
  });

  it("returns closest edge when in center (closer to bottom)", () => {
    // relY=0.65 (dist to bottom=0.35), relX=0.5
    expect(computeDropZone(200, 260, rect)).toBe("bottom");
  });

  it("returns closest edge when in center (closer to left)", () => {
    // relX=0.35 (dist to left=0.35), relY=0.5
    expect(computeDropZone(140, 200, rect)).toBe("left");
  });

  it("returns closest edge when in center (closer to right)", () => {
    // relX=0.65 (dist to right=0.35), relY=0.5
    expect(computeDropZone(260, 200, rect)).toBe("right");
  });

  it("top takes priority over left in top-left corner", () => {
    // relX=0.05, relY=0.05 — both in edge band, top checked first
    expect(computeDropZone(20, 20, rect)).toBe("top");
  });

  it("handles non-zero rect origin", () => {
    const offsetRect = makeRect(100, 200, 400, 400);
    // clientX=150 → relX=0.125 (left edge), clientY=400 → relY=0.5
    expect(computeDropZone(150, 400, offsetRect)).toBe("left");
  });
});

describe("zoneToSplit", () => {
  it("maps top → horizontal/before", () => {
    expect(zoneToSplit("top")).toEqual({ direction: "horizontal", position: "before" });
  });

  it("maps bottom → horizontal/after", () => {
    expect(zoneToSplit("bottom")).toEqual({ direction: "horizontal", position: "after" });
  });

  it("maps left → vertical/before", () => {
    expect(zoneToSplit("left")).toEqual({ direction: "vertical", position: "before" });
  });

  it("maps right → vertical/after", () => {
    expect(zoneToSplit("right")).toEqual({ direction: "vertical", position: "after" });
  });
});
