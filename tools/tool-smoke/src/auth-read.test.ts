import { describe, expect, it } from 'bun:test';
import { jwtVerify } from 'jose';

import { type ReadIdentity, resolveApiBase, resolveReadIdentity, runReadChecks } from './auth-read';

const KEY = 'k'.repeat(32);
const ACCOUNT: ReadIdentity = { kind: 'account', id: 'u-smoke', username: 'smoke', key: KEY };

/** A be-01 double: anonymous reads refused, sessions verified with {@link KEY}. */
function fakeBe(overrides: { anonymousProjects?: number; meUser?: unknown } = {}): typeof fetch {
  return (async (input: string, init?: RequestInit) => {
    const url = input;
    const cookie = new Headers(init?.headers).get('cookie');
    let subject: string | null = null;
    if (cookie !== null) {
      const token = decodeURIComponent(cookie.replace('__Host-wbs_access=', ''));
      const { payload } = await jwtVerify(token, new TextEncoder().encode(KEY));
      subject = payload.sub ?? null;
    }
    if (url.endsWith('/api/auth/me')) {
      if (subject === null) return Response.json({ user: null });
      return Response.json({ user: overrides.meUser ?? { id: subject, username: 'smoke' } });
    }
    if (url.endsWith('/api/projects')) {
      if (subject === null) {
        const status = overrides.anonymousProjects ?? 401;
        return Response.json(status === 401 ? { error: 'unauthorized' } : { projects: [] }, {
          status,
        });
      }
      return Response.json({ projects: [] });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

describe('runReadChecks', () => {
  it('passes the signed-out probe, the anonymous refusal and both signed-in reads', async () => {
    const checks = await runReadChecks('http://be', ACCOUNT, fakeBe());
    expect(checks.map((check) => [check.name, check.kind])).toEqual([
      ['signed-out /api/auth/me', 'ok'],
      ['anonymous /api/projects refused', 'ok'],
      ['signed-in /api/auth/me', 'ok'],
      ['signed-in /api/projects', 'ok'],
    ]);
  });

  it('fails when projects are readable anonymously', async () => {
    const checks = await runReadChecks('http://be', ACCOUNT, fakeBe({ anonymousProjects: 200 }));
    expect(checks[1]).toMatchObject({ name: 'anonymous /api/projects refused', kind: 'fail' });
  });

  it('fails when the session resolves to a different account', async () => {
    const checks = await runReadChecks(
      'http://be',
      ACCOUNT,
      fakeBe({ meUser: { id: 'someone-else', username: 'x' } }),
    );
    expect(checks[2]).toMatchObject({ name: 'signed-in /api/auth/me', kind: 'fail' });
  });

  it('reports the signed-in reads as skipped, never ok, when no account is configured', async () => {
    const checks = await runReadChecks(
      'http://be',
      { kind: 'unconfigured', reason: 'unset' },
      fakeBe(),
    );
    expect(checks.slice(2)).toEqual([
      { name: 'signed-in /api/auth/me', kind: 'skipped', reason: 'unset' },
      { name: 'signed-in /api/projects', kind: 'skipped', reason: 'unset' },
    ]);
  });

  it('turns a refused connection into that check failing, not the suite throwing', async () => {
    const refused = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch;
    const checks = await runReadChecks('http://be', ACCOUNT, refused);
    expect(checks.every((check) => check.kind === 'fail')).toBe(true);
    expect(checks[0]).toMatchObject({ detail: 'ECONNREFUSED' });
  });
});

describe('resolveReadIdentity', () => {
  it('is unconfigured when both identity keys are absent', () => {
    expect(resolveReadIdentity({}).kind).toBe('unconfigured');
  });

  it('throws on half an identity', () => {
    expect(() => resolveReadIdentity({ SMOKE_READ_USER_ID: 'u' })).toThrow(/together/);
  });

  it('throws when the signing key is missing', () => {
    expect(() =>
      resolveReadIdentity({ SMOKE_READ_USER_ID: 'u', SMOKE_READ_USERNAME: 'n' }),
    ).toThrow(/JWT_SIGNING_KEY_CURRENT/);
  });
});

describe('resolveApiBase', () => {
  it('prefers SMOKE_API_URL and otherwise requires SMOKE_COLOR', () => {
    expect(resolveApiBase({ SMOKE_API_URL: 'http://be-01-green:3100' })).toBe(
      'http://be-01-green:3100',
    );
    expect(resolveApiBase({ SMOKE_COLOR: 'blue' })).toBe('http://be-01-blue:3100');
    expect(() => resolveApiBase({})).toThrow(/SMOKE_COLOR/);
  });
});
