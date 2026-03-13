const encoder = new TextEncoder();
const workspaceRoot = "/home/ggos3/workspace/github.com/ggos3/forge";
const defaultShell = "bash";
const shells = [
  { name: "Bash", path: "/bin/bash", shell_type: "bash" },
  { name: "Zsh", path: "/bin/zsh", shell_type: "zsh" },
  { name: "Fish", path: "/usr/bin/fish", shell_type: "fish" },
];

let nextSessionId = 1;
let nextPid = 4100;
const sessions = new Map();

const globalState = {
  listeners: {
    "session-output": new Map(),
    "session-exit": new Map(),
  },
  nextListenerId: 1,
};

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
  switch (command) {
    case "list_available_shells":
      return shells;
    case "get_default_shell":
      return defaultShell;
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
