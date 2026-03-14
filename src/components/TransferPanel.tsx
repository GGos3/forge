import { For, Show } from "solid-js";
import { transferStore } from "../stores/transfer";
import type { TransferItem } from "../types/port-forward";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(startMs: number, endMs?: number): string {
  const elapsed = (endMs ?? Date.now()) - startMs;
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function progressPercent(item: TransferItem): number {
  if (item.bytesTotal === 0) return item.status === "completed" ? 100 : 0;
  return Math.round((item.bytesTransferred / item.bytesTotal) * 100);
}

export default function TransferPanel() {
  return (
    <div class="forge-transfer-panel" data-testid="transfer-panel">
      <div class="forge-connection-header">
        <h2 class="forge-connection-header__title">
          Transfers
          <Show when={transferStore.activeCount > 0}>
            <span class="forge-transfer-badge" data-testid="active-count">
              {transferStore.activeCount}
            </span>
          </Show>
        </h2>
        <Show when={transferStore.completedItems.length > 0}>
          <button
            class="forge-btn-icon"
            onClick={() => transferStore.clearCompleted()}
            title="Clear Completed"
            data-testid="btn-clear-transfers"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </Show>
      </div>

      <div class="forge-connection-list">
        <For each={transferStore.items}>
          {(item) => (
            <div
              class="forge-transfer-item"
              classList={{
                "forge-transfer-item--error": item.status === "error",
                "forge-transfer-item--completed": item.status === "completed",
              }}
              data-testid={`transfer-${item.id}`}
            >
              <div class="forge-transfer-item__info">
                <div class="forge-transfer-item__row">
                  <svg class="forge-transfer-item__direction" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <Show when={item.direction === "upload"} fallback={
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    }>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                    </Show>
                  </svg>
                  <span class="forge-transfer-item__name" title={item.fileName}>
                    {item.fileName}
                  </span>
                  <span class="forge-transfer-item__size">
                    {formatBytes(item.bytesTransferred)}
                    {item.bytesTotal > 0 ? ` / ${formatBytes(item.bytesTotal)}` : ""}
                  </span>
                </div>

                <Show when={item.status === "active" || item.status === "queued"}>
                  <div class="forge-transfer-item__progress-bar">
                    <div
                      class="forge-transfer-item__progress-fill"
                      style={{ width: `${progressPercent(item)}%` }}
                    />
                  </div>
                </Show>

                <div class="forge-transfer-item__meta">
                  <Show when={item.status === "active"}>
                    <span class="forge-transfer-item__status forge-transfer-item__status--active">
                      {progressPercent(item)}%
                    </span>
                  </Show>
                  <Show when={item.status === "queued"}>
                    <span class="forge-transfer-item__status">Queued</span>
                  </Show>
                  <Show when={item.status === "completed"}>
                    <span class="forge-transfer-item__status forge-transfer-item__status--success">
                      Done ({formatDuration(item.startedAt, item.completedAt)})
                    </span>
                  </Show>
                  <Show when={item.status === "error"}>
                    <span class="forge-transfer-item__status forge-transfer-item__status--error" title={item.error}>
                      Failed: {item.error}
                    </span>
                  </Show>
                </div>
              </div>

              <button
                class="forge-btn-icon forge-btn-icon--xs"
                onClick={() => transferStore.removeItem(item.id)}
                title="Remove"
                data-testid={`btn-remove-transfer-${item.id}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}
        </For>

        <Show when={transferStore.items.length === 0}>
          <div class="forge-connection-empty">
            No active transfers.
          </div>
        </Show>
      </div>
    </div>
  );
}
