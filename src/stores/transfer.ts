import { invoke } from "@tauri-apps/api/core";
import { createStore, produce } from "solid-js/store";
import type { TransferItem, TransferDirection } from "../types/port-forward";

interface TransferState {
  items: TransferItem[];
}

const [state, setState] = createStore<TransferState>({
  items: [],
});

export const transferStore = {
  get items() {
    return state.items;
  },

  get activeCount(): number {
    return state.items.filter((t) => t.status === "active" || t.status === "queued").length;
  },

  get completedItems(): TransferItem[] {
    return state.items.filter((t) => t.status === "completed" || t.status === "error");
  },

  enqueue(params: {
    connectionId: string;
    localPath: string;
    remotePath: string;
    direction: TransferDirection;
    fileName: string;
    bytesTotal: number;
  }): string {
    const id = crypto.randomUUID();
    const item: TransferItem = {
      id,
      ...params,
      status: "queued",
      bytesTransferred: 0,
      startedAt: Date.now(),
    };

    setState(
      produce((s) => {
        s.items.push(item);
      }),
    );

    void this._processNext();
    return id;
  },

  async _processNext(): Promise<void> {
    const activeItems = state.items.filter((t) => t.status === "active");
    if (activeItems.length > 0) return;

    const nextQueued = state.items.find((t) => t.status === "queued");
    if (!nextQueued) return;

    setState(
      produce((s) => {
        const item = s.items.find((t) => t.id === nextQueued.id);
        if (item) item.status = "active";
      }),
    );

    try {
      if (nextQueued.direction === "download") {
        const content = await invoke<number[]>("read_remote_file", {
          connection_id: nextQueued.connectionId,
          path: nextQueued.remotePath,
        });

        setState(
          produce((s) => {
            const item = s.items.find((t) => t.id === nextQueued.id);
            if (item) {
              item.bytesTransferred = content.length;
              item.status = "completed";
              item.completedAt = Date.now();
            }
          }),
        );
      } else {
        await invoke("write_remote_file", {
          connection_id: nextQueued.connectionId,
          path: nextQueued.remotePath,
          content: [],
        });

        setState(
          produce((s) => {
            const item = s.items.find((t) => t.id === nextQueued.id);
            if (item) {
              item.bytesTransferred = item.bytesTotal;
              item.status = "completed";
              item.completedAt = Date.now();
            }
          }),
        );
      }
    } catch (err) {
      setState(
        produce((s) => {
          const item = s.items.find((t) => t.id === nextQueued.id);
          if (item) {
            item.status = "error";
            item.error = err instanceof Error ? err.message : String(err);
            item.completedAt = Date.now();
          }
        }),
      );
    }

    void this._processNext();
  },

  clearCompleted(): void {
    setState(
      produce((s) => {
        s.items = s.items.filter((t) => t.status === "queued" || t.status === "active");
      }),
    );
  },

  removeItem(id: string): void {
    setState(
      produce((s) => {
        s.items = s.items.filter((t) => t.id !== id);
      }),
    );
  },

  _resetForTesting(): void {
    setState({ items: [] });
  },
};
