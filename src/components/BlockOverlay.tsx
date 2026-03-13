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

export default function BlockOverlay(props: BlockOverlayProps) {
  return (
    <div class="forge-block-overlay" data-testid="block-overlay">
      <For each={props.blocks}>
        {(block) => (
          <Show when={block.top > -block.height && block.top < 2000}>
            <div
              class={`forge-block-divider ${block.exitCode !== 0 && block.exitCode !== null ? "forge-block-error" : ""} ${block.isRunning ? "forge-block-running" : ""}`}
              style={{
                top: `${block.top}px`,
                height: `${block.height}px`,
              }}
              data-testid={`block-${block.id}`}
            >
              <div class="forge-block-header">
                <span class="forge-block-command-label" title={block.command}>{block.command || "Command"}</span>
                <span class="forge-block-timestamp">{new Date(block.timestamp).toLocaleTimeString()}</span>
                <Show when={block.isRunning}>
                  <span class="forge-block-running-indicator" data-testid="running-indicator">Running...</span>
                </Show>
              </div>
              <div class="forge-block-border" />
              <BlockActions command={block.command} output={block.output} />
            </div>
          </Show>
        )}
      </For>
    </div>
  );
}
