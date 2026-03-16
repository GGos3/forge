import { fireEvent, render, waitFor } from "@solidjs/testing-library";
import { createComponent } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionId } from "../types/session";

type SessionOutputHandler = (event: { payload: { session_id: string; data: number[] } }) => void;
type SessionExitHandler = (event: { payload: { session_id: string; exit_code: number | null } }) => void;

interface MockTerminal {
  cols: number;
  rows: number;
  lines: MockBufferLine[];
  dataHandler?: (data: string) => void;
  inputDispose: ReturnType<typeof vi.fn>;
  open: ReturnType<typeof vi.fn>;
  loadAddon: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  onData: ReturnType<typeof vi.fn>;
  onRender: ReturnType<typeof vi.fn>;
  onScroll: ReturnType<typeof vi.fn>;
  onKey: ReturnType<typeof vi.fn>;
  registerMarker: ReturnType<typeof vi.fn>;
  attachCustomKeyEventHandler: ReturnType<typeof vi.fn>;
  hasSelection: ReturnType<typeof vi.fn>;
  buffer: any;
  element: {
    clientHeight: number;
    querySelector: ReturnType<typeof vi.fn>;
  };
}

interface MockBufferLine {
  isWrapped: boolean;
}

interface MockFitAddon {
  fit: ReturnType<typeof vi.fn>;
}

const mockState = vi.hoisted(() => ({
  terminalInstances: [] as MockTerminal[],
  fitAddonInstances: [] as MockFitAddon[],
  resizeObserverInstances: [] as MockResizeObserver[],
  outputUnlisten: vi.fn(),
  exitUnlisten: vi.fn(),
  sessionOutputHandler: undefined as SessionOutputHandler | undefined,
  sessionExitHandler: undefined as SessionExitHandler | undefined,
}));

class MockResizeObserver {
  callback: ResizeObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    mockState.resizeObserverInstances.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (eventName: string, handler: SessionOutputHandler | SessionExitHandler) => {
    if (eventName === "session-output") {
      mockState.sessionOutputHandler = handler as SessionOutputHandler;
      return mockState.outputUnlisten;
    }

    mockState.sessionExitHandler = handler as SessionExitHandler;
    return mockState.exitUnlisten;
  }),
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    dataHandler: ((data: string) => void) | undefined;
    inputDispose = vi.fn();
    open = vi.fn();
    loadAddon = vi.fn();
    write = vi.fn();
    focus = vi.fn();
    dispose = vi.fn();
    onData = vi.fn((handler: (data: string) => void) => {
      this.dataHandler = handler;
      return { dispose: this.inputDispose };
    });
    onRender = vi.fn();
    onScroll = vi.fn();
    onKey = vi.fn();
    registerMarker = vi.fn();
    attachCustomKeyEventHandler = vi.fn();
    hasSelection = vi.fn(() => false);
    lines: MockBufferLine[] = Array.from({ length: 200 }, () => ({ isWrapped: false }));
    buffer = {
      active: {
        baseY: 0,
        viewportY: 0,
        cursorY: 0,
        length: this.lines.length,
        getLine: vi.fn((index: number) => this.lines[index]),
      },
    };
    element = {
      clientHeight: 100,
      querySelector: vi.fn((selector: string) => {
        if (selector === '.xterm-rows') {
          return {
            children: [{
              getBoundingClientRect: () => ({
                height: 17, width: 800,
                top: 0, left: 0, bottom: 17, right: 800,
                x: 0, y: 0, toJSON: () => ({}),
              }),
            }],
            getBoundingClientRect: () => ({
              height: 408, width: 800,
              top: 0, left: 0, bottom: 408, right: 800,
              x: 0, y: 0, toJSON: () => ({}),
            }),
          };
        }
        return null;
      }),
    };

    constructor() {
      mockState.terminalInstances.push(this as MockTerminal);
    }
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = vi.fn();

    constructor() {
      mockState.fitAddonInstances.push(this as MockFitAddon);
    }
  },
}));

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class {
    dispose = vi.fn();
  },
}));

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  writable: true,
  value: MockResizeObserver,
});

import { invoke } from "@tauri-apps/api/core";
import Terminal from "./Terminal";

