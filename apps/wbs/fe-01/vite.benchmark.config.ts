import { resolve } from 'node:path';

import { defineConfig, mergeConfig } from 'vite';

import application from './vite.config';

/** Separate production artifact; the normal application build has only index.html. */
export default defineConfig((environment) => {
  const configured = typeof application === 'function' ? application(environment) : application;
  return mergeConfig(configured, {
    build: {
      outDir: '../../../dist/apps/wbs/subday-benchmark',
      rolldownOptions: { input: resolve(import.meta.dirname, 'benchmarks/subday-axis.html') },
    },
    preview: { port: 4337, strictPort: true, proxy: {} },
  });
});
