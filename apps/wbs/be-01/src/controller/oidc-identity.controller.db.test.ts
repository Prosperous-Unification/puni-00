import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  browserBindingCookieName,
  buildOidcVerifier,
  InMemoryOidcTransactionStore,
  InMemoryTokenStore,
} from '@wbs/auth';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { buildApp } from '../app';
import { openDatabase, openDrizzle } from '../repository/db';
import { OPEN } from '../repository/gate';
import { runMigrations } from '../repository/migrate';
import { UserRepository } from '../repository/user';
import { bunPasswordHasher, joseTokenCodec } from '../runtime/bun-runtime';
import { AuthService } from '../service/auth.service';
import { testCalendarMarkerService } from '../testing/calendar-marker-fixture';
import { testCapacityService } from '../testing/capacity-fixture';
import { testClock } from '../testing/clock-fixture';
import { testDirectoryService } from '../testing/directory-fixture';
import {
  refusingEmailVerification,
  refusingTestEmailDelivery,
} from '../testing/email-verification-fixture';
import { testHistoryService } from '../testing/history-fixture';
import { testLoginThrottle } from '../testing/login-throttle-fixture';
import { refusingOnboarding } from '../testing/onboarding-fixture';
import {
  legacyOrganizationAccess,
  refusingMemberships,
} from '../testing/organization-access-fixture';
import { testPriorityBandService } from '../testing/priority-band-fixture';
import { testProjectService } from '../testing/project-fixture';
import { testReplay } from '../testing/replay-fixture';
import { testSavedPlanService } from '../testing/saved-plan-fixture';
import { testStepService } from '../testing/step-fixture';
import { testWorkItemService } from '../testing/work-item-fixture';
import { testWrites } from '../testing/writes-fixture';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;
const now = Date.UTC(2026, 8, 28);
const claims = {
  iss: 'https://idp.test',
  sub: 'subject-1',
  email: 'DANY@PUNI.TEST',
  email_verified: true,
  wbs_groups: ['dev:wbs:read', 'dev:wbs:write'],
};

/**
 * Task 2.3 through the real OIDC callback, resolving identities in SQLite:
 * after activation a verified pair resolves only through `external_identity`,
 * so an email match never signs anyone into an existing account.
 */
