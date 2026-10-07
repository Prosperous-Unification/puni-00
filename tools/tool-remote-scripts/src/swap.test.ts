import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { assembleCaddyfile } from './lib/caddy';
import {
  capacityModesCommand,
  holdKindsCommand,
  readinessKindsCommand,
  relationshipTypesCommand,
  storedCapacityModesCommand,
  storedHoldsCommand,
  storedReadinessesCommand,
  storedRelationshipTypesCommand,
} from './lib/docker';
import { drain } from './lib/drain';
import { type EnvLayout, envLayout } from './lib/env';
import { waitForHealthy } from './lib/health';
import { flipColor, parseStateJson, renderStateJson } from './lib/state';
import {
  execute,
  isFileAbsent,
  parseRecordedColor,
  parseTierList,
  pollActiveConnections,
  readMcpExposure,
  readSiteCaddy,
  runSwaps,
  shouldRestoreSiteCaddy,
  startGreen,
  type StartGreenDeps,
  type SwapExecutionIo,
  type SwapRunDeps,
} from './swap';

describe('state', () => {
  it('flips color', () => {
    expect(flipColor('blue')).toBe('green');
    expect(flipColor('green')).toBe('blue');
  });

  it('parses + renders state json round-trip', () => {
    const s = { tier: 'be' as const, lastDeployedSha: 'abc', activeColor: 'blue' as const };
    const round = parseStateJson(renderStateJson(s));
    expect(round).toEqual(s);
  });

  it('rejects invalid tier', () => {
    expect(() => parseStateJson('{"tier":"xx","activeColor":"blue"}')).toThrow(/tier/);
  });
});

describe('caddy.assembleCaddyfile', () => {
  it('orders fragments be → gw → fe → observability', () => {
    const out = assembleCaddyfile([
      { tier: 'observability', content: 'OBS' },
      { tier: 'fe', content: 'FE' },
      { tier: 'be', content: 'BE' },
      { tier: 'gw', content: 'GW' },
    ]);
    const idxBe = out.indexOf('BE');
    const idxGw = out.indexOf('GW');
    const idxFe = out.indexOf('FE');
    const idxObs = out.indexOf('OBS');
    expect(idxBe).toBeLessThan(idxGw);
    expect(idxGw).toBeLessThan(idxFe);
    expect(idxFe).toBeLessThan(idxObs);
  });
});

describe('health.waitForHealthy', () => {
  it('returns true once fetch succeeds', async () => {
    let n = 0;
    const ok = await waitForHealthy({
      url: 'http://example',
      timeoutMs: 10,
      attempts: 3,
      intervalMs: 1,
      fetchImpl: (() => {
        n++;
        if (n < 2) return Promise.reject(new Error('boom'));
        return Promise.resolve(new Response('ok', { status: 200 }));
      }) as unknown as typeof fetch,
    });
    expect(ok).toBe(true);
  });

  it('returns false when all attempts fail', async () => {
    const ok = await waitForHealthy({
      url: 'http://example',
      timeoutMs: 10,
      attempts: 2,
      intervalMs: 1,
      fetchImpl: (() => Promise.reject(new Error('down'))) as unknown as typeof fetch,
    });
    expect(ok).toBe(false);
  });

  // fe-01 is a static file server: a truncated/empty index.html still
  // returns 200, so a status-only check would pass a broken deploy. Design
  // decision 5 requires asserting a non-empty body too.
  it('rejects a 200 whose body fails an optional isHealthy predicate', async () => {
    const ok = await waitForHealthy({
      url: 'http://example',
      timeoutMs: 10,
      attempts: 2,
      intervalMs: 1,
      isHealthy: (body) => body.length > 0,
      fetchImpl: (() =>
        Promise.resolve(new Response('', { status: 200 }))) as unknown as typeof fetch,
    });
    expect(ok).toBe(false);
  });

  it('accepts once the body starts satisfying the predicate', async () => {
    let n = 0;
    const ok = await waitForHealthy({
      url: 'http://example',
      timeoutMs: 10,
      attempts: 3,
      intervalMs: 1,
      isHealthy: (body) => body.length > 0,
      fetchImpl: (() => {
        n++;
        return Promise.resolve(new Response(n < 2 ? '' : '<html>ok</html>', { status: 200 }));
      }) as unknown as typeof fetch,
    });
    expect(ok).toBe(true);
  });

  it('leaves be-01/gw-01-style callers unchanged when isHealthy is not provided', async () => {
    // Same body as the rejected case above, but with no predicate: status
    // alone must still be sufficient, exactly as before this change.
    const ok = await waitForHealthy({
      url: 'http://example',
      timeoutMs: 10,
      attempts: 1,
      intervalMs: 1,
      fetchImpl: (() =>
        Promise.resolve(new Response('', { status: 200 }))) as unknown as typeof fetch,
    });
    expect(ok).toBe(true);
  });
});

// Finding I2: activeConnections used to be a bare `fetch` with no deadline,
// so a wedged gw-01 could hold `drain`'s poll (and the deploy lock) for
// however long the OS's own TCP timeout is. `pollActiveConnections` is the
// testable, timed core of it — same AbortController + setTimeout shape as
// lib/health.ts's waitForHealthy and tool-smoke/src/health.ts's
// fetchWithTimeout.
describe('pollActiveConnections', () => {
  it('returns the real count on a healthy JSON response', async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ activeConnections: 3 }), { status: 200 }),
      )) as unknown as typeof fetch;
    expect(await pollActiveConnections('http://x', fetchImpl)).toBe(3);
  });

  it('returns 0 (not "cannot determine") for a 200 response missing the field', async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(JSON.stringify({}), { status: 200 }),
      )) as unknown as typeof fetch;
    expect(await pollActiveConnections('http://x', fetchImpl)).toBe(0);
  });

  // The core of the fix: a fetch that never settles unless its AbortSignal
  // fires must not hang the drain loop forever, and must not be mistaken
  // for "drained" (0) — that would let the swap proceed to stop-blue while
  // gw-01 might still hold real connections.
  it('treats a hung request as "cannot determine, keep draining" (Infinity), not drained (0)', async () => {
    const fetchImpl = ((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      })) as unknown as typeof fetch;
    const start = Date.now();
    const n = await pollActiveConnections('http://x', fetchImpl, 20);
    expect(n).toBe(Infinity);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('treats a network error the same way — Infinity, not 0', async () => {
    const fetchImpl = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch;
    expect(await pollActiveConnections('http://x', fetchImpl)).toBe(Infinity);
  });

  it('treats a non-OK response as "cannot determine" rather than trusting its body', async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ activeConnections: 0 }), { status: 503 }),
      )) as unknown as typeof fetch;
    expect(await pollActiveConnections('http://x', fetchImpl)).toBe(Infinity);
  });

  // Feeds straight into drain()'s own semantics: Infinity must never look
  // drained.
  it('a poll that always times out never lets drain() report drained', async () => {
    const fetchImpl = ((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      })) as unknown as typeof fetch;
    const r = await drain({
      activeConnections: () => pollActiveConnections('http://x', fetchImpl, 5),
      maxWaitMs: 30,
      pollMs: 1,
      sleep: () => Promise.resolve(),
    });
    expect(r.drained).toBe(false);
  });
});

describe('drain', () => {
  it('returns drained when connection count reaches zero', async () => {
    let n = 3;
    const r = await drain({
      activeConnections: () => Math.max(0, --n),
      maxWaitMs: 1000,
      pollMs: 1,
      sleep: () => Promise.resolve(),
    });
    expect(r.drained).toBe(true);
  });

  it('gives up after maxWait', async () => {
    const r = await drain({
      activeConnections: () => 5,
      maxWaitMs: 5,
      pollMs: 1,
      sleep: () => Promise.resolve(),
    });
    expect(r.drained).toBe(false);
  });
});

