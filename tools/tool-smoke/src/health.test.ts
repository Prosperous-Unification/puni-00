import { describe, expect, it } from 'bun:test';

import { checkTarget, type HealthTarget, resolveTargets, runHealthChecks } from './health';

describe('resolveTargets', () => {
  it('builds container-DNS URLs for be-01/gw-01/fe-01 from SMOKE_COLOR', () => {
    const targets = resolveTargets({ SMOKE_COLOR: 'green' });
    expect(targets).toEqual([
      { name: 'be-01', url: 'http://be-01-green:3100/health', isHealthy: undefined },
      { name: 'gw-01', url: 'http://gw-01-green:3200/health', isHealthy: undefined },
      {
        name: 'fe-01',
        url: 'http://fe-01-green:80/',
        isHealthy: expect.any(Function) as (body: string) => boolean,
      },
    ]);
  });

  it('individual SMOKE_*_URL overrides win without needing SMOKE_COLOR at all', () => {
    const targets = resolveTargets({
      SMOKE_BE_URL: 'http://custom-be/health',
      SMOKE_GW_URL: 'http://custom-gw/health',
      SMOKE_FE_URL: 'http://custom-fe/',
    });
    expect(targets.map((t) => t.url)).toEqual([
      'http://custom-be/health',
      'http://custom-gw/health',
      'http://custom-fe/',
    ]);
  });

  it('throws rather than defaulting to blue when a target has no override and SMOKE_COLOR is unset', () => {
    expect(() => resolveTargets({ SMOKE_BE_URL: 'http://custom-be/health' })).toThrow(
      /SMOKE_COLOR/,
    );
  });

  it("fe-01's isHealthy rejects an empty (but 200) body — the truncated-index.html case", () => {
    const targets = resolveTargets({ SMOKE_COLOR: 'blue' });
    const fe = targets.find((t) => t.name === 'fe-01');
    expect(fe?.isHealthy?.('')).toBe(false);
    expect(fe?.isHealthy?.('<html>ok</html>')).toBe(true);
  });
});

describe('checkTarget', () => {
  it('returns ok=true on 200 with no isHealthy predicate', async () => {
    const target: HealthTarget = { name: 'be-01', url: 'http://x/health' };
    const fetchImpl = (() =>
      Promise.resolve(new Response('ok', { status: 200 }))) as unknown as typeof fetch;
    const r = await checkTarget(target, fetchImpl);
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
  });

  it('returns ok=false on network error', async () => {
    const target: HealthTarget = { name: 'be-01', url: 'http://x/health' };
    const fetchImpl = (() => Promise.reject(new Error('down'))) as unknown as typeof fetch;
    const r = await checkTarget(target, fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
  });

  it('returns ok=false on 200 with an empty body when isHealthy requires non-empty', async () => {
    const target: HealthTarget = {
      name: 'fe-01',
      url: 'http://x/',
      isHealthy: (body) => body.length > 0,
    };
    const fetchImpl = (() =>
      Promise.resolve(new Response('', { status: 200 }))) as unknown as typeof fetch;
    const r = await checkTarget(target, fetchImpl);
    expect(r.status).toBe(200);
    expect(r.ok).toBe(false);
  });
});

describe('runHealthChecks', () => {
  it('checks every target and reports be-01 ok, gw-01 failing', async () => {
    const targets: HealthTarget[] = [
      { name: 'be-01', url: 'http://x/health' },
      { name: 'gw-01', url: 'http://y/health' },
    ];
    const fetchImpl = ((input: string | URL | Request) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return Promise.resolve(new Response('x', { status: u === 'http://x/health' ? 200 : 503 }));
    }) as unknown as typeof fetch;
    const results = await runHealthChecks(targets, fetchImpl);
    expect(results.length).toBe(2);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(false);
  });
});
