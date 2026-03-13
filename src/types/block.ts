export type BlockId = string;

export interface Block {
  id: BlockId;
  command: string;
  output: string;
  startLine: number;
  endLine: number;
  exitCode: number | null;
  timestamp: number;
}
