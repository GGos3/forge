import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { VsTerminalLinux } from "solid-icons/vs";
import { invoke } from "@tauri-apps/api/core";
import { shellStore } from "../stores/shell";
import { tabStore } from "../stores/tab";
import { findPane } from "../models/pane-tree";
import type { PaneId } from "../types/pane";
import type { SessionId, ShellType } from "../types/session";
import type { TabId } from "../types/tab";
import { paneStore } from "../stores/pane";
import { dragStore, FORGE_TAB_MIME } from "../stores/drag";
import Terminal from "./Terminal";

const FORGE_PANE_MIME = "application/x-forge-pane";

interface TerminalPaneProps {
  tabId: TabId;
  paneId: PaneId;
  focused: boolean;
  showHeader: boolean;
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
  const [lastCommand, setLastCommand] = createSignal("");
  const [isRunning, setIsRunning] = createSignal(false);
  const [isDragging, setIsDragging] = createSignal(false);
  const [isDragOver, setIsDragOver] = createSignal(false);

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
          await invoke("close_session", { sessionId: createdSessionId.value });
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
      <Show when={props.showHeader}>
        <div
          class="forge-pane-header"
          classList={{
            "forge-pane-header--dragging": isDragging(),
            "forge-pane-header--drag-over": isDragOver(),
          }}
          draggable={true}
          onDragStart={(e) => {
            setIsDragging(true);
            dragStore.startDrag({ type: "pane", paneId: props.paneId });
            if (e.dataTransfer) {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData(FORGE_PANE_MIME, props.paneId);
              e.dataTransfer.setData(FORGE_TAB_MIME, props.tabId);
            }
          }}
          onDragEnd={() => {
            setIsDragging(false);
            setIsDragOver(false);
            dragStore.endDrag();
          }}
          onDragOver={(e) => {
            const source = dragStore.source;
            if (source?.type !== "pane" || source.paneId === props.paneId) {
              return;
            }

            e.preventDefault();
            if (e.dataTransfer) {
              e.dataTransfer.dropEffect = "move";
            }
            setIsDragOver(true);
          }}
          onDragLeave={() => {
            setIsDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const source = dragStore.source;
            setIsDragOver(false);
            if (source?.type === "pane" && source.paneId && source.paneId !== props.paneId) {
              paneStore.swapPanes(source.paneId, props.paneId);
            }
            dragStore.endDrag();
          }}
        >
          <span class="forge-pane-header__icon">
            <VsTerminalLinux size={12} />
          </span>
          <span
            class="forge-pane-header__command"
            classList={{ "forge-pane-header__command--empty": !lastCommand().trim() }}
            title={lastCommand() || "No command yet"}
          >
            {lastCommand() || "No command yet"}
          </span>
          <Show when={isRunning()}>
            <span class="forge-pane-header__spinner" aria-label="Command running" />
          </Show>
          <button
            type="button"
            class="forge-pane-header__close"
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
              void paneStore.closePaneById(props.paneId);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
        </div>
      </Show>
      <div class="forge-terminal-pane__content">
        <Show when={!loading()} fallback={<div class="forge-terminal-status">Starting terminal...</div>}>
          <Show when={!error()} fallback={<div class="forge-terminal-status forge-terminal-error">{error()}</div>}>
            <Show when={sessionId()}>
              {(activeSessionId) => (
                <Terminal
                  sessionId={activeSessionId()}
                  focused={props.focused}
                  onLastCommand={(cmd, running) => {
                    setLastCommand(cmd);
                    setIsRunning(running);
                  }}
                />
              )}
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  );
}
