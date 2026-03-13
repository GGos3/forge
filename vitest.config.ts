import type { UserConfig as ViteUserConfig } from 'vite';
import type { InlineConfig } from 'vitest/node';
import solid from 'vite-plugin-solid';

const test: InlineConfig = {
  environment: 'jsdom',
  globals: true,
  setupFiles: [],
  passWithNoTests: true,
  include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}', 'tests/**/*.{test,spec}.{js,ts,jsx,tsx}'],
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
  },
};

const config: ViteUserConfig & { test: InlineConfig } = {
  plugins: [solid()],
  test,
  resolve: {
    conditions: ['development', 'browser'],
  },
};

export default config;
