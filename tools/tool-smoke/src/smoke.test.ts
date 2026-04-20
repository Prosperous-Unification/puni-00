import { describe, expect, it } from 'bun:test';

import { checkUrl, runHealthChecks } from './health';
import { type MockSocket, runPingSmoke } from './ws-ping';

describe('checkUrl', () => {
  it('returns ok=true on 200', async () => {
    const fetchImpl = (() =>
      Promise.resolve(new Response('ok', { status: 200 }))) as unknown as typeof fetch;
    const r = await checkUrl('http://x', fetchImpl);
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
  });

  it('returns ok=false on network error', async () => {
    const fetchImpl = (() => Promise.reject(new Error('down'))) as unknown as typeof fetch;
    const r = await checkUrl('http://x', fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
  });
});

describe('runHealthChecks', () => {
  it('checks /health and /metrics', async () => {
    const fetchImpl = ((input: string | URL | Request) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return Promise.resolve(new Response('x', { status: u.endsWith('/health') ? 200 : 503 }));
    }) as unknown as typeof fetch;
    const results = await runHealthChecks('http://x', fetchImpl);
    expect(results.length).toBe(2);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(false);
  });
});

function mockSocket(script: string[]): MockSocket {
  let i = 0;
  return {
    send: () => Promise.resolve(),
    waitFor: (predicate) => {
      while (i < script.length) {
        const f = script[i++];
        if (predicate(f)) return Promise.resolve(f);
      }
      return Promise.reject(new Error('no match'));
    },
    close: () => Promise.resolve(),
  };
}

describe('runPingSmoke', () => {
  it('passes when socket returns pong + resume_ack', async () => {
    let t = 0;
    const now = (): number => (t += 1);
    const r = await runPingSmoke({
      open: () =>
        Promise.resolve(
          mockSocket([JSON.stringify({ type: 'pong' }), JSON.stringify({ type: 'resume_ack' })]),
        ),
      now,
    });
    expect(r.overallOk).toBe(true);
    expect(r.steps.map((s) => s.phase)).toEqual(['connect', 'ping', 'resume', 'disconnect']);
  });

  it('fails when pong never arrives', async () => {
    const r = await runPingSmoke({
      open: () => Promise.resolve(mockSocket(['{"type":"other"}'])),
    });
    expect(r.overallOk).toBe(false);
  });
});
