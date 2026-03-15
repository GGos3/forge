export type BlockId = string;

export type BlockSource = "osc" | "fallback";

export interface Block {
  id: BlockId;
  command: string;
  output: string;
  startLine: number;
  endLine: number;
  outputStartLine: number;
  exitCode: number | null;
  timestamp: number;
  source: BlockSource;
}
