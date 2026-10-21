import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

import type { PlannedRow } from './derive-numbers';
import { FAST_GOLDEN_CASES, serializeSchedule } from './fast-golden-corpus';
import { chargedDemandsOf } from './resource';
import type { PoolSizes, ResourceDemand, Schedule, ScheduledSlice, Slice } from './schedule';
import { schedule, ScheduleInvalidOptimizedStartError, sliceKey } from './schedule';
import type { TypedDependency } from './typed-dependency';

/**
 * Fast levels resource demands as pools (`wbs-resources` R2 and R5, Claire's
 * design note §4): every block of a demanding leaf holds its units beside its
 * team slots, acquired together at one instant through the joint window.
 *
 * Beside `schedule-joint-capacity.test.ts`, whose claims about team pools all
 * stay true: a resource pool is the same ledger rule at the demand's units.
 */

const DEV = 'step-dev';
const STAGING = 'staging';
const RAM = 'ram';
const DISK = 'disk';
const TEAM = 'team-alpha';

let position = 0;
const item = (id: string, priority: number | null = null): PlannedRow => ({
  id,
  parentId: null,
  position: (position += 10),
  frozenNumber: null,
  priority,
});

const slice = (
  workItemId: string,
  days: number,
  demands: readonly ResourceDemand[] = [],
  extra: Partial<Pick<Slice, 'personId' | 'width' | 'poolIds'>> = {},
): Slice => ({
  workItemId,
  stepId: DEV,
  days,
  personId: null,
  width: 1,
  poolIds: [],
  ...(demands.length === 0 ? {} : { demands }),
  ...extra,
});

const planned = (found: Schedule, workItemId: string): ScheduledSlice => {
  const one = found.slices.get(sliceKey(workItemId, DEV));
  if (one === undefined) throw new Error(`no slice for ${workItemId}`);
  return one;
};

const run = (
  rows: readonly PlannedRow[],
  slices: readonly Slice[],
  capacities: PoolSizes,
  options: {
    poolSizes?: PoolSizes;
    notBefore?: ReadonlyMap<string, number>;
    typed?: readonly TypedDependency[];
    pinned?: ReadonlyMap<string, number>;
  } = {},
): Schedule =>
  schedule(
    rows,
    [],
    slices,
    options.notBefore ?? new Map(),
    options.poolSizes ?? new Map(),
    'whole-item',
    new Map(),
    options.typed ?? [],
    options.pinned,
    new Map(),
    capacities,
  );

const overlaps = (left: ScheduledSlice, right: ScheduledSlice): boolean =>
  left.earliestStart < right.earliestFinish && right.earliestStart < left.earliestFinish;

describe('two leaves want the one staging environment', () => {
  const rows = [item('a'), item('b')];
  const slices = [
    slice('a', 3, [{ resourceId: STAGING, units: 1 }]),
    slice('b', 3, [{ resourceId: STAGING, units: 1 }]),
  ];

  it('serialises them, and the second names staging and its units', () => {
    const found = run(rows, slices, new Map([[STAGING, 1]]));
    const [a, b] = [planned(found, 'a'), planned(found, 'b')];
    expect(overlaps(a, b)).toBe(false);
    expect([a.earliestStart, b.earliestStart]).toEqual([0, 3]);
    expect(b).toMatchObject({
      boundBy: 'capacity',
      capacityTeamId: null,
      capacityResource: { resourceId: STAGING, units: 1 },
      capacityPredecessorIds: [sliceKey('a', DEV)],
      resourcePredecessorId: sliceKey('a', DEV),
    });
    // Absent, not null, on the slice no pool held up.
    expect('capacityResource' in a).toBe(false);
    expect(found.waitingForCapacity).toBe(1);
  });

  it('runs them together when the capacity is two', () => {
    const found = run(rows, slices, new Map([[STAGING, 2]]));
    expect([planned(found, 'a').earliestStart, planned(found, 'b').earliestStart]).toEqual([0, 0]);
  });

  it('serialises them on the weighted path too, naming staging', () => {
    // A start-to-start dependency routes the plan through the weighted
    // placement and its chronological replay.
    const typed: TypedDependency[] = [
      {
        id: 'ss',
        predecessor: { scope: 'whole', workItemId: 'a' },
        successor: { scope: 'whole', workItemId: 'b' },
        type: 'SS',
      },
    ];
    const found = run(rows, slices, new Map([[STAGING, 1]]), { typed });
    const [a, b] = [planned(found, 'a'), planned(found, 'b')];
    expect(overlaps(a, b)).toBe(false);
    expect(b).toMatchObject({
      boundBy: 'capacity',
      capacityTeamId: null,
      capacityResource: { resourceId: STAGING, units: 1 },
    });
  });

  it('refuses an optimized answer that runs both at once', () => {
    // The materialiser's own refusal: a pinned start inside a live resource
    // reservation is a solver answer the plan cannot hold.
    const pinned = new Map([
      [sliceKey('a', DEV), 0],
      [sliceKey('b', DEV), 0],
    ]);
    expect(() => run(rows, slices, new Map([[STAGING, 1]]), { pinned })).toThrow(
      'is before its capacity floor at 3',
    );
    // The weighted replay names the resource it overlaps.
    const typed: TypedDependency[] = [
      {
        id: 'ss',
        predecessor: { scope: 'whole', workItemId: 'a' },
        successor: { scope: 'whole', workItemId: 'b' },
        type: 'SS',
      },
    ];
    expect(() => run(rows, slices, new Map([[STAGING, 1]]), { pinned, typed })).toThrow(
      'overlaps resource staging',
    );
    expect(() => run(rows, slices, new Map([[STAGING, 1]]), { pinned, typed })).toThrow(
      ScheduleInvalidOptimizedStartError,
    );
  });
});

