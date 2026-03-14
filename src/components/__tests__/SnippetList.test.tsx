import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, it, expect, beforeEach } from "vitest";
import SnippetList from "../SnippetList";
import { snippetStore } from "../../stores/snippet";

describe("SnippetList", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    snippetStore._resetForTesting();
  });

  it("renders empty state when no snippets", () => {
    render(() => <SnippetList />);
    const emptyState = document.querySelector(".forge-connection-empty");
    expect(emptyState?.textContent).toContain("No snippets yet");
  });

  it("renders snippets from store", () => {
    snippetStore.add({ id: "s1", name: "Deploy", command: "git pull" });
    snippetStore.add({ id: "s2", name: "Restart", command: "systemctl restart app" });

    render(() => <SnippetList />);
    expect(screen.getByTestId("snippet-s1")).toBeTruthy();
    expect(screen.getByTestId("snippet-s2")).toBeTruthy();
  });

  it("opens new snippet editor when + button clicked", () => {
    render(() => <SnippetList />);

    fireEvent.click(screen.getByTestId("btn-new-snippet"));
    expect(screen.getByTestId("snippet-editor")).toBeTruthy();
  });

  it("saves a new snippet from the editor", () => {
    render(() => <SnippetList />);

    fireEvent.click(screen.getByTestId("btn-new-snippet"));

    const nameInput = screen.getByTestId("input-snippet-name") as HTMLInputElement;
    const commandInput = screen.getByTestId("input-snippet-command") as HTMLTextAreaElement;

    fireEvent.input(nameInput, { target: { value: "My Snippet" } });
    fireEvent.input(commandInput, { target: { value: "echo hello" } });
    fireEvent.click(screen.getByTestId("btn-save-snippet"));

    expect(snippetStore.items).toHaveLength(1);
    expect(snippetStore.items[0].name).toBe("My Snippet");
    expect(screen.queryByTestId("snippet-editor")).toBeNull();
  });

  it("deletes a snippet when delete button clicked", () => {
    snippetStore.add({ id: "s1", name: "Delete Me", command: "rm -rf" });

    render(() => <SnippetList />);

    expect(screen.getByTestId("snippet-s1")).toBeTruthy();
    fireEvent.click(screen.getByTestId("btn-delete-snippet-s1"));
    expect(screen.queryByTestId("snippet-s1")).toBeNull();
    expect(snippetStore.items).toHaveLength(0);
  });

  it("filters by tag when tag button clicked", () => {
    snippetStore.add({ id: "s1", name: "A", command: "a", tags: ["deploy"] });
    snippetStore.add({ id: "s2", name: "B", command: "b", tags: ["debug"] });

    render(() => <SnippetList />);

    expect(screen.getByTestId("snippet-s1")).toBeTruthy();
    expect(screen.getByTestId("snippet-s2")).toBeTruthy();

    fireEvent.click(screen.getByTestId("tag-filter-deploy"));

    expect(screen.getByTestId("snippet-s1")).toBeTruthy();
    expect(screen.queryByTestId("snippet-s2")).toBeNull();
  });

  it("cancels snippet editor without saving", () => {
    render(() => <SnippetList />);

    fireEvent.click(screen.getByTestId("btn-new-snippet"));
    expect(screen.getByTestId("snippet-editor")).toBeTruthy();

    fireEvent.click(screen.getByTestId("btn-cancel-snippet"));
    expect(screen.queryByTestId("snippet-editor")).toBeNull();
    expect(snippetStore.items).toHaveLength(0);
  });

  it("shows variable badge for commands with {{variables}}", () => {
    snippetStore.add({ id: "s1", name: "SSH", command: "ssh {{user}}@{{host}}" });

    render(() => <SnippetList />);

    const badge = document.querySelector(".forge-snippet-item__var-badge");
    expect(badge).toBeTruthy();
  });

  it("opens editor with existing data for edit", () => {
    snippetStore.add({ id: "s1", name: "Existing", command: "echo test", tags: ["tag1"] });

    render(() => <SnippetList />);

    fireEvent.click(screen.getByTestId("btn-edit-snippet-s1"));
    expect(screen.getByTestId("snippet-editor")).toBeTruthy();

    const nameInput = screen.getByTestId("input-snippet-name") as HTMLInputElement;
    expect(nameInput.value).toBe("Existing");
  });
});
