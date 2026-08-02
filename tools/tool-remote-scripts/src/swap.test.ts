import { describe, expect, it } from 'bun:test';

import { assembleCaddyfile } from './lib/caddy';
import { drain } from './lib/drain';
import { waitForHealthy } from './lib/health';
import { flipColor, parseStateJson, renderStateJson } from './lib/state';

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

// `planSwap`/`describePlan` used to live here, hardcoding `activeColor: 'blue'`
// and never touching real Docker or Caddy. Task 9 replaced them: the real
// planner is `planSwap` in `./lib/reconcile.ts` (tested in
// `./lib/reconcile.test.ts`), and this file's `swap.ts` is now the IO shell
// that executes its plan — its pure command builders and parsers live in
// `./lib/docker.ts` and `./lib/site.ts` (tested in `docker.test.ts` and
// `site.test.ts`).
