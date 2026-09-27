/**
 * Where a retirement started outside the application is handed, so the
 * application's own retirement waits for it — a feature port, reached through
 * {@link import('./application-services-context').useRetirementJoin} and never
 * as a bag (rule K2).
 *
 * The signed-in region hands its session's retirement here when it goes. On
 * page hide the bootstrap takes the React root down first, so the region's
 * retirement is joined while the application is still live, and only then
 * retires the application — whose close awaits it.
 */
export interface RetirementJoin {
  /** Hands over one retirement: the application's retirement waits for it, and fails if it fails. */
  readonly join: (retirement: Promise<void>) => void;
}

/** A retirement join, and the one wait its owner's close runs. */
export interface OwnedRetirementJoin extends RetirementJoin {
  /**
   * Resolves once every retirement joined so far — including one joined while
   * this waits — has settled, and from then on refuses any other.
   *
   * @throws `AggregateError` of every failure a joined retirement rejected with,
   * whenever it rejected: a retirement that failed before the wait began still
   * fails it.
   */
  readonly settle: () => Promise<void>;
}

/** A join handed a retirement after the application it belongs to has retired. */
export class RetirementJoinClosedError extends Error {
  constructor() {
    super('a retirement was joined to an application that has already retired');
    this.name = 'RetirementJoinClosedError';
  }
}

/** Builds the application's retirement join, holding nothing until a retirement is handed to it. */
export function createRetirementJoin(): OwnedRetirementJoin {
  const pending = new Set<Promise<void>>();
  const failures: unknown[] = [];
  let settled = false;
  return {
    join: (retirement) => {
      // Proof: on 2026-09-27, accepting a join after the wait had finished (j3) failed
      // `refuses a retirement handed to it once it has settled` on `expected function to throw
      // an error, but it didn't`.
      if (settled) throw new RetirementJoinClosedError();
      const tracked: Promise<void> = retirement.then(
        () => {
          pending.delete(tracked);
        },
        (failure: unknown) => {
          pending.delete(tracked);
          // Proof: on 2026-09-27, dropping a joined failure here (j2) failed `fails when a joined
          // retirement failed, whenever it failed` on `promise resolved "undefined" instead of
          // rejecting`; the bootstrap's model failed after 44 tests: `a session that failed left
          // the slot empty`.
          failures.push(failure);
        },
      );
      pending.add(tracked);
    },
    settle: async () => {
      // Proof: on 2026-09-27, waiting once for the retirements joined before the wait (j1) failed
      // `waits for a retirement joined while it waits` on `expected [ 'settled', 'joined late' ]
      // to deeply equal [ 'joined late', 'settled' ]`.
      while (pending.size > 0) await Promise.all(pending);
      settled = true;
      if (failures.length > 0) {
        throw new AggregateError(failures, 'a retirement the application joined failed');
      }
    },
  };
}
