import { describe, it, expect, beforeEach } from "vitest";
import { portForwardStore } from "./portForward";

describe("portForwardStore", () => {
  beforeEach(() => {
    portForwardStore._resetForTesting();
  });

  it("starts empty", () => {
    expect(portForwardStore.rules).toHaveLength(0);
  });

  it("adds a rule", () => {
    portForwardStore.add({
      id: "r1",
      profileId: "p1",
      direction: "local",
      localPort: 8080,
      remoteHost: "localhost",
      remotePort: 3000,
      enabled: true,
    });
    expect(portForwardStore.rules).toHaveLength(1);
    expect(portForwardStore.rules[0].localPort).toBe(8080);
  });

  it("removes a rule", () => {
    portForwardStore.add({
      id: "r1",
      profileId: "p1",
      direction: "local",
      localPort: 8080,
      remoteHost: "localhost",
      remotePort: 3000,
      enabled: true,
    });
    portForwardStore.remove("r1");
    expect(portForwardStore.rules).toHaveLength(0);
  });

  it("toggles enabled state", () => {
    portForwardStore.add({
      id: "r1",
      profileId: "p1",
      direction: "local",
      localPort: 8080,
      remoteHost: "localhost",
      remotePort: 3000,
      enabled: true,
    });

    portForwardStore.toggle("r1");
    expect(portForwardStore.rules[0].enabled).toBe(false);

    portForwardStore.toggle("r1");
    expect(portForwardStore.rules[0].enabled).toBe(true);
  });

  it("filters by profile", () => {
    portForwardStore.add({ id: "r1", profileId: "p1", direction: "local", localPort: 8080, remoteHost: "localhost", remotePort: 3000, enabled: true });
    portForwardStore.add({ id: "r2", profileId: "p2", direction: "remote", localPort: 5432, remoteHost: "db", remotePort: 5432, enabled: true });

    expect(portForwardStore.getByProfile("p1")).toHaveLength(1);
    expect(portForwardStore.getByProfile("p2")).toHaveLength(1);
    expect(portForwardStore.getByProfile("p3")).toHaveLength(0);
  });

  it("updates a rule", () => {
    portForwardStore.add({ id: "r1", profileId: "p1", direction: "local", localPort: 8080, remoteHost: "localhost", remotePort: 3000, enabled: true });
    portForwardStore.update("r1", { localPort: 9090, label: "Web" });
    expect(portForwardStore.rules[0].localPort).toBe(9090);
    expect(portForwardStore.rules[0].label).toBe("Web");
  });

  it("persists to localStorage", () => {
    portForwardStore.add({ id: "r1", profileId: "p1", direction: "local", localPort: 8080, remoteHost: "localhost", remotePort: 3000, enabled: true });
    const stored = localStorage.getItem("forge-port-forwards");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!) as Array<{ id: string }>;
    expect(parsed[0].id).toBe("r1");
  });
});
