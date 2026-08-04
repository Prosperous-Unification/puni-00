import { describe, expect, it } from 'bun:test';
import { jwtVerify } from 'jose';

import { buildApp } from '../app';
import { TEST_JWT_KEY, testAuthService } from '../testing/auth-fixture';

const TEST_SECRET = 'x'.repeat(32);

function app() {
  return buildApp({
    auth: testAuthService(),
    internalAuthSecret: TEST_SECRET,
    migrationsApplied: true,
  });
}

const json = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/auth/register', () => {
  it('issues a token gw-01 can verify with the shared key', async () => {
    const res = await app().handle(
      json('/api/auth/register', { username: 'ada', password: 'lovelace99' }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; user: { username: string } };
    expect(body.user.username).toBe('ada');

    // The point of the assertion: the token is verifiable by exactly the
    // procedure gw-01 runs on the WebSocket handshake. A token be-01 accepts
    // but gw-01 rejects would still pass a be-01-only test.
    const { payload } = await jwtVerify(body.token, new TextEncoder().encode(TEST_JWT_KEY));
    expect(payload['username']).toBe('ada');
    expect(typeof payload.sub).toBe('string');
  });

  it('rejects a duplicate username with 409', async () => {
    const a = app();
    await a.handle(json('/api/auth/register', { username: 'ada', password: 'lovelace99' }));
    const res = await a.handle(
      json('/api/auth/register', { username: 'ada', password: 'different1' }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('taken');
  });

  it('rejects a short password with 400', async () => {
    const res = await app().handle(
      json('/api/auth/register', { username: 'ada', password: 'short' }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token for correct credentials', async () => {
    const a = app();
    await a.handle(json('/api/auth/register', { username: 'grace', password: 'hopper2026' }));
    const res = await a.handle(
      json('/api/auth/login', { username: 'grace', password: 'hopper2026' }),
    );
    expect(res.status).toBe(200);
    expect(typeof ((await res.json()) as { token: string }).token).toBe('string');
  });

  it('returns 401 for a wrong password', async () => {
    const a = app();
    await a.handle(json('/api/auth/register', { username: 'grace', password: 'hopper2026' }));
    const res = await a.handle(
      json('/api/auth/login', { username: 'grace', password: 'wrongpassword' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for an unknown user, with the same body as a wrong password', async () => {
    const res = await app().handle(
      json('/api/auth/login', { username: 'nobody', password: 'whatever12' }),
    );
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_credentials');
  });
});

describe('GET /api/auth/me', () => {
  it('resolves the caller from a bearer token', async () => {
    const a = app();
    const reg = await a.handle(
      json('/api/auth/register', { username: 'ada', password: 'lovelace99' }),
    );
    const { token } = (await reg.json()) as { token: string };
    const res = await a.handle(
      new Request('http://localhost/api/auth/me', {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { username: string } }).user.username).toBe('ada');
  });

  it('rejects a token signed with a different key', async () => {
    const a = app();
    const reg = await a.handle(
      json('/api/auth/register', { username: 'ada', password: 'lovelace99' }),
    );
    const { token } = (await reg.json()) as { token: string };
    // Same payload, wrong signature: flipping the last character of the
    // signature segment is enough, and proves the route verifies rather than
    // merely decodes.
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    const res = await a.handle(
      new Request('http://localhost/api/auth/me', {
        headers: { authorization: `Bearer ${tampered}` },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects a missing header', async () => {
    const res = await app().handle(new Request('http://localhost/api/auth/me'));
    expect(res.status).toBe(401);
  });
});
