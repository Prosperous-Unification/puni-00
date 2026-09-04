import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

import { SCHEDULER_CONTRACT_VERSION } from './contract-version';
import { computeFastGoldenCorpus, FAST_GOLDEN_CASES } from './fast-golden-corpus';

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
