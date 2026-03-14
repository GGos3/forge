import { createSignal, createMemo, onMount, onCleanup, Show, For } from "solid-js";
import { connectionStore } from "../stores/connection";
import type { SshProfile, SshAuthMethod } from "../types/connection";

interface ConnectionManagerProps {
  profileId: string | null;
  onClose: () => void;
}

export default function ConnectionManager(props: ConnectionManagerProps) {
  let dialogRef!: HTMLDivElement;

  const isEditing = () => props.profileId !== null;

  const existingProfile = () =>
    props.profileId ? connectionStore.profiles.find((p) => p.id === props.profileId) : null;

  const [name, setName] = createSignal(existingProfile()?.name || "");
  const [host, setHost] = createSignal(existingProfile()?.host || "");
  const [port, setPort] = createSignal(existingProfile()?.port?.toString() || "22");
  const [username, setUsername] = createSignal(existingProfile()?.username || "");
  const [authMethod, setAuthMethod] = createSignal<SshAuthMethod>(existingProfile()?.authMethod || "password");
  const [keyPath, setKeyPath] = createSignal(existingProfile()?.keyPath || "");
  const [group, setGroup] = createSignal(existingProfile()?.group || "");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [testStatus, setTestStatus] = createSignal<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMessage, setTestMessage] = createSignal("");

  const existingGroups = createMemo(() => {
    const groups = new Set<string>();
    for (const p of connectionStore.profiles) {
      if (p.group?.trim()) {
        const segments = p.group.trim().split("/");
        for (let i = 1; i <= segments.length; i++) {
          groups.add(segments.slice(0, i).join("/"));
        }
      }
    }
    return [...groups].sort();
  });

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        props.onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef && !dialogRef.contains(e.target as Node)) {
        props.onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    });
  });

  function buildProfile(): SshProfile | null {
    if (!name().trim()) {
      setError("Name is required");
      return null;
    }
    if (!host().trim()) {
      setError("Host is required");
      return null;
    }
    const portNum = parseInt(port(), 10);
    if (isNaN(portNum) || portNum <= 0 || portNum > 65535) {
      setError("Invalid port number");
      return null;
    }
    if (!username().trim()) {
      setError("Username is required");
      return null;
    }
    return {
      id: props.profileId || crypto.randomUUID(),
      name: name().trim(),
      host: host().trim(),
      port: portNum,
      username: username().trim(),
      authMethod: authMethod(),
      ...(authMethod() === "key" && keyPath().trim() ? { keyPath: keyPath().trim() } : {}),
      ...(group().trim() ? { group: group().trim() } : {}),
    };
  }

  const handleSave = async (e: Event) => {
    e.preventDefault();
    setError("");

    const profile = buildProfile();
    if (!profile) return;

    setSaving(true);
    try {
      await connectionStore.saveProfile(profile);
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (e: Event) => {
    e.preventDefault();
    setError("");
    setTestStatus("testing");
    setTestMessage("");

    const profile = buildProfile();
    if (!profile) {
      setTestStatus("idle");
      return;
    }

    try {
      await connectionStore.testConnection(
        profile,
        authMethod() === "password" && password() ? password() : undefined,
      );
      setTestStatus("ok");
      setTestMessage("Connection successful");
    } catch (err) {
      setTestStatus("fail");
      setTestMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div class="forge-dialog-overlay" data-testid="connection-manager-overlay">
      <div ref={dialogRef} class="forge-connection-dialog" data-testid="connection-manager-dialog">
        <h3>{isEditing() ? "Edit Connection" : "New Connection"}</h3>

        <Show when={error()}>
          <div style={{ color: "var(--error)", "margin-bottom": "12px" }} data-testid="form-error">{error()}</div>
        </Show>

        <form class="forge-connection-form" onSubmit={handleSave} data-testid="connection-manager-form">
          <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
            <label for="conn-name">Name</label>
            <input
              id="conn-name"
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="Production Server"
              class="forge-input"
              data-testid="input-name"
            />
          </div>

          <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
            <label for="conn-host">Host</label>
            <input
              id="conn-host"
              type="text"
              value={host()}
              onInput={(e) => setHost(e.currentTarget.value)}
              placeholder="example.com or 192.168.1.100"
              class="forge-input"
              data-testid="input-host"
            />
          </div>

          <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
            <label for="conn-port">Port</label>
            <input
              id="conn-port"
              type="number"
              value={port()}
              onInput={(e) => setPort(e.currentTarget.value)}
              placeholder="22"
              class="forge-input"
              data-testid="input-port"
            />
          </div>

          <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
            <label for="conn-username">Username</label>
            <input
              id="conn-username"
              type="text"
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
              placeholder="root"
              class="forge-input"
              data-testid="input-username"
            />
          </div>

          <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
            <label for="conn-group">Group (Optional)</label>
            <input
              id="conn-group"
              type="text"
              value={group()}
              onInput={(e) => setGroup(e.currentTarget.value)}
              placeholder="Production/US-East"
              class="forge-input"
              data-testid="input-group"
              list="conn-group-suggestions"
            />
            <datalist id="conn-group-suggestions">
              <For each={existingGroups()}>
                {(g) => <option value={g} />}
              </For>
            </datalist>
          </div>

          <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
            <label for="conn-auth">Authentication Method</label>
            <select
              id="conn-auth"
              value={authMethod()}
              onChange={(e) => setAuthMethod(e.currentTarget.value as SshAuthMethod)}
              class="forge-input"
              data-testid="select-auth"
            >
              <option value="password">Password</option>
              <option value="key">SSH Key</option>
              <option value="agent">SSH Agent</option>
            </select>
          </div>

          <Show when={authMethod() === "password"}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
              <label for="conn-password">Password (for Test / Connect)</label>
              <input
                id="conn-password"
                type="password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                placeholder="Leave blank to prompt on connect"
                class="forge-input"
                data-testid="input-password"
              />
            </div>
          </Show>

          <Show when={authMethod() === "key"}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
              <label for="conn-key">Identity File (Optional)</label>
              <input
                id="conn-key"
                type="text"
                value={keyPath()}
                onInput={(e) => setKeyPath(e.currentTarget.value)}
                placeholder="~/.ssh/id_rsa"
                class="forge-input"
                data-testid="input-key"
              />
            </div>
          </Show>

          <Show when={testStatus() !== "idle"}>
            <div
              style={{
                color: testStatus() === "ok" ? "var(--success, #4caf50)" : testStatus() === "fail" ? "var(--error)" : "var(--text-secondary)",
                "font-size": "12px",
              }}
              data-testid="test-result"
            >
              {testStatus() === "testing" ? "Testing…" : testMessage()}
            </div>
          </Show>

          <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-top": "16px" }}>
            <button
              type="button"
              class="forge-dialog-btn"
              onClick={handleTest}
              disabled={testStatus() === "testing" || saving()}
              data-testid="btn-test"
            >
              {testStatus() === "testing" ? "Testing…" : "Test Connection"}
            </button>

            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" class="forge-dialog-btn" onClick={props.onClose} data-testid="btn-cancel">
                Cancel
              </button>
              <button
                type="submit"
                class="forge-dialog-btn"
                style={{ "background-color": "var(--primary)", color: "white" }}
                disabled={saving()}
                data-testid="btn-save"
              >
                {saving() ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
