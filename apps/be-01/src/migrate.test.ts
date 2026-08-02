import { describe, expect, it } from 'bun:test';

import { buildApp } from './app';

describe('migrate lifecycle', () => {
  it('exposes 503 before migrations complete then 200 after', async () => {
    const state = { migrationsApplied: false };
    const app = buildApp({
      internalAuthSecret: 'x'.repeat(32),
      get migrationsApplied() {
        return state.migrationsApplied;
      },
    });

    const pre = await app.handle(new Request('http://localhost/health'));
    expect(pre.status).toBe(503);

    state.migrationsApplied = true;
    const post = await app.handle(new Request('http://localhost/health'));
    expect(post.status).toBe(200);
  });
});
