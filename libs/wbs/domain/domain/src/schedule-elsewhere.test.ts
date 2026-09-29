import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import type { PlannedRow } from './derive-numbers';
import { FAST_GOLDEN_CASES, serializeSchedule } from './fast-golden-corpus';
import {
  type DependencyEdge,
  type Elsewhere,
  type ElsewhereBooking,
  type PoolSizes,
  schedule,
  type Slice,
  sliceKey,
} from './schedule';
import type { TypedDependency } from './typed-dependency';
import { withinDrift } from './workday';

const leaf = (id: string, position: number): PlannedRow => ({
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

const booking = (start: number, end: number, workItemId = 'x1'): ElsewhereBooking => ({
  start,
  end,
  projectId: 'platform',
  workItemId,
});

/** `schedule()` with every argument but the plan and `elsewhere` at its default. */
function around(
  rows: readonly PlannedRow[],
  slices: readonly Slice[],
  elsewhere: Elsewhere,
  extra: {
    edges?: readonly DependencyEdge[];
    poolSizes?: PoolSizes;
    typed?: readonly TypedDependency[];
  } = {},
) {
  return schedule(
    rows,
    extra.edges ?? [],
    slices,
    new Map(),
    extra.poolSizes ?? new Map(),
    'whole-item',
    new Map(),
    extra.typed ?? [],
    undefined,
    elsewhere,
  );
}

const sliceOf = (plan: ReturnType<typeof schedule>, workItemId: string) => {
  const found = plan.slices.get(sliceKey(workItemId, null));
  if (found === undefined) throw new Error(`no slice for ${workItemId}`);
  return found;
};

describe('a person booked elsewhere', () => {
  it('waits for a booking elsewhere before it starts', () => {
    const plan = around(
      [leaf('a', 0)],
      [work('a', 2, { personId: 'ana' })],
      new Map([['ana', [booking(0, 3)]]]),
    );
    const a = sliceOf(plan, 'a');
    expect([a.earliestStart, a.earliestFinish, a.boundBy]).toEqual([3, 5, 'elsewhere']);
    expect(a.elsewhereHolder).toEqual({ projectId: 'platform', workItemId: 'x1' });
    expect(a.resourcePredecessorId).toBeNull();
    expect(plan.waitingElsewhere).toBe(1);
  });

  it('fits in a gap between bookings, and a touching booking holds nothing', () => {
    const plan = around(
      [leaf('a', 0), leaf('b', 1)],
      [work('a', 3, { personId: 'ana' }), work('b', 1, { personId: 'ben' })],
      new Map([
        ['ana', [booking(0, 1, 'x1'), booking(4, 6, 'x2')]],
        ['ben', [booking(1, 2, 'y1')]],
      ]),
    );
    const a = sliceOf(plan, 'a');
    expect([a.earliestStart, a.earliestFinish]).toEqual([1, 4]);
    expect(a.elsewhereHolder).toEqual({ projectId: 'platform', workItemId: 'x1' });
    const b = sliceOf(plan, 'b');
    expect([b.earliestStart, b.boundBy, b.elsewhereHolder]).toEqual([0, 'projectStart', undefined]);
  });

  it('names the plan’s own predecessor, not the booking, when the two land on one day', () => {
    const plan = around(
      [leaf('a', 0), leaf('b', 1)],
      [work('a', 3), work('b', 1, { personId: 'ana' })],
      new Map([['ana', [booking(0, 3)]]]),
      { edges: [{ predecessorId: 'a', successorId: 'b' }] },
    );
    const b = sliceOf(plan, 'b');
    expect([b.earliestStart, b.boundBy, b.elsewhereHolder]).toEqual([3, 'predecessor', undefined]);
    expect(plan.waitingElsewhere).toBe(0);
  });

  it('names the pool when a pool pushes past the booking, with its blocking set', () => {
    // `t` holds its only slot until day 4; Ana is away until day 2.
    const plan = around(
      [leaf('h', 0), leaf('a', 1)],
      [work('h', 4, { poolIds: ['t'] }), work('a', 1, { personId: 'ana', poolIds: ['t'] })],
      new Map([['ana', [booking(0, 2)]]]),
      { poolSizes: new Map([['t', 1]]) },
    );
    const a = sliceOf(plan, 'a');
    expect([a.earliestStart, a.boundBy, a.capacityTeamId]).toEqual([4, 'capacity', 't']);
    expect(a.capacityPredecessorIds).toEqual([sliceKey('h', null)]);
    expect(a.elsewhereHolder).toBeUndefined();
  });

  it('names the booking when it pushes past the pool', () => {
    const plan = around(
      [leaf('h', 0), leaf('a', 1)],
      [work('h', 3, { poolIds: ['t'] }), work('a', 1, { personId: 'ana', poolIds: ['t'] })],
      new Map([['ana', [booking(3, 5)]]]),
      { poolSizes: new Map([['t', 1]]) },
    );
    const a = sliceOf(plan, 'a');
    expect([a.earliestStart, a.boundBy, a.capacityTeamId]).toEqual([5, 'elsewhere', null]);
    expect(a.capacityPredecessorIds).toEqual([]);
  });

  it('waits for a booking elsewhere across a typed dependency', () => {
    const plan = around(
      [leaf('a', 0), leaf('b', 1)],
      [work('a', 1), work('b', 2, { personId: 'ana' })],
      new Map([['ana', [booking(0, 4)]]]),
      {
        typed: [
          {
            id: 'd',
            predecessor: { scope: 'whole', workItemId: 'a' },
            successor: { scope: 'whole', workItemId: 'b' },
            type: 'SS',
          },
        ],
      },
    );
    const b = sliceOf(plan, 'b');
    expect([b.earliestStart, b.earliestFinish, b.boundBy]).toEqual([4, 6, 'elsewhere']);
    expect(b.elsewhereHolder).toEqual({ projectId: 'platform', workItemId: 'x1' });
  });

  it('refuses a malformed map', () => {
    const rows = [leaf('a', 0)];
    const slices = [work('a', 1, { personId: 'ana' })];
    for (const [bookings, message] of [
      [[booking(2, 2)], /holds no time/],
      [[booking(0, 3), booking(2, 4)], /overlap or are out of order/],
      [[booking(3, 4), booking(0, 1)], /overlap or are out of order/],
      [[booking(0, Infinity)], /not finite/],
    ] as const) {
      expect(() => around(rows, slices, new Map([['ana', bookings]]))).toThrow(message);
    }
  });

  it('refuses to materialise pinned starts around bookings elsewhere', () => {
    expect(() =>
      schedule(
        [leaf('a', 0)],
        [],
        [work('a', 1, { personId: 'ana' })],
        new Map(),
        new Map(),
        'whole-item',
        new Map(),
        [],
        new Map([[sliceKey('a', null), 0]]),
        new Map([['ana', [booking(0, 1)]]]),
      ),
    ).toThrow(/cannot yet be materialised around bookings elsewhere/);
  });
});

describe('no bookings elsewhere', () => {
  const STORED = JSON.parse(
    readFileSync(new URL('../fixtures/fast-golden-corpus.json', import.meta.url), 'utf8'),
  ) as { cases: Record<string, unknown> };

  it('keeps every golden corpus case byte for byte, the map supplied empty', () => {
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
      );
      expect({ name: each.name, json: JSON.stringify(serializeSchedule(plan)) }).toEqual({
        name: each.name,
        json: JSON.stringify(STORED.cases[each.name]),
      });
    }
  });

  it('places every corpus slice where it was when the only bookings are somebody else’s', () => {
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
        new Map([['nobody-in-this-plan', [booking(0, 50)]]]),
      );
      const { waitingElsewhere, ...rest } = serializeSchedule(plan) as Record<string, unknown>;
      expect(waitingElsewhere).toBe(0);
      expect(JSON.stringify(rest)).toBe(JSON.stringify(STORED.cases[each.name]));
    }
  });
});

