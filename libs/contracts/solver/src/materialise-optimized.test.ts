import {
  type DependencyEdge,
  type PlannedRow,
  schedule,
  ScheduleInvalidOptimizedStartError,
  type ScheduledSlice,
  type Slice,
  sliceKey,
  SOLVER_QUANTUM,
} from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { materialiseOptimized } from './materialise-optimized';
import { quantisedFastBaseline } from './quantised-baseline';
import type { SolverOffsetMap } from './wire-types';

const row = (id: string, position: number, parentId: string | null = null): PlannedRow => ({
  id,
  parentId,
  position,
  frozenNumber: null,
  priority: null,
});

const sliceOf = (
  workItemId: string,
  stepId: string | null,
  days: number | null,
  extra: Partial<Slice> = {},
): Slice => ({ workItemId, stepId, days, personId: null, width: 1, poolIds: [], ...extra });

const noEdges: readonly DependencyEdge[] = [];

/**
 * Three serial whole-day slices, which is the fixture the round trip needs.
 *
 * `days: 1, width: 1` is exactly one workday and exactly {@link SOLVER_QUANTUM}
 * units, so the quantum rounds nothing and the quantised baseline's offsets
 * divide back to Fast's own starts as exact doubles. That is what makes the
 * round trip below a statement about the WIRING rather than about the quantum:
 * on this fixture any difference between the materialised schedule and Fast's
 * is the dequantisation's, because the quantisation had nothing to lose.
 *
 * The `fiveWide` fixture `quantised-baseline.test.ts` uses is the opposite
 * fixture on purpose and belongs to 4.11b, not here — 0.2 workdays rounds up to
 * 10 units, so its baseline offsets divide back to starts strictly LATER than
 * Fast's and the materialised schedule is legitimately a different one.
 */
const wholeDays = {
  rows: [row('A', 0)],
  edges: noEdges,
  slices: [sliceOf('A', 'one', 1), sliceOf('A', 'two', 1), sliceOf('A', 'three', 1)] as const,
};

const key = {
  one: sliceKey('A', 'one'),
  two: sliceKey('A', 'two'),
  three: sliceKey('A', 'three'),
  four: sliceKey('A', 'four'),
};

const materialise = (offsets: SolverOffsetMap) =>
  materialiseOptimized(
    wholeDays.rows,
    wholeDays.edges,
    wholeDays.slices,
    new Map(),
    new Map(),
    'whole-item',
    offsets,
  );

/** Keys read back with the NUL written as an escape, so a failure prints something. */
const readableStarts = (slices: ReadonlyMap<string, ScheduledSlice>): Record<string, number> =>
  Object.fromEntries(
    [...slices].map(([at, slice]) => [at.replace('\u0000', '/'), slice.earliestStart]),
  );

describe('materialiseOptimized', () => {
  it('divides the offsets by the quantum and hands them to schedule() as pinned starts', () => {
    const placed = materialise({
      [key.one]: 0,
      [key.two]: SOLVER_QUANTUM * 3,
      [key.three]: SOLVER_QUANTUM * 4,
    });

    // Half the assertion is the arithmetic and half is that it reached the
    // placement at all: 144 units is day 3, not day 144 and not unit 144.
    expect(readableStarts(placed.slices)).toEqual({ 'A/one': 0, 'A/two': 3, 'A/three': 4 });
  });

  it('round-trips the quantised baseline back onto Fast on a fixture the quantum rounds nothing on', () => {
    const { rows, edges, slices } = wholeDays;
    const offsets = quantisedFastBaseline(rows, edges, slices, new Map(), new Map(), 'whole-item');
    const fast = schedule(rows, edges, slices, new Map(), new Map(), 'whole-item');
    const placed = materialise(offsets);

    expect(readableStarts(placed.slices)).toEqual(readableStarts(fast.slices));
    // Not just the dates: a pin that landed a hair above its floor would keep
    // the same start and change the WORD, so the floors are the sharper half of
    // the round trip.
    expect([...placed.slices.values()].map((slice) => slice.boundBy)).toEqual(
      [...fast.slices.values()].map((slice) => slice.boundBy),
    );
    expect(placed.waitingForPerson).toBe(fast.waitingForPerson);
    expect(placed.waitingForCapacity).toBe(fast.waitingForCapacity);
  });

  it('refuses an offset that is not a whole unit', () => {
    expect(() =>
      materialise({ [key.one]: 0, [key.two]: 24.5, [key.three]: SOLVER_QUANTUM * 4 }),
    ).toThrow(ScheduleInvalidOptimizedStartError);
  });

  it('refuses a negative offset', () => {
    expect(() =>
      materialise({
        [key.one]: -SOLVER_QUANTUM,
        [key.two]: SOLVER_QUANTUM * 3,
        [key.three]: SOLVER_QUANTUM * 4,
      }),
    ).toThrow(ScheduleInvalidOptimizedStartError);
  });

  it('refuses an offset key the plan has no slice for', () => {
    expect(() =>
      materialise({
        [key.one]: 0,
        [key.two]: SOLVER_QUANTUM * 3,
        [key.three]: SOLVER_QUANTUM * 4,
        [key.four]: SOLVER_QUANTUM * 5,
      }),
    ).toThrow(/A\/four/);
  });

  it('leaves a missing key to schedule()’s own refusal rather than restating it', () => {
    expect(() => materialise({ [key.one]: 0, [key.two]: SOLVER_QUANTUM * 3 })).toThrow(
      /no start was returned for it/,
    );
  });
});
