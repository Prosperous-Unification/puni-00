import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { defineConfig, mergeConfig } from 'vite';

import application from './vite.config';

/**
 * Separate production artifact; the normal application build has only index.html.
 * Proof: injected unused `any` in this config failed the canonical Nx lint:fast target (2026-10-13).
 */
export default defineConfig((environment) => {
  const configured = typeof application === 'function' ? application(environment) : application;
  return mergeConfig(configured, {
    define: {
      __SUBDAY_SOURCE_SHA__: JSON.stringify(
        execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      ),
    },
    build: {
      outDir: '../../../dist/apps/wbs/subday-benchmark',
      rolldownOptions: { input: resolve(import.meta.dirname, 'benchmarks/subday-axis.html') },
    },
    preview: { port: 4337, strictPort: true, proxy: {} },
  });
});
