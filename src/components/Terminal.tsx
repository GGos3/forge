import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal as XTerm } from "@xterm/xterm";
import type { IMarker } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import type { SessionExitEvent, SessionId, SessionOutputEvent } from "../types/session";
import { BlockParser } from "../models/block-parser";
import BlockOverlay, { BlockUiItem } from "./BlockOverlay";
import { settingsStore } from "../stores/settings";
import { getCurrentPlatform } from "../utils/platform";

interface TerminalProps {
  sessionId: SessionId;
  focused: boolean;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function getSessionValue(sessionId: SessionId | string): string {
  return typeof sessionId === "string" ? sessionId : sessionId.value;
}

export default function Terminal(props: TerminalProps) {
  let containerRef: HTMLDivElement | undefined;
  let terminal: XTerm | null = null;
  let lastPointerTargetValue = "none";
  let lastInputValue = "";

  const currentTerminalTheme = () => ({
    background: getComputedStyle(document.documentElement).getPropertyValue("--surface-1").trim() || "#1e1e2e",
    foreground: getComputedStyle(document.documentElement).getPropertyValue("--text-primary").trim() || "#e0e0e6",
    cursor: getComputedStyle(document.documentElement).getPropertyValue("--text-primary").trim() || "#e0e0e6",
    selectionBackground: getComputedStyle(document.documentElement).getPropertyValue("--terminal-selection").trim() || "rgba(124, 91, 245, 0.3)",
    selectionInactiveBackground: getComputedStyle(document.documentElement).getPropertyValue("--terminal-selection-inactive").trim() || "rgba(124, 91, 245, 0.1)",
  });
  
  const [blocks, setBlocks] = createSignal<BlockUiItem[]>([]);
  const [debugState, setDebugState] = createSignal({
    textareaPresent: false,
    helperTextareaPresent: false,
    activeTag: "none",
    activeClass: "",
    lastPointerTarget: "none",
    lastInput: "",
  });

  const syncDebugState = (nextPointerTarget?: string, nextInput?: string) => {
    if (nextPointerTarget !== undefined) {
      lastPointerTargetValue = nextPointerTarget;
    }
    if (nextInput !== undefined) {
      lastInputValue = nextInput;
    }

    const activeElement = document.activeElement as HTMLElement | null;
    setDebugState({
      textareaPresent: Boolean(containerRef?.querySelector("textarea")),
      helperTextareaPresent: Boolean(containerRef?.querySelector(".xterm-helper-textarea")),
      activeTag: activeElement?.tagName ?? "none",
      activeClass: activeElement?.className ?? "",
      lastPointerTarget: lastPointerTargetValue,
      lastInput: lastInputValue,
    });
  };

  const focusNativeTerminalInput = () => {
    const textarea = containerRef?.querySelector("textarea") as HTMLTextAreaElement | null | undefined;
    textarea?.focus({ preventScroll: true });
    syncDebugState();
  };

  const sendInputToSession = (sessionValue: string, data: string) => {
    if (!data) {
      return;
    }

    syncDebugState(undefined, JSON.stringify(data));

    void invoke("write_to_session", {
      session_id: sessionValue,
      data: Array.from(textEncoder.encode(data)),
    });
  };

  onMount(() => {
    if (!containerRef) {
      return;
    }

    const sessionValue = getSessionValue(props.sessionId);
    const xterm = new XTerm({
      cursorBlink: true,
      convertEol: true,
      fontFamily: settingsStore.settings.fontFamily,
      fontSize: settingsStore.settings.fontSize,
      cursorStyle: settingsStore.settings.cursorStyle,
      scrollback: settingsStore.settings.scrollback,
      theme: currentTerminalTheme(),
    });
    terminal = xterm;
    const fitAddon = new FitAddon();
    let exited = false;
    let disposed = false;
    let outputUnlisten: (() => void) | undefined;
    let exitUnlisten: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const blockParser = new BlockParser();
    const markers = new Map<string, IMarker>();

    const updateBlocksUI = () => {
      if (!terminal) return;
      
      const allBlocks = blockParser.getBlocks();
      const currentBlock = blockParser.getCurrentBlock();
      const blocksToRender = currentBlock ? [...allBlocks, currentBlock] : allBlocks;
      
      const viewportY = terminal.buffer.active.viewportY;
      const cellHeight = (terminal.element?.clientHeight || 0) / terminal.rows;
      if (cellHeight === 0 || Number.isNaN(cellHeight)) return;

      const uiItems: BlockUiItem[] = [];

      for (let i = 0; i < blocksToRender.length; i++) {
        const b = blocksToRender[i];
        const marker = markers.get(b.id);
        if (!marker) continue;

        const nextBlock = blocksToRender[i + 1];
        const nextMarker = nextBlock ? markers.get(nextBlock.id) : null;
        
        // Render top based on marker line
        const relativeRow = marker.line - viewportY;
        const top = relativeRow * cellHeight;
        
        // Calculate height up to next block or bottom of buffer
        const endRow = nextMarker ? nextMarker.line : terminal.buffer.active.baseY + terminal.buffer.active.cursorY + 1;
        const relativeEndRow = endRow - viewportY;
        const height = (relativeEndRow - relativeRow) * cellHeight;

        uiItems.push({
          id: b.id,
          top,
          height: Math.max(height, cellHeight),
          command: b.command,
          output: b.output,
          exitCode: b.exitCode,
          timestamp: b.timestamp,
          isRunning: b.id === currentBlock?.id,
        });
      }

      setBlocks(uiItems);
    };

    const syncSize = async () => {
      fitAddon.fit();

      if (xterm.cols < 1 || xterm.rows < 1) {
        return;
      }

      await invoke("resize_session", {
        payload: {
          session_id: sessionValue,
          cols: xterm.cols,
          rows: xterm.rows,
        },
      });
      
      updateBlocksUI();
    };

    xterm.open(containerRef);
    xterm.loadAddon(fitAddon);

    const platform = getCurrentPlatform();

    if (!import.meta.env.VITE_E2E && platform !== "macos") {
      try {
        xterm.loadAddon(new WebglAddon());
      } catch {}
    }

    const focusTerminal = () => {
      focusNativeTerminalInput();
      xterm.focus();
      queueMicrotask(() => syncDebugState());
    };

    if (props.focused) {
      focusTerminal();
    }

    const handlePointerDown = (event: PointerEvent) => {
      syncDebugState((event.target as HTMLElement | null)?.className ?? "unknown");
      focusTerminal();
    };

    const handlePaste = (event: ClipboardEvent) => {
      if (platform !== "macos") {
        return;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      if (!containerRef?.contains(activeElement) && activeElement !== containerRef?.querySelector("textarea")) {
        return;
      }

      const pastedText = event.clipboardData?.getData("text/plain") ?? "";
      if (!pastedText) {
        return;
      }

      event.preventDefault();
      sendInputToSession(sessionValue, pastedText);
    };

    containerRef.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("paste", handlePaste);

    const inputDisposable = xterm.onData((data) => {
      if (exited) {
        return;
      }

      sendInputToSession(sessionValue, data);
    });

    xterm.onKey(({ domEvent }) => {
      if (platform !== "macos") {
        return;
      }

      syncDebugState(undefined, `key:${domEvent.key}`);
    });

    xterm.onRender(() => updateBlocksUI());
    xterm.onScroll(() => updateBlocksUI());

    void listen<SessionOutputEvent>("session-output", (event) => {
      if (event.payload.session_id !== sessionValue) {
        return;
      }

      const str = textDecoder.decode(new Uint8Array(event.payload.data));
      const prevBlockId = blockParser.getCurrentBlock()?.id;
      
      blockParser.feed(str);
      const currentBlockId = blockParser.getCurrentBlock()?.id;

      xterm.write(new Uint8Array(event.payload.data), () => {
        if (currentBlockId && currentBlockId !== prevBlockId) {
          const m = xterm.registerMarker(0);
          if (m) {
            markers.set(currentBlockId, m);
          }
        } else if (!currentBlockId && blockParser.getBlocks().length > 0) {
          // If block finalized in this chunk and we missed it, try to ensure we have markers for completed
          const lastCompleted = blockParser.getBlocks()[blockParser.getBlocks().length - 1];
          if (!markers.has(lastCompleted.id)) {
            const m = xterm.registerMarker(0);
            if (m) {
              markers.set(lastCompleted.id, m);
            }
          }
        }
        updateBlocksUI();
      });
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }

      outputUnlisten = unlisten;
    });

    void listen<SessionExitEvent>("session-exit", (event) => {
      if (event.payload.session_id !== sessionValue) {
        return;
      }

      exited = true;
      const exitSuffix = event.payload.exit_code === null ? "" : ` with code ${event.payload.exit_code}`;
      xterm.write(`\r\n[Process exited${exitSuffix}]\r\n`);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }

      exitUnlisten = unlisten;
    });

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        void syncSize();
      });

