import { describe, it, expect, beforeEach } from "vitest";
import { snippetStore, substituteVariables } from "./snippet";

describe("snippetStore", () => {
  beforeEach(() => {
    snippetStore._resetForTesting();
  });

  it("starts empty", () => {
    expect(snippetStore.items).toHaveLength(0);
  });

  it("adds a snippet", () => {
    snippetStore.add({ id: "s1", name: "Deploy", command: "git pull && restart" });
    expect(snippetStore.items).toHaveLength(1);
    expect(snippetStore.items[0].name).toBe("Deploy");
  });

  it("updates a snippet", () => {
    snippetStore.add({ id: "s1", name: "Deploy", command: "git pull" });
    snippetStore.update("s1", { command: "git pull --rebase" });
    expect(snippetStore.items[0].command).toBe("git pull --rebase");
  });

  it("removes a snippet", () => {
    snippetStore.add({ id: "s1", name: "A", command: "a" });
    snippetStore.add({ id: "s2", name: "B", command: "b" });
    snippetStore.remove("s1");
    expect(snippetStore.items).toHaveLength(1);
    expect(snippetStore.items[0].id).toBe("s2");
  });

  it("retrieves by id", () => {
    snippetStore.add({ id: "s1", name: "X", command: "x" });
    expect(snippetStore.getById("s1")?.name).toBe("X");
    expect(snippetStore.getById("nonexistent")).toBeUndefined();
  });

  it("filters by tag", () => {
    snippetStore.add({ id: "s1", name: "A", command: "a", tags: ["deploy", "prod"] });
    snippetStore.add({ id: "s2", name: "B", command: "b", tags: ["debug"] });
    snippetStore.add({ id: "s3", name: "C", command: "c" });

    expect(snippetStore.filterByTag("deploy")).toHaveLength(1);
    expect(snippetStore.filterByTag("debug")).toHaveLength(1);
    expect(snippetStore.filterByTag("nonexistent")).toHaveLength(0);
  });

  it("collects all unique tags sorted", () => {
    snippetStore.add({ id: "s1", name: "A", command: "a", tags: ["deploy", "prod"] });
    snippetStore.add({ id: "s2", name: "B", command: "b", tags: ["debug", "prod"] });

    const tags = snippetStore.getAllTags();
    expect(tags).toEqual(["debug", "deploy", "prod"]);
  });

  it("persists to localStorage", () => {
    snippetStore.add({ id: "s1", name: "Saved", command: "echo persisted" });

    const stored = localStorage.getItem("forge-snippets");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!) as Array<{ id: string }>;
    expect(parsed[0].id).toBe("s1");
  });
});

describe("substituteVariables", () => {
  it("replaces known variables", () => {
    expect(substituteVariables("ssh {{user}}@{{host}}", { user: "root", host: "prod.example.com" }))
      .toBe("ssh root@prod.example.com");
  });

  it("leaves unknown variables unchanged", () => {
    expect(substituteVariables("echo {{unknown}}", {}))
      .toBe("echo {{unknown}}");
  });

  it("handles multiple occurrences of the same variable", () => {
    expect(substituteVariables("{{x}} and {{x}}", { x: "val" }))
      .toBe("val and val");
  });

  it("handles templates with no variables", () => {
    expect(substituteVariables("plain command", { user: "root" }))
      .toBe("plain command");
  });
});
