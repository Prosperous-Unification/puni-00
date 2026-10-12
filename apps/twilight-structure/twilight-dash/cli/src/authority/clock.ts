import type { AuthorityClock } from './authority-store';

/**
 * The host wall clock, the only ambient time read under Dash's authority. `entrypoint.ts`
 * composes it once per process; every store and lifecycle write receives it as a dependency.
 * Proof: inserting `Date.now()` into claims.ts failed `only clock.ts reads the wall clock`
 * naming `authority/claims.ts` (2026-10-11).
 */
export function wallClock(): AuthorityClock {
  return { read: () => Date.now() };
}
