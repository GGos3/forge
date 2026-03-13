import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import PaneContainer from "./PaneContainer";
import type { TerminalPane } from "../types/pane";
import type { SessionId } from "../types/session";

function makeSessionId(value: string): SessionId {
  return { __brand: "SessionId", value } as unknown as SessionId;
}

function makeTerminalPane(id: string, sessionValue: string): TerminalPane {
  return { type: "terminal", id, sessionId: makeSessionId(sessionValue) };
}

vi.mock("./TerminalPane", () => ({
  default: (props: { paneId: string }) => (
    <div data-testid="terminal-pane" data-pane-id={props.paneId}>
      Terminal: {props.paneId}
    </div>
  ),
}));

describe("PaneContainer", () => {
  it("renders a single terminal pane", () => {
    const node = makeTerminalPane("pane-1", "session-1");

    const { getByTestId, container } = render(() => (
      <PaneContainer tabId="tab-1" node={node} />
    ));

    const terminalPane = getByTestId("terminal-pane");
    expect(terminalPane).toBeTruthy();
    expect(terminalPane.getAttribute("data-pane-id")).toBe("pane-1");
    expect(container.querySelector(".forge-pane-terminal-wrapper")).toBeTruthy();
  });

  it("renders a vertical split with two panes and a divider", () => {
    const node = {
      type: "split" as const,
      id: "split-1",
      direction: "vertical" as const,
      ratio: 0.5,
      first: makeTerminalPane("pane-1", "session-1"),
      second: makeTerminalPane("pane-2", "session-2"),
    };

    const { getAllByTestId, getByTestId, container } = render(() => (
      <PaneContainer tabId="tab-1" node={node} />
    ));

    const terminals = getAllByTestId("terminal-pane");
    expect(terminals).toHaveLength(2);
    expect(terminals[0].getAttribute("data-pane-id")).toBe("pane-1");
    expect(terminals[1].getAttribute("data-pane-id")).toBe("pane-2");

    const divider = getByTestId("pane-divider");
    expect(divider).toBeTruthy();
    expect(container.querySelector(".forge-pane-split-vertical")).toBeTruthy();
  });

  it("renders a horizontal split with two panes and a divider", () => {
    const node = {
      type: "split" as const,
      id: "split-2",
      direction: "horizontal" as const,
      ratio: 0.3,
      first: makeTerminalPane("pane-3", "session-3"),
      second: makeTerminalPane("pane-4", "session-4"),
    };

    const { getAllByTestId, getByTestId, container } = render(() => (
      <PaneContainer tabId="tab-1" node={node} />
    ));

    const terminals = getAllByTestId("terminal-pane");
    expect(terminals).toHaveLength(2);

    const divider = getByTestId("pane-divider");
    expect(divider).toBeTruthy();
    expect(container.querySelector(".forge-pane-split-horizontal")).toBeTruthy();
  });
});
