import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { shellStore } from "../stores/shell";
import { tabStore } from "../stores/tab";
import { findPane } from "../models/pane-tree";
import type { PaneId } from "../types/pane";
import type { SessionId, ShellType } from "../types/session";
import type { TabId } from "../types/tab";
import { paneStore } from "../stores/pane";
import Terminal from "./Terminal";

interface TerminalPaneProps {
  tabId: TabId;
  paneId: PaneId;
  focused: boolean;
}

function normalizeSessionId(sessionId: SessionId | string): SessionId {
  return typeof sessionId === "string" ? ({ value: sessionId } as SessionId) : sessionId;
}

function isPendingSessionId(sessionId: SessionId): boolean {
  return sessionId.value.startsWith("pending-session-");
}

export default function TerminalPane(props: TerminalPaneProps) {
  const [sessionId, setSessionId] = createSignal<SessionId | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [debugCloseCount, setDebugCloseCount] = createSignal(0);

  onMount(() => {
    let disposed = false;
    onCleanup(() => {
      disposed = true;
    });

    const ensureDefaultShell = async (): Promise<ShellType | null> => {
      const tab = tabStore.tabs.find((t) => t.id === props.tabId);
      const paneNode = tab ? findPane(tab.root, props.paneId) : null;
      const shellFromPane = paneNode?.type === "terminal" ? paneNode.shell : undefined;

      if (shellFromPane) {
        return shellFromPane;
      }

      if (!shellStore.defaultShell && !shellStore.loading) {
        await shellStore.loadShells();
      }

      return shellStore.defaultShell ?? shellStore.availableShells[0]?.shell_type ?? null;
    };

    const createPaneSession = async () => {
      try {
        const shell = await ensureDefaultShell();
        if (!shell) {
          throw new Error(shellStore.error ?? "No shell available");
        }

        const createdSessionId = normalizeSessionId(
          await invoke<SessionId | string>("create_session", {
            config: { shell },
          })
        );

        if (disposed) {
          await invoke("close_session", { session_id: createdSessionId.value });
          return;
        }

        setSessionId(createdSessionId);
        tabStore.setTerminalSessionId(props.tabId, props.paneId, createdSessionId);
      } catch (sessionError) {
        if (!disposed) {
          setError(sessionError instanceof Error ? sessionError.message : String(sessionError));
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    const tab = tabStore.tabs.find((t) => t.id === props.tabId);
    const paneNode = tab ? findPane(tab.root, props.paneId) : null;

    if (!paneNode || paneNode.type !== "terminal") {
      setError("Terminal pane not found");
      setLoading(false);
      return;
    }

    if (isPendingSessionId(paneNode.sessionId)) {
      void createPaneSession();
      return;
    }

    setSessionId(paneNode.sessionId);
    setLoading(false);
  });

  return (
    <div class="forge-terminal-pane" data-testid="terminal-pane">
      <button
        type="button"
        class="forge-terminal-pane__close"
        data-testid={`close-pane-${props.paneId}`}
        title="Close Pane"
        draggable={false}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          setDebugCloseCount((count) => count + 1);
          void paneStore.closePaneById(props.paneId);
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="2" y1="2" x2="10" y2="10" />
          <line x1="10" y1="2" x2="2" y2="10" />
        </svg>
      </button>
      <Show when={!loading()} fallback={<div class="forge-terminal-status">Starting terminal...</div>}>
        <Show when={!error()} fallback={<div class="forge-terminal-status forge-terminal-error">{error()}</div>}>
          <Show when={sessionId()}>{(activeSessionId) => <Terminal sessionId={activeSessionId()} focused={props.focused} />}</Show>
        </Show>
      </Show>
      <div class="forge-terminal-pane__debug-close" data-testid={`close-pane-debug-${props.paneId}`}>
        paneCloseClicks: {debugCloseCount()}
      </div>
    </div>
  );
}
