import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

import { parseOrdinaryPortShift } from './playwright.ordinary-servers';

/** Collection validates only the checkout; the startup wrapper owns fresh database allocation. */
const repoRoot = process.cwd();
if (!existsSync(join(repoRoot, 'apps', 'wbs', 'fe-01', 'playwright.local.config.ts'))) {
  throw new Error(
    'The local quiet-load profile must run from the workspace root; use nx run wbs-fe-01:e2e-local',
  );
}
const isCi = process.env['CI'] !== undefined;
const portShift = parseOrdinaryPortShift(process.env['E2E_PORT_SHIFT']);
const bePort = 3100 + portShift;
const gwPort = 3200 + portShift;
const fePort = 4200 + portShift;
const beUrl = `http://localhost:${String(bePort)}`;
const gwUrl = `http://localhost:${String(gwPort)}`;
const feUrl = `http://localhost:${String(fePort)}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: 'quiet-load.spec.ts',
  outputDir: './test-results-local',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCi,
  retries: 0,
  timeout: isCi ? 120_000 : 60_000,
  expect: { timeout: isCi ? 30_000 : 10_000 },
  reporter: isCi
    ? [
        ['list'],
        ['html', { outputFolder: 'playwright-report-local', open: 'never' }],
        ['junit', { outputFile: join(repoRoot, 'tmp', 'junit', 'wbs-fe-01.browser.local.xml') }],
      ]
    : [
        ['list'],
        ['junit', { outputFile: join(repoRoot, 'tmp', 'junit', 'wbs-fe-01.browser.local.xml') }],
      ],
  use: {
    baseURL: feUrl,
    locale: 'en-US',
    timezoneId: 'UTC',
    launchOptions: { args: ['--lang=en-US'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'bun src/testing/local-browser-server.ts',
      cwd: join(repoRoot, 'apps', 'wbs', 'be-01'),
      url: `${beUrl}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'development',
        AUTH_MODE: 'local',
        BROWSER_SESSION_AUTHORITY: 'disabled',
        APP_ORIGIN: feUrl,
        PORT: String(bePort),
        GW_URL: gwUrl,
        HOSTNAME: 'e2e000000001',
        LOG_LEVEL: 'error',
        JWT_SIGNING_KEY_CURRENT: 'test-jwt-signing-key-at-least-32-chars',
        INTERNAL_AUTH_SECRET: 'local-internal-secret-0123456789abcdef',
        ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS: '50',
        ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS: '200',
        ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE: '10000',
        MCP_BE_INTERNAL_SECRET: 'mcp-secret-0123456789abcdefghijklmn',
        WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT: 'grant-key-g-0123456789abcdefghijklmn',
        WBS_MCP_AUTHORIZATION_SERVER: 'https://wbs.example/mcp/oauth',
        SOLVER_BUDGET_MS: '60000',
        SOLVER_SEARCH_WORKERS: '2',
        SOLVER_MEMORY_LIMIT_MB: '512',
      },
    },
    {
      command: 'bun src/main.ts',
      cwd: join(repoRoot, 'apps', 'wbs', 'gw-01'),
      url: `${gwUrl}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        AUTH_MODE: 'local',
        PORT: String(gwPort),
        BE_URL: beUrl,
        LOG_LEVEL: 'error',
        JWT_SIGNING_KEY_CURRENT: 'test-jwt-signing-key-at-least-32-chars',
        INTERNAL_AUTH_SECRET: 'local-internal-secret-0123456789abcdef',
      },
    },
    {
      command: 'bun ordinary-browser-frontend.ts',
      cwd: join(repoRoot, 'apps', 'wbs', 'fe-01'),
      url: feUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: String(fePort),
        VITE_BE_URL: beUrl,
        VITE_GW_URL: gwUrl,
        VITE_WS_URL: `ws://localhost:${String(gwPort)}/ws`,
      },
    },
  ],
});
