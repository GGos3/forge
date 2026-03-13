import type { PaneId, PaneNode, SplitDirection, SplitPane, TerminalPane } from "../types/pane";
import type { SessionId } from "../types/session";

type FocusDirection = "up" | "down" | "left" | "right";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TerminalWithRect {
  pane: TerminalPane;
  rect: Rect;
}

const MIN_RATIO = 0.1;
const MAX_RATIO = 0.9;
const EPSILON = 1e-9;

function createId(prefix: string): string {
  const randomPart = Math.random().toString(36).slice(2, 11);
  return `${prefix}-${Date.now()}-${randomPart}`;
}

function clampRatio(ratio: number): number {
  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio));
}

function createGeneratedSessionId(): SessionId {
  return { value: createId("pending-session") } as SessionId;
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function collectTerminalRects(node: PaneNode, rect: Rect, acc: TerminalWithRect[]): void {
  if (node.type === "terminal") {
    acc.push({ pane: node, rect });
    return;
  }

  if (node.direction === "vertical") {
    const firstWidth = rect.width * node.ratio;
    collectTerminalRects(node.first, { x: rect.x, y: rect.y, width: firstWidth, height: rect.height }, acc);
    collectTerminalRects(
      node.second,
      { x: rect.x + firstWidth, y: rect.y, width: rect.width - firstWidth, height: rect.height },
      acc
    );
    return;
  }

  const firstHeight = rect.height * node.ratio;
  collectTerminalRects(node.first, { x: rect.x, y: rect.y, width: rect.width, height: firstHeight }, acc);
  collectTerminalRects(
    node.second,
    { x: rect.x, y: rect.y + firstHeight, width: rect.width, height: rect.height - firstHeight },
    acc
  );
}

export function createTerminalPane(sessionId: SessionId): PaneNode {
  return {
    type: "terminal",
    id: createId("pane"),
    sessionId,
  };
}

export function splitPane(tree: PaneNode, targetPaneId: PaneId, direction: SplitDirection): PaneNode {
  if (tree.type === "terminal") {
    if (tree.id !== targetPaneId) {
      return tree;
    }

    return {
      type: "split",
      id: createId("split"),
      direction,
      first: tree,
      second: createTerminalPane(createGeneratedSessionId()),
      ratio: 0.5,
    };
  }

  const nextFirst = splitPane(tree.first, targetPaneId, direction);
  if (nextFirst !== tree.first) {
    return { ...tree, first: nextFirst };
  }

  const nextSecond = splitPane(tree.second, targetPaneId, direction);
  if (nextSecond !== tree.second) {
    return { ...tree, second: nextSecond };
  }

  return tree;
}

export function closePane(tree: PaneNode, targetPaneId: PaneId): PaneNode | null {
  if (tree.type === "terminal") {
    return tree.id === targetPaneId ? null : tree;
  }

  if (tree.first.type === "terminal" && tree.first.id === targetPaneId) {
    return tree.second;
  }

  if (tree.second.type === "terminal" && tree.second.id === targetPaneId) {
    return tree.first;
  }

  const nextFirst = closePane(tree.first, targetPaneId);
  if (nextFirst !== tree.first) {
    return nextFirst === null ? tree.second : { ...tree, first: nextFirst };
  }

  const nextSecond = closePane(tree.second, targetPaneId);
  if (nextSecond !== tree.second) {
    return nextSecond === null ? tree.first : { ...tree, second: nextSecond };
  }

  return tree;
}

export function resizePane(tree: PaneNode, splitId: PaneId, ratio: number): PaneNode {
  if (tree.type === "terminal") {
    return tree;
  }

  if (tree.id === splitId) {
    return { ...tree, ratio: clampRatio(ratio) };
  }

  const nextFirst = resizePane(tree.first, splitId, ratio);
  if (nextFirst !== tree.first) {
    return { ...tree, first: nextFirst };
  }

  const nextSecond = resizePane(tree.second, splitId, ratio);
  if (nextSecond !== tree.second) {
    return { ...tree, second: nextSecond };
  }

  return tree;
}

export function findPane(tree: PaneNode, paneId: PaneId): PaneNode | null {
  if (tree.id === paneId) {
    return tree;
  }

  if (tree.type === "terminal") {
    return null;
  }

  return findPane(tree.first, paneId) ?? findPane(tree.second, paneId);
}

export function getAdjacentPane(tree: PaneNode, paneId: PaneId, direction: FocusDirection): PaneId | null {
  const terminals: TerminalWithRect[] = [];
  collectTerminalRects(tree, { x: 0, y: 0, width: 1, height: 1 }, terminals);

  const current = terminals.find(({ pane }) => pane.id === paneId);
  if (!current) {
    return null;
  }

  let best: { paneId: PaneId; distance: number; overlap: number } | null = null;

  for (const candidate of terminals) {
    if (candidate.pane.id === paneId) {
      continue;
    }

    let distance = -1;
    let overlapSize = 0;

    if (direction === "left") {
      distance = current.rect.x - (candidate.rect.x + candidate.rect.width);
      overlapSize = overlap(
        current.rect.y,
        current.rect.y + current.rect.height,
        candidate.rect.y,
        candidate.rect.y + candidate.rect.height
      );
    } else if (direction === "right") {
      distance = candidate.rect.x - (current.rect.x + current.rect.width);
      overlapSize = overlap(
        current.rect.y,
        current.rect.y + current.rect.height,
        candidate.rect.y,
        candidate.rect.y + candidate.rect.height
      );
    } else if (direction === "up") {
      distance = current.rect.y - (candidate.rect.y + candidate.rect.height);
      overlapSize = overlap(
        current.rect.x,
        current.rect.x + current.rect.width,
        candidate.rect.x,
        candidate.rect.x + candidate.rect.width
      );
    } else {
      distance = candidate.rect.y - (current.rect.y + current.rect.height);
      overlapSize = overlap(
        current.rect.x,
        current.rect.x + current.rect.width,
        candidate.rect.x,
        candidate.rect.x + candidate.rect.width
      );
    }

    if (distance < -EPSILON || overlapSize <= EPSILON) {
      continue;
    }

    if (
      best === null ||
      distance < best.distance - EPSILON ||
      (Math.abs(distance - best.distance) <= EPSILON && overlapSize > best.overlap + EPSILON)
    ) {
      best = { paneId: candidate.pane.id, distance, overlap: overlapSize };
    }
  }

  return best?.paneId ?? null;
}

export function getAllTerminalPanes(tree: PaneNode): PaneNode[] {
  if (tree.type === "terminal") {
    return [tree];
  }

  return [...getAllTerminalPanes(tree.first), ...getAllTerminalPanes(tree.second)];
}

export function updateTerminalPaneSessionId(tree: PaneNode, paneId: PaneId, sessionId: SessionId): PaneNode {
  if (tree.type === "terminal") {
    if (tree.id !== paneId) {
      return tree;
    }

    return { ...tree, sessionId };
  }

  const nextFirst = updateTerminalPaneSessionId(tree.first, paneId, sessionId);
  if (nextFirst !== tree.first) {
    return { ...tree, first: nextFirst };
  }

  const nextSecond = updateTerminalPaneSessionId(tree.second, paneId, sessionId);
  if (nextSecond !== tree.second) {
    return { ...tree, second: nextSecond };
  }

  return tree;
}

export function isSplitPane(node: PaneNode): node is SplitPane {
  return node.type === "split";
}
