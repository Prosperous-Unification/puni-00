import { InFlightCounter } from './in-flight-counter';
import { type RetryAfter, takeEach, type TokenBucketRate, TokenBuckets } from './token-bucket';

/** One machine token request as the limits see it, before be-01 is asked. */
export interface IssuanceAttempt {
  /** `sourceAddressOf`'s answer for the request (`source-address.ts`). */
  readonly source: string;
  /**
   * The credential the request names before be-01 is asked: a key's own id, or the
   * JWT-bearer grant's `client_id` when sent; null when it names none.
   */
  readonly clientId: string | null;
}

/** Whether one `tools/call` message of a machine caller may run now. */
export type CallAdmission =
  | { readonly kind: 'admitted'; readonly release: () => void }
  | {
      readonly kind: 'limited';
      readonly reason: 'rate_limited' | 'too_many_in_flight';
      readonly retryAfterSeconds: number;
    };

/**
 * The tokens one admitted token request holds while be-01 is asked, settled once by its
 * outcome; the first settlement wins and later ones change nothing.
 */
export interface IssuanceReservation {
  /**
   * be-01 granted `credentialId`: the failure tokens are given back, and one issuance of that
   * credential is taken, or a wait is returned and the grant is dropped unsigned.
   */
  issued(credentialId: string): RetryAfter | null;
  /** A failed authentication: the failure tokens stay spent, the issuance token is given back. */
  failed(): void;
  /** Neither (another refusal, be-01 unavailable, a defect): every token is given back. */
  release(): void;
}

/** Whether a token request may ask be-01 now. */
export type IssuanceAdmission =
  | { readonly kind: 'reserved'; readonly reservation: IssuanceReservation }
  | { readonly kind: 'limited'; readonly retryAfterSeconds: number };

/**
 * The per-replica fences on machine traffic (`wbs-mcp-agent-surface` M10). The token endpoint
 * reserves before be-01 is asked ({@link reserveIssuance}) and settles the reservation by the
 * outcome; `/mcp` asks {@link admitCall} per `tools/call` message.
 */
export interface MachineLimits {
  /**
   * Pessimistic: takes one failure token per source, one per `(client_id, source)` when the
   * request names a credential, and one issuance per source, all or none, before be-01 is
   * asked; a wait when any is empty. Concurrent requests therefore cannot all pass one check.
   */
  reserveIssuance(attempt: IssuanceAttempt): IssuanceAdmission;
  /** Counts one `tools/call` message, and holds an in-flight slot until it is released. */
  admitCall(caller: {
    readonly credentialId: string;
    readonly organizationId: string;
  }): CallAdmission;
}

/** M10's defaults, per replica. */
export const M10_LIMITS = {
  failuresPerClientAndSource: { burst: 5, perSecond: 5 / 60 },
  failuresPerSource: { burst: 30, perSecond: 30 / 60 },
  issuancesPerCredential: { burst: 100, perSecond: 300 / 60 },
  issuancesPerSource: { burst: 100, perSecond: 300 / 60 },
  callsPerCredential: { burst: 20, perSecond: 10 },
  callsInFlightPerOrganization: 128,
} as const satisfies MachineLimitRates;

export interface MachineLimitRates {
  readonly failuresPerClientAndSource: TokenBucketRate;
  readonly failuresPerSource: TokenBucketRate;
  readonly issuancesPerCredential: TokenBucketRate;
  readonly issuancesPerSource: TokenBucketRate;
  readonly callsPerCredential: TokenBucketRate;
  readonly callsInFlightPerOrganization: number;
}

/**
 * A full in-flight slot set frees as calls end, at no rate a bucket knows; one second is the
 * wait a client is asked for.
 */
const IN_FLIGHT_RETRY_AFTER_SECONDS = 1;

/**
 * M10's six limits for one replica. Failures and successes are counted in separate buckets,
 * so a stranger who knows a credential's public id and sends wrong secrets empties only the
 * failure buckets of their own address, never the credential's issuances. A token request
 * holds its failure and per-source issuance tokens while be-01 is asked, and its outcome gives
 * back the ones it did not use. `tools/call` is
 * counted per message, so one JSON-RPC batch of 100 calls counts 100.
 */
export class MachineTrafficLimits implements MachineLimits {
  readonly #failuresPerClientAndSource: TokenBuckets;
  readonly #failuresPerSource: TokenBuckets;
  readonly #issuancesPerCredential: TokenBuckets;
  readonly #issuancesPerSource: TokenBuckets;
  readonly #callsPerCredential: TokenBuckets;
  readonly #callsInFlight: InFlightCounter;

