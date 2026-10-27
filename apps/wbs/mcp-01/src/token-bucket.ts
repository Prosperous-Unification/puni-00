/** A token bucket's shape: at most `burst` tokens, refilled continuously at `perSecond`. */
export interface TokenBucketRate {
  readonly burst: number;
  readonly perSecond: number;
}

/** One bucket's tokens as of `at` (milliseconds); an absent level is a full bucket. */
export interface TokenBucketLevel {
  readonly tokens: number;
  readonly at: number;
}

/** How long a refused request should wait, as HTTP `Retry-After` seconds. */
export interface RetryAfter {
  readonly retryAfterSeconds: number;
}

/**
 * `level` refilled to `now`. A clock that went back refills nothing, so a bucket never gains
 * tokens from a step backwards and never exceeds `burst`.
 */
export function levelAt(
  level: TokenBucketLevel | undefined,
  rate: TokenBucketRate,
  now: number,
): TokenBucketLevel {
  if (level === undefined) return { tokens: rate.burst, at: now };
  // Proof: without the floor at 0, `gains nothing from a clock that steps back`; without the cap,
  // `admits at most the burst at once, however long the bucket sat idle` (token-bucket.test.ts)
  // failed; watched 2026-10-27.
  const elapsedSeconds = Math.max(0, now - level.at) / 1_000;
  return {
    tokens: Math.min(rate.burst, level.tokens + elapsedSeconds * rate.perSecond),
    at: Math.max(now, level.at),
  };
}

/**
 * Whole seconds until `level` holds one token, at least 1, or null when it holds one now.
 * Rounding up means a client that waits exactly this long finds the token.
 */
export function retryAfterOf(level: TokenBucketLevel, rate: TokenBucketRate): RetryAfter | null {
  if (level.tokens >= 1) return null;
  // Proof: `Math.floor` here failed `admits a fresh key its whole burst at once, then refuses
  // with a wait that suffices` (token-bucket.test.ts); watched 2026-10-27.
  return { retryAfterSeconds: Math.max(1, Math.ceil((1 - level.tokens) / rate.perSecond)) };
}

/**
 * Token buckets of one rate, one per key, held in memory for one replica
 * (`wbs-mcp-agent-surface` M10).
 *
 * A bucket that has refilled to `burst` is the same as no bucket, so it is dropped: at most
 * once per full-refill interval, the next change sweeps every full bucket. The map therefore
 * holds only keys touched within about two refill intervals, whatever the number of keys seen.
 */
export class TokenBuckets {
  readonly #levels = new Map<string, TokenBucketLevel>();
  readonly #fullRefillMs: number;
  #sweptAt: number;

  /**
   * @param rate the bucket's burst and refill.
   * @param now the clock, in milliseconds.
   * @param debt how far below zero {@link spend} may take a bucket; 0 for none.
   * @throws when `burst` is under 1, `perSecond` is not positive, or `debt` is negative or not
   *   finite: such a bucket admits nothing, or never pays back.
   */
  constructor(
    readonly rate: TokenBucketRate,
    private readonly now: () => number,
    private readonly debt = 0,
  ) {
    if (!(rate.burst >= 1) || !(rate.perSecond > 0) || !Number.isFinite(rate.perSecond))
      throw new Error('a token bucket needs a burst of at least 1 and a positive finite rate');
    // Proof: without this check, `refuses a negative or unbounded debt` (token-bucket.test.ts)
    // built both; watched 2026-10-27.
    if (!(debt >= 0) || !Number.isFinite(debt))
      throw new Error('a token bucket debt must be a finite number of at least 0');
    this.#fullRefillMs = (rate.burst / rate.perSecond) * 1_000;
    this.#sweptAt = now();
  }

  /** The wait before `key` has a token, or null when it has one now. Changes nothing. */
  retryAfter(key: string): RetryAfter | null {
    return retryAfterOf(levelAt(this.#levels.get(key), this.rate, this.now()), this.rate);
  }

  /** Takes one token from `key`'s bucket when it holds one; otherwise takes nothing. */
  take(key: string): RetryAfter | null {
    const now = this.now();
    const level = levelAt(this.#levels.get(key), this.rate, now);
    const waiting = retryAfterOf(level, this.rate);
    if (waiting === null) this.#store(key, { tokens: level.tokens - 1, at: level.at }, now);
    return waiting;
  }

  /**
   * Counts one event that has already happened, such as a failed authentication: one token,
   * down to `-debt` and no further. Concurrent events that all passed {@link retryAfter} are
   * counted, never refused, so a level may go negative: the bucket then refills from there, and
   * its wait ({@link retryAfterOf}) includes paying the debt back. With a debt at least the
   * number of events that can pass the check together, none is lost.
   */
  spend(key: string): void {
    const now = this.now();
    const level = levelAt(this.#levels.get(key), this.rate, now);
    // Proof: storing only when a whole token was left failed `counts a spend on a part-filled
    // bucket, so the part is spent too` (token-bucket.test.ts); flooring at 0 instead of
    // `-debt` failed `holds a source to the design failure rate over ten minutes of concurrent
    // wrong keys` (machine-limits.test.ts) with 6000 asked; watched 2026-10-27.
    this.#store(key, { tokens: Math.max(-this.debt, level.tokens - 1), at: level.at }, now);
  }

  /** Gives one token back to `key`'s bucket, never beyond `burst`: a reservation not used. */
  give(key: string): void {
    const now = this.now();
    const level = levelAt(this.#levels.get(key), this.rate, now);
    // Past `burst` is never read: `levelAt` caps every read.
    this.#store(key, { tokens: level.tokens + 1, at: level.at }, now);
  }

  /** How many buckets are held, for tests of the bound. */
  get size(): number {
    return this.#levels.size;
  }

  #store(key: string, level: TokenBucketLevel, now: number): void {
    this.#levels.set(key, level);
    // Proof: never sweeping failed `holds only the keys touched within two full-refill
    // intervals` (token-bucket.test.ts); watched 2026-10-27.
    if (now - this.#sweptAt < this.#fullRefillMs) return;
    this.#sweptAt = now;
    for (const [held, stored] of this.#levels)
      if (levelAt(stored, this.rate, now).tokens >= this.rate.burst) this.#levels.delete(held);
  }
}

/** The longest of several waits, or null when there is none. */
export function longestOf(waits: readonly (RetryAfter | null)[]): RetryAfter | null {
  let longest: RetryAfter | null = null;
  for (const waiting of waits)
    if (
      waiting !== null &&
      (longest === null || waiting.retryAfterSeconds > longest.retryAfterSeconds)
    )
      longest = waiting;
  return longest;
}
