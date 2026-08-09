import { describe, expect, it } from 'vitest';

import {
  GanttDataError,
  type GanttPlan,
  type GanttRow,
  type GanttSlice,
  layOutGantt,
} from './gantt-geometry';

/** A shown row: a leaf over these workdays, unless `extras` says otherwise. */
const rowAt = (
  id: string,
  earliestStart: number,
  earliestFinish: number,
  extras: Partial<GanttRow> = {},
): GanttRow => ({
  id,
  name: id,
  depth: 0,
  leaf: true,
  schedule: { earliestStart, earliestFinish },
  notBeforeOffset: null,
  ...extras,
});

/**
 * A scheduled slice over these workdays, floored by the project start and
 * under the `dev` role, unless `extras` says otherwise.
 *
 * `duration` is the difference here only because these fixtures are whole
 * days end to end; the one test about a fraction passes its own.
 */
const sliceAt = (
  id: string,
  workItemId: string,
  earliestStart: number,
  earliestFinish: number,
  extras: Partial<GanttSlice> = {},
): GanttSlice => ({
  id,
  workItemId,
  roleId: 'dev',
  personId: null,
  duration: earliestFinish - earliestStart,
  estimated: true,
  earliestStart,
  earliestFinish,
  critical: false,
  boundBy: 'projectStart',
  resourcePredecessorId: null,
  ...extras,
});

/** A plan with two roles and one person, over the rows and slices given. */
const planOf = (parts: Partial<GanttPlan>): GanttPlan => ({
  rows: [],
  slices: [],
  dependencies: [],
  roles: [
    { id: 'dev', name: 'Dev' },
    { id: 'qa', name: 'QA' },
  ],
  personNames: new Map([['kat', 'Kat']]),
  ...parts,
});

describe('bars', () => {
  it('draws one per slice of a leaf, in role order', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 5)],
        // Fed out of role order on purpose: the order bars sit in is the
        // plan's role order, not the payload's array order.
        slices: [
          sliceAt('strip-qa', 'strip', 3, 5, { roleId: 'qa' }),
          sliceAt('strip-dev', 'strip', 0, 3),
        ],
      }),
    );

    expect(chart.bars.map((bar) => bar.sliceId)).toEqual(['strip-dev', 'strip-qa']);
    expect(chart.bars.map((bar) => [bar.start, bar.finish, bar.duration])).toEqual([
      [0, 3, 3],
      [3, 5, 2],
    ]);
    expect(chart.bars.every((bar) => bar.rowIndex === 0)).toBe(true);
  });

  it('passes engine numbers through verbatim, fractions and all', () => {
    const start = 3.6666666666666665;
    const finish = 6.333333333333333;
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('sand', start, finish)],
        slices: [sliceAt('sand-dev', 'sand', start, finish, { duration: 2.6666666666666665 })],
      }),
    );

    const [bar] = chart.bars;
    expect(bar.start).toBe(3.6666666666666665);
    expect(bar.finish).toBe(6.333333333333333);
    expect(bar.duration).toBe(2.6666666666666665);
    expect(chart.horizon).toBe(6.333333333333333);
  });

  it('carries the critical path and the unestimated slice as facts of their own', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 3), rowAt('sand', 0, 2)],
        slices: [
          sliceAt('strip-dev', 'strip', 0, 3, { critical: true }),
          sliceAt('sand-dev', 'sand', 0, 2, { estimated: false }),
        ],
      }),
    );

    expect(chart.bars.map((bar) => [bar.critical, bar.estimated])).toEqual([
      [true, true],
      [false, false],
    ]);
  });

  it('skips a slice whose row is not shown', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 3)],
        slices: [sliceAt('strip-dev', 'strip', 0, 3), sliceAt('hidden-dev', 'hidden', 0, 9)],
      }),
    );

    expect(chart.bars.map((bar) => bar.sliceId)).toEqual(['strip-dev']);
  });

  it('says in words what a start is held by', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('a', 0, 1), rowAt('b', 1, 2), rowAt('c', 2, 3), rowAt('d', 3, 4)],
        slices: [
          sliceAt('a-dev', 'a', 0, 1),
          sliceAt('b-dev', 'b', 1, 2, { boundBy: 'predecessor' }),
          sliceAt('c-dev', 'c', 2, 3, { boundBy: 'roleOrder' }),
          sliceAt('d-dev', 'd', 3, 4, { boundBy: 'notBefore' }),
        ],
      }),
    );

    expect(chart.bars.map((bar) => bar.floorWords)).toEqual([
      'Starts with the project',
      'Waits for a dependency to finish',
      'Waits for an earlier role on this item',
      'Held by its start-no-earlier-than date',
    ]);
  });
});

