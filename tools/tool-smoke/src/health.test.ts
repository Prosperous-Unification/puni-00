import { describe, expect, it } from 'bun:test';

import {
  checkInternalForward,
  checkTarget,
  type HealthTarget,
  resolveInternalForwardUrl,
  resolveTargets,
  runHealthChecks,
} from './health';

/** A fetchImpl double that never settles unless its AbortSignal fires. */
function hangingFetch(): typeof fetch {
  return ((_url: string, init?: { signal?: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new Error('aborted'));
      });
    })) as unknown as typeof fetch;
}

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

  it('fails rather than hanging forever when fetch never settles', async () => {
    const target: HealthTarget = { name: 'be-01', url: 'http://x/health' };
    const start = Date.now();
    const r = await checkTarget(target, hangingFetch(), 50);
    expect(r.ok).toBe(false);
    expect(Date.now() - start).toBeLessThan(1000);
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

describe('resolveInternalForwardUrl', () => {
  it('builds the container-DNS URL for be-01 from SMOKE_COLOR', () => {
    expect(resolveInternalForwardUrl({ SMOKE_COLOR: 'green' })).toBe(
      'http://be-01-green:3100/internal/forward',
    );
  });

  it('SMOKE_INTERNAL_URL overrides without needing SMOKE_COLOR', () => {
    expect(
      resolveInternalForwardUrl({ SMOKE_INTERNAL_URL: 'http://custom-be/internal/forward' }),
    ).toBe('http://custom-be/internal/forward');
  });

  it('throws rather than defaulting to blue when SMOKE_COLOR is unset', () => {
    expect(() => resolveInternalForwardUrl({})).toThrow(/SMOKE_COLOR/);
  });
});

describe('checkInternalForward', () => {
  it('POSTs message+trace_id with the x-internal-auth header and reports ok on 200', async () => {
    let seenInit: RequestInit | undefined;
    const fetchImpl = ((_url: string, init?: RequestInit) => {
      seenInit = init;
      return Promise.resolve(new Response(JSON.stringify({ ack: true }), { status: 200 }));
    }) as unknown as typeof fetch;

    const r = await checkInternalForward(
      'http://be-01-blue:3100/internal/forward',
      'the-shared-secret',
      fetchImpl,
    );

    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(seenInit?.method).toBe('POST');
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers['x-internal-auth']).toBe('the-shared-secret');
    expect(JSON.parse(seenInit?.body as string)).toEqual({
      message: { type: 'ping' },
      trace_id: 'smoke',
    });
  });

  it('reports ok=false on a 401 — the exact signature of a secret mismatch between gw-01 and be-01', async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
      )) as unknown as typeof fetch;
    const r = await checkInternalForward('http://x/internal/forward', 'wrong-secret', fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });

  it('fails rather than hanging forever when fetch never settles', async () => {
    const start = Date.now();
    const r = await checkInternalForward('http://x/internal/forward', 'secret', hangingFetch(), 50);
    expect(r.ok).toBe(false);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('checkInternalForward requires the ack, not just a 2xx', () => {
  const okStatus = (body: string) =>
    (() => Promise.resolve(new Response(body, { status: 200 }))) as unknown as typeof fetch;

  it('fails a 200 whose body does not say ack', async () => {
    // Open finding 1: any 2xx passed. A proxy, a stub, a be-01 that answered the
    // route without doing anything — all of them looked like a working internal
    // round trip, which is the one thing this check exists to prove.
    const r = await checkInternalForward('http://x/internal/forward', 's', okStatus('{}'));

    expect(r.ok).toBe(false);
    expect(r.detail).toContain('ack');
  });

  it('fails a 200 that is not JSON at all', async () => {
    const r = await checkInternalForward(
      'http://x/internal/forward',
      's',
      okStatus('<html>proxy error</html>'),
    );

    expect(r.ok).toBe(false);
  });

  it('passes when be-01 acks', async () => {
    const r = await checkInternalForward(
      'http://x/internal/forward',
      's',
      okStatus('{"ack":true,"push_responses":[]}'),
    );

    expect(r.ok).toBe(true);
  });
});
