import type {
  TrustedIssuerDiscovery,
  TrustedIssuerDiscoveryOutcome,
  TrustedIssuerExpectation,
  TrustedIssuerTokens,
  TrustedIssuerVerdict,
  UnverifiedJwtClaims,
} from '@wbs/core';
import { createRemoteJWKSet, customFetch, decodeJwt, errors, jwtVerify } from 'jose';

import { isInvalidCredential } from './oidc-verifier';

/** The one fetch these adapters call; production passes `globalThis.fetch`. */
export type IssuerFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Asymmetric JWS algorithms only: a trusted issuer signs with a key it
 * publishes, so an `HS*` token can never verify against its key set.
 */
const ASYMMETRIC_ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
];

/** What the stored `jwks_uri` CHECK admits (`20261022100000_add_machine_credential`). */
const MAX_URL_LENGTH = 2048;

/** A key set that could not be fetched or read: a verdict, never a credential failure. */
class KeySetUnavailable extends Error {
  constructor(url: string, reason: string, options?: { cause: unknown }) {
    super(`the key set at ${url} is unavailable: ${reason}`, options);
    this.name = 'KeySetUnavailable';
  }
}

/** Where {@link TrustedIssuerKeySets} reports a key set it could not fetch. */
export type KeySetFailureReport = (fields: Record<string, unknown>, message: string) => void;

/** How {@link TrustedIssuerKeySets} fetches and caches. */
export interface TrustedIssuerKeySetOptions {
  readonly fetch: IssuerFetch;
  readonly report: KeySetFailureReport;
  /**
   * How soon after a fetch an unknown `kid` may refetch, so a stream of
   * tokens naming invented keys costs one fetch per window per URL.
   * Default 30 s.
   */
  readonly cooldownMs?: number;
  /** How long a fetched key set is used before it is fetched again. Default 10 min. */
  readonly cacheMaxAgeMs?: number;
  /** How long one fetch may take. Default 5 s. */
  readonly timeoutMs?: number;
  /** How many JWKS URLs are cached at once, least recently used dropped first. Default 64. */
  readonly maxKeySets?: number;
}

/**
 * {@link TrustedIssuerTokens} over `jose` (`wbs-machine-credentials` A13
 * step 3): one remote key set per JWKS URL, shared by every trusted issuer row
 * naming it, bounded by {@link TrustedIssuerKeySetOptions.maxKeySets}. A token
 * naming a `kid` the cached set lacks refetches once, unless the set was
 * fetched within the cooldown. Verification checks the signature with an
 * asymmetric algorithm, `iss`, `exp`, `nbf`, a non-empty `sub`, and `aud` when
 * an audience is expected.
 *
 * A key set that cannot be fetched (no answer, not 200, not JSON, not a key
 * set, a timeout) is reported and answered `key_set_unavailable`; it is never
 * replaced by another URL's keys.
 */
export class TrustedIssuerKeySets implements TrustedIssuerTokens {
  private readonly keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

  constructor(private readonly options: TrustedIssuerKeySetOptions) {}

  peek(token: string): UnverifiedJwtClaims | null {
    let payload: ReturnType<typeof decodeJwt>;
    try {
      payload = decodeJwt(token);
    } catch (cause) {
      if (cause instanceof errors.JWTInvalid) return null;
      throw cause;
    }
    if (typeof payload.iss !== 'string' || payload.iss === '') return null;
    return {
      issuer: payload.iss,
      subject: typeof payload.sub === 'string' && payload.sub !== '' ? payload.sub : null,
    };
  }

  async verify(token: string, expected: TrustedIssuerExpectation): Promise<TrustedIssuerVerdict> {
    try {
      const { payload } = await jwtVerify(token, this.keySetOf(expected.jwksUri), {
        algorithms: ASYMMETRIC_ALGORITHMS,
        issuer: expected.issuer,
        ...(expected.audience === null ? {} : { audience: expected.audience }),
      });
      if (typeof payload.sub !== 'string' || payload.sub === '') return { kind: 'invalid' };
      return { kind: 'verified', subject: payload.sub };
    } catch (cause) {
      // Proof: with this branch rethrowing, `refuses invalid_token when the
      // key set answers 503` in `oidc-credential.controller.db.test.ts`
      // answered 500; watched 2026-10-22.
      if (cause instanceof KeySetUnavailable || cause instanceof errors.JWKSInvalid) {
        this.options.report(
          { err: cause, jwksUri: expected.jwksUri, issuer: expected.issuer },
          'trusted issuer key set unavailable',
        );
        return { kind: 'key_set_unavailable' };
      }
      if (isInvalidCredential(cause)) return { kind: 'invalid' };
      throw cause;
    }
  }