describe('readSiteCaddy', () => {
  let dir: string;
  beforeEach(() => {
    dir = scratchSync('wbs-swap-');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the file does not exist (first deploy, or unreadable)', async () => {
    expect(await readSiteCaddy(join(dir, 'missing.caddy'))).toBeNull();
  });

  it('returns the contents of a file that is present and non-empty', async () => {
    const p = join(dir, 'site.caddy');
    writeFileSync(p, 'import site.caddy contents');
    expect(await readSiteCaddy(p)).toBe('import site.caddy contents');
  });

  it('returns an empty string, not null, for a file that is present but empty', async () => {
    // Distinguishing this from "not there" is the whole point of the fix:
    // both must be treated as "nothing to restore" by shouldRestoreSiteCaddy,
    // but readSiteCaddy itself must still tell the truth about which one it
    // saw, since only the "not there" case is safe to also skip *why* — the
    // empty-but-present case can point at a real problem worth investigating.
    const p = join(dir, 'empty.caddy');
    writeFileSync(p, '');
    expect(await readSiteCaddy(p)).toBe('');
  });
});

// This is the abortSwap guard that was the subject of the post-fix-wave
// review's Important finding: readSiteCaddy() used to swallow every error to
// `''`, so `siteTextBefore` was never `null`, and abortSwap's old
// `siteTextBefore !== null` check always passed — including for a swap where
// there was never a previous site.caddy to restore. Since
// `/home/puni1/wbs/caddy/Caddyfile` does a bare `import site.caddy`, writing that
// empty/absent state back out as a real file produces a Caddy config with NO
// servers in it: the app site AND the registry block both go down, and the
// empty file is a landmine for the next Caddy restart.
//
// Non-vacuity, checked by hand and recorded here rather than only asserted:
// reverting the guard to the pre-fix `siteTextBefore !== null` (i.e. dropping
// the `siteTextBefore.length > 0` half of the condition) makes the
// 'skips restore when previous contents are empty' case below return `true`
// instead of `false`, and the test fails with
// `expect(received).toBe(expected) — Expected: false, Received: true`.
// Restoring the real guard makes it pass again. See the report for the
// transcript.
describe('shouldRestoreSiteCaddy (abortSwap restore guard)', () => {
  it('skips restore when previous contents are null (missing or unreadable)', () => {
    expect(shouldRestoreSiteCaddy(null)).toBe(false);
  });

  it('skips restore when previous contents are empty (present but empty file)', () => {
    expect(shouldRestoreSiteCaddy('')).toBe(false);
  });

  it('restores when previous contents are a real, non-empty config', () => {
    expect(shouldRestoreSiteCaddy('import site.caddy\n')).toBe(true);
  });
});

// `planSwap`/`describePlan` used to live here, hardcoding `activeColor: 'blue'`
// and never touching real Docker or Caddy. Task 9 replaced them: the real
// planner is `planSwap` in `./lib/reconcile.ts` (tested in
// `./lib/reconcile.test.ts`), and this file's `swap.ts` is now the IO shell
// that executes its plan — its pure command builders and parsers live in
// `./lib/docker.ts` and `./lib/site.ts` (tested in `docker.test.ts` and
// `site.test.ts`).

// I1: swap.js took the deploy lock once per tier, but tool-deploy drove a
// multi-tier deploy as one SSH invocation per tier. The lock was therefore
// released between tiers, and two concurrent `--all` deploys could interleave
// into a mismatched stack (be from run A, gw from run B). One invocation now
// carries every tier of a run, so the lock spans the whole run.
describe('parseTierList', () => {
  it('accepts a single tier', () => {
    expect(parseTierList('be')).toEqual(['be']);
  });

  it('accepts a comma-separated list, preserving deploy order', () => {
    expect(parseTierList('be,gw,fe')).toEqual(['be', 'gw', 'fe']);
  });

  it('rejects an unknown tier', () => {
    expect(() => parseTierList('be,xx')).toThrow(/unknown tier/);
  });

  it('rejects an empty list', () => {
    expect(() => parseTierList('')).toThrow(/at least one tier/);
  });

  // A repeated tier would swap the same tier twice inside one lock hold: the
  // second pass observes the colour the first just moved to and swaps it
  // straight back, so the run ends where it started while reporting success.
  it('rejects a repeated tier', () => {
    expect(() => parseTierList('be,gw,be')).toThrow(/repeated tier/);
  });
});

describe('startGreen env preflight', () => {
  const OIDC_ENV_PATH = '/fixture/oidc-dev.env';
  const IMAGE = 'registry.infra.bulletpoints.club/wbs-be-01@sha256:' + 'a'.repeat(64);
  const APP_ENV =
    'PORT=3100\nLOG_LEVEL=info\nGW_URL=http://gw-01:3200\n' +
    'DB_PATH=/data/wbs.db\nAUTH_MODE=oidc\n';

  async function rejectedPreflight(
    readOidc: () => Promise<string>,
  ): Promise<{ events: string[]; message: string }> {
    const events: string[] = [];
    const deps: StartGreenDeps = {
      oidcEnvPath: OIDC_ENV_PATH,
      readText: (path) => {
        if (path.endsWith('/be-01.env')) {
          events.push('read:app');
          return Promise.resolve(APP_ENV);
        }
        if (path === OIDC_ENV_PATH) {
          events.push('read:oidc');
          return readOidc();
        }
        events.push(`read:other:${path}`);
        return Promise.resolve('INTERNAL_AUTH_SECRET=x\nJWT_SIGNING_KEY_CURRENT=y\n');
      },
      writePhaseFile: (_path, phase) => {
        events.push(`phase:${phase}`);
        return Promise.resolve();
      },
      writeAtomicFile: (path) => {
        events.push(`write:${path}`);
        return Promise.resolve();
      },
      runDocker: (args) => {
        events.push(`docker:${args.join(' ')}`);
        return Promise.resolve('');
      },
    };

    let message = '';
    try {
      await startGreen('be', 'green', IMAGE, '/fixture/be.phase', deps);
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }
    return { events, message };
  }

  it('rejects a missing OIDC file before phase, Compose, or routing can change', async () => {
    const { events, message } = await rejectedPreflight(() =>
      Promise.reject(Object.assign(new Error('no such file'), { code: 'ENOENT' })),
    );
    expect(message).toContain('no such file');
    expect(events).toEqual(['read:app', 'read:oidc']);
  });

  it('rejects an unreadable OIDC file before phase, Compose, or routing can change', async () => {
    const { events, message } = await rejectedPreflight(() =>
      Promise.reject(Object.assign(new Error('permission denied'), { code: 'EACCES' })),
    );
    expect(message).toContain('permission denied');
    expect(events).toEqual(['read:app', 'read:oidc']);
  });

  it('rejects an extra OIDC key before phase, Compose, or routing can change', async () => {
    const { events, message } = await rejectedPreflight(() =>
      Promise.resolve(
        'AUTH_CLIENT_ID=expected-client\n' + 'PORT=should-not-override-the-app-config\n',
      ),
    );
    expect(message).toContain('PORT');
    expect(message).not.toContain('expected-client');
    expect(message).not.toContain('should-not-override-the-app-config');
    expect(events).toEqual(['read:app', 'read:oidc']);
  });
});

