import { For, Show, onCleanup, onMount } from "solid-js";
import { shellStore } from "../stores/shell";
import type { ShellType } from "../types/session";

interface NewTabDialogProps {
  onSelect: (shell: ShellType) => void;
  onClose: () => void;
}

export default function NewTabDialog(props: NewTabDialogProps) {
  let dialogRef!: HTMLDivElement;

  onMount(() => {
    if (shellStore.availableShells.length === 0 && !shellStore.loading) {
      void shellStore.loadShells();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        props.onClose();
      }
    };
    
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef && !dialogRef.contains(e.target as Node)) {
        props.onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    });
  });

  return (
    <div class="forge-dialog-overlay" data-testid="new-tab-dialog-overlay">
      <div ref={dialogRef} class="forge-dialog" data-testid="new-tab-dialog">
        <h3>New Tab</h3>
        
        <Show when={!shellStore.loading} fallback={<div style={{ color: "var(--text-secondary)" }}>Loading shells...</div>}>
          <Show when={!shellStore.error} fallback={<div style={{ color: "var(--error)" }}>{shellStore.error}</div>}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
              <For each={shellStore.availableShells}>
                {(shellInfo) => (
                  <button
                    class="forge-dialog-btn"
                    onClick={() => props.onSelect(shellInfo.shell_type)}
                    data-testid={`shell-option-${shellInfo.shell_type}`}
                  >
                    <span>{shellInfo.name}</span>
                    <span>
                      {shellInfo.shell_type === shellStore.defaultShell ? "(Default)" : ""}
                    </span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