/** A small random plan: leaves in a chain-free order, people, and FS edges forward only. */
const planArbitrary = fc
  .record({
    size: fc.integer({ min: 1, max: 6 }),
    days: fc.array(fc.integer({ min: 0, max: 8 }), { minLength: 6, maxLength: 6 }),
    halves: fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
    people: fc.array(fc.constantFrom(null, 'ana', 'ben'), { minLength: 6, maxLength: 6 }),
    edges: fc.array(fc.tuple(fc.nat(5), fc.nat(5)), { maxLength: 6 }),
    typedFirst: fc.option(fc.tuple(fc.nat(5), fc.nat(5), fc.constantFrom('SS', 'FF', 'FS')), {
      nil: null,
    }),
    gaps: fc.array(fc.tuple(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 1, max: 4 })), {
      maxLength: 4,
    }),
    who: fc.array(fc.constantFrom('ana', 'ben'), { minLength: 4, maxLength: 4 }),
    pooled: fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
    slots: fc.integer({ min: 1, max: 2 }),
  })
  .map((raw) => {
    const ids = Array.from({ length: raw.size }, (_, at) => `w${String(at)}`);
    const rows = ids.map((id, at) => leaf(id, at));
    const slices = ids.map((id, at) =>
      work(id, raw.days[at] + (raw.halves[at] ? 0.5 : 0), {
        personId: raw.people[at],
        poolIds: raw.pooled[at] ? ['t'] : [],
      }),
    );
    const edges = raw.edges
      .filter(([from, to]) => from < to && to < raw.size)
      .map(([from, to]) => ({ predecessorId: ids[from], successorId: ids[to] }));
    const typed: TypedDependency[] =
      raw.typedFirst !== null &&
      raw.typedFirst[0] < raw.typedFirst[1] &&
      raw.typedFirst[1] < raw.size
        ? [
            {
              id: 'd',
              predecessor: { scope: 'whole', workItemId: ids[raw.typedFirst[0]] },
              successor: { scope: 'whole', workItemId: ids[raw.typedFirst[1]] },
              type: raw.typedFirst[2],
            },
          ]
        : [];
    const byPerson = new Map<string, ElsewhereBooking[]>();
    const cursor = new Map<string, number>();
    raw.gaps.forEach(([gap, length], at) => {
      const person = raw.who[at];
      const start = (cursor.get(person) ?? 0) + gap;
      byPerson.set(person, [
        ...(byPerson.get(person) ?? []),
        booking(start, start + length, `x${String(at)}`),
      ]);
      cursor.set(person, start + length);
    });
    const poolSizes: PoolSizes = new Map([['t', raw.slots]]);
    return { rows, slices, edges, typed, poolSizes, elsewhere: byPerson };
  });

