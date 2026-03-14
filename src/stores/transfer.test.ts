import { describe, it, expect, beforeEach, vi } from "vitest";
import { transferStore } from "./transfer";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("transferStore", () => {
  beforeEach(() => {
    transferStore._resetForTesting();
    vi.mocked(invoke).mockReset();
  });

  it("starts empty", () => {
    expect(transferStore.items).toHaveLength(0);
    expect(transferStore.activeCount).toBe(0);
  });

  it("enqueues a transfer item", () => {
    transferStore.enqueue({
      connectionId: "c1",
      localPath: "/tmp/file.txt",
      remotePath: "/home/user/file.txt",
      direction: "upload",
      fileName: "file.txt",
      bytesTotal: 1024,
    });

    expect(transferStore.items).toHaveLength(1);
    expect(transferStore.items[0].fileName).toBe("file.txt");
  });

  it("removes an item", () => {
    const id = transferStore.enqueue({
      connectionId: "c1",
      localPath: "/tmp/a.txt",
      remotePath: "/a.txt",
      direction: "download",
      fileName: "a.txt",
      bytesTotal: 500,
    });

    transferStore.removeItem(id);
    expect(transferStore.items).toHaveLength(0);
  });

  it("clears completed items", () => {
    transferStore.enqueue({
      connectionId: "c1",
      localPath: "/tmp/a.txt",
      remotePath: "/a.txt",
      direction: "download",
      fileName: "a.txt",
      bytesTotal: 100,
    });

    expect(transferStore.items.length).toBeGreaterThanOrEqual(1);
    transferStore.clearCompleted();
    const remaining = transferStore.items.filter(
      (t) => t.status === "completed" || t.status === "error",
    );
    expect(remaining).toHaveLength(0);
  });
});
