import { createSignal, For, Show, onMount, createMemo } from "solid-js";
import { connectionStore } from "../stores/connection";
import { explorerStore } from "../stores/explorer";
import ConnectionManager from "./ConnectionManager";

export default function ConnectionList() {
  const [isManaging, setIsManaging] = createSignal(false);
  const [editingProfileId, setEditingProfileId] = createSignal<string | null>(null);

  onMount(() => {
    void connectionStore.loadProfiles();
  });

  const groupedProfiles = createMemo(() => {
    const groups = new Map<string, typeof connectionStore.profiles>();
    for (const profile of connectionStore.profiles) {
      const key = profile.group || "";
      const existing = groups.get(key);
      if (existing) {
        existing.push(profile);
      } else {
        groups.set(key, [profile]);
      }
    }
    return groups;
  });

  const handleNewConnection = () => {
    setEditingProfileId(null);
    setIsManaging(true);
  };

  const handleEditConnection = (id: string, e: Event) => {
    e.stopPropagation();
    setEditingProfileId(id);
    setIsManaging(true);
  };

  const handleDeleteConnection = (id: string, e: Event) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this connection?")) {
      void connectionStore.deleteProfile(id);
    }
  };

  const handleConnect = async (id: string) => {
    await connectionStore.connect(id);
    const connection = connectionStore.activeConnections.find((c) => c.profile.id === id);
    if (connection?.status === "connected" && connection.connectionId) {
      await explorerStore.setRoot("/", "remote", connection.connectionId);
    }
  };

  const handleBrowseFiles = async (id: string, e: Event) => {
    e.stopPropagation();
    const connection = connectionStore.activeConnections.find((c) => c.profile.id === id);
    if (connection?.status === "connected" && connection.connectionId) {
      await explorerStore.setRoot("/", "remote", connection.connectionId);
    }
  };

  const handleDisconnect = (id: string, e: Event) => {
    e.stopPropagation();
    void connectionStore.disconnect(id);
  };

  const statusDot = (status: string) => ({
    width: "8px",
    height: "8px",
    "border-radius": "50%",
    "background-color":
      status === "connected"
        ? "var(--success, #4caf50)"
        : status === "connecting"
          ? "var(--warning, #ff9800)"
          : status === "error"
            ? "var(--error, #f44336)"
            : "transparent",
    border: status === "disconnected" ? "1px solid var(--text-secondary)" : "none",
  });

  const renderProfile = (profile: (typeof connectionStore.profiles)[number]) => {
    const activeConn = () => connectionStore.activeConnections.find((c) => c.profile.id === profile.id);
    const status = () => activeConn()?.status || "disconnected";

    return (
      <div
        class="forge-connection-item"
        onClick={() => void handleConnect(profile.id)}
        data-testid={`connection-item-${profile.id}`}
        style={{ display: "flex", "justify-content": "space-between" }}
      >
        <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
          <div title={status()} style={statusDot(status())} />
          <div style={{ display: "flex", "flex-direction": "column" }}>
            <span style={{ "font-weight": "500" }}>{profile.name}</span>
            <span style={{ "font-size": "11px", color: "var(--text-secondary)" }}>
              {profile.username}@{profile.host}:{profile.port}
            </span>
          </div>
        </div>

        <div class="forge-connection-actions" style={{ display: "flex", gap: "4px" }}>
          <Show when={status() === "connected"}>
            <button
              class="forge-btn-icon"
              onClick={(e) => void handleBrowseFiles(profile.id, e)}
              title="Browse Files"
              data-testid={`btn-browse-${profile.id}`}
              style={{ cursor: "pointer", background: "none", border: "none", color: "var(--text-secondary)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
          </Show>

          <Show when={status() === "connected" || status() === "connecting"}>
            <button
              class="forge-btn-icon"
              onClick={(e) => handleDisconnect(profile.id, e)}
              title="Disconnect"
              style={{ cursor: "pointer", background: "none", border: "none", color: "var(--error, #f44336)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              </svg>
            </button>
          </Show>

          <button
            class="forge-btn-icon"
            onClick={(e) => handleEditConnection(profile.id, e)}
            title="Edit"
            data-testid={`btn-edit-${profile.id}`}
            style={{ cursor: "pointer", background: "none", border: "none", color: "var(--text-secondary)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>

          <button
            class="forge-btn-icon"
            onClick={(e) => handleDeleteConnection(profile.id, e)}
            title="Delete"
            data-testid={`btn-delete-${profile.id}`}
            style={{ cursor: "pointer", background: "none", border: "none", color: "var(--text-secondary)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div class="forge-connection-container" style={{ display: "flex", "flex-direction": "column", height: "100%", width: "100%" }}>
      <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", padding: "8px 16px", "border-bottom": "1px solid var(--border)" }}>
        <h2 style={{ margin: "0", "font-size": "14px", color: "var(--text-primary)" }}>Connections</h2>
        <button
          class="forge-btn-icon"
          onClick={handleNewConnection}
          title="New Connection"
          data-testid="btn-new-connection"
          style={{ cursor: "pointer", background: "none", border: "none", color: "var(--text-primary)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>

      <div class="forge-connection-list" style={{ flex: "1" }}>
        <Show
          when={connectionStore.profiles.length > 0}
          fallback={
            <div style={{ padding: "16px", "text-align": "center", color: "var(--text-secondary)", "font-size": "13px" }}>
              No connections configured. <br /> Click the + button to add one.
            </div>
          }
        >
          <For each={[...groupedProfiles().entries()]}>
            {([groupName, profiles]) => (
              <>
                <Show when={groupName !== ""}>
                  <div
                    style={{
                      padding: "4px 8px",
                      "font-size": "11px",
                      "font-weight": "600",
                      color: "var(--text-secondary)",
                      "text-transform": "uppercase",
                      "letter-spacing": "0.05em",
                      "border-bottom": "1px solid var(--border)",
                    }}
                    data-testid={`group-header-${groupName}`}
                  >
                    {groupName}
                  </div>
                </Show>
                <For each={profiles}>{renderProfile}</For>
              </>
            )}
          </For>
        </Show>
      </div>

      <Show when={isManaging()}>
        <ConnectionManager
          profileId={editingProfileId()}
          onClose={() => setIsManaging(false)}
        />
      </Show>
    </div>
  );
}
