import { describe, it, expect, beforeEach } from "vitest";
import { recentConnectionsStore } from "./recentConnections";
import type { SshProfile } from "../types/connection";

function makeProfile(overrides: Partial<SshProfile> = {}): SshProfile {
  return {
    id: "test-1",
    name: "Test Server",
    host: "example.com",
    port: 22,
    username: "root",
    authMethod: "password",
    ...overrides,
  };
}

describe("recentConnectionsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    recentConnectionsStore._resetForTesting();
  });

  it("starts empty when localStorage is empty", () => {
    expect(recentConnectionsStore.items).toEqual([]);
  });

  it("records a connection and persists to localStorage", () => {
    const profile = makeProfile();
    recentConnectionsStore.recordConnection(profile);

    expect(recentConnectionsStore.items).toHaveLength(1);
    expect(recentConnectionsStore.items[0].profileId).toBe("test-1");
    expect(recentConnectionsStore.items[0].host).toBe("example.com");

    const stored = JSON.parse(localStorage.getItem("forge-recent-connections") ?? "[]");
    expect(stored).toHaveLength(1);
  });

  it("moves existing entry to front on re-record", () => {
    recentConnectionsStore.recordConnection(makeProfile({ id: "a", name: "A" }));
    recentConnectionsStore.recordConnection(makeProfile({ id: "b", name: "B" }));
    recentConnectionsStore.recordConnection(makeProfile({ id: "a", name: "A Updated" }));

    expect(recentConnectionsStore.items).toHaveLength(2);
    expect(recentConnectionsStore.items[0].profileId).toBe("a");
    expect(recentConnectionsStore.items[0].profileName).toBe("A Updated");
    expect(recentConnectionsStore.items[1].profileId).toBe("b");
  });

  it("limits to 10 entries", () => {
    for (let i = 0; i < 12; i++) {
      recentConnectionsStore.recordConnection(makeProfile({ id: `id-${i}`, name: `Server ${i}` }));
    }

    expect(recentConnectionsStore.items).toHaveLength(10);
    expect(recentConnectionsStore.items[0].profileId).toBe("id-11");
  });

  it("removes an entry by profileId", () => {
    recentConnectionsStore.recordConnection(makeProfile({ id: "a" }));
    recentConnectionsStore.recordConnection(makeProfile({ id: "b" }));
    recentConnectionsStore.removeEntry("a");

    expect(recentConnectionsStore.items).toHaveLength(1);
    expect(recentConnectionsStore.items[0].profileId).toBe("b");
  });

  it("clears all entries", () => {
    recentConnectionsStore.recordConnection(makeProfile({ id: "a" }));
    recentConnectionsStore.recordConnection(makeProfile({ id: "b" }));
    recentConnectionsStore.clearAll();

    expect(recentConnectionsStore.items).toEqual([]);
    expect(localStorage.getItem("forge-recent-connections")).toBe("[]");
  });

  it("loads from localStorage on reset", () => {
    const data = [
      { profileId: "x", profileName: "X", host: "x.com", port: 22, username: "u", lastConnected: 1000 },
    ];
    localStorage.setItem("forge-recent-connections", JSON.stringify(data));
    recentConnectionsStore._resetForTesting();

    expect(recentConnectionsStore.items).toHaveLength(1);
    expect(recentConnectionsStore.items[0].profileId).toBe("x");
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("forge-recent-connections", "not-json");
    recentConnectionsStore._resetForTesting();

    expect(recentConnectionsStore.items).toEqual([]);
  });
});
