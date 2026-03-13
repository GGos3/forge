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
  
  const [blocks, setBlocks] = createSignal<BlockUiItem[]>([]);

  onMount(() => {
    if (!containerRef) {
      return;
    }

    const sessionValue = getSessionValue(props.sessionId);
    const xterm = new XTerm({
      cursorBlink: true,
      convertEol: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', 'Consolas', monospace",
      fontSize: 14,
      theme: {
        background: "#1e1e2e",
        foreground: "#e0e0e6",
        cursor: "#e0e0e6",
        selectionBackground: "rgba(124, 91, 245, 0.3)",
        selectionInactiveBackground: "rgba(124, 91, 245, 0.1)",
      },
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

    if (!import.meta.env.VITE_E2E) {
      try {
        xterm.loadAddon(new WebglAddon());
      } catch {}
    }

    if (props.focused) {
      xterm.focus();
    }

    const inputDisposable = xterm.onData((data) => {
      if (exited) {
        return;
      }

      void invoke("write_to_session", {
        session_id: sessionValue,
        data: Array.from(textEncoder.encode(data)),
      });
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
      void syncSize();
    });

    onCleanup(() => {
      disposed = true;
      exited = true;
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
      terminal?.focus();
    }
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} class="forge-terminal-surface" data-testid="terminal-surface" />
      <BlockOverlay blocks={blocks()} />
    </div>
  );
}
