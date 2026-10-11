import { defineConfig, type ViteUserConfig } from 'vitest/config';

import baseConfig from './vitest.config';

/** Root Unit suites that need jsdom and are not in the fast Node tier. */
const base: ViteUserConfig = baseConfig;

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['browser-packages.test.ts', 'vite-config.test.ts'],
  },
});
