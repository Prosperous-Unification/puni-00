import type { Monotonic } from '../../clock';

/** A {@link Monotonic} that moves only when a test calls `advance`, so no deadline depends on load. */
export interface ScriptedMonotonic extends Monotonic {
  advance(milliseconds: number): void;
}

export function scriptedMonotonic(): ScriptedMonotonic {
  let elapsed = 0;
  return {
    now: () => elapsed,
    advance: (milliseconds) => {
      elapsed += milliseconds;
    },
  };
}
