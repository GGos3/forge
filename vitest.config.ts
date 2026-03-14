import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UserConfig as ViteUserConfig } from 'vite';
import type { InlineConfig } from 'vitest/node';
import solid from 'vite-plugin-solid';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

const test: InlineConfig = {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/test-setup.ts'],
  passWithNoTests: true,
  include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}', 'tests/**/*.{test,spec}.{js,ts,jsx,tsx}'],
  exclude: ['tests/e2e/**/*', 'node_modules', 'dist', '.idea', '.git', '.cache'],
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
  },
};

const config: ViteUserConfig & { test: InlineConfig } = {
  plugins: [solid()],
  test,
  resolve: {
    alias: {
      '@tauri-apps/plugin-dialog': resolve(rootDir, 'tests/mocks/tauri-plugin-dialog.ts'),
    },
    conditions: ['development', 'browser'],
  },
};

export default config;
