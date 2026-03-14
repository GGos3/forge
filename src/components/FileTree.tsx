import { For, Show, createMemo } from "solid-js";
import type { FileNode, GitStatusMap } from "../types/file-node";
import FileTreeNode from "./FileTreeNode";

interface FileTreeProps {
  nodes: FileNode[];
  selectedPath: string | null;
  expandedPaths: Set<string>;
  gitStatuses?: GitStatusMap;
  isLoading: boolean;
  error: string | null;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}

export function collectVisiblePaths(nodes: FileNode[], expandedPaths: Set<string>): string[] {
  const paths: string[] = [];
  const stack: FileNode[] = [...nodes].reverse();

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    paths.push(node.path);

    if (node.type === "directory" && expandedPaths.has(node.path) && node.children?.length) {
      for (let i = node.children.length - 1; i >= 0; i -= 1) {
        stack.push(node.children[i]);
      }
    }
  }

  return paths;
}

export default function FileTree(props: FileTreeProps) {
  let containerRef!: HTMLDivElement;

  const visiblePaths = createMemo(() => collectVisiblePaths(props.nodes, props.expandedPaths));

  const visiblePathSet = createMemo(() => new Set(visiblePaths()));

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!props.nodes.length) return;

    const paths = visiblePaths();
    const currentIndex = props.selectedPath ? paths.indexOf(props.selectedPath) : -1;

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        const nextIndex = currentIndex < paths.length - 1 ? currentIndex + 1 : currentIndex;
        if (nextIndex >= 0) props.onSelect(paths[nextIndex]);
        else props.onSelect(paths[0]);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
        if (prevIndex >= 0) props.onSelect(paths[prevIndex]);
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        if (!props.selectedPath) return;
        const node = findNodeByPath(props.nodes, props.selectedPath);
        if (node && node.type === "directory") {
          if (!props.expandedPaths.has(node.path)) {
            props.onToggle(node.path);
          } else if (node.children && node.children.length > 0) {
            props.onSelect(node.children[0].path);
          }
        }
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        if (!props.selectedPath) return;
        const node = findNodeByPath(props.nodes, props.selectedPath);
        if (node && node.type === "directory" && props.expandedPaths.has(node.path)) {
          props.onToggle(node.path);
        } else {
          const parentPath = getParentPath(props.selectedPath);
          if (parentPath && visiblePathSet().has(parentPath)) {
            props.onSelect(parentPath);
          }
        }
        break;
      }
      case "Enter": {
        e.preventDefault();
        if (!props.selectedPath) return;
        const node = findNodeByPath(props.nodes, props.selectedPath);
        if (node) {
          if (node.type === "directory") {
            props.onToggle(node.path);
          } else {
            props.onOpen(node.path);
          }
        }
        break;
      }
    }
  };

  const findNodeByPath = (nodes: FileNode[], path: string): FileNode | null => {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.children) {
        const found = findNodeByPath(node.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  const getParentPath = (path: string): string | null => {
    const parts = path.replace(/\/$/, "").split("/");
    if (parts.length <= 1) return null;
    parts.pop();
    const parent = parts.join("/");
    return parent || "/";
  };

  return (
    <div
      ref={containerRef}
      class="forge-file-tree"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <Show when={!props.isLoading} fallback={<div class="forge-tree-loading">Loading...</div>}>
        <Show when={!props.error} fallback={<div class="forge-tree-error">{props.error}</div>}>
          <Show when={props.nodes.length > 0} fallback={<div class="forge-tree-empty">(empty)</div>}>
            <For each={props.nodes}>
              {(node) => (
                <FileTreeNode
                  node={node}
                  depth={0}
                  selectedPath={props.selectedPath}
                  expandedPaths={props.expandedPaths}
                  gitStatuses={props.gitStatuses}
                  onSelect={props.onSelect}
                  onToggle={props.onToggle}
                  onOpen={props.onOpen}
                />
              )}
            </For>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
