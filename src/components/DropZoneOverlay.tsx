import { Show } from "solid-js";
import type { DropZone } from "../types/pane";

interface DropZoneOverlayProps {
  activeZone: DropZone | null;
}

const ZONES: readonly DropZone[] = ["top", "bottom", "left", "right"];

export default function DropZoneOverlay(props: DropZoneOverlayProps) {
  return (
    <Show when={props.activeZone !== null}>
      <div class="forge-drop-zone-overlay" data-testid="drop-zone-overlay">
        {ZONES.map((zone) => (
          <div
            class={`forge-drop-zone forge-drop-zone--${zone}`}
            data-testid={`drop-zone-${zone}`}
            data-active={props.activeZone === zone}
          />
        ))}
      </div>
    </Show>
  );
}
