import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

// Proof: an unused declaration in this root config made `core:lint` fail here
// with `@typescript-eslint/no-unused-vars`, proving the explicit lint input.
export default defineConfig({
  testDir: './testing',
  testMatch: 'portable-composition.spec.ts',
  outputDir: '../../../../tmp/core-portable-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['line'],
    ['junit', { outputFile: resolve(repoRoot, 'tmp/junit/wbs-core.browser.portable.xml') }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
