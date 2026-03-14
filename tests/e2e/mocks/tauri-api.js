const encoder = new TextEncoder();
const workspaceRoot = "/home/ggos3/workspace/github.com/ggos3/forge";
const fixtureRoot = workspaceRoot + "/tests/fixtures/explorer/project-root";
const remoteFixtureRoot = "/remote/project-root";
const defaultShell = "bash";
const shells = [
  { name: "Bash", path: "/bin/bash", shell_type: "bash" },
  { name: "Zsh", path: "/bin/zsh", shell_type: "zsh" },
  { name: "Fish", path: "/usr/bin/fish", shell_type: "fish" },
];

const fixtureModified = Date.UTC(2026, 2, 13, 0, 0, 0);
const directoryPermissions = 0o040755;
const filePermissions = 0o100644;
const readonlyPermissions = 0o100444;
const symlinkPermissions = 0o120777;

const localFileContents = new Map([
  [
    fixtureRoot + "/src/main.ts",
    "import { greet } from \"./utils/helper\";\n\nexport function bootstrap(): string {\n  return greet(\"forge\");\n}\n\nconsole.log(bootstrap());\n",
  ],
  [fixtureRoot + "/src/utils/helper.ts", "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n"],
  [fixtureRoot + "/README.md", "# Explorer Fixture\n\nThis fixture powers Playwright and backend explorer tests.\n"],
  [fixtureRoot + "/.gitignore", "dist/\nnode_modules/\n"],
  [fixtureRoot + "/.hidden-dir/secret.txt", "top secret fixture\n"],
  [fixtureRoot + "/readonly.txt", "Read-only fixture file.\n"],
]);

