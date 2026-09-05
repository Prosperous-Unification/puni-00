import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

import { SCHEDULER_CONTRACT_VERSION } from './contract-version';
import {
  computeFastGoldenCorpus,
  FAST_GOLDEN_CASES,
  serializeSchedule,
} from './fast-golden-corpus';
import { schedule, ScheduleInvalidOptimizedStartError } from './schedule';

/**
 * Task 1.6(a): the guard that makes the optimized cache key honest.
 *
 * A cached optimized result is keyed on `SCHEDULER_CONTRACT_VERSION`, so a
 * change to Fast's semantics without a bump leaves every stale row matching its
 * key for ever. Nothing enforced that until this file: measured at `09e9ccd7`,
 * moving `ASSUMED_SLICE_WORKDAYS` from 2 to 3 with the version left at 7 gave
 * domain 356/19 and contracts 167/0, and every one of those 19 was a
 * hand-written date assertion — precisely the set a developer updates on
 * purpose when changing the constant. Update them and the suite is green again
 * with the version still 7, and nothing anywhere says "now bump it".
 *
 * The two assertions below close that in both directions. The bytes moving
 * without a bump fails the second; a bump whose bytes were not regenerated
 * fails the first.
 */

interface StoredCorpus {
  readonly contractVersion: number;
  readonly cases: Record<string, unknown>;
}

const STORED = JSON.parse(
  readFileSync(new URL('../fixtures/fast-golden-corpus.json', import.meta.url), 'utf8'),
) as StoredCorpus;

describe('the Fast golden corpus keys itself on the contract version', () => {
  it('was produced under the version this tree declares', () => {
    expect(STORED.contractVersion).toBe(SCHEDULER_CONTRACT_VERSION);
  });

  it('reproduces every stored schedule byte for byte', () => {
    expect(computeFastGoldenCorpus().cases).toEqual(STORED.cases);
  });

  it('stores exactly the cases this tree defines, so a new case cannot skip the file', () => {
    expect(Object.keys(STORED.cases).sort()).toEqual(
      FAST_GOLDEN_CASES.map((each) => each.name).sort(),
    );
  });
});

/**
 * The corpus is only a guard if it stored something. `Schedule` holds `Map`s and
 * `JSON.stringify` renders a `Map` as `{}`, so a serializer that forgot them
 * would check in four empty objects and pass against every possible engine —
 * the check-that-cannot-fail failure AGENTS.md R5 names. These read the values
 * the guard actually depends on rather than trusting the shape.
 */
describe('the stored bytes are the schedule, not an empty object', () => {
  interface PlacedProbe {
    readonly estimated: boolean;
    readonly earliestStart: number;
    readonly earliestFinish: number;
  }
  const unestimated = STORED.cases['unestimated-middle'] as {
    slices: [string, PlacedProbe][];
  };

  it('carries one entry per slice with its placement on it', () => {
    expect(unestimated.slices).toHaveLength(3);
    for (const [, placed] of unestimated.slices) {
      expect(typeof placed.earliestStart).toBe('number');
      expect(typeof placed.earliestFinish).toBe('number');
    }
  });

  /**
   * The case that can see `ASSUMED_SLICE_WORKDAYS` at all. `b` carries
   * `days: null`, so it reports `duration: 0` and `estimated: false` — nobody
   * has looked — while the pass still spends the assumption on it: it runs
   * 2 → 4, and `c` starts at 4 rather than at 2.
   *
   * WATCHED RED, both halves MEASURED at `112aa297` on h2puni. Move
   * `ASSUMED_SLICE_WORKDAYS` 2 → 3 and leave `SCHEDULER_CONTRACT_VERSION` at 7:
   * domain **360 pass / 20 fail**, where 19 are the pre-existing hand-written
   * date assertions and the twentieth is `reproduces every stored schedule byte
   * for byte` — the only failure in the suite that is about the *key*. Bump the
   * version to 8 without regenerating the fixture: **379 pass / 1 fail**, and
   * that one is `was produced under the version this tree declares`.
   *
   * The three numbers below do NOT fail in either red, and the first draft of
   * this comment claimed they did. They read `STORED`, which neither edit
   * touches. They are a guard on the fixture rather than on the engine: they
   * are what stops a regenerated corpus of four empty objects from satisfying
   * the byte comparison.
   */
  it('spends the assumed duration on the slice nobody estimated', () => {
    const [, b] = unestimated.slices[1];
    const [, c] = unestimated.slices[2];
    expect(b.estimated).toBe(false);
    expect(b.earliestStart).toBe(2);
    expect(b.earliestFinish).toBe(4);
    expect(c.earliestStart).toBe(4);
  });
});

/**
 * Task 1.6(c): the no-op proof, and it does not have the shape the plan asked
 * for. The plan says "with the seventh argument defaulted to an empty map,
 * every existing corpus case SHALL produce a byte-identical schedule" — the
 * re-key must not be able to hide a placement change smuggled in with it.
 *
 * Run 11 recorded that `schedule()` had six parameters and that the seventh
 * canonical argument, `deadlines`, had not reached its signature, so (c) could
 * not be run at all. A seventh parameter has since arrived, and it is
 * `pinnedStarts` (task 4.9's optimized materialiser), not `deadlines`.
 *
 * Measured, not assumed: an empty map is NOT a no-op for `pinnedStarts` and
 * cannot be made one. `schedule.ts:2303` reads `pinnedStarts === undefined` as
 * "this is Fast" and anything else as "a solver answered", then demands a start
 * for every node — so an empty map means "the solver returned no start for any
 * slice" and is refused with `ScheduleInvalidOptimizedStartError`. That refusal
 * is the design, not a gap: a partial answer is an answer to a different
 * question.
 *
 * So (c) is proven in the only form the code admits, in two halves. The first
 * is the no-op the plan wanted: the seventh parameter's arrival moved no corpus
 * byte, proven by passing it explicitly as `undefined`. The second is why the
 * plan's own wording cannot be taken literally: the empty map is loud, so the
 * corpus can never be re-keyed through the optimized path by accident.
 */
describe('the seventh parameter did not move a corpus byte', () => {
  const stored = STORED.cases;

  it('reproduces every stored schedule with pinnedStarts passed as undefined', () => {
    const cases: Record<string, unknown> = {};
    for (const each of FAST_GOLDEN_CASES) {
      cases[each.name] = serializeSchedule(
        schedule(
          each.rows,
          each.edges,
          each.slices,
          each.notBefore ?? new Map(),
          each.poolSizes ?? new Map(),
          each.reach ?? 'whole-item',
          undefined,
        ),
      );
    }
    expect(cases).toEqual(stored);
  });

  it('refuses an empty map on every case rather than treating it as Fast', () => {
    expect(FAST_GOLDEN_CASES.length).toBeGreaterThan(0);
    for (const each of FAST_GOLDEN_CASES) {
      expect(() =>
        schedule(
          each.rows,
          each.edges,
          each.slices,
          each.notBefore ?? new Map(),
          each.poolSizes ?? new Map(),
          each.reach ?? 'whole-item',
          new Map(),
        ),
      ).toThrow(ScheduleInvalidOptimizedStartError);
    }
  });
});
