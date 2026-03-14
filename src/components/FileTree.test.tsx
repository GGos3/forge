import { render, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import FileTree, { collectVisiblePaths } from "./FileTree";
import type { FileNode } from "../types/file-node";

describe("FileTree", () => {
  const mockNodes: FileNode[] = [
    {
      name: "src",
      path: "/src",
      type: "directory",
      size: 0,
      modified: 0,
      permissions: 0,
      children: [
        {
          name: "index.ts",
          path: "/src/index.ts",
          type: "file",
          size: 100,
          modified: 0,
          permissions: 0,
        },
      ],
    },
    {
      name: "package.json",
      path: "/package.json",
      type: "file",
      size: 200,
      modified: 0,
      permissions: 0,
    },
  ];

  it("renders loading state", () => {
    const { getByText } = render(() => (
      <FileTree
        nodes={[]}
        selectedPath={null}
        expandedPaths={new Set()}
        gitStatuses={{}}
        isLoading={true}
        error={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onOpen={vi.fn()}
      />
    ));
    expect(getByText("Loading...")).toBeTruthy();
  });

  it("renders error state", () => {
    const { getByText } = render(() => (
      <FileTree
        nodes={[]}
        selectedPath={null}
        expandedPaths={new Set()}
        gitStatuses={{}}
        isLoading={false}
        error={"Failed to load"}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onOpen={vi.fn()}
      />
    ));
    expect(getByText("Failed to load")).toBeTruthy();
  });

  it("renders empty state", () => {
    const { getByText } = render(() => (
      <FileTree
        nodes={[]}
        selectedPath={null}
        expandedPaths={new Set()}
        gitStatuses={{}}
        isLoading={false}
        error={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onOpen={vi.fn()}
      />
    ));
    expect(getByText("(empty)")).toBeTruthy();
  });

  it("renders symlink indicator and permission denied marker", () => {
    const edgeNodes: FileNode[] = [
      {
        name: "docs-link",
        path: "/docs-link",
        type: "symlink",
        size: 0,
        modified: 0,
        permissions: 0,
      },
      {
        name: "forbidden-dir",
        path: "/forbidden-dir",
        type: "directory",
        size: 0,
        modified: 0,
        permissions: 0,
        permissionDenied: true,
      },
    ];

    const { getByText, getAllByLabelText } = render(() => (
      <FileTree
        nodes={edgeNodes}
        selectedPath={null}
        expandedPaths={new Set()}
        gitStatuses={{}}
        isLoading={false}
        error={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onOpen={vi.fn()}
      />
    ));

    expect(getByText("docs-link")).toBeTruthy();
    expect(getByText("↗")).toBeTruthy();
    expect(getAllByLabelText("Permission denied").length).toBeGreaterThan(0);
  });

  it("directory click selects and toggles expand", () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    const onOpen = vi.fn();

    const { getByText } = render(() => (
      <FileTree
        nodes={mockNodes}
        selectedPath={null}
        expandedPaths={new Set()}
        gitStatuses={{}}
        isLoading={false}
        error={null}
        onSelect={onSelect}
        onToggle={onToggle}
        onOpen={onOpen}
      />
    ));

    fireEvent.click(getByText("src"));
    expect(onSelect).toHaveBeenCalledWith("/src");
    expect(onToggle).toHaveBeenCalledWith("/src");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("file click selects and opens", () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    const onOpen = vi.fn();

    const { getByText } = render(() => (
      <FileTree
        nodes={mockNodes}
        selectedPath={null}
        expandedPaths={new Set()}
        gitStatuses={{}}
        isLoading={false}
        error={null}
        onSelect={onSelect}
        onToggle={onToggle}
        onOpen={onOpen}
      />
    ));

    fireEvent.click(getByText("package.json"));
    expect(onSelect).toHaveBeenCalledWith("/package.json");
    expect(onOpen).toHaveBeenCalledWith("/package.json");
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("renders children when expanded", () => {
    const { getByText } = render(() => (
      <FileTree
        nodes={mockNodes}
        selectedPath={null}
        expandedPaths={new Set(["/src"])}
        gitStatuses={{}}
        isLoading={false}
        error={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onOpen={vi.fn()}
      />
    ));

    expect(getByText("index.ts")).toBeTruthy();
  });

  it("keyboard ArrowDown moves selection to next visible node", () => {
    const onSelect = vi.fn();
    const { container } = render(() => (
      <FileTree
        nodes={mockNodes}
        selectedPath={"/src"}
        expandedPaths={new Set(["/src"])}
        gitStatuses={{}}
        isLoading={false}
        error={null}
        onSelect={onSelect}
        onToggle={vi.fn()}
        onOpen={vi.fn()}
      />
    ));

    fireEvent.keyDown(container.firstChild as HTMLElement, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenCalledWith("/src/index.ts");
  });

  it("keyboard Enter on file triggers onOpen", () => {
    const onOpen = vi.fn();
    const { container } = render(() => (
      <FileTree
        nodes={mockNodes}
        selectedPath={"/package.json"}
        expandedPaths={new Set()}
        gitStatuses={{}}
        isLoading={false}
        error={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onOpen={onOpen}
      />
    ));

    fireEvent.keyDown(container.firstChild as HTMLElement, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith("/package.json");
  });

  it("keyboard Enter on directory triggers onToggle", () => {
    const onToggle = vi.fn();
    const { container } = render(() => (
      <FileTree
        nodes={mockNodes}
        selectedPath={"/src"}
        expandedPaths={new Set()}
        gitStatuses={{}}
        isLoading={false}
        error={null}
        onSelect={vi.fn()}
        onToggle={onToggle}
        onOpen={vi.fn()}
      />
    ));

    fireEvent.keyDown(container.firstChild as HTMLElement, { key: "Enter" });
    expect(onToggle).toHaveBeenCalledWith("/src");
  });

  it("renders a badge for files with git status", () => {
    const { container } = render(() => (
      <FileTree
        nodes={mockNodes}
        selectedPath={null}
        expandedPaths={new Set()}
        gitStatuses={{ "/package.json": "Modified" }}
        isLoading={false}
        error={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onOpen={vi.fn()}
      />
    ));

    const badge = container.querySelector('.forge-git-badge[data-status="modified"]');
    expect(badge).toBeTruthy();
    expect(badge?.getAttribute("title")).toBe("Git status: Modified");
  });

  it("renders a badge for directories when descendants have git status", () => {
    const { container } = render(() => (
      <FileTree
        nodes={mockNodes}
        selectedPath={null}
        expandedPaths={new Set()}
        gitStatuses={{ "/src/index.ts": "Staged" }}
        isLoading={false}
        error={null}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onOpen={vi.fn()}
      />
    ));

    const badge = container.querySelector('.forge-git-badge[data-status="staged"]');
    expect(badge).toBeTruthy();
    expect(badge?.getAttribute("title")).toBe("Git status: Staged");
  });

  it("collectVisiblePaths scales linearly for large expanded trees", () => {
    const rootCount = 500;
    const childrenPerRoot = 8;
    const largeTree: FileNode[] = [];
    const expandedPaths = new Set<string>();

    for (let i = 0; i < rootCount; i += 1) {
      const dirPath = `/dir-${i}`;
      const children: FileNode[] = [];

      for (let j = 0; j < childrenPerRoot; j += 1) {
        children.push({
          name: `file-${j}.ts`,
          path: `${dirPath}/file-${j}.ts`,
          type: "file",
          size: 64,
          modified: 0,
          permissions: 0,
        });
      }

      largeTree.push({
        name: `dir-${i}`,
        path: dirPath,
        type: "directory",
        size: 0,
        modified: 0,
        permissions: 0,
        children,
      });
      expandedPaths.add(dirPath);
    }

    const expectedCount = rootCount * (childrenPerRoot + 1);
    const start = performance.now();
    const visible = collectVisiblePaths(largeTree, expandedPaths);
    const durationMs = performance.now() - start;

    expect(visible).toHaveLength(expectedCount);
    expect(durationMs).toBeLessThan(100);
  });
});
