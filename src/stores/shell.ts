import { createStore } from "solid-js/store";
import { invoke } from "@tauri-apps/api/core";
import type { ShellInfo, ShellType } from "../types/session";

export interface ShellState {
  availableShells: ShellInfo[];
  defaultShell: ShellType | null;
  loading: boolean;
  error: string | null;
}

const [state, setState] = createStore<ShellState>({
  availableShells: [],
  defaultShell: null,
  loading: false,
  error: null,
});

export const shellStore = {
  get availableShells() {
    return state.availableShells;
  },

  get defaultShell() {
    return state.defaultShell;
  },

  get loading() {
    return state.loading;
  },

  get error() {
    return state.error;
  },

  reset() {
    setState({
      availableShells: [],
      defaultShell: null,
      loading: false,
      error: null,
    });
  },

  async loadShells() {
    setState("loading", true);
    setState("error", null);

    try {
      const shells = await invoke<ShellInfo[]>("list_available_shells");
      const defaultShell = await invoke<ShellType>("get_default_shell");

      setState("availableShells", shells);
      setState("defaultShell", defaultShell);
    } catch (e) {
      setState("error", e instanceof Error ? e.message : String(e));
    } finally {
      setState("loading", false);
    }
  },
};
