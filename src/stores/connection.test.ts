import { describe, expect, it, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { connectionStore } from "../stores/connection";
import type { SshProfile } from "../types/connection";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const sampleProfile: SshProfile = {
  id: "1",
  name: "Test",
  host: "localhost",
  port: 22,
  username: "root",
  authMethod: "password",
};

describe("connectionStore", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
    connectionStore.profiles.forEach((p) => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      void connectionStore.deleteProfile(p.id);
    });
  });

  it("loadProfiles calls list_connections and populates profiles", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([sampleProfile]);

    await connectionStore.loadProfiles();

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("list_connections");
    expect(connectionStore.profiles.length).toBe(1);
    expect(connectionStore.profiles[0].name).toBe("Test");
  });

  it("saveProfile calls save_connection and updates local state", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await connectionStore.saveProfile(sampleProfile);

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("save_connection", { profile: sampleProfile });
    expect(connectionStore.profiles.length).toBe(1);
  });

  it("deleteProfile calls delete_connection and removes from state", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await connectionStore.saveProfile(sampleProfile);

    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await connectionStore.deleteProfile("1");

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("delete_connection", { id: "1" });
    expect(connectionStore.profiles.length).toBe(0);
  });

  it("connect calls connect_ssh and sets status to connected on success", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await connectionStore.saveProfile(sampleProfile);

    vi.mocked(invoke).mockResolvedValueOnce({ connectionId: "connection-abc", profileId: "1" });
    await connectionStore.connect("1");

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("connect_ssh", {
      profile: sampleProfile,
      password: null,
      keyPassphrase: null,
    });
    const conn = connectionStore.activeConnections.find((c) => c.profile.id === "1");
    expect(conn?.status).toBe("connected");
    expect(conn?.connectionId).toBe("connection-abc");
  });

  it("connect sets status to error when connect_ssh fails", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await connectionStore.saveProfile(sampleProfile);

    vi.mocked(invoke).mockRejectedValueOnce(new Error("auth failed"));
    await connectionStore.connect("1");

    const conn = connectionStore.activeConnections.find((c) => c.profile.id === "1");
    expect(conn?.status).toBe("error");
    expect(conn?.error).toBe("auth failed");
  });

  it("disconnect calls disconnect_ssh and marks status disconnected", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await connectionStore.saveProfile(sampleProfile);

    vi.mocked(invoke).mockResolvedValueOnce({ connectionId: "connection-abc", profileId: "1" });
    await connectionStore.connect("1");

    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await connectionStore.disconnect("1");

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("disconnect_ssh", { connection_id: "connection-abc" });
    expect(connectionStore.activeConnections.find((c) => c.profile.id === "1")?.status).toBe("disconnected");
  });

  it("testConnection calls test_connection command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true);

    const result = await connectionStore.testConnection(sampleProfile);

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("test_connection", {
      profile: sampleProfile,
      password: null,
      keyPassphrase: null,
    });
    expect(result).toBe(true);
  });

  it("testConnection passes password when provided", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true);

    await connectionStore.testConnection(sampleProfile, "secret");

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("test_connection", {
      profile: sampleProfile,
      password: "secret",
      keyPassphrase: null,
    });
  });

  it("saveProfile preserves group field", async () => {
    const profileWithGroup: SshProfile = { ...sampleProfile, id: "2", group: "Production" };
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await connectionStore.saveProfile(profileWithGroup);

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("save_connection", {
      profile: expect.objectContaining({ group: "Production" }),
    });
    expect(connectionStore.profiles.find((p) => p.id === "2")?.group).toBe("Production");
  });

  it("disconnect sets error state when disconnect_ssh fails", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await connectionStore.saveProfile(sampleProfile);

    vi.mocked(invoke).mockResolvedValueOnce({ connectionId: "connection-abc", profileId: "1" });
    await connectionStore.connect("1");

    vi.mocked(invoke).mockRejectedValueOnce(new Error("network gone"));
    await connectionStore.disconnect("1");

    expect(connectionStore.error).toBe("network gone");
  });
});
