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
const fixtureRoot = `${workspaceRoot}/tests/fixtures/explorer/project-root`;
const defaultShell: ShellType = "bash";
const shells: ShellInfo[] = [
  { name: "Bash", path: "/bin/bash", shell_type: "bash" },
  { name: "Zsh", path: "/bin/zsh", shell_type: "zsh" },
  { name: "Fish", path: "/usr/bin/fish", shell_type: "fish" },
];

const fixtureModified = Date.UTC(2026, 2, 13, 0, 0, 0);
const directoryPermissions = 0o040755;
const filePermissions = 0o100644;
const readonlyPermissions = 0o100444;
const symlinkPermissions = 0o120777;
const largeFilePath = `${fixtureRoot}/large-file.log`;
const unsupportedEncodingPath = `${fixtureRoot}/latin1.txt`;

const localFileContents = new Map<string, string>([
  [
    `${fixtureRoot}/src/main.ts`,
    "import { greet } from \"./utils/helper\";\n\nexport function bootstrap(): string {\n  return greet(\"forge\");\n}\n\nconsole.log(bootstrap());\n",
  ],
  [`${fixtureRoot}/src/utils/helper.ts`, "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n"],
  [`${fixtureRoot}/README.md`, "# Explorer Fixture\n\nThis fixture powers Playwright and backend explorer tests.\n"],
  [`${fixtureRoot}/.gitignore`, "dist/\nnode_modules/\n"],
  [`${fixtureRoot}/.hidden-dir/secret.txt`, "top secret fixture\n"],
  [`${fixtureRoot}/readonly.txt`, "Read-only fixture file.\n"],
]);

const localWrites = new Map<string, string>();

type ExplorerNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modified: number;
  permissions: number;
  is_symlink?: boolean;
  permission_denied?: boolean;
};

function createNode(
  name: string,
  path: string,
  type: ExplorerNode["type"] | "symlink",
  size: number,
  permissions: number,
  permissionDenied = false
): ExplorerNode {
  return {
    name,
    path,
    type: type === "symlink" ? "file" : type,
    size,
    modified: fixtureModified,
    permissions,
    is_symlink: type === "symlink",
    permission_denied: permissionDenied,
  };
}

function createExplorerTree(rootPath: string): Map<string, ExplorerNode[]> {
  return new Map<string, ExplorerNode[]>([
    [
      rootPath,
      [
        createNode(".hidden-dir", `${rootPath}/.hidden-dir`, "directory", 0, directoryPermissions),
        createNode("src", `${rootPath}/src`, "directory", 0, directoryPermissions),
        createNode(".gitignore", `${rootPath}/.gitignore`, "file", 19, filePermissions),
        createNode("binary.png", `${rootPath}/binary.png`, "file", 8, filePermissions),
        createNode("large-file.log", `${rootPath}/large-file.log`, "file", 6 * 1024 * 1024, filePermissions),
        createNode("latin1.txt", `${rootPath}/latin1.txt`, "file", 12, filePermissions),
        createNode("forbidden-dir", `${rootPath}/forbidden-dir`, "directory", 0, directoryPermissions, true),
        createNode("docs-link", `${rootPath}/docs-link`, "symlink", 0, symlinkPermissions),
        createNode("README.md", `${rootPath}/README.md`, "file", 69, filePermissions),
        createNode("readonly.txt", `${rootPath}/readonly.txt`, "file", 24, readonlyPermissions),
      ],
    ],
    [`${rootPath}/.hidden-dir`, [createNode("secret.txt", `${rootPath}/.hidden-dir/secret.txt`, "file", 19, filePermissions)]],
    [
      `${rootPath}/src`,
      [
        createNode("utils", `${rootPath}/src/utils`, "directory", 0, directoryPermissions),
        createNode("main.ts", `${rootPath}/src/main.ts`, "file", 131, filePermissions),
      ],
    ],
    [`${rootPath}/src/utils`, [createNode("helper.ts", `${rootPath}/src/utils/helper.ts`, "file", 77, filePermissions)]],
  ]);
}

