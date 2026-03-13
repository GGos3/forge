import { createSignal, Show } from "solid-js";

interface BlockActionsProps {
  command: string;
  output: string;
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
    } catch (err) {
    }
  };

  return (
    <div class="forge-block-actions" data-testid="block-actions">
      <button
        class="forge-block-btn"
        onClick={() => handleCopy("command", props.command)}
        title="Copy Command"
      >
        <Show when={copied() === "command"} fallback="Copy Command">Copied</Show>
      </button>
      <button
        class="forge-block-btn"
        onClick={() => handleCopy("output", props.output)}
        title="Copy Output"
      >
        <Show when={copied() === "output"} fallback="Copy Output">Copied</Show>
      </button>
      <button
        class="forge-block-btn"
        onClick={() => handleCopy("both", `${props.command}\n${props.output}`)}
        title="Copy Command + Output"
      >
        <Show when={copied() === "both"} fallback="Copy Command + Output">Copied</Show>
      </button>
    </div>
  );
}
