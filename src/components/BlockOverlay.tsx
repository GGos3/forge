import { For, Show } from "solid-js";
import BlockActions from "./BlockActions";

export interface BlockUiItem {
  id: string;
  top: number;
  height: number;
  command: string;
  output: string;
  exitCode: number | null;
  timestamp: number;
  isRunning: boolean;
}

interface BlockOverlayProps {
  blocks: BlockUiItem[];
}

function blockStatus(block: BlockUiItem): "running" | "success" | "error" | "neutral" {
  if (block.isRunning) return "running";
  if (block.exitCode === null) return "neutral";
  return block.exitCode === 0 ? "success" : "error";
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function BlockOverlay(props: BlockOverlayProps) {
  return (
    <div class="forge-block-overlay" data-testid="block-overlay">
      <For each={props.blocks}>
        {(block) => (
          <Show when={block.top > -block.height && block.top < 2000}>
            <div
              class="forge-block-card"
              classList={{
                "forge-block-card--error": blockStatus(block) === "error",
                "forge-block-card--running": blockStatus(block) === "running",
                "forge-block-card--success": blockStatus(block) === "success",
              }}
              style={{
                top: `${block.top}px`,
                height: `${block.height}px`,
              }}
              data-testid={`block-${block.id}`}
            >
              <div class="forge-block-card__header">
                <div class="forge-block-card__status">
                  <Show when={blockStatus(block) === "success"}>
                    <svg class="forge-block-card__icon forge-block-card__icon--success" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" data-testid="status-success">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </Show>
                  <Show when={blockStatus(block) === "error"}>
                    <svg class="forge-block-card__icon forge-block-card__icon--error" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" data-testid="status-error">
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

              <BlockActions command={block.command} output={block.output} />
            </div>
          </Show>
        )}
      </For>
    </div>
  );
}
