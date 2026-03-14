import { render, fireEvent, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import HostKeyVerificationDialog from "./HostKeyVerificationDialog";
import { connectionStore, ensureHostKeyListener, _resetHostKeyListenerForTesting } from "../stores/connection";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

describe("HostKeyVerificationDialog", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
    vi.mocked(listen).mockClear().mockResolvedValue(vi.fn());
    _resetHostKeyListenerForTesting();
    connectionStore.clearPendingHostKeyVerification();
  });

  const mockEvent = {
    id: "test-id-123",
    host: "example.com",
    port: 22,
    key_type: "RSA",
    fingerprint: "SHA256:abc123def456",
    mode: "first-use" as const,
  };

  const mockMismatchEvent = {
    ...mockEvent,
    mode: "mismatch" as const,
    known_fingerprint: "SHA256:oldkey789",
  };

  it("ensureHostKeyListener registers listener on ssh://host-key-verification channel", async () => {
    await ensureHostKeyListener();
    expect(vi.mocked(listen)).toHaveBeenCalledWith(
      "ssh://host-key-verification",
      expect.any(Function)
    );
  });

  it("event-driven: backend event sets store and dialog appears without pre-seeding", async () => {
    let capturedCallback: ((event: { payload: typeof mockEvent }) => void) | null = null;
    vi.mocked(listen).mockImplementation((_channel, cb) => {
      capturedCallback = cb as typeof capturedCallback;
      return Promise.resolve(vi.fn());
    });

    await ensureHostKeyListener();

    const { queryByTestId } = render(() => (
      <HostKeyVerificationDialog onClose={() => {}} />
    ));

    expect(queryByTestId("host-key-verification-dialog")).toBeNull();

    capturedCallback!({ payload: mockEvent });

    await waitFor(() => {
      expect(queryByTestId("host-key-verification-dialog")).toBeTruthy();
    });
  });

  it("renders first-use mode dialog correctly", async () => {
    connectionStore.setPendingHostKeyVerification(mockEvent);

    const { getByTestId, getByText } = render(() => (
      <HostKeyVerificationDialog onClose={() => {}} />
    ));

    await waitFor(() => {
      expect(getByTestId("host-key-verification-dialog")).toBeTruthy();
    });

    expect(getByText("🔐 New Host Key")).toBeTruthy();
    expect(getByTestId("fingerprint").textContent).toBe("SHA256:abc123def456");
    expect(getByTestId("first-use-prompt")).toBeTruthy();
  });

  it("renders mismatch mode with scary warning", async () => {
    connectionStore.setPendingHostKeyVerification(mockMismatchEvent);

    const { getByTestId, getByText } = render(() => (
      <HostKeyVerificationDialog onClose={() => {}} />
    ));

    await waitFor(() => {
      expect(getByTestId("host-key-verification-dialog")).toBeTruthy();
    });

    expect(getByText("⚠️ Host Key Verification Failed")).toBeTruthy();
    expect(getByTestId("mismatch-warning")).toBeTruthy();
    expect(getByTestId("mismatch-prompt")).toBeTruthy();
    expect(getByTestId("known-fingerprint").textContent).toBe("SHA256:oldkey789");
    expect(getByTestId("fingerprint").textContent).toBe("SHA256:abc123def456");
  });

  it("mismatch mode shows both old and new fingerprints", async () => {
    connectionStore.setPendingHostKeyVerification(mockMismatchEvent);

    const { getByTestId } = render(() => (
      <HostKeyVerificationDialog onClose={() => {}} />
    ));

    await waitFor(() => {
      expect(getByTestId("host-key-verification-dialog")).toBeTruthy();
    });

    expect(getByTestId("known-fingerprint").textContent).toBe("SHA256:oldkey789");
    expect(getByTestId("fingerprint").textContent).toBe("SHA256:abc123def456");
  });

  it("first-use mode does not show known-fingerprint row", async () => {
    connectionStore.setPendingHostKeyVerification(mockEvent);

    const { queryByTestId } = render(() => (
      <HostKeyVerificationDialog onClose={() => {}} />
    ));

    await waitFor(() => {
      expect(queryByTestId("host-key-verification-dialog")).toBeTruthy();
    });

    expect(queryByTestId("known-fingerprint")).toBeNull();
  });

  it("calls invoke with allow=true when Allow is clicked", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const onClose = vi.fn();

    connectionStore.setPendingHostKeyVerification(mockEvent);

    const { getByTestId } = render(() => (
      <HostKeyVerificationDialog onClose={onClose} />
    ));

    await waitFor(() => {
      expect(getByTestId("btn-allow")).toBeTruthy();
    });

    fireEvent.click(getByTestId("btn-allow"));

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        "verify_host_key_response",
        expect.objectContaining({ id: "test-id-123", allow: true })
      );
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("calls invoke with allow=false when Deny is clicked", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    const onClose = vi.fn();

    connectionStore.setPendingHostKeyVerification(mockEvent);

    const { getByTestId } = render(() => (
      <HostKeyVerificationDialog onClose={onClose} />
    ));

    await waitFor(() => {
      expect(getByTestId("btn-deny")).toBeTruthy();
    });

    fireEvent.click(getByTestId("btn-deny"));

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        "verify_host_key_response",
        expect.objectContaining({ id: "test-id-123", allow: false })
      );
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("displays host and port information correctly", async () => {
    connectionStore.setPendingHostKeyVerification(mockEvent);

    const { getByText } = render(() => (
      <HostKeyVerificationDialog onClose={() => {}} />
    ));

    await waitFor(() => {
      expect(getByText("example.com:22")).toBeTruthy();
    });
    expect(getByText("RSA")).toBeTruthy();
  });

  it("shows different button text for mismatch mode", async () => {
    connectionStore.setPendingHostKeyVerification(mockMismatchEvent);

    const { getByTestId } = render(() => (
      <HostKeyVerificationDialog onClose={() => {}} />
    ));

    await waitFor(() => {
      expect(getByTestId("btn-deny")).toBeTruthy();
    });

    expect(getByTestId("btn-deny").textContent).toBe("Decline (Unsafe)");
    expect(getByTestId("btn-allow").textContent).toBe("Allow (Risky)");
  });

  it("shows correct button text for first-use mode", async () => {
    connectionStore.setPendingHostKeyVerification(mockEvent);

    const { getByTestId } = render(() => (
      <HostKeyVerificationDialog onClose={() => {}} />
    ));

    await waitFor(() => {
      expect(getByTestId("btn-deny")).toBeTruthy();
    });

    expect(getByTestId("btn-deny").textContent).toBe("Deny");
    expect(getByTestId("btn-allow").textContent).toBe("Allow");
  });

  it("does not render when no pending verification", () => {
    connectionStore.clearPendingHostKeyVerification();

    const { queryByTestId } = render(() => (
      <HostKeyVerificationDialog onClose={() => {}} />
    ));

    expect(queryByTestId("host-key-verification-dialog")).toBeNull();
  });
});