const binaryFiles = new Map([[fixtureRoot + "/binary.png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]]);
const largeFilePath = fixtureRoot + "/large-file.log";
const unsupportedEncodingPath = fixtureRoot + "/latin1.txt";

const gitStatusFixture = {
  "README.md": "Modified",
  "src/main.ts": "Staged",
  "readonly.txt": "Untracked",
};

let nextSessionId = 1;
let nextPid = 4100;
const sessions = new Map();

const globalState = {
  listeners: {
    "session-output": new Map(),
    "session-exit": new Map(),
  },
  nextListenerId: 1,
  nextConnectionId: 1,
  savedConnections: new Map(),
  activeConnections: new Map(),
  localWrites: new Map(),
  remoteWrites: new Map(),
};

function createNode(name, path, type, size, permissions, permissionDenied = false) {
  return {
    name,
    path,
    type,
    size,
    modified: fixtureModified,
    permissions,
    permission_denied: permissionDenied,
    is_symlink: type === "symlink",
  };
}

function createExplorerTree(rootPath) {
  return new Map([
    [
      rootPath,
      [
        createNode(".hidden-dir", rootPath + "/.hidden-dir", "directory", 0, directoryPermissions),
        createNode("src", rootPath + "/src", "directory", 0, directoryPermissions),
        createNode(".gitignore", rootPath + "/.gitignore", "file", 19, filePermissions),
        createNode("binary.png", rootPath + "/binary.png", "file", 8, filePermissions),
        createNode("large-file.log", rootPath + "/large-file.log", "file", 6 * 1024 * 1024, filePermissions),
        createNode("latin1.txt", rootPath + "/latin1.txt", "file", 12, filePermissions),
        createNode("forbidden-dir", rootPath + "/forbidden-dir", "directory", 0, directoryPermissions, true),
        createNode("docs-link", rootPath + "/docs-link", "symlink", 0, symlinkPermissions),
        createNode("README.md", rootPath + "/README.md", "file", 69, filePermissions),
        createNode("readonly.txt", rootPath + "/readonly.txt", "file", 24, readonlyPermissions),
      ],
    ],
    [rootPath + "/.hidden-dir", [createNode("secret.txt", rootPath + "/.hidden-dir/secret.txt", "file", 19, filePermissions)]],
    [
      rootPath + "/src",
      [
        createNode("utils", rootPath + "/src/utils", "directory", 0, directoryPermissions),
        createNode("main.ts", rootPath + "/src/main.ts", "file", 131, filePermissions),
      ],
    ],
    [rootPath + "/src/utils", [createNode("helper.ts", rootPath + "/src/utils/helper.ts", "file", 77, filePermissions)]],
  ]);
}

const localTree = createExplorerTree(fixtureRoot);
const remoteTree = createExplorerTree(remoteFixtureRoot);

function cloneValue(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/^\/+/, "").replace(/\/$/, "");
}

function resolveRequestPayload(args) {
  if (args && typeof args === "object" && args.request && typeof args.request === "object") {
    return args.request;
  }

  return args;
}

function normalizeLocalPath(args) {
  const request = resolveRequestPayload(args);
  const root = typeof request?.root === "string" && request.root.length > 0 ? request.root.replace(/\/$/, "") : fixtureRoot;
  const rawPath = typeof request?.path === "string" && request.path.length > 0 ? request.path : root;

  if (rawPath === ".") {
    return root;
  }

  if (rawPath === root || rawPath.startsWith(root + "/")) {
    return rawPath;
  }

  const relativePath = normalizeRelativePath(rawPath);
  if (relativePath.length === 0 || relativePath === ".") {
    return root;
  }

  return root + "/" + relativePath;
}

function normalizeRemotePath(args) {
  const rawPath = typeof args?.path === "string" && args.path.length > 0 ? args.path : remoteFixtureRoot;
  if (rawPath === remoteFixtureRoot || rawPath.startsWith(remoteFixtureRoot + "/")) {
    return rawPath;
  }

  const relativePath = normalizeRelativePath(rawPath);
  return relativePath.length === 0 ? remoteFixtureRoot : remoteFixtureRoot + "/" + relativePath;
}

function listTreeEntries(tree, path, showHidden) {
  const entries = tree.get(path);
  if (!entries) {
    throw new Error("Unknown directory: " + path);
  }

  return entries
    .filter((entry) => showHidden || !entry.name.startsWith("."))
    .map((entry) => cloneValue(entry));
}

function readTextFile(path, writes) {
  if (writes.has(path)) {
    return writes.get(path);
  }
  if (localFileContents.has(path)) {
    return localFileContents.get(path);
  }
  return null;
}

function readRemoteTextFile(path) {
  if (globalState.remoteWrites.has(path)) {
    return globalState.remoteWrites.get(path);
  }

  const localPath = fixtureRoot + path.slice(remoteFixtureRoot.length);
  if (localFileContents.has(localPath)) {
    return localFileContents.get(localPath);
  }

  return null;
}

function buildFileContent(path, content, isBinary, permissions, sizeOverride) {
  const size = typeof sizeOverride === "number" ? sizeOverride : content.length;
  return {
    path,
    content,
    size,
    encoding: isBinary ? "binary" : "utf-8",
    is_binary: isBinary,
    is_read_only: permissions === readonlyPermissions,
    is_unsupported_encoding: false,
    permissions,
  };
}

function requireConnection(connectionId) {
  if (!globalState.activeConnections.has(connectionId)) {
    throw new Error("Unknown SSH connection: " + connectionId);
  }
}

function marker(content) {
  return "\u001b]133;" + content + "\u0007";
}

function promptFor(shell) {
  return shell === "powershell" ? "PS forge-e2e> " : "forge-e2e$ ";
}

function emit(event, payload) {
  const listeners = globalState.listeners[event];
  if (!listeners) return;
  for (const [id, listener] of listeners.entries()) {
    listener({ event, id, payload });
  }
}

function emitOutput(sessionId, output) {
  emit("session-output", {
    session_id: sessionId,
    data: Array.from(encoder.encode(output)),
  });
}

function emitExit(sessionId, exitCode) {
  emit("session-exit", {
    session_id: sessionId,
    exit_code: exitCode,
  });
}

function decodeInput(data) {
  if (!Array.isArray(data)) return "";
  return String.fromCharCode(...data.filter((v) => typeof v === "number"));
}

function runCommand(command, session) {
  const trimmed = command.trim();
  if (trimmed.length === 0) return { output: "", exitCode: 0 };
  if (trimmed === "pwd") return { output: workspaceRoot + "\r\n", exitCode: 0 };
  if (trimmed === "echo $$") return { output: session.pid + "\r\n", exitCode: 0 };
  if (trimmed === "false") return { output: "", exitCode: 1 };
  if (trimmed === "true") return { output: "", exitCode: 0 };
  if (trimmed === "exit") return { output: "logout\r\n", exitCode: 0, shouldExit: true };
  if (trimmed.startsWith("echo ")) {
    const value = trimmed.slice(5).trim();
    return { output: value + "\r\n", exitCode: 0 };
  }
  return { output: "command not found: " + trimmed + "\r\n", exitCode: 127 };
}

function submitCommand(session) {
  const command = session.input;
  session.input = "";
  if (command.trim().length === 0) {
    emitOutput(session.id, "\r\n" + marker("A") + promptFor(session.shell));
    return;
  }
  const result = runCommand(command, session);
  emitOutput(session.id, "\r\n" + marker("B;" + command) + marker("C") + result.output + marker("D;" + result.exitCode));
  if (result.shouldExit) {
    session.alive = false;
    sessions.delete(session.id);
    emitExit(session.id, result.exitCode);
    return;
  }
  emitOutput(session.id, marker("A") + promptFor(session.shell));
}

function handleSessionInput(session, input) {
  for (const char of input) {
    if (!session.alive) return;
    if (char === "\r" || char === "\n") {
      submitCommand(session);
      continue;
    }
    if (char === "\u0003") {
      session.input = "";
      emitOutput(session.id, "^C\r\n" + marker("A") + promptFor(session.shell));
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

export async function invoke(command, args) {
  if (typeof command === "string" && command.startsWith("plugin:dialog|open")) {
    return fixtureRoot;
  }

  switch (command) {
    case "list_available_shells":
      return shells;
    case "get_default_shell":
      return defaultShell;
    case "list_directory": {
      const path = normalizeLocalPath(args);
      return listTreeEntries(localTree, path, Boolean(args?.show_hidden));
    }
    case "read_file": {
      const path = normalizeLocalPath(args);
      if (path === largeFilePath) {
        return {
          path,
          content: "",
          size: 6 * 1024 * 1024,
          encoding: "utf-8",
          is_binary: false,
          is_read_only: false,
          is_unsupported_encoding: false,
          permissions: filePermissions,
        };
      }

      if (path === unsupportedEncodingPath) {
        return {
          path,
          content: "",
          size: 12,
          encoding: "latin1",
          is_binary: false,
          is_read_only: false,
          is_unsupported_encoding: true,
          permissions: filePermissions,
        };
      }

      const binary = binaryFiles.get(path);
      if (binary) {
        return buildFileContent(path, "", true, filePermissions, binary.byteLength);
      }

      const content = readTextFile(path, globalState.localWrites);
      if (content === null) {
        throw new Error("Unknown file: " + path);
      }

      const permissions = path.endsWith("/readonly.txt") ? readonlyPermissions : filePermissions;
      return buildFileContent(path, content, false, permissions);
    }
    case "write_file": {
      const request = resolveRequestPayload(args);
      const path = normalizeLocalPath(request);
      if (typeof request?.content !== "string") {
        throw new Error("write_file requires string content");
      }
      globalState.localWrites.set(path, request.content);
      return null;
    }
    case "start_local_watcher":
      return null;
    case "stop_local_watcher":
      return null;
    case "connect_ssh": {
      const profile = args?.profile ?? args;
      const connectionId = "connection-" + globalState.nextConnectionId++;
      globalState.activeConnections.set(connectionId, cloneValue(profile));
      emit("ssh-connection-lifecycle", {
        status: "connected",
        profileId: typeof profile?.id === "string" ? profile.id : connectionId,
        connectionId,
      });
      return {
        connectionId,
        profileId: typeof profile?.id === "string" ? profile.id : connectionId,
      };
    }
    case "disconnect_ssh": {
      const connectionId = args?.connection_id;
      if (typeof connectionId === "string") {
        const profile = globalState.activeConnections.get(connectionId);
        globalState.activeConnections.delete(connectionId);
        emit("ssh-connection-lifecycle", {
          status: "disconnected",
          profileId: typeof profile?.id === "string" ? profile.id : connectionId,
          connectionId,
          reason: "Disconnected from mock backend.",
        });
      }
      return null;
    }
    case "list_remote_directory": {
      const connectionId = args?.connection_id;
      if (typeof connectionId !== "string") {
        throw new Error("list_remote_directory requires connection_id");
      }
      requireConnection(connectionId);
      return listTreeEntries(remoteTree, normalizeRemotePath(args), Boolean(args?.show_hidden));
    }
    case "read_remote_file": {
      const connectionId = args?.connection_id;
      if (typeof connectionId !== "string") {
        throw new Error("read_remote_file requires connection_id");
      }
      requireConnection(connectionId);
      const path = normalizeRemotePath(args);
      const content = readRemoteTextFile(path);
      if (content === null) {
        throw new Error("Unknown remote file: " + path);
      }
      return buildFileContent(path, content, false, filePermissions);
    }
    case "write_remote_file": {
      const connectionId = args?.connection_id;
      if (typeof connectionId !== "string") {
        throw new Error("write_remote_file requires connection_id");
      }
      requireConnection(connectionId);
      const path = normalizeRemotePath(args);
      if (typeof args?.content !== "string") {
        throw new Error("write_remote_file requires string content");
      }
      globalState.remoteWrites.set(path, args.content);
      return null;
    }
    case "get_git_status":
      return cloneValue(gitStatusFixture);
    case "list_connections":
      return Array.from(globalState.savedConnections.values()).map((profile) => cloneValue(profile));
    case "save_connection": {
      const profile = args?.profile ?? args;
      if (!profile || typeof profile.id !== "string") {
        throw new Error("save_connection requires a profile with an id");
      }
      globalState.savedConnections.set(profile.id, cloneValue(profile));
      return cloneValue(profile);
    }
    case "delete_connection": {
      const id = args?.id;
      if (typeof id === "string") {
        globalState.savedConnections.delete(id);
      }
      return null;
    }
    case "test_connection":
      return true;
    case "verify_host_key_response":
      return null;
    case "__mock_emit_event": {
      const event = args?.event;
      if (typeof event !== "string" || event.length === 0) {
        throw new Error("__mock_emit_event requires an event name");
      }
      emit(event, args?.payload ?? null);
      return null;
    }
    case "__mock_set_host_key_verification": {
      const module = await import("/src/stores/connection.ts");
      module.connectionStore.setPendingHostKeyVerification(args?.payload ?? null);
      return null;
    }
    case "create_session": {
      const shell = args?.config?.shell ?? defaultShell;
      const sessionId = "session-" + nextSessionId++;
      const session = {
        id: sessionId,
        shell: shell,
        pid: nextPid++,
        cols: 80,
        rows: 24,
        input: "",
        alive: true,
      };
      sessions.set(sessionId, session);
      setTimeout(() => {
        emitOutput(session.id, marker("A") + promptFor(session.shell));
      }, 0);
      return sessionId;
    }
    case "write_to_session": {
      const sessionId = args?.session_id;
      const session = sessions.get(sessionId);
      if (!session) throw new Error("Unknown session: " + sessionId);
      handleSessionInput(session, decodeInput(args?.data));
      return null;
    }
    case "resize_session": {
      const payload = args?.payload;
      const sessionId = payload?.session_id;
      if (typeof sessionId === "string") {
        const session = sessions.get(sessionId);
        if (session) {
          session.cols = payload?.cols ?? session.cols;
          session.rows = payload?.rows ?? session.rows;
        }
      }
      return null;
    }
    case "close_session": {
      const sessionId = args?.session_id;
      const session = sessions.get(sessionId);
      if (session) {
        session.alive = false;
        sessions.delete(sessionId);
        emitExit(sessionId, 0);
      }
      return null;
    }
    default:
      throw new Error("Unsupported mock command: " + command);
  }
}

export async function listen(event, listener) {
  const id = globalState.nextListenerId++;
  const listeners = globalState.listeners[event] ?? new Map();
  listeners.set(id, listener);
  globalState.listeners[event] = listeners;
  return () => {
    listeners.delete(id);
  };
}

if (typeof globalThis === "object") {
  globalThis.__forgeE2eTauriMock = {
    invoke,
    listen,
  };
}
