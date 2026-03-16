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

function isInternalOscCommand(input: string): boolean {
  const command = input.trim();
  if (!command) {
    return false;
  }

  if (/^__(?!.*\s)/.test(command)) {
    return true;
  }

  if (/^(?:history|builtin\s+history)(?:\s|$)/.test(command)) {
    return true;
  }

  if (/^(?:PROMPT_COMMAND|PS1)=/.test(command)) {
    return true;
  }

  return false;
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

  private ignoringOscCommand = false;

  private pendingOscPromptRemainder = "";

  private pendingOscPromptLine: { text: string; lineNumber: number } | null = null;

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

  getLineNumber(): number {
    return this.lineNumber;
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
    this.ignoringOscCommand = false;
    this.pendingOscPromptRemainder = "";
    this.pendingOscPromptLine = null;
  }

  private handleOsc(content: string): void {
    if (!content.startsWith(OSC_133_PREFIX)) {
      return;
    }

    this.sawOscMarkers = true;
    const parts = content.split(";");
    const marker = parts[1] ?? "";

    if (marker === "A") {
      this.pendingOscPromptRemainder = "";
      this.pendingOscPromptLine = null;
      this.state = this.currentBlock ? this.state : "idle";
      return;
    }

    if (marker === "B") {
      const inlineCommand = parts.slice(2).join(";").trim();
      console.log("[OSC_B]", {
        marker,
        lineNumber: this.lineNumber,
        inlineCommand,
        state: this.state,
        currentBlock: this.currentBlock
          ? {
              id: this.currentBlock.id,
              command: this.currentBlock.command,
              startLine: this.currentBlock.startLine,
              outputStartLine: this.currentBlock.outputStartLine,
            }
          : null,
      });
      if (isInternalOscCommand(inlineCommand)) {
        this.ignoringOscCommand = true;
        this.state = "idle";
        return;
      }

      this.ignoringOscCommand = false;

      if (!this.currentBlock) {
        const pendingPrompt = inlineCommand.length === 0 ? this.consumePendingOscPromptLine() : null;
        const promptCommand = pendingPrompt ? this.extractPromptCommand(pendingPrompt.text) : "";
        const anchorLine = pendingPrompt?.lineNumber ?? this.lineNumber;
        this.currentBlock = this.createEmptyBlockAt(anchorLine);

        if (inlineCommand.length > 0 && this.currentBlock.command.length === 0) {
          this.currentBlock.command = inlineCommand;
        } else if (promptCommand.length > 0 && this.currentBlock.command.length === 0) {
          this.currentBlock.command = promptCommand;
        }
      } else {
        if (inlineCommand.length > 0 && this.currentBlock.command.length === 0) {
          this.currentBlock.command = inlineCommand;
        }
      }

      this.state = "command";
      return;
    }

    if (marker === "C") {
      console.log("[OSC_C]", {
        marker,
        lineNumber: this.lineNumber,
        state: this.state,
        currentBlock: this.currentBlock
          ? {
              id: this.currentBlock.id,
              command: this.currentBlock.command,
              startLine: this.currentBlock.startLine,
              outputStartLine: this.currentBlock.outputStartLine,
            }
          : null,
      });
      if (this.ignoringOscCommand) {
        return;
      }

      if (!this.currentBlock) {
        this.currentBlock = this.createEmptyBlock();
      }
      this.currentBlock.outputStartLine = this.lineNumber;
      this.state = "output";
      return;
    }

    if (marker === "D") {
      if (this.ignoringOscCommand) {
        this.ignoringOscCommand = false;
        this.state = "idle";
        return;
      }

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
    const normalized = normalizeChunk(text);

    if (!this.currentBlock && this.state === "idle") {
      this.capturePendingOscPrompt(normalized);
      this.lineNumber += normalized.split("\n").length - 1;
      return;
    }

    if (!this.currentBlock && this.state !== "idle") {
      this.currentBlock = this.createEmptyBlock();
    }

    if (this.currentBlock) {
      if (this.state === "command") {
        this.currentBlock.command += normalized;
      } else {
        this.currentBlock.output += normalized;
      }

      this.currentBlock.endLine = this.lineNumber + normalized.split("\n").length - 1;
    }

    this.lineNumber += normalized.split("\n").length - 1;
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
        source: "fallback",
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
      source: "osc",
    };
  }

  private capturePendingOscPrompt(text: string): void {
    if (text.length === 0) {
      return;
    }

    let buffer = `${this.pendingOscPromptRemainder}${text}`;
    let lineNumber = this.lineNumber;

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }

      const line = buffer.slice(0, newlineIndex);
      if (stripAnsi(line).trim().length > 0) {
        this.pendingOscPromptLine = { text: line, lineNumber };
      }

      buffer = buffer.slice(newlineIndex + 1);
      lineNumber += 1;
    }

    this.pendingOscPromptRemainder = buffer;
  }

  private consumePendingOscPromptLine(): { text: string; lineNumber: number } | null {
    const pending = this.pendingOscPromptLine;
    this.pendingOscPromptLine = null;
    this.pendingOscPromptRemainder = "";
    return pending;
  }

  private extractPromptCommand(line: string): string {
    const stripped = stripAnsi(line);
    const match = stripped.match(PROMPT_REGEX);
    return (match?.[1] ?? "").trim();
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
