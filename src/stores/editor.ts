import { invoke } from "@tauri-apps/api/core";
import { createStore, produce } from "solid-js/store";
import type { EditorBuffer, EditorLanguage, EditorState } from "../types/editor";
import type { FileTreeProvider } from "../types/file-node";
import { explorerStore } from "./explorer";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

interface ReadFileResponse {
  root?: string;
  path?: string;
  content: string;
  size?: number;
  is_binary?: boolean;
  isBinary?: boolean;
  is_read_only?: boolean;
  isReadOnly?: boolean;
  is_unsupported_encoding?: boolean;
  isUnsupportedEncoding?: boolean;
}

interface OpenFileOptions {
  connectionId?: string;
}

const [state, setState] = createStore<EditorState>({
  activeBuffer: null,
  recentFiles: [],
});

function detectLanguage(filePath: string): EditorLanguage {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "javascript";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".rs")) return "rust";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md")) return "markdown";
  return "plaintext";
}

function isBinaryContent(response: ReadFileResponse): boolean {
  if (response.is_binary || response.isBinary) {
    return true;
  }

  return response.content.includes("\0");
}

function isOversized(response: ReadFileResponse): boolean {
  if (typeof response.size === "number") {
    return response.size > MAX_FILE_SIZE_BYTES;
  }

  return new TextEncoder().encode(response.content).byteLength > MAX_FILE_SIZE_BYTES;
}

function toReadOnly(response: ReadFileResponse): boolean {
  return Boolean(response.is_read_only ?? response.isReadOnly ?? false);
}

function isUnsupportedEncoding(response: ReadFileResponse): boolean {
  return Boolean(response.is_unsupported_encoding ?? response.isUnsupportedEncoding ?? false);
}

function formatSizeMB(sizeBytes: number): string {
  return (sizeBytes / (1024 * 1024)).toFixed(2);
}

function pushRecentFile(filePath: string): void {
  setState("recentFiles", (prev) => [filePath, ...prev.filter((item) => item !== filePath)]);
}

function splitFilePathForRequest(filePath: string): { root: string; path: string } {
  const normalized = filePath.replace(/\/+$/, "");
  const lastSlash = normalized.lastIndexOf("/");

  if (lastSlash === -1) {
    return { root: ".", path: normalized };
  }

  if (lastSlash === 0) {
    return { root: "/", path: normalized.slice(1) };
  }

  return {
    root: normalized.slice(0, lastSlash),
    path: normalized.slice(lastSlash + 1),
  };
}

function toRequestPath(filePath: string, provider: FileTreeProvider): { root: string; path: string } {
  if (provider !== "local") {
    return splitFilePathForRequest(filePath);
  }

  const rootPath = explorerStore.root?.rootPath;
  if (!rootPath) {
    return splitFilePathForRequest(filePath);
  }

  const normalizedRoot = rootPath.replace(/\/+$/, "");
  const normalizedPath = filePath.replace(/\/+$/, "");

  if (normalizedPath === normalizedRoot) {
    return { root: normalizedRoot, path: "." };
  }

  if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return {
      root: normalizedRoot,
      path: normalizedPath.slice(normalizedRoot.length + 1),
    };
  }

  return splitFilePathForRequest(filePath);
}

function resolveRemoteConnectionId(connectionId?: string): string {
  if (connectionId) {
    return connectionId;
  }

  const activeRoot = explorerStore.root;
  if (activeRoot?.provider === "remote" && activeRoot.connectionId) {
    return activeRoot.connectionId;
  }

  throw new Error("Remote editor operations require an active SSH connection.");
}

async function readEditorFile(path: string, provider: FileTreeProvider, connectionId?: string): Promise<ReadFileResponse> {
  if (provider === "remote") {
    return invoke<ReadFileResponse>("read_remote_file", {
      connection_id: resolveRemoteConnectionId(connectionId),
      path,
    });
  }

  const request = toRequestPath(path, provider);
  return invoke<ReadFileResponse>("read_file", request);
}

export const editorStore = {
  get activeBuffer() {
    return state.activeBuffer;
  },

  get recentFiles() {
    return state.recentFiles;
  },

  reset() {
    setState({
      activeBuffer: null,
      recentFiles: [],
    });
  },

  async openFile(path: string, provider: FileTreeProvider, options: OpenFileOptions = {}): Promise<void> {
    const connectionId = provider === "remote" ? resolveRemoteConnectionId(options.connectionId) : undefined;
    const response = await readEditorFile(path, provider, connectionId);

    if (isBinaryContent(response)) {
      const size = typeof response.size === "number" ? response.size : new TextEncoder().encode(response.content).byteLength;
      throw new Error(`Binary file — cannot edit (${size} bytes).`);
    }

    if (isOversized(response)) {
      const size = typeof response.size === "number" ? response.size : new TextEncoder().encode(response.content).byteLength;
      throw new Error(`File too large (${formatSizeMB(size)} MB). Maximum: 5MB.`);
    }

    if (isUnsupportedEncoding(response)) {
      throw new Error("Unsupported encoding. Only UTF-8 text files can be edited.");
    }

    const content = response.content;
    const nextBuffer: EditorBuffer = {
      filePath: path,
      content,
      originalContent: content,
      isDirty: false,
      language: detectLanguage(path),
      isReadOnly: toReadOnly(response),
      isConnectionLost: false,
      provider,
      connectionId,
    };

    setState("activeBuffer", nextBuffer);
    pushRecentFile(nextBuffer.filePath);
  },

  async saveFile(): Promise<void> {
    const buffer = state.activeBuffer;
    if (!buffer || buffer.isReadOnly) {
      return;
    }

    if (buffer.provider === "remote") {
      await invoke("write_remote_file", {
        connection_id: resolveRemoteConnectionId(buffer.connectionId),
        path: buffer.filePath,
        content: buffer.content,
      });
    } else {
      const requestPath = toRequestPath(buffer.filePath, buffer.provider);

      await invoke("write_file", {
        request: {
          root: requestPath.root,
          path: requestPath.path,
          content: buffer.content,
        },
      });
    }

    this.markClean();
  },

  closeFile() {
    setState("activeBuffer", null);
  },

  handleConnectionDisconnected(connectionId: string) {
    const buffer = state.activeBuffer;
    if (!buffer || buffer.provider !== "remote" || buffer.connectionId !== connectionId) {
      return;
    }

    setState(
      produce((s) => {
        if (!s.activeBuffer || s.activeBuffer.provider !== "remote" || s.activeBuffer.connectionId !== connectionId) {
          return;
        }

        s.activeBuffer.isReadOnly = true;
        s.activeBuffer.isConnectionLost = true;
      })
    );
  },

  updateContent(content: string) {
    setState(
      produce((s) => {
        if (!s.activeBuffer) {
          return;
        }

        s.activeBuffer.content = content;
        s.activeBuffer.isDirty = content !== s.activeBuffer.originalContent;
      })
    );
  },

  markClean() {
    setState(
      produce((s) => {
        if (!s.activeBuffer) {
          return;
        }

        s.activeBuffer.originalContent = s.activeBuffer.content;
        s.activeBuffer.isDirty = false;
      })
    );
  },
};
