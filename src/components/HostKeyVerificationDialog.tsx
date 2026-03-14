import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { connectionStore } from "../stores/connection";

interface HostKeyVerificationDialogProps {
  onClose: () => void;
}

export default function HostKeyVerificationDialog(props: HostKeyVerificationDialogProps) {
  let dialogRef!: HTMLDivElement;
  const [isProcessing, setIsProcessing] = createSignal(false);

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void handleResponse(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef && !dialogRef.contains(e.target as Node)) {
        void handleResponse(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    });
  });

  const handleResponse = async (allow: boolean) => {
    const request = connectionStore.pendingHostKeyVerification;
    if (!request || isProcessing()) return;

    setIsProcessing(true);
    try {
      await invoke("verify_host_key_response", {
        id: request.id,
        allow,
      });
      props.onClose();
    } catch {
      props.onClose();
    }
  };

  const request = () => connectionStore.pendingHostKeyVerification;

  return (
    <Show when={request()}>
      {(req) => (
        <div class="forge-dialog-overlay" data-testid="host-key-verification-overlay">
          <div ref={dialogRef} class="forge-dialog forge-host-key-dialog" data-testid="host-key-verification-dialog">
            <h3 data-testid="dialog-title">
              {req().mode === "mismatch" ? "⚠️ Host Key Verification Failed" : "🔐 New Host Key"}
            </h3>

            <Show when={req().mode === "mismatch"}>
              <div class="forge-host-key-warning" data-testid="mismatch-warning">
                <span class="warning-icon">⚠️</span>
                <div class="warning-content">
                  <strong>SECURITY WARNING</strong>
                  <p>The host key fingerprint has changed. This could indicate a man-in-the-middle attack.</p>
                </div>
              </div>
            </Show>

            <div class="forge-host-key-info" data-testid="host-key-info">
              <div class="info-row">
                <span class="info-label">Host:</span>
                <span class="info-value">{req().host}:{req().port}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Key Type:</span>
                <span class="info-value">{req().key_type}</span>
              </div>
              <Show when={req().mode === "mismatch" && req().known_fingerprint}>
                <div class="info-row fingerprint-row">
                  <span class="info-label">Known fingerprint:</span>
                  <code class="info-value fingerprint fingerprint-old" data-testid="known-fingerprint">{req().known_fingerprint}</code>
                </div>
              </Show>
              <div class="info-row fingerprint-row">
                <span class="info-label">{req().mode === "mismatch" ? "New fingerprint:" : "Fingerprint:"}</span>
                <code class="info-value fingerprint" data-testid="fingerprint">{req().fingerprint}</code>
              </div>
            </div>

            <Show when={req().mode === "first-use"}>
              <p class="forge-host-key-prompt" data-testid="first-use-prompt">
                Would you like to trust this host's key? This is the first time you're connecting to this server.
              </p>
            </Show>

            <Show when={req().mode === "mismatch"}>
              <p class="forge-host-key-prompt mismatch" data-testid="mismatch-prompt">
                Do you want to proceed anyway? We recommend declining and verifying the server's identity.
              </p>
            </Show>

            <div class="forge-host-key-actions" data-testid="dialog-actions">
              <button
                class="forge-dialog-btn forge-dialog-btn-deny"
                onClick={() => void handleResponse(false)}
                disabled={isProcessing()}
                data-testid="btn-deny"
              >
                {req().mode === "mismatch" ? "Decline (Unsafe)" : "Deny"}
              </button>
              <button
                class="forge-dialog-btn forge-dialog-btn-allow"
                onClick={() => void handleResponse(true)}
                disabled={isProcessing()}
                data-testid="btn-allow"
              >
                {isProcessing() ? "Processing..." : req().mode === "mismatch" ? "Allow (Risky)" : "Allow"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
