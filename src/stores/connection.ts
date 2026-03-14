import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createStore, produce } from "solid-js/store";
import { editorStore } from "./editor";
import { explorerStore } from "./explorer";
import type {
  SshProfile,
  SshConnection,
  ConnectionStatus,
  SshConnectionLifecycleEvent,
  SshConnectionStatusPayload,
} from "../types/connection";

export interface HostKeyVerificationEvent {
  id: string;
  host: string;
  port: number;
  key_type: string;
  fingerprint: string;
  known_fingerprint?: string;
  mode: "first-use" | "mismatch";
}

export interface ConnectionState {
  profiles: SshProfile[];
  activeConnections: SshConnection[];
  selectedProfileId: string | null;
  loading: boolean;
  error: string | null;
  pendingHostKeyVerification: HostKeyVerificationEvent | null;
}

const [state, setState] = createStore<ConnectionState>({
  profiles: [],
  activeConnections: [],
  selectedProfileId: null,
  loading: false,
  error: null,
  pendingHostKeyVerification: null,
});

let lifecycleUnlisten: (() => void) | null = null;
let lifecycleListenPromise: Promise<void> | null = null;

let hostKeyUnlisten: (() => void) | null = null;
let hostKeyListenPromise: Promise<void> | null = null;

export async function ensureHostKeyListener(): Promise<void> {
  if (hostKeyUnlisten) return;
  if (hostKeyListenPromise) return hostKeyListenPromise;

  hostKeyListenPromise = listen<HostKeyVerificationEvent>(
    "ssh://host-key-verification",
    (event) => {
      setState("pendingHostKeyVerification", event.payload);
    }
  ).then((unlisten) => {
    hostKeyUnlisten = unlisten;
    hostKeyListenPromise = null;
  });

  return hostKeyListenPromise;
}

export function _resetHostKeyListenerForTesting(): void {
  if (hostKeyUnlisten) {
    hostKeyUnlisten();
    hostKeyUnlisten = null;
  }
  hostKeyListenPromise = null;
}

function setConnectionStatus(profileId: string, status: ConnectionStatus, error?: string) {
  setState(
    produce((s) => {
      const idx = s.activeConnections.findIndex((c) => c.profile.id === profileId);
      if (idx >= 0) {
        s.activeConnections[idx].status = status;
        s.activeConnections[idx].error = error;
      }
    })
  );
}

async function ensureLifecycleListener(): Promise<void> {
  if (lifecycleUnlisten) {
    return;
  }

  if (lifecycleListenPromise) {
    return lifecycleListenPromise;
  }

  lifecycleListenPromise = listen<SshConnectionLifecycleEvent>("ssh-connection-lifecycle", (event) => {
    const payload = event.payload;
    if (!payload) {
      return;
    }

    if (payload.status === "connected") {
      setState(
        produce((s) => {
          const idx = s.activeConnections.findIndex((c) => c.profile.id === payload.profileId);
          if (idx >= 0) {
            s.activeConnections[idx].connectionId = payload.connectionId;
            s.activeConnections[idx].status = "connected";
            s.activeConnections[idx].error = undefined;
          }
        })
      );
      return;
    }

    if (payload.status === "disconnected") {
      setState(
        produce((s) => {
          const idx = s.activeConnections.findIndex((c) => c.profile.id === payload.profileId);
          if (idx >= 0) {
            s.activeConnections[idx].status = "disconnected";
            s.activeConnections[idx].error = payload.reason;
          }
        })
      );

      explorerStore.handleConnectionDisconnected(payload.connectionId);
      editorStore.handleConnectionDisconnected(payload.connectionId);
    }
  }).then((unlisten) => {
    lifecycleUnlisten = unlisten;
    lifecycleListenPromise = null;
  });

  return lifecycleListenPromise;
}