  constructor(now: () => number, rates: MachineLimitRates = M10_LIMITS) {
    this.#failuresPerClientAndSource = new TokenBuckets(rates.failuresPerClientAndSource, now);
    this.#failuresPerSource = new TokenBuckets(rates.failuresPerSource, now);
    this.#issuancesPerCredential = new TokenBuckets(rates.issuancesPerCredential, now);
    this.#issuancesPerSource = new TokenBuckets(rates.issuancesPerSource, now);
    this.#callsPerCredential = new TokenBuckets(rates.callsPerCredential, now);
    this.#callsInFlight = new InFlightCounter(rates.callsInFlightPerOrganization);
  }

  reserveIssuance(attempt: IssuanceAttempt): IssuanceAdmission {
    const failures: (readonly [TokenBuckets, string])[] = [
      [this.#failuresPerSource, attempt.source],
    ];
    if (attempt.clientId !== null)
      failures.push([
        this.#failuresPerClientAndSource,
        pairKeyOf(attempt.clientId, attempt.source),
      ]);
    const issuance = [this.#issuancesPerSource, attempt.source] as const;
    // Taken, not read: a check that only reads lets every concurrent request through it.
    // Proof: reading the buckets here and spending the failures after be-01 answered (the order
    // before the review of PR #765) failed `lets at most 30 of 100 concurrent wrong keys from one
    // source reach be-01` and `lets at most the burst of 300 concurrent issuances…`
    // (machine-limits.test.ts): all 100 and all 300 reached be-01; watched 2026-10-27.
    const waiting = takeEach([...failures, issuance]);
    if (waiting !== null) return { kind: 'limited', retryAfterSeconds: waiting.retryAfterSeconds };
    let settled = false;
    const settle = (): boolean => {
      if (settled) return false;
      settled = true;
      return true;
    };
    return {
      kind: 'reserved',
      reservation: {
        issued: (credentialId) => {
          if (!settle()) return null;
          // Successes never cost failure tokens, so a stranger cannot lock a credential out and
          // its own issuances never fill its address's failure buckets.
          // Proof: keeping the failure tokens spent on success failed `one address issues 100
          // tokens for a pool of 100 within a minute` (machine-limits.test.ts); watched
          // 2026-10-27.
          for (const [bucket, key] of failures) bucket.give(key);
          // Counted per credential only once be-01 verified it, so a claimed public id answers
          // 429 only to its holder (no 429-or-401 oracle; review of PR #765, N1).
          // Proof: with this take removed, `refuses the 101st issuance of one credential at once,
          // from any address` (machine-limits.test.ts) signed it; watched 2026-10-27.
          return this.#issuancesPerCredential.take(credentialId);
        },
        failed: () => {
          if (!settle()) return;
          // Proof: keeping the issuance token on a failure (one bucket for successes and failures)
          // failed `a failure gives the address's issuance token back` (machine-limits.test.ts);
          // watched 2026-10-27.
          issuance[0].give(issuance[1]);
        },
        release: () => {
          if (!settle()) return;
          for (const [bucket, key] of [...failures, issuance]) bucket.give(key);
        },
      },
    };
  }

  admitCall(caller: {
    readonly credentialId: string;
    readonly organizationId: string;
  }): CallAdmission {
    // A message limited here, or by the in-flight limit below, still spends its rate token: the
    // bucket bounds messages sent, not calls run.
    const waiting = this.#callsPerCredential.take(caller.credentialId);
    if (waiting !== null)
      return {
        kind: 'limited',
        reason: 'rate_limited',
        retryAfterSeconds: waiting.retryAfterSeconds,
      };
    const release = this.#callsInFlight.acquire(caller.organizationId);
    if (release === null)
      return {
        kind: 'limited',
        reason: 'too_many_in_flight',
        retryAfterSeconds: IN_FLIGHT_RETRY_AFTER_SECONDS,
      };
    return { kind: 'admitted', release };
  }
}

/** Admits everything: for tests that are not about M10. Production composes {@link MachineTrafficLimits}. */
export const NO_MACHINE_LIMITS: MachineLimits = {
  reserveIssuance: () => ({
    kind: 'reserved',
    reservation: { issued: () => null, failed: () => undefined, release: () => undefined },
  }),
  admitCall: () => ({ kind: 'admitted', release: () => undefined }),
};

/** One key per `client_id` and source: a source (an IP or `UNATTRIBUTED_SOURCE`) holds no NUL. */
function pairKeyOf(clientId: string, source: string): string {
  return `${clientId}\u0000${source}`;
}
