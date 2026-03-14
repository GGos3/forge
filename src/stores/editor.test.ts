import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { editorStore } from "./editor";

describe("editor store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editorStore.reset();
  });

  it("opens a text file and initializes clean buffer", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      path: "/workspace/src/main.ts",
      content: "const hello = 'forge';",
      size: 22,
      is_binary: false,
      is_read_only: false,
    });

    await editorStore.openFile("/workspace/src/main.ts", "local");

    expect(invoke).toHaveBeenCalledWith("read_file", { root: "/workspace/src", path: "main.ts" });
    expect(editorStore.activeBuffer).toMatchObject({
      filePath: "/workspace/src/main.ts",
      content: "const hello = 'forge';",
      originalContent: "const hello = 'forge';",
      isDirty: false,
      language: "typescript",
      provider: "local",
      isReadOnly: false,
    });
    expect(editorStore.recentFiles).toEqual(["/workspace/src/main.ts"]);
  });

  it("tracks dirty state based on content diff and markClean", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      content: "line one",
      size: 8,
      is_binary: false,
    });

    await editorStore.openFile("/workspace/README.md", "local");

    editorStore.updateContent("line one updated");
    expect(editorStore.activeBuffer?.isDirty).toBe(true);

    editorStore.updateContent("line one");
    expect(editorStore.activeBuffer?.isDirty).toBe(false);

    editorStore.updateContent("line two");
    editorStore.markClean();
    expect(editorStore.activeBuffer?.originalContent).toBe("line two");
    expect(editorStore.activeBuffer?.isDirty).toBe(false);
  });

  it("saveFile writes content and clears dirty flag", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        content: "old",
        size: 3,
        is_binary: false,
      })
      .mockResolvedValueOnce(null);

    await editorStore.openFile("/workspace/file.txt", "local");
    editorStore.updateContent("new");

    await editorStore.saveFile();

    expect(invoke).toHaveBeenCalledWith("write_file", {
      request: {
        root: "/workspace",
        path: "file.txt",
        content: "new",
      },
    });
    expect(editorStore.activeBuffer?.isDirty).toBe(false);
    expect(editorStore.activeBuffer?.originalContent).toBe("new");
  });

  it("opens a remote file with the remote read command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      content: "export const remote = true;",
      size: 27,
      is_binary: false,
      is_read_only: false,
    });

    await editorStore.openFile("/remote/project/src/main.ts", "remote", { connectionId: "conn-123" });

    expect(invoke).toHaveBeenCalledWith("read_remote_file", {
      connection_id: "conn-123",
      path: "/remote/project/src/main.ts",
    });
    expect(editorStore.activeBuffer).toMatchObject({
      filePath: "/remote/project/src/main.ts",
      content: "export const remote = true;",
      originalContent: "export const remote = true;",
      isDirty: false,
      provider: "remote",
      connectionId: "conn-123",
    });
  });

  it("saves a remote file with the remote write command", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        content: "old remote",
        size: 10,
        is_binary: false,
      })
      .mockResolvedValueOnce(null);

    await editorStore.openFile("/remote/project/notes.txt", "remote", { connectionId: "conn-123" });
    editorStore.updateContent("new remote");

    await editorStore.saveFile();

    expect(invoke).toHaveBeenCalledWith("write_remote_file", {
      connection_id: "conn-123",
      path: "/remote/project/notes.txt",
      content: "new remote",
    });
    expect(editorStore.activeBuffer).toMatchObject({
      content: "new remote",
      originalContent: "new remote",
      isDirty: false,
    });
  });

  it("keeps the remote buffer dirty when save fails", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({
        content: "old remote",
        size: 10,
        is_binary: false,
      })
      .mockRejectedValueOnce(new Error("network dropped"));

    await editorStore.openFile("/remote/project/notes.txt", "remote", { connectionId: "conn-123" });
    editorStore.updateContent("new remote");

    await expect(editorStore.saveFile()).rejects.toThrow("network dropped");
    expect(editorStore.activeBuffer).toMatchObject({
      content: "new remote",
      originalContent: "old remote",
      isDirty: true,
      connectionId: "conn-123",
    });
  });

  it("keeps remote buffer visible and marks it read-only when connection is lost", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      content: "remote data",
      size: 11,
      is_binary: false,
      is_read_only: false,
    });

    await editorStore.openFile("/remote/project/notes.txt", "remote", { connectionId: "conn-123" });
    editorStore.updateContent("remote data changed");

    editorStore.handleConnectionDisconnected("conn-123");

    expect(editorStore.activeBuffer).toMatchObject({
      filePath: "/remote/project/notes.txt",
      provider: "remote",
      connectionId: "conn-123",
      content: "remote data changed",
      isReadOnly: true,
      isConnectionLost: true,
      isDirty: true,
    });
  });

  it("ignores disconnect events for other connection ids", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      content: "remote data",
      size: 11,
      is_binary: false,
      is_read_only: false,
    });

    await editorStore.openFile("/remote/project/notes.txt", "remote", { connectionId: "conn-123" });
    editorStore.handleConnectionDisconnected("conn-other");

    expect(editorStore.activeBuffer).toMatchObject({
      connectionId: "conn-123",
      isReadOnly: false,
      isConnectionLost: false,
    });
  });

  it("rejects remote open without an active SSH connection", async () => {
    await expect(editorStore.openFile("/remote/project/notes.txt", "remote")).rejects.toThrow(
      "Remote editor operations require an active SSH connection."
    );

    expect(invoke).not.toHaveBeenCalled();
    expect(editorStore.activeBuffer).toBeNull();
  });

  it("does not save read-only buffer", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      content: "locked",
      size: 6,
      is_binary: false,
      is_read_only: true,
    });

    await editorStore.openFile("/workspace/readonly.txt", "local");
    editorStore.updateContent("attempt change");
    await editorStore.saveFile();

    expect(vi.mocked(invoke)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith("write_file", expect.anything());
    expect(editorStore.activeBuffer?.isDirty).toBe(true);
  });

  it("rejects binary files", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      content: "",
      size: 8,
      is_binary: true,
    });

    await expect(editorStore.openFile("/workspace/binary.png", "local")).rejects.toThrow(
      "Binary file — cannot edit (8 bytes)."
    );
    expect(editorStore.activeBuffer).toBeNull();
  });

  it("rejects files over 5MB", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      content: "ok",
      size: 5 * 1024 * 1024 + 1,
      is_binary: false,
    });

    await expect(editorStore.openFile("/workspace/too-large.log", "local")).rejects.toThrow(
      "File too large (5.00 MB). Maximum: 5MB."
    );
    expect(editorStore.activeBuffer).toBeNull();
  });

  it("rejects unsupported file encodings", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      content: "",
      size: 20,
      is_binary: false,
      is_unsupported_encoding: true,
    });

    await expect(editorStore.openFile("/workspace/latin1.txt", "local")).rejects.toThrow(
      "Unsupported encoding. Only UTF-8 text files can be edited."
    );
    expect(editorStore.activeBuffer).toBeNull();
  });

  it("closeFile clears active buffer", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ content: "hello", size: 5, is_binary: false });

    await editorStore.openFile("/workspace/notes.txt", "local");
    editorStore.closeFile();

    expect(editorStore.activeBuffer).toBeNull();
  });

  it("keeps recent files unique and most-recent-first", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ content: "a", size: 1, is_binary: false })
      .mockResolvedValueOnce({ content: "b", size: 1, is_binary: false })
      .mockResolvedValueOnce({ content: "a2", size: 2, is_binary: false });

    await editorStore.openFile("/workspace/a.ts", "local");
    await editorStore.openFile("/workspace/b.ts", "local");
    await editorStore.openFile("/workspace/a.ts", "local");

    expect(editorStore.recentFiles).toEqual(["/workspace/a.ts", "/workspace/b.ts"]);
  });
});