const COMPLETE_OIDC_ENV =
  'AUTH_ISSUER_DISCOVERY_URL=https://issuer.example/\nAUTH_CLIENT_ID=client\n' +
  'AUTH_CLIENT_SECRET=client-secret-value\n' +
  'AUTH_REDIRECT_URI=https://wbs.example/api/auth/okta/callback\nAUTH_AUDIENCE=https://api.example\n';

describe('startGreen required-key preflight', () => {
  const OIDC_ENV_PATH = '/fixture/oidc.env';
  const IMAGES = {
    be: 'registry.infra.bulletpoints.club/wbs-be-01@sha256:' + 'a'.repeat(64),
    gw: 'registry.infra.bulletpoints.club/wbs-gw-01@sha256:' + 'a'.repeat(64),
  } as const;
  const APP_ENV = {
    be: 'PORT=3100\nLOG_LEVEL=info\nGW_URL=http://gw-01:3200\nDB_PATH=/data/wbs.db\nAUTH_MODE=oidc\n',
    gw: 'PORT=3200\nLOG_LEVEL=info\nBE_URL=http://be-01.internal:3100\nAUTH_MODE=oidc\n',
  } as const;
  const SHARED_ENV =
    'INTERNAL_AUTH_SECRET=shared-internal-secret-value-of-32-chars\nJWT_SIGNING_KEY_CURRENT=signing-key-value-at-least-32-characters\n';

  async function runStartGreen(
    tier: 'be' | 'gw',
    files: { app?: string; shared?: string; oidc?: string; oidcEnvPath?: string | null },
  ): Promise<{ events: string[]; message: string }> {
    const events: string[] = [];
    const deps: StartGreenDeps = {
      oidcEnvPath: files.oidcEnvPath === undefined ? OIDC_ENV_PATH : files.oidcEnvPath,
      readText: (path) => {
        if (path.endsWith(`/${tier}-01.env`)) {
          events.push('read:app');
          return Promise.resolve(files.app ?? APP_ENV[tier]);
        }
        if (path === OIDC_ENV_PATH) {
          events.push('read:oidc');
          return Promise.resolve(files.oidc ?? COMPLETE_OIDC_ENV);
        }
        events.push('read:shared');
        return Promise.resolve(files.shared ?? SHARED_ENV);
      },
      writePhaseFile: (_path, phase) => {
        events.push(`phase:${phase}`);
        return Promise.resolve();
      },
      writeAtomicFile: (path) => {
        events.push(`write:${path.split('/').pop() ?? path}`);
        return Promise.resolve();
      },
      runDocker: () => {
        events.push('docker');
        return Promise.resolve('');
      },
    };
    let message = '';
    try {
      await startGreen(tier, 'green', IMAGES[tier], `/fixture/${tier}.phase`, deps);
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }
    return { events, message };
  }

  const READS_ONLY = ['read:app', 'read:oidc', 'read:shared'];

  it('admits complete be and gw env files and reaches Docker', async () => {
    for (const tier of ['be', 'gw'] as const) {
      const { events, message } = await runStartGreen(tier, {});
      expect(message).toBe('');
      expect(events).toContain('phase:preparing');
      expect(events.at(-1)).toBe('docker');
    }
  });

  it('refuses a be env file without GW_URL before any side effect, naming key and file', async () => {
    const { events, message } = await runStartGreen('be', {
      app: APP_ENV.be.replace('GW_URL=http://gw-01:3200\n', ''),
    });
    expect(message).toContain('GW_URL (/home/puni1/wbs/be-01.env)');
    expect(events).toEqual(READS_ONLY);
  });

  it('refuses an empty required value as missing', async () => {
    const { events, message } = await runStartGreen('gw', {
      app: APP_ENV.gw.replace('BE_URL=http://be-01.internal:3100', 'BE_URL='),
    });
    expect(message).toContain('BE_URL (/home/puni1/wbs/gw-01.env)');
    expect(events).toEqual(READS_ONLY);
  });

  it('refuses a shared env without the signing key, naming every missing key and no value', async () => {
    const { events, message } = await runStartGreen('gw', {
      app: APP_ENV.gw.replace('LOG_LEVEL=info\n', ''),
      shared: 'INTERNAL_AUTH_SECRET=shared-internal-secret-value-of-32-chars\n',
    });
    expect(message).toContain('LOG_LEVEL (/home/puni1/wbs/gw-01.env)');
    expect(message).toContain('JWT_SIGNING_KEY_CURRENT (/home/puni1/wbs/.env)');
    expect(message).not.toContain('shared-internal-secret-value-of-32-chars');
    expect(events).toEqual(READS_ONLY);
  });

  it('refuses an OIDC carrier without AUTH_AUDIENCE', async () => {
    const { events, message } = await runStartGreen('be', {
      oidc: COMPLETE_OIDC_ENV.replace('AUTH_AUDIENCE=https://api.example\n', ''),
    });
    expect(message).toContain(`AUTH_AUDIENCE (${OIDC_ENV_PATH})`);
    expect(message).not.toContain('client-secret-value');
    expect(events).toEqual(READS_ONLY);
  });

  it('refuses a 20-character signing key without printing it', async () => {
    const { events, message } = await runStartGreen('be', {
      shared: SHARED_ENV.replace(
        'signing-key-value-at-least-32-characters',
        'august-key-20-chars!',
      ),
    });
    expect(message).toContain(
      'JWT_SIGNING_KEY_CURRENT (/home/puni1/wbs/.env) must be at least 32 characters',
    );
    expect(message).not.toContain('august-key-20-chars!');
    expect(events).toEqual(READS_ONLY);
  });

  it('refuses a quoted empty secret that Compose would deliver empty', async () => {
    const { events, message } = await runStartGreen('gw', {
      shared: SHARED_ENV.replace('signing-key-value-at-least-32-characters', '""'),
    });
    expect(message).toContain('JWT_SIGNING_KEY_CURRENT (/home/puni1/wbs/.env) is quoted');
    expect(events).toEqual(READS_ONLY);
  });

  it('refuses a non-integer PORT and an unknown LOG_LEVEL', async () => {
    const { events, message } = await runStartGreen('gw', {
      app: APP_ENV.gw
        .replace('PORT=3200', 'PORT=32o0')
        .replace('LOG_LEVEL=info', 'LOG_LEVEL=verbose'),
    });
    expect(message).toContain('PORT (/home/puni1/wbs/gw-01.env) must be an integer');
    expect(message).toContain('LOG_LEVEL (/home/puni1/wbs/gw-01.env) must be one of');
    expect(events).toEqual(READS_ONLY);
  });

  it('refuses an empty optional signing key that gw would refuse', async () => {
    const { events, message } = await runStartGreen('gw', {
      shared: `${SHARED_ENV}JWT_SIGNING_KEY_PREVIOUS=\n`,
    });
    expect(message).toContain('JWT_SIGNING_KEY_PREVIOUS (/home/puni1/wbs/.env)');
    expect(events).toEqual(READS_ONLY);
  });

  it('refuses a PORT with a leading zero', async () => {
    const { events, message } = await runStartGreen('be', {
      app: APP_ENV.be.replace('PORT=3100', 'PORT=0100'),
    });
    expect(message).toContain('PORT (/home/puni1/wbs/be-01.env) must be an integer');
    expect(events).toEqual(READS_ONLY);
  });

  it('refuses AUTH_MODE=local, which the production image cannot boot', async () => {
    const { events, message } = await runStartGreen('be', {
      app: APP_ENV.be.replace('AUTH_MODE=oidc', 'AUTH_MODE=local'),
    });
    expect(message).toContain('AUTH_MODE=local');
    expect(message).toContain('NODE_ENV=production');
    expect(events).toEqual(READS_ONLY);
  });

  it('refuses AUTH_MODE=oidc in a layout with no OIDC carrier', async () => {
    const { events, message } = await runStartGreen('gw', { oidcEnvPath: null });
    expect(message).toContain('names no OIDC carrier');
    expect(events).toEqual(['read:app', 'read:shared']);
  });

  it('refuses an env file without AUTH_MODE', async () => {
    const { events, message } = await runStartGreen('be', {
      app: APP_ENV.be.replace('AUTH_MODE=oidc\n', ''),
    });
    expect(message).toContain('AUTH_MODE (/home/puni1/wbs/be-01.env)');
    expect(events).toEqual(READS_ONLY);
  });
});