export const connectionStore = {
  get profiles() {
    return state.profiles;
  },

  get activeConnections() {
    return state.activeConnections;
  },

  get selectedProfileId() {
    return state.selectedProfileId;
  },

  get loading() {
    return state.loading;
  },

  get error() {
    return state.error;
  },

  get pendingHostKeyVerification() {
    return state.pendingHostKeyVerification;
  },

  selectProfile(id: string | null) {
    setState("selectedProfileId", id);
  },

  clearError() {
    setState("error", null);
  },

  setPendingHostKeyVerification(event: HostKeyVerificationEvent | null) {
    setState("pendingHostKeyVerification", event);
  },

  clearPendingHostKeyVerification() {
    setState("pendingHostKeyVerification", null);
  },

  async loadProfiles(): Promise<void> {
    await ensureLifecycleListener();
    void ensureHostKeyListener();
    setState("loading", true);
    setState("error", null);
    try {
      const profiles = await invoke<SshProfile[]>("list_connections");
      setState("profiles", Array.isArray(profiles) ? profiles : []);
    } catch (e) {
      setState("error", e instanceof Error ? e.message : String(e));
    } finally {
      setState("loading", false);
    }
  },

  async saveProfile(profile: SshProfile): Promise<void> {
    await invoke("save_connection", { profile });
    setState(
      produce((s) => {
        const idx = s.profiles.findIndex((p) => p.id === profile.id);
        if (idx >= 0) {
          s.profiles[idx] = profile;
        } else {
          s.profiles.push(profile);
        }
      })
    );
  },

  async deleteProfile(id: string): Promise<void> {
    await invoke("delete_connection", { id });
    setState(
      produce((s) => {
        s.profiles = s.profiles.filter((p) => p.id !== id);
        if (s.selectedProfileId === id) {
          s.selectedProfileId = null;
        }
        s.activeConnections = s.activeConnections.filter((c) => c.profile.id !== id);
      })
    );
  },

  async connect(profileId: string, password?: string, keyPassphrase?: string): Promise<void> {
    await ensureLifecycleListener();
    const profile = state.profiles.find((p) => p.id === profileId);
    if (!profile) return;

    const existing = state.activeConnections.find((c) => c.profile.id === profileId);
    if (existing && (existing.status === "connected" || existing.status === "connecting")) {
      return;
    }

    setState(
      produce((s) => {
        const idx = s.activeConnections.findIndex((c) => c.profile.id === profileId);
        const entry: SshConnection = { profile, status: "connecting" };
        if (idx >= 0) {
          s.activeConnections[idx] = entry;
        } else {
          s.activeConnections.push(entry);
        }
      })
    );

    try {
      const status = await invoke<SshConnectionStatusPayload>("connect_ssh", {
        profile,
        password: password ?? null,
        keyPassphrase: keyPassphrase ?? null,
      });
      setState(
        produce((s) => {
          const idx = s.activeConnections.findIndex((c) => c.profile.id === profileId);
          if (idx >= 0) {
            s.activeConnections[idx].connectionId = status.connectionId;
          }
        })
      );
      setConnectionStatus(profileId, "connected");
    } catch (e) {
      setConnectionStatus(profileId, "error", e instanceof Error ? e.message : String(e));
    }
  },

  async disconnect(profileId: string): Promise<void> {
    await ensureLifecycleListener();
    const conn = state.activeConnections.find((c) => c.profile.id === profileId);
    if (!conn) return;

    try {
      await invoke("disconnect_ssh", { connection_id: conn.connectionId ?? profileId });
    } catch (e) {
      setState("error", e instanceof Error ? e.message : String(e));
    } finally {
      setState(
        produce((s) => {
          const idx = s.activeConnections.findIndex((c) => c.profile.id === profileId);
          if (idx >= 0) {
            s.activeConnections[idx].status = "disconnected";
            s.activeConnections[idx].error = undefined;
          }
        })
      );
    }
  },

  async testConnection(profile: SshProfile, password?: string, keyPassphrase?: string): Promise<boolean> {
    return invoke<boolean>("test_connection", {
      profile,
      password: password ?? null,
      keyPassphrase: keyPassphrase ?? null,
    });
  },
};
