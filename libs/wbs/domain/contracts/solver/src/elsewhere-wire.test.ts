import { type Elsewhere, type Slice, sliceKey } from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { describe, expect, it } from 'bun:test';

import { buildSolverRequest } from './build-solver-request';
import { materialiseOptimized } from './materialise-optimized';
import { quantisedFastBaseline } from './quantised-baseline';
import { revalidateSolverResult } from './revalidate-solver-result';
import type { SolverResponse } from './wire-types';

const key = sliceKey('A', null);
const inputOf = (elsewhere: Elsewhere): ScheduleInput => ({
  rows: [{ id: 'A', parentId: null, position: 0, frozenNumber: null, priority: null }],
  slices: [{ workItemId: 'A', stepId: null, days: 1, personId: 'ana', width: 1, poolIds: [] }],
  edges: [],
  typed: [],
  reach: 'whole-item',
  notBefore: new Map(),
  deadlines: new Map(),
  poolSizes: new Map(),
  elsewhere,
});
const booking = (start: number, end: number) => ({
  start,
  end,
  projectId: 'higher',
  workItemId: 'held',
});
const baselineOf = (input: ScheduleInput) =>
  quantisedFastBaseline(
    input.rows,
    input.edges,
    input.slices,
    input.notBefore,
    input.poolSizes,
    input.reach,
    input.typed,
    input.elsewhere,
  );
const build = (input: ScheduleInput, solverVersion = '0.2.0') =>
  buildSolverRequest(input, 'time', {
    baselineOffsets: baselineOf(input),
    solverVersion,
    budgetMs: 1000,
  });
const response = (start: number): SolverResponse => ({
  wireVersion: 3,
  status: 'feasible',
  offsets: { [key]: start },
  objectiveValues: {
    makespan: { value: start + 48, stageValue: null, bound: null, status: 'feasible' },
    priority: { value: 0, stageValue: null, bound: null, status: 'feasible' },
    movement: { value: Math.abs(start - 49), stageValue: null, bound: null, status: 'feasible' },
  },
});

