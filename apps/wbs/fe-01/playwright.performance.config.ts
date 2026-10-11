import { defineConfig, devices } from '@playwright/test';

import { parseOrdinaryPortShift } from './playwright.ordinary-servers';

const portShift = parseOrdinaryPortShift(process.env['E2E_PORT_SHIFT'], true);

/** The isolated suite selected only by the Performance level adapter. */
// Proof: injecting `const injectedLintFault = ;` here made the owning
// wbs-fe-01:lint Nx target fail; direct ESLint named this file at 3:26.
export default defineConfig({
  testDir: './e2e-performance',
  testMatch: /.*\.perf\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${String(4200 + portShift)}`,
    viewport: { width: 1400, height: 900 },
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } },
    },
  ],
});