describe('properties of placing around bookings elsewhere', () => {
  it('places an empty map exactly as no map at all', () => {
    fc.assert(
      fc.property(planArbitrary, ({ rows, slices, edges, typed, poolSizes }) => {
        const without = schedule(
          rows,
          edges,
          slices,
          new Map(),
          poolSizes,
          'whole-item',
          new Map(),
          typed,
        );
        const empty = around(rows, slices, new Map(), { edges, typed, poolSizes });
        expect(JSON.stringify(serializeSchedule(empty))).toBe(
          JSON.stringify(serializeSchedule(without)),
        );
      }),
      { numRuns: 1000 },
    );
  });

  it('never places a person across one of their bookings, and names the holder exactly when one bound', () => {
    // What the runs reached, so a generator that stopped producing the case
    // this property is about fails here instead of passing vacuously.
    const reached = { elsewhere: 0, capacityBesideBookings: 0, weighted: 0 };
    fc.assert(
      fc.property(planArbitrary, ({ rows, slices, edges, typed, poolSizes, elsewhere }) => {
        const plan = around(rows, slices, elsewhere, { edges, typed, poolSizes });
        if (typed.length > 0 && elsewhere.size > 0) reached.weighted += 1;
        const waiting = new Set<string>();
        for (const placed of plan.slices.values()) {
          const bookings = placed.personId === null ? [] : (elsewhere.get(placed.personId) ?? []);
          if (placed.earliestFinish > placed.earliestStart) {
            for (const held of bookings) {
              const clear =
                placed.earliestFinish <= held.start ||
                withinDrift(placed.earliestFinish, held.start) ||
                placed.earliestStart >= held.end ||
                withinDrift(placed.earliestStart, held.end);
              expect({ slice: placed.workItemId, held, clear }).toEqual({
                slice: placed.workItemId,
                held,
                clear: true,
              });
            }
          }
          expect(placed.boundBy === 'elsewhere').toBe(placed.elsewhereHolder !== undefined);
          if (placed.boundBy === 'capacity' && bookings.length > 0)
            reached.capacityBesideBookings += 1;
          if (placed.boundBy === 'elsewhere') {
            reached.elsewhere += 1;
            waiting.add(placed.workItemId);
            const ended = bookings.find(
              (held) =>
                held.workItemId === placed.elsewhereHolder?.workItemId &&
                withinDrift(held.end, placed.earliestStart),
            );
            expect(ended).toBeDefined();
          }
        }
        expect(plan.waitingElsewhere).toBe(elsewhere.size === 0 ? undefined : waiting.size);
      }),
      { numRuns: 2000 },
    );
    expect(reached.elsewhere).toBeGreaterThan(100);
    expect(reached.capacityBesideBookings).toBeGreaterThan(20);
    expect(reached.weighted).toBeGreaterThan(100);
  });
});
