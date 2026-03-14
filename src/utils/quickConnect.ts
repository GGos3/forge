import type { QuickConnectParsed } from "../types/connection";

const DEFAULT_SSH_PORT = 22;
const DEFAULT_SSH_USERNAME = "root";

export function parseQuickConnect(input: string): QuickConnectParsed | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let username = DEFAULT_SSH_USERNAME;
  let hostAndPort: string;

  const atIndex = trimmed.indexOf("@");
  if (atIndex >= 0) {
    const userPart = trimmed.slice(0, atIndex);
    if (!userPart) return null;
    username = userPart;
    hostAndPort = trimmed.slice(atIndex + 1);
  } else {
    hostAndPort = trimmed;
  }

  if (!hostAndPort) return null;

  let host: string;
  let port = DEFAULT_SSH_PORT;

  if (hostAndPort.startsWith("[")) {
    const closeBracket = hostAndPort.indexOf("]");
    if (closeBracket < 0) return null;

    host = hostAndPort.slice(1, closeBracket);
    const afterBracket = hostAndPort.slice(closeBracket + 1);

    if (afterBracket.startsWith(":")) {
      const parsedPort = Number(afterBracket.slice(1));
      if (!Number.isFinite(parsedPort) || parsedPort < 1 || parsedPort > 65535) return null;
      port = parsedPort;
    } else if (afterBracket !== "") {
      return null;
    }
  } else {
    const colonIndex = hostAndPort.lastIndexOf(":");
    if (colonIndex >= 0) {
      const portStr = hostAndPort.slice(colonIndex + 1);
      const parsedPort = Number(portStr);
      if (Number.isFinite(parsedPort) && parsedPort >= 1 && parsedPort <= 65535) {
        host = hostAndPort.slice(0, colonIndex);
        port = parsedPort;
      } else {
        return null;
      }
    } else {
      host = hostAndPort;
    }
  }

  if (!host) return null;

  return { username, host, port };
}
