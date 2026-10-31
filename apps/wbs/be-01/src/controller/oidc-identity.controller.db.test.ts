import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  browserBindingCookieName,
  buildOidcVerifier,
  InMemoryOidcTransactionStore,
  InMemoryTokenStore,
  type JwtClaims,
} from '@wbs/auth';
import { AuthService } from '@wbs/core/service/auth.service';
import { createLogger } from '@wbs/observability';
import { testStepParallels } from '@wbs/store-memory/testing/service-fixtures';
import {
  type BrowserAuthLifecycle,
  SqliteBrowserAuthLifecycle,
  SqliteBrowserCredentialRevocations,
} from '@wbs/store-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { errors, SignJWT } from 'jose';

import { buildApp } from '../app';
import { openDatabase, openDrizzle } from '../repository/db';
import { OPEN } from '../repository/gate';
import { runMigrations } from '../repository/migrate';
import { UserRepository } from '../repository/user';
import { bunPasswordHasher, joseTokenCodec } from '../runtime/bun-runtime';
import { nativeBrowserCredentialEvidence } from '../runtime/organization-credential';
import { testCalendarMarkerService } from '../testing/calendar-marker-fixture';
import { testCapacityService } from '../testing/capacity-fixture';
import { testClock } from '../testing/clock-fixture';
import { testDirectoryService } from '../testing/directory-fixture';
import {
  refusingEmailVerification,
  refusingInvitations,
  refusingJoinRequests,
  refusingTestEmailDelivery,
} from '../testing/email-verification-fixture';
import { testHistoryService } from '../testing/history-fixture';
import { testLoginThrottle } from '../testing/login-throttle-fixture';
import { refusingOnboarding } from '../testing/onboarding-fixture';
import {
  legacyOrganizationAccess,
  refusingDomains,
  refusingEnterpriseConnections,
  refusingMemberships,
  refusingRestoreApprovals,
} from '../testing/organization-access-fixture';
import { testPriorityBandService } from '../testing/priority-band-fixture';
import { refusingProjectAddressSearch } from '../testing/project-address-search-fixture';
import { testProjectService } from '../testing/project-fixture';
import { refusingProjectRanks } from '../testing/project-rank-fixture';
import { testReplay } from '../testing/replay-fixture';
import { testSavedPlanService } from '../testing/saved-plan-fixture';
import { refusingSpaces } from '../testing/space-fixture';
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
    connection?: string;
  } | null;
  /** Access tokens the OIDC verifier fixture answers for itself; `expired` throws as jose does. */
  let accessClaims: Map<string, JwtClaims | 'expired'>;
  let exchangeChecks: { nonce: string; state: string; verifier: string } | null;
  let passwordVerifyHold: Promise<void> | null;
  let passwordVerifications: number;
  let passwordVerifyFault: boolean;
  let refreshAccess: string;
  let refreshSecret: string;
  let refreshCalls: number;
  let refreshHold: Promise<void> | null;
  let refreshEntered: (() => void) | null;
  let refreshClaims: JwtClaims;
  let refreshVerifyFault: boolean;
  let refreshProviderFault: boolean;
  let revokeFault: boolean;
  let revokeCalls: number;
  let refreshResponse:
    | ((call: number) => Promise<{ accessToken: string; expiresIn: number; refreshToken: string }>)
    | null;
  let callbackAccessClaims: JwtClaims;
  /** What the pre-saved login transaction asked the provider for, if anything. */
  let savedReauthentication: { prompt: 'login'; maxAge: number | null } | undefined;
  let localTokens: InMemoryTokenStore;
  let nativeSessionKey: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-oidc-identity-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    exchanges = 0;
    linkAuthorization = null;
    accessClaims = new Map();
    exchangeChecks = null;
    passwordVerifyHold = null;
    passwordVerifications = 0;
    passwordVerifyFault = false;
    refreshAccess = 'access-from-refresh';
    refreshSecret = 'refresh-2';
    refreshCalls = 0;
    refreshHold = null;
    refreshEntered = null;
    refreshClaims = { ...claims, exp: Math.floor((now + 900_000) / 1000) };
    refreshVerifyFault = false;
    refreshProviderFault = false;
    revokeFault = false;
    revokeCalls = 0;
    refreshResponse = null;
    callbackAccessClaims = { ...claims, exp: Math.floor((now + 900_000) / 1000) };
    savedReauthentication = undefined;
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
  function mounted(
    providerClaims: Readonly<Record<string, unknown>> = claims,
    browserLifecycle?: BrowserAuthLifecycle,
    logLines?: string[],
    mode: 'oidc' | 'native' = 'oidc',
    authorityLifecycle?: BrowserAuthLifecycle | null,
    omitBrowserSession = false,
  ) {
    const users = new UserRepository(openDrizzle(path), OPEN);
    const transactions = new InMemoryOidcTransactionStore({ now: () => now, ttlMs: 300_000 });
    transactions.save({
      browserBinding: 'binding-1',
      nonce: 'nonce-1',
      state: 'state-1',
      verifier: 'verifier-1',
      ...(savedReauthentication === undefined ? {} : { reauthentication: savedReauthentication }),
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
          connection?: string;
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
            ...(browserLifecycle === undefined ? {} : { refreshToken: 'refresh-1' }),
          });
        },
        refresh: async () => {
          refreshCalls++;
          if (refreshResponse !== null) return refreshResponse(refreshCalls);
          refreshEntered?.();
          if (refreshHold !== null) await refreshHold;
          if (refreshProviderFault) throw new Error('provider outcome unavailable');
          return {
            accessToken: refreshAccess,
            expiresIn: 900,
            refreshToken: refreshSecret,
          };
        },
        revoke: () => {
          revokeCalls++;
          if (revokeFault) throw new Error('provider revoke unavailable');
          return Promise.resolve();
        },
      },
      groupPrefix: 'dev',
      groupsClaim: 'wbs_groups',
      methods: ['google', 'github'] as const,
      mode: 'oidc' as const,
      now: () => now,
      random: () => 'session-1',
      redirectUri: 'https://dev.wbs.test/api/auth/okta/callback',
      issuer: () => Promise.resolve('https://idp.test'),
      verifier: {
        verify: (token: string) => {
          const known = accessClaims.get(token);
          if (known === 'expired')
            throw new errors.JWTExpired('"exp" claim timestamp check failed', {});
          if (known !== undefined) return Promise.resolve(known);
          if (token === refreshAccess && refreshVerifyFault) throw new Error('JWKS unavailable');
          return Promise.resolve(
            token.startsWith('access-from-refresh')
              ? refreshClaims
              : token === 'access-1'
                ? callbackAccessClaims
                : claims,
          );
        },
      },
      browserLifecycle,
      tokens: (localTokens = new InMemoryTokenStore({ now: () => now })),
      transactions,
    };
    const sessionKey = (nativeSessionKey = randomBytes(32).toString('base64url'));
    auth = new AuthService({
      clock: testClock,
      users,
      identities: users,
      tokens: joseTokenCodec(sessionKey),
      passwords: {
        hash: (password) => bunPasswordHasher.hash(password),
        verify: async (password, hash) => {
          passwordVerifications++;
          if (passwordVerifyFault) throw new Error('password verifier unavailable');
          if (passwordVerifyHold !== null) await passwordVerifyHold;
          return bunPasswordHasher.verify(password, hash);
        },
      },
      ...(mode === 'oidc'
        ? { oidc: buildOidcVerifier(oidc.verifier, oidc), passwordSessions: true }
        : {}),
    });
    return buildApp(
      {
        projectAddressSearch: refusingProjectAddressSearch,
        organizations: legacyOrganizationAccess,
        memberships: refusingMemberships,
        sharedPeopleRestoreApprovals: refusingRestoreApprovals,
        domains: refusingDomains,
        enterpriseConnections: refusingEnterpriseConnections,
        emailVerification: refusingEmailVerification,
        invitations: refusingInvitations,
        joinRequests: refusingJoinRequests,
        spaces: refusingSpaces,
        projectRanks: refusingProjectRanks,
        emailDelivery: refusingTestEmailDelivery,
        onboarding: refusingOnboarding,
        loginThrottle: testLoginThrottle(5),
        clock: testClock,
        appOrigin: oidc.appOrigin,
        auth,
        capacity: testCapacityService(),
        directory: testDirectoryService(),
        history: testHistoryService(),
        stepParallels: testStepParallels(),
        calendarMarkers: testCalendarMarkerService(),
        internalAuthSecret: 'x'.repeat(32),
        writes: testWrites(),
        migrationsApplied: true,
        ...(mode === 'oidc' ? { oidc } : {}),
        ...(!omitBrowserSession &&
        (browserLifecycle !== undefined || mode === 'native' || authorityLifecycle !== undefined)
          ? {
              browserSession: {
                revocations: new SqliteBrowserCredentialRevocations(openDrizzle(path), OPEN),
                verifyNativeBrowserCredential: nativeBrowserCredentialEvidence(auth, sessionKey),
                ...(authorityLifecycle === null ||
                (browserLifecycle === undefined && authorityLifecycle === undefined)
                  ? { tokens: oidc.tokens, revokeProvider: oidc.client.revoke }
                  : {
                      lifecycle: authorityLifecycle ?? browserLifecycle,
                      tokens: oidc.tokens,
                      revokeProvider: oidc.client.revoke,
                    }),
              },
            }
          : {}),
        priorityBands: testPriorityBandService(),
        admitDependencyClient: () => null,
        probeDatabase: () => 'ok',
        projects: testProjectService(),
        replay: testReplay().replay,
        steps: testStepService(),
        workItems: testWorkItemService(),
        savedPlans: testSavedPlanService(),
      },
      (options) =>
        createLogger({
          ...options,
          ...(logLines === undefined
            ? {}
            : {
                destination: {
                  write: (line: string) => {
                    logLines.push(line);
                  },
                },
              }),
        }),
    );
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

  async function startLink(
    app: ReturnType<typeof buildApp>,
    token: string,
    password: string,
    edge: Readonly<Record<string, string>> = { 'x-forwarded-for': '203.0.113.7' },
  ) {
    return app.handle(
      new Request('https://dev.wbs.test/api/auth/link/auth0', {
        method: 'POST',
        headers: {
          cookie: `__Host-wbs_access=${token}`,
          origin: 'https://dev.wbs.test',
          'content-type': 'application/json',
          ...edge,
        },
        body: JSON.stringify({ password }),
      }),
    );
  }

  /** The state the link start's JSON location carries to Auth0. */
  async function linkState(start: Response): Promise<string | null> {
    const { location } = (await start.clone().json()) as { location: string };
    return new URL(location).searchParams.get('state');
  }

  /**
   * The `?auth_link=` outcome of a callback, which is always a 302 to the fixed
   * app path. Every outcome but `refused` is reached only after consumption,
   * so it must clear the binding cookie; `refused` may precede consumption.
   */
  function outcomeOf(callback: Response): string | null {
    expect(callback.status).toBe(302);
    const location = callback.headers.get('location') ?? '';
    expect(location).toMatch(/^\/\?auth_link=[a-z]+$/);
    const outcome = new URL(location, 'https://dev.wbs.test').searchParams.get('auth_link');
    if (outcome !== 'refused')
      expect(callback.headers.get('set-cookie')).toBe(
        '__Host-wbs_link=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
      );
    return outcome;
  }

  async function linkCallback(app: ReturnType<typeof buildApp>, start: Response, token: string) {
    const linkCookie = start.headers.get('set-cookie')?.split(';')[0];
    if (linkCookie === undefined) throw new Error('link cookie missing');
    const state = await linkState(start);
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
  // email-holder refusal made it answer 302 with a new account (both now fail the
  // account_exists location and the cookie assertions); watched
  // 2026-09-28.
  it('refuses an unmapped identity whose verified email an account holds, issuing no session', async () => {
    legacyAccount();
    activate();
    const before = all('SELECT * FROM users');

    const res = await callback();

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/?auth_error=account_exists');
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

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/?auth_error=account_exists');
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
          'x-forwarded-for': '203.0.113.7',
        },
        body: JSON.stringify({ password: 'fresh-password' }),
      }),
    );
    expect(start.status).toBe(200);
    const linkCookie = start.headers.get('set-cookie')?.split(';')[0];
    if (linkCookie === undefined) throw new Error('link cookie missing');
    const state = await linkState(start);
    if (state === null) throw new Error('link state missing');
    const callback = await app.handle(
      new Request(`https://dev.wbs.test/api/auth/link/auth0/callback?code=c&state=${state}`, {
        headers: { cookie: `__Host-wbs_access=${registration.value.token}; ${linkCookie}` },
      }),
    );
    expect(outcomeOf(callback)).toBe('linked');
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

  it('refuses a link start without an edge client address before throttle admission', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const response = await startLink(app, registration.value.token, 'fresh-password', {});
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_client' });
    expect(passwordVerifications).toBe(0);
    expect(all('SELECT * FROM external_identity')).toEqual([]);
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
    expect(start.status).toBe(200);
    policy.opts.passwordSessions = false;
    expect(outcomeOf(await linkCallback(app, start, registration.value.token))).toBe('refused');
    expect(all('SELECT * FROM external_identity')).toEqual([]);
    expect(exchanges).toBe(0);
  });

  it('answers an absent link cookie and malformed provider parameters as refused outcomes', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    const state = await linkState(start);
    if (state === null) throw new Error('link state missing');
    const absent = await app.handle(
      new Request(`https://dev.wbs.test/api/auth/link/auth0/callback?code=c&state=${state}`, {
        headers: { cookie: `__Host-wbs_access=${registration.value.token}` },
      }),
    );
    expect(outcomeOf(absent)).toBe('refused');
    expect(await absent.text()).toBe('');
    const malformed = await app.handle(
      new Request(`https://dev.wbs.test/api/auth/link/auth0/callback?state=${state}`, {
        headers: { cookie: `__Host-wbs_access=${registration.value.token}` },
      }),
    );
    expect(outcomeOf(malformed)).toBe('refused');
    expect(await malformed.text()).toBe('');
    expect(outcomeOf(await linkCallback(app, start, registration.value.token))).toBe('linked');
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
      200, 200, 200, 200, 200,
    ]);
    passwordVerifyHold = null;
    expect((await startLink(app, registration.value.token, 'fresh-password')).status).toBe(200);
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
    expect((await startLink(app, registration.value.token, 'fresh-password')).status).toBe(200);
  });

  it('refuses a swapped originating password session without changing either account', async () => {
    activate();
    const app = mounted();
    const first = await auth.register('first_user', 'fresh-password');
    const second = await auth.register('second_user', 'fresh-password');
    if (!first.ok || !second.ok) throw new Error('test registration refused');
    const start = await startLink(app, first.value.token, 'fresh-password');
    expect(start.status).toBe(200);
    expect(outcomeOf(await linkCallback(app, start, second.value.token))).toBe('refused');
    expect(all('SELECT * FROM external_identity')).toEqual([]);
    expect(all('SELECT email FROM users ORDER BY username')).toEqual([
      { email: null },
      { email: null },
    ]);
    expect(outcomeOf(await linkCallback(app, start, first.value.token))).toBe('linked');
  });

  it('refuses a replayed link callback', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    expect(outcomeOf(await linkCallback(app, start, registration.value.token))).toBe('linked');
    expect(outcomeOf(await linkCallback(app, start, registration.value.token))).toBe('refused');
    expect(all('SELECT * FROM external_identity')).toHaveLength(1);
  });

  it('refuses a link whose originating account lost its password credential', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    sql("UPDATE users SET password_hash = NULL WHERE username = 'password_user'");
    expect(outcomeOf(await linkCallback(app, start, registration.value.token))).toBe('refused');
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
    expect(outcomeOf(await linkCallback(app, start, registration.value.token))).toBe('inactive');
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
    expect(outcomeOf(await linkCallback(app, start, registration.value.token))).toBe('linked');
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
    expect(outcomeOf(forged)).toBe('refused');
    expect(outcomeOf(await linkCallback(app, start, registration.value.token))).toBe('linked');
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
    expect(outcomeOf(await linkCallback(app, start, registration.value.token))).toBe('collision');
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
    expect(outcomeOf(await linkCallback(app, start, registration.value.token))).toBe('collision');
    expect(all('SELECT * FROM external_identity')).toEqual([]);
  });

  it('refuses a mounted link with a URL-shaped provider email domain', async () => {
    activate();
    const app = mounted({ ...claims, email: 'u@site.example/path' });
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    expect(outcomeOf(await linkCallback(app, start, registration.value.token))).toBe('refused');
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
    expect(outcomeOf(await linkCallback(app, start, registration.value.token))).toBe('collision');
    expect(all('SELECT * FROM external_identity')).toEqual([]);
    expect(all("SELECT email FROM users WHERE username = 'password_user'")).toEqual([
      { email: null },
    ]);
  });

  it('redirects every failure to the fixed outcome path without echoing the request', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    const linkCookie = start.headers.get('set-cookie')?.split(';')[0];
    if (linkCookie === undefined) throw new Error('link cookie missing');
    const hostile = await app.handle(
      new Request(
        'https://dev.wbs.test/api/auth/link/auth0/callback?state=forged&error=https%3A%2F%2Fevil.test&error_description=%2F%2Fevil.test',
        { headers: { cookie: `__Host-wbs_access=${registration.value.token}; ${linkCookie}` } },
      ),
    );
    expect(hostile.headers.get('location')).toBe('/?auth_link=refused');
    expect(await hostile.text()).toBe('');
    expect(exchanges).toBe(0);
  });

  it('clears the link cookie once a callback consumes or lacks it', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const cleared = '__Host-wbs_link=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
    const absent = await app.handle(
      new Request('https://dev.wbs.test/api/auth/link/auth0/callback?code=c&state=s', {
        headers: { cookie: `__Host-wbs_access=${registration.value.token}` },
      }),
    );
    expect(absent.headers.get('set-cookie')).toBe(cleared);
    const replayed = await startLink(app, registration.value.token, 'fresh-password');
    expect(outcomeOf(await linkCallback(app, replayed, registration.value.token))).toBe('linked');
    const linkCookie = replayed.headers.get('set-cookie')?.split(';')[0];
    if (linkCookie === undefined) throw new Error('link cookie missing');
    const state = await linkState(replayed);
    const again = await app.handle(
      new Request(`https://dev.wbs.test/api/auth/link/auth0/callback?code=c&state=${state ?? ''}`, {
        headers: { cookie: `__Host-wbs_access=${registration.value.token}; ${linkCookie}` },
      }),
    );
    // Consumed on the first callback, so the replay matches nothing and keeps
    // whatever cookie the browser still holds.
    expect(again.headers.get('location')).toBe('/?auth_link=refused');
    expect(again.headers.get('set-cookie')).toBeNull();
  });

  it('keeps the link cookie through a forged callback so the honest one still links', async () => {
    activate();
    const app = mounted();
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    const linkCookie = start.headers.get('set-cookie')?.split(';')[0];
    if (linkCookie === undefined) throw new Error('link cookie missing');
    const browser = `__Host-wbs_access=${registration.value.token}; ${linkCookie}`;
    for (const forged of [
      '?code=c&state=forged',
      '?state=forged&error=access_denied',
      '?code=c',
      '?code=c&state=a&state=b',
    ]) {
      const answer = await app.handle(
        new Request(`https://dev.wbs.test/api/auth/link/auth0/callback${forged}`, {
          headers: { cookie: browser },
        }),
      );
      expect(answer.headers.get('set-cookie')).toBeNull();
    }
    const headed = await app.handle(
      new Request('https://dev.wbs.test/api/auth/link/auth0/callback?code=c&state=a', {
        method: 'HEAD',
        headers: { cookie: browser },
      }),
    );
    expect(headed.status).toBe(405);
    expect(headed.headers.get('set-cookie')).toBeNull();
    const state = await linkState(start);
    const honest = await app.handle(
      new Request(`https://dev.wbs.test/api/auth/link/auth0/callback?code=c&state=${state ?? ''}`, {
        headers: { cookie: browser },
      }),
    );
    expect(outcomeOf(honest)).toBe('linked');
    expect(all('SELECT user_id FROM external_identity')).toEqual([
      { user_id: registration.value.user.id },
    ]);
  });

  /** A Google-first account G holding `subject-1`, mapped, as activation leaves it. */
  const googleAccount = (id = 'g', subject = 'subject-1') => {
    sql(
      `INSERT INTO users (id, username, password_hash, email, email_verified, idp_issuer, idp_sub, created_at) VALUES ('${id}', '${id}-oidc', NULL, '${id}@puni.test', 1, 'https://idp.test', '${subject}', 1)`,
    );
    sql(
      `INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('map-${id}', '${id}', 'https://idp.test', '${subject}', 1)`,
    );
  };
  const githubClaims = { ...claims, sub: 'github|2', email: 'g@puni.test' };
  const startOidcLink = (
    app: ReturnType<typeof buildApp>,
    token: string,
    body: Readonly<Record<string, string>>,
  ) =>
    app.handle(
      new Request('https://dev.wbs.test/api/auth/link/auth0', {
        method: 'POST',
        headers: {
          cookie: `__Host-wbs_access=${token}`,
          origin: 'https://dev.wbs.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
    );

  it('adds a second method to an OIDC session without a password', async () => {
    activate();
    googleAccount('g', 'google-oauth2|1');
    accessClaims.set('google-access', {
      ...claims,
      sub: 'google-oauth2|1',
      exp: Math.floor((now + 900_000) / 1000),
    });
    const app = mounted(githubClaims);
    const start = await startOidcLink(app, 'google-access', { method: 'github' });
    expect(start.status).toBe(200);
    expect(linkAuthorization).toMatchObject({ prompt: 'login', connection: 'github' });
    expect(passwordVerifications).toBe(0);
    expect(outcomeOf(await linkCallback(app, start, 'google-access'))).toBe('linked');
    expect(all('SELECT user_id, subject FROM external_identity ORDER BY subject')).toEqual([
      { user_id: 'g', subject: 'github|2' },
      { user_id: 'g', subject: 'google-oauth2|1' },
    ]);

    // A later GitHub sign-in is the same user, and so is a Bearer carrying it.
    const login = await app.handle(
      new Request('https://dev.wbs.test/api/auth/okta/callback?code=c&state=state-1', {
        headers: { cookie: `${browserBindingCookieName('binding-1')}=binding-1` },
      }),
    );
    expect(login.status).toBe(302);
    expect(login.headers.get('location')).toBe('/');
    expect(all('SELECT id FROM users')).toEqual([{ id: 'g' }]);
    accessClaims.set('github-access', { ...githubClaims, exp: Math.floor((now + 900_000) / 1000) });
    const me = await app.handle(
      new Request('https://dev.wbs.test/api/auth/me', {
        headers: { authorization: 'Bearer github-access' },
      }),
    );
    expect(((await me.json()) as { user: { id: string } }).user.id).toBe('g');

    // Linked methods come from the mappings, not from the presented token's claims.
    // Proof: 2026-10-11, answering no mapped pairs from the account read made
    // this answer [] instead of both.
    const viaGoogle = await app.handle(
      new Request('https://dev.wbs.test/api/auth/me', {
        headers: { authorization: 'Bearer google-access' },
      }),
    );
    expect(
      ((await viaGoogle.json()) as { user: { linkedMethods: string[] } }).user.linkedMethods,
    ).toEqual(['google', 'github']);
  });

  it('still asks a password session for its fresh password', async () => {
    activate();
    const app = mounted(githubClaims);
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const bare = await startOidcLink(app, registration.value.token, { method: 'github' });
    expect(bare.status).toBe(401);
    expect(await bare.json()).toEqual({ error: 'invalid_credentials' });
    expect(linkAuthorization).toBeNull();
    const proved = await app.handle(
      new Request('https://dev.wbs.test/api/auth/link/auth0', {
        method: 'POST',
        headers: {
          cookie: `__Host-wbs_access=${registration.value.token}`,
          origin: 'https://dev.wbs.test',
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.7',
        },
        body: JSON.stringify({ password: 'fresh-password', method: 'google' }),
      }),
    );
    expect(proved.status).toBe(200);
    expect(linkAuthorization).toMatchObject({ prompt: 'login', connection: 'google-oauth2' });
  });

  it('refuses a password sent with an OIDC session', async () => {
    activate();
    googleAccount();
    accessClaims.set('google-access', { ...claims, exp: Math.floor((now + 900_000) / 1000) });
    const app = mounted(githubClaims);
    const start = await startOidcLink(app, 'google-access', {
      method: 'github',
      password: 'anything',
    });
    // Proof: 2026-10-11, accepting a password on an OIDC session made this
    // start a link (200) instead of 400.
    expect(start.status).toBe(400);
    expect(await start.json()).toEqual({ error: 'invalid_body' });
    expect(linkAuthorization).toBeNull();
  });

  it('refuses a link start whose OIDC token no longer verifies', async () => {
    activate();
    googleAccount();
    accessClaims.set('stale-access', 'expired');
    const app = mounted(githubClaims);
    const start = await startOidcLink(app, 'stale-access', { method: 'github' });
    // Proof: 2026-10-11, dropping `sessionUser`'s refusal of an unverified
    // OIDC token made this answer 500 instead of 401.
    expect(start.status).toBe(401);
    expect(linkAuthorization).toBeNull();
  });

  it('refuses a disabled method before contacting Auth0', async () => {
    activate();
    googleAccount();
    accessClaims.set('google-access', { ...claims, exp: Math.floor((now + 900_000) / 1000) });
    const app = mounted(githubClaims);
    const start = await startOidcLink(app, 'google-access', { method: 'apple' });
    expect(start.status).toBe(400);
    expect(await start.json()).toEqual({ error: 'invalid_body' });
    expect(linkAuthorization).toBeNull();
    expect(start.headers.get('set-cookie')).toBeNull();
  });

  it('refuses a replayed or swapped callback of an OIDC-started link', async () => {
    activate();
    googleAccount();
    googleAccount('h', 'subject-h');
    const fresh = Math.floor((now + 900_000) / 1000);
    accessClaims.set('google-access', { ...claims, exp: fresh });
    accessClaims.set('h-access', { ...claims, sub: 'subject-h', exp: fresh });
    const app = mounted(githubClaims);
    const start = await startOidcLink(app, 'google-access', { method: 'github' });
    expect(outcomeOf(await linkCallback(app, start, 'h-access'))).toBe('refused');
    expect(all("SELECT * FROM external_identity WHERE subject = 'github|2'")).toEqual([]);
    expect(outcomeOf(await linkCallback(app, start, 'google-access'))).toBe('linked');
    expect(outcomeOf(await linkCallback(app, start, 'google-access'))).toBe('refused');
    expect(all("SELECT user_id FROM external_identity WHERE subject = 'github|2'")).toEqual([
      { user_id: 'g' },
    ]);
  });

  it('answers collision when the second pair already belongs to another user', async () => {
    activate();
    googleAccount();
    googleAccount('h', 'github|2');
    accessClaims.set('google-access', { ...claims, exp: Math.floor((now + 900_000) / 1000) });
    const app = mounted(githubClaims);
    const start = await startOidcLink(app, 'google-access', { method: 'github' });
    expect(outcomeOf(await linkCallback(app, start, 'google-access'))).toBe('collision');
    expect(all("SELECT user_id FROM external_identity WHERE subject = 'github|2'")).toEqual([
      { user_id: 'h' },
    ]);
  });

  it('refuses an Auth0 identity with no verified email', async () => {
    activate();
    const app = mounted({ ...claims, email_verified: false });
    const registration = await auth.register('password_user', 'fresh-password');
    if (!registration.ok) throw new Error('test registration refused');
    const start = await startLink(app, registration.value.token, 'fresh-password');
    expect(outcomeOf(await linkCallback(app, start, registration.value.token))).toBe('refused');
    expect(all('SELECT * FROM external_identity')).toEqual([]);
  });

  // A token without `wbs_groups` is a machine's (`wbs-machine-credentials`
  // A18): it proves no browser session, so a retired link row cannot start a
  // link that would add a sign-in method to the human's account.
  // Proof: with `sessionUser`'s groups check removed, this started the link
  // (200) and asked the provider for an authorization URL; watched 2026-10-25.
  it('refuses a link start under a groups-less cookie whose pair is linked', async () => {
    activate();
    googleAccount('g', 'google-oauth2|1');
    sql(
      "INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('map-fleet', 'g', 'https://idp.test', 'claire-m2m@clients', 1)",
    );
    accessClaims.set('fleet-access', {
      iss: 'https://idp.test',
      sub: 'claire-m2m@clients',
      exp: Math.floor((now + 900_000) / 1000),
    });
    const app = mounted(githubClaims);
    const before = all('SELECT user_id, subject FROM external_identity ORDER BY subject');

    const start = await startOidcLink(app, 'fleet-access', { method: 'github' });
    expect(start.status).toBe(401);
    expect(linkAuthorization).toBeNull();
    expect(all('SELECT user_id, subject FROM external_identity ORDER BY subject')).toEqual(before);
  });

  // Proof: with the refresh path's groups check removed, this answered 204
  // and replaced the lifecycle's credential; watched 2026-10-25.
  it('refuses a refreshed access token without groups, leaving the lifecycle alone', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const credential = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', credential, { openedAt: 1, reauthenticatedAt: null });
    const { wbs_groups: _groups, ...groupless } = claims;
    refreshClaims = { ...groupless, exp: Math.floor((now + 900_000) / 1000) };
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential,
    });

    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
        },
      }),
    );
    expect(response.status).toBe(401);
    expect(await lifecycle.generation('session-1')).toEqual({ generation: 1, current: credential });
  });

  it('refuses a verified refresh identity for another local user before lifecycle CAS', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('foreign', 'foreign', NULL, 'https://idp.test', 'subject-2', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const revoked = new SqliteBrowserCredentialRevocations(openDrizzle(path), OPEN);
    const credential = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', credential, { openedAt: 1, reauthenticatedAt: null });
    refreshClaims = { ...claims, sub: 'subject-2', exp: Math.floor((now + 900_000) / 1000) };
    let replacements = 0;
    const observedLifecycle: BrowserAuthLifecycle = {
      open: (...args) => lifecycle.open(...args),
      generation: (...args) => lifecycle.generation(...args),
      proveAssociation: (...args) => lifecycle.proveAssociation(...args),
      replace: (...args) => {
        replacements++;
        return lifecycle.replace(...args);
      },
      close: (...args) => lifecycle.close(...args),
    };
    const app = mounted(claims, observedLifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential,
    });
    const before = all(
      'SELECT id, username, email, idp_issuer, idp_sub, updated_at FROM users ORDER BY id',
    );
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
        },
      }),
    );
    expect(response.status).toBe(401);
    expect(replacements).toBe(0);
    expect(response.headers.get('set-cookie')).not.toContain(
      '__Host-wbs_access=access-from-refresh;',
    );
    expect(await lifecycle.generation('session-1')).toEqual({ generation: 1, current: credential });
    expect(await revoked.isRevoked(credential)).toBe(false);
    expect(
      all('SELECT id, username, email, idp_issuer, idp_sub, updated_at FROM users ORDER BY id'),
    ).toEqual(before);
  });

  it('refuses an unknown same-email refresh subject without creating or linking an account', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    sql(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('legacy', 'dany@puni.test', 'hash', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const credential = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', credential, { openedAt: 1, reauthenticatedAt: null });
    refreshClaims = { ...claims, sub: 'unknown-subject', exp: Math.floor((now + 900_000) / 1000) };
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential,
    });
    const before = all(
      'SELECT id, username, email, idp_issuer, idp_sub, updated_at FROM users ORDER BY id',
    );
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
        },
      }),
    );
    expect(response.status).toBe(401);
    expect(await lifecycle.generation('session-1')).toEqual({ generation: 1, current: credential });
    expect(
      all('SELECT id, username, email, idp_issuer, idp_sub, updated_at FROM users ORDER BY id'),
    ).toEqual(before);
  });

  it('commits verified refresh replacement before rotated local material and cookies', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const revoked = new SqliteBrowserCredentialRevocations(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
        },
      }),
    );
    const successor = {
      ...first,
      digest: createHash('sha256').update(refreshAccess).digest('hex'),
    };
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toContain('__Host-wbs_access=access-from-refresh;');
    expect(response.headers.get('set-cookie')).toContain('__Host-wbs_organization=;');
    expect(await lifecycle.generation('session-1')).toEqual({ generation: 2, current: successor });
    expect(await revoked.isRevoked(first)).toBe(true);
    expect(await revoked.isRevoked(successor)).toBe(false);
    expect(localTokens.read('session-1')).toMatchObject({
      refreshToken: 'refresh-2',
      generation: 2,
      userId: 'captured',
      credential: successor,
    });
  });

  it('uses durable CAS when the provider retains its refresh secret', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    refreshSecret = 'refresh-1';
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: { origin: 'https://dev.wbs.test', cookie: '__Host-wbs_session=session-1' },
      }),
    );
    expect(response.status).toBe(204);
    expect((await lifecycle.generation('session-1')).generation).toBe(2);
    expect(localTokens.read('session-1')).toMatchObject({
      refreshToken: 'refresh-1',
      generation: 2,
    });
  });

  it('refuses identical replacement access bytes without revoking and reissuing them', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    refreshAccess = 'access-1';
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const revoked = new SqliteBrowserCredentialRevocations(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: { origin: 'https://dev.wbs.test', cookie: '__Host-wbs_session=session-1' },
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).not.toContain('__Host-wbs_access=access-1;');
    expect(await lifecycle.generation('session-1')).toEqual({ generation: 1, current: first });
    expect(await revoked.isRevoked(first)).toBe(false);
  });

  it('refuses a stale local generation before provider I/O', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    const second = { ...first, digest: createHash('sha256').update('access-2').digest('hex') };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    await lifecycle.replace('session-1', 1, first, second, now);
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: { origin: 'https://dev.wbs.test', cookie: '__Host-wbs_session=session-1' },
      }),
    );
    expect(response.status).toBe(401);
    expect(refreshCalls).toBe(0);
    expect(await lifecycle.generation('session-1')).toEqual({ generation: 2, current: second });
  });

  it('refuses duplicate access-cookie carriers before provider I/O', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          cookie:
            '__Host-wbs_session=session-1; __Host-wbs_access=access-1; __Host-wbs_access=access-1',
        },
      }),
    );
    expect(response.status).toBe(401);
    expect(refreshCalls).toBe(0);
    expect(await lifecycle.generation('session-1')).toEqual({ generation: 1, current: first });
  });

  it('uses an expired presented access token only as an exact retained association', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('expired-access').digest('hex'),
      expiresAt: now - 1_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          cookie: '__Host-wbs_session=session-1; __Host-wbs_access=expired-access',
        },
      }),
    );
    expect(response.status).toBe(204);
    expect((await lifecycle.generation('session-1')).generation).toBe(2);
  });

  it('refuses a same-user access token from another lifecycle before provider I/O', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    const foreign = {
      ...first,
      digest: createHash('sha256').update('foreign-access').digest('hex'),
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    await lifecycle.open('session-2', foreign, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          cookie: '__Host-wbs_session=session-1; __Host-wbs_access=foreign-access',
        },
      }),
    );
    expect(response.status).toBe(401);
    expect(refreshCalls).toBe(0);
    expect(await lifecycle.generation('session-1')).toEqual({ generation: 1, current: first });
    expect(await lifecycle.generation('session-2')).toEqual({ generation: 1, current: foreign });
  });

  it('refuses refresh after restart without the process-local provider secret', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    const restarted = mounted(claims, lifecycle);
    const response = await restarted.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
        },
      }),
    );
    expect(response.status).toBe(401);
    expect(refreshCalls).toBe(0);
    expect(await lifecycle.generation('session-1')).toEqual({ generation: 1, current: first });
  });

  it('refuses provider access without a verified future expiry before lifecycle CAS', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    refreshClaims = claims;
    let replacements = 0;
    const observedLifecycle: BrowserAuthLifecycle = {
      open: (...args) => lifecycle.open(...args),
      generation: (...args) => lifecycle.generation(...args),
      proveAssociation: (...args) => lifecycle.proveAssociation(...args),
      replace: (...args) => {
        replacements++;
        return lifecycle.replace(...args);
      },
      close: (...args) => lifecycle.close(...args),
    };
    const app = mounted(claims, observedLifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: { origin: 'https://dev.wbs.test', cookie: '__Host-wbs_session=session-1' },
      }),
    );
    expect(response.status).toBe(401);
    expect(replacements).toBe(0);
    expect(await lifecycle.generation('session-1')).toEqual({ generation: 1, current: first });
  });

  it.each([
    { providerSecret: 'refresh-2', remains: false },
    { providerSecret: 'refresh-1', remains: true },
  ])(
    'classifies a verified-evidence exception by explicit provider rotation ($providerSecret)',
    async ({ providerSecret, remains }) => {
      sql(
        "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
      );
      const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
      const first = {
        kind: 'oidc' as const,
        userId: 'captured',
        digest: createHash('sha256').update('access-1').digest('hex'),
        expiresAt: now + 900_000,
      };
      await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
      refreshSecret = providerSecret;
      const app = mounted(claims, lifecycle);
      localTokens.save({
        sessionCorrelation: 'session-1',
        refreshToken: 'refresh-1',
        expiresAt: now + 86_400_000,
        userId: 'captured',
        generation: 1,
        credential: first,
      });
      refreshVerifyFault = true;
      const response = await app.handle(
        new Request('https://dev.wbs.test/api/auth/refresh', {
          method: 'POST',
          headers: { origin: 'https://dev.wbs.test', cookie: '__Host-wbs_session=session-1' },
        }),
      );
      expect(response.status).toBe(500);
      expect(response.headers.get('set-cookie')).toBeNull();
      if (remains) expect(localTokens.read('session-1')?.refreshToken).toBe('refresh-1');
      else expect(localTokens.read('session-1')).toBeNull();
      expect(await lifecycle.generation('session-1')).toEqual({ generation: 1, current: first });
    },
  );

  it('refuses delegated Authorization before provider IO without clearing the browser', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          cookie: '__Host-wbs_session=session-1',
          authorization: 'Bearer wbs-delegation+jwt',
        },
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(refreshCalls).toBe(0);
    expect(localTokens.read('session-1')?.refreshToken).toBe('refresh-1');
  });

  it('removes captured rotated material when read-only identity lookup fails', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    auth.readExistingOidcIdentity = () => {
      throw new Error('identity store unavailable');
    };
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: { origin: 'https://dev.wbs.test', cookie: '__Host-wbs_session=session-1' },
      }),
    );
    expect(response.status).toBe(500);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(localTokens.read('session-1')).toBeNull();
    expect(await lifecycle.generation('session-1')).toEqual({ generation: 1, current: first });
  });

  it('invalidates only the claimed material after an uncertain provider failure', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    refreshProviderFault = true;
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: { origin: 'https://dev.wbs.test', cookie: '__Host-wbs_session=session-1' },
      }),
    );
    expect(response.status).toBe(500);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(localTokens.read('session-1')).toBeNull();
    expect(await lifecycle.generation('session-1')).toEqual({ generation: 1, current: first });
  });

  it('retains provider and cleanup fault context when spent-secret removal fails', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    const logs: string[] = [];
    const app = mounted(claims, lifecycle, logs);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    const claim = localTokens.claimIfCurrent.bind(localTokens);
    localTokens.claimIfCurrent = (...args) => {
      const owner = claim(...args);
      if (owner === null || owner === 'busy') return owner;
      return {
        ...owner,
        delete: () => {
          throw new Error('cleanup unavailable');
        },
      };
    };
    refreshVerifyFault = true;
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: { origin: 'https://dev.wbs.test', cookie: '__Host-wbs_session=session-1' },
      }),
    );
    expect(response.status).toBe(500);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('refresh failed and local cleanup failed');
    expect(logs[0]).toContain('JWKS unavailable');
    expect(logs[0]).toContain('cleanup unavailable');
  });

  it('refuses a contender without provider IO while the owner is paused after durable CAS', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    let releaseInstall = (): void => {
      throw new Error('install hold missing');
    };
    const installHold = new Promise<void>((resolve) => {
      releaseInstall = resolve;
    });
    let reportCommitted = (): void => {
      throw new Error('commit signal missing');
    };
    const committed = new Promise<void>((resolve) => {
      reportCommitted = resolve;
    });
    const observedLifecycle: BrowserAuthLifecycle = {
      open: (...args) => lifecycle.open(...args),
      generation: (...args) => lifecycle.generation(...args),
      proveAssociation: (...args) => lifecycle.proveAssociation(...args),
      replace: async (...args) => {
        const generation = await lifecycle.replace(...args);
        reportCommitted();
        await installHold;
        return generation;
      },
      close: (...args) => lifecycle.close(...args),
    };
    const app = mounted(claims, observedLifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    const request = () =>
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
        },
      });
    const firstResponse = app.handle(request());
    await committed;
    const contender = await app.handle(request());
    expect(contender.status).toBe(409);
    expect(await contender.json()).toEqual({ error: 'refresh_in_progress' });
    expect(contender.headers.get('set-cookie')).toBeNull();
    expect(refreshCalls).toBe(1);
    expect((await lifecycle.generation('session-1')).generation).toBe(2);
    releaseInstall();
    const winner = await firstResponse;
    expect(winner.status).toBe(204);
    expect(winner.headers.get('set-cookie')).toContain('__Host-wbs_access=access-from-refresh;');
    expect((await lifecycle.generation('session-1')).generation).toBe(2);
    expect(localTokens.read('session-1')).toMatchObject({
      generation: 2,
      refreshToken: 'refresh-2',
    });
  });

  it('allows another correlation to refresh while one provider attempt is paused', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    const second = { ...first, digest: createHash('sha256').update('access-2').digest('hex') };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    await lifecycle.open('session-2', second, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    localTokens.save({
      sessionCorrelation: 'session-2',
      refreshToken: 'refresh-2',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: second,
    });
    let releaseFirst = (): void => {
      throw new Error('first hold missing');
    };
    const firstHold = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let reportFirst = (): void => {
      throw new Error('first signal missing');
    };
    const firstEntered = new Promise<void>((resolve) => {
      reportFirst = resolve;
    });
    refreshResponse = async (call) => {
      if (call === 1) {
        reportFirst();
        await firstHold;
      }
      return {
        accessToken: `access-from-refresh-${String(call)}`,
        expiresIn: 900,
        refreshToken: `new-refresh-${String(call)}`,
      };
    };
    const request = (session: string, access: string) =>
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          cookie: `__Host-wbs_session=${session}; __Host-wbs_access=${access}`,
        },
      });
    const pending = app.handle(request('session-1', 'access-1'));
    await firstEntered;
    const independent = await app.handle(request('session-2', 'access-2'));
    expect(independent.status).toBe(204);
    expect(refreshCalls).toBe(2);
    expect(localTokens.read('session-2')).toMatchObject({
      generation: 2,
      refreshToken: 'new-refresh-2',
    });
    releaseFirst();
    expect((await pending).status).toBe(204);
    expect(localTokens.read('session-1')).toMatchObject({
      generation: 2,
      refreshToken: 'new-refresh-1',
    });
  });

  it('does not reinstall an owned refresh after logout closes its durable successor', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    let releaseInstall = (): void => {
      throw new Error('install hold missing');
    };
    const installHold = new Promise<void>((resolve) => {
      releaseInstall = resolve;
    });
    let reportCommitted = (): void => {
      throw new Error('commit signal missing');
    };
    const committed = new Promise<void>((resolve) => {
      reportCommitted = resolve;
    });
    const observedLifecycle: BrowserAuthLifecycle = {
      open: (...args) => lifecycle.open(...args),
      generation: (...args) => lifecycle.generation(...args),
      proveAssociation: (...args) => lifecycle.proveAssociation(...args),
      replace: async (...args) => {
        const generation = await lifecycle.replace(...args);
        reportCommitted();
        await installHold;
        return generation;
      },
      close: (...args) => lifecycle.close(...args),
    };
    const app = mounted(claims, observedLifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    const pending = app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
        },
      }),
    );
    await committed;
    expect(await lifecycle.close('session-1', { kind: 'oidc', digest: first.digest }, now)).toBe(
      'closed',
    );
    expect(localTokens.delete('session-1')).toBe(true);
    releaseInstall();
    const response = await pending;
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).not.toContain(
      '__Host-wbs_access=access-from-refresh;',
    );
    expect(localTokens.read('session-1')).toBeNull();
    await lifecycle.generation('session-1').then(
      () => {
        throw new Error('closed lifecycle returned a generation');
      },
      (cause: unknown) => {
        expect(cause).toBeInstanceOf(Error);
      },
    );
  });

  it('logs out a refreshed lifecycle using its retained predecessor association', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const revoked = new SqliteBrowserCredentialRevocations(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    const refresh = await app.handle(
      new Request('https://dev.wbs.test/api/auth/refresh', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
        },
      }),
    );
    expect(refresh.status).toBe(204);
    const successor = (await lifecycle.generation('session-1')).current;
    const logout = () =>
      app.handle(
        new Request('https://dev.wbs.test/api/auth/logout', {
          method: 'POST',
          headers: {
            origin: 'https://dev.wbs.test',
            cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
          },
        }),
      );
    expect((await logout()).status).toBe(204);
    expect(await revoked.isRevoked(first)).toBe(true);
    expect(await revoked.isRevoked(successor)).toBe(true);
    expect(localTokens.read('session-1')).toBeNull();
    await lifecycle.generation('session-1').then(
      () => {
        throw new Error('closed lifecycle returned a generation');
      },
      (cause: unknown) => {
        expect(cause).toBeInstanceOf(Error);
      },
    );
    expect((await logout()).status).toBe(204);
  });

  it('rolls back a revocation when lifecycle closure fails after its insert', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const revoked = new SqliteBrowserCredentialRevocations(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    sql(
      "CREATE TRIGGER refuse_lifecycle_close BEFORE UPDATE OF state ON browser_auth_lifecycle WHEN NEW.state = 'closed' BEGIN SELECT RAISE(ABORT, 'injected close failure'); END",
    );
    const logout = () =>
      app.handle(
        new Request('https://dev.wbs.test/api/auth/logout', {
          method: 'POST',
          headers: {
            origin: 'https://dev.wbs.test',
            cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
          },
        }),
      );
    const failed = await logout();
    expect(failed.status).toBe(500);
    expect(failed.headers.get('set-cookie')).toBeNull();
    expect(await lifecycle.generation('session-1')).toEqual({ generation: 1, current: first });
    // Proof: running close without its SQLite transaction left the B1 row
    // committed after this injected UPDATE abort; generation then refused.
    expect(await revoked.isRevoked(first)).toBe(false);
    expect(localTokens.read('session-1')).not.toBeNull();
    expect(revokeCalls).toBe(0);
    sql('DROP TRIGGER refuse_lifecycle_close');
    expect((await logout()).status).toBe(204);
    expect(await revoked.isRevoked(first)).toBe(true);
  });

  for (const nextSecret of ['refresh-1', 'refresh-2']) {
    it(`closes the lifecycle before a paused ${nextSecret} refresh can publish`, async () => {
      sql(
        "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
      );
      const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
      const revoked = new SqliteBrowserCredentialRevocations(openDrizzle(path), OPEN);
      const first = {
        kind: 'oidc' as const,
        userId: 'captured',
        digest: createHash('sha256').update('access-1').digest('hex'),
        expiresAt: now + 900_000,
      };
      await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
      const app = mounted(claims, lifecycle);
      localTokens.save({
        sessionCorrelation: 'session-1',
        refreshToken: 'refresh-1',
        expiresAt: now + 86_400_000,
        userId: 'captured',
        generation: 1,
        credential: first,
      });
      refreshSecret = nextSecret;
      let releaseProvider = (): void => {
        throw new Error('provider hold missing');
      };
      refreshHold = new Promise<void>((resolve) => {
        releaseProvider = resolve;
      });
      let signalProvider = (): void => {
        throw new Error('provider signal missing');
      };
      const providerEntered = new Promise<void>((resolve) => {
        signalProvider = resolve;
      });
      refreshEntered = signalProvider;
      const refresh = app.handle(
        new Request('https://dev.wbs.test/api/auth/refresh', {
          method: 'POST',
          headers: {
            origin: 'https://dev.wbs.test',
            cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
          },
        }),
      );
      await providerEntered;
      const logout = await app.handle(
        new Request('https://dev.wbs.test/api/auth/logout', {
          method: 'POST',
          headers: {
            origin: 'https://dev.wbs.test',
            cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
          },
        }),
      );
      expect(logout.status).toBe(204);
      expect(await revoked.isRevoked(first)).toBe(true);
      releaseProvider();
      const late = await refresh;
      expect(late.status).toBe(401);
      expect(late.headers.get('set-cookie')).not.toContain(
        '__Host-wbs_access=access-from-refresh;',
      );
      expect(localTokens.read('session-1')).toBeNull();
      await lifecycle.generation('session-1').then(
        () => {
          throw new Error('closed lifecycle returned a generation');
        },
        (cause: unknown) => {
          expect(cause).toBeInstanceOf(Error);
        },
      );
    });
  }

  for (const nextSecret of ['refresh-1', 'refresh-2']) {
    it(`closes the committed ${nextSecret} successor while refresh awaits local installation`, async () => {
      sql(
        "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
      );
      const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
      const revoked = new SqliteBrowserCredentialRevocations(openDrizzle(path), OPEN);
      const first = {
        kind: 'oidc' as const,
        userId: 'captured',
        digest: createHash('sha256').update('access-1').digest('hex'),
        expiresAt: now + 900_000,
      };
      await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
      let releaseInstall = (): void => {
        throw new Error('install hold missing');
      };
      const installHold = new Promise<void>((resolve) => {
        releaseInstall = resolve;
      });
      let signalCommit = (): void => {
        throw new Error('commit signal missing');
      };
      const committed = new Promise<void>((resolve) => {
        signalCommit = resolve;
      });
      const observedLifecycle: BrowserAuthLifecycle = {
        open: (...args) => lifecycle.open(...args),
        generation: (...args) => lifecycle.generation(...args),
        proveAssociation: (...args) => lifecycle.proveAssociation(...args),
        replace: async (...args) => {
          const generation = await lifecycle.replace(...args);
          signalCommit();
          await installHold;
          return generation;
        },
        close: (...args) => lifecycle.close(...args),
      };
      const app = mounted(claims, observedLifecycle);
      localTokens.save({
        sessionCorrelation: 'session-1',
        refreshToken: 'refresh-1',
        expiresAt: now + 86_400_000,
        userId: 'captured',
        generation: 1,
        credential: first,
      });
      refreshSecret = nextSecret;
      const refresh = app.handle(
        new Request('https://dev.wbs.test/api/auth/refresh', {
          method: 'POST',
          headers: {
            origin: 'https://dev.wbs.test',
            cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
          },
        }),
      );
      await committed;
      const successor = (await lifecycle.generation('session-1')).current;
      const logout = await app.handle(
        new Request('https://dev.wbs.test/api/auth/logout', {
          method: 'POST',
          headers: {
            origin: 'https://dev.wbs.test',
            cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
          },
        }),
      );
      expect(logout.status).toBe(204);
      expect(await revoked.isRevoked(first)).toBe(true);
      expect(await revoked.isRevoked(successor)).toBe(true);
      releaseInstall();
      const late = await refresh;
      expect(late.status).toBe(401);
      expect(late.headers.get('set-cookie')).not.toContain(
        '__Host-wbs_access=access-from-refresh;',
      );
      expect(localTokens.read('session-1')).toBeNull();
      await lifecycle.generation('session-1').then(
        () => {
          throw new Error('closed lifecycle returned a generation');
        },
        (cause: unknown) => {
          expect(cause).toBeInstanceOf(Error);
        },
      );
    });
  }

  it('keeps an OIDC lifecycle closed when upstream revoke fails, then acknowledges a proved retry', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const revoked = new SqliteBrowserCredentialRevocations(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    const logout = () =>
      app.handle(
        new Request('https://dev.wbs.test/api/auth/logout', {
          method: 'POST',
          headers: {
            origin: 'https://dev.wbs.test',
            cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
          },
        }),
      );
    revokeFault = true;
    const firstReply = await logout();
    expect(firstReply.status).toBe(500);
    expect(firstReply.headers.get('set-cookie')).toBeNull();
    expect(await revoked.isRevoked(first)).toBe(true);
    expect(localTokens.read('session-1')).toBeNull();
    expect((await logout()).status).toBe(204);
  });

  it('does not acknowledge OIDC logout when retained association state is missing', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    sql('DROP TABLE browser_auth_association');
    const reply = await app.handle(
      new Request('https://dev.wbs.test/api/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
        },
      }),
    );
    expect(reply.status).toBe(500);
    expect(reply.headers.get('set-cookie')).toBeNull();
    expect(localTokens.read('session-1')?.refreshToken).toBe('refresh-1');
  });

  it('refuses mixed and duplicate OIDC logout carriers before closing any lifecycle', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    const second = { ...first, digest: createHash('sha256').update('access-2').digest('hex') };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    await lifecycle.open('session-2', second, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    for (const cookies of [
      '__Host-wbs_session=session-1; __Host-wbs_access=access-2',
      '__Host-wbs_session=session-1; __Host-wbs_access=access-1; __Host-wbs_access=access-2',
      '__Host-wbs_session=session-1',
    ]) {
      const response = await app.handle(
        new Request('https://dev.wbs.test/api/auth/logout', {
          method: 'POST',
          headers: { origin: 'https://dev.wbs.test', cookie: cookies },
        }),
      );
      expect(response.status).toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    expect(await lifecycle.generation('session-1')).toEqual({ generation: 1, current: first });
    expect(await lifecycle.generation('session-2')).toEqual({ generation: 1, current: second });
    expect(localTokens.read('session-1')?.refreshToken).toBe('refresh-1');
  });

  it('mounts common logout in native-only mode and revokes only its exact verified credential', async () => {
    const app = mounted(claims, undefined, undefined, 'native');
    const registered = await auth.register('native-user', 'correct-horse');
    if (!registered.ok) throw new Error('native registration failed');
    const independent = await auth.login('native-user', 'correct-horse');
    if (!independent.ok) throw new Error('independent login failed');
    const login = await app.handle(
      new Request('https://dev.wbs.test/api/auth/login', {
        method: 'POST',
        headers: { origin: 'https://dev.wbs.test', 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'native-user', password: 'correct-horse' }),
      }),
    );
    expect(login.status).toBe(200);
    const issued = (await login.json()) as { token: string };
    expect(issued.token).toBeTypeOf('string');
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/logout', {
        method: 'POST',
        headers: { origin: 'https://dev.wbs.test', authorization: `Bearer ${issued.token}` },
      }),
    );
    expect(response.status).toBe(204);
    const rows = all('SELECT credential_digest FROM browser_credential_revocations');
    expect(rows).toEqual([
      { credential_digest: createHash('sha256').update(issued.token).digest('hex') },
    ]);
    expect(createHash('sha256').update(independent.value.token).digest('hex')).not.toBe(
      (rows[0] as { credential_digest: string }).credential_digest,
    );
    expect(
      (
        await app.handle(
          new Request('https://dev.wbs.test/api/auth/logout', {
            method: 'POST',
            headers: { origin: 'https://dev.wbs.test', authorization: `Bearer ${issued.token}` },
          }),
        )
      ).status,
    ).toBe(204);
  });

  it('refuses mixed, foreign-origin and delegated native logout carriers before revocation', async () => {
    const app = mounted(claims, undefined, undefined, 'native');
    const issued = await auth.register('native-user', 'correct-horse');
    if (!issued.ok) throw new Error('native registration failed');
    const token = issued.value.token;
    const signedAt = Math.floor(Date.now() / 1000);
    const valid = await new SignJWT({ username: 'native-user' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(issued.value.user.id)
      .setJti('valid-control')
      .setIssuedAt(signedAt)
      .setExpirationTime(signedAt + 900)
      .sign(new TextEncoder().encode(nativeSessionKey));
    const delegated = await new SignJWT({ username: 'native-user' })
      .setProtectedHeader({ alg: 'HS256', typ: 'wbs-delegation+jwt' })
      .setSubject(issued.value.user.id)
      .setJti('delegated')
      .setIssuedAt(signedAt)
      .setExpirationTime(signedAt + 900)
      .sign(new TextEncoder().encode(nativeSessionKey));
    const expired = await new SignJWT({ username: 'native-user' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(issued.value.user.id)
      .setJti('expired')
      .setIssuedAt(signedAt - 120)
      .setExpirationTime(signedAt - 60)
      .sign(new TextEncoder().encode(nativeSessionKey));
    const refused: Record<string, string>[] = [
      {
        origin: 'https://dev.wbs.test',
        authorization: `Bearer ${token}`,
        cookie: `__Host-wbs_access=${token}`,
      },
      {
        origin: 'https://dev.wbs.test',
        authorization: `Bearer ${token}`,
        cookie: '__Host-wbs_session=foreign',
      },
      { origin: 'https://foreign.test', authorization: `Bearer ${token}` },
      { authorization: `Bearer ${token}` },
      { origin: 'https://dev.wbs.test', authorization: `Bearer ${delegated}` },
      { origin: 'https://dev.wbs.test', authorization: `Bearer ${expired}` },
      { origin: 'https://dev.wbs.test', authorization: 'Bearer access-1' },
      { origin: 'https://dev.wbs.test', cookie: '__Host-wbs_session=foreign' },
      { origin: 'https://dev.wbs.test', authorization: `Bearer ${token}`, 'x-wbs-token': token },
      {
        origin: 'https://dev.wbs.test',
        cookie: `__Host-wbs_access=${token}; __Host-wbs_access=${token}`,
      },
    ];
    for (const headers of refused) {
      const reply = await app.handle(
        new Request('https://dev.wbs.test/api/auth/logout', {
          method: 'POST',
          headers: new Headers(headers),
        }),
      );
      expect([401, 403]).toContain(reply.status);
      expect(reply.headers.get('set-cookie')).toBeNull();
    }
    expect(all('SELECT credential_digest FROM browser_credential_revocations')).toEqual([]);
    const accepted = await app.handle(
      new Request('https://dev.wbs.test/api/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          authorization: `Bearer ${valid}`,
          cookie: '__Host-wbs_organization=selected; ui_pref=compact',
        },
      }),
    );
    expect(accepted.status).toBe(204);
    expect(all('SELECT credential_digest FROM browser_credential_revocations')).toEqual([
      { credential_digest: createHash('sha256').update(valid).digest('hex') },
    ]);
  });

  it('does not acknowledge native logout when the shared revocation authority is unreadable', async () => {
    const app = mounted(claims, undefined, undefined, 'native');
    const issued = await auth.register('native-user', 'correct-horse');
    if (!issued.ok) throw new Error('native registration failed');
    sql('DROP TABLE browser_credential_revocations');
    const reply = await app.handle(
      new Request('https://dev.wbs.test/api/auth/logout', {
        method: 'POST',
        headers: { origin: 'https://dev.wbs.test', authorization: `Bearer ${issued.value.token}` },
      }),
    );
    expect(reply.status).toBe(500);
    expect(reply.headers.get('set-cookie')).toBeNull();
  });

  it('retires a proved predecessor before native registration issues a replacement credential', async () => {
    const app = mounted(claims, undefined, undefined, 'native');
    const predecessor = await auth.register('first-user', 'correct-horse');
    if (!predecessor.ok) throw new Error('predecessor registration failed');
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://dev.wbs.test',
          cookie: `__Host-wbs_access=${predecessor.value.token}`,
        },
        body: JSON.stringify({ username: 'second-user', password: 'correct-horse' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { token: string }).token).toBeTypeOf('string');
    expect(
      response.headers.getSetCookie().some((cookie) => cookie.startsWith('__Host-wbs_access=;')),
    ).toBe(true);
    expect(all('SELECT credential_digest FROM browser_credential_revocations')).toEqual([
      { credential_digest: createHash('sha256').update(predecessor.value.token).digest('hex') },
    ]);
  });

  it('leaves the proved predecessor active after a failed native login', async () => {
    const app = mounted(claims, undefined, undefined, 'native');
    const predecessor = await auth.register('first-user', 'correct-horse');
    if (!predecessor.ok) throw new Error('predecessor registration failed');
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://dev.wbs.test',
          cookie: `__Host-wbs_access=${predecessor.value.token}`,
        },
        body: JSON.stringify({ username: 'first-user', password: 'wrong-password' }),
      }),
    );
    expect(response.status).toBe(401);
    expect(all('SELECT credential_digest FROM browser_credential_revocations')).toEqual([]);
  });

  it('retires a native bearer predecessor on successful account-switch login only', async () => {
    const app = mounted(claims, undefined, undefined, 'native');
    const first = await auth.register('first-user', 'correct-horse');
    const second = await auth.register('second-user', 'second-horse');
    if (!first.ok || !second.ok) throw new Error('registration failed');
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://dev.wbs.test',
          authorization: `Bearer ${first.value.token}`,
          cookie: '__Host-wbs_organization=selected; ui_pref=compact',
        },
        body: JSON.stringify({ username: 'second-user', password: 'second-horse' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { user: { id: string } }).user.id).toBe(
      second.value.user.id,
    );
    expect(all('SELECT credential_digest FROM browser_credential_revocations')).toEqual([
      { credential_digest: createHash('sha256').update(first.value.token).digest('hex') },
    ]);
  });

  it('refuses partial registration predecessor before creating another account', async () => {
    const app = mounted(claims, undefined, undefined, 'native');
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://dev.wbs.test',
          cookie: '__Host-wbs_session=foreign',
        },
        body: JSON.stringify({ username: 'uncreated', password: 'correct-horse' }),
      }),
    );
    expect(response.status).toBe(401);
    expect(all("SELECT id FROM users WHERE username = 'uncreated'")).toEqual([]);
    expect(all('SELECT credential_digest FROM browser_credential_revocations')).toEqual([]);
  });

  it('retires a proved native predecessor before OIDC callback publishes replacement cookies', async () => {
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const app = mounted(claims, lifecycle);
    const predecessor = await auth.register('password-user', 'correct-horse');
    if (!predecessor.ok) throw new Error('password registration failed');
    const callback = await app.handle(
      new Request('https://dev.wbs.test/api/auth/okta/callback?code=c&state=state-1', {
        headers: {
          cookie: `${browserBindingCookieName('binding-1')}=binding-1; __Host-wbs_access=${predecessor.value.token}`,
        },
      }),
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get('set-cookie')).toContain('__Host-wbs_access=access-1;');
    expect(
      callback.headers
        .getSetCookie()
        .some((cookie) => cookie.startsWith('__Host-wbs_organization=;')),
    ).toBe(true);
    expect(all('SELECT credential_digest FROM browser_credential_revocations')).toEqual([
      { credential_digest: createHash('sha256').update(predecessor.value.token).digest('hex') },
    ]);
  });

  it('leaves a native predecessor active when the OIDC callback identity is invalid', async () => {
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const app = mounted({ ...claims, sub: '' }, lifecycle);
    const predecessor = await auth.register('password-user', 'correct-horse');
    if (!predecessor.ok) throw new Error('password registration failed');
    const reply = await app.handle(
      new Request('https://dev.wbs.test/api/auth/okta/callback?code=c&state=state-1', {
        headers: {
          cookie: `${browserBindingCookieName('binding-1')}=binding-1; __Host-wbs_access=${predecessor.value.token}`,
        },
      }),
    );
    expect(reply.status).toBe(401);
    expect(all('SELECT credential_digest FROM browser_credential_revocations')).toEqual([]);
  });

  it('closes an OIDC predecessor before a native account-switch login publishes its cookie', async () => {
    sql(
      "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('captured', 'captured', NULL, 'https://idp.test', 'subject-1', 1)",
    );
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const revoked = new SqliteBrowserCredentialRevocations(openDrizzle(path), OPEN);
    const first = {
      kind: 'oidc' as const,
      userId: 'captured',
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    await lifecycle.open('session-1', first, { openedAt: 1, reauthenticatedAt: null });
    const app = mounted(claims, lifecycle);
    localTokens.save({
      sessionCorrelation: 'session-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 86_400_000,
      userId: 'captured',
      generation: 1,
      credential: first,
    });
    const native = await auth.register('password-user', 'correct-horse');
    if (!native.ok) throw new Error('native account registration failed');
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://dev.wbs.test',
          'x-forwarded-for': '127.0.0.1',
          cookie: '__Host-wbs_session=session-1; __Host-wbs_access=access-1',
        },
        body: JSON.stringify({ username: 'password-user', password: 'correct-horse' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('__Host-wbs_access=');
    const cookieJar = new Map([
      ['__Host-wbs_session', 'session-1'],
      ['__Host-wbs_access', 'access-1'],
      ['__Host-wbs_organization', 'selected'],
    ]);
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair] = setCookie.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      if (setCookie.includes('Max-Age=0')) cookieJar.delete(name);
      else cookieJar.set(name, decodeURIComponent(pair.slice(separator + 1)));
    }
    expect([...cookieJar.keys()]).toEqual(['__Host-wbs_access']);
    const nextLogout = await app.handle(
      new Request('https://dev.wbs.test/api/auth/logout', {
        method: 'POST',
        headers: {
          origin: 'https://dev.wbs.test',
          cookie: [...cookieJar].map(([name, value]) => `${name}=${value}`).join('; '),
        },
      }),
    );
    expect(nextLogout.status).toBe(204);
    expect(await revoked.isRevoked(first)).toBe(true);
    expect(localTokens.read('session-1')).toBeNull();
    await lifecycle.generation('session-1').then(
      () => {
        throw new Error('closed predecessor returned a generation');
      },
      (cause: unknown) => {
        expect(cause).toBeInstanceOf(Error);
      },
    );
  });

  it('refuses an enabled OIDC browser composition with no shared lifecycle or a mismatched one', () => {
    const first = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const second = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    expect(() => mounted(claims, undefined, undefined, 'oidc', null)).toThrow(
      'browser lifecycle composition disagrees',
    );
    expect(() => mounted(claims, first, undefined, 'oidc', second)).toThrow(
      'browser lifecycle composition disagrees',
    );
  });

  // Proof: dropping the lifecycle-without-browserSession clause from the
  // composition guard let this OIDC lifecycle mount with no browser-session
  // authority, so logout took the legacy branch and never closed the
  // lifecycle (this negative 0/1, 2026-10-11).
  it('refuses an OIDC browser lifecycle mounted without a browser-session authority', () => {
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    expect(() => mounted(claims, lifecycle, undefined, 'oidc', undefined, true)).toThrow(
      'browser lifecycle composition disagrees',
    );
  });

  it('opens a durable lifecycle and bound local refresh record before issuing callback cookies', async () => {
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const app = mounted(claims, lifecycle);
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/okta/callback?code=c&state=state-1', {
        headers: { cookie: `${browserBindingCookieName('binding-1')}=binding-1` },
      }),
    );
    expect(response.status).toBe(302);
    const accountRows = all('SELECT id FROM users');
    expect(accountRows).toHaveLength(1);
    const userId = (accountRows[0] as { id: string }).id;
    const expected = {
      kind: 'oidc' as const,
      userId,
      digest: createHash('sha256').update('access-1').digest('hex'),
      expiresAt: now + 900_000,
    };
    expect(await lifecycle.generation('session-1')).toEqual({ generation: 1, current: expected });
    expect(localTokens.read('session-1')).toMatchObject({
      userId,
      generation: 1,
      credential: expected,
    });
    expect(response.headers.get('set-cookie')).toContain('__Host-wbs_access=access-1;');
  });

  // A human whose access token carries no groups claim would get a session every `/api` call
  // refuses (a groups-less configured-issuer token is a machine bearer, M9): a sign-in loop.
  // The callback refuses it as a rendered error before anything is written.
  // Proof: with the callback's groups check removed (red first), this redirected to `/`
  // instead of the rendered error; watched 2026-10-31.
  it('refuses a sign-in whose access token has no groups claim, issuing no session', async () => {
    const { wbs_groups: _groups, ...groupless } = claims;
    callbackAccessClaims = { ...groupless, exp: Math.floor((now + 900_000) / 1000) };
    const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
    const app = mounted(claims, lifecycle);
    const response = await app.handle(
      new Request('https://dev.wbs.test/api/auth/okta/callback?code=c&state=state-1', {
        headers: { cookie: `${browserBindingCookieName('binding-1')}=binding-1` },
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/?auth_error=groups_claim_missing');
    expect(response.headers.get('set-cookie') ?? '').not.toContain('__Host-wbs_access=access-1');
    expect(all('SELECT id FROM users')).toEqual([]);
    expect(all('SELECT * FROM browser_auth_lifecycle')).toEqual([]);
    expect(localTokens.read('session-1')).toBeNull();
  });

  describe('sign-in times (organization-session-policy)', () => {
    const times = () =>
      all('SELECT opened_at, reauthenticated_at FROM browser_auth_lifecycle') as {
        opened_at: number | null;
        reauthenticated_at: number | null;
      }[];
    const signIn = (providerClaims: Readonly<Record<string, unknown>> = claims) => {
      const lifecycle = new SqliteBrowserAuthLifecycle(openDrizzle(path), OPEN);
      const app = mounted(providerClaims, lifecycle);
      return app.handle(
        new Request('https://dev.wbs.test/api/auth/okta/callback?code=c&state=state-1', {
          headers: { cookie: `${browserBindingCookieName('binding-1')}=binding-1` },
        }),
      );
    };

    it('opens a plain sign-in with no reauthentication proved', async () => {
      expect((await signIn()).status).toBe(302);
      expect(times()).toEqual([{ opened_at: now, reauthenticated_at: null }]);
    });

    // Proof: opening the lifecycle without the callback's reauthentication
    // time made this store null; watched 2026-10-12.
    it('records when a prompted sign-in reauthenticated', async () => {
      savedReauthentication = { prompt: 'login', maxAge: null };
      expect((await signIn()).status).toBe(302);
      expect(times()).toEqual([{ opened_at: now, reauthenticated_at: now }]);
    });

    it('reads a verified auth_time under max_age', async () => {
      savedReauthentication = { prompt: 'login', maxAge: 3_600 };
      const authTime = Math.floor(now / 1000) - 100;
      expect((await signIn({ ...claims, auth_time: authTime })).status).toBe(302);
      expect(times()).toEqual([{ opened_at: now, reauthenticated_at: authTime * 1000 }]);
    });
  });
});
