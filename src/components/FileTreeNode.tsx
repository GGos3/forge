import { For, Show } from "solid-js";
import type { FileNode, GitStatus, GitStatusMap } from "../types/file-node";

const GIT_STATUS_PRIORITY: GitStatus[] = ["Modified", "Staged", "Untracked"];

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  gitStatuses?: GitStatusMap;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}

export default function FileTreeNode(props: FileTreeNodeProps) {
  const isSelected = () => props.selectedPath === props.node.path;
  const isExpanded = () => props.expandedPaths.has(props.node.path);
  const nodeIcon = () => {
    if (props.node.type === "symlink") {
      return "🔗";
    }

    if (props.node.type === "directory") {
      return isExpanded() ? "📂" : "📁";
    }

    return "📄";
  };
  const gitStatus = () => {
    if (!props.gitStatuses) {
      return null;
    }

    if (props.node.type !== "directory") {
      return props.gitStatuses[props.node.path] ?? null;
    }

    const directoryPrefix = `${props.node.path}/`;
    for (const status of GIT_STATUS_PRIORITY) {
      const hasMatchingDescendant = Object.entries(props.gitStatuses).some(
        ([path, pathStatus]) =>
          pathStatus === status && (path === props.node.path || path.startsWith(directoryPrefix))
      );

      if (hasMatchingDescendant) {
        return status;
      }
    }

    return null;
  };

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    props.onSelect(props.node.path);
    if (props.node.type === "directory") {
      props.onToggle(props.node.path);
    } else {
      props.onOpen(props.node.path);
    }
  };

  return (
    <>
      <div
        class="forge-tree-node"
        data-path={props.node.path}
        data-node-path={props.node.path}
        data-explorer-path={props.node.path}
        data-selected={isSelected()}
        data-type={props.node.type}
        onClick={handleClick}
      >
        <For each={Array(props.depth).fill(0)}>
          {() => <span class="forge-tree-indent" />}
        </For>
        <span class="forge-tree-node-icon">
          <span>{nodeIcon()}</span>
        </span>
        <span
          class="forge-tree-node-label"
          title={
            props.node.permissionDenied
              ? `${props.node.name} (Permission denied)`
              : props.node.type === "file"
                ? `${props.node.name} (${props.node.size} bytes)`
                : props.node.type === "symlink"
                  ? `${props.node.name} (symlink)`
                  : props.node.name
          }
        >
          {props.node.name}
          <Show when={props.node.type === "symlink"}>
            <span aria-label="symlink" title="Symlink" style={{ "margin-left": "4px", color: "var(--text-secondary)" }}>
              ↗
            </span>
          </Show>
          <Show when={props.node.permissionDenied}>
            <span
              class="forge-tree-permission-denied"
              title="Permission denied"
              aria-label="Permission denied"
              style={{ "margin-left": "6px", color: "#ef4444" }}
            >
              ⚠
            </span>
          </Show>
        </span>
        <Show when={gitStatus()}>
          {(status) => (
            <span
              class="forge-git-badge"
              data-status={status().toLowerCase()}
              title={`Git status: ${status()}`}
            />
          )}
        </Show>
      </div>
      <Show when={props.node.type === "directory" && isExpanded()}>
        <For each={props.node.children || []}>
          {(childNode) => (
            <FileTreeNode
              node={childNode}
              depth={props.depth + 1}
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
    </>
  );
}
