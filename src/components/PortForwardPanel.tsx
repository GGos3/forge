import { createSignal, For, Show } from "solid-js";
import { portForwardStore } from "../stores/portForward";
import type { PortForwardRule, PortForwardDirection } from "../types/port-forward";

export default function PortForwardPanel() {
  const [isEditing, setIsEditing] = createSignal(false);
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [direction, setDirection] = createSignal<PortForwardDirection>("local");
  const [localPort, setLocalPort] = createSignal("");
  const [remoteHost, setRemoteHost] = createSignal("localhost");
  const [remotePort, setRemotePort] = createSignal("");
  const [label, setLabel] = createSignal("");

  const resetForm = () => {
    setDirection("local");
    setLocalPort("");
    setRemoteHost("localhost");
    setRemotePort("");
    setLabel("");
    setEditingId(null);
    setIsEditing(false);
  };

  const handleNew = () => {
    resetForm();
    setIsEditing(true);
  };

  const handleEdit = (rule: PortForwardRule, e: Event) => {
    e.stopPropagation();
    setEditingId(rule.id);
    setDirection(rule.direction);
    setLocalPort(String(rule.localPort));
    setRemoteHost(rule.remoteHost);
    setRemotePort(String(rule.remotePort));
    setLabel(rule.label ?? "");
    setIsEditing(true);
  };

  const handleSave = () => {
    const lp = parseInt(localPort(), 10);
    const rp = parseInt(remotePort(), 10);
    if (isNaN(lp) || isNaN(rp) || lp <= 0 || rp <= 0 || lp > 65535 || rp > 65535) return;

    const ruleData: Omit<PortForwardRule, "id"> = {
      profileId: "",
      direction: direction(),
      localPort: lp,
      remoteHost: remoteHost().trim() || "localhost",
      remotePort: rp,
      label: label().trim() || undefined,
      enabled: true,
    };

    if (editingId()) {
      portForwardStore.update(editingId()!, ruleData);
    } else {
      portForwardStore.add({ id: crypto.randomUUID(), ...ruleData });
    }

    resetForm();
  };

  const handleDelete = (id: string, e: Event) => {
    e.stopPropagation();
    portForwardStore.remove(id);
  };

  return (
    <div class="forge-portfwd-panel" data-testid="port-forward-panel">
      <div class="forge-connection-header">
        <h2 class="forge-connection-header__title">Port Forwarding</h2>
        <button
          class="forge-btn-icon"
          onClick={handleNew}
          title="New Rule"
          data-testid="btn-new-portfwd"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div class="forge-portfwd-notice" data-testid="portfwd-notice">
        Port forwarding requires backend support. Rules saved here will apply when the feature becomes available.
      </div>

      <div class="forge-connection-list">
        <For each={portForwardStore.rules}>
          {(rule) => (
            <div
              class="forge-portfwd-item"
              classList={{ "forge-portfwd-item--disabled": !rule.enabled }}
              data-testid={`portfwd-${rule.id}`}
            >
              <div class="forge-portfwd-item__info">
                <div class="forge-portfwd-item__row">
                  <span class="forge-portfwd-item__direction-badge">
                    {rule.direction === "local" ? "L" : "R"}
                  </span>
                  <span class="forge-portfwd-item__mapping">
                    {rule.localPort} → {rule.remoteHost}:{rule.remotePort}
                  </span>
                </div>
                <Show when={rule.label}>
                  <span class="forge-portfwd-item__label">{rule.label}</span>
                </Show>
              </div>

              <div class="forge-connection-actions">
                <button
                  class="forge-btn-icon"
                  onClick={() => portForwardStore.toggle(rule.id)}
                  title={rule.enabled ? "Disable" : "Enable"}
                  data-testid={`btn-toggle-${rule.id}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <Show when={rule.enabled} fallback={
                      <circle cx="12" cy="12" r="10" />
                    }>
                      <>
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="9 12 11 14 15 10" />
                      </>
                    </Show>
                  </svg>
                </button>
                <button
                  class="forge-btn-icon"
                  onClick={(e) => handleEdit(rule, e)}
                  title="Edit"
                  data-testid={`btn-edit-portfwd-${rule.id}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  class="forge-btn-icon forge-btn-icon--danger"
                  onClick={(e) => handleDelete(rule.id, e)}
                  title="Delete"
                  data-testid={`btn-delete-portfwd-${rule.id}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </For>

        <Show when={portForwardStore.rules.length === 0}>
          <div class="forge-connection-empty">
            No port forwarding rules.<br />
            Click + to add one.
          </div>
        </Show>
      </div>

      <Show when={isEditing()}>
        <div class="forge-dialog-overlay" data-testid="portfwd-editor-overlay">
          <div class="forge-connection-dialog" data-testid="portfwd-editor">
            <h3>{editingId() ? "Edit Rule" : "New Port Forward"}</h3>

            <div class="forge-connection-form">
              <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
                <label for="pf-direction">Direction</label>
                <select
                  id="pf-direction"
                  class="forge-input"
                  value={direction()}
                  onChange={(e) => setDirection(e.currentTarget.value as PortForwardDirection)}
                  data-testid="select-direction"
                >
                  <option value="local">Local → Remote</option>
                  <option value="remote">Remote → Local</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <div style={{ flex: 1, display: "flex", "flex-direction": "column", gap: "4px" }}>
                  <label for="pf-local-port">Local Port</label>
                  <input
                    id="pf-local-port"
                    type="number"
                    class="forge-input"
                    value={localPort()}
                    onInput={(e) => setLocalPort(e.currentTarget.value)}
                    placeholder="8080"
                    data-testid="input-local-port"
                  />
                </div>
                <div style={{ flex: 1, display: "flex", "flex-direction": "column", gap: "4px" }}>
                  <label for="pf-remote-port">Remote Port</label>
                  <input
                    id="pf-remote-port"
                    type="number"
                    class="forge-input"
                    value={remotePort()}
                    onInput={(e) => setRemotePort(e.currentTarget.value)}
                    placeholder="3000"
                    data-testid="input-remote-port"
                  />
                </div>
              </div>

              <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
                <label for="pf-remote-host">Remote Host</label>
                <input
                  id="pf-remote-host"
                  type="text"
                  class="forge-input"
                  value={remoteHost()}
                  onInput={(e) => setRemoteHost(e.currentTarget.value)}
                  placeholder="localhost"
                  data-testid="input-remote-host"
                />
              </div>

              <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
                <label for="pf-label">Label (optional)</label>
                <input
                  id="pf-label"
                  type="text"
                  class="forge-input"
                  value={label()}
                  onInput={(e) => setLabel(e.currentTarget.value)}
                  placeholder="Web Server"
                  data-testid="input-portfwd-label"
                />
              </div>

              <div style={{ display: "flex", "justify-content": "flex-end", gap: "8px", "margin-top": "16px" }}>
                <button class="forge-dialog-btn" onClick={resetForm} data-testid="btn-cancel-portfwd">
                  Cancel
                </button>
                <button
                  class="forge-dialog-btn"
                  style={{ "background-color": "var(--primary, var(--accent))", color: "white" }}
                  onClick={handleSave}
                  data-testid="btn-save-portfwd"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
