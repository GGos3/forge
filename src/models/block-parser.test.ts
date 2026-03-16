import { describe, expect, it } from "vitest";
import { BlockParser } from "./block-parser";

const ESC = "\u001b";
const BEL = "\u0007";

function osc(marker: string): string {
  return `${ESC}]133;${marker}${BEL}`;
}

describe("BlockParser", () => {
  it("parses OSC-marked command with multi-line output", () => {
    const parser = new BlockParser();

    parser.feed(`${osc("A")}${osc("B")}echo hello\n${osc("C")}line-1\nline-2\n${osc("D;0")}`);

    const blocks = parser.getBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].command).toBe("echo hello");
    expect(blocks[0].output).toBe("line-1\nline-2\n");
    expect(blocks[0].exitCode).toBe(0);
    expect(parser.getCurrentBlock()).toBeNull();
  });

  it("parses no-output OSC command", () => {
    const parser = new BlockParser();

    parser.feed(`${osc("A")}${osc("B")}true\n${osc("C")}${osc("D;0")}`);

    const [block] = parser.getBlocks();
    expect(block.command).toBe("true");
    expect(block.output).toBe("");
    expect(block.exitCode).toBe(0);
  });

  it("parses inline command text from the B marker", () => {
    const parser = new BlockParser();

    parser.feed(`${osc("A")}${osc("B;echo inline")}${osc("C")}inline\n${osc("D;0")}`);

    const [block] = parser.getBlocks();
    expect(block.command).toBe("echo inline");
    expect(block.output).toBe("inline\n");
    expect(block.exitCode).toBe(0);
  });

  it("preserves semicolons in inline B marker commands", () => {
    const parser = new BlockParser();

    parser.feed(`${osc("A")}${osc("B;echo one; echo two")}${osc("C")}done\n${osc("D;0")}`);

    const [block] = parser.getBlocks();
    expect(block.command).toBe("echo one; echo two");
    expect(block.output).toBe("done\n");
  });

  it("anchors inline B command blocks to the current parser line after an echoed newline", () => {
    const parser = new BlockParser();

    parser.feed(`echo inline\n${osc("A")}${osc("B;echo inline")}${osc("C")}inline\n${osc("D;0")}`);

    const [block] = parser.getBlocks();
    expect(block.command).toBe("echo inline");
    expect(block.startLine).toBe(2);
    expect(block.endLine).toBe(3);
  });

  it("keeps consecutive inline B command blocks aligned to each echoed command line", () => {
    const parser = new BlockParser();

    parser.feed(`${osc("A")}~ ❯ `);
    parser.feed(`echo one\n${osc("B;echo one")}${osc("C")}one\n${osc("D;0")}`);
    parser.feed(`${osc("A")}~ ❯ `);
    parser.feed(`echo two\n${osc("B;echo two")}${osc("C")}two\n${osc("D;0")}`);

    const blocks = parser.getBlocks();
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.command)).toEqual(["echo one", "echo two"]);
    expect(blocks.map((block) => block.startLine)).toEqual([2, 4]);
  });

  it("keeps inline B command blocks on the current line before a newline arrives", () => {
    const parser = new BlockParser();

    parser.feed(`${osc("A")}${osc("B;echo inline")}${osc("C")}inline\n${osc("D;0")}`);

    const [block] = parser.getBlocks();
    expect(block.command).toBe("echo inline");
    expect(block.startLine).toBe(1);
  });

  it("captures non-zero exit codes", () => {
    const parser = new BlockParser();

    parser.feed(`${osc("A")}${osc("B")}false\n${osc("C")}${osc("D;1")}`);

    const [block] = parser.getBlocks();
    expect(block.command).toBe("false");
    expect(block.exitCode).toBe(1);
  });

  it("handles rapid sequential OSC commands", () => {
    const parser = new BlockParser();

    parser.feed(
      `${osc("A")}${osc("B")}echo one\n${osc("C")}one\n${osc("D;0")}${osc("A")}${osc("B")}echo two\n${osc("C")}two\n${osc("D;0")}`
    );

    const blocks = parser.getBlocks();
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.command)).toEqual(["echo one", "echo two"]);
    expect(blocks.map((block) => block.output)).toEqual(["one\n", "two\n"]);
  });

  it("gracefully handles malformed/incomplete OSC input", () => {
    const parser = new BlockParser();

    expect(() => parser.feed(`${ESC}]133;B`)).not.toThrow();
    expect(() => parser.feed(`${osc("A")}${osc("B")}echo ok\n${osc("C")}ok\n${osc("D;0")}`)).not.toThrow();

    const blocks = parser.getBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].command).toBe("echo ok");
    expect(blocks[0].output).toBe("ok\n");
  });

  it("detects prompt boundaries in fallback mode", () => {
    const parser = new BlockParser();

    parser.feed("\n$ echo first\nfirst\n\n$ echo second\nsecond\n");

    const blocks = parser.getBlocks();
    const current = parser.getCurrentBlock();

    expect(blocks).toHaveLength(1);
    expect(blocks[0].command).toBe("echo first");
    expect(blocks[0].output).toBe("first\n\n");

    expect(current).not.toBeNull();
    expect(current?.command).toBe("echo second");
    expect(current?.output).toBe("second\n");
  });

  it("keeps long-running fallback command as current block", () => {
    const parser = new BlockParser();

    parser.feed("\n$ top\nframe-1\nframe-2\nframe-3\n");

    expect(parser.getBlocks()).toHaveLength(0);
    const current = parser.getCurrentBlock();
    expect(current).not.toBeNull();
    expect(current?.command).toBe("top");
    expect(current?.output).toContain("frame-1\nframe-2\nframe-3\n");
  });

  it("reset clears completed and in-progress state", () => {
    const parser = new BlockParser();

    parser.feed(`${osc("A")}${osc("B")}echo clear\n${osc("C")}x\n${osc("D;0")}`);
    expect(parser.getBlocks()).toHaveLength(1);

    parser.reset();

    expect(parser.getBlocks()).toHaveLength(0);
    expect(parser.getCurrentBlock()).toBeNull();
  });
});
