import type { SessionId, ShellType } from './session';

export type PaneId = string;

export type SplitDirection = 'horizontal' | 'vertical';

export type DropZone = 'top' | 'bottom' | 'left' | 'right';

export type SplitPosition = 'before' | 'after';

export interface TerminalPane {
  type: 'terminal';
  id: PaneId;
  sessionId: SessionId;
  shell?: ShellType;
}

export interface SplitPane {
  type: 'split';
  id: PaneId;
  direction: SplitDirection;
  first: PaneNode;
  second: PaneNode;
  ratio: number;
}

export type PaneNode = TerminalPane | SplitPane;
