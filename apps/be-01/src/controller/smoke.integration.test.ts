import { describe, expect, it } from 'bun:test';

import { buildApp } from '../app';

describe('POST /api/smoke/echo', () => {
  it('returns the validated message', async () => {
    const app = buildApp({ migrationsApplied: true });
    const res = await app.handle(
      new Request('http://localhost/api/smoke/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hi' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { echoed: string };
    expect(body.echoed).toBe('hi');
  });

  it('rejects invalid body with 400', async () => {
    const app = buildApp({ migrationsApplied: true });
    const res = await app.handle(
      new Request('http://localhost/api/smoke/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wrong: true }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
