import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi, beforeEach } from "vitest";
import BlockOverlay from "./BlockOverlay";
import BlockActions from "./BlockActions";

describe("BlockOverlay", () => {
  it("renders block cards with correct positioning", () => {
    const blocks = [
      { id: "1", top: 10, height: 100, inputHeight: 20, command: "echo a", output: "a", exitCode: 0, timestamp: 123456789, isRunning: false },
      { id: "2", top: 110, height: 100, inputHeight: 20, command: "echo b", output: "b", exitCode: null, timestamp: 123456789, isRunning: false },
    ];

    render(() => <BlockOverlay blocks={blocks} />);

    expect(screen.queryByTestId("block-1")).toBeTruthy();
    expect(screen.queryByTestId("block-2")).toBeTruthy();

    const block1 = screen.getByTestId("block-1");
    expect(block1.style.top).toBe("10px");
    expect(block1.style.height).toBe("100px");
  });

  it("shows success icon for exit code 0", () => {
    const blocks = [
      { id: "1", top: 10, height: 100, inputHeight: 20, command: "echo ok", output: "ok", exitCode: 0, timestamp: 123456789, isRunning: false },
    ];

    render(() => <BlockOverlay blocks={blocks} />);

    const block = screen.getByTestId("block-1");
    expect(block.classList.contains("forge-block-card--success")).toBe(true);
    expect(screen.getByTestId("status-success")).toBeTruthy();
  });

  it("shows error styling and exit code for failed commands", () => {
    const blocks = [
      { id: "1", top: 10, height: 100, inputHeight: 20, command: "false", output: "", exitCode: 1, timestamp: 123456789, isRunning: false },
    ];

    render(() => <BlockOverlay blocks={blocks} />);

    const block = screen.getByTestId("block-1");
    expect(block.classList.contains("forge-block-card--error")).toBe(true);
    expect(screen.getByTestId("status-error")).toBeTruthy();
    expect(screen.getByTestId("exit-code").textContent).toBe("exit 1");
  });

  it("does not render blocks completely out of bounds", () => {
    const blocks = [
      { id: "1", top: -200, height: 100, inputHeight: 20, command: "a", output: "a", exitCode: 0, timestamp: 123456789, isRunning: false },
    ];

    render(() => <BlockOverlay blocks={blocks} />);

    expect(screen.queryByTestId("block-1")).toBeNull();
  });

  it("renders command label, timestamp and running spinner", () => {
    const blocks = [
      { id: "1", top: 10, height: 100, inputHeight: 20, command: "sleep 10", output: "", exitCode: null, timestamp: 1672531200000, isRunning: true },
    ];

    render(() => <BlockOverlay blocks={blocks} />);

    expect(screen.queryByText("sleep 10")).toBeTruthy();
    expect(screen.queryByTestId("running-indicator")).toBeTruthy();
    const block = screen.getByTestId("block-1");
    expect(block.classList.contains("forge-block-card--running")).toBe(true);
    expect(screen.getByText(/:\d{2}/)).toBeTruthy();
  });

  it("shows exit code badge only for error blocks", () => {
    const blocks = [
      { id: "ok", top: 10, height: 100, inputHeight: 20, command: "echo ok", output: "ok", exitCode: 0, timestamp: 123456789, isRunning: false },
      { id: "err", top: 120, height: 100, inputHeight: 20, command: "fail", output: "", exitCode: 127, timestamp: 123456789, isRunning: false },
    ];

    render(() => <BlockOverlay blocks={blocks} />);

    expect(screen.getByTestId("exit-code").textContent).toBe("exit 127");
  });
});

describe("BlockActions", () => {
  let clipboardSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clipboardSpy = vi.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: clipboardSpy,
      },
    });
  });

  it("renders copy action buttons with icons", () => {
    render(() => <BlockActions command="echo test" output="test out" />);

    expect(screen.queryByTitle("Copy Command")).toBeTruthy();
    expect(screen.queryByTitle("Copy Output")).toBeTruthy();
    expect(screen.queryByTitle("Copy Command + Output")).toBeTruthy();
  });

  it("copies command via onCopy callback", () => {
    const handleCopy = vi.fn();
    render(() => <BlockActions command="echo test" output="test out" onCopy={handleCopy} />);

    fireEvent.click(screen.getByTitle("Copy Command"));
    expect(handleCopy).toHaveBeenCalledWith("echo test");
  });

  it("copies output via onCopy callback", () => {
    const handleCopy = vi.fn();
    render(() => <BlockActions command="echo test" output="test out" onCopy={handleCopy} />);

    fireEvent.click(screen.getByTitle("Copy Output"));
    expect(handleCopy).toHaveBeenCalledWith("test out");
  });

  it("copies both command and output via onCopy callback", () => {
    const handleCopy = vi.fn();
    render(() => <BlockActions command="echo test" output="test out" onCopy={handleCopy} />);

    fireEvent.click(screen.getByTitle("Copy Command + Output"));
    expect(handleCopy).toHaveBeenCalledWith("$ echo test\ntest out");
  });

  it("shows copied state after clicking copy", async () => {
    const handleCopy = vi.fn();
    render(() => <BlockActions command="echo test" output="test out" onCopy={handleCopy} />);

    fireEvent.click(screen.getByTitle("Copy Command"));

    await vi.waitFor(() => {
      const btn = screen.getByTitle("Copy Command");
      expect(btn.classList.contains("forge-block-action-btn--copied")).toBe(true);
    });
  });
});
