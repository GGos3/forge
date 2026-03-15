import { createSignal, Show } from "solid-js";
import "./Toast.css";

const [toastMessage, setToastMessage] = createSignal<string | null>(null);
let toastTimeout: number;

export function showToast(message: string) {
  setToastMessage(message);
  clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    setToastMessage(null);
  }, 2000);
}

export default function Toast() {
  return (
    <Show when={toastMessage()}>
      <div class="forge-toast" data-testid="toast">
        {toastMessage()}
      </div>
    </Show>
  );
}
