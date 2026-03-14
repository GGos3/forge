import { createStore, produce } from "solid-js/store";
import type { SshSnippet } from "../types/connection";

const STORAGE_KEY = "forge-snippets";

interface SnippetState {
  items: SshSnippet[];
}

function loadFromStorage(): SshSnippet[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed as SshSnippet[];
    }
  } catch { void 0; }
  return [];
}

function saveToStorage(items: SshSnippet[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { void 0; }
}

const [state, setState] = createStore<SnippetState>({
  items: loadFromStorage(),
});

export function substituteVariables(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in vars ? vars[key] : match;
  });
}

export const snippetStore = {
  get items() {
    return state.items;
  },

  add(snippet: SshSnippet): void {
    setState(
      produce((s) => {
        s.items.push(snippet);
      }),
    );
    saveToStorage(state.items);
  },

  update(id: string, updates: Partial<Omit<SshSnippet, "id">>): void {
    setState(
      produce((s) => {
        const idx = s.items.findIndex((item) => item.id === id);
        if (idx >= 0) {
          Object.assign(s.items[idx], updates);
        }
      }),
    );
    saveToStorage(state.items);
  },

  remove(id: string): void {
    setState(
      produce((s) => {
        s.items = s.items.filter((item) => item.id !== id);
      }),
    );
    saveToStorage(state.items);
  },

  getById(id: string): SshSnippet | undefined {
    return state.items.find((item) => item.id === id);
  },

  filterByTag(tag: string): SshSnippet[] {
    return state.items.filter((item) => item.tags?.includes(tag));
  },

  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const item of state.items) {
      if (item.tags) {
        for (const tag of item.tags) {
          tags.add(tag);
        }
      }
    }
    return [...tags].sort();
  },

  _resetForTesting(): void {
    setState({ items: [] });
    localStorage.removeItem(STORAGE_KEY);
  },
};
