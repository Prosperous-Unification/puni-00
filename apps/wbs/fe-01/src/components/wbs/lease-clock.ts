import { useEffect, useState, useSyncExternalStore } from 'react';

/** How often the plan's one lease ticker advances what the chips read (C6). */
export const LEASE_TICK_MS = 15_000;

/**
 * The plan's lease clock: the monotonic instant its one ticker last read, and
 * who to tell when it moves. One per plan, handed to every chip inside its
 * `DrawnClaim`, so a tick re-renders the chips and nothing else.
 */
export interface LeaseClock {
  readonly subscribe: (onTick: () => void) => () => void;
  /** `performance.now()` as of the last tick. */
  readonly now: () => number;
  /** Reads the clock again and tells every chip; the ticker's, never a chip's. */
  readonly tick: () => void;
}

/**
 * A lease clock reading `performance.now()`: the clock the claims resource
 * stamps `installedAt` on (`modules/plan-feed/composition.ts`), so elapsed time
 * is measured on one clock.
 */
export function createLeaseClock(): LeaseClock {
  const listeners = new Set<() => void>();
  let now = performance.now();
  return {
    subscribe: (onTick) => {
      listeners.add(onTick);
      return () => {
        listeners.delete(onTick);
      };
    },
    now: () => now,
    tick: () => {
      // Proof: a tick that read no clock left `runs one timer for every leased
      // chip, and counts down on it` at `✕CO14m`, expected `12m`; watched
      // 2026-10-24.
      now = performance.now();
      for (const listener of listeners) listener();
    },
  };
}

/** The plan's lease clock, made once per mount. */
export function useLeaseClock(): LeaseClock {
  const [clock] = useState(createLeaseClock);
  return clock;
}

/** The monotonic instant a chip reads its lease at, re-read on every tick. */
export function useLeaseNow(clock: LeaseClock): number {
  // Proof: a timer started here, one per chip, made the three `the lease
  // ticker` cases fail on the timer count (`expected 6 to be 1`, `expected 3
  // to be 1`, `expected 2 to be +0`); watched 2026-10-24.
  return useSyncExternalStore(clock.subscribe, clock.now);
}

/**
 * The plan's one lease ticker (`wbs-claim-display` C6): ticks `clock` every
 * {@link LEASE_TICK_MS} while `running` and the page is visible, and runs no
 * timer at all otherwise. Becoming visible again ticks at once, so a tab left
 * in the background does not show a lease as it stood when it was hidden.
 *
 * @param clock The plan's lease clock, from {@link useLeaseClock}.
 * @param running Whether any drawn claim holds a lease in force.
 */
export function useLeaseTicker(clock: LeaseClock, running: boolean): void {
  useEffect(() => {
    // Proof: this return removed, `runs no timer while no drawn claim holds a
    // lease in force` failed on `expected 1 to be +0`; watched 2026-10-24.
    if (!running) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = (): void => {
      if (timer !== null) return;
      clock.tick();
      timer = setInterval(clock.tick, LEASE_TICK_MS);
    };
    const stop = (): void => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };
    // Proof: starting regardless of visibility made `stops the ticker while the
    // page is hidden, and resumes when it shows` fail on `expected 1 to be +0`;
    // watched 2026-10-24.
    const follow = (): void => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };
    follow();
    document.addEventListener('visibilitychange', follow);
    return () => {
      document.removeEventListener('visibilitychange', follow);
      stop();
    };
  }, [clock, running]);
}
