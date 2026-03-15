import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import BlockActions from "./BlockActions";

export interface BlockUiItem {
  id: string;
  top: number;
  height: number;
  inputHeight: number;
  command: string;
  output: string;
  exitCode: number | null;
  timestamp: number;
  isRunning: boolean;
}

interface BlockOverlayProps {
  blocks: BlockUiItem[];
  onRegionHover?: (blockId: string | null, region: "input" | "output" | null, block: BlockUiItem | null) => void;
}

function blockStatus(block: BlockUiItem): "running" | "success" | "error" | "neutral" {
  if (block.isRunning) return "running";
  if (block.exitCode === null) return "neutral";
  return block.exitCode === 0 ? "success" : "error";
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// pointer-events:none on overlay → coordinate-based hit testing for hover without blocking xterm
function hitTestBlocks(
  mouseY: number,
  blocks: BlockUiItem[],
): { block: BlockUiItem; region: "input" | "output" } | null {
  for (const b of blocks) {
    if (mouseY >= b.top && mouseY < b.top + b.height) {
      const localY = mouseY - b.top;
      const region: "input" | "output" = localY < b.inputHeight ? "input" : "output";
      return { block: b, region };
    }
  }
  return null;
}

export default function BlockOverlay(props: BlockOverlayProps) {
  let overlayRef: HTMLDivElement | undefined;

  const [hoveredBlockId, setHoveredBlockId] = createSignal<string | null>(null);
  const [hoveredRegion, setHoveredRegion] = createSignal<"input" | "output" | null>(null);

  const updateHover = (blockId: string | null, region: "input" | "output" | null, block: BlockUiItem | null) => {
    const prevId = hoveredBlockId();
    const prevRegion = hoveredRegion();
    if (prevId === blockId && prevRegion === region) return;

    setHoveredBlockId(blockId);
    setHoveredRegion(region);
    props.onRegionHover?.(blockId, region, block);
  };

  onMount(() => {
    if (!overlayRef) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!overlayRef) return;
      const rect = overlayRef.getBoundingClientRect();
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      if (mouseX < rect.left || mouseX > rect.right || mouseY < rect.top || mouseY > rect.bottom) {
        updateHover(null, null, null);
        return;
      }

      const relativeY = mouseY - rect.top;
      const hit = hitTestBlocks(relativeY, props.blocks);
      if (hit) {
        if (hit.block.id !== hoveredBlockId()) {
          console.log(`[HOVER-DEBUG] relY=${relativeY.toFixed(0)}, hit="${hit.block.command?.slice(0,15)}" top=${hit.block.top.toFixed(0)} h=${hit.block.height.toFixed(0)} inputH=${hit.block.inputHeight.toFixed(0)}, blocks=[${props.blocks.map(b => `"${b.command?.slice(0,8)}"@${b.top.toFixed(0)}`).join(', ')}]`);
        }
        updateHover(hit.block.id, hit.region, hit.block);
      } else {
        updateHover(null, null, null);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);

    onCleanup(() => {
      document.removeEventListener("mousemove", handleMouseMove);
    });
  });

  return (
    <div ref={overlayRef} class="forge-block-overlay" data-testid="block-overlay">
      <For each={props.blocks}>
        {(block) => {
          const isHovered = () => hoveredBlockId() === block.id;
          const isInputHovered = () => isHovered() && hoveredRegion() === "input";
          const isOutputHovered = () => isHovered() && hoveredRegion() === "output";
          const outputHeight = () => Math.max(0, block.height - block.inputHeight);

          return (
            <Show when={block.top > -block.height && block.top < 2000}>
              <div
                class="forge-block-card"
                classList={{
                  "forge-block-card--error": blockStatus(block) === "error",
                  "forge-block-card--running": blockStatus(block) === "running",
                  "forge-block-card--success": blockStatus(block) === "success",
                  "forge-block-card--hovered": isHovered(),
                }}
                style={{
                  top: `${block.top}px`,
                  height: `${block.height}px`,
                }}
                data-testid={`block-${block.id}`}
              >
                <div
                  class="forge-block-region forge-block-region--input"
                  classList={{ "forge-block-region--active": isInputHovered() }}
                  style={{ height: `${block.inputHeight}px` }}
                />

                <div
                  class="forge-block-region forge-block-region--output"
                  classList={{ "forge-block-region--active": isOutputHovered() }}
                  style={{ height: `${outputHeight()}px`, top: `${block.inputHeight}px` }}
                />

                <Show when={isHovered()}>
                  <div class="forge-block-region-divider" style={{ top: `${block.inputHeight}px` }} />
                </Show>

                <div class="forge-block-toolbar" classList={{ "forge-block-toolbar--visible": isHovered() }}>
                  <div class="forge-block-toolbar__info">
                    <div class="forge-block-card__status">
                      <Show when={blockStatus(block) === "success"}>
                        <svg class="forge-block-card__icon forge-block-card__icon--success" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" data-testid="status-success">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </Show>
                      <Show when={blockStatus(block) === "error"}>
                        <svg class="forge-block-card__icon forge-block-card__icon--error" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" data-testid="status-error">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </Show>
                      <Show when={blockStatus(block) === "running"}>
                        <div class="forge-block-card__spinner" data-testid="running-indicator" />
                      </Show>
                    </div>

                    <span class="forge-block-card__command" title={block.command}>
                      {block.command || "Command"}
                    </span>

                    <span class="forge-block-card__time">
                      {formatTimestamp(block.timestamp)}
                    </span>

                    <Show when={blockStatus(block) === "error" && block.exitCode !== null}>
                      <span class="forge-block-card__exit-code" data-testid="exit-code">
                        exit {block.exitCode}
                      </span>
                    </Show>
                  </div>

                  <div class="forge-block-toolbar__divider" />

                  <BlockActions command={block.command} output={block.output} isVisible={isHovered()} />
                </div>
              </div>
            </Show>
          );
        }}
      </For>
    </div>
  );
}
