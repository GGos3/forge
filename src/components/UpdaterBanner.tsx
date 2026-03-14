import { Match, Show, Switch, onMount } from "solid-js";
import { updaterStore } from "../stores/updater";

export default function UpdaterBanner() {
  onMount(() => {
    void updaterStore.checkForUpdates();
  });

  return (
    <Show when={updaterStore.available || updaterStore.error || updaterStore.checking || updaterStore.downloading}>
      <div class="forge-updater-banner" data-testid="updater-banner">
        <Switch>
          <Match when={updaterStore.checking}>
            <span data-testid="updater-checking">Checking for updates…</span>
          </Match>
          <Match when={updaterStore.downloading}>
            <span data-testid="updater-downloading">Downloading update…</span>
          </Match>
          <Match when={updaterStore.available}>
            <div class="forge-updater-banner__content">
              <span data-testid="updater-available">
                {updaterStore.channel === "dev" ? "Dev" : "Production"} update available: {updaterStore.version}
              </span>
              <button class="forge-updater-banner__button" data-testid="updater-install" onClick={() => void updaterStore.installUpdate()}>
                Update now
              </button>
            </div>
          </Match>
          <Match when={Boolean(updaterStore.error)}>
            <span data-testid="updater-error">{updaterStore.error}</span>
          </Match>
        </Switch>
      </div>
    </Show>
  );
}
