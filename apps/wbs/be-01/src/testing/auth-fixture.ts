import { buildOidcVerifier, type OidcIdentityOptions, type TokenVerifier } from '@wbs/auth';
import { type AuthenticatedUser, AuthService } from '@wbs/core/service/auth.service';
import { inMemoryUsers } from '@wbs/store-memory/auth-fixture';

import type { OidcIdentityStore, UserStore } from '../repository';
import { bunPasswordHasher, joseTokenCodec } from '../runtime/bun-runtime';
import { testClock } from './clock-fixture';

export const TEST_JWT_KEY = 'test-jwt-signing-key-at-least-32-chars';

export interface TestOidcAuthentication extends OidcIdentityOptions {
  verifier: TokenVerifier;
}

export function testAuthService(
  users: UserStore & OidcIdentityStore = inMemoryUsers(),
  oidc?: TestOidcAuthentication,
): AuthService {
  return new AuthService({
    clock: testClock,
    users,
    identities: users,
    // The real adapters over the test key: a fake codec would make every token
    // in these suites a string this deployment cannot read, and a fake hasher
    // would make `register` a claim about nothing.
    tokens: joseTokenCodec(TEST_JWT_KEY),
    passwords: bunPasswordHasher,
    oidc: oidc === undefined ? undefined : buildOidcVerifier(oidc.verifier, oidc),
    passwordSessions: oidc !== undefined,
  });
}

export { inMemoryUsers } from '@wbs/store-memory/auth-fixture';

/** Local-mode authentication: every request is `identity`, with or without a credential. */
export function testLocalAuthService(identity: AuthenticatedUser): AuthService {
  return new AuthService({
    clock: testClock,
    users: inMemoryUsers(),
    identities: inMemoryUsers(),
    tokens: joseTokenCodec(TEST_JWT_KEY),
    passwords: bunPasswordHasher,
    localIdentity: identity,
  });
}

/** The session read's features on a deployment before activation, for direct endpoint tests. */
export const NO_SESSION_FEATURES = { onboarding: false, organizations: false } as const;

/** Answers {@link NO_SESSION_FEATURES}, the `readFeatures` of an endpoint test. */
export const readNoSessionFeatures = () => Promise.resolve(NO_SESSION_FEATURES);
