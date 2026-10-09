import { defineConfig, devices } from '@playwright/test';

/** The isolated suite selected only by the Performance level adapter. */
// Proof: injecting `const injectedLintFault = ;` here made the owning
// wbs-fe-01:lint Nx target fail; direct ESLint named this file at 3:26.
export default defineConfig({
  testDir: './e2e-performance',
  testMatch: /.*\.perf\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
});