describe('the OIDC callback after activation', () => {
  let dir: string;
  let path: string;
  let auth: AuthService;
  let exchanges: number;
  let linkAuthorization: {
    nonce: string;
    state: string;
    verifier: string;
    redirectUri: string;
    prompt?: 'login';
  } | null;
  let exchangeChecks: { nonce: string; state: string; verifier: string } | null;
  let passwordVerifyHold: Promise<void> | null;
  let passwordVerifications: number;
  let passwordVerifyFault: boolean;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-oidc-identity-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    exchanges = 0;
    linkAuthorization = null;
    exchangeChecks = null;
    passwordVerifyHold = null;
    passwordVerifications = 0;
    passwordVerifyFault = false;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const sql = (statement: string) => {
    const db = openDatabase(path);
    try {
      db.run(statement);
    } finally {
      db.close();
    }
  };
  const all = (statement: string) => {
    const db = openDatabase(path);
    try {
      return db.query(statement).all();
    } finally {
      db.close();
    }
  };

  /** The app, with one browser login already started as `binding-1`. */
  function mounted(providerClaims: Readonly<Record<string, unknown>> = claims) {
    const users = new UserRepository(openDrizzle(path), OPEN);
    const transactions = new InMemoryOidcTransactionStore({ now: () => now, ttlMs: 300_000 });
    transactions.save({
      browserBinding: 'binding-1',
      nonce: 'nonce-1',
      state: 'state-1',
      verifier: 'verifier-1',
    });
    const oidc = {
      appOrigin: 'https://dev.wbs.test',
      client: {
        authorizationUrl: (input: {
          nonce: string;
          state: string;
          verifier: string;
          redirectUri: string;
          prompt?: 'login';
        }) => {
          linkAuthorization = input;
          return Promise.resolve(new URL(`https://idp.test/authorize?state=${input.state}`));
        },
        exchange: (
          _callback: Request,
          checks: { nonce: string; state: string; verifier: string },
        ) => {
          exchanges++;
          exchangeChecks = checks;
          return Promise.resolve({
            accessToken: 'access-1',
            expiresIn: 900,
            idTokenClaims: providerClaims,
          });
        },
        refresh: () => Promise.reject(new Error('no refresh in this suite')),
        revoke: () => Promise.resolve(),
      },
      groupPrefix: 'dev',
      groupsClaim: 'wbs_groups',
      mode: 'oidc' as const,
      now: () => now,
      random: () => 'session-1',
      redirectUri: 'https://dev.wbs.test/api/auth/okta/callback',
      verifier: { verify: () => Promise.resolve(claims) },
      tokens: new InMemoryTokenStore({ now: () => now }),
      transactions,
    };
    auth = new AuthService({
      clock: testClock,
      users,
      identities: users,
      tokens: joseTokenCodec(randomBytes(32).toString('base64url')),
      passwords: {
        hash: (password) => bunPasswordHasher.hash(password),
        verify: async (password, hash) => {
          passwordVerifications++;
          if (passwordVerifyFault) throw new Error('password verifier unavailable');
          if (passwordVerifyHold !== null) await passwordVerifyHold;
          return bunPasswordHasher.verify(password, hash);
        },
      },
      oidc: buildOidcVerifier(oidc.verifier, oidc),
      passwordSessions: true,
    });
    return buildApp({
      organizations: legacyOrganizationAccess,
      memberships: refusingMemberships,
      emailVerification: refusingEmailVerification,
      emailDelivery: refusingTestEmailDelivery,
      onboarding: refusingOnboarding,
      loginThrottle: testLoginThrottle(5),
      clock: testClock,
      appOrigin: oidc.appOrigin,
      auth,
      capacity: testCapacityService(),
      directory: testDirectoryService(),
      history: testHistoryService(),
      calendarMarkers: testCalendarMarkerService(),
      internalAuthSecret: 'x'.repeat(32),
      writes: testWrites(),
      migrationsApplied: true,
      oidc,
      priorityBands: testPriorityBandService(),
      probeDatabase: () => 'ok',
      projects: testProjectService(),
      replay: testReplay().replay,
      steps: testStepService(),
      workItems: testWorkItemService(),
      savedPlans: testSavedPlanService(),
    });
  }
  const callback = () =>
    mounted().handle(
      new Request('https://dev.wbs.test/api/auth/okta/callback?code=c&state=state-1', {
        headers: { cookie: `${browserBindingCookieName('binding-1')}=binding-1` },
      }),
    );
  const legacyAccount = () => {
    sql(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('legacy', 'dany@puni.test', 'local-hash', 1)",
    );
  };
  const activate = () => {
    sql(
      "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
    );
  };

  async function startLink(app: ReturnType<typeof buildApp>, token: string, password: string) {
    return app.handle(
      new Request('https://dev.wbs.test/api/auth/link/auth0', {
        method: 'POST',
        headers: {
          cookie: `__Host-wbs_access=${token}`,
          origin: 'https://dev.wbs.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ password }),
      }),
    );
  }

  async function linkCallback(app: ReturnType<typeof buildApp>, start: Response, token: string) {
    const linkCookie = start.headers.get('set-cookie')?.split(';')[0];
    if (linkCookie === undefined) throw new Error('link cookie missing');
    const state = new URL(start.headers.get('location') ?? 'https://invalid.test').searchParams.get(
      'state',
    );
    if (state === null) throw new Error('link state missing');
    return app.handle(
      new Request(`https://dev.wbs.test/api/auth/link/auth0/callback?code=c&state=${state}`, {
        headers: { cookie: `__Host-wbs_access=${token}; ${linkCookie}` },
      }),
    );
  }

  it('links the email-shaped legacy account before activation, as today', async () => {
    legacyAccount();

    const res = await callback();

    expect(res.status).toBe(302);
    expect(all("SELECT idp_sub FROM users WHERE id = 'legacy'")).toEqual([
      { idp_sub: 'subject-1' },
    ]);
  });

  // Proof: resolving by the legacy email match after activation (the marker
  // branch skipped) made this answer 302 and sign in as `legacy`; skipping the
  // email-holder refusal made it answer 302 with a new account; watched
  // 2026-09-28.
  it('refuses an unmapped identity whose verified email an account holds, issuing no session', async () => {
    legacyAccount();
    activate();
    const before = all('SELECT * FROM users');

    const res = await callback();

    expect(res.status).toBe(409);
    expect(res.headers.get('set-cookie') ?? '').not.toContain('__Host-wbs_access=');
    expect(all('SELECT * FROM users')).toEqual(before);
    expect(all('SELECT * FROM external_identity')).toEqual([]);
  });

  it('refuses a mapped identity when its refreshed email belongs to another account', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, email, idp_issuer, idp_sub, created_at) VALUES ('mapped', 'dany-oidc', NULL, 'old@puni.test', 'https://idp.test', 'subject-1', 1)",
    );
    sql(
      "INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('m1', 'mapped', 'https://idp.test', 'subject-1', 1)",
    );
    legacyAccount();
    activate();

    const res = await callback();

    expect(res.status).toBe(409);
    expect(res.headers.get('set-cookie') ?? '').not.toContain('__Host-wbs_access=');
    expect(all("SELECT idp_sub FROM users WHERE id = 'legacy'")).toEqual([{ idp_sub: null }]);
    expect(all("SELECT email, email_verified FROM users WHERE id = 'mapped'")).toEqual([
      { email: 'old@puni.test', email_verified: 0 },
    ]);
  });

  it('signs a mapped identity in and refreshes its verified address', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, email, idp_issuer, idp_sub, created_at) VALUES ('mapped', 'dany-oidc', NULL, 'old@puni.test', 'https://idp.test', 'subject-1', 1)",
    );
    sql(
      "INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('m1', 'mapped', 'https://idp.test', 'subject-1', 1)",
    );
    activate();
    const res = await callback();
    expect(res.status).toBe(302);
    expect(res.headers.get('set-cookie')).toContain('__Host-wbs_access=');
    expect(all("SELECT email, email_verified FROM users WHERE id = 'mapped'")).toEqual([
      { email: 'dany@puni.test', email_verified: 1 },
    ]);
  });

  it('links a verified Auth0 identity only through the password session that began the flow', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await app.handle(
      new Request('https://dev.wbs.test/api/auth/link/auth0', {
        method: 'POST',
        headers: {
          cookie: `__Host-wbs_access=${registration.value.token}`,
          origin: 'https://dev.wbs.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ password: 'fresh-password' }),
      }),
    );
    expect(start.status).toBe(302);
    const linkCookie = start.headers.get('set-cookie')?.split(';')[0];
    if (linkCookie === undefined) throw new Error('link cookie missing');
    const callbackUrl = new URL(start.headers.get('location') ?? 'https://invalid.test');
    const state = callbackUrl.searchParams.get('state');
    if (state === null) throw new Error('link state missing');
    const callback = await app.handle(
      new Request(`https://dev.wbs.test/api/auth/link/auth0/callback?code=c&state=${state}`, {
        headers: { cookie: `__Host-wbs_access=${registration.value.token}; ${linkCookie}` },
      }),
    );
    expect(callback.status).toBe(302);
    if (linkAuthorization === null) throw new Error('link authorization missing');
    expect(linkAuthorization.redirectUri).toBe('https://dev.wbs.test/api/auth/link/auth0/callback');
    expect(linkAuthorization.prompt).toBe('login');
    expect(exchangeChecks).toEqual({
      nonce: linkAuthorization.nonce,
      state: linkAuthorization.state,
      verifier: linkAuthorization.verifier,
    });
    expect(all('SELECT user_id FROM external_identity')).toEqual([
      { user_id: registration.value.user.id },
    ]);
  });

  it('refuses link start before activation and with a wrong fresh password', async () => {
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    expect((await startLink(app, registration.value.token, 'fresh-password')).status).toBe(403);
    activate();
    expect((await startLink(app, registration.value.token, 'wrong-password')).status).toBe(401);
    expect(all('SELECT * FROM external_identity')).toEqual([]);
  });

  it('refuses a link start without a password session before throttle admission', async () => {
    activate();
    const app = mounted();
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/link/auth0', {
        method: 'POST',
        headers: { origin: 'https://dev.wbs.test', 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'fresh-password' }),
      }),
    );
    expect(response.status).toBe(401);
    expect(passwordVerifications).toBe(0);
  });

  it('refuses link start and callback after password sessions are disabled', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const policy = auth as unknown as { opts: { passwordSessions: boolean } };
    policy.opts.passwordSessions = false;
    expect((await startLink(app, registration.value.token, 'fresh-password')).status).toBe(401);
    policy.opts.passwordSessions = true;
    const start = await startLink(app, registration.value.token, 'fresh-password');
    expect(start.status).toBe(302);
    policy.opts.passwordSessions = false;
    expect((await linkCallback(app, start, registration.value.token)).status).toBe(401);
    expect(all('SELECT * FROM external_identity')).toEqual([]);
    expect(exchanges).toBe(0);
  });

  it('returns bodyless 401 for absent link cookie and 400 for malformed provider parameters', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    const state = new URL(start.headers.get('location') ?? 'https://invalid.test').searchParams.get(
      'state',
    );
    if (state === null) throw new Error('link state missing');
    const absent = await app.handle(
      new Request(`https://dev.wbs.test/api/auth/link/auth0/callback?code=c&state=${state}`, {
        headers: { cookie: `__Host-wbs_access=${registration.value.token}` },
      }),
    );
    expect(absent.status).toBe(401);
    expect(await absent.text()).toBe('');
    const malformed = await app.handle(
      new Request(`https://dev.wbs.test/api/auth/link/auth0/callback?state=${state}`, {
        headers: { cookie: `__Host-wbs_access=${registration.value.token}` },
      }),
    );
    expect(malformed.status).toBe(400);
    expect(await malformed.text()).toBe('');
    expect((await linkCallback(app, start, registration.value.token)).status).toBe(302);
  });

  it('admits at most five held fresh-password verifications and releases capacity', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    let releaseVerify: (() => void) | undefined;
    passwordVerifyHold = new Promise<void>((resolve) => {
      releaseVerify = resolve;
    });
    const held = Array.from({ length: 5 }, () =>
      startLink(app, registration.value.token, 'fresh-password'),
    );
    for (let attempt = 0; attempt < 100 && passwordVerifications < 5; attempt++) await Bun.sleep(1);
    expect(passwordVerifications).toBe(5);
    const sixth = startLink(app, registration.value.token, 'fresh-password');
    await Bun.sleep(20);
    const admitted = passwordVerifications;
    releaseVerify?.();
    const refused = await sixth;
    expect(admitted).toBe(5);
    expect(refused.status).toBe(429);
    expect((await Promise.all(held)).map((response) => response.status)).toEqual([
      302, 302, 302, 302, 302,
    ]);
    passwordVerifyHold = null;
    expect((await startLink(app, registration.value.token, 'fresh-password')).status).toBe(302);
  });

  it('releases fresh-password admission after verifier errors', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    passwordVerifyFault = true;
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await startLink(app, registration.value.token, 'fresh-password')).status).toBe(500);
    }
    passwordVerifyFault = false;
    expect((await startLink(app, registration.value.token, 'fresh-password')).status).toBe(302);
  });

  it('refuses a swapped originating password session without changing either account', async () => {
    activate();
    const app = mounted();
    const first = await auth.register('first_user', 'fresh-password');
    const second = await auth.register('second_user', 'fresh-password');
    if (!first.ok || !second.ok) throw new Error('test registration refused');
    const start = await startLink(app, first.value.token, 'fresh-password');
    expect(start.status).toBe(302);
    expect((await linkCallback(app, start, second.value.token)).status).toBe(401);
    expect(all('SELECT * FROM external_identity')).toEqual([]);
    expect(all('SELECT email FROM users ORDER BY username')).toEqual([
      { email: null },
      { email: null },
    ]);
    expect((await linkCallback(app, start, first.value.token)).status).toBe(302);
  });

  it('refuses a replayed link callback', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    expect((await linkCallback(app, start, registration.value.token)).status).toBe(302);
    expect((await linkCallback(app, start, registration.value.token)).status).toBe(401);
    expect(all('SELECT * FROM external_identity')).toHaveLength(1);
  });

  it('refuses a link whose originating account lost its password credential', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    sql("UPDATE users SET password_hash = NULL WHERE username = 'password_user'");
    expect((await linkCallback(app, start, registration.value.token)).status).toBe(401);
    expect(all('SELECT * FROM external_identity')).toEqual([]);
  });

  it('refuses a callback after activation is lost before contacting Auth0', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    sql('DROP TRIGGER organization_activation_no_revert');
    sql(
      "UPDATE organization_activation SET state = 'pre_activation', activated_at = NULL WHERE singleton = 1",
    );
    expect((await linkCallback(app, start, registration.value.token)).status).toBe(403);
    expect(exchanges).toBe(0);
    expect(all('SELECT * FROM external_identity')).toEqual([]);
  });

  it('rejects duplicate callback state without spending the link proof', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    const linkCookie = start.headers.get('set-cookie')?.split(';')[0];
    if (linkCookie === undefined) throw new Error('link cookie missing');
    const polluted = await app.handle(
      new Request('https://dev.wbs.test/api/auth/link/auth0/callback?code=c&state=one&state=two', {
        headers: { cookie: `__Host-wbs_access=${registration.value.token}; ${linkCookie}` },
      }),
    );
    expect(polluted.status).toBe(400);
    expect(await polluted.json()).toEqual({ error: 'duplicate_parameter' });
    expect((await linkCallback(app, start, registration.value.token)).status).toBe(302);
  });

  it('refuses a forged callback state while retaining the honest link', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    const linkCookie = start.headers.get('set-cookie')?.split(';')[0];
    if (linkCookie === undefined) throw new Error('link cookie missing');
    const forged = await app.handle(
      new Request('https://dev.wbs.test/api/auth/link/auth0/callback?code=c&state=forged', {
        headers: { cookie: `__Host-wbs_access=${registration.value.token}; ${linkCookie}` },
      }),
    );
    expect(forged.status).toBe(401);
    expect((await linkCallback(app, start, registration.value.token)).status).toBe(302);
  });

  it('refuses an Auth0 pair owned by another user even when email matches', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    sql(
      "INSERT INTO users (id, username, password_hash, email, created_at) VALUES ('other', 'other_user', 'hash', 'dany@puni.test', 1)",
    );
    sql(
      "INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('m', 'other', 'https://idp.test', 'subject-1', 1)",
    );
    const before = all('SELECT * FROM users ORDER BY id');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    expect((await linkCallback(app, start, registration.value.token)).status).toBe(409);
    expect(all('SELECT * FROM users ORDER BY id')).toEqual(before);
    expect(all('SELECT user_id FROM external_identity')).toEqual([{ user_id: 'other' }]);
  });

  it('refuses a mounted link when another account owns the canonical IDNA email', async () => {
    activate();
    const app = mounted({ ...claims, email: 'u@bücher.example' });
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    sql(
      "INSERT INTO users (id, username, password_hash, email, created_at) VALUES ('other', 'other_user', 'hash', 'u@xn--bcher-kva.example', 1)",
    );
    const start = await startLink(app, registration.value.token, 'fresh-password');
    expect((await linkCallback(app, start, registration.value.token)).status).toBe(409);
    expect(all('SELECT * FROM external_identity')).toEqual([]);
  });

  it('refuses a mounted link with a URL-shaped provider email domain', async () => {
    activate();
    const app = mounted({ ...claims, email: 'u@site.example/path' });
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    expect((await linkCallback(app, start, registration.value.token)).status).toBe(401);
    expect(all('SELECT * FROM external_identity')).toEqual([]);
  });

  it('refuses a verified Auth0 email already held by another local user', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    sql(
      "INSERT INTO users (id, username, password_hash, email, created_at) VALUES ('other', 'other_user', 'hash', 'dany@puni.test', 1)",
    );
    const start = await startLink(app, registration.value.token, 'fresh-password');
    expect((await linkCallback(app, start, registration.value.token)).status).toBe(409);
    expect(all('SELECT * FROM external_identity')).toEqual([]);
    expect(all("SELECT email FROM users WHERE username = 'password_user'")).toEqual([
      { email: null },
    ]);
  });

  it('refuses an Auth0 identity with no verified email', async () => {
    activate();
    const app = mounted({ ...claims, email_verified: false });
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    expect((await linkCallback(app, start, registration.value.token)).status).toBe(401);
    expect(all('SELECT * FROM external_identity')).toEqual([]);
  });
});
