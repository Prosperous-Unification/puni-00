import { describe, expect, it } from 'bun:test';

import type { PlannedRow } from './derive-numbers';
import { relaxWeightedStarts, schedule, type Slice, sliceKey } from './schedule';
import { SOLVER_QUANTUM } from './solver-quantum';
import type { RelationshipType, TypedDependency } from './typed-dependency';

const row = (id: string, position: number): PlannedRow => ({
  id,
  parentId: null,
  position,
  frozenNumber: null,
  priority: null,
});
const work = (workItemId: string, days: number | null, personId: string | null = null): Slice => ({
  workItemId,
  stepId: null,
  days,
  personId,
  width: 1,
  poolIds: [],
});
const link = (predecessor: string, successor: string, type: RelationshipType): TypedDependency => ({
  id: `${predecessor}-${successor}`,
  predecessor: { scope: 'whole', workItemId: predecessor },
  successor: { scope: 'whole', workItemId: successor },
  type,
});
const part = (plan: ReturnType<typeof schedule>, id: string) => {
  const found = plan.slices.get(sliceKey(id, null));
  if (found === undefined) throw new Error(`no slice for ${id}`);
  return found;
};

describe('weighted Fast relationships', () => {
  it('places a longer FF successor earlier, in a person gap before a later reservation', () => {
    const rows = [row('A', 10), row('B', 20), row('C', 30)];
    const slices = [work('A', 2), work('B', 6, 'kat'), work('C', 1, 'kat')];
    const floor = new Map([
      ['A', 4],
      ['C', 10],
    ]);
    const deadlines = new Map([['C', 10]]);
    const typed = [link('A', 'B', 'FF')];
    const fast = schedule(rows, [], slices, floor, new Map(), 'whole-item', deadlines, typed);
    expect([
      part(fast, 'A').earliestStart,
      part(fast, 'B').earliestStart,
      part(fast, 'C').earliestStart,
    ]).toEqual([4, 0, 10]);
    const pinned = new Map([...fast.slices].map(([key, slice]) => [key, slice.earliestStart]));
    const replay = schedule(
      rows,
      [],
      slices,
      floor,
      new Map(),
      'whole-item',
      deadlines,
      typed,
      pinned,
    );
    expect(replay).toEqual(fast);
  });

  it('uses SS as a start lower bound', () => {
    const plan = schedule(
      [row('A', 10), row('B', 20)],
      [],
      [work('A', 2), work('B', 1)],
      new Map([['A', 3]]),
      new Map(),
      'whole-item',
      new Map(),
      [link('A', 'B', 'SS')],
    );
    expect(part(plan, 'B').earliestStart).toBe(3);
  });

  it('keeps a negative FF weight in latest dates and critical path', () => {
    const plan = schedule(
      [row('A', 10), row('B', 20)],
      [],
      [work('A', 2), work('B', 6)],
      new Map([['A', 4]]),
      new Map(),
      'whole-item',
      new Map(),
      [link('A', 'B', 'FF')],
    );
    expect(part(plan, 'B')).toMatchObject({
      earliestStart: 0,
      latestStart: 0,
      float: 0,
      critical: true,
    });
    expect(part(plan, 'A')).toMatchObject({
      earliestStart: 4,
      latestStart: 4,
      float: 0,
      critical: true,
    });
  });

  it('keeps fractional FF finish and zero float across the weighted boundary', () => {
    const plan = schedule(
      [row('A', 10), row('B', 20)],
      [],
      [work('A', 0.021), work('B', 0.03)],
      new Map([['A', 0.009]]),
      new Map(),
      'whole-item',
      new Map(),
      [link('A', 'B', 'FF')],
    );
    expect(part(plan, 'B').earliestStart).toBeCloseTo(0, 12);
    expect(part(plan, 'A').earliestFinish).toBeCloseTo(part(plan, 'B').earliestFinish, 12);
    expect(part(plan, 'A').float).toBe(0);
    expect(part(plan, 'B').float).toBe(0);
  });

  it('reconciles an FF successor against the materialized predecessor finish', () => {
    const first = { ...work('A', 0.27773747248414493), stepId: 'dev' };
    const last = { ...work('A', 0.007322059148536747), stepId: 'qa' };
    const successor = work('B', 308.9769973128535);
    const plan = schedule(
      [row('A', 10), row('B', 20)],
      [],
      [first, last, successor],
      new Map([['A', 32024810461.28741]]),
      new Map(),
      'whole-item',
      new Map(),
      [link('A', 'B', 'FF')],
    );
    const finish = plan.slices.get(sliceKey('A', 'qa'))?.earliestFinish;
    if (finish === undefined) throw new Error('A.qa missing');
    expect(part(plan, 'B').earliestFinish).toBeGreaterThanOrEqual(finish);
    expect(part(plan, 'B').boundBy).toBe('predecessor');
    const pins = new Map([...plan.slices].map(([key, slice]) => [key, slice.earliestStart]));
    expect(
      schedule(
        [row('A', 10), row('B', 20)],
        [],
        [first, last, successor],
        new Map([['A', 32024810461.28741]]),
        new Map(),
        'whole-item',
        new Map(),
        [link('A', 'B', 'FF')],
        pins,
      ),
    ).toEqual(plan);
    pins.set(sliceKey('B', null), 32024810152.59547);
    expect(() =>
      schedule(
        [row('A', 10), row('B', 20)],
        [],
        [first, last, successor],
        new Map([['A', 32024810461.28741]]),
        new Map(),
        'whole-item',
        new Map(),
        [link('A', 'B', 'FF')],
        pins,
      ),
    ).toThrow('violates FF materialized boundary');
  });

  it('replays a fractional FF pin when materialized finishes meet', () => {
    const rows = [row('A', 10), row('B', 20)];
    const slices = [
      { ...work('A', 1 / 3), stepId: 'first' },
      { ...work('A', 1 / 3), stepId: 'last' },
      work('B', 1),
    ];
    const floors = new Map([['A', 2]]);
    const typed = [link('A', 'B', 'FF')];
    const pins = new Map([
      [sliceKey('A', 'first'), 2],
      [sliceKey('A', 'last'), 2 + 1 / 3],
      [sliceKey('B', null), 1.6666666666666665],
    ]);
    const replay = schedule(
      rows,
      [],
      slices,
      floors,
      new Map(),
      'whole-item',
      new Map(),
      typed,
      pins,
    );
    expect(replay.slices.get(sliceKey('A', 'last'))?.earliestFinish).toBe(2.6666666666666665);
    expect(part(replay, 'B').earliestFinish).toBe(2.6666666666666665);
  });

  it.each([NaN, Infinity, -Infinity])('rejects a non-finite weighted pin %p', (pin) => {
    expect(() =>
      schedule(
        [row('A', 10), row('B', 20)],
        [],
        [work('A', 1), work('B', 1)],
        new Map(),
        new Map(),
        'whole-item',
        new Map(),
        [link('A', 'B', 'SS')],
        new Map([
          [sliceKey('A', null), 0],
          [sliceKey('B', null), pin],
        ]),
      ),
    ).toThrow('violates a weighted floor or has a non-finite start');
  });

  it('rejects a weighted pin below an explicit floor', () => {
    expect(() =>
      schedule(
        [row('A', 10), row('B', 20)],
        [],
        [work('A', 1), work('B', 1)],
        new Map([['B', 2]]),
        new Map(),
        'whole-item',
        new Map(),
        [link('A', 'B', 'SS')],
        new Map([
          [sliceKey('A', null), 0],
          [sliceKey('B', null), 1],
        ]),
      ),
    ).toThrow('violates a weighted floor or has a non-finite start');
  });

  it('keeps an unknown FF successor at zero duration and after the predecessor finish', () => {
    const plan = schedule(
      [row('A', 10), row('B', 20)],
      [],
      [work('A', 2), work('B', null)],
      new Map(),
      new Map(),
      'whole-item',
      new Map(),
      [link('A', 'B', 'FF')],
    );
    expect(part(plan, 'B')).toMatchObject({ earliestStart: 2, earliestFinish: 2, duration: 0 });
  });

  it('computes float through a feasible augmented cycle', () => {
    const plan = schedule(
      [row('A', 10), row('B', 20), row('C', 30)],
      [],
      [work('A', 1, 'kat'), work('B', 11), work('C', 1, 'kat')],
      new Map([['A', 10]]),
      new Map(),
      'whole-item',
      new Map(),
      [link('A', 'B', 'FF'), link('B', 'C', 'SS')],
    );
    expect([
      part(plan, 'A').latestStart,
      part(plan, 'B').latestStart,
      part(plan, 'C').latestStart,
    ]).toEqual([10, 0, 9]);
  });

  it('relaxes latest dates beyond a reverse placement pass when resource order closes a cycle', () => {
    const plan = schedule(
      [row('A', 10), row('B', 20), row('C', 30), row('D', 40)],
      [],
      [work('A', 1, 'kat'), work('B', 11), work('C', 1, 'kat'), work('D', 10)],
      new Map([['A', 10]]),
      new Map(),
      'whole-item',
      new Map(),
      [link('A', 'B', 'FF'), link('B', 'C', 'SS'), link('B', 'D', 'FS')],
    );
    expect([
      part(plan, 'A').latestStart,
      part(plan, 'B').latestStart,
      part(plan, 'C').latestStart,
    ]).toEqual([10, 0, 9]);
  });

  it('refuses a positive cycle in the production backward relaxation', () => {
    expect(() => {
      relaxWeightedStarts(
        [0, 0],
        [
          { before: 0, after: 1, weight: 1 },
          { before: 1, after: 0, weight: 1 },
        ],
      );
    }).toThrow('positive-weight resource constraint cycle');
  });

  it('finds a whole interval accepted by every pool and replays its resource evidence', () => {
    const rows = [row('A', 10), row('B', 20), row('C', 30), row('D', 40)];
    const slices = [
      { ...work('A', 2), poolIds: ['alpha'] },
      { ...work('B', 1), poolIds: ['alpha', 'beta'] },
      { ...work('C', 3), poolIds: ['beta'] },
      work('D', 0),
    ];
    const typed = [link('D', 'B', 'SS')];
    const sizes = new Map([
      ['alpha', 1],
      ['beta', 1],
    ]);
    const fast = schedule(rows, [], slices, new Map(), sizes, 'whole-item', new Map(), typed);
    expect(part(fast, 'B').earliestStart).toBe(3);
    expect(part(fast, 'B').capacityTeamId).toBe('beta');
    const pins = new Map([...fast.slices].map(([key, slice]) => [key, slice.earliestStart]));
    const replay = schedule(
      rows,
      [],
      slices,
      new Map(),
      sizes,
      'whole-item',
      new Map(),
      typed,
      pins,
    );
    // The replay also asks each pin's pools whether it may start there, which
    // Fast never asks; that work is counted, so only the counter differs.
    expect(replay.eventsVisited).toBeGreaterThan(fast.eventsVisited);
    expect({ ...replay, eventsVisited: fast.eventsVisited }).toEqual(fast);
  });

  it('rejects a pinned person overlap even when an earlier gap is free', () => {
    const rows = [row('A', 10), row('Z', 20), row('B', 30)];
    const slices = [work('A', 2, 'kat'), work('Z', 0), work('B', 1, 'kat')];
    const pins = new Map([
      [sliceKey('A', null), 5],
      [sliceKey('Z', null), 0],
      [sliceKey('B', null), 6],
    ]);
    expect(() =>
      schedule(
        rows,
        [],
        slices,
        new Map(),
        new Map(),
        'whole-item',
        new Map(),
        [link('Z', 'B', 'SS')],
        pins,
      ),
    ).toThrow('overlaps a resource reservation');
  });

  it('rejects a pinned pool overlap in resource-order replay', () => {
    const rows = [row('A', 10), row('Z', 20), row('B', 30)];
    const slices = [
      { ...work('A', 2), poolIds: ['team'] },
      work('Z', 0),
      { ...work('B', 1), poolIds: ['team'] },
    ];
    const pins = new Map([
      [sliceKey('A', null), 5],
      [sliceKey('Z', null), 0],
      [sliceKey('B', null), 6],
    ]);
    expect(() =>
      schedule(
        rows,
        [],
        slices,
        new Map(),
        new Map([['team', 1]]),
        'whole-item',
        new Map(),
        [link('Z', 'B', 'SS')],
        pins,
      ),
    ).toThrow('overlaps pool team');
  });

  it('explains a person delay after a pool delay', () => {
    const rows = [
      row('A', 10),
      { ...row('B', 20), priority: -10 },
      row('Z', 30),
      { ...row('C', 40), priority: 10 },
    ];
    const slices = [
      { ...work('A', 3), poolIds: ['team'] },
      work('B', 2, 'kat'),
      work('Z', 0),
      { ...work('C', 1, 'kat'), poolIds: ['team'] },
    ];
    const plan = schedule(
      rows,
      [],
      slices,
      new Map([['B', 3]]),
      new Map([['team', 1]]),
      'whole-item',
      new Map(),
      [link('Z', 'C', 'SS')],
    );
    expect(part(plan, 'C')).toMatchObject({
      earliestStart: 5,
      boundBy: 'person',
      resourcePredecessorId: sliceKey('B', null),
    });
    expect(plan.waitingForPerson).toBe(1);
  });

  it('reconciles a tiled fractional interval before reserving a pool', () => {
    const rows = [
      { ...row('A', 10), priority: 10 },
      { ...row('B', 20), priority: -10 },
      { ...row('C', 30), priority: -10 },
      row('Z', 40),
    ];
    const slices = [
      { ...work('A', 1 / 3), stepId: 'first', poolIds: ['team'] },
      { ...work('A', 1 / 3), stepId: 'last', poolIds: ['team'] },
      { ...work('B', 1), poolIds: ['team'] },
      { ...work('C', 1), poolIds: ['team'] },
      work('Z', 0),
    ];
    const typed: TypedDependency[] = [
      {
        id: 'Z-A.last',
        predecessor: { scope: 'whole', workItemId: 'Z' },
        successor: { scope: 'node', workItemId: 'A', stepId: 'last' },
        type: 'SS',
      },
    ];
    const plan = schedule(
      rows,
      [],
      slices,
      new Map([
        ['A', 7],
        ['B', 7.666666666666666],
        ['C', 7.666666666666666],
      ]),
      new Map([['team', 2]]),
      'whole-item',
      new Map(),
      typed,
    );
    expect(plan.slices.get(sliceKey('A', 'last'))?.earliestStart).toBeGreaterThanOrEqual(
      part(plan, 'B').earliestFinish,
    );
  });
});