const localTree = createExplorerTree(fixtureRoot);

function normalizeRelativePath(value: unknown): string {
  return String(value ?? "").replace(/^\/+/, "").replace(/\/$/, "");
}

function resolveRequestPayload(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object" && "request" in args) {
    const request = (args as { request?: Record<string, unknown> }).request;
    if (request && typeof request === "object") {
      return request;
    }
  }

  return (args as Record<string, unknown>) ?? {};
}

function normalizeLocalPath(args: unknown): string {
  const request = resolveRequestPayload(args);
  const root = typeof request.root === "string" && request.root.length > 0 ? request.root.replace(/\/$/, "") : fixtureRoot;
  const rawPath = typeof request.path === "string" && request.path.length > 0 ? request.path : root;

  if (rawPath === ".") {
    return root;
  }

  if (rawPath === root || rawPath.startsWith(`${root}/`)) {
    return rawPath;
  }

  const relativePath = normalizeRelativePath(rawPath);
  if (relativePath.length === 0 || relativePath === ".") {
    return root;
  }

  return `${root}/${relativePath}`;
}

function listTreeEntries(path: string, showHidden: boolean): ExplorerNode[] {
  const entries = localTree.get(path);
  if (!entries) {
    throw new Error(`Unknown directory: ${path}`);
  }

  return entries
    .filter((entry) => showHidden || !entry.name.startsWith("."))
    .map((entry) => ({ ...entry }));
}

function readTextFile(path: string): string | null {
  if (localWrites.has(path)) {
    return localWrites.get(path) ?? null;
  }

  if (localFileContents.has(path)) {
    return localFileContents.get(path) ?? null;
  }

  return null;
}

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
    case "plugin:dialog|open":
      return fixtureRoot as T;
    case "list_directory": {
      const path = normalizeLocalPath(args);
      const showHidden = Boolean((resolveRequestPayload(args).show_hidden as boolean | undefined) ?? false);
      return listTreeEntries(path, showHidden) as T;
    }
    case "read_file": {
      const path = normalizeLocalPath(args);
      if (path === largeFilePath) {
        return {
          path,
          content: "",
          size: 6 * 1024 * 1024,
          is_binary: false,
          is_read_only: false,
          is_unsupported_encoding: false,
          permissions: filePermissions,
        } as T;
      }

      if (path === unsupportedEncodingPath) {
        return {
          path,
          content: "",
          size: 12,
          is_binary: false,
          is_read_only: false,
          is_unsupported_encoding: true,
          permissions: filePermissions,
        } as T;
      }

      if (path.endsWith("/binary.png")) {
        return {
          path,
          content: "",
          size: 8,
          is_binary: true,
          is_read_only: false,
          is_unsupported_encoding: false,
          permissions: filePermissions,
        } as T;
      }

      const content = readTextFile(path);
      if (content === null) {
        throw new Error(`Unknown file: ${path}`);
      }

      const permissions = path.endsWith("/readonly.txt") ? readonlyPermissions : filePermissions;
      return {
        path,
        content,
        size: content.length,
        is_binary: false,
        is_read_only: permissions === readonlyPermissions,
        is_unsupported_encoding: false,
        permissions,
      } as T;
    }
    case "write_file": {
      const request = resolveRequestPayload(args);
      const path = normalizeLocalPath(request);
      const content = request.content;
      if (typeof content !== "string") {
        throw new Error("write_file requires string content");
      }

      localWrites.set(path, content);
      return null as T;
    }
    case "get_git_status":
      return {
        "README.md": "Modified",
        "src/main.ts": "Staged",
        "readonly.txt": "Untracked",
      } as T;
    case "start_local_watcher":
      return null as T;
    case "stop_local_watcher":
      return null as T;
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
      const sessionId = typeof args?.sessionId === "string" ? args.sessionId : "";
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
      const sessionId = typeof args?.sessionId === "string" ? args.sessionId : "";
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
