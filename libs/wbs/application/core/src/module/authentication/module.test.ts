import { inMemoryUsers } from '@wbs/store-memory/auth-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
import type { OidcVerifier } from '../../ports/oidc-verifier';
import type { PasswordHasher, SessionClaims, TokenCodec } from '../../ports/runtime';
import type { OidcIdentityStore, UserStore } from '../../ports/user-store';
import { installAuthentication } from './check';
import type { AuthenticationRequirements } from './contract';
import { AUTHENTICATION_LABEL } from './contract';
import { authenticationModule } from './module';

const STAMP_AT = 1_757_851_200_000;

/**
 * A deterministic, non-cryptographic pair, in place of `Bun.password` and
 * `jose`: the module's own tests are about the DI graph and the admission
 * throttle, not about argon2id or JWT — `apps/wbs/be-01/src/testing/auth-fixture.ts`'s
 * own real adapters are app-layer and this module's tests cannot reach them
 * without a reverse, lib-imports-app edge.
 */
const fakePasswords: PasswordHasher = {
  hash: (password) => Promise.resolve(`hashed:${password}`),
  verify: (password, hash) => Promise.resolve(hash === `hashed:${password}`),
};

const fakeTokens: TokenCodec = {
  sign: (claims) => Promise.resolve(JSON.stringify(claims)),
  verify: (token) => {
    try {
      return Promise.resolve(JSON.parse(token) as SessionClaims);
    } catch {
      return Promise.resolve(null);
    }
  },
};

const requirements = () => {
  const users = inMemoryUsers();
  return {
    account: {
      users,
      tokens: fakeTokens,
      passwords: fakePasswords,
      clock: clockOf({ now: () => STAMP_AT, newId: () => 'seeded' }),
    },
    now: () => STAMP_AT,
    maxConcurrentLogins: 8,
  };
};

/**
 * A complete host graph over the same requirements.
 *
 * Written out rather than shared with the incomplete graph below: a helper
 * returning either registration object gives DI Bag's builder a union it
 * refuses at the type level, the same TS2345 every prior 040.6 module's own
 * `module.test.ts` records for its two graphs.
 */
const completeHost = () =>
  DiBag.createBuilder()
    .installModule(authenticationModule)
    .register({
      account: DiBag.fromSyncFactory(() => requirements().account),
      now: DiBag.fromSyncFactory(() => requirements().now),
      maxConcurrentLogins: DiBag.fromSyncFactory(() => requirements().maxConcurrentLogins),
    })
    .build();

/**
 * Compile-negative: the map's own "verifier-without-identity-store is
 * unrepresentable" requirement, watched by the type checker rather than by a
 * runtime assertion. `account.users` is `AuthServiceOptions['users'] &
 * NonNullable<AuthServiceOptions['identities']>` unconditionally — supplying
 * only a `UserStore` (no `resolveOidcIdentity`) alongside an `oidc` verifier
 * cannot satisfy `AuthenticationRequirements['account']`.
 *
 * Proof (2026-09-23): removing `NonNullable<AuthServiceOptions['identities']>`
 * from `AuthenticationRequirements['account']`'s own `users` intersection
 * made this directive fail `wbs-core:typecheck` with "Unused '@ts-expect-error'
 * directive" at the fixture (TS2578) and, as expected collateral, with
 * "Property 'resolveOidcIdentity' is missing in type 'UserStore'" at
 * `module.ts`'s own `authOptions` factory (TS2741) — the weakened
 * requirement accepted the insufficient store at compile time.
 */
function userStoreOnly(): UserStore {
  const users = inMemoryUsers();
  return {
    create: (user, stamp) => users.create(user, stamp),
    findByUsername: (username) => users.findByUsername(username),
    findById: (id) => users.findById(id),
  };
}
const noopVerifier: OidcVerifier = { verify: () => Promise.resolve(null) };
const verifierWithoutStore = (): AuthenticationRequirements['account'] => ({
  // @ts-expect-error `account.users` must also satisfy `OidcIdentityStore` when `oidc` is supplied.
  users: userStoreOnly(),
  oidc: noopVerifier,
  tokens: fakeTokens,
  passwords: fakePasswords,
  clock: clockOf({ now: () => STAMP_AT, newId: () => 'seeded' }),
});

describe('the Authentication module', () => {
  it('registers and signs in a password-only account, with no oidc store dependency', async () => {
    const { auth } = installAuthentication(requirements());

    const registered = await auth.register('a-new-user', 'a-long-enough-password');
    expect(registered).toMatchObject({ ok: true });

    const login = await auth.login('a-new-user', 'a-long-enough-password');
    expect(login).toMatchObject({ ok: true });
  });

  it('authenticates an OIDC identity through the combined users store', async () => {
    const users: UserStore & OidcIdentityStore = inMemoryUsers();
    const oidc: OidcVerifier = {
      verify: () =>
        Promise.resolve({
          issuer: 'https://idp.example',
          subject: 'sub-1',
          email: 'person@example.com',
          emailVerified: true,
          scopes: ['read', 'write'],
        }),
    };
    const { auth } = installAuthentication({
      account: {
        users,
        oidc,
        tokens: fakeTokens,
        passwords: fakePasswords,
        clock: clockOf({ now: () => STAMP_AT, newId: () => 'seeded' }),
      },
      now: () => STAMP_AT,
      maxConcurrentLogins: 8,
    });

    const principal = await auth.authenticate('an-oidc-bearer-token');

    expect(principal).toMatchObject({ scopes: ['read', 'write'] });
  });

  it('throttles a sixth same-account, same-IP reservation over the graph installAuthentication wires', () => {
    const { loginThrottle } = installAuthentication(requirements());

    for (let attempt = 0; attempt < 5; attempt += 1) {
      loginThrottle.recordFailure('a-user', '198.51.100.1');
    }

    expect(loginThrottle.canAttempt('a-user', '198.51.100.1')).toBe(false);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `AuthenticationExports`, so
   * only enumerating the returned surface catches a leak the type checker
   * would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installAuthentication(requirements());

    expect(Object.keys(exposed).sort()).toEqual(['auth', 'loginThrottle']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its authOptions binding out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('authOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "authOptions" is not registered.');
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its throttleOptions binding out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('throttleOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "throttleOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    const labels = host.inspectGraph().bindings.map((binding) => binding.label);

    expect(labels).toContain(`${AUTHENTICATION_LABEL}/authOptions`);
    expect(labels).toContain(`${AUTHENTICATION_LABEL}/throttleOptions`);
  });

  /**
   * The label reaches a real DI failure message.
   *
   * A host that forgets a requirement is refused by the type checker, so the
   * cast reaches the runtime path an untyped or generated host reaches.
   */
  it('names itself when a host omits a requirement', () => {
    const partial = DiBag.createBuilder()
      .installModule(authenticationModule)
      .register({
        account: DiBag.fromSyncFactory(() => requirements().account),
        now: DiBag.fromSyncFactory(() => requirements().now),
      }) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('loginThrottle')).toThrow(
      `Cannot resolve "${AUTHENTICATION_LABEL}/throttleOptions": dependency "maxConcurrentLogins" is not registered. Resolution path: loginThrottle -> ${AUTHENTICATION_LABEL}/throttleOptions -> maxConcurrentLogins.`,
    );
  });

  it('cannot build a verifier-without-identity-store account (compile-negative)', () => {
    expect(typeof verifierWithoutStore).toBe('function');
  });
});