describe('a divisible resource', () => {
  it('admits two of three 16 GB leaves into 32 GB, and the third waits', () => {
    const rows = [item('a'), item('b'), item('c')];
    const sixteen = [{ resourceId: RAM, units: 16 }];
    const found = run(
      rows,
      [slice('a', 2, sixteen), slice('b', 2, sixteen), slice('c', 2, sixteen)],
      new Map([[RAM, 32]]),
    );
    const starts = ['a', 'b', 'c'].map((id) => planned(found, id).earliestStart);
    expect(starts).toEqual([0, 0, 2]);
    expect(planned(found, 'c').capacityResource).toEqual({ resourceId: RAM, units: 16 });
    expect(planned(found, 'c').capacityPredecessorIds.sort()).toEqual(
      [sliceKey('a', DEV), sliceKey('b', DEV)].sort(),
    );
  });
});

describe('a demand vector is acquired whole, at one instant', () => {
  it('waits for both resources rather than holding one while the other is busy', () => {
    // x holds the disk over [0, 4); y holds the ram over [2, 6). z wants both:
    // its disk is free from 4 and its ram from 6, so it starts at 6 holding both.
    const rows = [item('x', 1), item('y', 2), item('z', 3)];
    const found = run(
      rows,
      [
        slice('x', 4, [{ resourceId: DISK, units: 1 }]),
        slice('y', 4, [{ resourceId: RAM, units: 1 }]),
        slice('z', 2, [
          { resourceId: DISK, units: 1 },
          { resourceId: RAM, units: 1 },
        ]),
      ],
      new Map([
        [DISK, 1],
        [RAM, 1],
      ]),
      { notBefore: new Map([['y', 2]]) },
    );
    const z = planned(found, 'z');
    expect(z.earliestStart).toBe(6);
    expect(overlaps(z, planned(found, 'x'))).toBe(false);
    expect(overlaps(z, planned(found, 'y'))).toBe(false);
    expect(z.capacityResource).toEqual({ resourceId: RAM, units: 1 });
  });

  it('holds no team slot while it waits for a resource', () => {
    // b needs the team's only slot and staging; staging is held by a until 3.
    // b is placed before c, at 3, holding both. Had it taken the team slot at
    // 0 and waited for staging, c (team only) could not run at 0.
    const rows = [item('a', 1), item('b', 2), item('c', 3)];
    const found = run(
      rows,
      [
        slice('a', 3, [{ resourceId: STAGING, units: 1 }]),
        slice('b', 3, [{ resourceId: STAGING, units: 1 }], { poolIds: [TEAM] }),
        slice('c', 3, [], { poolIds: [TEAM] }),
      ],
      new Map([[STAGING, 1]]),
      { poolSizes: new Map([[TEAM, 1]]) },
    );
    expect(planned(found, 'b').earliestStart).toBe(3);
    expect(planned(found, 'c').earliestStart).toBe(0);
    expect(planned(found, 'b').capacityResource).toEqual({ resourceId: STAGING, units: 1 });
  });
});

