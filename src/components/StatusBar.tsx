import { Component, For } from "solid-js";
import { getCurrentPlatform, isMacPlatform } from "../utils/platform";

interface ShortcutItem {
  key: string;
  label: string;
}

interface ShortcutGroup {
  items: ShortcutItem[];
}

function getShortcutGroups(): ShortcutGroup[] {
  const platform = getCurrentPlatform();
  const mod = isMacPlatform(platform) ? "⌘" : "Ctrl";
  const shift = isMacPlatform(platform) ? "⇧" : "Shift";
  const alt = isMacPlatform(platform) ? "⌥" : "Alt";

  return [
    {
      items: [
        { key: `${mod}T`, label: "new" },
        { key: `${mod}W`, label: "close" },
        { key: isMacPlatform(platform) ? `${mod}${shift}]` : "Ctrl+Tab", label: "next" },
      ],
    },
    {
      items: [
        { key: isMacPlatform(platform) ? `${mod}D` : `Ctrl+${shift}+D`, label: "split" },
        { key: isMacPlatform(platform) ? `${mod}${shift}D` : `Ctrl+${shift}+E`, label: "h-split" },
        { key: `${alt}+↑↓←→`, label: "focus" },
      ],
    },
    {
      items: [
        { key: `${mod}B`, label: "sidebar" },
        { key: `${mod}/`, label: "shortcuts" },
      ],
    },
  ];
}

const StatusBar: Component = () => {
  const groups = getShortcutGroups();

  return (
    <div class="forge-shortcut-bar" data-testid="status-bar">
      <div class="forge-shortcut-bar__content">
        <For each={groups}>
          {(group, groupIndex) => (
            <>
              <For each={group.items}>
                {(item, itemIndex) => (
                  <>
                    <span class="forge-shortcut-bar__item">
                      <span class="forge-shortcut-bar__key" data-testid="shortcut-key">{item.key}</span>
                      <span class="forge-shortcut-bar__label">{item.label}</span>
                    </span>
                    {itemIndex() < group.items.length - 1 && (
                      <span class="forge-shortcut-bar__dot">·</span>
                    )}
                  </>
                )}
              </For>
              {groupIndex() < groups.length - 1 && (
                <span class="forge-shortcut-bar__sep">│</span>
              )}
            </>
          )}
        </For>
      </div>
    </div>
  );
};

export default StatusBar;
