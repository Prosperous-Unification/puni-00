import { describe, expect, it } from 'bun:test';

import { buildApp } from './app';

const TEST_SECRET = 'x'.repeat(32);

describe('GET /health', () => {
  it('returns 200 with status:"ok" when ready', async () => {
    const app = buildApp({ internalAuthSecret: TEST_SECRET, migrationsApplied: true });
    const res = await app.handle(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('returns 503 while migrations still running', async () => {
    const app = buildApp({ internalAuthSecret: TEST_SECRET, migrationsApplied: false });
    const res = await app.handle(new Request('http://localhost/health'));
    expect(res.status).toBe(503);
  });
});
