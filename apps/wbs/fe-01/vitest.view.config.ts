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
    // Proof: removing NODE_SUITES made vitest.view-level.test.ts fail because
    // src/lib/pure.test.ts was absent from this exclusion set (2026-10-09).
    exclude: [...excluded, ...NODE_SUITES, '*.test.ts'],
  },
});
