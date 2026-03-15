import { describe, expect, it } from "vitest";
import type { PaneNode, TerminalPane } from "../types/pane";
import type { SessionId } from "../types/session";
import {
  closePane,
  createTerminalPane,
  findPane,
  getAdjacentPane,
  getAllTerminalPanes,
  resizePane,
  splitPane,
  splitPaneAt,
} from "./pane-tree";

function makeSession(value: string): SessionId {
  return { value } as SessionId;
}

function makeTerminal(id: string, sessionValue = `session-${id}`): TerminalPane {
  return {
    type: "terminal",
    id,
    sessionId: makeSession(sessionValue),
  };
}

describe("pane-tree model", () => {
  it("createTerminalPane returns terminal node", () => {
    const pane = createTerminalPane(makeSession("session-1"));

    expect(pane.type).toBe("terminal");
    if (pane.type !== "terminal") {
      return;
    }

    expect(pane.id).toMatch(/^pane-/);
    expect(pane.sessionId.value).toBe("session-1");
  });

  it("splitPane creates split node with original and new panes", () => {
    const root = makeTerminal("p1");

    const result = splitPane(root, "p1", "vertical");
    expect(result.type).toBe("split");
    if (result.type !== "split") {
      return;
    }

    expect(result.direction).toBe("vertical");
    expect(result.ratio).toBe(0.5);
    expect(result.first).toBe(root);
    expect(result.second.type).toBe("terminal");
    if (result.second.type === "terminal") {
      expect(result.second.id).not.toBe("p1");
    }
  });

  it("closePane returns null when closing root terminal", () => {
    const root = makeTerminal("only");
    expect(closePane(root, "only")).toBeNull();
  });

  it("closePane with two panes promotes sibling", () => {
    const left = makeTerminal("left");
    const right = makeTerminal("right");
    const tree: PaneNode = {
      type: "split",
      id: "split-root",
      direction: "vertical",
      ratio: 0.5,
      first: left,
      second: right,
    };

    const closedLeft = closePane(tree, "left");
    expect(closedLeft).toBe(right);

    const closedRight = closePane(tree, "right");
    expect(closedRight).toBe(left);
  });

  it("closePane with nested splits promotes correct sibling", () => {
    const a = makeTerminal("a");
    const b = makeTerminal("b");
    const c = makeTerminal("c");
    const tree: PaneNode = {
      type: "split",
      id: "root",
      direction: "vertical",
      ratio: 0.6,
      first: {
        type: "split",
        id: "left-split",
        direction: "horizontal",
        ratio: 0.5,
        first: a,
        second: b,
      },
      second: c,
    };

    const result = closePane(tree, "a");
    expect(result).not.toBeNull();
    if (!result || result.type !== "split") {
      return;
    }

    expect(result.first).toBe(b);
    expect(result.second).toBe(c);
  });

  it("resizePane clamps ratio from 0.1 to 0.9", () => {
    const tree: PaneNode = {
      type: "split",
      id: "s1",
      direction: "vertical",
      ratio: 0.5,
      first: makeTerminal("a"),
      second: makeTerminal("b"),
    };

    const low = resizePane(tree, "s1", -5);
    const high = resizePane(tree, "s1", 100);

    expect(low.type).toBe("split");
    expect(high.type).toBe("split");
    if (low.type === "split") {
      expect(low.ratio).toBe(0.1);
    }
    if (high.type === "split") {
      expect(high.ratio).toBe(0.9);
    }
  });

  it("findPane finds terminals and splits", () => {
    const tree: PaneNode = {
      type: "split",
      id: "s1",
      direction: "vertical",
      ratio: 0.5,
      first: makeTerminal("a"),
      second: makeTerminal("b"),
    };

    expect(findPane(tree, "s1")?.id).toBe("s1");
    expect(findPane(tree, "a")?.id).toBe("a");
    expect(findPane(tree, "missing")).toBeNull();
  });

  it("getAdjacentPane returns neighbors in all directions", () => {
    const leftTop = makeTerminal("left-top");
    const leftBottom = makeTerminal("left-bottom");
    const right = makeTerminal("right");
    const tree: PaneNode = {
      type: "split",
      id: "root",
      direction: "vertical",
      ratio: 0.5,
      first: {
        type: "split",
        id: "left-stack",
        direction: "horizontal",
        ratio: 0.5,
        first: leftTop,
        second: leftBottom,
      },
      second: right,
    };

    expect(getAdjacentPane(tree, "left-top", "right")).toBe("right");
    expect(getAdjacentPane(tree, "left-bottom", "right")).toBe("right");
    expect(getAdjacentPane(tree, "left-top", "down")).toBe("left-bottom");
    expect(getAdjacentPane(tree, "left-bottom", "up")).toBe("left-top");
    expect(getAdjacentPane(tree, "right", "left")).toBe("left-top");
    expect(getAdjacentPane(tree, "right", "up")).toBeNull();
  });

  it("getAllTerminalPanes flattens terminal panes", () => {
    const t1 = makeTerminal("t1");
    const t2 = makeTerminal("t2");
    const t3 = makeTerminal("t3");
    const tree: PaneNode = {
      type: "split",
      id: "root",
      direction: "vertical",
      ratio: 0.5,
      first: {
        type: "split",
        id: "left",
        direction: "horizontal",
        ratio: 0.5,
        first: t1,
        second: t2,
      },
      second: t3,
    };

    expect(getAllTerminalPanes(tree).map((pane) => pane.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("deep nesting keeps tree integrity during split/close cycles", () => {
    let tree: PaneNode = makeTerminal("root");
    const activeIds: string[] = ["root"];

    for (let i = 0; i < 8; i += 1) {
      const target = activeIds[activeIds.length - 1];
      tree = splitPane(tree, target, i % 2 === 0 ? "vertical" : "horizontal");
      const allIds = getAllTerminalPanes(tree).map((pane) => pane.id);
      const next = allIds.find((id) => !activeIds.includes(id));
      expect(next).toBeDefined();
      activeIds.push(next!);
    }

    const uniqueIds = new Set(getAllTerminalPanes(tree).map((pane) => pane.id));
    expect(uniqueIds.size).toBe(9);

    for (let i = 0; i < 4; i += 1) {
      const current = getAllTerminalPanes(tree).map((pane) => pane.id);
      tree = closePane(tree, current[current.length - 1])!;
      const remaining = getAllTerminalPanes(tree).map((pane) => pane.id);
      expect(remaining.length).toBe(current.length - 1);
      for (const id of remaining) {
        expect(findPane(tree, id)).not.toBeNull();
      }
    }
  });

  describe("splitPaneAt", () => {
    it("position 'after' puts new pane in second (same as splitPane)", () => {
      const root = makeTerminal("p1");

      const result = splitPaneAt(root, "p1", "vertical", "after");
      expect(result.type).toBe("split");
      if (result.type !== "split") {
        return;
      }

      expect(result.first).toBe(root);
      expect(result.second.type).toBe("terminal");
    });

    it("position 'before' puts new pane in first, original in second", () => {
      const root = makeTerminal("p1");

      const result = splitPaneAt(root, "p1", "vertical", "before");
      expect(result.type).toBe("split");
      if (result.type !== "split") {
        return;
      }

      expect(result.first.type).toBe("terminal");
      expect(result.second).toBe(root);
    });

    it("returns tree unchanged when target not found", () => {
      const root = makeTerminal("p1");

      const result = splitPaneAt(root, "nonexistent", "vertical", "after");
      expect(result).toBe(root);
    });

    it("targets correct pane in nested tree", () => {
      const left = makeTerminal("left");
      const right = makeTerminal("right");
      const tree: PaneNode = {
        type: "split",
        id: "root",
        direction: "vertical",
        ratio: 0.5,
        first: left,
        second: right,
      };

      const result = splitPaneAt(tree, "right", "horizontal", "after");
      expect(result.type).toBe("split");
      if (result.type !== "split") {
        return;
      }

      // First branch should be unchanged
      expect(result.first).toBe(left);

      // Second branch should now be a split
      expect(result.second.type).toBe("split");
      if (result.second.type !== "split") {
        return;
      }
      expect(result.second.first).toBe(right);
      expect(result.second.second.type).toBe("terminal");
    });

    it("preserves other branches unchanged", () => {
      const a = makeTerminal("a");
      const b = makeTerminal("b");
      const c = makeTerminal("c");
      const tree: PaneNode = {
        type: "split",
        id: "root",
        direction: "vertical",
        ratio: 0.5,
        first: {
          type: "split",
          id: "left-split",
          direction: "horizontal",
          ratio: 0.5,
          first: a,
          second: b,
        },
        second: c,
      };

      const result = splitPaneAt(tree, "a", "vertical", "after");
      expect(result.type).toBe("split");
      if (result.type !== "split") {
        return;
      }

      // The left-split should have changed (a was split)
      expect(result.first).not.toBe(tree.first);
      const firstBranch = result.first;
      expect(firstBranch.type).toBe("split");
      if (firstBranch.type !== "split") {
        return;
      }
      // firstBranch is the modified left-split
      // Its first child is the new split containing a and new pane
      const newSplit = firstBranch.first;
      expect(newSplit.type).toBe("split");
      if (newSplit.type !== "split") {
        return;
      }
      // The new split's first should be terminal a
      expect(newSplit.first.type).toBe("terminal");
      if (newSplit.first.type !== "terminal") {
        return;
      }
      expect(newSplit.first.id).toBe("a");
      expect(newSplit.second.type).toBe("terminal");

      // The right branch (c) should be unchanged (referential equality)
      const secondBranch = result.second;
      expect(secondBranch.type).toBe("terminal");
      expect(secondBranch).toBe(c);
    });
  });
});
