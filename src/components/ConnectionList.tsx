import { createSignal, For, Show, onMount, createMemo } from "solid-js";
import { connectionStore } from "../stores/connection";
import { recentConnectionsStore } from "../stores/recentConnections";
import { explorerStore } from "../stores/explorer";
import { sidebarStore } from "../stores/sidebar";
import { parseQuickConnect } from "../utils/quickConnect";
import { buildGroupTree } from "../utils/groupTree";
import type { GroupNode } from "../types/connection";
import ConnectionManager from "./ConnectionManager";

export default function ConnectionList() {
  const [isManaging, setIsManaging] = createSignal(false);
  const [editingProfileId, setEditingProfileId] = createSignal<string | null>(null);
  const [quickConnectInput, setQuickConnectInput] = createSignal("");
  const [quickConnectError, setQuickConnectError] = createSignal<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = createSignal<Set<string>>(new Set());

  onMount(() => {
    void connectionStore.loadProfiles();
    loadCollapsedState();
  });

  const groupTree = createMemo(() => buildGroupTree(connectionStore.profiles));

  const loadCollapsedState = () => {
    try {
      const stored = localStorage.getItem("forge-collapsed-groups");
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCollapsedGroups(new Set(parsed as string[]));
        }
      }
    } catch { void 0; }
  };

  const saveCollapsedState = (groups: Set<string>) => {
    try {
      localStorage.setItem("forge-collapsed-groups", JSON.stringify([...groups]));
    } catch { void 0; }
  };

  const toggleGroup = (fullPath: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(fullPath)) {
        next.delete(fullPath);
      } else {
        next.add(fullPath);
      }
      saveCollapsedState(next);
      return next;
    });
  };

  const isGroupCollapsed = (fullPath: string): boolean => collapsedGroups().has(fullPath);

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
      sidebarStore.setSection("explorer");
    }
  };

  const handleQuickConnect = async () => {
    const parsed = parseQuickConnect(quickConnectInput());
    if (!parsed) {
      setQuickConnectError("Invalid format. Use: user@host:port");
      return;
    }

    setQuickConnectError(null);
    const quickId = `quick-${Date.now()}`;
    const profile = {
      id: quickId,
      name: `${parsed.username}@${parsed.host}`,
      host: parsed.host,
      port: parsed.port,
      username: parsed.username,
      authMethod: "password" as const,
    };

    await connectionStore.saveProfile(profile);
    setQuickConnectInput("");
    await handleConnect(quickId);
  };

  const handleQuickConnectKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleQuickConnect();
    }
  };

  const handleBrowseFiles = async (id: string, e: Event) => {
    e.stopPropagation();
    const connection = connectionStore.activeConnections.find((c) => c.profile.id === id);
    if (connection?.status === "connected" && connection.connectionId) {
      await explorerStore.setRoot("/", "remote", connection.connectionId);
      sidebarStore.setSection("explorer");
    }
  };

  const handleDisconnect = (id: string, e: Event) => {
    e.stopPropagation();
    void connectionStore.disconnect(id);
  };

  const handleRecentConnect = async (profileId: string) => {
    const profileExists = connectionStore.profiles.some((p) => p.id === profileId);
    if (profileExists) {
      await handleConnect(profileId);
    } else {
      recentConnectionsStore.removeEntry(profileId);
    }
  };

  const formatLastConnected = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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

  const ConnectionGroupNode = (props: { node: GroupNode; depth: number }) => {
    const collapsed = () => isGroupCollapsed(props.node.fullPath);
    const totalCount = (): number => {
      const count = (node: GroupNode): number =>
        node.profiles.length + node.children.reduce((sum, child) => sum + count(child), 0);
      return count(props.node);
    };

    return (
      <div class="forge-connection-group" data-testid={`group-${props.node.fullPath}`}>
        <div
          class="forge-connection-group__header"
          style={{ "padding-left": `${(props.depth * 12) + 8}px` }}
          onClick={() => toggleGroup(props.node.fullPath)}
          data-testid={`group-toggle-${props.node.fullPath}`}
        >
          <svg
            class="forge-connection-group__chevron"
            classList={{ "forge-connection-group__chevron--collapsed": collapsed() }}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          <span class="forge-connection-group__name">{props.node.name}</span>
          <span class="forge-connection-group__count">{totalCount()}</span>
        </div>
        <Show when={!collapsed()}>
          <div class="forge-connection-group__children" style={{ "padding-left": `${props.depth * 12}px` }}>
            <For each={props.node.profiles}>{renderProfile}</For>
            <For each={props.node.children}>
              {(child) => <ConnectionGroupNode node={child} depth={props.depth + 1} />}
            </For>
          </div>
        </Show>
      </div>
    );
  };

  const renderProfile = (profile: (typeof connectionStore.profiles)[number]) => {
    const activeConn = () => connectionStore.activeConnections.find((c) => c.profile.id === profile.id);
    const status = () => activeConn()?.status || "disconnected";

    return (
      <div
        class="forge-connection-item"
        onClick={() => void handleConnect(profile.id)}
        data-testid={`connection-item-${profile.id}`}
      >
        <div class="forge-connection-item__info">
          <div title={status()} style={statusDot(status())} />
          <div class="forge-connection-item__text">
            <span class="forge-connection-item__name">{profile.name}</span>
            <span class="forge-connection-item__host">
              {profile.username}@{profile.host}:{profile.port}
            </span>
          </div>
        </div>

        <div class="forge-connection-actions">
          <Show when={status() === "connected"}>
            <button
              class="forge-btn-icon"
              onClick={(e) => void handleBrowseFiles(profile.id, e)}
              title="Browse Files"
              data-testid={`btn-browse-${profile.id}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
          </Show>

          <Show when={status() === "connected" || status() === "connecting"}>
            <button
              class="forge-btn-icon forge-btn-icon--danger"
              onClick={(e) => handleDisconnect(profile.id, e)}
              title="Disconnect"
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
    <div class="forge-connection-container">
      <div class="forge-connection-header">
        <h2 class="forge-connection-header__title">Connections</h2>
        <button
          class="forge-btn-icon"
          onClick={handleNewConnection}
          title="New Connection"
          data-testid="btn-new-connection"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>

      <div class="forge-quick-connect" data-testid="quick-connect">
        <div class="forge-quick-connect__input-row">
          <input
            type="text"
            class="forge-quick-connect__input"
            placeholder="user@host:port"
            value={quickConnectInput()}
            onInput={(e) => {
              setQuickConnectInput(e.currentTarget.value);
              setQuickConnectError(null);
            }}
            onKeyDown={handleQuickConnectKeyDown}
            data-testid="quick-connect-input"
          />
          <button
            class="forge-quick-connect__btn"
            onClick={() => void handleQuickConnect()}
            disabled={!quickConnectInput().trim()}
            data-testid="quick-connect-btn"
            title="Connect"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14"></path>
              <path d="M12 5l7 7-7 7"></path>
            </svg>
          </button>
        </div>
        <Show when={quickConnectError()}>
          <div class="forge-quick-connect__error" data-testid="quick-connect-error">
            {quickConnectError()}
          </div>
        </Show>
      </div>

      <div class="forge-connection-list" data-testid="connection-list">
        <Show when={recentConnectionsStore.items.length > 0}>
          <div class="forge-connection-section" data-testid="recent-connections-section">
            <div class="forge-connection-section__header">
              <span class="forge-connection-section__label">RECENT</span>
              <button
                class="forge-btn-icon forge-btn-icon--xs"
                onClick={() => recentConnectionsStore.clearAll()}
                title="Clear Recent"
                data-testid="btn-clear-recent"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <For each={recentConnectionsStore.items}>
              {(recent) => (
                <div
                  class="forge-connection-item forge-connection-item--recent"
                  onClick={() => void handleRecentConnect(recent.profileId)}
                  data-testid={`recent-item-${recent.profileId}`}
                >
                  <div class="forge-connection-item__info">
                    <svg class="forge-connection-item__recent-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <div class="forge-connection-item__text">
                      <span class="forge-connection-item__name">{recent.profileName}</span>
                      <span class="forge-connection-item__host">
                        {recent.username}@{recent.host}:{recent.port}
                      </span>
                    </div>
                  </div>
                  <span class="forge-connection-item__time">
                    {formatLastConnected(recent.lastConnected)}
                  </span>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={connectionStore.profiles.length > 0}>
          <Show when={recentConnectionsStore.items.length > 0}>
            <div class="forge-connection-section__header">
              <span class="forge-connection-section__label">SAVED</span>
            </div>
          </Show>
          <For each={groupTree().profiles}>{renderProfile}</For>
          <For each={groupTree().children}>
            {(node) => <ConnectionGroupNode node={node} depth={0} />}
          </For>
        </Show>

        <Show when={connectionStore.profiles.length === 0 && recentConnectionsStore.items.length === 0}>
          <div class="forge-connection-empty">
            No connections configured.<br />
            Use quick connect or click + to add one.
          </div>
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
