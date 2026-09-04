import { describe, expect, it } from 'bun:test';

import { FAST_GOLDEN_CASES } from './fast-golden-corpus';
import {
  type PoolSizes,
  schedule,
  type Schedule,
  ScheduleInvalidOptimizedStartError,
  sliceKey,
  type Slice,
} from './schedule';

/**
 * Task 4.9's behaviour-preservation proof, and the three refusals around it.
 *
 * `schedule(input, pinnedStarts)` is the optimized materialiser: the same pass,
 * with each slice's start overridden and every other rule — the floor, the
 * tiling, the pool's explanation, the resource referent, the backward pass —
 * running unchanged and once. 4.9 asks for the split to be proved
 * behaviour-preserving **before** anything optimized is built on it, and states
 * the proof precisely: `annotate(input, chooseStarts(input))` must equal
 * `placeSlices(input)` over the Fast golden corpus.
 *
 * It is not a tautology, and that is the point of running it rather than
 * arguing it. Fast drains its eligible set in **priority** order and the replay
 * drains it in ascending `(start, canonical slice order)`, so the two passes
 * reach each slice with different ledgers behind them: a different set of pool
 * reservations is present when the joint window is searched, and a different
 * set of people are busy. The claim under test is that pinning Fast's own
 * answers makes those differences invisible — every slice lands on the start it
 * already had, so every floor resolves to the same word and every ledger write
 * repeats.
 */

/**
 * `chooseStarts`: the half of the split that decides, read off a finished schedule.
 *
 * `earliestStart` and not `start`, because a {@link ScheduledSlice} has no
 * `start`: the forward pass's answer is the slice's early start and the backward
 * pass adds a late one beside it. Written as `start` first, and every case here
 * threw `no start was returned for it` — the map was eight keys onto `undefined`.
 */
const startsOf = (produced: Schedule): Map<string, number> =>
  new Map([...produced.slices].map(([key, each]): [string, number] => [key, each.earliestStart]));

const leafRow = (id: string, position: number) => ({
  id,
  parentId: null,
  position,
  frozenNumber: null,
  priority: null,
});

const work = (workItemId: string, days: number, extra: Partial<Slice> = {}): Slice => ({
  workItemId,
  stepId: null,
  days,
  personId: null,
  width: 1,
  poolIds: [],
  ...extra,
});

describe('the optimized materialiser is Fast with its starts pinned', () => {
  for (const each of FAST_GOLDEN_CASES) {
    it(`replays ${each.name} into the schedule Fast produced`, () => {
      const notBefore = each.notBefore ?? new Map<string, number>();
      const poolSizes: PoolSizes = each.poolSizes ?? new Map();
      const reach = each.reach ?? 'whole-item';
      const fast = schedule(each.rows, each.edges, each.slices, notBefore, poolSizes, reach);

      const replayed = schedule(
        each.rows,
        each.edges,
        each.slices,
        notBefore,
        poolSizes,
        reach,
        startsOf(fast),
      );

      // The whole answer, not the dates: `boundBy`, the resource referent, the
      // capacity set, the team, both wait counters and every work-item
      // projection are what a transcription gets wrong, and comparing starts
      // alone would call four of the five extractions proved when none of them
      // had been read.
      expect(replayed.slices).toEqual(fast.slices);
      expect(replayed.workItems).toEqual(fast.workItems);
      expect(replayed.waitingForPerson).toBe(fast.waitingForPerson);
      expect(replayed.waitingForCapacity).toBe(fast.waitingForCapacity);
    });
  }
});

describe('a pinned start the plan refuses', () => {
  const rows = [leafRow('a', 10), leafRow('b', 20)];
  const chain = [{ predecessorId: 'a', successorId: 'b' }];
  const slices = [work('a', 2), work('b', 2)];

  it('throws when a start is earlier than the floor its predecessor sets', () => {
    const fast = schedule(rows, chain, slices);
    const pinned = startsOf(fast);
    // `b` follows `a`, which takes two days, so day 1 is inside its
    // predecessor. Not a worse schedule — not a schedule.
    pinned.set(sliceKey('b', null), 1);

    expect(() => schedule(rows, chain, slices, new Map(), new Map(), 'whole-item', pinned)).toThrow(
      ScheduleInvalidOptimizedStartError,
    );
  });

  it('throws when a start has no room in the pool it named', () => {
    const pooled = [work('a', 2, { poolIds: ['team'] }), work('b', 2, { poolIds: ['team'] })];
    const sizes: PoolSizes = new Map([['team', 1]]);
    // `a` idled to day 3 is legal — the pool is free there and nothing else
    // wants it — and it puts `b` at day 4 **inside** `a`, where the pool of one
    // has no second slot. The earlier branch cannot catch this: 4 is strictly
    // later than every floor `b` has, because `b` depends on nothing and the
    // pool is free at 0.
    const pinned = new Map([
      [sliceKey('a', null), 3],
      [sliceKey('b', null), 4],
    ]);

    expect(() => schedule(rows, [], pooled, new Map(), sizes, 'whole-item', pinned)).toThrow(
      ScheduleInvalidOptimizedStartError,
    );
  });

  it('throws when the optimizer returned no start for a slice the plan has', () => {
    const pinned = new Map([[sliceKey('a', null), 0]]);

    expect(() => schedule(rows, chain, slices, new Map(), new Map(), 'whole-item', pinned)).toThrow(
      ScheduleInvalidOptimizedStartError,
    );
  });
});

describe("a start no floor of the plan explains is the optimizer's", () => {
  it("labels a deliberately idled slice 'optimizer' and names no resource for it", () => {
    const rows = [leafRow('a', 10)];
    const slices = [work('a', 2, { poolIds: ['team'] })];
    const sizes: PoolSizes = new Map([['team', 1]]);
    const pinned = new Map([[sliceKey('a', null), 5]]);

    const produced = schedule(rows, [], slices, new Map(), sizes, 'whole-item', pinned);
    const only = produced.slices.get(sliceKey('a', null));

    expect(only?.earliestStart).toBe(5);
    expect(only?.boundBy).toBe('optimizer');
    // The render invariant, additively: `'optimizer'` is not a resource, so it
    // names none — the same rule `projectStart` already takes. A pool bound at
    // its own pinned instant would name a team here, and `annotateCapacity`
    // throws rather than let that reach a bar.
    expect(only?.resourcePredecessorId).toBeNull();
    expect(only?.capacityPredecessorIds).toEqual([]);
    expect(only?.capacityTeamId).toBeNull();
    expect(produced.waitingForPerson).toBe(0);
    expect(produced.waitingForCapacity).toBe(0);
  });
});
