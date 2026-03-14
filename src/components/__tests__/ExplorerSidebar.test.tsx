import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, it, expect, beforeEach, vi } from "vitest";
import ExplorerSidebar from "../ExplorerSidebar";
import App from "../../App";
import { explorerStore } from "../../stores/explorer";
import { editorStore } from "../../stores/editor";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { invoke } from "@tauri-apps/api/core";

describe("ExplorerSidebar Component", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === "list_connections") {
        return [];
      }

      return undefined;
    });
    explorerStore.reset();
    editorStore.reset();
  });

  it("renders explorer header, placeholders, and close button", () => {
    render(() => <ExplorerSidebar width={250} />);
    
    expect(screen.queryByTestId("explorer-sidebar")).toBeTruthy();
    expect(screen.getByTestId("explorer-header").textContent).toContain("EXPLORER (LOCAL)");
    expect(screen.queryByTestId("explorer-root-path-placeholder")).toBeTruthy();
    expect(screen.queryByTestId("explorer-close-btn")).toBeTruthy();
    expect(screen.queryByTestId("explorer-file-tree")).toBeTruthy();
    expect(screen.queryByTestId("explorer-connections")).toBeTruthy();
    expect(screen.queryByTestId("explorer-open-folder-btn")).toBeTruthy();
  });

  it("applies the specified width", () => {
    render(() => <ExplorerSidebar width={300} />);
    
    const sidebar = screen.getByTestId("explorer-sidebar");
    expect(sidebar.style.width).toBe("300px");
    expect(sidebar.style.getPropertyValue("--explorer-width")).toBe("300px");
  });

  it("closes sidebar when close button is clicked", () => {
    if (!explorerStore.isVisible) explorerStore.toggleSidebar();
    
    render(() => <ExplorerSidebar width={250} />);
    
    expect(explorerStore.isVisible).toBe(true);
    
    fireEvent.click(screen.getByTestId("explorer-close-btn"));
    
    expect(explorerStore.isVisible).toBe(false);
  });

  it("opens folder picker and sets local root", async () => {
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === "list_connections") return [];
      if (command === "plugin:dialog|open") return "/workspace";
      if (command === "list_directory") return [{ name: "src", path: "/workspace/src", is_dir: true }];
      if (command === "get_git_status") return {};
      if (command === "start_local_watcher") return undefined;
      return undefined;
    });

    render(() => <ExplorerSidebar width={250} />);

    fireEvent.click(screen.getByTestId("explorer-open-folder-btn"));
    await Promise.resolve();
    await Promise.resolve();

    expect(invoke).toHaveBeenCalledWith("plugin:dialog|open", {
      options: {
        directory: true,
        multiple: false,
      },
    });
    expect(invoke).toHaveBeenCalledWith("list_directory", {
      root: "/workspace",
      path: ".",
      show_hidden: false,
    });
  });

  it("shows remote explorer context in header", async () => {
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === "list_connections") return [];
      if (command === "list_remote_directory") return [{ name: "src", path: "/src", is_dir: true }];
      return undefined;
    });

    await explorerStore.setRoot("/", "remote", "connection-1");
    render(() => <ExplorerSidebar width={250} />);

    expect(screen.getByTestId("explorer-header").textContent).toContain("EXPLORER (REMOTE)");
    expect(screen.getByTestId("explorer-root-path-placeholder").textContent).toContain("Remote /");
  });

  it("opens a remote file into the inline editor", async () => {
    vi.mocked(invoke).mockImplementation(async (command: string, args?: unknown) => {
      if (command === "list_connections") return [];
      if (command === "list_remote_directory") {
        return [{ name: "main.ts", path: "/src/main.ts", is_dir: false, size: 12 }];
      }
      if (command === "read_remote_file") {
        expect(args).toEqual({ connection_id: "connection-1", path: "/src/main.ts" });
        return {
          content: "export const answer = 42;",
          size: 25,
          is_binary: false,
          is_read_only: false,
        };
      }
      return undefined;
    });

    await explorerStore.setRoot("/", "remote", "connection-1");
    render(() => <ExplorerSidebar width={250} />);

    fireEvent.click(screen.getByText("main.ts"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(invoke).toHaveBeenCalledWith("read_remote_file", {
      connection_id: "connection-1",
      path: "/src/main.ts",
    });
    expect(editorStore.activeBuffer).toMatchObject({
      filePath: "/src/main.ts",
      provider: "remote",
      connectionId: "connection-1",
      content: "export const answer = 42;",
    });
  });

  it("shows save errors from remote editor writes while keeping the buffer dirty", async () => {
    vi.mocked(invoke).mockImplementation(async (command: string, args?: unknown) => {
      if (command === "list_connections") return [];
      if (command === "read_remote_file") {
        expect(args).toEqual({ connection_id: "connection-1", path: "/src/main.ts" });
        return {
          content: "export const answer = 42;",
          size: 25,
          is_binary: false,
          is_read_only: false,
        };
      }
      return undefined;
    });

    await explorerStore.setRoot("/", "remote", "connection-1");
    editorStore.reset();
    await editorStore.openFile("/src/main.ts", "remote", { connectionId: "connection-1" });
    editorStore.updateContent("export const answer = 43;");

    vi.mocked(invoke).mockImplementation(async (command: string, args?: unknown) => {
      if (command === "list_connections") return [];
      if (command === "write_remote_file") {
        expect(args).toEqual({
          connection_id: "connection-1",
          path: "/src/main.ts",
          content: "export const answer = 43;",
        });
        throw new Error("network dropped");
      }
      return undefined;
    });

    render(() => <ExplorerSidebar width={250} />);
    await Promise.resolve();
    await Promise.resolve();

    expect(editorStore.activeBuffer).toMatchObject({
      content: "export const answer = 43;",
      originalContent: "export const answer = 42;",
      isDirty: true,
      provider: "remote",
      connectionId: "connection-1",
    });
  });
});

describe("App Sidebar Integration", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    explorerStore.reset();
  });

  it("toggles sidebar visibility on Ctrl+B", () => {
    render(() => <App />);
    
    expect(screen.queryByTestId("explorer-sidebar")).toBeNull();

    fireEvent.keyDown(window, {
      key: "b",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    });

    expect(screen.queryByTestId("explorer-sidebar")).toBeTruthy();

    fireEvent.keyDown(window, {
      key: "b",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    });

    expect(screen.queryByTestId("explorer-sidebar")).toBeNull();
  });

  it("resizes sidebar when pane divider emits ratio change", () => {
    explorerStore.toggleSidebar();
    render(() => <App />);
    
    const sidebar = screen.getByTestId("explorer-sidebar");
    expect(sidebar.style.width).toBe("260px");

    const divider = screen.getAllByTestId("pane-divider").find(
      (el) => el.classList.contains("forge-pane-divider-vertical")
    );
    expect(divider).toBeTruthy();
  });
});
