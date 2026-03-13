import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const host = (typeof process !== "undefined" && process.env?.TAURI_DEV_HOST) || undefined;
const rootDir = fileURLToPath(new URL(".", import.meta.url));
const useE2eTauriMocks = process.env.VITE_E2E === "1";

export default defineConfig(async () => ({
  plugins: [solid()],
  clearScreen: false,
  resolve: {
    alias: useE2eTauriMocks
      ? {
          "@tauri-apps/api/core": resolve(rootDir, "tests/e2e/mocks/tauri-api.js"),
          "@tauri-apps/api/event": resolve(rootDir, "tests/e2e/mocks/tauri-api.js"),
        }
      : undefined,
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
