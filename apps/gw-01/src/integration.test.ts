import { describe, expect, it } from 'bun:test';

import { buildApp } from './app';

const OPTS = {
  beUrl: 'http://be',
  internalAuthSecret: 's'.repeat(32),
  jwtKey: 'k'.repeat(32),
};

describe('gw-01 /health', () => {
  it('returns 200', async () => {
    const app = buildApp(OPTS);
    const res = await app.handle(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
  });
});

describe('POST /internal/push', () => {
  it('rejects without auth', async () => {
    const app = buildApp(OPTS);
    const res = await app.handle(
      new Request('http://localhost/internal/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscription: 'a', seq: 1, message: {} }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns delivered_to_sockets:0 when no subscribers', async () => {
    const app = buildApp(OPTS);
    const res = await app.handle(
      new Request('http://localhost/internal/push', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-auth': OPTS.internalAuthSecret,
        },
        body: JSON.stringify({ subscription: 'a', seq: 1, message: {} }),
      }),
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as { delivered_to_sockets: number };
    expect(body.delivered_to_sockets).toBe(0);
  });

  it('rejects malformed body with 400', async () => {
    const app = buildApp(OPTS);
    const res = await app.handle(
      new Request('http://localhost/internal/push', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-auth': OPTS.internalAuthSecret,
        },
        body: JSON.stringify({ subscription: 42 }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
