import { Match, Switch } from "solid-js";
import { paneStore } from "../stores/pane";
import PaneDivider from "./PaneDivider";
import TerminalPane from "./TerminalPane";
import type { PaneNode } from "../types/pane";
import type { TabId } from "../types/tab";

interface PaneContainerProps {
  tabId: TabId;
  node: PaneNode;
}

export default function PaneContainer(props: PaneContainerProps) {
  return (
    <Switch>
      <Match when={props.node.type === "terminal" ? props.node : null}>
        {(terminalNode) => (
          <div
            class="forge-pane-terminal-wrapper"
            data-focused={paneStore.activePaneId === terminalNode().id}
            onClick={() => {
              paneStore.focusPane(terminalNode().id);
            }}
          >
            <TerminalPane
              tabId={props.tabId}
              paneId={terminalNode().id}
              focused={paneStore.activePaneId === terminalNode().id}
            />
          </div>
        )}
      </Match>
      <Match when={props.node.type === "split" ? props.node : null}>
        {(splitNode) => (
          <div
            class={`forge-pane-split-${splitNode().direction}`}
            style={{
              flex: 1,
              display: "flex",
              "flex-direction": splitNode().direction === "vertical" ? "row" : "column",
              overflow: "hidden",
              width: "100%",
              height: "100%",
            }}
          >
            <div
              style={{
                display: "flex",
                "flex-basis": `calc(${splitNode().ratio * 100}% - 2px)`,
                "flex-grow": 0,
                "flex-shrink": 0,
                overflow: "hidden",
                width: splitNode().direction === "vertical" ? "auto" : "100%",
                height: splitNode().direction === "horizontal" ? "auto" : "100%",
              }}
            >
              <PaneContainer tabId={props.tabId} node={splitNode().first} />
            </div>

            <PaneDivider
              direction={splitNode().direction}
              ratio={splitNode().ratio}
              onRatioChange={(newRatio) => {
                paneStore.resizeSplit(splitNode().id, newRatio);
              }}
            />

            <div
              style={{
                display: "flex",
                flex: 1, // take the rest
                "flex-basis": 0,
                "flex-grow": 1,
                "flex-shrink": 1,
                overflow: "hidden",
                width: splitNode().direction === "vertical" ? "auto" : "100%",
                height: splitNode().direction === "horizontal" ? "auto" : "100%",
              }}
            >
              <PaneContainer tabId={props.tabId} node={splitNode().second} />
            </div>
          </div>
        )}
      </Match>
    </Switch>
  );
}
