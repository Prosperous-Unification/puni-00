import { defineConfig, devices } from '@playwright/test';

/** A fresh composed SQLite backend and production gateway; no ordinary dev server reuse. */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'cross-project-refresh.real.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:7600' },
  webServer: [
    {
      cwd: process.cwd(),
      command: 'bun apps/wbs/be-01/src/testing/cross-project-browser-server.ts',
      url: 'http://localhost:7500/__fixture/ready',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      cwd: `${process.cwd()}/apps/wbs/fe-01`,
      command:
        'VITE_BE_URL=http://localhost:7500 VITE_GW_URL=http://localhost:7501 bunx vite --host localhost --port 7600 --strictPort',
      url: 'http://localhost:7600',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
