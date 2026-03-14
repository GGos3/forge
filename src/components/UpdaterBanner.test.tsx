import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import UpdaterBanner from "./UpdaterBanner";
import { updaterStore } from "../stores/updater";

describe("UpdaterBanner", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    updaterStore._resetForTesting();
  });

  it("shows available update and install button", async () => {
    invokeMock.mockResolvedValue({
      version: "0.2.0",
      currentVersion: "0.1.0",
      notes: "notes",
    });

    render(() => <UpdaterBanner />);

    await waitFor(() => {
      expect(screen.getByTestId("updater-available").textContent).toContain("0.2.0");
    });
    expect(screen.getByTestId("updater-install")).toBeTruthy();
  });

  it("shows updater error when check fails", async () => {
    invokeMock.mockRejectedValue(new Error("update failed"));

    render(() => <UpdaterBanner />);

    await waitFor(() => {
      expect(screen.getByTestId("updater-error").textContent).toContain("update failed");
    });
  });

  it("suppresses noisy startup release json errors", async () => {
    invokeMock.mockRejectedValue(new Error("Could not fetch a valid release JSON from remote"));

    render(() => <UpdaterBanner />);

    await waitFor(() => {
      expect(screen.queryByTestId("updater-error")).toBeNull();
    });
  });

  it("runs install when button is clicked", async () => {
    invokeMock
      .mockResolvedValueOnce({
      version: "0.2.0",
      currentVersion: "0.1.0",
      notes: null,
    })
      .mockResolvedValueOnce(undefined);

    render(() => <UpdaterBanner />);

    await waitFor(() => {
      expect(screen.getByTestId("updater-install")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("updater-install"));

    const expectedChannel = import.meta.env.VITE_FORGE_RELEASE_CHANNEL === "dev" ? "dev" : "prod";
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("install_update", { channel: expectedChannel });
    });
  });
});
