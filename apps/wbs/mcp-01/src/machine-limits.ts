import { InFlightCounter } from './in-flight-counter';
import { longestOf, type RetryAfter, type TokenBucketRate, TokenBuckets } from './token-bucket';

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
 * What one admitted token request holds while be-01 is asked (a pending slot of its source and
 * one issuance token of its source), settled once by its outcome; every settlement ends the
 * pending slot, the first wins and later ones change nothing.
 */
export interface IssuanceReservation {
  /**
   * be-01 granted `credentialId`: one issuance of that credential is taken, or a wait is
   * returned and the grant is dropped unsigned.
   */
  issued(credentialId: string): RetryAfter | null;
  /** A failed authentication: the failure buckets are spent, the issuance token given back. */
  failed(): void;
  /** Neither (another refusal, be-01 unavailable, a defect): the issuance token is given back. */
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
   * Before be-01 is asked: reads the failure buckets (per source, and per `(client_id,
   * source)` when the request names a credential), then takes a pending slot of the source and
   * one issuance per source; a wait when any refuses. The pending cap bounds how many
   * concurrent requests can pass the read together.
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
  pendingIssuancesPerSource: 100,
} as const satisfies MachineLimitRates;

export interface MachineLimitRates {
  readonly failuresPerClientAndSource: TokenBucketRate;
  readonly failuresPerSource: TokenBucketRate;
  readonly issuancesPerCredential: TokenBucketRate;
  readonly issuancesPerSource: TokenBucketRate;
  readonly callsPerCredential: TokenBucketRate;
  readonly callsInFlightPerOrganization: number;
  /**
   * Token requests of one source waiting on be-01 at once: the per-source issuance burst, so a
   * 100-pod rollout behind one egress address issues at once, and the failure fence, which is
   * read rather than reserved, is overshot by at most this many per burst.
   */
  readonly pendingIssuancesPerSource: number;
}

/**
 * A full in-flight slot set frees as calls end, at no rate a bucket knows; one second is the
 * wait a client is asked for.
 */
const IN_FLIGHT_RETRY_AFTER_SECONDS = 1;

/** As for in-flight calls: pending token requests end at no rate a bucket knows. */
const PENDING_RETRY_AFTER_SECONDS = 1;

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
  readonly #pendingPerSource: InFlightCounter;

  constructor(now: () => number, rates: MachineLimitRates = M10_LIMITS) {
    this.#failuresPerClientAndSource = new TokenBuckets(rates.failuresPerClientAndSource, now);
    this.#failuresPerSource = new TokenBuckets(rates.failuresPerSource, now);
    this.#issuancesPerCredential = new TokenBuckets(rates.issuancesPerCredential, now);
    this.#issuancesPerSource = new TokenBuckets(rates.issuancesPerSource, now);
    this.#callsPerCredential = new TokenBuckets(rates.callsPerCredential, now);
    this.#callsInFlight = new InFlightCounter(rates.callsInFlightPerOrganization);
    this.#pendingPerSource = new InFlightCounter(rates.pendingIssuancesPerSource);
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
    // Read, not taken: reserving failure tokens capped a source's legitimate concurrency at the
    // failure burst (review of PR #765, B1). The overshoot a read allows is bounded by the
    // pending cap below, once per burst.
    // Proof: taking the failure tokens here (the fa37fa65a order) failed `admits 100 concurrent
    // issuances of one credential from one source` and `admits 100 concurrent issuances of
    // distinct credentials from one source` (machine-limits.test.ts): 5 and 30 asked; watched
    // 2026-10-27.
    const failing = longestOf(failures.map(([bucket, key]) => bucket.retryAfter(key)));
    if (failing !== null) return { kind: 'limited', retryAfterSeconds: failing.retryAfterSeconds };
    // The per-source issuance reservation alone bounds a burst, not concurrency: it refills
    // while be-01 is slow, and the failure buckets read above fill only as answers arrive.
    // Proof: with this cap removed, `holds a source to the pending cap while be-01 is slow, even
    // once its issuances refill` (machine-limits.test.ts) saw 200 asked; watched 2026-10-27.
    const endPending = this.#pendingPerSource.acquire(attempt.source);
    if (endPending === null)
      return { kind: 'limited', retryAfterSeconds: PENDING_RETRY_AFTER_SECONDS };
    const issuance = [this.#issuancesPerSource, attempt.source] as const;
    const issuing = issuance[0].take(issuance[1]);
    if (issuing !== null) {
      endPending();
      return { kind: 'limited', retryAfterSeconds: issuing.retryAfterSeconds };
    }
    let settled = false;
    const settle = (): boolean => {
      if (settled) return false;
      settled = true;
      endPending();
      return true;
    };
    return {
      kind: 'reserved',
      reservation: {
        issued: (credentialId) => {
          if (!settle()) return null;
          // Counted per credential only once be-01 verified it, so a claimed public id answers
          // 429 only to its holder (no 429-or-401 oracle; review of PR #765, N1).
          // Proof: with this take removed, `refuses the 101st issuance of one credential at once,
          // from any address` (machine-limits.test.ts) signed it; watched 2026-10-27.
          return this.#issuancesPerCredential.take(credentialId);
        },
        failed: () => {
          if (!settle()) return;
          // Proof: with this spend removed, `counts a rotating spoofed first entry…` and three more
          // (machine-limits.test.ts) never answered 429; watched 2026-10-27.
          for (const [bucket, key] of failures) bucket.spend(key);
          // Proof: keeping the issuance token on a failure (one bucket for successes and failures)
          // failed `a failure gives the address's issuance token back` (machine-limits.test.ts);
          // watched 2026-10-27.
          issuance[0].give(issuance[1]);
        },
        release: () => {
          if (!settle()) return;
          issuance[0].give(issuance[1]);
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
