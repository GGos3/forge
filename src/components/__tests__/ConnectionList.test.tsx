import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, it, expect, beforeEach, vi } from "vitest";
import ConnectionList from "../ConnectionList";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { invoke } from "@tauri-apps/api/core";
import { recentConnectionsStore } from "../../stores/recentConnections";

describe("ConnectionList", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    recentConnectionsStore._resetForTesting();

    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === "list_connections") return [];
      return undefined;
    });
  });

  it("renders quick connect input and button", () => {
    render(() => <ConnectionList />);

    expect(screen.getByTestId("quick-connect")).toBeTruthy();
    expect(screen.getByTestId("quick-connect-input")).toBeTruthy();
    expect(screen.getByTestId("quick-connect-btn")).toBeTruthy();
  });

  it("shows error for invalid quick connect input", async () => {
    render(() => <ConnectionList />);

    const input = screen.getByTestId("quick-connect-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "@" } });
    fireEvent.click(screen.getByTestId("quick-connect-btn"));

    await Promise.resolve();

    expect(screen.getByTestId("quick-connect-error")).toBeTruthy();
    expect(screen.getByTestId("quick-connect-error").textContent).toContain("Invalid format");
  });

  it("clears error when input changes", async () => {
    render(() => <ConnectionList />);

    const input = screen.getByTestId("quick-connect-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "@" } });
    fireEvent.click(screen.getByTestId("quick-connect-btn"));
    await Promise.resolve();

    expect(screen.queryByTestId("quick-connect-error")).toBeTruthy();

    fireEvent.input(input, { target: { value: "user@host" } });
    expect(screen.queryByTestId("quick-connect-error")).toBeNull();
  });

  it("shows empty state when no connections or recent items exist", () => {
    render(() => <ConnectionList />);

    const emptyState = document.querySelector(".forge-connection-empty");
    expect(emptyState).toBeTruthy();
    expect(emptyState?.textContent).toContain("No connections configured");
  });

  it("shows recent connections section when items exist", () => {
    recentConnectionsStore.recordConnection({
      id: "recent-1",
      name: "Recent Server",
      host: "recent.example.com",
      port: 22,
      username: "admin",
      authMethod: "password",
    });

    render(() => <ConnectionList />);

    expect(screen.getByTestId("recent-connections-section")).toBeTruthy();
    expect(screen.getByTestId("recent-item-recent-1")).toBeTruthy();
  });

  it("clears recent connections when clear button is clicked", () => {
    recentConnectionsStore.recordConnection({
      id: "recent-1",
      name: "Server",
      host: "host",
      port: 22,
      username: "root",
      authMethod: "password",
    });

    render(() => <ConnectionList />);

    expect(screen.getByTestId("recent-connections-section")).toBeTruthy();

    fireEvent.click(screen.getByTestId("btn-clear-recent"));

    expect(screen.queryByTestId("recent-connections-section")).toBeNull();
  });

  it("opens new connection manager when + button is clicked", () => {
    render(() => <ConnectionList />);

    fireEvent.click(screen.getByTestId("btn-new-connection"));
    const dialog = document.querySelector(".forge-connection-dialog");
    expect(dialog).toBeTruthy();
  });

  it("disables quick connect button when input is empty", () => {
    render(() => <ConnectionList />);

    const btn = screen.getByTestId("quick-connect-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  describe("nested groups", () => {
    const groupedProfiles = [
      { id: "p1", name: "US Web 1", host: "us1.example.com", port: 22, username: "admin", authMethod: "password", group: "Production/US-East" },
      { id: "p2", name: "US Web 2", host: "us2.example.com", port: 22, username: "admin", authMethod: "password", group: "Production/US-East" },
      { id: "p3", name: "EU DB", host: "eu.example.com", port: 22, username: "root", authMethod: "key", group: "Production/EU-West" },
      { id: "p4", name: "Staging", host: "staging.example.com", port: 22, username: "deploy", authMethod: "password", group: "Staging" },
      { id: "p5", name: "Ungrouped", host: "misc.example.com", port: 22, username: "user", authMethod: "password" },
    ];

    beforeEach(() => {
      vi.mocked(invoke).mockImplementation(async (command: string) => {
        if (command === "list_connections") return groupedProfiles;
        return undefined;
      });
    });

    it("renders nested group headers with collapsible tree", async () => {
      render(() => <ConnectionList />);
      await vi.waitFor(() => {
        expect(screen.getByTestId("group-Production")).toBeTruthy();
      });
      expect(screen.getByTestId("group-Production/US-East")).toBeTruthy();
      expect(screen.getByTestId("group-Production/EU-West")).toBeTruthy();
      expect(screen.getByTestId("group-Staging")).toBeTruthy();
    });

    it("shows ungrouped profiles at root level", async () => {
      render(() => <ConnectionList />);
      await vi.waitFor(() => {
        expect(screen.getByTestId("connection-item-p5")).toBeTruthy();
      });
    });

    it("displays profile count badge on group headers", async () => {
      render(() => <ConnectionList />);
      await vi.waitFor(() => {
        expect(screen.getByTestId("group-Production")).toBeTruthy();
      });

      const productionHeader = screen.getByTestId("group-toggle-Production");
      const countBadge = productionHeader.querySelector(".forge-connection-group__count");
      expect(countBadge?.textContent).toBe("3");
    });

    it("collapses and expands groups on click", async () => {
      render(() => <ConnectionList />);
      await vi.waitFor(() => {
        expect(screen.getByTestId("group-toggle-Production")).toBeTruthy();
      });

      expect(screen.getByTestId("group-Production/US-East")).toBeTruthy();

      fireEvent.click(screen.getByTestId("group-toggle-Production"));
      expect(screen.queryByTestId("group-Production/US-East")).toBeNull();

      fireEvent.click(screen.getByTestId("group-toggle-Production"));
      expect(screen.getByTestId("group-Production/US-East")).toBeTruthy();
    });

    it("persists collapsed state to localStorage", async () => {
      render(() => <ConnectionList />);
      await vi.waitFor(() => {
        expect(screen.getByTestId("group-toggle-Staging")).toBeTruthy();
      });

      fireEvent.click(screen.getByTestId("group-toggle-Staging"));
      const stored = localStorage.getItem("forge-collapsed-groups");
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!) as string[];
      expect(parsed).toContain("Staging");
    });

    it("shows profiles inside nested groups", async () => {
      render(() => <ConnectionList />);
      await vi.waitFor(() => {
        expect(screen.getByTestId("connection-item-p1")).toBeTruthy();
      });
      expect(screen.getByTestId("connection-item-p2")).toBeTruthy();
      expect(screen.getByTestId("connection-item-p3")).toBeTruthy();
      expect(screen.getByTestId("connection-item-p4")).toBeTruthy();
    });
  });
});
