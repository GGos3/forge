import { createSignal, Show } from "solid-js";
import { showToast } from "./ui/Toast";

interface BlockActionsProps {
  command: string;
  output: string;
  isVisible?: boolean;
  onCopy?: (text: string) => void;
}

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function BlockActions(props: BlockActionsProps) {
  const [copied, setCopied] = createSignal<string | null>(null);

  const handleCopy = (e: MouseEvent, type: "command" | "output" | "both", text: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (props.onCopy) {
        props.onCopy(text);
      } else {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      setCopied(type);
      showToast("Copied to clipboard");
      setTimeout(() => setCopied(null), 2000);
    } catch { void 0; }
  };

  return (
    <div class="forge-block-actions" classList={{ "forge-block-actions--visible": props.isVisible }} data-testid="block-actions">
      <button
        class="forge-block-action-btn"
        classList={{ "forge-block-action-btn--copied": copied() === "command" }}
        onClick={(e) => handleCopy(e, "command", props.command)}
        title="Copy Command"
      >
        <Show when={copied() === "command"} fallback={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        }>
          <CheckIcon />
        </Show>
        <span class="forge-block-action-btn__label">Command</span>
      </button>

      <button
        class="forge-block-action-btn"
        classList={{ "forge-block-action-btn--copied": copied() === "output" }}
        onClick={(e) => handleCopy(e, "output", props.output)}
        title="Copy Output"
      >
        <Show when={copied() === "output"} fallback={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        }>
          <CheckIcon />
        </Show>
        <span class="forge-block-action-btn__label">Output</span>
      </button>

      <button
        class="forge-block-action-btn"
        classList={{ "forge-block-action-btn--copied": copied() === "both" }}
        onClick={(e) => handleCopy(e, "both", `$ ${props.command}\n${props.output}`)}
        title="Copy Command + Output"
      >
        <Show when={copied() === "both"} fallback={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="8" y="8" width="14" height="14" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
        }>
          <CheckIcon />
        </Show>
        <span class="forge-block-action-btn__label">All</span>
      </button>
    </div>
  );
}