describe('bookings on solver wire 3', () => {
  it('rounds outward, clips pre-project time, and unions rounded overlap while preserving adjacency', () => {
    const input = inputOf(
      new Map([
        [
          'ana',
          [
            booking(-3, -2),
            booking(-1, 0.01),
            booking(0.015, 0.025),
            booking(0.03, 0.04),
            booking(2 / 48, 3 / 48),
          ],
        ],
      ]),
    );
    const built = build(input);
    if (!built.ok) throw new Error(built.detail);
    expect(built.request.wireVersion).toBe(3);
    expect(built.request.elsewhere).toEqual({
      ana: [
        [0, 2],
        [2, 3],
      ],
    });
    expect(built.request.baselineOffsets[key]).toBe(3);
    expect(input.elsewhere?.get('ana')?.length).toBe(5);
  });
  it('extends the serial horizon past a booking end', () => {
    const built = build(inputOf(new Map([['ana', [booking(0, 100.01)]]])));
    if (!built.ok) throw new Error(built.detail);
    expect(built.request.horizonUnits).toBe(4801 + 48);
    expect(built.request.baselineOffsets[key]).toBe(4801);
  });
  it('returns a typed compatibility refusal for the old solver', () => {
    expect(build(inputOf(new Map()), '0.1.4')).toMatchObject({
      ok: false,
      failure: 'incompatible-solver',
    });
  });
  it('refuses a solver answer that ignores a booking, and accepts its touching neighbour', () => {
    const built = build(inputOf(new Map([['ana', [booking(0, 1.01)]]])));
    if (!built.ok) throw new Error(built.detail);
    expect(revalidateSolverResult(built.request, response(0))).toMatchObject({
      ok: false,
      failure: 'assignee-double-booked',
    });
    expect(revalidateSolverResult(built.request, response(49))).toEqual({
      ok: true,
      published: true,
    });
  });
  it('refuses malformed fixed intervals before considering a non-publishing response', () => {
    const built = build(inputOf(new Map()));
    if (!built.ok) throw new Error(built.detail);
    for (const intervals of [
      [[0, 0]],
      [[-1, 2]],
      [[0, 1.5]],
      [
        [0, 3],
        [2, 4],
      ],
      [[0, 9999]],
    ] as const) {
      expect(
        revalidateSolverResult(
          { ...built.request, elsewhere: { ana: intervals } },
          { wireVersion: 3, status: 'unknown' },
        ),
      ).toMatchObject({ ok: false, failure: 'malformed-request' });
    }
  });
  it('accepts an empty person calendar at the wire boundary', () => {
    const built = build(inputOf(new Map()));
    if (!built.ok) throw new Error(built.detail);
    expect(
      revalidateSolverResult(
        { ...built.request, elsewhere: { ana: [] } },
        { wireVersion: 3, status: 'unknown' },
      ),
    ).toEqual({ ok: true, published: false });
  });
  it('refuses malformed tuple arity and empty person keys', () => {
    const built = build(inputOf(new Map()));
    if (!built.ok) throw new Error(built.detail);
    for (const elsewhere of [{ ana: [[0]] }, { ana: [[0, 1, 2]] }, { '': [[0, 1]] }]) {
      expect(
        revalidateSolverResult(
          { ...built.request, elsewhere: elsewhere as unknown as typeof built.request.elsewhere },
          { wireVersion: 3, status: 'unknown' },
        ),
      ).toMatchObject({ ok: false, failure: 'malformed-request' });
    }
  });
  it('treats prototype names as ordinary unbooked person ids', () => {
    const input = inputOf(new Map());
    const built = build({
      ...input,
      slices: input.slices.map((slice) => ({ ...slice, personId: 'constructor' })),
    });
    if (!built.ok) throw new Error(built.detail);
    const answered = response(0);
    if (answered.status !== 'feasible') throw new Error('expected feasible test response');
    expect(
      revalidateSolverResult(built.request, {
        ...answered,
        objectiveValues: {
          ...answered.objectiveValues,
          movement: { value: 0, stageValue: null, bound: null, status: 'feasible' as const },
        },
      }),
    ).toEqual({ ok: true, published: true });
  });
  it.each(['FS', 'SS'] as const)(
    'materialises original workday bookings with %s placement',
    (type) => {
      const base = inputOf(new Map([['ana', [booking(0, 1)]]]));
      const input: ScheduleInput =
        type === 'FS'
          ? base
          : {
              ...base,
              rows: [
                ...base.rows,
                { id: 'B', parentId: null, position: 1, frozenNumber: null, priority: null },
              ],
              slices: [
                ...base.slices,
                { workItemId: 'B', stepId: null, days: 0, personId: null, width: 1, poolIds: [] },
              ],
              typed: [
                {
                  id: 'ss',
                  predecessor: { scope: 'whole', workItemId: 'A' },
                  successor: { scope: 'whole', workItemId: 'B' },
                  type: 'SS',
                },
              ],
            };
      const offsets = { [key]: 48, ...(type === 'SS' ? { [sliceKey('B', null)]: 48 } : {}) };
      const placed = materialiseOptimized(
        input.rows,
        input.edges,
        input.slices,
        input.notBefore,
        input.poolSizes,
        input.reach,
        input.typed,
        offsets,
        input.elsewhere,
      );
      expect(placed.slices.get(key)).toMatchObject({
        earliestStart: 1,
        boundBy: 'elsewhere',
        elsewhereHolder: { projectId: 'higher', workItemId: 'held' },
      });
      expect(() =>
        materialiseOptimized(
          input.rows,
          input.edges,
          input.slices,
          input.notBefore,
          input.poolSizes,
          input.reach,
          input.typed,
          { ...offsets, [key]: 0 },
          input.elsewhere,
        ),
      ).toThrow();
    },
  );
  it.each(['FS', 'SS'] as const)(
    'refuses a later pin inside a booking with %s placement',
    (type) => {
      const base = inputOf(new Map([['ana', [booking(2, 4)]]]));
      const input: ScheduleInput =
        type === 'FS'
          ? base
          : {
              ...base,
              rows: [
                ...base.rows,
                { id: 'B', parentId: null, position: 1, frozenNumber: null, priority: null },
              ],
              slices: [
                ...base.slices,
                { workItemId: 'B', stepId: null, days: 0, personId: null, width: 1, poolIds: [] },
              ],
              typed: [
                {
                  id: 'ss',
                  predecessor: { scope: 'whole', workItemId: 'A' },
                  successor: { scope: 'whole', workItemId: 'B' },
                  type: 'SS',
                },
              ],
            };
      const offsets = { [key]: 144, ...(type === 'SS' ? { [sliceKey('B', null)]: 144 } : {}) };
      expect(() =>
        materialiseOptimized(
          input.rows,
          input.edges,
          input.slices,
          input.notBefore,
          input.poolSizes,
          input.reach,
          input.typed,
          offsets,
          input.elsewhere,
        ),
      ).toThrow();
    },
  );
  it('keeps the serial FF fallback clear of bookings', () => {
    const slices: Slice[] = [
      { workItemId: 'A', stepId: null, days: 0.03, personId: null, width: 1, poolIds: [] },
      { workItemId: 'B', stepId: null, days: 0.021, personId: 'ana', width: 1, poolIds: [] },
    ];
    const rows = ['A', 'B'].map((id, position) => ({
      id,
      parentId: null,
      position,
      frozenNumber: null,
      priority: null,
    }));
    const typed = [
      {
        id: 'ff',
        predecessor: { scope: 'whole' as const, workItemId: 'A' },
        successor: { scope: 'whole' as const, workItemId: 'B' },
        type: 'FF' as const,
      },
    ];
    const offsets = quantisedFastBaseline(
      rows,
      [],
      slices,
      new Map(),
      new Map(),
      'whole-item',
      typed,
      new Map([['ana', [booking(2 / 48, 4 / 48)]]]),
    );
    expect(offsets[sliceKey('B', null)]).toBe(4);
  });
});
