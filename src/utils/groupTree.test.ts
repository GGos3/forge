import { describe, it, expect } from "vitest";
import { buildGroupTree } from "./groupTree";
import type { SshProfile } from "../types/connection";

function profile(overrides: Partial<SshProfile> = {}): SshProfile {
  return {
    id: overrides.id ?? "id-1",
    name: overrides.name ?? "Test",
    host: "host",
    port: 22,
    username: "root",
    authMethod: "password",
    ...overrides,
  };
}

describe("buildGroupTree", () => {
  it("puts ungrouped profiles at root", () => {
    const tree = buildGroupTree([profile({ id: "a" }), profile({ id: "b" })]);
    expect(tree.profiles).toHaveLength(2);
    expect(tree.children).toHaveLength(0);
  });

  it("creates single-level groups", () => {
    const tree = buildGroupTree([
      profile({ id: "a", group: "Production" }),
      profile({ id: "b", group: "Staging" }),
    ]);
    expect(tree.profiles).toHaveLength(0);
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].name).toBe("Production");
    expect(tree.children[0].profiles).toHaveLength(1);
    expect(tree.children[1].name).toBe("Staging");
  });

  it("creates nested groups from slash-separated paths", () => {
    const tree = buildGroupTree([
      profile({ id: "a", group: "Production/US-East" }),
      profile({ id: "b", group: "Production/US-West" }),
      profile({ id: "c", group: "Production" }),
    ]);
    expect(tree.children).toHaveLength(1);
    const prod = tree.children[0];
    expect(prod.name).toBe("Production");
    expect(prod.profiles).toHaveLength(1);
    expect(prod.children).toHaveLength(2);
    expect(prod.children[0].name).toBe("US-East");
    expect(prod.children[0].fullPath).toBe("Production/US-East");
    expect(prod.children[1].name).toBe("US-West");
  });

  it("handles deeply nested paths", () => {
    const tree = buildGroupTree([profile({ id: "a", group: "A/B/C/D" })]);
    expect(tree.children[0].name).toBe("A");
    expect(tree.children[0].children[0].name).toBe("B");
    expect(tree.children[0].children[0].children[0].name).toBe("C");
    expect(tree.children[0].children[0].children[0].children[0].name).toBe("D");
    expect(tree.children[0].children[0].children[0].children[0].profiles).toHaveLength(1);
  });

  it("handles empty group as ungrouped", () => {
    const tree = buildGroupTree([profile({ id: "a", group: "" })]);
    expect(tree.profiles).toHaveLength(1);
    expect(tree.children).toHaveLength(0);
  });

  it("sorts groups and profiles alphabetically", () => {
    const tree = buildGroupTree([
      profile({ id: "c", name: "Zulu", group: "Zebra" }),
      profile({ id: "b", name: "Alpha", group: "Alpha" }),
      profile({ id: "a", name: "Beta" }),
    ]);
    expect(tree.children[0].name).toBe("Alpha");
    expect(tree.children[1].name).toBe("Zebra");
  });
});
