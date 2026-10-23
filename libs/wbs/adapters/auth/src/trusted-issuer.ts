import {
  // Proof: restoring the core barrel failed MCP startup with poisoned barrels.
  isPublicIssuerUrl,
  type TrustedIssuerDiscovery,
  type TrustedIssuerDiscoveryOutcome,
  type TrustedIssuerExpectation,
  type TrustedIssuerTokens,
  type TrustedIssuerVerdict,
  type UnverifiedJwtClaims,
} from '@wbs/core/ports/trusted-issuers';
import { createRemoteJWKSet, customFetch, decodeJwt, errors, jwtVerify } from 'jose';

import { isInvalidCredential } from './oidc-verifier';

/** The one fetch these adapters call; production passes `globalThis.fetch`. */
export type IssuerFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Asymmetric JWS algorithms only: a trusted issuer signs with a key it
 * publishes, so an `HS*` token can never verify against its key set, not even
 * against an `oct` key a misconfigured issuer publishes.
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

/**
 * The longest a machine token may still be valid for, in seconds, from the
 * moment it is presented: one hour. Workload identity tokens are minted per
 * job and live minutes (GitHub Actions: about five); a token that claims to
 * live for years is a long-lived secret in disguise, and refusing it keeps a
 * leaked one short-lived.
 */
const MAX_TOKEN_LIFETIME_SECONDS = 60 * 60;

/** The largest key set read, in bytes; a larger body is a key set that cannot be used. */
const MAX_KEY_SET_BYTES = 256 * 1024;

/** The largest discovery document read, in bytes; a larger body is unreachable. */
const MAX_DISCOVERY_BYTES = 64 * 1024;

/** How long a key set that failed to fetch is answered unavailable without a refetch. */
const FAILURE_COOLDOWN_MS = 30_000;

/** A key set that could not be fetched or read: a verdict, never a credential failure. */
class KeySetUnavailable extends Error {
  constructor(url: string, reason: string, options?: { cause: unknown }) {
    super(`the key set at ${url} is unavailable: ${reason}`, options);
    this.name = 'KeySetUnavailable';
  }
}

/** A body read past its cap. */
class BodyTooLarge extends Error {
  constructor(limit: number) {
    super(`the body exceeds ${String(limit)} bytes`);
    this.name = 'BodyTooLarge';
  }
}

/**
 * `promise`, or a rejection as soon as `signal` aborts, whichever comes first:
 * a fetch implementation that ignores its signal still ends at the deadline.
 */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', abort);
    });
  });
}

/**
 * The body of `response` parsed as JSON, read no further than `limit` bytes.
 *
 * @throws {@link BodyTooLarge} past the limit, and when the body cannot be
 * read in time or is not JSON.
 */