describe('runSwaps', () => {
  function fakeRunDeps(overrides: Partial<SwapRunDeps> = {}): SwapRunDeps {
    return {
      withLock: (_path, fn) => fn(),
      observe: () =>
        Promise.resolve({
          routedColor: 'blue' as const,
          runningColors: ['blue' as const],
          recordedColor: 'blue' as const,
          phase: 'committed' as const,
        }),
      execute: () => Promise.resolve(),
      ...overrides,
    };
  }

  it('takes the lock exactly once for a three-tier run', async () => {
    let locks = 0;
    const deps = fakeRunDeps({
      withLock: (_path, fn) => {
        locks++;
        return fn();
      },
    });
    await runSwaps(['be', 'gw', 'fe'], { be: 'img-be', gw: 'img-gw', fe: 'img-fe' }, 'sha1', deps);
    expect(locks).toBe(1);
  });

  it('executes every tier in the order given, inside that one lock', async () => {
    const events: string[] = [];
    const deps = fakeRunDeps({
      withLock: async (_path, fn) => {
        events.push('lock');
        const r = await fn();
        events.push('unlock');
        return r;
      },
      execute: (plan) => {
        events.push(`execute:${plan.tier}`);
        return Promise.resolve();
      },
    });
    await runSwaps(['be', 'gw', 'fe'], { be: 'img-be', gw: 'img-gw', fe: 'img-fe' }, 'sha1', deps);
    expect(events).toEqual(['lock', 'execute:be', 'execute:gw', 'execute:fe', 'unlock']);
  });

  it('passes each tier its own image', async () => {
    const seen: string[] = [];
    const deps = fakeRunDeps({
      execute: (_plan, image) => {
        seen.push(image);
        return Promise.resolve();
      },
    });
    await runSwaps(['be', 'fe'], { be: 'img-be', fe: 'img-fe' }, 'sha1', deps);
    expect(seen).toEqual(['img-be', 'img-fe']);
  });

  // A failure partway through must not silently continue into the next tier:
  // the whole point of one lock is that the run is one unit.
  it('stops at the first failing tier and does not start the next', async () => {
    const started: string[] = [];
    const deps = fakeRunDeps({
      execute: (plan) => {
        started.push(plan.tier);
        return plan.tier === 'gw' ? Promise.reject(new Error('gw blew up')) : Promise.resolve();
      },
    });
    let message = '';
    try {
      await runSwaps(['be', 'gw', 'fe'], { be: 'b', gw: 'g', fe: 'f' }, 'sha1', deps);
    } catch (e: unknown) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toMatch(/gw blew up/);
    expect(started).toEqual(['be', 'gw']);
  });

  // Each tier is observed after the previous tier's swap committed, not all
  // up front: `be`'s swap changes what `gw` should be planned against.
  it('observes each tier after the previous tier finished', async () => {
    const events: string[] = [];
    const deps = fakeRunDeps({
      observe: (tier) => {
        events.push(`observe:${tier}`);
        return Promise.resolve({
          routedColor: 'blue' as const,
          runningColors: ['blue' as const],
          recordedColor: 'blue' as const,
          phase: 'committed' as const,
        });
      },
      execute: (plan) => {
        events.push(`execute:${plan.tier}`);
        return Promise.resolve();
      },
    });
    await runSwaps(['be', 'gw'], { be: 'b', gw: 'g' }, 'sha1', deps);
    expect(events).toEqual(['observe:be', 'execute:be', 'observe:gw', 'execute:gw']);
  });
});

describe('parseRecordedColor', () => {
  it('reads the recorded colour from a well-formed state file', () => {
    const raw = JSON.stringify({ tier: 'be', activeColor: 'green', lastDeployedSha: 'abc' });
    expect(parseRecordedColor('/srv/state/be.json', raw)).toBe('green');
  });

  // Absent and unreadable used to collapse to the same null, and null means
  // "never deployed" to resolveLiveColor — so an unopenable file read as a
  // fresh install and the planner would pick a colour that may be serving.
  it('refuses a malformed state file rather than reporting no colour', () => {
    expect(() => parseRecordedColor('/srv/state/be.json', '{not json')).toThrow(
      /not valid state JSON/,
    );
  });

  it('refuses an empty state file', () => {
    expect(() => parseRecordedColor('/srv/state/be.json', '')).toThrow(/not valid state JSON/);
  });

  it('refuses JSON that is valid but is not a state record', () => {
    expect(() => parseRecordedColor('/srv/state/be.json', '{"hello":"world"}')).toThrow(
      /not valid state JSON/,
    );
  });
});

describe('isFileAbsent', () => {
  it('recognises ENOENT, the one case a missing state file is allowed', () => {
    expect(isFileAbsent(Object.assign(new Error('no such file'), { code: 'ENOENT' }))).toBe(true);
  });

  it('does not treat a permission error as absence', () => {
    // Verified against Bun on 2026-08-05: a missing file throws code ENOENT and
    // an unreadable one EACCES, so the distinction this relies on is real.
    expect(isFileAbsent(Object.assign(new Error('permission denied'), { code: 'EACCES' }))).toBe(
      false,
    );
  });

  it('does not treat a non-errno value as absence', () => {
    expect(isFileAbsent(new Error('something else'))).toBe(false);
    expect(isFileAbsent(null)).toBe(false);
  });
});

/**
 * The marker reader is the whole cutover seam, and until now nothing exercised
 * it: the environment branch, the ENOENT tolerance and the unreadable-file
 * refusal were all reachable only from a real swap on a real host. `CURRENT_ENV`
 * is frozen at import, so the layout parameter is the only seam a unit test can
 * drive — the same `layout: EnvLayout = CURRENT_ENV` shape `containerName` and
 * `tierEnvFiles` already use in lib/docker.ts.
 */