  /** The cached key set of `url`, created on first use and moved to most recent. */
  private keySetOf(url: string): ReturnType<typeof createRemoteJWKSet> {
    const cached = this.keySets.get(url);
    if (cached !== undefined) {
      this.keySets.delete(url);
      this.keySets.set(url, cached);
      return cached;
    }
    const created = createRemoteJWKSet(new URL(url), {
      cooldownDuration: this.options.cooldownMs ?? 30_000,
      cacheMaxAge: this.options.cacheMaxAgeMs ?? 600_000,
      timeoutDuration: this.options.timeoutMs ?? 5_000,
      [customFetch]: (resource, init) => fetchKeySet(this.options.fetch, resource, init),
    });
    // Proof: with this eviction removed, `keeps at most maxKeySets key sets,
    // least recently used dropped first` (trusted-issuer.test.ts) saw 3 of
    // the 4 expected fetches: the evicted set was still cached; watched
    // 2026-10-22.
    const oldest = this.keySets.keys().next();
    if (this.keySets.size >= (this.options.maxKeySets ?? 64) && oldest.done !== true)
      this.keySets.delete(oldest.value);
    this.keySets.set(url, created);
    return created;
  }
}

/**
 * One key-set fetch, every failure of which becomes {@link KeySetUnavailable}
 * before `jose` reads it: no redirect followed, 200 required, a JSON body
 * required.
 */
async function fetchKeySet(
  fetch: IssuerFetch,
  url: string,
  init: { headers: Headers; method: 'GET'; redirect: 'manual'; signal: AbortSignal },
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new KeySetUnavailable(url, 'no answer', { cause });
  }
  if (response.status !== 200)
    throw new KeySetUnavailable(url, `answered ${String(response.status)}`);
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new KeySetUnavailable(url, 'not JSON', { cause });
  }
  return Response.json(body);
}

/** How {@link trustedIssuerDiscovery} fetches. */
export interface TrustedIssuerDiscoveryOptions {
  readonly fetch: IssuerFetch;
  /** How long the one discovery fetch may take. Default 5 s. */
  readonly timeoutMs?: number;
}

/**
 * {@link TrustedIssuerDiscovery} by one GET of
 * `<issuer without a trailing slash>/.well-known/openid-configuration`
 * (OpenID Connect Discovery 1.0 §4), following no redirect. The document's
 * `issuer` must equal the given URL exactly (§4.3), and its `jwks_uri` must be
 * an HTTPS URL short enough to store.
 */
export function trustedIssuerDiscovery(
  options: TrustedIssuerDiscoveryOptions,
): TrustedIssuerDiscovery {
  return {
    async discover(issuer): Promise<TrustedIssuerDiscoveryOutcome> {
      const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
      let document: unknown;
      try {
        const response = await options.fetch(url, {
          method: 'GET',
          redirect: 'manual',
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
        });
        if (response.status !== 200) return { kind: 'unreachable' };
        document = await response.json();
      } catch {
        // Every failure to obtain a document is the one modeled refusal
        // `issuer_unreachable` (A16): nothing is stored, the admin retries.
        // Proof: with this catch rethrowing, `refuses an unreachable issuer,
        // storing nothing` (trusted-issuer.controller.db.test.ts) answered
        // 500; watched 2026-10-22.
        return { kind: 'unreachable' };
      }
      if (typeof document !== 'object' || document === null) return { kind: 'unreachable' };
      const published: unknown = Reflect.get(document, 'issuer');
      if (typeof published !== 'string') return { kind: 'unreachable' };
      // Proof: with this comparison removed, `refuses a document naming
      // another issuer, storing nothing` (trusted-issuer.controller.db.test.ts)
      // registered the disagreeing issuer; watched 2026-10-22.
      if (published !== issuer) return { kind: 'mismatch' };
      const jwksUri: unknown = Reflect.get(document, 'jwks_uri');
      if (
        typeof jwksUri !== 'string' ||
        !jwksUri.startsWith('https://') ||
        jwksUri.length > MAX_URL_LENGTH
      )
        return { kind: 'unreachable' };
      return { kind: 'discovered', jwksUri };
    },
  };
}
