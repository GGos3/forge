import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi, beforeEach } from "vitest";
import BlockOverlay from "./BlockOverlay";
import BlockActions from "./BlockActions";

describe("BlockOverlay", () => {
  it("renders block dividers correctly", () => {
    const blocks = [
      { id: "1", top: 10, height: 100, command: "echo a", output: "a", exitCode: 0, timestamp: 123456789, isRunning: false },
      { id: "2", top: 110, height: 100, command: "echo b", output: "b", exitCode: null, timestamp: 123456789, isRunning: false },
    ];
    
    render(() => <BlockOverlay blocks={blocks} />);
    
    expect(screen.queryByTestId("block-1")).toBeTruthy();
    expect(screen.queryByTestId("block-2")).toBeTruthy();
    
    const block1 = screen.getByTestId("block-1");
    expect(block1.style.top).toBe("10px");
    expect(block1.style.height).toBe("100px");
    expect(block1.className).not.toContain("forge-block-error");
  });

  it("adds error class for failed commands", () => {
    const blocks = [
      { id: "1", top: 10, height: 100, command: "false", output: "", exitCode: 1, timestamp: 123456789, isRunning: false },
    ];
    
    render(() => <BlockOverlay blocks={blocks} />);
    
    const block = screen.getByTestId("block-1");
    expect(block.className).toContain("forge-block-error");
  });

  it("does not render blocks completely out of bounds", () => {
    const blocks = [
      { id: "1", top: -200, height: 100, command: "a", output: "a", exitCode: 0, timestamp: 123456789, isRunning: false },
    ];
    
    render(() => <BlockOverlay blocks={blocks} />);
    
    expect(screen.queryByTestId("block-1")).toBeNull();
  });

  it("renders command label, timestamp and running indicator", () => {
    const blocks = [
      { id: "1", top: 10, height: 100, command: "sleep 10", output: "", exitCode: null, timestamp: 1672531200000, isRunning: true },
    ];
    
    render(() => <BlockOverlay blocks={blocks} />);
    
    expect(screen.queryByText("sleep 10")).toBeTruthy();
    expect(screen.queryByTestId("running-indicator")).toBeTruthy();
    expect(screen.getByText(/:\d{2}/)).toBeTruthy();
  });
});

describe("BlockActions", () => {
  let clipboardSpy: any;

  beforeEach(() => {
    clipboardSpy = vi.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: clipboardSpy,
      },
    });
  });

  it("renders copy actions", () => {
    render(() => <BlockActions command="echo test" output="test out" />);
    
    expect(screen.queryByTitle("Copy Command")).toBeTruthy();
    expect(screen.queryByTitle("Copy Output")).toBeTruthy();
    expect(screen.queryByTitle("Copy Command + Output")).toBeTruthy();
  });

  it("copies command to clipboard", async () => {
    const handleCopy = vi.fn();
    render(() => <BlockActions command="echo test" output="test out" onCopy={handleCopy} />);
    
    const btn = screen.getByTitle("Copy Command");
    fireEvent.click(btn);
    
    expect(handleCopy).toHaveBeenCalledWith("echo test");
  });

  it("copies output to clipboard", async () => {
    const handleCopy = vi.fn();
    render(() => <BlockActions command="echo test" output="test out" onCopy={handleCopy} />);
    
    const btn = screen.getByTitle("Copy Output");
    fireEvent.click(btn);
    
    expect(handleCopy).toHaveBeenCalledWith("test out");
  });

  it("copies both to clipboard", async () => {
    const handleCopy = vi.fn();
    render(() => <BlockActions command="echo test" output="test out" onCopy={handleCopy} />);
    
    const btn = screen.getByTitle("Copy Command + Output");
    fireEvent.click(btn);
    
    expect(handleCopy).toHaveBeenCalledWith("echo test\ntest out");
  });
});
