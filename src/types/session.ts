export type ShellType = 'bash' | 'zsh' | 'fish' | 'powershell' | 'cmd';

export interface ShellInfo {
  name: string;
  path: string;
  shell_type: ShellType;
}

export interface SessionId {
  readonly __brand: 'SessionId';
  value: string;
}

export interface SessionConfig {
  shell: ShellType;
  cwd?: string;
  env?: Record<string, string>;
}

export interface SessionInfo {
  id: SessionId;
  shell: ShellType;
  pid: number;
  alive: boolean;
}

export interface ResizePayload {
  session_id: SessionId;
  cols: number;
  rows: number;
}

export interface SessionOutputEvent {
  session_id: string;
  data: number[];
}

export interface SessionExitEvent {
  session_id: string;
  exit_code: number | null;
}
