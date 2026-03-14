export type FileNodeType = 'file' | 'directory' | 'symlink';

export type GitStatus = 'Modified' | 'Staged' | 'Untracked';

export type GitStatusMap = Record<string, GitStatus>;

export interface FileNode {
  name: string;
  path: string;
  type: FileNodeType;
  size: number;
  modified: number;
  permissions: number;
  permissionDenied?: boolean;
  children?: FileNode[];
  isExpanded?: boolean;
}

export type FileTreeProvider = 'local' | 'remote';

export interface FileTreeRoot {
  rootPath: string;
  provider: FileTreeProvider;
  connectionId?: string;
  nodes: FileNode[];
  gitStatuses?: GitStatusMap;
}

export interface ExplorerContext {
  root: FileTreeRoot | null;
  selectedPath: string | null;
  expandedPaths: Set<string>;
}
