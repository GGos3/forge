import type { PaneId, PaneNode } from './pane';

export type TabId = string;

export interface Tab {
  id: TabId;
  title: string;
  root: PaneNode;
  activePane: PaneId;
}
