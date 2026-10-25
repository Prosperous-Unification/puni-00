import { defineConfig, devices } from '@playwright/test';

/** Isolated real-backend acceptance; ordinary route-stub browser tests remain separate. */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'organization-context.real.spec.ts',
  workers: 1,
  retries: 0,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:7400' },
  webServer: [
    {
      cwd: process.cwd(),
      command: 'bun apps/wbs/be-01/src/testing/organization-browser-server.ts --port 7300',
      // The fixture listens on IPv4 loopback only, and `localhost` may resolve to ::1 first,
      // so the health check and Vite's proxy name 127.0.0.1.
      url: 'http://127.0.0.1:7300/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command:
        'VITE_BE_URL=http://127.0.0.1:7300 VITE_GW_URL=http://localhost:7301 bunx vite --host localhost --port 7400 --strictPort',
      cwd: `${process.cwd()}/apps/wbs/fe-01`,
      url: 'http://localhost:7400',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
