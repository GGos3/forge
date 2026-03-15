import { fireEvent, render, waitFor } from "@solidjs/testing-library";
import { createComponent } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionId } from "../types/session";

type SessionOutputHandler = (event: { payload: { session_id: string; data: number[] } }) => void;
type SessionExitHandler = (event: { payload: { session_id: string; exit_code: number | null } }) => void;

interface MockTerminal {
  cols: number;
  rows: number;
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
});
