import { createStore } from "solid-js/store";
import type { ForgeColorTheme, ForgeSettings } from "../types/settings";

const STORAGE_KEY = "forge-settings";

const defaultSettings: ForgeSettings = {
  fontFamily: "JetBrains Mono",
  fontSize: 14,
  cursorStyle: "block",
  scrollback: 5000,
  copyOnSelect: false,
  colorTheme: "purple",
};

function isValidColorTheme(value: unknown): value is ForgeColorTheme {
  return value === "purple" || value === "blue" || value === "green" || value === "amber";
}

function loadStoredSettings(): ForgeSettings {
  if (typeof localStorage === "undefined") {
    return { ...defaultSettings };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { ...defaultSettings };
    }

    const parsed = JSON.parse(stored) as Partial<ForgeSettings>;
    return {
      ...defaultSettings,
      ...parsed,
      colorTheme: isValidColorTheme(parsed.colorTheme) ? parsed.colorTheme : defaultSettings.colorTheme,
    };
  } catch (error) {
    void error;
    return { ...defaultSettings };
  }
}

function persistSettings(settings: ForgeSettings): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    void error;
  }
}

function applyColorTheme(theme: ForgeColorTheme): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.colorTheme = theme;
}

const [state, setState] = createStore<ForgeSettings>({ ...defaultSettings });

export const settingsStore = {
  get settings() {
    return state;
  },

  get colorTheme() {
    return state.colorTheme;
  },

  load() {
    const loaded = loadStoredSettings();
    setState(loaded);
    applyColorTheme(loaded.colorTheme);
  },

  updateSetting<K extends keyof ForgeSettings>(key: K, value: ForgeSettings[K]) {
    const nextSettings: ForgeSettings = {
      ...state,
      [key]: value,
    };

    setState(nextSettings);
    persistSettings(nextSettings);

    if (key === "colorTheme") {
      applyColorTheme(value as ForgeColorTheme);
    }
  },

  _resetForTesting() {
    setState({ ...defaultSettings });
    applyColorTheme(defaultSettings.colorTheme);

    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  },
};

export { STORAGE_KEY as FORGE_SETTINGS_STORAGE_KEY, defaultSettings as defaultForgeSettings };