describe('what a caller hands the engine', () => {
  it('leaves a demand on an unstated capacity unconstrained', () => {
    const charged = chargedDemandsOf(
      [
        { workItemId: 'a', resourceId: STAGING, units: 1 },
        { workItemId: 'a', resourceId: RAM, units: 4 },
      ],
      new Map([[RAM, 32]]),
    );
    expect(charged).toEqual(new Map([['a', [{ resourceId: RAM, units: 4 }]]]));
  });

  it('clamps a demand to its capacity, and a stated 0 charges nothing', () => {
    const charged = chargedDemandsOf(
      [
        { workItemId: 'a', resourceId: RAM, units: 48 },
        { workItemId: 'a', resourceId: DISK, units: 2 },
        { workItemId: 'b', resourceId: STAGING, units: 1 },
      ],
      new Map([
        [RAM, 32],
        [DISK, 0],
        [STAGING, 1],
      ]),
    );
    expect(charged).toEqual(
      new Map([
        ['a', [{ resourceId: RAM, units: 32 }]],
        ['b', [{ resourceId: STAGING, units: 1 }]],
      ]),
    );
  });

  it('sorts each vector by resource id', () => {
    const charged = chargedDemandsOf(
      [
        { workItemId: 'a', resourceId: STAGING, units: 1 },
        { workItemId: 'a', resourceId: DISK, units: 1 },
      ],
      new Map([
        [STAGING, 1],
        [DISK, 1],
      ]),
    );
    expect(charged.get('a')?.map(({ resourceId }) => resourceId)).toEqual([DISK, STAGING]);
  });

  it('refuses a demand on a resource it was handed no capacity for', () => {
    expect(() =>
      run([item('a')], [slice('a', 1, [{ resourceId: STAGING, units: 1 }])], new Map()),
    ).toThrow('no capacity for resource staging');
  });

  it('refuses a demand below one unit, a resource named twice and an unsorted vector', () => {
    const malformed: ResourceDemand[][] = [
      [{ resourceId: STAGING, units: 0 }],
      [
        { resourceId: STAGING, units: 1 },
        { resourceId: STAGING, units: 1 },
      ],
      [
        { resourceId: STAGING, units: 1 },
        { resourceId: DISK, units: 1 },
      ],
    ];
    for (const demands of malformed) {
      expect(() =>
        run(
          [item('a')],
          [slice('a', 1, demands)],
          new Map([
            [STAGING, 1],
            [DISK, 1],
          ]),
        ),
      ).toThrow(/a demand is whole units from 1|each resource once, in id order/);
    }
  });
});

describe('no resource stated, no change', () => {
  const STORED = JSON.parse(
    readFileSync(new URL('../fixtures/fast-golden-corpus.json', import.meta.url), 'utf8'),
  ) as { cases: Record<string, unknown> };

  it('keeps every golden corpus case byte for byte, no resource stated', () => {
    for (const each of FAST_GOLDEN_CASES) {
      const replayed = schedule(
        each.rows,
        each.edges,
        each.slices,
        each.notBefore ?? new Map(),
        each.poolSizes ?? new Map(),
        each.reach ?? 'whole-item',
        new Map(),
        [],
        undefined,
        new Map(),
        new Map(),
      );
      expect({ name: each.name, json: JSON.stringify(serializeSchedule(replayed)) }).toEqual({
        name: each.name,
        json: JSON.stringify(STORED.cases[each.name]),
      });
    }
  });

  it('places every corpus slice where it was when a capacity is stated that nothing demands', () => {
    for (const each of FAST_GOLDEN_CASES) {
      const plan = schedule(
        each.rows,
        each.edges,
        each.slices,
        each.notBefore ?? new Map(),
        each.poolSizes ?? new Map(),
        each.reach ?? 'whole-item',
        new Map(),
        [],
        undefined,
        new Map(),
        new Map([['remembered', 1]]),
      );
      expect(JSON.stringify(serializeSchedule(plan))).toBe(JSON.stringify(STORED.cases[each.name]));
    }
  });
});