describe('readMcpExposure', () => {
  let dir: string;
  beforeEach(() => {
    dir = scratchSync('wbs-mcp-exposure-');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const at = (env: 'prod' | 'dev'): EnvLayout => ({ ...envLayout(env), stateDir: dir });

  it('never reads a marker in prod, even when an enabled one is sitting there', async () => {
    // Not merely "prod returns false": the marker is present and enabled, so a
    // reader that dropped the environment branch would return true here.
    writeFileSync(join(dir, 'mcp-exposure'), 'enabled\n');
    expect(await readMcpExposure(at('prod'))).toBe(false);
  });

  it('never reads the marker path in prod, not even to discard what it read', async () => {
    // Fable round-3 Minor 1: the test above cannot tell "never reads" from
    // "reads, then discards". A directory at the marker path throws EISDIR on
    // any read at all, so this fails the moment the environment branch moves
    // below the read — which would abort a PROD swap on a prod-path marker
    // that prod has no business consulting.
    mkdirSync(join(dir, 'mcp-exposure'));
    expect(await readMcpExposure(at('prod'))).toBe(false);
  });

  it('treats an absent dev marker as pre-cutover rather than an error', async () => {
    expect(await readMcpExposure(at('dev'))).toBe(false);
  });

  it('reads an enabled dev marker as exposed', async () => {
    writeFileSync(join(dir, 'mcp-exposure'), 'enabled\n');
    expect(await readMcpExposure(at('dev'))).toBe(true);
  });

  it('refuses a malformed dev marker instead of quietly dropping the surface', async () => {
    writeFileSync(join(dir, 'mcp-exposure'), 'disabled\n');
    let threw = false;
    try {
      await readMcpExposure(at('dev'));
    } catch (e: unknown) {
      threw = true;
      expect(e instanceof Error && e.message).toMatch(/refusing to rewrite the dev vhost/);
      expect(e instanceof Error && e.message).toMatch(/malformed MCP exposure state/);
    }
    expect(threw).toBe(true);
  });

  it('refuses a permission-denied dev marker, the shape a mode-600 marker fails in', async () => {
    // Fable round-3 Minor 2: EISDIR alone leaves a narrower loosening alive —
    // `isFileAbsent(e) || e.code === 'EACCES'` bypasses isFileAbsent entirely
    // and survives every other test here. The real marker is installed mode
    // 600, so EACCES is its realistic unreadable shape.
    if (process.getuid?.() === 0) return; // root ignores mode bits
    const marker = join(dir, 'mcp-exposure');
    writeFileSync(marker, 'enabled\n');
    chmodSync(marker, 0o000);
    let threw = false;
    try {
      await readMcpExposure(at('dev'));
    } catch (e: unknown) {
      threw = true;
      expect(e instanceof Error && e.message).toMatch(/cannot read/);
    }
    expect(threw).toBe(true);
  });

  it('refuses an unreadable dev marker rather than reading it as absent', async () => {
    // A directory in the marker's place throws EISDIR, not ENOENT: the one
    // distinction `isFileAbsent` exists to make. Reading this as absent would
    // delete the reviewed public surface on the next swap.
    mkdirSync(join(dir, 'mcp-exposure'));
    let threw = false;
    try {
      await readMcpExposure(at('dev'));
    } catch (e: unknown) {
      threw = true;
      expect(e instanceof Error && e.message).toMatch(/cannot read/);
    }
    expect(threw).toBe(true);
  });
});

it('startGreen admits merged backend config and writes the supervisor directory mount before Docker', async () => {
  const written = new Map<string, string>();
  let started = false;
  await startGreen(
    'be',
    'green',
    'registry.infra.bulletpoints.club/wbs-be-01@sha256:' + 'a'.repeat(64),
    '/fixture/be.phase',
    {
      oidcEnvPath: '/fixture/oidc.env',
      readText: (path) =>
        Promise.resolve(
          path.endsWith('/be-01.env')
            ? 'PORT=3100\nLOG_LEVEL=error\nGW_URL=http://gw\nDB_PATH=/data/wbs.db\nAUTH_MODE=oidc\nAPP_ORIGIN=https://operator.example\nSOLVER_BUDGET_MS=120000\nSOLVER_SEARCH_WORKERS=2\nSOLVER_MEMORY_LIMIT_MB=512\n'
            : path === '/fixture/oidc.env'
              ? COMPLETE_OIDC_ENV
              : `INTERNAL_AUTH_SECRET=${'s'.repeat(32)}\nJWT_SIGNING_KEY_CURRENT=${'k'.repeat(32)}\n`,
        ),
      writePhaseFile: () => Promise.resolve(),
      writeAtomicFile: (path, content) => {
        written.set(path, content);
        return Promise.resolve();
      },
      runDocker: () => {
        const compose = [...written.values()].find((content) => content.startsWith('services:'));
        if (compose === undefined) throw new Error('Docker called before Compose write');
        const parsed = Bun.YAML.parse(compose) as {
          services: Record<
            string,
            { environment: Record<string, string>; volumes?: readonly string[] }
          >;
        };
        const service = Object.values(parsed.services)[0];
        expect(service.environment['APP_ORIGIN']).toBe('https://wbs.bulletpoints.club');
        expect(service.volumes?.[1]).toBe('/run/user/1000/wbs-solver:/run/wbs-solver:ro');
        expect(service.volumes?.some((volume) => volume.includes('supervisor.sock'))).toBe(false);
        started = true;
        return Promise.resolve('');
      },
    },
  );
  expect(started).toBe(true);
});

describe('execute, stored vocabulary rollback guard', () => {
  async function runGuard(
    types: string,
    stored: string,
    failure?: 'reader' | 'store' | 'hold-reader' | 'hold-store',
    holds: { supported: string; stored: string } = { supported: '[]', stored: '[]' },
    readiness: { supported: string; stored: string } = { supported: '[]', stored: '[]' },
  ) {
    const ran: string[][] = [];
    const phases: string[] = [];
    const io: SwapExecutionIo = {
      sh: (args) => {
        ran.push(args);
        if (JSON.stringify(args) === JSON.stringify(capacityModesCommand('be-01-green')))
          return Promise.resolve('["isolated"]');
        if (JSON.stringify(args) === JSON.stringify(storedCapacityModesCommand('be-01-green')))
          return Promise.resolve('[]');
        if (JSON.stringify(args) === JSON.stringify(relationshipTypesCommand('be-01-green'))) {
          return failure === 'reader'
            ? Promise.reject(new Error('reader failed'))
            : Promise.resolve(types);
        }
        if (
          JSON.stringify(args) === JSON.stringify(storedRelationshipTypesCommand('be-01-green'))
        ) {
          return failure === 'store'
            ? Promise.reject(new Error('database failed'))
            : Promise.resolve(stored);
        }
        if (JSON.stringify(args) === JSON.stringify(holdKindsCommand('be-01-green'))) {
          return failure === 'hold-reader'
            ? Promise.reject(new Error('hold reader failed'))
            : Promise.resolve(holds.supported);
        }
        if (JSON.stringify(args) === JSON.stringify(storedHoldsCommand('be-01-green'))) {
          return failure === 'hold-store'
            ? Promise.reject(new Error('hold database failed'))
            : Promise.resolve(holds.stored);
        }
        if (JSON.stringify(args) === JSON.stringify(readinessKindsCommand('be-01-green'))) {
          return Promise.resolve(readiness.supported);
        }
        if (JSON.stringify(args) === JSON.stringify(storedReadinessesCommand('be-01-green'))) {
          return Promise.resolve(readiness.stored);
        }
        if (args[0] === 'stop') return Promise.resolve('');
        if (args.includes('src/migrate-status-cli.ts')) return Promise.resolve('none');
        if (args.includes('src/migrate-cli.ts')) return Promise.resolve('migrated');
        throw new Error(`unexpected Docker command: ${args.join(' ')}`);
      },
      readPhase: () => Promise.resolve('committed'),
      writePhase: (_path, phase) => {
        phases.push(phase);
        return Promise.resolve();
      },
      writeAtomic: () => Promise.reject(new Error('routing must not change')),
    };
    let caught: unknown;
    try {
      await execute(
        { tier: 'be', from: 'blue', to: 'green', steps: ['stored-vocabularies', 'migrate'] },
        'registry/be-01@sha256:abc',
        'deadbeef',
        io,
      );
    } catch (error) {
      caught = error;
    }
    return { ran, phases, caught };
  }

  it('refuses FS-only code with stored FF before migration and stops green', async () => {
    const attempt = await runGuard('["FS"]', '[{"type":"FF","count":2}]');
    expect(attempt.caught).toHaveProperty('message', expect.stringContaining('FF (2)'));
    expect(attempt.caught).toHaveProperty(
      'message',
      expect.stringContaining('typed-dependency-rollback-cli.ts save'),
    );
    expect(attempt.ran.at(-1)).toEqual(['stop', 'be-01-green']);
    expect(attempt.ran.some((args) => args.includes('src/migrate-cli.ts'))).toBe(false);
    expect(attempt.phases).toEqual(['committed']);
  });

  it('allows stored FF when incoming code understands FS, SS and FF', async () => {
    const attempt = await runGuard('["FS","SS","FF"]', '[{"type":"FF","count":1}]');
    expect(attempt.caught).toBeUndefined();
    expect(attempt.ran.some((args) => args.includes('src/migrate-cli.ts'))).toBe(true);
  });

  it('allows FS-only code with only FS rows', async () => {
    const attempt = await runGuard('["FS"]', '[{"type":"FS","count":1}]');
    expect(attempt.caught).toBeUndefined();
  });

  it('allows an absent typed dependency table', async () => {
    const attempt = await runGuard('["FS"]', '[]');
    expect(attempt.caught).toBeUndefined();
  });

  it('aborts and stops green on an unexpected reader or database command failure', async () => {
    for (const failure of ['reader', 'store'] as const) {
      const attempt = await runGuard('["FS"]', '[]', failure);
      expect(attempt.caught).toHaveProperty(
        'message',
        expect.stringContaining(`${failure === 'reader' ? 'reader' : 'database'} failed`),
      );
      expect(attempt.ran.at(-1)).toEqual(['stop', 'be-01-green']);
      expect(attempt.ran.some((args) => args.includes('src/migrate-cli.ts'))).toBe(false);
    }
  });

  it('aborts on malformed reader or database output', async () => {
    for (const [types, stored] of [
      ['{"FS":true}', '[]'],
      ['["FS"]', '[{"type":"FF","count":0}]'],
    ]) {
      const attempt = await runGuard(types, stored);
      expect(attempt.caught).toHaveProperty('message', expect.stringContaining('malformed'));
      expect(attempt.ran.at(-1)).toEqual(['stop', 'be-01-green']);
    }
  });

  it('rejects a non-string supported relationship type', async () => {
    const attempt = await runGuard('["FS",42]', '[]');
    expect(attempt.caught).toHaveProperty(
      'message',
      expect.stringContaining('malformed supported relationship types'),
    );
    expect(attempt.ran.at(-1)).toEqual(['stop', 'be-01-green']);
  });

  it('refuses an image that reads no holds while holds are stored, and stops green', async () => {
    const attempt = await runGuard('["FS"]', '[]', undefined, {
      supported: '[]',
      stored: '[{"kind":"on_hold","count":2}]',
    });
    expect(attempt.caught).toHaveProperty('message', expect.stringContaining('on_hold (2)'));
    expect(attempt.caught).toHaveProperty(
      'message',
      expect.stringContaining('work-item-status-facts-rollback-cli.ts save'),
    );
    expect(attempt.ran.at(-1)).toEqual(['stop', 'be-01-green']);
    expect(attempt.ran.some((args) => args.includes('src/migrate-cli.ts'))).toBe(false);
    expect(attempt.phases).toEqual(['committed']);
  });

  it('refuses an image that reads no readiness while readiness is stored', async () => {
    const attempt = await runGuard(
      '["FS"]',
      '[]',
      undefined,
      { supported: '["on_hold","blocked"]', stored: '[]' },
      { supported: '[]', stored: '[{"kind":"ready","count":3}]' },
    );
    expect(attempt.caught).toHaveProperty('message', expect.stringContaining('ready (3)'));
    expect(attempt.caught).toHaveProperty(
      'message',
      expect.stringContaining('work-item-status-facts-rollback-cli.ts save'),
    );
    expect(attempt.ran.at(-1)).toEqual(['stop', 'be-01-green']);
    expect(attempt.ran.some((args) => args.includes('src/migrate-cli.ts'))).toBe(false);
  });

  it('allows stored readiness when the incoming image reads it', async () => {
    const attempt = await runGuard('["FS"]', '[]', undefined, undefined, {
      supported: '["draft","ready"]',
      stored: '[{"kind":"ready","count":3}]',
    });
    expect(attempt.caught).toBeUndefined();
  });

  it('refuses an image missing one of the stored hold kinds', async () => {
    const attempt = await runGuard('["FS"]', '[]', undefined, {
      supported: '["on_hold"]',
      stored: '[{"kind":"on_hold","count":1},{"kind":"blocked","count":3}]',
    });
    expect(attempt.caught).toHaveProperty('message', expect.stringContaining('blocked (3)'));
    expect(attempt.caught).toHaveProperty('message', expect.not.stringContaining('on_hold (1)'));
  });

  it('allows stored holds when the incoming image reads them', async () => {
    const attempt = await runGuard('["FS"]', '[]', undefined, {
      supported: '["on_hold","blocked"]',
      stored: '[{"kind":"blocked","count":1}]',
    });
    expect(attempt.caught).toBeUndefined();
    expect(attempt.ran.some((args) => args.includes('src/migrate-cli.ts'))).toBe(true);
  });

  it('aborts on a failed or malformed hold read', async () => {
    for (const failure of ['hold-reader', 'hold-store'] as const) {
      const attempt = await runGuard('["FS"]', '[]', failure);
      expect(attempt.caught).toHaveProperty('message', expect.stringContaining('failed'));
      expect(attempt.ran.at(-1)).toEqual(['stop', 'be-01-green']);
    }
    for (const holds of [
      { supported: '["on_hold",7]', stored: '[]' },
      { supported: '[]', stored: '[{"kind":"on_hold","count":0}]' },
      { supported: '[]', stored: '[{"type":"on_hold","count":1}]' },
    ]) {
      const attempt = await runGuard('["FS"]', '[]', undefined, holds);
      expect(attempt.caught).toHaveProperty(
        'message',
        expect.stringMatching(/malformed (supported|stored) hold kinds/),
      );
      expect(attempt.ran.at(-1)).toEqual(['stop', 'be-01-green']);
    }
  });

  it('rejects a stored relationship with a fractional count', async () => {
    const attempt = await runGuard('["FS"]', '[{"type":"FF","count":1.5}]');
    expect(attempt.caught).toHaveProperty(
      'message',
      expect.stringContaining('malformed stored relationship types'),
    );
    expect(attempt.ran.at(-1)).toEqual(['stop', 'be-01-green']);
  });
});

describe('execute, pre-migration backup', () => {
  async function runBackup(backup: (path: string) => Promise<string>) {
    const ran: string[][] = [];
    const phases: string[] = [];
    const io: SwapExecutionIo = {
      sh: (args) => {
        ran.push(args);
        if (JSON.stringify(args) === JSON.stringify(capacityModesCommand('be-01-green')))
          return Promise.resolve('["isolated"]');
        if (JSON.stringify(args) === JSON.stringify(storedCapacityModesCommand('be-01-green')))
          return Promise.resolve('[]');
        if (args.includes('src/backup-db-cli.ts')) return backup(args.at(-1) ?? '');
        if (args[0] === 'stop') return Promise.resolve('');
        if (args.includes('src/migrate-status-cli.ts')) return Promise.resolve('none');
        if (args.includes('src/migrate-cli.ts')) return Promise.resolve('migrated');
        throw new Error(`unexpected Docker command: ${args.join(' ')}`);
      },
      readPhase: () => Promise.resolve('committed'),
      writePhase: (_path, phase) => {
        phases.push(phase);
        return Promise.resolve();
      },
      writeAtomic: () => Promise.reject(new Error('routing must not change')),
    };
    let caught: unknown;
    try {
      await execute(
        { tier: 'be', from: 'blue', to: 'green', steps: ['backup-db', 'migrate'] },
        'registry/be-01@sha256:abc',
        'deadbeef',
        io,
      );
    } catch (error) {
      caught = error;
    }
    return { ran, phases, caught };
  }

  const migrated = (ran: string[][]) => ran.some((args) => args.includes('src/migrate-cli.ts'));

  it('snapshots the database from green before migrating', async () => {
    const attempt = await runBackup((path) =>
      Promise.resolve(JSON.stringify({ path, sha256: 'x', bytes: 1, migrations: ['m'] })),
    );
    expect(attempt.caught).toBeUndefined();
    const backup = attempt.ran.findIndex((args) => args.includes('src/backup-db-cli.ts'));
    expect(attempt.ran[backup].slice(0, 5)).toEqual([
      'exec',
      'be-01-green',
      'bun',
      'run',
      'src/backup-db-cli.ts',
    ]);
    expect(attempt.ran[backup][5]).toMatch(/^\/data\/backups\/wbs-pre-deadbeef-\d{8}T\d{9}Z\.db$/);
    expect(backup).toBeLessThan(
      attempt.ran.findIndex((args) => args.includes('src/migrate-cli.ts')),
    );
  });

  // Proof: removing 'backup-db' from ABORTABLE_STEPS made this case fail
  // (76 pass, 1 fail): the failure threw bare, so green was never stopped
  // (2026-09-29).
  it('aborts without migrating when the backup fails, and stops green', async () => {
    const attempt = await runBackup(() => Promise.reject(new Error('disk full')));
    expect(attempt.caught).toHaveProperty('message', expect.stringContaining('disk full'));
    expect(migrated(attempt.ran)).toBe(false);
    expect(attempt.ran.at(-1)).toEqual(['stop', 'be-01-green']);
    expect(attempt.phases).toEqual(['committed']);
  });

  it('aborts when the backup reports a different path or no migrations', async () => {
    for (const output of [
      JSON.stringify({ path: '/data/elsewhere.db', migrations: ['m'] }),
      'not json',
    ]) {
      const attempt = await runBackup(() => Promise.resolve(output));
      expect(attempt.caught).toHaveProperty('message', expect.stringContaining('backup-db'));
      expect(migrated(attempt.ran)).toBe(false);
    }
    const empty = await runBackup((path) =>
      Promise.resolve(JSON.stringify({ path, migrations: [] })),
    );
    expect(empty.caught).toHaveProperty('message', expect.stringContaining('verified snapshot'));
    expect(migrated(empty.ran)).toBe(false);
  });
});

describe('execute, after routing has moved', () => {
  it('refuses a hold written after the first check once blue stops, without committing', async () => {
    const ran: string[][] = [];
    const written: string[] = [];
    let holdReads = 0;
    const io: SwapExecutionIo = {
      sh: (args) => {
        ran.push(args);
        if (JSON.stringify(args) === JSON.stringify(capacityModesCommand('be-01-green')))
          return Promise.resolve('["isolated"]');
        if (JSON.stringify(args) === JSON.stringify(storedCapacityModesCommand('be-01-green')))
          return Promise.resolve('[]');
        const is = (command: string[]) => JSON.stringify(args) === JSON.stringify(command);
        if (is(relationshipTypesCommand('be-01-green'))) return Promise.resolve('["FS"]');
        if (is(storedRelationshipTypesCommand('be-01-green'))) return Promise.resolve('[]');
        if (is(holdKindsCommand('be-01-green'))) return Promise.resolve('[]');
        if (is(readinessKindsCommand('be-01-green'))) return Promise.resolve('[]');
        if (is(storedReadinessesCommand('be-01-green'))) return Promise.resolve('[]');
        if (is(storedHoldsCommand('be-01-green'))) {
          holdReads++;
          return Promise.resolve(holdReads === 1 ? '[]' : '[{"kind":"on_hold","count":1}]');
        }
        if (args.includes('src/migrate-status-cli.ts')) return Promise.resolve('none');
        if (args.includes('src/migrate-cli.ts')) return Promise.resolve('migrated');
        if (args[0] === 'stop') return Promise.resolve('');
        throw new Error(`unexpected Docker command: ${args.join(' ')}`);
      },
      readPhase: () => Promise.resolve('committed'),
      writePhase: (_path, phase) => {
        written.push(`phase ${phase}`);
        return Promise.resolve();
      },
      writeAtomic: (path) => {
        written.push(`file ${path}`);
        return Promise.resolve();
      },
    };

    let caught: unknown;
    try {
      await execute(
        {
          tier: 'be',
          from: 'blue',
          to: 'green',
          steps: [
            'stored-vocabularies',
            'migrate',
            'stop-blue',
            'stored-vocabularies-after-stop',
            'backfill-step-codes',
            'commit',
          ],
        },
        'registry/be-01@sha256:abc',
        'deadbeef',
        io,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toHaveProperty(
      'message',
      expect.stringMatching(/on_hold \(1\).*redeploy.*docs\/runbook-prod-deploy\.md/is),
    );
    expect(holdReads).toBe(2);
    expect(ran.some((args) => args.includes('src/backfill-step-codes-cli.ts'))).toBe(false);
    expect(written).toEqual(['phase old-stopped']);
  });

  it('refuses FF inserted after the first check once blue stops, without committing', async () => {
    const ran: string[][] = [];
    const written: string[] = [];
    let storedReads = 0;
    const io: SwapExecutionIo = {
      sh: (args) => {
        ran.push(args);
        if (JSON.stringify(args) === JSON.stringify(capacityModesCommand('be-01-green')))
          return Promise.resolve('["isolated"]');
        if (JSON.stringify(args) === JSON.stringify(storedCapacityModesCommand('be-01-green')))
          return Promise.resolve('[]');
        if (JSON.stringify(args) === JSON.stringify(relationshipTypesCommand('be-01-green')))
          return Promise.resolve('["FS"]');
        if (JSON.stringify(args) === JSON.stringify(holdKindsCommand('be-01-green')))
          return Promise.resolve('[]');
        if (JSON.stringify(args) === JSON.stringify(storedHoldsCommand('be-01-green')))
          return Promise.resolve('[]');
        if (JSON.stringify(args) === JSON.stringify(readinessKindsCommand('be-01-green')))
          return Promise.resolve('[]');
        if (JSON.stringify(args) === JSON.stringify(storedReadinessesCommand('be-01-green')))
          return Promise.resolve('[]');
        if (
          JSON.stringify(args) === JSON.stringify(storedRelationshipTypesCommand('be-01-green'))
        ) {
          storedReads++;
          return Promise.resolve(
            storedReads === 1 ? '[{"type":"FS","count":1}]' : '[{"type":"FF","count":2}]',
          );
        }
        if (args.includes('src/migrate-status-cli.ts')) return Promise.resolve('none');
        if (args.includes('src/migrate-cli.ts')) return Promise.resolve('migrated');
        if (args[0] === 'stop') return Promise.resolve('');
        throw new Error(`unexpected Docker command: ${args.join(' ')}`);
      },
      readPhase: () => Promise.resolve('committed'),
      writePhase: (_path, phase) => {
        written.push(`phase ${phase}`);
        return Promise.resolve();
      },
      writeAtomic: (path) => {
        written.push(`file ${path}`);
        return Promise.resolve();
      },
    };

    let caught: unknown;
    try {
      await execute(
        {
          tier: 'be',
          from: 'blue',
          to: 'green',
          steps: [
            'stored-vocabularies',
            'migrate',
            'stop-blue',
            'stored-vocabularies-after-stop',
            'backfill-step-codes',
            'commit',
          ],
        },
        'registry/be-01@sha256:abc',
        'deadbeef',
        io,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toHaveProperty(
      'message',
      expect.stringMatching(/FF \(2\).*redeploy.*docs\/runbook-prod-deploy\.md/is),
    );
    expect(storedReads).toBe(2);
    expect(ran).toContainEqual(['stop', 'be-01-blue']);
    expect(ran.some((args) => args.includes('src/backfill-step-codes-cli.ts'))).toBe(false);
    expect(written).toEqual(['phase old-stopped']);
  });

  /**
   * Proof: with the `backfill-step-codes` case emptied (the step logged and
   * skipped), this case failed on `Expected path: "message"` — the swap went
   * on to write `committed` and the state file; watched 2026-09-27.
   */
  it('fails before commit when the step-code backfill fails, naming the manual command', async () => {
    const ran: string[][] = [];
    const written: string[] = [];
    const io: SwapExecutionIo = {
      sh: (args) => {
        ran.push(args);
        if (JSON.stringify(args) === JSON.stringify(capacityModesCommand('be-01-green')))
          return Promise.resolve('["isolated"]');
        if (JSON.stringify(args) === JSON.stringify(storedCapacityModesCommand('be-01-green')))
          return Promise.resolve('[]');
        return Promise.reject(new Error(`docker ${args.join(' ')} failed: no such table: step`));
      },
      readPhase: () => Promise.resolve('old-stopped'),
      writePhase: (_path, phase) => {
        written.push(`phase ${phase}`);
        return Promise.resolve();
      },
      writeAtomic: (path) => {
        written.push(`file ${path}`);
        return Promise.resolve();
      },
    };

    let caught: unknown;
    try {
      await execute(
        { tier: 'be', from: 'blue', to: 'green', steps: ['backfill-step-codes', 'commit'] },
        'registry/be-01@sha256:abc',
        'deadbeef',
        io,
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toHaveProperty(
      'message',
      'step-code backfill failed on be-01-green; the new colour is serving with uncoded steps. ' +
        'Finish it by hand: docker exec be-01-green bun run src/backfill-step-codes-cli.ts',
    );
    expect(ran).toEqual([['exec', 'be-01-green', 'bun', 'run', 'src/backfill-step-codes-cli.ts']]);
    // Not abortable, and not committed: green stays live, the deploy unrecorded.
    expect(written).toEqual([]);
  });
});

describe('execute, capacity mode guard', () => {
  async function runCapacity(
    supported: string,
    stored: (read: number) => string,
    afterStop = false,
    fault?: 'reader' | 'store',
  ) {
    const ran: string[][] = [];
    const phases: string[] = [];
    let reads = 0;
    const io: SwapExecutionIo = {
      sh: (args) => {
        ran.push(args);
        const is = (command: string[]) => JSON.stringify(args) === JSON.stringify(command);
        if (is(capacityModesCommand('be-01-green')))
          return fault === 'reader'
            ? Promise.reject(new Error('capacity reader failed'))
            : Promise.resolve(supported);
        if (is(storedCapacityModesCommand('be-01-green')))
          return fault === 'store'
            ? Promise.reject(new Error('capacity database failed'))
            : Promise.resolve(stored(++reads));
        if (is(relationshipTypesCommand('be-01-green'))) return Promise.resolve('["FS"]');
        if (
          is(holdKindsCommand('be-01-green')) ||
          is(readinessKindsCommand('be-01-green')) ||
          is(storedRelationshipTypesCommand('be-01-green')) ||
          is(storedHoldsCommand('be-01-green')) ||
          is(storedReadinessesCommand('be-01-green'))
        )
          return Promise.resolve('[]');
        if (args.includes('src/migrate-status-cli.ts')) return Promise.resolve('none');
        if (args.includes('src/migrate-cli.ts')) return Promise.resolve('migrated');
        if (args[0] === 'stop') return Promise.resolve('');
        throw new Error(`unexpected Docker command: ${args.join(' ')}`);
      },
      readPhase: () => Promise.resolve('committed'),
      writePhase: (_path, phase) => {
        phases.push(phase);
        return Promise.resolve();
      },
      writeAtomic: () => Promise.reject(new Error('commit must not happen')),
    };
    let caught: unknown;
    try {
      await execute(
        {
          tier: 'be',
          from: 'blue',
          to: 'green',
          steps: afterStop
            ? [
                'stored-vocabularies',
                'migrate',
                'stop-blue',
                'stored-vocabularies-after-stop',
                'commit',
              ]
            : ['stored-vocabularies', 'migrate'],
        },
        'registry/be-01@sha256:abc',
        'deadbeef',
        io,
      );
    } catch (failure) {
      caught = failure;
    }
    return { ran, phases, reads, caught };
  }

  it('refuses isolated-only code over shared capacity before migration and stops green', async () => {
    const attempt = await runCapacity('["isolated"]', () => '[{"mode":"shared","count":2}]');
    expect(attempt.caught).toHaveProperty('message', expect.stringContaining('shared (2)'));
    expect(attempt.caught).toHaveProperty(
      'message',
      expect.stringContaining('shared-people-rollback-cli.ts save|remove'),
    );
    expect(attempt.ran.at(-1)).toEqual(['stop', 'be-01-green']);
    expect(attempt.ran.some((args) => args.includes('src/migrate-cli.ts'))).toBe(false);
  });

  it('allows isolated stored capacity without claiming shared support', async () => {
    const attempt = await runCapacity('["isolated"]', () => '[{"mode":"isolated","count":2}]');
    expect(attempt.caught).toBeUndefined();
    expect(attempt.ran.some((args) => args.includes('src/migrate-cli.ts'))).toBe(true);
  });

  it('refuses capacity reader/store failures and malformed capabilities or counts', async () => {
    for (const fault of ['reader', 'store'] as const) {
      const attempt = await runCapacity('["isolated"]', () => '[]', false, fault);
      expect(attempt.caught).toHaveProperty('message', expect.stringContaining('failed'));
      expect(attempt.ran.at(-1)).toEqual(['stop', 'be-01-green']);
    }
    for (const [supported, stored] of [
      ['["isolated",1]', '[]'],
      ['["isolated"]', '[{"mode":"shared","count":0}]'],
      ['["isolated"]', '[{"mode":"shared","count":1.5}]'],
      ['["isolated"]', '[{"kind":"shared","count":1}]'],
    ]) {
      const attempt = await runCapacity(supported, () => stored);
      expect(attempt.caught).toHaveProperty('message', expect.stringContaining('malformed'));
      expect(attempt.ran.at(-1)).toEqual(['stop', 'be-01-green']);
    }
  });

  it('refuses shared capacity introduced after the first check once blue stops', async () => {
    const attempt = await runCapacity(
      '["isolated"]',
      (read) => (read === 1 ? '[]' : '[{"mode":"shared","count":1}]'),
      true,
    );
    expect(attempt.caught).toHaveProperty('message', expect.stringContaining('shared (1)'));
    expect(attempt.caught).toHaveProperty(
      'message',
      expect.stringContaining('after the outgoing colour stopped'),
    );
    expect(attempt.reads).toBe(2);
    expect(attempt.phases).toEqual(['old-stopped']);
    expect(attempt.ran.some((args) => args[0] === 'stop' && args[1] === 'be-01-green')).toBe(false);
  });
});
