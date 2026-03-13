import { describe, it, expect, beforeEach, vi } from "vitest";
import { shellStore } from "./shell";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

describe("shell store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shellStore.reset();
  });

  it("has empty initial state", () => {
    expect(shellStore.availableShells).toEqual([]);
    expect(shellStore.defaultShell).toBeNull();
    expect(shellStore.loading).toBe(false);
    expect(shellStore.error).toBeNull();
  });

  it("loads shells successfully", async () => {
    const mockShells = [
      { name: "bash", path: "/bin/bash", shell_type: "bash" },
      { name: "zsh", path: "/bin/zsh", shell_type: "zsh" },
    ];
    const mockDefaultShell = "bash";

    vi.mocked(invoke).mockResolvedValueOnce(mockShells).mockResolvedValueOnce(mockDefaultShell);

    await shellStore.loadShells();

    expect(invoke).toHaveBeenCalledWith("list_available_shells");
    expect(invoke).toHaveBeenCalledWith("get_default_shell");
    expect(shellStore.availableShells).toEqual(mockShells);
    expect(shellStore.defaultShell).toBe(mockDefaultShell);
    expect(shellStore.loading).toBe(false);
    expect(shellStore.error).toBeNull();
  });

  it("handles load error", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("Shell detection failed"));

    await shellStore.loadShells();

    expect(shellStore.availableShells).toEqual([]);
    expect(shellStore.defaultShell).toBeNull();
    expect(shellStore.loading).toBe(false);
    expect(shellStore.error).toBe("Shell detection failed");
  });

  it("sets loading state during load", async () => {
    let resolveInvoke: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolveInvoke = resolve;
    });
    
    vi.mocked(invoke).mockReturnValue(promise);

    const loadPromise = shellStore.loadShells();
    expect(shellStore.loading).toBe(true);
    
    resolveInvoke!({ name: "bash", path: "/bin/bash", shell_type: "bash" });
    await loadPromise;
    expect(shellStore.loading).toBe(false);
  });
});
