import {
  type BrowserOidcClient,
  InMemoryOidcTransactionStore,
  InMemoryTokenStore,
  type OidcTransactionStore,
  type TokenVerifier,
} from '@wbs/auth';
import { errors } from 'jose';

import type { OidcRouteOptions } from '../controller/oidc-options';

/** What one `/authorize` request asked the provider for. */
export type AuthorizationRequest = Parameters<BrowserOidcClient['authorizationUrl']>[0];

/** A transaction store that counts its saves, so a test can see a refusal saved none. */
class CountingTransactionStore implements OidcTransactionStore {
  saves = 0;
  private readonly inner: InMemoryOidcTransactionStore;

  constructor(now: () => number) {
    this.inner = new InMemoryOidcTransactionStore({ now, ttlMs: 300_000 });
  }

  cleanupExpired(): number {
    return this.inner.cleanupExpired();
  }

  consume(...args: Parameters<OidcTransactionStore['consume']>) {
    return this.inner.consume(...args);
  }

  expiresAt(browserBinding: string): number | null {
    return this.inner.expiresAt(browserBinding);
  }

  save(...args: Parameters<OidcTransactionStore['save']>): void {
    this.saves += 1;
    this.inner.save(...args);
  }
}

/**
 * The identity provider seen from be-01 in mounted tests: it records every
 * `/authorize` request and answers each code exchange with {@link idTokenClaims}.
 * It verifies no access token, so bearer requests fall through to the
 * first-party password session, exactly as a native session does in production.
 */
export class FakeOidcProvider {
  readonly authorizations: AuthorizationRequest[] = [];
  /** The ID token claims the next exchange answers with. */
  idTokenClaims: Readonly<Record<string, unknown>> = {};
  private readonly transactions: CountingTransactionStore;

  constructor(private readonly now: () => number = Date.now) {
    this.transactions = new CountingTransactionStore(now);
  }

  /** How many login transactions be-01 has saved. */
  get savedTransactions(): number {
    return this.transactions.saves;
  }

  /** The most recent `/authorize` request. @throws when there was none. */
  lastAuthorization(): AuthorizationRequest {
    const last = this.authorizations.at(-1);
    if (last === undefined) throw new Error('no authorization was requested');
    return last;
  }

  readonly verifier: TokenVerifier = {
    verify: () => Promise.reject(new errors.JWSInvalid('the fake provider verifies no token')),
  };

  /** Route options for an app at `origin` with password sign-in and registration on. */
  routeOptions(origin: string): OidcRouteOptions {
    return {
      appOrigin: origin,
      client: {
        authorizationUrl: (input) => {
          this.authorizations.push(input);
          return Promise.resolve(new URL(`https://idp.test/authorize?state=${input.state}`));
        },
        exchange: () =>
          Promise.resolve({
            accessToken: 'provider-access',
            expiresIn: 900,
            idTokenClaims: this.idTokenClaims,
          }),
        refresh: () => Promise.reject(new Error('the fake provider refreshes nothing')),
        revoke: () => Promise.resolve(),
      },
      groupPrefix: 'dev',
      groupsClaim: 'wbs_groups',
      methods: ['google', 'github'],
      mode: 'oidc',
      now: this.now,
      passwordLoginEnabled: true,
      passwordRegisterEnabled: true,
      redirectUri: `${origin}/api/auth/okta/callback`,
      tokens: new InMemoryTokenStore({ now: this.now }),
      transactions: this.transactions,
      verifier: this.verifier,
      issuer: () => Promise.resolve('https://idp.test'),
    };
  }
}
