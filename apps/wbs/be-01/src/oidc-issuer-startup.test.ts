import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test } from 'bun:test';

/**
 * Issue #669 F5: an issuer discovery could never reach used to boot and then
 * answer every request that reached the configured verifier with a 500. The
 * production entrypoint now refuses it before opening the database.
 */
for (const [label, issuer, refusal] of [
  ['a non-HTTPS', 'http://fixture-issuer.test/', 'AUTH_ISSUER_DISCOVERY_URL must be an https: URL'],
  ['an unparsable', 'fixture-issuer.test', 'AUTH_ISSUER_DISCOVERY_URL is not a URL'],
] as const) {
  test(`main.ts refuses ${label} OIDC issuer before process boot`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'wbs-oidc-issuer-startup-'));
    const dbPath = join(directory, 'not-created.db');
    try {
      const child = Bun.spawnSync([process.execPath, resolve(import.meta.dir, 'main.ts')], {
        cwd: resolve(import.meta.dir, '../../../..'),
        timeout: 15000,
        env: {
          // The source solver version, so boot reaches the OIDC composition
          // without an installed launcher.
          NODE_ENV: 'development',
          PORT: '0',
          DB_PATH: dbPath,
          HOSTNAME: '000000000000',
          INTERNAL_AUTH_SECRET: 'a'.repeat(32),
          LOG_LEVEL: 'error',
          GW_URL: 'http://gw.invalid',
          JWT_SIGNING_KEY_CURRENT: 'b'.repeat(32),
          AUTH_MODE: 'oidc',
          AUTH_ISSUER_DISCOVERY_URL: issuer,
          AUTH_CLIENT_ID: 'client',
          AUTH_CLIENT_SECRET: 'secret',
          AUTH_AUDIENCE: 'wbs-api',
          AUTH_REDIRECT_URI: 'http://localhost/api/auth/okta/callback',
          AUTH_METHODS: 'none',
          APP_ORIGIN: 'http://localhost',
          BROWSER_SESSION_AUTHORITY: 'enabled',
          ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS: '50',
          ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS: '200',
          ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE: '10000',
        },
      });
      // The refusal is logged as `be-01 failed to start`, on stdout.
      const output =
        new TextDecoder().decode(child.stdout) + new TextDecoder().decode(child.stderr);
      expect(output).toContain(refusal);
      expect(child.exitCode).not.toBe(0);
      expect(output).not.toContain('fixture-issuer');
      expect(existsSync(dbPath)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 20000);
}