describe('solver-shaped weighted pins', () => {
  const units = (count: number) => count / SOLVER_QUANTUM;
  const rows = [row('A', 10), row('B', 20), row('C', 30), row('D', 40)];
  // C→D SS forces the weighted path; A→B is the edge under test.
  const replay = (
    type: RelationshipType,
    days: [number, number],
    starts: [number, number],
    other: RelationshipType = 'SS',
  ) =>
    schedule(
      rows,
      [],
      [work('A', days[0]), work('B', days[1]), work('C', 1), work('D', 1)],
      new Map(),
      new Map(),
      'whole-item',
      new Map(),
      [link('A', 'B', type), link('C', 'D', other)],
      new Map([
        [sliceKey('A', null), starts[0]],
        [sliceKey('B', null), starts[1]],
        [sliceKey('C', null), 0],
        [sliceKey('D', null), 1],
      ]),
    );

  it('accepts 7/48 + 0.25 against a pin at 19/48 across FS', () => {
    const plan = replay('FS', [0.25, 1], [units(7), units(19)]);
    expect(units(7) + 0.25).toBe(0.39583333333333337);
    expect(part(plan, 'B').earliestStart).toBe(part(plan, 'A').earliestFinish);
    const allFinishStart = replay('FS', [0.25, 1], [units(7), units(19)], 'FS');
    expect(part(plan, 'B').earliestStart).toBe(part(allFinishStart, 'B').earliestStart);
  });

  it('accepts every tight FS and FF pin on the solver axis', () => {
    const refused: string[] = [];
    for (let before = 1; before <= 60; before += 1) {
      for (let at = 0; at < 96; at += 1) {
        const cases: [RelationshipType, number, number, RelationshipType][] = [
          ['FS', 48, at + before, 'SS'],
          ['FS', 48, at + before, 'FS'],
          ['FF', 12, at + before - 12, 'SS'],
        ];
        for (const [type, after, pin, other] of cases) {
          if (pin < 0) continue;
          const label = `${type}+${other} ${String(before)}@${String(at)}`;
          try {
            const plan = replay(
              type,
              [units(before), units(after)],
              [units(at), units(pin)],
              other,
            );
            const boundary = part(plan, 'A').earliestFinish;
            const observed =
              type === 'FF' ? part(plan, 'B').earliestFinish : part(plan, 'B').earliestStart;
            if (observed < boundary) refused.push(`${label}: early ${String(observed)}`);
          } catch (error) {
            refused.push(`${label}: ${String(error)}`);
          }
        }
      }
    }
    expect(refused).toEqual([]);
  });

  it.each(['FS', 'FF'] as const)('still refuses a %s pin one solver unit early', (type) => {
    const pin = type === 'FS' ? units(7 + 12 - 1) : units(7 + 12 - 12 - 1);
    expect(() => replay(type, [0.25, units(12)], [units(7), pin])).toThrow(
      `violates ${type} materialized boundary`,
    );
  });
});