      resizeObserver.observe(containerRef);
    }

    queueMicrotask(() => {
      syncDebugState();
      void syncSize();
    });

    onCleanup(() => {
      disposed = true;
      exited = true;
      containerRef?.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("paste", handlePaste);
      resizeObserver?.disconnect();
      outputUnlisten?.();
      exitUnlisten?.();
      inputDisposable.dispose();
      xterm.dispose();
      terminal = null;
    });
  });

  createEffect(() => {
    if (props.focused) {
      focusNativeTerminalInput();
      terminal?.focus();
      queueMicrotask(() => syncDebugState());
    }
  });

  createEffect(() => {
    const font = settingsStore.settings.fontFamily;
    const size = settingsStore.settings.fontSize;
    const cursor = settingsStore.settings.cursorStyle;
    const scroll = settingsStore.settings.scrollback;
    void settingsStore.settings.colorTheme;

    if (!terminal?.options) {
      return;
    }

    terminal.options.fontFamily = font;
    terminal.options.fontSize = size;
    terminal.options.cursorStyle = cursor;
    terminal.options.scrollback = scroll;
    terminal.options.theme = currentTerminalTheme();
  });

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%", "-webkit-app-region": "no-drag" }}
      data-testid="terminal-focus-host"
      onPointerDown={() => {
        focusNativeTerminalInput();
        terminal?.focus();
        queueMicrotask(() => syncDebugState("terminal-focus-host"));
      }}
    >
      <div ref={containerRef} class="forge-terminal-surface" data-testid="terminal-surface" style={{ "-webkit-app-region": "no-drag" }} />
      <BlockOverlay blocks={blocks()} />
      <div class="forge-terminal-debug" data-testid="terminal-debug-state">
        <div>textarea: {debugState().textareaPresent ? "yes" : "no"}</div>
        <div>helper: {debugState().helperTextareaPresent ? "yes" : "no"}</div>
        <div>activeTag: {debugState().activeTag}</div>
        <div>activeClass: {debugState().activeClass || "(empty)"}</div>
        <div>lastPointer: {debugState().lastPointerTarget || "(none)"}</div>
        <div>lastInput: {debugState().lastInput || "(none)"}</div>
      </div>
    </div>
  );
}
