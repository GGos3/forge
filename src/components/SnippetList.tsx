import { createSignal, For, Show } from "solid-js";
import { snippetStore, substituteVariables } from "../stores/snippet";
import type { SshSnippet } from "../types/connection";

export default function SnippetList() {
  const [isEditing, setIsEditing] = createSignal(false);
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [name, setName] = createSignal("");
  const [command, setCommand] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [tags, setTags] = createSignal("");
  const [filterTag, setFilterTag] = createSignal<string | null>(null);
  const [copiedId, setCopiedId] = createSignal<string | null>(null);

  const filteredSnippets = () => {
    const tag = filterTag();
    return tag ? snippetStore.filterByTag(tag) : snippetStore.items;
  };

  const resetForm = () => {
    setName("");
    setCommand("");
    setDescription("");
    setTags("");
    setEditingId(null);
    setIsEditing(false);
  };

  const handleNew = () => {
    resetForm();
    setIsEditing(true);
  };

  const handleEdit = (snippet: SshSnippet, e: Event) => {
    e.stopPropagation();
    setEditingId(snippet.id);
    setName(snippet.name);
    setCommand(snippet.command);
    setDescription(snippet.description ?? "");
    setTags(snippet.tags?.join(", ") ?? "");
    setIsEditing(true);
  };

  const handleDelete = (id: string, e: Event) => {
    e.stopPropagation();
    snippetStore.remove(id);
  };

  const handleSave = () => {
    if (!name().trim() || !command().trim()) return;

    const parsedTags = tags()
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const snippetData = {
      name: name().trim(),
      command: command().trim(),
      description: description().trim() || undefined,
      tags: parsedTags.length > 0 ? parsedTags : undefined,
    };

    if (editingId()) {
      snippetStore.update(editingId()!, snippetData);
    } else {
      snippetStore.add({
        id: crypto.randomUUID(),
        ...snippetData,
      });
    }

    resetForm();
  };

  const handleCopyResolved = async (snippet: SshSnippet) => {
    const resolved = substituteVariables(snippet.command, {});
    try {
      await navigator.clipboard.writeText(resolved);
      setCopiedId(snippet.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { void 0; }
  };

  const hasVariables = (cmd: string): boolean => /\{\{\w+\}\}/.test(cmd);

  return (
    <div class="forge-snippet-container" data-testid="snippet-list">
      <div class="forge-connection-header">
        <h2 class="forge-connection-header__title">Snippets</h2>
        <button
          class="forge-btn-icon"
          onClick={handleNew}
          title="New Snippet"
          data-testid="btn-new-snippet"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <Show when={snippetStore.getAllTags().length > 0}>
        <div class="forge-snippet-tags" data-testid="snippet-tags">
          <button
            class="forge-snippet-tag"
            classList={{ "forge-snippet-tag--active": filterTag() === null }}
            onClick={() => setFilterTag(null)}
          >
            All
          </button>
          <For each={snippetStore.getAllTags()}>
            {(tag) => (
              <button
                class="forge-snippet-tag"
                classList={{ "forge-snippet-tag--active": filterTag() === tag }}
                onClick={() => setFilterTag(filterTag() === tag ? null : tag)}
                data-testid={`tag-filter-${tag}`}
              >
                {tag}
              </button>
            )}
          </For>
        </div>
      </Show>

      <div class="forge-connection-list">
        <For each={filteredSnippets()}>
          {(snippet) => (
            <div
              class="forge-snippet-item"
              data-testid={`snippet-${snippet.id}`}
            >
              <div class="forge-snippet-item__info">
                <div class="forge-snippet-item__header">
                  <span class="forge-snippet-item__name">{snippet.name}</span>
                  <Show when={hasVariables(snippet.command)}>
                    <span class="forge-snippet-item__var-badge" title="Contains variables">
                      {"{{ }}"}
                    </span>
                  </Show>
                </div>
                <code class="forge-snippet-item__command">{snippet.command}</code>
                <Show when={snippet.description}>
                  <span class="forge-snippet-item__description">{snippet.description}</span>
                </Show>
                <Show when={snippet.tags && snippet.tags.length > 0}>
                  <div class="forge-snippet-item__tags">
                    <For each={snippet.tags}>
                      {(tag) => <span class="forge-snippet-item__tag">{tag}</span>}
                    </For>
                  </div>
                </Show>
              </div>

              <div class="forge-connection-actions">
                <button
                  class="forge-btn-icon"
                  classList={{ "forge-btn-icon--success": copiedId() === snippet.id }}
                  onClick={() => void handleCopyResolved(snippet)}
                  title="Copy Command"
                  data-testid={`btn-copy-${snippet.id}`}
                >
                  <Show when={copiedId() === snippet.id} fallback={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  }>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </Show>
                </button>
                <button
                  class="forge-btn-icon"
                  onClick={(e) => handleEdit(snippet, e)}
                  title="Edit"
                  data-testid={`btn-edit-snippet-${snippet.id}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  class="forge-btn-icon"
                  onClick={(e) => handleDelete(snippet.id, e)}
                  title="Delete"
                  data-testid={`btn-delete-snippet-${snippet.id}`}
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

        <Show when={filteredSnippets().length === 0}>
          <div class="forge-connection-empty">
            {filterTag() ? `No snippets tagged "${filterTag()}"` : "No snippets yet."}<br />
            Click + to create one.
          </div>
        </Show>
      </div>

      <Show when={isEditing()}>
        <div class="forge-dialog-overlay" data-testid="snippet-editor-overlay">
          <div class="forge-connection-dialog" data-testid="snippet-editor">
            <h3>{editingId() ? "Edit Snippet" : "New Snippet"}</h3>

            <div class="forge-connection-form">
              <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
                <label for="snippet-name">Name</label>
                <input
                  id="snippet-name"
                  type="text"
                  class="forge-input"
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                  placeholder="Deploy to production"
                  data-testid="input-snippet-name"
                />
              </div>

              <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
                <label for="snippet-command">Command</label>
                <textarea
                  id="snippet-command"
                  class="forge-input forge-snippet-textarea"
                  value={command()}
                  onInput={(e) => setCommand(e.currentTarget.value)}
                  placeholder={"ssh {{user}}@{{host}} 'cd /app && git pull'"}
                  rows={3}
                  data-testid="input-snippet-command"
                />
                <span class="forge-snippet-hint">
                  {"Use {{variable}} for substitution"}
                </span>
              </div>

              <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
                <label for="snippet-description">Description (optional)</label>
                <input
                  id="snippet-description"
                  type="text"
                  class="forge-input"
                  value={description()}
                  onInput={(e) => setDescription(e.currentTarget.value)}
                  placeholder="Pull latest changes on prod server"
                  data-testid="input-snippet-description"
                />
              </div>

              <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
                <label for="snippet-tags">Tags (comma-separated)</label>
                <input
                  id="snippet-tags"
                  type="text"
                  class="forge-input"
                  value={tags()}
                  onInput={(e) => setTags(e.currentTarget.value)}
                  placeholder="deploy, production"
                  data-testid="input-snippet-tags"
                />
              </div>

              <div style={{ display: "flex", "justify-content": "flex-end", gap: "8px", "margin-top": "16px" }}>
                <button class="forge-dialog-btn" onClick={resetForm} data-testid="btn-cancel-snippet">
                  Cancel
                </button>
                <button
                  class="forge-dialog-btn"
                  style={{ "background-color": "var(--primary, var(--accent))", color: "white" }}
                  onClick={handleSave}
                  disabled={!name().trim() || !command().trim()}
                  data-testid="btn-save-snippet"
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
