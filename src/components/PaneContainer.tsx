import { Show } from "solid-js";
import { paneStore } from "../stores/pane";
import PaneDivider from "./PaneDivider";
import TerminalPane from "./TerminalPane";
import type { PaneNode, SplitPane } from "../types/pane";
import type { TabId } from "../types/tab";

interface PaneContainerProps {
  tabId: TabId;
  node: PaneNode;
}

function SplitContainer(props: { tabId: TabId; split: SplitPane }) {
  return (
    <div
      class={`forge-pane-split-${props.split.direction}`}
      style={{
        flex: 1,
        display: "flex",
        "flex-direction": props.split.direction === "vertical" ? "row" : "column",
        overflow: "hidden",
        width: "100%",
        height: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          "flex-basis": `calc(${props.split.ratio * 100}% - 2px)`,
          "flex-grow": 0,
          "flex-shrink": 0,
          overflow: "hidden",
          width: props.split.direction === "vertical" ? "auto" : "100%",
          height: props.split.direction === "horizontal" ? "auto" : "100%",
        }}
      >
        <PaneContainer tabId={props.tabId} node={props.split.first} />
      </div>

      <PaneDivider
        direction={props.split.direction}
        ratio={props.split.ratio}
        onRatioChange={(newRatio) => {
          paneStore.resizeSplit(props.split.id, newRatio);
        }}
      />

      <div
        style={{
          display: "flex",
          flex: 1,
          "flex-basis": 0,
          "flex-grow": 1,
          "flex-shrink": 1,
          overflow: "hidden",
          width: props.split.direction === "vertical" ? "auto" : "100%",
          height: props.split.direction === "horizontal" ? "auto" : "100%",
        }}
      >
        <PaneContainer tabId={props.tabId} node={props.split.second} />
      </div>
    </div>
  );
}

export default function PaneContainer(props: PaneContainerProps) {
  const isTerminal = () => props.node.type === "terminal";

  return (
    <>
      <Show when={isTerminal()}>
        <div
          class="forge-pane-terminal-wrapper"
          data-focused={paneStore.activePaneId === props.node.id}
          onClick={() => {
            if (props.node.type === "terminal") {
              paneStore.focusPane(props.node.id);
            }
          }}
        >
          <TerminalPane
            tabId={props.tabId}
            paneId={props.node.id}
            focused={props.node.type === "terminal" && paneStore.activePaneId === props.node.id}
          />
        </div>
      </Show>
      <Show when={!isTerminal() && props.node.type === "split" ? props.node as SplitPane : undefined}>
        {(splitNode) => <SplitContainer tabId={props.tabId} split={splitNode()} />}
      </Show>
    </>
  );
}
