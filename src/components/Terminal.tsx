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
import { showToast } from "./ui/Toast";
import { getCurrentPlatform, matchesToggleSidebarShortcut } from "../utils/platform";

const BLOCK_HEADER_HEIGHT = 28;

interface TerminalProps {
  sessionId: SessionId;
  focused: boolean;
  onLastCommand?: (command: string, isRunning: boolean) => void;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function getSessionValue(sessionId: SessionId | string): string {
  return typeof sessionId === "string" ? sessionId : sessionId.value;
}

function getCellHeight(terminal: XTerm): number {
  const rowContainer = terminal.element?.querySelector('.xterm-rows');
  if (rowContainer && rowContainer.children.length > 0) {
    const row = rowContainer.children[0] as HTMLElement;
    const h = row.getBoundingClientRect().height;
    if (h > 0) return h;
  }
  const screen = terminal.element?.querySelector('.xterm-screen');
  if (screen) {
    const h = screen.getBoundingClientRect().height;
    if (h > 0 && terminal.rows > 0) return h / terminal.rows;
  }
  return (terminal.element?.clientHeight || 0) / terminal.rows;
}

export default function Terminal(props: TerminalProps) {
  let containerRef: HTMLDivElement | undefined;
  let terminal: XTerm | null = null;

  const currentTerminalTheme = () => {
    const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    return {
      background: css("--surface-1") || "#16161e",
      foreground: css("--text-primary") || "#e1e1e6",
      cursor: css("--accent") || "#7c5bf5",
      cursorAccent: css("--surface-1") || "#16161e",
      selectionBackground: css("--terminal-selection") || "rgba(124, 91, 245, 0.3)",
      selectionInactiveBackground: css("--terminal-selection-inactive") || "rgba(124, 91, 245, 0.1)",
      black: "#414868",
      red: "#f7768e",
      green: "#73c991",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#c0caf5",
      brightBlack: "#565f89",
      brightRed: "#f7768e",
      brightGreen: "#9ece6a",
      brightYellow: "#e0af68",
      brightBlue: "#7aa2f7",
      brightMagenta: "#bb9af7",
      brightCyan: "#7dcfff",
      brightWhite: "#e1e1e6",
    };
  };
  
  const [blocks, setBlocks] = createSignal<BlockUiItem[]>([]);
  const [hoveredBlock, setHoveredBlock] = createSignal<{
    blockId: string;
    region: "input" | "output";
    block: BlockUiItem;
  } | null>(null);

  const handleRegionHover = (
    blockId: string | null,
    region: "input" | "output" | null,
    block: BlockUiItem | null,
  ) => {
    if (blockId && region && block) {
      setHoveredBlock({ blockId, region, block });
    } else {
      setHoveredBlock(null);
    }
  };

  const focusNativeTerminalInput = () => {
    const textarea = containerRef?.querySelector("textarea") as HTMLTextAreaElement | null | undefined;
    textarea?.focus({ preventScroll: true });
  };

  const sendInputToSession = async (sessionValue: string, data: string) => {
    if (!data) {
      return;
    }

    try {
      await invoke("write_to_session", {
        sessionId: sessionValue,
        data: Array.from(textEncoder.encode(data)),
      });
    } catch {
      void 0;
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
    let writingOutput = false;
    const pendingOutputEvents: Uint8Array[] = [];

    const blockParser = new BlockParser();
    const blockStartRows = new Map<string, number>();
    const blockOutputStartRows = new Map<string, number>();
    let prevLastCmd = "";

    const cursorRow = () => terminal!.buffer.active.baseY + terminal!.buffer.active.cursorY;

      const updateBlocksUI = () => {
        if (!terminal) return;
      
      const allBlocks = blockParser.getBlocks();
      const currentBlock = blockParser.getCurrentBlock();
      const blocksToRender = currentBlock ? [...allBlocks, currentBlock] : allBlocks;
      
      const viewportY = terminal.buffer.active.viewportY;
      const cellHeight = getCellHeight(terminal);
      if (cellHeight === 0 || Number.isNaN(cellHeight)) return;

      const xtermRowEls = terminal.element?.querySelector('.xterm-rows')?.children;
      const xtermScreen = terminal.element?.querySelector('.xterm-screen') as HTMLElement | null | undefined;
      const containerTop = containerRef?.getBoundingClientRect().top ?? 0;
      const screenTop = xtermScreen?.getBoundingClientRect().top ?? containerTop;
      const screenOffsetTop = screenTop - containerTop;

      const uiItems: BlockUiItem[] = [];

        for (let i = 0; i < blocksToRender.length; i++) {
          const b = blocksToRender[i];
          const nextBlock = blocksToRender[i + 1];
        const startRow = blockStartRows.get(b.id) ?? 0;
        const endRow = nextBlock && blockStartRows.has(nextBlock.id)
          ? Math.max(startRow + 1, blockStartRows.get(nextBlock.id)!)
          : Math.max(startRow + 1, cursorRow());

        const relIdx = startRow - viewportY;
        const rowEl = xtermRowEls?.[relIdx] as HTMLElement | undefined;
        const top = rowEl
          ? rowEl.getBoundingClientRect().top - containerTop
          : screenOffsetTop + relIdx * cellHeight;
        const relativeEndRow = endRow - viewportY;
        const height = (relativeEndRow - relIdx) * cellHeight;

        const outputStartRow = blockOutputStartRows.get(b.id) ?? startRow + 1;
        const inputRows = Math.max(1, outputStartRow - startRow);
        const inputHeight = inputRows * cellHeight;

        const blockBodyHeight = Math.max(height, cellHeight);

          uiItems.push({
            id: b.id,
          top: top - BLOCK_HEADER_HEIGHT,
          height: blockBodyHeight + BLOCK_HEADER_HEIGHT,
          inputHeight: Math.min(inputHeight, blockBodyHeight),
          command: b.command,
          output: b.output,
          exitCode: b.exitCode,
          timestamp: b.timestamp,
          isRunning: b.id === currentBlock?.id,
        });
      }

      setBlocks(uiItems);

      const lastBlock = uiItems[uiItems.length - 1];
      const lastCmd = lastBlock?.command ?? "";
      const lastRunning = lastBlock?.isRunning ?? false;
      if (lastCmd !== prevLastCmd) {
        prevLastCmd = lastCmd;
        props.onLastCommand?.(lastCmd, lastRunning);
      }
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

    xterm.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.type !== "keydown") return true;

      if (matchesToggleSidebarShortcut(event, platform)) {
        return false;
      }

      if (event.key !== "c" || !(event.metaKey || event.ctrlKey)) return true;
      if (xterm.hasSelection()) return true;

      const hovered = hoveredBlock();
      if (!hovered) return true;

      const textToCopy = hovered.region === "input"
        ? hovered.block.command
        : hovered.block.output;

      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).catch(() => {});
        showToast("Copied to clipboard");
        return false;
      }

      return true;
    });

    const focusTerminal = () => {
      focusNativeTerminalInput();
      xterm.focus();
    };

    if (props.focused) {
      focusTerminal();
    }

    const handlePointerDown = () => {
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

    xterm.onRender(() => updateBlocksUI());
    xterm.onScroll(() => updateBlocksUI());

    const flushOutputQueue = () => {
      if (writingOutput || pendingOutputEvents.length === 0) {
        return;
      }

      const rawBytes = pendingOutputEvents.shift();
      if (!rawBytes) {
        return;
      }

      writingOutput = true;
      const str = textDecoder.decode(rawBytes);
      const preWriteRow = cursorRow();
      const preFeedLine = blockParser.getLineNumber();
      const prevBlockIds = new Set(blockParser.getBlocks().map(b => b.id));
      const prevCurrentId = blockParser.getCurrentBlock()?.id;
      if (prevCurrentId) prevBlockIds.add(prevCurrentId);

      blockParser.feed(str);

      const snapshotBlocks = blockParser.getBlocks();
      const snapshotCurrent = blockParser.getCurrentBlock();
      const snapshotAll = [...snapshotBlocks, ...(snapshotCurrent ? [snapshotCurrent] : [])];

      xterm.write(rawBytes, () => {
        const rowForParserLine = (line: number) => {
          const logicalOffset = line - preFeedLine;
          if (logicalOffset === 0) {
            return preWriteRow;
          }

          let row = preWriteRow;
          let remaining = Math.abs(logicalOffset);
          const direction = logicalOffset > 0 ? 1 : -1;

          while (remaining > 0) {
            row += direction;
            if (row < 0) {
              return Math.max(0, preWriteRow + logicalOffset);
            }

            const bufferLine = terminal?.buffer.active.getLine(row);
            if (!bufferLine) {
              return Math.max(0, preWriteRow + logicalOffset);
            }

            if (!bufferLine.isWrapped) {
              remaining -= 1;
            }
          }

          return row;
        };

        for (const b of snapshotAll) {
          const nextStartRow = rowForParserLine(b.startLine);
          if (blockStartRows.get(b.id) !== nextStartRow) {
            blockStartRows.set(b.id, nextStartRow);
          }
        }

        for (const b of snapshotAll) {
          if (!blockOutputStartRows.has(b.id) && b.outputStartLine > b.startLine) {
            const nextOutputStartRow = rowForParserLine(b.outputStartLine);
            blockOutputStartRows.set(b.id, nextOutputStartRow);
          } else if (b.outputStartLine > b.startLine) {
            const nextOutputStartRow = rowForParserLine(b.outputStartLine);
            if (blockOutputStartRows.get(b.id) !== nextOutputStartRow) {
              blockOutputStartRows.set(b.id, nextOutputStartRow);
            }
          }
        }

        updateBlocksUI();
        writingOutput = false;
        flushOutputQueue();
      });
    };

    void listen<SessionOutputEvent>("session-output", (event) => {
      if (event.payload.session_id !== sessionValue) {
        return;
      }

      pendingOutputEvents.push(new Uint8Array(event.payload.data));
      flushOutputQueue();
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
      }}
    >
      <div ref={containerRef} class="forge-terminal-surface" data-testid="terminal-surface" style={{ "-webkit-app-region": "no-drag" }} />
      <BlockOverlay blocks={blocks()} onRegionHover={handleRegionHover} />
    </div>
  );
}
