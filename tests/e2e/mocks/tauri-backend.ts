import type {
  SessionExitEvent,
  SessionOutputEvent,
  ShellInfo,
  ShellType,
} from "../../../src/types/session";

type EventPayloadMap = {
  "session-output": SessionOutputEvent;
  "session-exit": SessionExitEvent;
};

type EventName = keyof EventPayloadMap;
type EventListener<T> = (event: { event: EventName; id: number; payload: T }) => void;

interface SessionState {
  id: string;
  shell: ShellType;
  pid: number;
  cols: number;
  rows: number;
  input: string;
  alive: boolean;
}

interface BackendState {
  listeners: Map<EventName, Map<number, EventListener<unknown>>>;
  nextListenerId: number;
  nextSessionId: number;
  nextPid: number;
  sessions: Map<string, SessionState>;
}

declare global {
  var __forgeE2eBackendState__: BackendState | undefined;
}

const encoder = new TextEncoder();
const bell = "\u0007";
const osc = "\u001b]";
const workspaceRoot = "/home/ggos3/workspace/github.com/ggos3/forge";
const defaultShell: ShellType = "bash";
const shells: ShellInfo[] = [
  { name: "Bash", path: "/bin/bash", shell_type: "bash" },
  { name: "Zsh", path: "/bin/zsh", shell_type: "zsh" },
  { name: "Fish", path: "/usr/bin/fish", shell_type: "fish" },
];

function marker(content: string): string {
  return `${osc}133;${content}${bell}`;
}

function promptFor(session: SessionState): string {
  return session.shell === "powershell" ? "PS forge-e2e> " : "forge-e2e$ ";
}

function getState(): BackendState {
  if (!globalThis.__forgeE2eBackendState__) {
    globalThis.__forgeE2eBackendState__ = {
      listeners: new Map(),
      nextListenerId: 1,
      nextSessionId: 1,
      nextPid: 4100,
      sessions: new Map(),
    };
  }

  return globalThis.__forgeE2eBackendState__;
}

function emit<T extends EventName>(event: T, payload: EventPayloadMap[T]): void {
  const listeners = getState().listeners.get(event);
  if (!listeners) {
    return;
  }

  for (const [id, listener] of listeners.entries()) {
    listener({ event, id, payload });
  }
}

function emitOutput(sessionId: string, output: string): void {
  emit("session-output", {
    session_id: sessionId,
    data: Array.from(encoder.encode(output)),
  });
}

function emitExit(sessionId: string, exitCode: number | null): void {
  emit("session-exit", {
    session_id: sessionId,
    exit_code: exitCode,
  });
}

function decodeInput(data: unknown): string {
  if (!Array.isArray(data)) {
    return "";
  }

  return String.fromCharCode(...data.filter((value): value is number => typeof value === "number"));
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function runCommand(command: string, session: SessionState): {
  output: string;
  exitCode: number;
  shouldExit?: boolean;
} {
  const trimmed = command.trim();

  if (trimmed.length === 0) {
    return { output: "", exitCode: 0 };
  }

  if (trimmed === "pwd") {
    return { output: `${workspaceRoot}\r\n`, exitCode: 0 };
  }

  if (trimmed === "echo $$") {
    return { output: `${session.pid}\r\n`, exitCode: 0 };
  }

  if (trimmed === "false") {
    return { output: "", exitCode: 1 };
  }

  if (trimmed === "true") {
    return { output: "", exitCode: 0 };
  }

  if (trimmed === "exit") {
    return { output: "logout\r\n", exitCode: 0, shouldExit: true };
  }

  if (trimmed.startsWith("echo")) {
    const value = stripWrappingQuotes(trimmed.slice(4));
    return { output: `${value.trimStart()}\r\n`, exitCode: 0 };
  }

  if (trimmed.startsWith("seq ")) {
    const [, startRaw, endRaw] = trimmed.split(/\s+/, 3);
    const start = Number.parseInt(startRaw ?? "", 10);
    const end = Number.parseInt(endRaw ?? "", 10);

    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      return {
        output: `${Array.from({ length: end - start + 1 }, (_, index) => `${start + index}`).join("\r\n")}\r\n`,
        exitCode: 0,
      };
    }
  }

  return {
    output: `command not found: ${trimmed}\r\n`,
    exitCode: 127,
  };
}

