import { defineConfig, devices } from '@playwright/test';

/** The isolated suite selected only by the Performance level adapter. */
export default defineConfig({
  testDir: './e2e-performance',
  testMatch: /.*\.perf\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
});
