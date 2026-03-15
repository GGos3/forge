import type { DropZone, SplitDirection, SplitPosition } from "../types/pane";

const EDGE_THRESHOLD = 0.25;

export function computeDropZone(clientX: number, clientY: number, rect: DOMRect): DropZone {
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;

  // Edge bands (top/bottom have priority over left/right in corners)
  if (relY < EDGE_THRESHOLD) return "top";
  if (relY > 1 - EDGE_THRESHOLD) return "bottom";
  if (relX < EDGE_THRESHOLD) return "left";
  if (relX > 1 - EDGE_THRESHOLD) return "right";

  // Center area — pick closest edge
  const distTop = relY;
  const distBottom = 1 - relY;
  const distLeft = relX;
  const distRight = 1 - relX;
  const min = Math.min(distTop, distBottom, distLeft, distRight);

  if (min === distTop) return "top";
  if (min === distBottom) return "bottom";
  if (min === distLeft) return "left";
  return "right";
}

export function zoneToSplit(zone: DropZone): {
  direction: SplitDirection;
  position: SplitPosition;
} {
  switch (zone) {
    case "top":    return { direction: "horizontal", position: "before" };
    case "bottom": return { direction: "horizontal", position: "after" };
    case "left":   return { direction: "vertical",   position: "before" };
    case "right":  return { direction: "vertical",   position: "after" };
  }
}
