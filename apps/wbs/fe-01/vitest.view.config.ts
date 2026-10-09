import { defineConfig, type ViteUserConfig } from 'vitest/config';

import baseConfig from './vitest.config';
import { NODE_SUITES } from './vitest.node-suites';

/** The UTC View subset; the Auckland View subset keeps its own timezone config. */
const base: ViteUserConfig = baseConfig;
const excluded = base.test?.exclude;
if (excluded === undefined) throw new Error('vitest.config.ts must declare excluded suites');

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    // Proof: removing NODE_SUITES made "excludes every Node suite from the UTC View run" fail:
    // the exclusion list lacked playwright-config.test.ts (2026-10-09).
    exclude: [...excluded, ...NODE_SUITES, '*.test.ts'],
  },
});
