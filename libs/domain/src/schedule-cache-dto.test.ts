import { describe, expect, it } from 'bun:test';

import type { PlannedRow } from './derive-numbers';
import { type PoolSizes, type Schedule, schedule, type Slice, sliceKey } from './schedule';
import {
  CACHE_DTO_VERSION,
  decodeSchedule,
  encodeSchedule,
  type StoredSchedule,
} from './schedule-cache-dto';

/**
 * The cache payload seam (tasks.md 4.12): what a stored plan keeps, and the four
 * ways a stored plan is refused rather than served.
 *
 * Every case here runs against a plan the **real engine** produced, not against
 * a literal: the defect this seam exists for is that `JSON.stringify` renders a
 * `Map` as `{}`, and a hand-written fixture would be a second implementation of
 * the shape under test — it would agree with whatever the encoder happened to
 * emit. `schedule()` is the oracle.
 */

const DEV = 'step-dev';
const PLATFORM = 'team-platform';

let position = 0;
const item = (id: string): PlannedRow => ({
  id,
  parentId: null,
  position: (position += 10),
  frozenNumber: null,
  priority: null,
});

const slice = (workItemId: string, days: number, extra: Partial<Slice> = {}): Slice => ({
  workItemId,
  stepId: DEV,
  days,
  personId: null,
  width: 1,
  poolIds: [PLATFORM],
  ...extra,
});

const pool = (size: number): PoolSizes => new Map([[PLATFORM, size]]);

/**
 * A plan with a real capacity wait in it.
 *
 * A pool of one and three two-day blocks, so two of the three are held by the
 * pool: `waitingForCapacity`, `capacityPredecessorIds`, `capacityTeamId` and
 * `resourcePredecessorId` are all non-empty, and `eventsVisited` counts a
 * levelling pass that actually ran. A round trip over a plan where those were
 * all zero and null would prove nothing about them.
 */
function realPlan(): Schedule {
  const rows = [item('a'), item('b'), item('c')];
  const slices = [slice('a', 2), slice('b', 2), slice('c', 2)];
  return schedule(rows, [], slices, new Map(), pool(1));
}

/** The trip a cached row actually takes: encode, through SQLite's TEXT, decode. */
function throughJson(plan: Schedule): Schedule {
  return decodeSchedule(JSON.parse(JSON.stringify(encodeSchedule(plan))));
}

/** A stored payload, mutable, for the negatives below. */
function stored(plan: Schedule): StoredSchedule {
  return JSON.parse(JSON.stringify(encodeSchedule(plan))) as StoredSchedule;
}

describe('what a stored schedule keeps', () => {
  it('reloads a real plan whole, maps and projections included', () => {
    const plan = realPlan();

    // The fixture is load-bearing: a plan with nothing waiting would let an
    // encoder that dropped the three counters pass.
    expect(plan.slices.size).toBe(3);
    expect(plan.workItems.size).toBe(3);
    expect(plan.waitingForCapacity).toBeGreaterThan(0);
    expect(plan.eventsVisited).toBeGreaterThan(0);
    const held = [...plan.slices.values()].filter((one) => one.boundBy === 'capacity');
    expect(held.length).toBeGreaterThan(0);
    expect(held[0]?.capacityPredecessorIds.length).toBeGreaterThan(0);
    expect(held[0]?.capacityTeamId).toBe(PLATFORM);

    expect(throughJson(plan)).toEqual(plan);
  });

  it('is why the seam exists: the plan itself stringifies to empty maps', () => {
    const plan = realPlan();

    // Not a straw man — this is the shape an implementation storing the
    // `Schedule` directly would write, and it type-checks everywhere.
    const naive = JSON.parse(JSON.stringify(plan)) as { slices: unknown; workItems: unknown };
    expect(naive.slices).toEqual({});
    expect(naive.workItems).toEqual({});

    const dto = encodeSchedule(plan);
    expect(dto.slices).toHaveLength(3);
    expect(dto.workItems).toHaveLength(3);
    expect(dto.dtoVersion).toBe(CACHE_DTO_VERSION);
  });

  it('emits one encoding per plan, whatever order the maps were built in', () => {
    const plan = realPlan();

    // The same plan with both maps rebuilt in reverse key order. A `Map`
    // iterates in insertion order, so this is a real second insertion order for
    // one schedule — which is the thing that must not reach the row, because a
    // row whose bytes depend on it cannot be compared between two runs.
    const reversed: Schedule = {
      ...plan,
      slices: new Map([...plan.slices].reverse()),
      workItems: new Map([...plan.workItems].reverse()),
    };
    expect([...reversed.slices.keys()]).not.toEqual([...plan.slices.keys()]);

    expect(JSON.stringify(encodeSchedule(reversed))).toBe(JSON.stringify(encodeSchedule(plan)));
    expect(encodeSchedule(plan).slices.map((entry) => entry.key)).toEqual(
      [...plan.slices.keys()].sort(),
    );
  });
});

describe('what a stored schedule refuses', () => {
  it('refuses a dtoVersion this release does not read, naming it', () => {
    const payload = { ...stored(realPlan()), dtoVersion: CACHE_DTO_VERSION + 1 };

    expect(() => decodeSchedule(payload)).toThrow(
      `stored schedule: unknown dtoVersion ${CACHE_DTO_VERSION + 1}; this release reads ${CACHE_DTO_VERSION}`,
    );
  });

  it('refuses one key carried twice, rather than taking the last of them', () => {
    const payload = stored(realPlan());
    const first = payload.slices[0];
    if (first === undefined) throw new Error('broken fixture: no slices');
    payload.slices.push({ ...first });

    expect(() => decodeSchedule(payload)).toThrow(
      `stored schedule: slices carries the key ${JSON.stringify(first.key)} twice`,
    );
  });

  it('refuses a key that disagrees with the entry beside it', () => {
    const payload = stored(realPlan());
    const first = payload.slices[0];
    if (first === undefined) throw new Error('broken fixture: no slices');
    // The entry still describes `a`; the key now names a slice that is not in
    // the plan at all. Deliberately not `b`'s key — that collides with `b`'s own
    // entry and the duplicate guard fires first, which is a different case and
    // was watched passing for the wrong reason before this comment existed.
    first.key = sliceKey('zzz', DEV);

    expect(() => decodeSchedule(payload)).toThrow(
      `stored schedule: slices carries the key ${JSON.stringify(sliceKey('zzz', DEV))} against an entry whose own key is ${JSON.stringify(sliceKey('a', DEV))}`,
    );
  });

  it('refuses a slice whose work item has no projection', () => {
    const payload = stored(realPlan());
    payload.workItems = payload.workItems.filter((entry) => entry.key !== 'a');

    expect(() => decodeSchedule(payload)).toThrow(
      `stored schedule: slices[${JSON.stringify(sliceKey('a', DEV))}] has no workItems projection for "a"`,
    );
  });
});
