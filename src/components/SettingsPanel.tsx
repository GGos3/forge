import { createSignal, onMount, Show } from "solid-js";
import { settingsStore } from "../stores/settings";

export default function SettingsPanel() {
  const [saved, setSaved] = createSignal(false);

  onMount(() => {
    settingsStore.load();
  });

  const updateSetting = <K extends keyof typeof settingsStore.settings>(key: K, value: (typeof settingsStore.settings)[K]) => {
    settingsStore.updateSetting(key, value);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div class="forge-settings-panel" data-testid="settings-panel">
      <div class="forge-connection-header">
        <h2 class="forge-connection-header__title">
          Settings
          <Show when={saved()}>
            <span class="forge-settings-saved" data-testid="settings-saved">Saved</span>
          </Show>
        </h2>
      </div>

      <div class="forge-settings-content">
        <div class="forge-settings-section">
          <h3 class="forge-settings-section__title">Terminal</h3>

          <div class="forge-settings-row">
            <label class="forge-settings-row__label" for="setting-font">Font Family</label>
              <input
                id="setting-font"
                type="text"
                class="forge-input"
                value={settingsStore.settings.fontFamily}
                onInput={(e) => updateSetting("fontFamily", e.currentTarget.value)}
                data-testid="setting-font-family"
              />
          </div>

          <div class="forge-settings-row">
            <label class="forge-settings-row__label" for="setting-font-size">Font Size</label>
              <input
                id="setting-font-size"
                type="number"
                class="forge-input forge-settings-number"
                value={settingsStore.settings.fontSize}
                min={8}
                max={32}
                onInput={(e) => updateSetting("fontSize", parseInt(e.currentTarget.value, 10) || 14)}
              data-testid="setting-font-size"
            />
          </div>

          <div class="forge-settings-row">
            <label class="forge-settings-row__label" for="setting-cursor">Cursor Style</label>
              <select
                id="setting-cursor"
                class="forge-input"
                value={settingsStore.settings.cursorStyle}
                onChange={(e) => updateSetting("cursorStyle", e.currentTarget.value as typeof settingsStore.settings.cursorStyle)}
                data-testid="setting-cursor-style"
              >
              <option value="block">Block</option>
              <option value="underline">Underline</option>
              <option value="bar">Bar</option>
            </select>
          </div>

          <div class="forge-settings-row">
            <label class="forge-settings-row__label" for="setting-scrollback">Scrollback Lines</label>
              <input
                id="setting-scrollback"
                type="number"
                class="forge-input forge-settings-number"
                value={settingsStore.settings.scrollback}
                min={1000}
                max={100000}
                step={1000}
              onInput={(e) => updateSetting("scrollback", parseInt(e.currentTarget.value, 10) || 5000)}
              data-testid="setting-scrollback"
            />
          </div>

          <div class="forge-settings-row">
            <label class="forge-settings-row__label" for="setting-copy-select">Copy on Select</label>
              <input
                id="setting-copy-select"
                type="checkbox"
                class="forge-settings-checkbox"
                checked={settingsStore.settings.copyOnSelect}
                onChange={(e) => updateSetting("copyOnSelect", e.currentTarget.checked)}
                data-testid="setting-copy-on-select"
              />
            </div>

            <div class="forge-settings-row">
              <label class="forge-settings-row__label" for="setting-color-theme">App Color</label>
              <select
                id="setting-color-theme"
                class="forge-input"
                value={settingsStore.settings.colorTheme}
                onChange={(e) => updateSetting("colorTheme", e.currentTarget.value as typeof settingsStore.settings.colorTheme)}
                data-testid="setting-color-theme"
              >
                <option value="purple">Purple</option>
                <option value="blue">Blue</option>
                <option value="green">Green</option>
                <option value="amber">Amber</option>
              </select>
            </div>
          </div>

        <div class="forge-settings-section">
          <h3 class="forge-settings-section__title">About</h3>
          <div class="forge-settings-about">
            <span class="forge-settings-about__name">Forge Terminal</span>
            <span class="forge-settings-about__version">v0.1.0</span>
            <span class="forge-settings-about__tech">Tauri 2 + SolidJS + xterm.js</span>
          </div>
        </div>
      </div>
    </div>
  );
}
