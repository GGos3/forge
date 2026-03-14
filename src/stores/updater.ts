import { invoke } from "@tauri-apps/api/core";
import { createStore } from "solid-js/store";

export type ReleaseChannel = "dev" | "prod";

interface UpdaterState {
  channel: ReleaseChannel;
  checking: boolean;
  downloading: boolean;
  available: boolean;
  version: string | null;
  currentVersion: string | null;
  notes: string | null;
  error: string | null;
}

interface UpdateMetadata {
  version: string;
  currentVersion: string;
  notes: string | null;
}

const [state, setState] = createStore<UpdaterState>({
  channel: import.meta.env.VITE_FORGE_RELEASE_CHANNEL === "dev" ? "dev" : "prod",
  checking: false,
  downloading: false,
  available: false,
  version: null,
  currentVersion: null,
  notes: null,
  error: null,
});

let hasChecked = false;

function normalizeUpdaterError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isIgnorableStartupError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("valid release json") || normalized.includes("latest.json") || normalized.includes("release json from remote");
}

export const updaterStore = {
  get channel() {
    return state.channel;
  },
  get checking() {
    return state.checking;
  },
  get downloading() {
    return state.downloading;
  },
  get available() {
    return state.available;
  },
  get version() {
    return state.version;
  },
  get currentVersion() {
    return state.currentVersion;
  },
  get notes() {
    return state.notes;
  },
  get error() {
    return state.error;
  },
  async checkForUpdates(force = false) {
    if (hasChecked && !force) return;

    setState({ checking: true, error: null });
    try {
      const update = await invoke<UpdateMetadata | null>("check_for_updates", {
        channel: state.channel,
      });
      hasChecked = true;

      if (update) {
        setState({
          available: true,
          version: update.version,
          currentVersion: update.currentVersion,
          notes: update.notes ?? null,
        });
      } else {
        setState({
          available: false,
          version: null,
          currentVersion: null,
          notes: null,
        });
      }
    } catch (error) {
      const message = normalizeUpdaterError(error);
      if (force || !isIgnorableStartupError(message)) {
        setState({ error: message });
      } else {
        setState({ error: null, available: false, version: null, currentVersion: null, notes: null });
      }
    } finally {
      setState({ checking: false });
    }
  },
  async installUpdate() {
    setState({ downloading: true, error: null });
    try {
      await invoke("install_update", { channel: state.channel });
    } catch (error) {
      setState({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setState({ downloading: false });
    }
  },
  _resetForTesting() {
    hasChecked = false;
    setState({
      channel: import.meta.env.VITE_FORGE_RELEASE_CHANNEL === "dev" ? "dev" : "prod",
      checking: false,
      downloading: false,
      available: false,
      version: null,
      currentVersion: null,
      notes: null,
      error: null,
    });
  },
};