async function cappedJson(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<unknown> {
  if (response.body === null) throw new Error('no body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const read = await untilAborted(reader.read(), signal);
    if (read.done) break;
    length += read.value.byteLength;
    // Proof: with this cap removed, `refuses a key set or a discovery
    // document larger than its cap` (trusted-issuer.test.ts) verified the
    // token against the oversized key set; watched 2026-10-22.
    if (length > limit) {
      await reader.cancel();
      throw new BodyTooLarge(limit);
    }
    chunks.push(read.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
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
  /** The clock that judges `exp`, `nbf`, the lifetime cap and the failure cooldown. `Date.now` by default. */
  readonly now?: () => number;
}

/**
 * {@link TrustedIssuerTokens} over `jose` (`wbs-machine-credentials` A13
 * step 3, A25): one remote key set per JWKS URL, shared by every trusted
 * issuer row naming it, bounded by {@link TrustedIssuerKeySetOptions.maxKeySets}.
 * A token naming a `kid` the cached set lacks refetches once, unless the set
 * was fetched within the cooldown. Verification checks the signature with an
 * asymmetric algorithm, `iss`, `aud` (always), `exp` and `sub` (both
 * required, `sub` non-empty), `nbf`, and a remaining lifetime of at most one
 * hour ({@link MAX_TOKEN_LIFETIME_SECONDS}).
 *
 * A key set that cannot be fetched (no answer, not 200, a redirect, not
 * JSON, over 256 KB, not a key set, past the 5 s timeout) is reported and
 * answered `key_set_unavailable`, and for the next 30 s answered so again
 * without a fetch; it is never replaced by another URL's keys.
 */
export class TrustedIssuerKeySets implements TrustedIssuerTokens {
  private readonly keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
  private readonly failedUntil = new Map<string, number>();

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
    const aud: unknown = payload.aud;
    return {
      issuer: payload.iss,
      subject: typeof payload.sub === 'string' && payload.sub !== '' ? payload.sub : null,
      audiences:
        typeof aud === 'string'
          ? [aud]
          : Array.isArray(aud)
            ? aud.filter((each): each is string => typeof each === 'string')
            : [],
    };
  }

  async verify(token: string, expected: TrustedIssuerExpectation): Promise<TrustedIssuerVerdict> {
    const now = (this.options.now ?? Date.now)();
    // Proof: with this short-circuit removed, `fetches a failing key set at
    // most once per cooldown` (trusted-issuer.test.ts) fetched on every
    // verification; watched 2026-10-22.
    if ((this.failedUntil.get(expected.jwksUri) ?? 0) > now) return { kind: 'key_set_unavailable' };
    try {
      const { payload } = await jwtVerify(token, this.keySetOf(expected.jwksUri), {
        // Proof: with this option removed, `refuses alg none and an HS256
        // token signed with a published oct key` (trusted-issuer.test.ts)
        // threw jose's `JOSENotSupported` for the HS256 token (a 500 on the
        // request path) instead of answering invalid: jose's key set selection
        // never admits a symmetric key, and this list is what makes that a
        // modeled refusal; watched 2026-10-22.
        algorithms: ASYMMETRIC_ALGORITHMS,
        issuer: expected.issuer,
        audience: expected.audience,
        // Proof: with `exp` dropped from this list, `refuses a token without
        // exp or living longer than an hour` (trusted-issuer.test.ts)
        // verified the token without `exp`; watched 2026-10-22.
        requiredClaims: ['exp', 'sub'],
        currentDate: new Date(now),
      });
      // Proof: with this check removed, `refuses an empty sub`
      // (trusted-issuer.test.ts) answered verified; watched 2026-10-22.
      if (typeof payload.sub !== 'string' || payload.sub === '') return { kind: 'invalid' };
      // Proof: with this check removed, `refuses a token without exp or
      // living longer than an hour` verified the ten-year token; watched
      // 2026-10-22.
      if (
        typeof payload.exp !== 'number' ||
        payload.exp - Math.floor(now / 1000) > MAX_TOKEN_LIFETIME_SECONDS
      )
        return { kind: 'invalid' };
      return { kind: 'verified', subject: payload.sub };
    } catch (cause) {
      // Proof: with this branch rethrowing, `refuses invalid_token when the
      // key set answers 503` in `oidc-credential.controller.db.test.ts`
      // answered 500; watched 2026-10-22.
      if (
        cause instanceof KeySetUnavailable ||
        cause instanceof errors.JWKSInvalid ||
        cause instanceof errors.JWKSTimeout
      ) {
        this.failedUntil.set(expected.jwksUri, now + FAILURE_COOLDOWN_MS);
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
 * before `jose` reads it: no redirect followed, 200 required, a JSON body of
 * at most {@link MAX_KEY_SET_BYTES} required, all within the signal's
 * deadline even when the fetch ignores it.
 */
async function fetchKeySet(
  fetch: IssuerFetch,
  url: string,
  init: { headers: Headers; method: 'GET'; redirect: 'manual'; signal: AbortSignal },
): Promise<Response> {
  let response: Response;
  try {
    // Proof: with this race removed, `ends a key-set fetch that never
    // answers at its timeout` (trusted-issuer.test.ts) hung past its test
    // timeout; watched 2026-10-22.
    response = await untilAborted(fetch(url, init), init.signal);
  } catch (cause) {
    throw new KeySetUnavailable(url, 'no answer', { cause });
  }
  // Proof: with this check removed, `refuses a key set answered by a redirect
  // or a 404, and reports it` (trusted-issuer.test.ts) verified the token
  // against a usable key set served with status 500; watched 2026-10-22.
  if (response.status !== 200)
    throw new KeySetUnavailable(url, `answered ${String(response.status)}`);
  let body: unknown;
  try {
    body = await cappedJson(response, MAX_KEY_SET_BYTES, init.signal);
  } catch (cause) {
    throw new KeySetUnavailable(url, 'not a JSON body within its cap', { cause });
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
 * (OpenID Connect Discovery 1.0 §4), following no redirect, ending at the
 * timeout even when the fetch ignores its signal, reading at most 64 KB. The
 * document's `issuer` must equal the given URL exactly (§4.3), and its
 * `jwks_uri` must be a public HTTPS URL ({@link isPublicIssuerUrl}) short
 * enough to store.
 */
export function trustedIssuerDiscovery(
  options: TrustedIssuerDiscoveryOptions,
): TrustedIssuerDiscovery {
  return {
    async discover(issuer): Promise<TrustedIssuerDiscoveryOutcome> {
      const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
      const signal = AbortSignal.timeout(options.timeoutMs ?? 5_000);
      let document: unknown;
      try {
        // Proof: with this race removed, `ends a discovery that never answers
        // at its timeout` (trusted-issuer.test.ts) hung past its test
        // timeout; watched 2026-10-22.
        const response = await untilAborted(
          options.fetch(url, {
            method: 'GET',
            redirect: 'manual',
            headers: { accept: 'application/json' },
            signal,
          }),
          signal,
        );
        if (response.status !== 200) return { kind: 'unreachable' };
        document = await cappedJson(response, MAX_DISCOVERY_BYTES, signal);
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
      // Proof: with the length bound removed, `answers unreachable for every
      // document it cannot use` (trusted-issuer.test.ts) discovered the
      // 2049-character jwks_uri; with the host check removed, it discovered
      // the plain-HTTP one (the check also holds HTTPS); watched 2026-10-22.
      if (
        typeof jwksUri !== 'string' ||
        jwksUri.length > MAX_URL_LENGTH ||
        !isPublicIssuerUrl(jwksUri)
      )
        return { kind: 'unreachable' };
      return { kind: 'discovered', jwksUri };
    },
  };
}
