import { render, fireEvent, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import ConnectionList from "./ConnectionList";
import { connectionStore } from "../stores/connection";
import { explorerStore } from "../stores/explorer";
import type { SshProfile } from "../types/connection";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const sampleProfile: SshProfile = {
  id: "1",
  name: "Server 1",
  host: "10.0.0.1",
  port: 22,
  username: "root",
  authMethod: "password",
};

describe("ConnectionList", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
    explorerStore.reset();
    connectionStore.profiles.forEach(p => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      void connectionStore.deleteProfile(p.id);
    });
  });

  it("renders empty state when no profiles", () => {
    const { getByText } = render(() => <ConnectionList />);
    expect(getByText(/No connections configured/)).toBeTruthy();
  });

  it("renders a list of connections from the store", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await connectionStore.saveProfile(sampleProfile);

    const { getByText } = render(() => <ConnectionList />);
    expect(getByText("Server 1")).toBeTruthy();
    expect(getByText("root@10.0.0.1:22")).toBeTruthy();
  });

  it("opens manager dialog when clicking new connection button", () => {
    const { getByTestId, getByText } = render(() => <ConnectionList />);
    fireEvent.click(getByTestId("btn-new-connection"));
    expect(getByText("New Connection")).toBeTruthy();
  });

  it("shows edit dialog when clicking edit button", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await connectionStore.saveProfile(sampleProfile);

    const { getByTestId, getByText } = render(() => <ConnectionList />);
    fireEvent.click(getByTestId(`btn-edit-${sampleProfile.id}`));
    expect(getByText("Edit Connection")).toBeTruthy();
  });

  it("calls delete_connection when deleting a profile", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await connectionStore.saveProfile(sampleProfile);

    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    const { getByTestId } = render(() => <ConnectionList />);
    fireEvent.click(getByTestId(`btn-delete-${sampleProfile.id}`));

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("delete_connection", { id: "1" });
    });
  });

  it("connecting a profile sets remote explorer root", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await connectionStore.saveProfile(sampleProfile);

    vi.mocked(invoke)
      .mockResolvedValueOnce([sampleProfile])
      .mockResolvedValueOnce({ connectionId: "connection-xyz", profileId: "1" })
      .mockResolvedValueOnce([{ name: "src", path: "/src", is_dir: true }]);

    const { getByTestId } = render(() => <ConnectionList />);
    fireEvent.click(getByTestId(`connection-item-${sampleProfile.id}`));

    await waitFor(() => {
      expect(explorerStore.root?.provider).toBe("remote");
    });
    expect(explorerStore.root?.connectionId).toBe("connection-xyz");
    expect(explorerStore.root?.rootPath).toBe("/");
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("list_remote_directory", {
      connection_id: "connection-xyz",
      path: "/",
      show_hidden: false,
    });
  });

  it("renders group header for profiles with a group", async () => {
    const profileWithGroup: SshProfile = { ...sampleProfile, id: "2", group: "Production" };
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await connectionStore.saveProfile(profileWithGroup);

    const { getByTestId } = render(() => <ConnectionList />);
    expect(getByTestId("group-header-Production")).toBeTruthy();
  });

  it("does not render group header for profiles without a group", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await connectionStore.saveProfile(sampleProfile);

    const { queryByTestId } = render(() => <ConnectionList />);
    expect(queryByTestId(/group-header/)).toBeNull();
  });

  it("shows Browse Files button only for connected profiles", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await connectionStore.saveProfile(sampleProfile);

    vi.mocked(invoke)
      .mockResolvedValueOnce([sampleProfile])
      .mockResolvedValueOnce({ connectionId: "connection-xyz", profileId: "1" })
      .mockResolvedValueOnce([]);

    const { getByTestId, queryByTestId } = render(() => <ConnectionList />);

    expect(queryByTestId(`btn-browse-${sampleProfile.id}`)).toBeNull();

    fireEvent.click(getByTestId(`connection-item-${sampleProfile.id}`));

    await waitFor(() => {
      expect(getByTestId(`btn-browse-${sampleProfile.id}`)).toBeTruthy();
    });
  });
});
