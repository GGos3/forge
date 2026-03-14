import { render, screen, fireEvent } from "@solidjs/testing-library";
import { describe, it, expect, beforeEach, vi } from "vitest";
import TransferPanel from "../TransferPanel";
import { transferStore } from "../../stores/transfer";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("TransferPanel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    transferStore._resetForTesting();
  });

  it("renders empty state when no transfers", () => {
    render(() => <TransferPanel />);
    const emptyState = document.querySelector(".forge-connection-empty");
    expect(emptyState?.textContent).toContain("No active transfers");
  });

  it("renders transfer items", () => {
    transferStore.enqueue({
      connectionId: "c1",
      localPath: "/tmp/app.tar.gz",
      remotePath: "/home/user/app.tar.gz",
      direction: "upload",
      fileName: "app.tar.gz",
      bytesTotal: 2048,
    });

    render(() => <TransferPanel />);

    const items = document.querySelectorAll("[data-testid^='transfer-']");
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it("removes a transfer item", () => {
    const id = transferStore.enqueue({
      connectionId: "c1",
      localPath: "/tmp/test.txt",
      remotePath: "/test.txt",
      direction: "download",
      fileName: "test.txt",
      bytesTotal: 100,
    });

    render(() => <TransferPanel />);

    fireEvent.click(screen.getByTestId(`btn-remove-transfer-${id}`));
    expect(transferStore.items).toHaveLength(0);
  });
});
