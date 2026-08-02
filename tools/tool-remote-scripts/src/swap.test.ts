import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { assembleCaddyfile } from './lib/caddy';
import { drain } from './lib/drain';
import { waitForHealthy } from './lib/health';
import { flipColor, parseStateJson, renderStateJson } from './lib/state';
import { readSiteCaddy, shouldRestoreSiteCaddy } from './swap';

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
    dir = mkdtempSync(join(tmpdir(), 'wbs-swap-'));
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
// `/srv/wbs/caddy/Caddyfile` does a bare `import site.caddy`, writing that
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
