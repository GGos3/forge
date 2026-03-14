import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal as XTerm } from "@xterm/xterm";
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
  let lastWriteStatusValue = "idle";
  let lastOutputBytesValue = 0;
  let lastRawHexValue = "";
  let hasSeenOsc133 = false;

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
    lastWriteStatus: "idle",
    lastOutputBytes: 0,
    lastRawHex: "",
  });

  const syncDebugState = (nextPointerTarget?: string, nextInput?: string, nextWriteStatus?: string, nextOutputBytes?: number) => {
    if (nextPointerTarget !== undefined) {
      lastPointerTargetValue = nextPointerTarget;
    }
    if (nextInput !== undefined) {
      lastInputValue = nextInput;
    }
    if (nextWriteStatus !== undefined) {
      lastWriteStatusValue = nextWriteStatus;
    }
    if (nextOutputBytes !== undefined) {
      lastOutputBytesValue = nextOutputBytes;
    }

     const activeElement = document.activeElement as HTMLElement | null;
    setDebugState({
      textareaPresent: Boolean(containerRef?.querySelector("textarea")),
      helperTextareaPresent: Boolean(containerRef?.querySelector(".xterm-helper-textarea")),
      activeTag: activeElement?.tagName ?? "none",
      activeClass: activeElement?.className ?? "",
      lastPointerTarget: lastPointerTargetValue,
      lastInput: lastInputValue,
      lastWriteStatus: lastWriteStatusValue,
      lastOutputBytes: lastOutputBytesValue,
      lastRawHex: lastRawHexValue,
    });
  };

  const focusNativeTerminalInput = () => {
    const textarea = containerRef?.querySelector("textarea") as HTMLTextAreaElement | null | undefined;
    textarea?.focus({ preventScroll: true });
    syncDebugState();
  };

  const sendInputToSession = async (sessionValue: string, data: string) => {
    if (!data) {
      return;
    }

    syncDebugState(undefined, JSON.stringify(data), "pending");

    try {
      await invoke("write_to_session", {
        sessionId: sessionValue,
        data: Array.from(textEncoder.encode(data)),
      });
      syncDebugState(undefined, undefined, "ok");
    } catch (error) {
      syncDebugState(undefined, undefined, `error: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    const blockStartRows = new Map<string, number>();

    const cursorRow = () => terminal!.buffer.active.baseY + terminal!.buffer.active.cursorY;

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
        const nextBlock = blocksToRender[i + 1];
        const startRow = blockStartRows.get(b.id) ?? 0;
        const endRow = nextBlock && blockStartRows.has(nextBlock.id)
          ? Math.max(startRow + 1, blockStartRows.get(nextBlock.id)!)
          : Math.max(startRow + 1, cursorRow());

        const relativeRow = startRow - viewportY;
        const top = relativeRow * cellHeight;
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
      void sendInputToSession(sessionValue, pastedText);
    };

    containerRef.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("paste", handlePaste);

    const inputDisposable = xterm.onData((data) => {
      if (exited) {
        return;
      }

      void sendInputToSession(sessionValue, data);
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

      const rawBytes = new Uint8Array(event.payload.data);
      const str = textDecoder.decode(rawBytes);
      if (str.includes("\x1b]133;")) {
        hasSeenOsc133 = true;
      }
      lastRawHexValue = (hasSeenOsc133 ? "OSC133=YES " : "OSC133=NO ") + Array.from(rawBytes.slice(0, 80)).map(b => b.toString(16).padStart(2, "0")).join(" ");
      const preWriteRow = cursorRow();
      const prevBlockId = blockParser.getCurrentBlock()?.id;
      blockParser.feed(str);
      const newBlockId = blockParser.getCurrentBlock()?.id;

      xterm.write(new Uint8Array(event.payload.data), () => {
        syncDebugState(undefined, undefined, undefined, event.payload.data.length);

        if (newBlockId && newBlockId !== prevBlockId && !blockStartRows.has(newBlockId)) {
          blockStartRows.set(newBlockId, preWriteRow);
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
        <div>writeStatus: {debugState().lastWriteStatus}</div>
        <div>lastOutputBytes: {debugState().lastOutputBytes}</div>
        <div style={{ "font-size": "9px", "word-break": "break-all" }}>rawHex: {debugState().lastRawHex || "(none)"}</div>
      </div>
    </div>
  );
}
