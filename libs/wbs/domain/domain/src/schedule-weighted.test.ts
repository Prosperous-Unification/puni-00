import { describe, expect, it } from 'bun:test';

import type { PlannedRow } from './derive-numbers';
import { schedule, type Slice, sliceKey } from './schedule';
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
    expect(
      schedule(rows, [], slices, new Map(), sizes, 'whole-item', new Map(), typed, pins),
    ).toEqual(fast);
  });
});
