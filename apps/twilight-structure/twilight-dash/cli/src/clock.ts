/**
 * Trusted epoch-millisecond source. Wall time can step backwards or jump; it stamps records and
 * leases, never a deadline. Every reader receives it as a dependency.
 */
export interface WallClock {
  read(): number;
}

/**
 * Milliseconds from an arbitrary per-process origin that never step backwards. Deadlines and
 * elapsed budgets are measured on it; its values mean nothing across processes or in records.
 */
export interface Monotonic {
  now(): number;
}

/**
 * The host wall clock. Together with {@link monotonicClock} this module holds Dash's only
 * ambient time reads; `entrypoint.ts` and `activation/observation-service-cli.ts` compose them
 * once per process.
 * Proof: appending `Date.now()` to authority/claims.ts failed `only clock.ts reads the wall
 * clock` naming `authority/claims.ts` (2026-10-11, again under the AST scan on 2026-10-12).
 */
export function wallClock(): WallClock {
  return { read: () => Date.now() };
}

/** The host monotonic clock (`performance.now()`), composed beside {@link wallClock}. */
export function monotonicClock(): Monotonic {
  return { now: () => performance.now() };
}
