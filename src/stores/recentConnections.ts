import { createStore, produce } from "solid-js/store";
import type { RecentConnection, SshProfile } from "../types/connection";

const STORAGE_KEY = "forge-recent-connections";
const MAX_RECENT = 10;

function loadFromStorage(): RecentConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as RecentConnection[];
  } catch {
    return [];
  }
}

function saveToStorage(items: RecentConnection[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // intentionally ignored
  }
}

interface RecentConnectionsState {
  items: RecentConnection[];
}

const [state, setState] = createStore<RecentConnectionsState>({
  items: loadFromStorage(),
});

export const recentConnectionsStore = {
  get items(): RecentConnection[] {
    return state.items;
  },

  recordConnection(profile: SshProfile): void {
    const entry: RecentConnection = {
      profileId: profile.id,
      profileName: profile.name,
      host: profile.host,
      port: profile.port,
      username: profile.username,
      lastConnected: Date.now(),
    };

    setState(
      produce((s) => {
        s.items = s.items.filter((item) => item.profileId !== profile.id);
        s.items.unshift(entry);
        if (s.items.length > MAX_RECENT) {
          s.items = s.items.slice(0, MAX_RECENT);
        }
      }),
    );

    saveToStorage(state.items);
  },

  removeEntry(profileId: string): void {
    setState(
      produce((s) => {
        s.items = s.items.filter((item) => item.profileId !== profileId);
      }),
    );
    saveToStorage(state.items);
  },

  clearAll(): void {
    setState("items", []);
    saveToStorage([]);
  },

  _resetForTesting(): void {
    setState("items", loadFromStorage());
  },
};
