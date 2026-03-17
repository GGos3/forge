import { Show, createSignal } from "solid-js";
import { paneStore } from "../stores/pane";
import { tabStore } from "../stores/tab";
import { dragStore } from "../stores/drag";
import { computeDropZone, zoneToSplit } from "../utils/drop-zone";
import PaneDivider from "./PaneDivider";
import TerminalPane from "./TerminalPane";
import DropZoneOverlay from "./DropZoneOverlay";
import type { DropZone, PaneNode, SplitPane } from "../types/pane";
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
  const [activeZone, setActiveZone] = createSignal<DropZone | null>(null);
  let wrapperRef: HTMLDivElement | undefined;

  const isSelfDrag = (): boolean => {
    const source = dragStore.source;
    if (!source || source.type !== "tab" || !source.tabId) return false;
    const tab = tabStore.tabs.find((t) => t.id === source.tabId);
    return !!tab && tab.root.type === "terminal" && tab.root.id === props.node.id;
  };

  const hasSplits = () => {
    const tab = tabStore.tabs.find((t) => t.id === props.tabId);
    return tab ? tab.root.type === "split" : false;
  };

  const handleDragOver = (e: DragEvent) => {
    if (!dragStore.isDragging || isSelfDrag()) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    if (!wrapperRef) return;
    const rect = wrapperRef.getBoundingClientRect();
    const zone = computeDropZone(e.clientX, e.clientY, rect);
    setActiveZone(zone);
    dragStore.updateTarget({ paneId: props.node.id, zone });
  };

  const handleDragLeave = (e: DragEvent) => {
    if (!wrapperRef) return;
    const related = e.relatedTarget as Node | null;
    if (related && wrapperRef.contains(related)) return;
    setActiveZone(null);
    dragStore.updateTarget(null);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const zone = activeZone();
    setActiveZone(null);

    const source = dragStore.source;
    if (!source) {
      dragStore.endDrag();
      return;
    }

    if (source.type === "pane" && source.paneId && props.node.type === "terminal") {
      paneStore.swapPanes(source.paneId, props.node.id);
      dragStore.endDrag();
      return;
    }

    if (!zone || props.node.type !== "terminal") {
      dragStore.endDrag();
      return;
    }
    const { direction, position } = zoneToSplit(zone);
    void paneStore.splitPaneAt(props.node.id, direction, position);
    dragStore.endDrag();
  };

  return (
    <>
      <Show when={isTerminal()}>
        <div
          ref={wrapperRef}
          class="forge-pane-terminal-wrapper"
          data-focused={paneStore.activePaneId === props.node.id}
          onClick={() => {
            if (props.node.type === "terminal") {
              paneStore.focusPane(props.node.id);
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <TerminalPane
            tabId={props.tabId}
            paneId={props.node.id}
            focused={props.node.type === "terminal" && paneStore.activePaneId === props.node.id}
            showHeader={hasSplits()}
          />
          <DropZoneOverlay activeZone={activeZone()} />
        </div>
      </Show>
      <Show when={!isTerminal() && props.node.type === "split" ? props.node as SplitPane : undefined}>
        {(splitNode) => <SplitContainer tabId={props.tabId} split={splitNode()} />}
      </Show>
    </>
  );
}