function submitCommand(session: SessionState): void {
  const command = session.input;
  session.input = "";

  if (command.trim().length === 0) {
    emitOutput(session.id, `\r\n${marker("A")}${promptFor(session)}`);
    return;
  }

  const result = runCommand(command, session);
  emitOutput(
    session.id,
    `\r\n${marker(`B;${command}`)}${marker("C")}${result.output}${marker(`D;${result.exitCode}`)}`
  );

  if (result.shouldExit) {
    session.alive = false;
    getState().sessions.delete(session.id);
    emitExit(session.id, result.exitCode);
    return;
  }

  emitOutput(session.id, `${marker("A")}${promptFor(session)}`);
}

function handleSessionInput(session: SessionState, input: string): void {
  for (const char of input) {
    if (!session.alive) {
      return;
    }

    if (char === "\r" || char === "\n") {
      submitCommand(session);
      continue;
    }

    if (char === "\u0003") {
      session.input = "";
      emitOutput(session.id, `^C\r\n${marker("A")}${promptFor(session)}`);
      continue;
    }

    if (char === "\u007f") {
      session.input = session.input.slice(0, -1);
      continue;
    }

    session.input += char;
    emitOutput(session.id, char);
  }
}

export async function invokeMock<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const state = getState();

  switch (command) {
    case "list_available_shells":
      return shells as T;
    case "get_default_shell":
      return defaultShell as T;
    case "create_session": {
      const shell = (args?.config as { shell?: ShellType } | undefined)?.shell ?? defaultShell;
      const sessionId = `session-${state.nextSessionId++}`;
      const session: SessionState = {
        id: sessionId,
        shell,
        pid: state.nextPid++,
        cols: 80,
        rows: 24,
        input: "",
        alive: true,
      };

      state.sessions.set(sessionId, session);
      queueMicrotask(() => {
        emitOutput(session.id, `${marker("A")}${promptFor(session)}`);
      });
      return sessionId as T;
    }
    case "write_to_session": {
      const sessionId = typeof args?.session_id === "string" ? args.session_id : "";
      const session = state.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Unknown session: ${sessionId}`);
      }

      handleSessionInput(session, decodeInput(args?.data));
      return null as T;
    }
    case "resize_session": {
      const payload = args?.payload as { session_id?: string; cols?: number; rows?: number } | undefined;
      const sessionId = payload?.session_id;
      if (typeof sessionId === "string") {
        const session = state.sessions.get(sessionId);
        if (session) {
          session.cols = payload?.cols ?? session.cols;
          session.rows = payload?.rows ?? session.rows;
        }
      }

      return null as T;
    }
    case "close_session": {
      const sessionId = typeof args?.session_id === "string" ? args.session_id : "";
      const session = state.sessions.get(sessionId);
      if (session) {
        session.alive = false;
        state.sessions.delete(sessionId);
        emitExit(sessionId, 0);
      }

      return null as T;
    }
    default:
      throw new Error(`Unsupported mock command: ${command}`);
  }
}

export function listenMock<T>(event: EventName, listener: EventListener<T>): () => void {
  const state = getState();
  const id = state.nextListenerId++;
  const listeners = state.listeners.get(event) ?? new Map<number, EventListener<unknown>>();

  listeners.set(id, listener as EventListener<unknown>);
  state.listeners.set(event, listeners);

  return () => {
    listeners.delete(id);
    if (listeners.size === 0) {
      state.listeners.delete(event);
    }
  };
}
