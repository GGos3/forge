import type { Block } from "../types/block";

type ParserState = "idle" | "command" | "output";

const ESC = "\u001b";
const BEL = "\u0007";
const OSC_PREFIX = `${ESC}]`;
const OSC_133_PREFIX = "133;";
const ANSI_ESCAPE_REGEX = /\u001b\[[0-9;]*[A-Za-z]/g;
const PROMPT_REGEX = /^(?:\u001b\[[0-9;]*m)*\s*.*?[#$%❯➜]\s*(.*)$/;

function createBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneBlock(block: Block): Block {
  return {
    ...block,
  };
}

function parseExitCode(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function normalizeChunk(input: string): string {
  return input.replace(/\r/g, "");
}

function stripAnsi(input: string): string {
  return input.replace(ANSI_ESCAPE_REGEX, "");
}

export class BlockParser {
  private readonly completedBlocks: Block[] = [];

  private currentBlock: Block | null = null;

  private state: ParserState = "idle";

  private lineNumber = 1;

  private pendingInput = "";

  private fallbackRemainder = "";

  private previousLineBlank = true;

  private sawOscMarkers = false;

  private atLineStart = true;

  feed(data: string): void {
    if (this.pendingInput.length > 0 && data.startsWith(OSC_PREFIX)) {
      this.pendingInput = "";
    }

    const input = `${this.pendingInput}${data}`;
    this.pendingInput = "";

    let cursor = 0;
    while (cursor < input.length) {
      const oscIndex = input.indexOf(OSC_PREFIX, cursor);
      if (oscIndex === -1) {
        this.handlePlainText(input.slice(cursor));
        break;
      }

      if (oscIndex > cursor) {
        this.handlePlainText(input.slice(cursor, oscIndex));
      }

      const { content, consumed } = this.tryReadOsc(input.slice(oscIndex));
      if (consumed === 0) {
        this.pendingInput = input.slice(oscIndex);
        break;
      }

      this.handleOsc(content);
      cursor = oscIndex + consumed;
    }
  }

  getBlocks(): Block[] {
    return this.completedBlocks.map(cloneBlock);
  }

  getCurrentBlock(): Block | null {
    return this.currentBlock ? cloneBlock(this.currentBlock) : null;
  }

  reset(): void {
    this.completedBlocks.length = 0;
    this.currentBlock = null;
    this.state = "idle";
    this.lineNumber = 1;
    this.pendingInput = "";
    this.fallbackRemainder = "";
    this.previousLineBlank = true;
    this.sawOscMarkers = false;
    this.atLineStart = true;
  }

  private handleOsc(content: string): void {
    if (!content.startsWith(OSC_133_PREFIX)) {
      return;
    }

    this.sawOscMarkers = true;
    const parts = content.split(";");
    const marker = parts[1] ?? "";

    if (marker === "A") {
      this.state = this.currentBlock ? this.state : "idle";
      return;
    }

    if (marker === "B") {
      if (!this.currentBlock) {
        const inlineCommand = parts.slice(2).join(";").trim();
        const anchorLine = inlineCommand.length > 0 && this.atLineStart
          ? Math.max(1, this.lineNumber - 1)
          : this.lineNumber;
        this.currentBlock = this.createEmptyBlockAt(anchorLine);

        if (inlineCommand.length > 0 && this.currentBlock.command.length === 0) {
          this.currentBlock.command = inlineCommand;
        }
      } else {
        const inlineCommand = parts.slice(2).join(";").trim();
        if (inlineCommand.length > 0 && this.currentBlock.command.length === 0) {
          this.currentBlock.command = inlineCommand;
        }
      }

      this.state = "command";
      return;
    }

    if (marker === "C") {
      if (!this.currentBlock) {
        this.currentBlock = this.createEmptyBlock();
      }
      this.currentBlock.outputStartLine = this.lineNumber;
      this.state = "output";
      return;
    }

    if (marker === "D") {
      if (!this.currentBlock) {
        this.state = "idle";
        return;
      }

      this.currentBlock.exitCode = parseExitCode(parts[2]);
      this.finalizeCurrentBlock();
      this.state = "idle";
    }
  }

  private handlePlainText(text: string): void {
    if (text.length === 0) {
      return;
    }

    if (this.sawOscMarkers) {
      this.handleOscPlainText(text);
      return;
    }

    this.handleFallbackPlainText(text);
  }

  private handleOscPlainText(text: string): void {
    if (!this.currentBlock && this.state !== "idle") {
      this.currentBlock = this.createEmptyBlock();
    }

    const normalized = normalizeChunk(text);
    if (this.currentBlock) {
      if (this.state === "command") {
        this.currentBlock.command += normalized;
      } else {
        this.currentBlock.output += normalized;
      }

      this.currentBlock.endLine = this.lineNumber + normalized.split("\n").length - 1;
    }

    this.lineNumber += normalized.split("\n").length - 1;
    this.atLineStart = normalized.endsWith("\n");
  }

  private handleFallbackPlainText(text: string): void {
    const normalized = normalizeChunk(text);
    this.fallbackRemainder += normalized;

    while (true) {
      const newlineIndex = this.fallbackRemainder.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }

      const line = this.fallbackRemainder.slice(0, newlineIndex);
      this.fallbackRemainder = this.fallbackRemainder.slice(newlineIndex + 1);
      this.handleFallbackLine(line, this.lineNumber);
      this.lineNumber += 1;
      this.previousLineBlank = line.trim().length === 0;
    }
  }

  private handleFallbackLine(line: string, lineNumber: number): void {
    const promptMatch = stripAnsi(line).match(PROMPT_REGEX);
    if (promptMatch && (this.previousLineBlank || this.currentBlock === null)) {
      if (this.currentBlock) {
        this.currentBlock.endLine = Math.max(this.currentBlock.startLine, lineNumber - 1);
        this.completedBlocks.push(cloneBlock(this.currentBlock));
      }

      this.currentBlock = {
        id: createBlockId(),
        command: (promptMatch[1] ?? "").trim(),
        output: "",
        startLine: lineNumber,
        endLine: lineNumber,
        outputStartLine: lineNumber + 1,
        exitCode: null,
        timestamp: Date.now(),
      };
      this.state = "output";
      return;
    }

    if (!this.currentBlock) {
      return;
    }

    this.currentBlock.output += `${line}\n`;
    this.currentBlock.endLine = lineNumber;
  }

  private createEmptyBlock(): Block {
    return this.createEmptyBlockAt(this.lineNumber);
  }

  private createEmptyBlockAt(line: number): Block {
    return {
      id: createBlockId(),
      command: "",
      output: "",
      startLine: line,
      endLine: line,
      outputStartLine: line,
      exitCode: null,
      timestamp: Date.now(),
    };
  }

  private finalizeCurrentBlock(): void {
    if (!this.currentBlock) {
      return;
    }

    this.currentBlock.command = this.currentBlock.command.trim();
    this.completedBlocks.push(cloneBlock(this.currentBlock));
    this.currentBlock = null;
  }

  private tryReadOsc(input: string): { content: string; consumed: number } {
    if (!input.startsWith(OSC_PREFIX)) {
      return { content: "", consumed: 0 };
    }

    const contentStart = OSC_PREFIX.length;
    const belEnd = input.indexOf(BEL, contentStart);
    const stEnd = input.indexOf(`${ESC}\\`, contentStart);

    let end = -1;
    let terminatorLength = 0;
    if (belEnd !== -1 && (stEnd === -1 || belEnd < stEnd)) {
      end = belEnd;
      terminatorLength = 1;
    } else if (stEnd !== -1) {
      end = stEnd;
      terminatorLength = 2;
    }

    if (end === -1) {
      return { content: "", consumed: 0 };
    }

    return {
      content: input.slice(contentStart, end),
      consumed: end + terminatorLength,
    };
  }
}
