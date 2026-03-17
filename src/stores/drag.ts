import { createSignal } from "solid-js";
import type { DropZone, PaneId } from "../types/pane";
import type { TabId } from "../types/tab";

export const FORGE_TAB_MIME = "application/x-forge-tab";

export interface DragSource {
  type: "tab" | "pane";
  tabId?: TabId;
  paneId?: PaneId;
}

export interface DropTarget {
  paneId: PaneId;
  zone: DropZone;
}

const [dragSource, setDragSource] = createSignal<DragSource | null>(null);
const [dropTarget, setDropTarget] = createSignal<DropTarget | null>(null);

export const dragStore = {
  get source() {
    return dragSource();
  },

  get target() {
    return dropTarget();
  },

  get isDragging() {
    return dragSource() !== null;
  },

  startDrag(source: DragSource): void {
    setDragSource(source);
  },

  updateTarget(target: DropTarget | null): void {
    setDropTarget(target);
  },

  endDrag(): void {
    setDragSource(null);
    setDropTarget(null);
  },
};
