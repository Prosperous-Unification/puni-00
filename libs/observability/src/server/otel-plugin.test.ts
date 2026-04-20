import { describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';

import { observabilityPlugin } from './otel-plugin';

describe('observabilityPlugin', () => {
  it('exposes GET /metrics', async () => {
    const app = new Elysia().use(observabilityPlugin({ service: 'be-01' }));
    const res = await app.handle(new Request('http://localhost/metrics'));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });
});
