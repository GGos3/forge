import { createSignal, onMount, Show } from "solid-js";

interface ForgeSettings {
  fontFamily: string;
  fontSize: number;
  cursorStyle: "block" | "underline" | "bar";
  scrollback: number;
  copyOnSelect: boolean;
}

const STORAGE_KEY = "forge-settings";

function loadSettings(): ForgeSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) as Partial<ForgeSettings> };
    }
  } catch { void 0; }
  return { ...defaultSettings };
}

function saveSettings(settings: ForgeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { void 0; }
}

const defaultSettings: ForgeSettings = {
  fontFamily: "JetBrains Mono",
  fontSize: 14,
  cursorStyle: "block",
  scrollback: 5000,
  copyOnSelect: false,
};

export default function SettingsPanel() {
  const [settings, setSettings] = createSignal<ForgeSettings>(loadSettings());
  const [saved, setSaved] = createSignal(false);

  onMount(() => {
    setSettings(loadSettings());
  });

  const updateSetting = <K extends keyof ForgeSettings>(key: K, value: ForgeSettings[K]) => {
    const updated = { ...settings(), [key]: value };
    setSettings(updated);
    saveSettings(updated);
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
              value={settings().fontFamily}
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
              value={settings().fontSize}
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
              value={settings().cursorStyle}
              onChange={(e) => updateSetting("cursorStyle", e.currentTarget.value as ForgeSettings["cursorStyle"])}
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
              value={settings().scrollback}
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
              checked={settings().copyOnSelect}
              onChange={(e) => updateSetting("copyOnSelect", e.currentTarget.checked)}
              data-testid="setting-copy-on-select"
            />
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
