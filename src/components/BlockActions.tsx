import { createSignal, Show } from "solid-js";

interface BlockActionsProps {
  command: string;
  output: string;
  isVisible?: boolean;
  onCopy?: (text: string) => void;
}

export default function BlockActions(props: BlockActionsProps) {
  const [copied, setCopied] = createSignal<string | null>(null);

  const handleCopy = async (type: "command" | "output" | "both", text: string) => {
    try {
      if (props.onCopy) {
        props.onCopy(text);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch { void 0; }
  };

  return (
    <div class="forge-block-actions" classList={{ "forge-block-actions--visible": props.isVisible }} data-testid="block-actions">
      <button
        class="forge-block-action-btn"
        classList={{ "forge-block-action-btn--copied": copied() === "command" }}
        onClick={() => handleCopy("command", props.command)}
        title="Copy Command"
      >
        <Show when={copied() === "command"} fallback={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          </svg>
        }>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </Show>
        <span class="forge-block-action-btn__label">
          {copied() === "command" ? "Copied" : "Command"}
        </span>
      </button>

      <button
        class="forge-block-action-btn"
        classList={{ "forge-block-action-btn--copied": copied() === "output" }}
        onClick={() => handleCopy("output", props.output)}
        title="Copy Output"
      >
        <Show when={copied() === "output"} fallback={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        }>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </Show>
        <span class="forge-block-action-btn__label">
          {copied() === "output" ? "Copied" : "Output"}
        </span>
      </button>

      <button
        class="forge-block-action-btn"
        classList={{ "forge-block-action-btn--copied": copied() === "both" }}
        onClick={() => handleCopy("both", `$ ${props.command}\n${props.output}`)}
        title="Copy Command + Output"
      >
        <Show when={copied() === "both"} fallback={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        }>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </Show>
        <span class="forge-block-action-btn__label">
          {copied() === "both" ? "Copied" : "All"}
        </span>
      </button>
    </div>
  );
}
