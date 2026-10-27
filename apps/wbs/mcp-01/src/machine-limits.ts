import { InFlightCounter } from './in-flight-counter';
import {
  longestOf,
  type RetryAfter,
  takeEach,
  type TokenBucketRate,
  TokenBuckets,
} from './token-bucket';

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
 * The per-replica fences on machine traffic (`wbs-mcp-agent-surface` M10). The token endpoint
 * asks {@link admitIssuance} before be-01, reports each failed authentication, and takes an
 * issuance once be-01 granted one; `/mcp` asks {@link admitCall} per `tools/call` message.
 */
export interface MachineLimits {
  /** A wait when the request's failure or success buckets are empty, else null. Takes nothing. */
  admitIssuance(attempt: IssuanceAttempt): RetryAfter | null;
  /** Counts one failed authentication per `(client_id, source)` and per source. */
  recordFailedIssuance(attempt: IssuanceAttempt): void;
  /**
   * Takes one success per credential and per source once be-01 granted `credentialId`, or
   * a wait and takes nothing; the token is then not signed.
   */
  takeIssuance(attempt: IssuanceAttempt, credentialId: string): RetryAfter | null;
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
 * failure buckets of their own address, never the credential's issuances. `tools/call` is
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

  admitIssuance(attempt: IssuanceAttempt): RetryAfter | null {
    const waits = [
      this.#failuresPerSource.retryAfter(attempt.source),
      this.#issuancesPerSource.retryAfter(attempt.source),
    ];
    if (attempt.clientId !== null)
      waits.push(
        this.#failuresPerClientAndSource.retryAfter(pairKeyOf(attempt.clientId, attempt.source)),
        this.#issuancesPerCredential.retryAfter(attempt.clientId),
      );
    return longestOf(waits);
  }

  recordFailedIssuance(attempt: IssuanceAttempt): void {
    // Proof: spending the issuance buckets here instead (one bucket for successes and failures)
    // failed `a stranger's wrong secrets do not lock out the credential` and four more
    // (machine-limits.test.ts); watched 2026-10-27.
    this.#failuresPerSource.spend(attempt.source);
    if (attempt.clientId !== null)
      this.#failuresPerClientAndSource.spend(pairKeyOf(attempt.clientId, attempt.source));
  }

  takeIssuance(attempt: IssuanceAttempt, credentialId: string): RetryAfter | null {
    return takeEach([
      [this.#issuancesPerCredential, credentialId],
      [this.#issuancesPerSource, attempt.source],
    ]);
  }

  admitCall(caller: {
    readonly credentialId: string;
    readonly organizationId: string;
  }): CallAdmission {
    // A refused message still counts: the bucket bounds messages sent, not calls run.
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
  admitIssuance: () => null,
  recordFailedIssuance: () => undefined,
  takeIssuance: () => null,
  admitCall: () => ({ kind: 'admitted', release: () => undefined }),
};

/** One key per `client_id` and source: a source (an IP or `UNATTRIBUTED_SOURCE`) holds no NUL. */
function pairKeyOf(clientId: string, source: string): string {
  return `${clientId}\u0000${source}`;
}
