import { createStore, produce } from "solid-js/store";
import type { PortForwardRule } from "../types/port-forward";

const STORAGE_KEY = "forge-port-forwards";

interface PortForwardState {
  rules: PortForwardRule[];
}

function loadFromStorage(): PortForwardRule[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed as PortForwardRule[];
    }
  } catch { void 0; }
  return [];
}

function saveToStorage(rules: PortForwardRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch { void 0; }
}

const [state, setState] = createStore<PortForwardState>({
  rules: loadFromStorage(),
});

export const portForwardStore = {
  get rules() {
    return state.rules;
  },

  getByProfile(profileId: string): PortForwardRule[] {
    return state.rules.filter((r) => r.profileId === profileId);
  },

  add(rule: PortForwardRule): void {
    setState(
      produce((s) => {
        s.rules.push(rule);
      }),
    );
    saveToStorage(state.rules);
  },

  update(id: string, updates: Partial<Omit<PortForwardRule, "id">>): void {
    setState(
      produce((s) => {
        const idx = s.rules.findIndex((r) => r.id === id);
        if (idx >= 0) {
          Object.assign(s.rules[idx], updates);
        }
      }),
    );
    saveToStorage(state.rules);
  },

  remove(id: string): void {
    setState(
      produce((s) => {
        s.rules = s.rules.filter((r) => r.id !== id);
      }),
    );
    saveToStorage(state.rules);
  },

  toggle(id: string): void {
    setState(
      produce((s) => {
        const rule = s.rules.find((r) => r.id === id);
        if (rule) {
          rule.enabled = !rule.enabled;
        }
      }),
    );
    saveToStorage(state.rules);
  },

  _resetForTesting(): void {
    setState({ rules: [] });
    localStorage.removeItem(STORAGE_KEY);
  },
};