describe("Terminal", () => {
  beforeEach(() => {
    mockState.terminalInstances.length = 0;
    mockState.fitAddonInstances.length = 0;
    mockState.resizeObserverInstances.length = 0;
    mockState.sessionOutputHandler = undefined;
    mockState.sessionExitHandler = undefined;
    mockState.outputUnlisten.mockClear();
    mockState.exitUnlisten.mockClear();
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("mounts, forwards input, consumes events, and cleans up", async () => {
    const { unmount } = render(() =>
      createComponent(Terminal, { sessionId: { value: "session-1" } as SessionId, focused: true })
    );

    await waitFor(() => expect(mockState.terminalInstances).toHaveLength(1));

    const terminal = mockState.terminalInstances[0];

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("resize_session", {
      payload: {
        session_id: "session-1",
        cols: 80,
        rows: 24,
      },
    }));

    expect(terminal.open).toHaveBeenCalled();
    expect(terminal.focus).toHaveBeenCalled();

    terminal.dataHandler?.("pwd\r");
    expect(invoke).toHaveBeenCalledWith("write_to_session", {
      sessionId: "session-1",
      data: Array.from(new TextEncoder().encode("pwd\r")),
    });

    mockState.sessionOutputHandler?.({ payload: { session_id: "session-1", data: [111, 107] } });
    expect(terminal.write).toHaveBeenCalledWith(new Uint8Array([111, 107]), expect.any(Function));

    mockState.sessionExitHandler?.({ payload: { session_id: "session-1", exit_code: 0 } });
    expect(terminal.write).toHaveBeenCalledWith("\r\n[Process exited with code 0]\r\n");

    const writeCallsBeforeExit = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "write_to_session").length;

    terminal.dataHandler?.("ignored");
    const writeCallsAfterExit = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === "write_to_session").length;

    expect(writeCallsAfterExit).toBe(writeCallsBeforeExit);

    unmount();

    expect(mockState.resizeObserverInstances[0].disconnect).toHaveBeenCalled();
    expect(mockState.outputUnlisten).toHaveBeenCalled();
    expect(mockState.exitUnlisten).toHaveBeenCalled();
    expect(terminal.inputDispose).toHaveBeenCalled();
    expect(terminal.dispose).toHaveBeenCalled();
  });

  it("fits and resizes when the container changes", async () => {
    render(() =>
      createComponent(Terminal, { sessionId: { value: "session-2" } as SessionId, focused: false })
    );

    await waitFor(() => expect(mockState.resizeObserverInstances).toHaveLength(1));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("resize_session", {
      payload: {
        session_id: "session-2",
        cols: 80,
        rows: 24,
      },
    }));

    vi.mocked(invoke).mockClear();
    mockState.fitAddonInstances[0].fit.mockClear();

    mockState.resizeObserverInstances[0].trigger();

    await waitFor(() => expect(mockState.fitAddonInstances[0].fit).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith("resize_session", {
      payload: {
        session_id: "session-2",
        cols: 80,
        rows: 24,
      },
    });
  });

  it("re-focuses terminal on pointer interaction", async () => {
    const { getByTestId } = render(() =>
      createComponent(Terminal, { sessionId: { value: "session-3" } as SessionId, focused: false })
    );

    await waitFor(() => expect(mockState.terminalInstances).toHaveLength(1));
    const terminal = mockState.terminalInstances[0];
    terminal.focus.mockClear();

    fireEvent.pointerDown(getByTestId("terminal-focus-host"));

    await waitFor(() => expect(terminal.focus).toHaveBeenCalled());
  });

  it("anchors new OSC blocks to the pre-write cursor row", async () => {
    const { container } = render(() =>
      createComponent(Terminal, { sessionId: { value: "session-4" } as SessionId, focused: false })
    );

    await waitFor(() => expect(mockState.terminalInstances).toHaveLength(1));

    const terminal = mockState.terminalInstances[0];
    terminal.buffer.active.cursorY = 0;
    terminal.write.mockImplementation((_: Uint8Array, callback?: () => void) => {
      terminal.buffer.active.cursorY = 1;
      callback?.();
    });

    const output = new TextEncoder().encode("\u001b]133;A\u0007\u001b]133;B;echo inline\u0007");
    mockState.sessionOutputHandler?.({
      payload: { session_id: "session-4", data: Array.from(output) },
    });

    await waitFor(() => {
      const block = container.querySelector(".forge-block-card") as HTMLElement | null;
      expect(block).not.toBeNull();
      expect(block?.style.top).toBe("0px");
    });
  });

  it("anchors sequential OSC blocks in one chunk to distinct rows", async () => {
    const { container } = render(() =>
      createComponent(Terminal, { sessionId: { value: "session-5" } as SessionId, focused: false })
    );

    await waitFor(() => expect(mockState.terminalInstances).toHaveLength(1));

    const terminal = mockState.terminalInstances[0];
    terminal.buffer.active.cursorY = 0;
    terminal.write.mockImplementation((_: Uint8Array, callback?: () => void) => {
      terminal.buffer.active.cursorY = 4;
      callback?.();
    });

    const output = new TextEncoder().encode(
      "\u001b]133;A\u0007\u001b]133;B\u0007echo one\n\u001b]133;C\u0007one\n\u001b]133;D;0\u0007\u001b]133;A\u0007\u001b]133;B\u0007echo two\n\u001b]133;C\u0007two\n\u001b]133;D;0\u0007"
    );
    mockState.sessionOutputHandler?.({
      payload: { session_id: "session-5", data: Array.from(output) },
    });

    await waitFor(() => {
      const blocks = Array.from(container.querySelectorAll(".forge-block-card")) as HTMLElement[];
      expect(blocks).toHaveLength(2);
      expect(blocks[0]?.style.top).toBe("0px");
      expect(blocks[1]?.style.top).toBe("34px");
    });
  });

  it("keeps inline OSC blocks on the advanced cursor row once the command line has moved", async () => {
    const { container } = render(() =>
      createComponent(Terminal, { sessionId: { value: "session-6" } as SessionId, focused: false })
    );

    await waitFor(() => expect(mockState.terminalInstances).toHaveLength(1));

    const terminal = mockState.terminalInstances[0];
    terminal.buffer.active.cursorY = 0;
    terminal.write.mockImplementationOnce((_: Uint8Array, callback?: () => void) => {
      terminal.buffer.active.cursorY = 1;
      callback?.();
    });
    mockState.sessionOutputHandler?.({
      payload: {
        session_id: "session-6",
        data: Array.from(new TextEncoder().encode("\u001b]133;A\u0007\n")),
      },
    });

    terminal.write.mockImplementationOnce((_: Uint8Array, callback?: () => void) => {
      terminal.buffer.active.cursorY = 1;
      callback?.();
    });
    mockState.sessionOutputHandler?.({
      payload: {
        session_id: "session-6",
        data: Array.from(new TextEncoder().encode("\u001b]133;B;echo inline\u0007")),
      },
    });

    await waitFor(() => {
      const block = container.querySelector(".forge-block-card") as HTMLElement | null;
      expect(block).not.toBeNull();
      expect(block?.style.top).toBe("17px");
    });
  });

  it("waits for the previous write before anchoring the second command", async () => {
    const { container } = render(() =>
      createComponent(Terminal, { sessionId: { value: "session-7" } as SessionId, focused: false })
    );

    await waitFor(() => expect(mockState.terminalInstances).toHaveLength(1));

    const terminal = mockState.terminalInstances[0];
    let firstWriteDone: (() => void) | undefined;
    terminal.buffer.active.cursorY = 0;
    terminal.write.mockImplementationOnce((_: Uint8Array, callback?: () => void) => {
      firstWriteDone = () => {
        terminal.buffer.active.cursorY = 3;
        callback?.();
      };
    });

    mockState.sessionOutputHandler?.({
      payload: {
        session_id: "session-7",
        data: Array.from(new TextEncoder().encode("\u001b]133;A\u0007\u001b]133;B\u0007ls\n\u001b]133;C\u0007a\nb\n\u001b]133;D;0\u0007")),
      },
    });

    terminal.write.mockImplementationOnce((_: Uint8Array, callback?: () => void) => {
      terminal.buffer.active.cursorY = 4;
      callback?.();
    });
    mockState.sessionOutputHandler?.({
      payload: {
        session_id: "session-7",
        data: Array.from(new TextEncoder().encode("\u001b]133;A\u0007prompt ❯ ls\u001b]133;B;ls\u0007")),
      },
    });

    expect(terminal.write).toHaveBeenCalledTimes(1);
    firstWriteDone?.();

    await waitFor(() => {
      const blocks = Array.from(container.querySelectorAll(".forge-block-card")) as HTMLElement[];
      expect(blocks).toHaveLength(2);
      expect(blocks[1]?.style.top).toBe("51px");
    });
  });

  it("accounts for wrapped xterm rows when mapping later blocks", async () => {
    const { container } = render(() =>
      createComponent(Terminal, { sessionId: { value: "session-8" } as SessionId, focused: false })
    );

    await waitFor(() => expect(mockState.terminalInstances).toHaveLength(1));

    const terminal = mockState.terminalInstances[0];
    terminal.lines[1] = { isWrapped: true };
    terminal.lines[2] = { isWrapped: false };
    terminal.lines[3] = { isWrapped: false };
    terminal.buffer.active.cursorY = 0;
    terminal.write.mockImplementation((_: Uint8Array, callback?: () => void) => {
      terminal.buffer.active.cursorY = 4;
      callback?.();
    });

    const output = new TextEncoder().encode(
      "\u001b]133;A\u0007\u001b]133;B\u0007echo one\n\u001b]133;C\u0007one\n\u001b]133;D;0\u0007\u001b]133;A\u0007\u001b]133;B\u0007echo two\n\u001b]133;C\u0007two\n\u001b]133;D;0\u0007"
    );
    mockState.sessionOutputHandler?.({
      payload: { session_id: "session-8", data: Array.from(output) },
    });

    await waitFor(() => {
      const blocks = Array.from(container.querySelectorAll(".forge-block-card")) as HTMLElement[];
      expect(blocks).toHaveLength(2);
      expect(blocks[1]?.style.top).toBe("51px");
    });
  });
});