describe('summary brackets', () => {
  /** A parent whose two children run 0→3 and 2→6: a 6-day branch of 7 days' work. */
  const staggeredChildren = (): GanttPlan =>
    planOf({
      rows: [
        rowAt('phase', 0, 6, { leaf: false }),
        rowAt('strip', 0, 3, { depth: 1 }),
        rowAt('sand', 2, 6, { depth: 1 }),
      ],
      slices: [sliceAt('strip-dev', 'strip', 0, 3), sliceAt('sand-dev', 'sand', 2, 6)],
    });

  it('spans a parent over staggered children', () => {
    const chart = layOutGantt(staggeredChildren());

    expect(chart.brackets).toEqual([{ rowId: 'phase', rowIndex: 0, start: 0, finish: 6 }]);
    expect(chart.bars.map((bar) => bar.rowIndex)).toEqual([1, 2]);
  });

  it('is a span and not the sum of what is under it', () => {
    const chart = layOutGantt(staggeredChildren());

    // 3 + 4 is the effort in the branch; 6 is the branch. A bracket that summed
    // would finish at 7 and claim a day the plan does not take.
    expect(chart.brackets[0].finish).not.toBe(7);
    expect(chart.brackets[0].finish).toBe(6);
    expect(chart.horizon).toBe(6);
  });

  it('draws no bracket for a leaf and no bar for a parent', () => {
    const chart = layOutGantt(staggeredChildren());

    expect(chart.brackets.map((bracket) => bracket.rowId)).toEqual(['phase']);
    expect(chart.bars.map((bar) => bar.sliceId)).toEqual(['strip-dev', 'sand-dev']);
  });
});

describe('person links', () => {
  /** Kat finishes `Strip` (Dev) and only then starts `Sand` — no dependency between them. */
  const handOff = (parts: Partial<GanttPlan> = {}): GanttPlan =>
    planOf({
      rows: [rowAt('strip', 0, 3), rowAt('sand', 3, 5)],
      slices: [
        sliceAt('strip-dev', 'strip', 0, 3, { personId: 'kat' }),
        sliceAt('sand-dev', 'sand', 3, 5, {
          personId: 'kat',
          boundBy: 'person',
          resourcePredecessorId: 'strip-dev',
        }),
      ],
      ...parts,
    });

  it('draws a hand-off, and no dependency arrow with it', () => {
    const chart = layOutGantt(handOff());

    expect(chart.personLinks).toEqual([
      {
        fromSliceId: 'strip-dev',
        fromRowIndex: 0,
        fromFinish: 3,
        toSliceId: 'sand-dev',
        toRowIndex: 1,
        toStart: 3,
      },
    ]);
    expect(chart.arrows).toEqual([]);
  });

  it('names the person and the slice they were finishing', () => {
    const chart = layOutGantt(handOff());

    expect(chart.bars[1].floorWords).toBe('Kat — after strip (Dev)');
  });

  it('skips the link when the row it comes from is not shown, and says so on the bar', () => {
    const chart = layOutGantt(handOff({ rows: [rowAt('sand', 3, 5)] }));

    expect(chart.personLinks).toEqual([]);
    expect(chart.bars.map((bar) => bar.sliceId)).toEqual(['sand-dev']);
    expect(chart.bars[0].floorWords).toBe('Kat — after work that is not shown');
  });

  it('throws when a resource predecessor names no slice in the payload', () => {
    const dangling = handOff({
      slices: [
        sliceAt('strip-dev', 'strip', 0, 3, { personId: 'kat' }),
        sliceAt('sand-dev', 'sand', 3, 5, {
          personId: 'kat',
          boundBy: 'person',
          resourcePredecessorId: 'a-slice-that-left',
        }),
      ],
    });

    expect(() => layOutGantt(dangling)).toThrow(GanttDataError);
    expect(() => layOutGantt(dangling)).toThrow('a-slice-that-left');
  });

  it('throws on a dangling resource predecessor even where no bar would be drawn', () => {
    const dangling = handOff({
      rows: [rowAt('strip', 0, 3)],
      slices: [
        sliceAt('strip-dev', 'strip', 0, 3, { personId: 'kat' }),
        sliceAt('sand-dev', 'sand', 3, 5, {
          personId: 'kat',
          boundBy: 'person',
          resourcePredecessorId: 'a-slice-that-left',
        }),
      ],
    });

    expect(() => layOutGantt(dangling)).toThrow(GanttDataError);
  });

  it('throws when a person floor names no resource predecessor', () => {
    const nobodyToWaitFor = handOff({
      slices: [
        sliceAt('strip-dev', 'strip', 0, 3, { personId: 'kat' }),
        sliceAt('sand-dev', 'sand', 3, 5, { personId: 'kat', boundBy: 'person' }),
      ],
    });

    expect(() => layOutGantt(nobodyToWaitFor)).toThrow(GanttDataError);
    expect(() => layOutGantt(nobodyToWaitFor)).toThrow('names no resource predecessor');
  });

  it('throws when a person floor names somebody the plan does not', () => {
    const stranger = handOff({ personNames: new Map([['someone-else', 'Sam']]) });

    expect(() => layOutGantt(stranger)).toThrow(GanttDataError);
    expect(() => layOutGantt(stranger)).toThrow('does not name');
  });
});

