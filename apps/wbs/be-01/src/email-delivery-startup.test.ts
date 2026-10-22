import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test } from 'bun:test';

for (const entrypoint of ['main.ts', 'dev/main.ts']) {
  test(`${entrypoint} refuses partial SMTP configuration before process boot`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'wbs-mail-startup-'));
    const dbPath = join(directory, 'not-created.db');
    try {
      const child = Bun.spawnSync([process.execPath, resolve(import.meta.dir, entrypoint)], {
        cwd: resolve(import.meta.dir, '../../../..'),
        timeout: 15000,
        env: {
          PORT: '0',
          DB_PATH: dbPath,
          INTERNAL_AUTH_SECRET: 'a'.repeat(32),
          LOG_LEVEL: 'error',
          GW_URL: 'http://gw.invalid',
          JWT_SIGNING_KEY_CURRENT: 'b'.repeat(32),
          AUTH_MODE: 'local',
          APP_ORIGIN: 'http://localhost',
          BROWSER_SESSION_AUTHORITY: 'disabled',
          ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS: '50',
          ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS: '200',
          ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE: '10000',
          WBS_SMTP_HOST: 'fixture-secret-host.test',
        },
      });
      const stderr = new TextDecoder().decode(child.stderr);
      expect(child.exitCode).not.toBe(0);
      expect(stderr).toContain('invalid email delivery configuration');
      expect(stderr).not.toContain('fixture-secret-host.test');
      expect(existsSync(dbPath)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 20000);
}
