import { createSignal, For, onMount, onCleanup, Show } from "solid-js";
import { getCurrentPlatform, isMacPlatform } from "../utils/platform";

interface ShortcutEntry {
  keys: string;
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

function getShortcuts(): ShortcutGroup[] {
  const platform = getCurrentPlatform();
  const mod = isMacPlatform(platform) ? "⌘" : "Ctrl";
  const shift = isMacPlatform(platform) ? "⇧" : "Shift";
  const alt = isMacPlatform(platform) ? "⌥" : "Alt";

  return [
    {
      title: "Tabs",
      shortcuts: [
        { keys: `${mod}+T`, description: "New tab" },
        { keys: `${mod}+W`, description: "Close tab" },
        { keys: isMacPlatform(platform) ? `${mod}+${shift}+]` : "Ctrl+Tab", description: "Next tab" },
        { keys: isMacPlatform(platform) ? `${mod}+${shift}+[` : `Ctrl+${shift}+Tab`, description: "Previous tab" },
        { keys: isMacPlatform(platform) ? `${mod}+1-9` : `${alt}+1-9`, description: "Switch to tab N" },
      ],
    },
    {
      title: "Panes",
      shortcuts: [
        { keys: isMacPlatform(platform) ? `${mod}+D` : `Ctrl+${shift}+D`, description: "Split vertically" },
        { keys: isMacPlatform(platform) ? `${mod}+${shift}+D` : `Ctrl+${shift}+E`, description: "Split horizontally" },
        { keys: isMacPlatform(platform) ? `${mod}+W` : `Ctrl+${shift}+W`, description: "Close pane" },
        { keys: `${alt}+↑↓←→`, description: "Focus pane by direction" },
      ],
    },
    {
      title: "Sidebar",
      shortcuts: [
        { keys: `${mod}+B`, description: "Toggle sidebar" },
      ],
    },
    {
      title: "General",
      shortcuts: [
        { keys: `${mod}+/`, description: "Show keyboard shortcuts" },
      ],
    },
  ];
}

export const [isShortcutOverlayOpen, setIsShortcutOverlayOpen] = createSignal(false);

export default function ShortcutOverlay() {
  const shortcuts = getShortcuts();

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isShortcutOverlayOpen()) {
        e.preventDefault();
        setIsShortcutOverlayOpen(false);
      }
    };

    const handleClickOutside = () => {
      if (isShortcutOverlayOpen()) {
        setIsShortcutOverlayOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
    });

    const overlay = document.querySelector(".forge-shortcut-overlay__backdrop");
    overlay?.addEventListener("click", handleClickOutside);
  });

  return (
    <Show when={isShortcutOverlayOpen()}>
      <div
        class="forge-shortcut-overlay__backdrop"
        onClick={() => setIsShortcutOverlayOpen(false)}
        data-testid="shortcut-overlay-backdrop"
      >
        <div
          class="forge-shortcut-overlay"
          onClick={(e) => e.stopPropagation()}
          data-testid="shortcut-overlay"
        >
          <div class="forge-shortcut-overlay__header">
            <h2 class="forge-shortcut-overlay__title">Keyboard Shortcuts</h2>
            <button
              class="forge-btn-icon"
              onClick={() => setIsShortcutOverlayOpen(false)}
              title="Close"
              data-testid="btn-close-shortcuts"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div class="forge-shortcut-overlay__content">
            <For each={shortcuts}>
              {(group) => (
                <div class="forge-shortcut-group">
                  <h3 class="forge-shortcut-group__title">{group.title}</h3>
                  <For each={group.shortcuts}>
                    {(shortcut) => (
                      <div class="forge-shortcut-row">
                        <span class="forge-shortcut-row__description">{shortcut.description}</span>
                        <div class="forge-shortcut-row__keys">
                          <For each={shortcut.keys.split("+")}>
                            {(key) => <kbd class="forge-shortcut-key">{key}</kbd>}
                          </For>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
}
