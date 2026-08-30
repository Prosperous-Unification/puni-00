// @vitest-environment node
//
// `vite-config.test.ts`'s reason, and the same regex reads this tag: importing
// the Playwright config pulls in `@playwright/test`, and a config module has no
// DOM to test. Kept beside that file rather than under `src/` because both are
// about a config at the root of this app rather than about the app.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The workspace root, which the config under test refuses to run outside of.
 *
 * Computed from this file rather than read from `process.cwd()`: the suite is
 * launched from the workspace root today, and a test that quietly depended on
 * that would fail for the next person who runs it from `apps/fe-01`.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface WebServerEntry {
  url: string;
  env?: Record<string, string>;
}

async function loadConfig(shift?: string) {
  vi.resetModules();
  if (shift === undefined) delete process.env['E2E_PORT_SHIFT'];
  else process.env['E2E_PORT_SHIFT'] = shift;
  const { default: config } = await import('./playwright.config');
  return config;
}

function serversOf(config: { webServer?: unknown }): WebServerEntry[] {
  const { webServer } = config;
  if (!Array.isArray(webServer)) throw new Error('the config starts no servers to assert on');
  return webServer as WebServerEntry[];
}

describe('the browser gate’s port shift', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(repoRoot);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['E2E_PORT_SHIFT'];
  });

  it('runs on the documented ports when nothing asks it to move', async () => {
    const servers = serversOf(await loadConfig());
    expect(servers.map((server) => server.url)).toEqual([
      'http://localhost:3100/health',
      'http://localhost:3200/health',
      'http://localhost:4200',
    ]);
  });

  it('moves all three tiers together, and every URL they hold about each other', async () => {
    // **Together** is the whole assertion. A shift that moved a listener
    // without moving what points at it boots three servers that cannot talk:
    // be-01 mints tokens for a gw-01 it cannot reach, and the failure arrives
    // forty seconds later as a socket that never opens rather than as a
    // misconfiguration. So the cross-tier URLs are asserted, not only the
    // ports.
    //
    // Proof: `GW_URL` dropped from be-01's env block, this failed on
    // `expected undefined to be 'http://localhost:3700'`; the `VITE_*`
    // block dropped from fe-01's, on the same shape. Watched, 2026-08-29.
    const servers = serversOf(await loadConfig('500'));
    // Or a config that started two servers would satisfy every assertion
    // below about the two it did start.
    expect(servers).toHaveLength(3);
    const [backend, gateway, frontend] = servers;
    expect(backend.url).toBe('http://localhost:3600/health');
    expect(backend.env?.['PORT']).toBe('3600');
    expect(backend.env?.['GW_URL']).toBe('http://localhost:3700');
    expect(gateway.url).toBe('http://localhost:3700/health');
    expect(gateway.env?.['PORT']).toBe('3700');
    expect(gateway.env?.['BE_URL']).toBe('http://localhost:3600');
    expect(frontend.url).toBe('http://localhost:4700');
    expect(frontend.env?.['PORT']).toBe('4700');
    expect(frontend.env?.['VITE_BE_URL']).toBe('http://localhost:3600');
    expect(frontend.env?.['VITE_GW_URL']).toBe('http://localhost:3700');
    expect(frontend.env?.['VITE_WS_URL']).toBe('ws://localhost:3700/ws');
  });

  it('points the browser at the frontend it actually started', async () => {
    const config = (await loadConfig('500')) as { use?: { baseURL?: string } };
    expect(config.use?.baseURL).toBe('http://localhost:4700');
  });

  it('refuses a shift it cannot use rather than reading it as zero', async () => {
    // Unknown is not OK (`AGENTS.md`, R5). A shift silently read as zero is a
    // run against whatever holds the usual ports — a dev server, or another
    // checkout — wearing the costume of an isolated one, which is the exact
    // fault the shift exists to end.
    //
    // Proof: the `Number.isInteger` guard replaced by `Number(asked) || 0`,
    // this failed on `promise resolved instead of rejecting`. Watched,
    // 2026-08-29.
    await expect(loadConfig('half')).rejects.toThrow('E2E_PORT_SHIFT');
    await expect(loadConfig('-1')).rejects.toThrow('E2E_PORT_SHIFT');
    await expect(loadConfig('1.5')).rejects.toThrow('E2E_PORT_SHIFT');
    await expect(loadConfig('10000')).rejects.toThrow('E2E_PORT_SHIFT');
  });

  it('gives each run a database of its own, under the workspace root', async () => {
    // Never `apps/be-01/local.db`: the specs sign up throwaway accounts and
    // write plans, and doing that to a developer's own dev database is how a
    // gate starts failing for one person only.
    const [backend] = serversOf(await loadConfig());

    expect(backend.env?.['DB_PATH']).toContain(join(repoRoot, 'tmp'));
  });
});