describe('dependency arrows', () => {
  const twoRowsOneEdge = (parts: Partial<GanttPlan> = {}): GanttPlan =>
    planOf({
      rows: [rowAt('strip', 0, 3), rowAt('sand', 3, 5)],
      slices: [sliceAt('strip-dev', 'strip', 0, 3), sliceAt('sand-dev', 'sand', 3, 5)],
      dependencies: [{ predecessorId: 'strip', successorId: 'sand' }],
      ...parts,
    });

  it('joins a predecessor finish to a successor start', () => {
    const chart = layOutGantt(twoRowsOneEdge());

    expect(chart.arrows).toEqual([
      {
        predecessorId: 'strip',
        successorId: 'sand',
        fromRowIndex: 0,
        fromFinish: 3,
        toRowIndex: 1,
        toStart: 3,
      },
    ]);
    expect(chart.personLinks).toEqual([]);
  });

  it('skips an arrow whose end is not shown', () => {
    const chart = layOutGantt(
      twoRowsOneEdge({
        rows: [rowAt('sand', 3, 5)],
        slices: [sliceAt('sand-dev', 'sand', 3, 5)],
      }),
    );

    expect(chart.arrows).toEqual([]);
    expect(chart.bars.map((bar) => bar.sliceId)).toEqual(['sand-dev']);
  });
});

describe('the rest of the chart', () => {
  it('labels every shown row in the plan order, with its depth', () => {
    const chart = layOutGantt(
      planOf({
        rows: [
          rowAt('phase', 0, 6, { leaf: false, name: 'Prep' }),
          rowAt('strip', 0, 3, { depth: 1, name: 'Strip' }),
        ],
        slices: [sliceAt('strip-dev', 'strip', 0, 3)],
      }),
    );

    expect(chart.labels).toEqual([
      { id: 'phase', name: 'Prep', depth: 0, rowIndex: 0 },
      { id: 'strip', name: 'Strip', depth: 1, rowIndex: 1 },
    ]);
  });

  it('flags a row that may not start before a workday', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 3), rowAt('sand', 4, 6, { notBeforeOffset: 4 })],
        slices: [sliceAt('strip-dev', 'strip', 0, 3), sliceAt('sand-dev', 'sand', 4, 6)],
      }),
    );

    expect(chart.notBeforeFlags).toEqual([{ rowIndex: 1, offset: 4 }]);
  });

  it('reaches as far as the latest finish of anything drawn', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('phase', 0, 9, { leaf: false }), rowAt('strip', 0, 3, { depth: 1 })],
        slices: [sliceAt('strip-dev', 'strip', 0, 3)],
      }),
    );

    expect(chart.horizon).toBe(9);
  });

  it('still has a horizon to draw in when there is nothing on it', () => {
    const chart = layOutGantt(planOf({}));

    expect(chart.horizon).toBe(1);
    expect(chart.bars).toEqual([]);
    expect(chart.labels).toEqual([]);
  });

  it('throws when a slice is under a role the plan does not list', () => {
    const strangerRole = planOf({
      rows: [rowAt('strip', 0, 3)],
      slices: [sliceAt('strip-ops', 'strip', 0, 3, { roleId: 'ops' })],
    });

    expect(() => layOutGantt(strangerRole)).toThrow(GanttDataError);
    expect(() => layOutGantt(strangerRole)).toThrow('does not list');
  });

  it('puts a slice belonging to no role after the ones that do', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 5)],
        slices: [
          sliceAt('strip-none', 'strip', 3, 5, { roleId: null }),
          sliceAt('strip-dev', 'strip', 0, 3),
        ],
      }),
    );

    expect(chart.bars.map((bar) => bar.sliceId)).toEqual(['strip-dev', 'strip-none']);
  });
});
