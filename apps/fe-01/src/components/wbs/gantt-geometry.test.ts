import { describe, expect, it } from 'vitest';

import {
  ASSUMED_UNESTIMATED_WORKDAYS,
  type BarColor,
  type BindingFloor,
  calendarScale,
  GanttDataError,
  type GanttPlan,
  type GanttRow,
  type GanttSlice,
  inkOn,
  layOutGantt,
  PERSON_BAR_COLORS,
  placeOnCalendar,
  placeOnWorkdays,
  UNASSIGNED_BAR_COLOR,
} from './gantt-geometry';

/** A shown row: a leaf over these workdays, unless `extras` says otherwise. */
const rowAt = (
  id: string,
  earliestStart: number,
  earliestFinish: number,
  extras: Partial<GanttRow> = {},
): GanttRow => ({
  id,
  number: id,
  name: id,
  depth: 0,
  leaf: true,
  schedule: { earliestStart, earliestFinish },
  notBeforeOffset: null,
  priority: null,
  // The three facts a row is enriched with before the chart is drawn. Absent
  // by default and named by the tests that are about them, so a fixture never
  // has to state a team it is not asking about.
  team: { state: 'none' },
  trioByRole: new Map(),
  waitsFor: [],
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
  float: 0,
  critical: false,
  boundBy: 'projectStart',
  resourcePredecessorId: null,
  ...extras,
});

/**
 * The full tree a fixture's shown rows imply: each row's parent is the nearest
 * shallower row above it. The tests about a **hidden** branch pass their own
 * `tree`, because hidden rows are exactly what shown rows cannot imply.
 */
const treeFrom = (rows: readonly GanttRow[]): { id: string; parentId: string | null }[] => {
  const above: { id: string; depth: number }[] = [];
  return rows.map((row) => {
    while (above.length > 0 && above[above.length - 1].depth >= row.depth) above.pop();
    const parentId = above.length > 0 ? above[above.length - 1].id : null;
    above.push({ id: row.id, depth: row.depth });
    return { id: row.id, parentId };
  });
};

/** A plan with two roles and one person, over the rows and slices given. */
const planOf = (parts: Partial<GanttPlan>): GanttPlan => ({
  rows: [],
  slices: [],
  dependencies: [],
  tree: treeFrom(parts.rows ?? []),
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
        fromStart: 0,
        fromFinish: 3,
        toSliceId: 'sand-dev',
        toRowIndex: 1,
        toStart: 3,
        personColor: PERSON_BAR_COLORS[0],
      },
    ]);
    expect(chart.arrows).toEqual([]);
  });

  /**
   * The link and the two bars are three readings of one hand-off, and this is
   * the test that says they cannot disagree: the line leaves where the busy bar
   * ends and arrives where the waiting bar begins, on the rows those bars are
   * on, in the colour they are painted.
   */
  it('leaves and arrives exactly where the two bars are, in their colour', () => {
    const chart = layOutGantt(handOff());
    const [busy, waiting] = chart.bars;
    const [link] = chart.personLinks;

    expect([link.fromRowIndex, link.fromFinish]).toEqual([busy.rowIndex, busy.finish]);
    expect([link.toRowIndex, link.toStart]).toEqual([waiting.rowIndex, waiting.start]);
    expect(link.personColor).toBe(busy.personColor);
    expect(link.personColor).toBe(waiting.personColor);
    // And the hand-off is what the second bar's start *is*: Kat's queue, not a
    // dependency, put it at 3 — the same 3 the first bar finishes at.
    expect(waiting.start).toBe(busy.finish);
  });

  it('draws a hand-off, not an arrow, when the person is the later floor', () => {
    // `Sand` depends on `Trim`, which finishes at 1 — but Kat is on `Strip`
    // until 3, so the person is the binding floor and the arrow is drawn as
    // well because the dependency is stored. Two marks, saying two things.
    const chart = layOutGantt(
      handOff({
        rows: [rowAt('trim', 0, 1), rowAt('strip', 0, 3), rowAt('sand', 3, 5)],
        slices: [
          sliceAt('trim-dev', 'trim', 0, 1),
          sliceAt('strip-dev', 'strip', 0, 3, { personId: 'kat' }),
          sliceAt('sand-dev', 'sand', 3, 5, {
            personId: 'kat',
            boundBy: 'person',
            resourcePredecessorId: 'strip-dev',
          }),
        ],
        dependencies: [{ predecessorId: 'trim', successorId: 'sand' }],
      }),
    );

    expect(chart.personLinks.map((link) => [link.fromSliceId, link.toStart])).toEqual([
      ['strip-dev', 3],
    ]);
    // The arrow leaves the dependency's own finish, 1, and lands on the start
    // the person set, 3 — the gap between them being exactly what a reader is
    // looking at the chart to see.
    expect(chart.arrows.map((arrow) => [arrow.fromFinish, arrow.toStart])).toEqual([[1, 3]]);
  });

  it('draws no hand-off where the dependency is the later floor', () => {
    // The same two people-slices, but `Sand` waits on `Trim` until 4: the
    // dependency is later than Kat's finish, so `boundBy` is the predecessor
    // and no person link is drawn at all. A tie is never the person.
    const chart = layOutGantt(
      handOff({
        rows: [rowAt('trim', 0, 4), rowAt('strip', 0, 3), rowAt('sand', 4, 6)],
        slices: [
          sliceAt('trim-dev', 'trim', 0, 4),
          sliceAt('strip-dev', 'strip', 0, 3, { personId: 'kat' }),
          sliceAt('sand-dev', 'sand', 4, 6, {
            personId: 'kat',
            boundBy: 'predecessor',
            resourcePredecessorId: 'strip-dev',
          }),
        ],
        dependencies: [{ predecessorId: 'trim', successorId: 'sand' }],
      }),
    );

    expect(chart.personLinks).toEqual([]);
    expect(chart.arrows.map((arrow) => [arrow.fromFinish, arrow.toStart])).toEqual([[4, 4]]);
    expect(chart.bars[2].floorWords).toBe('Waits for a dependency to finish');
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

/**
 * A floor this module has no words for.
 *
 * `boundBy` is a wire value, and the union says five because that is what
 * be-01 sends today. A sixth added there — a resource calendar, a fixed date —
 * arrives here as a string, and the cast is how a test says "the payload
 * carried a value this build has never heard of" without waiting for be-01 to
 * grow one. That is the boundary that makes it safe: nothing else in this file
 * casts, and this one exists to reach the branch a type cannot.
 */
describe('a binding floor this build does not know', () => {
  const heldByTheUnknown = (): GanttPlan =>
    planOf({
      rows: [rowAt('strip', 0, 3)],
      slices: [
        sliceAt('strip-dev', 'strip', 0, 3, {
          boundBy: 'resourceCalendar' as BindingFloor,
        }),
      ],
    });

  it('throws rather than saying nothing at all about what holds a bar', () => {
    // Proof: the `default` branch replaced by the index it used to be —
    // `FLOOR_SENTENCE[slice.boundBy as Exclude<BindingFloor, 'person'>]`. This
    // test alone failed, on `expected function to throw an error, but it
    // didn't`; the same run printed what shipped instead — `floorWords`
    // `undefined`, and the bar's hover title ending `…Float 0 days\n` with
    // nothing after the newline. Watched 2026-08-09.
    expect(() => layOutGantt(heldByTheUnknown())).toThrow(GanttDataError);
    expect(() => layOutGantt(heldByTheUnknown())).toThrow('resourceCalendar');
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
        fromStart: 0,
        fromFinish: 3,
        toRowIndex: 1,
        toStart: 3,
      },
    ]);
    expect(chart.personLinks).toEqual([]);
  });

  /**
   * Two predecessors, one successor: the join a Gantt is read for.
   *
   * One arrow per **stored** edge and not one from the latest predecessor
   * alone — the chart draws what was written down, and which of the two set the
   * start is the bar's own binding floor to say. Both arrows land on the same
   * start, which is the max of the two finishes.
   */
  it('joins every stored predecessor to the same successor start', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 3), rowAt('trim', 0, 5), rowAt('sand', 5, 7)],
        slices: [
          sliceAt('strip-dev', 'strip', 0, 3),
          sliceAt('trim-dev', 'trim', 0, 5),
          sliceAt('sand-dev', 'sand', 5, 7, { boundBy: 'predecessor' }),
        ],
        dependencies: [
          { predecessorId: 'strip', successorId: 'sand' },
          { predecessorId: 'trim', successorId: 'sand' },
        ],
      }),
    );

    expect(
      chart.arrows.map((arrow) => [arrow.predecessorId, arrow.fromFinish, arrow.toStart]),
    ).toEqual([
      ['strip', 3, 5],
      ['trim', 5, 5],
    ]);
    // The successor starts at the later of the two finishes, and the arrow from
    // the earlier one is the slack drawn: 3 → 5 with nothing in between.
    expect(chart.bars[2].start).toBe(5);
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

  it('the arrow does not overshoot a parallel successor', () => {
    // `sand` waits on `strip`'s anchor — its Dev, done on day 3 — while
    // `strip`'s QA runs 3→5 beside it. An arrow from the projection finish at
    // 5 would point backwards past the start it lands on.
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 5), rowAt('sand', 3, 6)],
        slices: [
          sliceAt('strip-dev', 'strip', 0, 3),
          sliceAt('strip-qa', 'strip', 3, 5, { roleId: 'qa' }),
          sliceAt('sand-dev', 'sand', 3, 6, { boundBy: 'predecessor' }),
        ],
        dependencies: [{ predecessorId: 'strip', successorId: 'sand' }],
      }),
    );

    expect(chart.arrows).toEqual([
      {
        predecessorId: 'strip',
        successorId: 'sand',
        fromRowIndex: 0,
        fromStart: 0,
        fromFinish: 3,
        toRowIndex: 1,
        toStart: 3,
      },
    ]);
  });

  it('an arrow from a branch leaves its latest anchor', () => {
    // `rig` depends on the parent: every leaf's first-role work must be done,
    // and `sand`'s Dev is the later of them at day 4 — `strip`'s at 2, both
    // QAs running on to 5. The arrow leaves day 4, from the parent's own
    // bracket row.
    const chart = layOutGantt(
      planOf({
        rows: [
          rowAt('hull', 0, 5, { leaf: false }),
          rowAt('strip', 0, 5, { depth: 1 }),
          rowAt('sand', 0, 5, { depth: 1 }),
          rowAt('rig', 4, 6),
        ],
        slices: [
          sliceAt('strip-dev', 'strip', 0, 2),
          sliceAt('strip-qa', 'strip', 2, 5, { roleId: 'qa' }),
          sliceAt('sand-dev', 'sand', 0, 4),
          sliceAt('sand-qa', 'sand', 4, 5, { roleId: 'qa' }),
          sliceAt('rig-dev', 'rig', 4, 6, { boundBy: 'predecessor' }),
        ],
        dependencies: [{ predecessorId: 'hull', successorId: 'rig' }],
      }),
    );

    expect(chart.arrows).toEqual([
      {
        predecessorId: 'hull',
        successorId: 'rig',
        fromRowIndex: 0,
        fromStart: 0,
        fromFinish: 4,
        toRowIndex: 3,
        toStart: 4,
      },
    ]);
  });

  it('anchors a collapsed branch through the full tree, not the shown rows', () => {
    // The same branch with its leaves collapsed away: their rows are gone from
    // `rows`, their slices are still in the payload, and the tree is what
    // still says whose they are. The arrow must leave the same day 4.
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('hull', 0, 5, { leaf: false }), rowAt('rig', 4, 6)],
        slices: [
          sliceAt('strip-dev', 'strip', 0, 2),
          sliceAt('strip-qa', 'strip', 2, 5, { roleId: 'qa' }),
          sliceAt('sand-dev', 'sand', 0, 4),
          sliceAt('sand-qa', 'sand', 4, 5, { roleId: 'qa' }),
          sliceAt('rig-dev', 'rig', 4, 6, { boundBy: 'predecessor' }),
        ],
        tree: [
          { id: 'hull', parentId: null },
          { id: 'strip', parentId: 'hull' },
          { id: 'sand', parentId: 'hull' },
          { id: 'rig', parentId: null },
        ],
        dependencies: [{ predecessorId: 'hull', successorId: 'rig' }],
      }),
    );

    // The hidden leaves draw no bars — that rule is untouched.
    expect(chart.bars.map((bar) => bar.sliceId)).toEqual(['rig-dev']);
    expect(chart.arrows).toEqual([
      {
        predecessorId: 'hull',
        successorId: 'rig',
        fromRowIndex: 0,
        fromStart: 0,
        fromFinish: 4,
        toRowIndex: 1,
        toStart: 4,
      },
    ]);
  });

  it('anchors a parent of parents through the leaves two levels down', () => {
    // `hull` holds `deck`, and only `deck` holds the leaves `strip` and
    // `sand` — plus `keel` directly under `hull`. `rig` depends on `hull`, so
    // the anchor is the latest-finishing first-role work among the leaf
    // descendants at **any** depth: `keel`'s Dev ends day 1, `strip`'s day 2,
    // `sand`'s day 4 — the arrow leaves day 4, from `hull`'s bracket row. A
    // walk that stopped at `hull`'s direct children would take `deck` for a
    // leaf and find it has no slice.
    //
    // Proof: `leavesUnder`'s recursion shallowed to direct children —
    // `children.map((child) => child.id)` in place of the `flatMap` over
    // `walk` — and this failed alone, `1 failed | 67 passed`, on
    // `GanttDataError: dependency hull → rig: deck has no slice in this
    // payload`; watched 2026-08-11.
    const chart = layOutGantt(
      planOf({
        rows: [
          rowAt('hull', 0, 6, { leaf: false }),
          rowAt('deck', 0, 6, { depth: 1, leaf: false }),
          rowAt('strip', 0, 5, { depth: 2 }),
          rowAt('sand', 0, 6, { depth: 2 }),
          rowAt('keel', 0, 3, { depth: 1 }),
          rowAt('rig', 4, 6),
        ],
        slices: [
          sliceAt('strip-dev', 'strip', 0, 2),
          sliceAt('strip-qa', 'strip', 2, 5, { roleId: 'qa' }),
          sliceAt('sand-dev', 'sand', 0, 4),
          sliceAt('sand-qa', 'sand', 4, 6, { roleId: 'qa' }),
          sliceAt('keel-dev', 'keel', 0, 1),
          sliceAt('keel-qa', 'keel', 1, 3, { roleId: 'qa' }),
          sliceAt('rig-dev', 'rig', 4, 6, { boundBy: 'predecessor' }),
        ],
        dependencies: [{ predecessorId: 'hull', successorId: 'rig' }],
      }),
    );

    expect(chart.arrows).toEqual([
      {
        predecessorId: 'hull',
        successorId: 'rig',
        fromRowIndex: 0,
        fromStart: 0,
        fromFinish: 4,
        toRowIndex: 5,
        toStart: 4,
      },
    ]);
  });

  it('a zero-length anchor draws from its own day', () => {
    // `strip`'s first role is unestimated: its anchor stands at day 5 with no
    // days in it, and the `fromStart === fromFinish` calendar reading — built
    // for zero-day projections — is what keeps the arrow leaving where day 5
    // begins, the Monday at 7, not the end of the workday before it at 5.
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 5, 9), rowAt('sand', 5, 7)],
        slices: [
          sliceAt('strip-dev', 'strip', 5, 5, { duration: 0, estimated: false }),
          sliceAt('strip-qa', 'strip', 5, 9, { roleId: 'qa' }),
          sliceAt('sand-dev', 'sand', 5, 7, { boundBy: 'predecessor' }),
        ],
        dependencies: [{ predecessorId: 'strip', successorId: 'sand' }],
      }),
    );

    expect(chart.arrows[0]).toMatchObject({ fromStart: 5, fromFinish: 5 });

    const placed = placeOnCalendar(chart, '2026-08-10');
    expect(placed.arrows[0].fromX).toBe(7);
  });

  it('throws when a shown predecessor has no slice in the payload at all', () => {
    // Not a collapsed row — `strip` is on the chart — and be-01 emits at least
    // one slice for every leaf, so a shown predecessor with none anywhere is a
    // broken promise: the arrow has no anchor to leave, and a chart quietly
    // short one arrow would hide exactly the wait it exists to show.
    const missing = planOf({
      rows: [rowAt('strip', 0, 3), rowAt('sand', 3, 5)],
      slices: [sliceAt('sand-dev', 'sand', 3, 5)],
      dependencies: [{ predecessorId: 'strip', successorId: 'sand' }],
    });

    expect(() => layOutGantt(missing)).toThrow(GanttDataError);
    expect(() => layOutGantt(missing)).toThrow('no slice');
  });
});

describe('the rest of the chart', () => {
  it('labels every shown row in the plan order, with its number and its depth', () => {
    const chart = layOutGantt(
      planOf({
        rows: [
          rowAt('phase', 0, 6, { leaf: false, number: '010', name: 'Prep' }),
          rowAt('strip', 0, 3, { depth: 1, number: '010.1', name: 'Strip' }),
        ],
        slices: [sliceAt('strip-dev', 'strip', 0, 3)],
      }),
    );

    // Proof: `number: row.number` dropped from the label — this test alone
    // failed, on `expected { id: 'phase', name: 'Prep', … } to deeply equal {
    // id: 'phase', number: '010', … }`, and the panel drew a column of names
    // with no numbers in it. Watched, 2026-08-09.
    expect(chart.labels).toEqual([
      { id: 'phase', number: '010', name: 'Prep', depth: 0, rowIndex: 0 },
      { id: 'strip', number: '010.1', name: 'Strip', depth: 1, rowIndex: 1 },
    ]);
  });

  it('names the work item a bar is for by number as well as by name', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 3, { number: '010', name: 'Strip the hull' })],
        slices: [sliceAt('strip-dev', 'strip', 0, 3)],
      }),
    );

    expect(chart.bars.map((bar) => [bar.workItemNumber, bar.workItemName])).toEqual([
      ['010', 'Strip the hull'],
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

describe('what a bar knows about itself', () => {
  it('names its work item, its role and its person, and carries its float', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 3, { name: 'Strip the hull' })],
        slices: [
          sliceAt('strip-dev', 'strip', 0, 3, { personId: 'kat', float: 2.5 }),
          sliceAt('strip-qa', 'strip', 3, 4, { roleId: 'qa' }),
        ],
      }),
    );

    expect(
      chart.bars.map((bar) => [bar.workItemName, bar.roleName, bar.personName, bar.float]),
    ).toEqual([
      ['Strip the hull', 'Dev', 'Kat', 2.5],
      ['Strip the hull', 'QA', null, 0],
    ]);
  });

  it('leaves the role nameless on a slice that belongs to none', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 3)],
        slices: [sliceAt('strip-none', 'strip', 0, 3, { roleId: null })],
      }),
    );

    expect(chart.bars[0].roleName).toBeNull();
  });

  it('throws when a slice is assigned to somebody the plan does not name', () => {
    // Not a person floor: an ordinary bar, assigned to an id the roster has
    // lost. The colour and the on-bar label are both that name, so a chart
    // drawn anyway would carry an anonymous colour nobody could ask about.
    const stranger = planOf({
      rows: [rowAt('strip', 0, 3)],
      slices: [sliceAt('strip-dev', 'strip', 0, 3, { personId: 'nobody-here' })],
    });

    expect(() => layOutGantt(stranger)).toThrow(GanttDataError);
    expect(() => layOutGantt(stranger)).toThrow('does not name');
  });

  it('throws when a person floor names nobody at all', () => {
    const nameless = planOf({
      rows: [rowAt('strip', 0, 3), rowAt('sand', 3, 5)],
      slices: [
        sliceAt('strip-dev', 'strip', 0, 3),
        sliceAt('sand-dev', 'sand', 3, 5, {
          boundBy: 'person',
          resourcePredecessorId: 'strip-dev',
        }),
      ],
    });

    expect(() => layOutGantt(nameless)).toThrow(GanttDataError);
    expect(() => layOutGantt(nameless)).toThrow('no person at all');
  });
});

describe('bar colours are people', () => {
  /** A plan of `count` leaves, one slice each, one person per leaf. */
  const oneLeafPer = (personIds: readonly (string | null)[]): GanttPlan =>
    planOf({
      rows: personIds.map((_, at) => rowAt(`row-${String(at)}`, at, at + 1)),
      slices: personIds.map((personId, at) =>
        sliceAt(`slice-${String(at)}`, `row-${String(at)}`, at, at + 1, { personId }),
      ),
      personNames: new Map(
        personIds
          .filter((personId): personId is string => personId !== null)
          .map((personId) => [personId, personId.toUpperCase()]),
      ),
    });

  it('gives one person one colour on every row they are on', () => {
    const chart = layOutGantt(oneLeafPer(['kat', 'ravi', 'kat']));

    expect(chart.bars[0].personColor).toBe(chart.bars[2].personColor);
    expect(chart.bars[1].personColor).not.toBe(chart.bars[0].personColor);
  });

  it('hands the palette out in the order people first appear, top-down', () => {
    // `ravi` is on the row above `kat`, so `ravi` takes the first colour —
    // nothing about the payload's slice order or the alphabet comes into it.
    const chart = layOutGantt(oneLeafPer(['ravi', 'kat']));

    expect(chart.bars.map((bar) => bar.personColor)).toEqual([
      PERSON_BAR_COLORS[0],
      PERSON_BAR_COLORS[1],
    ]);
  });

  it('wraps the eleventh person back onto the first colour', () => {
    const eleven = Array.from({ length: 11 }, (_, at) => `person-${String(at)}`);
    const chart = layOutGantt(oneLeafPer(eleven));

    expect(chart.bars).toHaveLength(11);
    expect(chart.bars.map((bar) => bar.personColor).slice(0, 10)).toEqual([...PERSON_BAR_COLORS]);
    expect(chart.bars[10].personColor).toBe(PERSON_BAR_COLORS[0]);
  });

  /**
   * Ten hues cannot share one ink. `#bcbd22` is a highlighter and `#17becf` is
   * a swimming pool; white on either is a label nobody reads, and `#ff7f0e` is
   * not much better.
   */
  it('writes the label in ink the bar can be read through', () => {
    expect(inkOn('#bcbd22')).toBe('#0f172a');
    expect(inkOn('#17becf')).toBe('#0f172a');
    expect(inkOn('#ff7f0e')).toBe('#0f172a');
    expect(inkOn('#1f77b4')).toBe('#ffffff');
    expect(inkOn('#d62728')).toBe('#ffffff');
    expect(inkOn('#8c564b')).toBe('#ffffff');
    // And every colour in the palette gets one of exactly those two answers.
    const everyBarColor: BarColor[] = [...PERSON_BAR_COLORS, UNASSIGNED_BAR_COLOR];
    expect(new Set(everyBarColor.map((color) => inkOn(color)))).toEqual(
      new Set(['#0f172a', '#ffffff']),
    );
  });

  it('paints a slice nobody is on grey, and does not spend a colour on it', () => {
    const chart = layOutGantt(oneLeafPer([null, 'kat']));

    expect(chart.bars[0].personColor).toBe(UNASSIGNED_BAR_COLOR);
    // The unassigned row did not take the first colour with it: `kat` is still
    // the first person, and still the first colour.
    expect(chart.bars[1].personColor).toBe(PERSON_BAR_COLORS[0]);
    expect(UNASSIGNED_BAR_COLOR).not.toBe(PERSON_BAR_COLORS[0]);
  });
});

describe('the shapes a real schedule makes', () => {
  it('keeps the plan’s own row order when the starts are out of it', () => {
    // The anti-reference test. A Gantt sorted by start date would put `Rigging`
    // at the top; this one mirrors the tree, and the tree says `Hull` first.
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('hull', 4, 7), rowAt('rigging', 0, 2), rowAt('sails', 2, 4)],
        slices: [
          sliceAt('hull-dev', 'hull', 4, 7),
          sliceAt('rigging-dev', 'rigging', 0, 2),
          sliceAt('sails-dev', 'sails', 2, 4),
        ],
      }),
    );

    expect(chart.labels.map((label) => label.id)).toEqual(['hull', 'rigging', 'sails']);
    expect(chart.bars.map((bar) => [bar.sliceId, bar.rowIndex, bar.start])).toEqual([
      ['hull-dev', 0, 4],
      ['rigging-dev', 1, 0],
      ['sails-dev', 2, 2],
    ]);
  });

  it('spans a grandparent over the parent that spans the leaves', () => {
    const chart = layOutGantt(
      planOf({
        rows: [
          rowAt('boat', 0, 9, { leaf: false }),
          rowAt('hull', 0, 6, { leaf: false, depth: 1 }),
          rowAt('strip', 0, 3, { depth: 2 }),
          rowAt('sand', 2, 6, { depth: 2 }),
          rowAt('rig', 6, 9, { depth: 1 }),
        ],
        slices: [
          sliceAt('strip-dev', 'strip', 0, 3),
          sliceAt('sand-dev', 'sand', 2, 6),
          sliceAt('rig-dev', 'rig', 6, 9),
        ],
      }),
    );

    expect(chart.brackets).toEqual([
      { rowId: 'boat', rowIndex: 0, start: 0, finish: 9 },
      { rowId: 'hull', rowIndex: 1, start: 0, finish: 6 },
    ]);
    // The nesting is the two brackets' spans, and the grandparent reaches past
    // the parent because a leaf outside it does.
    expect(chart.bars.map((bar) => bar.rowIndex)).toEqual([2, 3, 4]);
    expect(chart.horizon).toBe(9);
  });

  /**
   * A three-slice PERT chain, in the numbers PERT actually produces.
   *
   * `(1 + 4×3 + 8) / 6` is 3.5 and `(2 + 4×4 + 5) / 6` is 3.8333333333333335;
   * the third starts where the second finishes, which is a sum of two of those.
   * Every one of them reaches the bar untouched — this is the assertion that
   * says nothing here rounds on the way.
   */
  it('carries a PERT chain’s fractions through to every bar, verbatim', () => {
    const first = 3.5;
    const second = 3.8333333333333335;
    const third = 3.6666666666666665;
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('a', 0, first), rowAt('b', first, first + second)],
        slices: [
          sliceAt('a-dev', 'a', 0, first, { duration: first }),
          sliceAt('a-qa', 'a', first, first + third, { roleId: 'qa', duration: third }),
          sliceAt('b-dev', 'b', first, first + second, {
            duration: second,
            boundBy: 'roleOrder',
          }),
        ],
      }),
    );

    expect(chart.bars.map((bar) => [bar.start, bar.duration, bar.finish])).toEqual([
      [0, 3.5, 3.5],
      [3.5, 3.6666666666666665, 7.166666666666666],
      [3.5, 3.8333333333333335, 7.333333333333334],
    ]);
    expect(chart.horizon).toBe(7.333333333333334);
  });

  it('holds a not-before flag at its exact offset, with the bar sitting on it', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 3), rowAt('sand', 4.5, 6.5, { notBeforeOffset: 4.5 })],
        slices: [
          sliceAt('strip-dev', 'strip', 0, 3),
          sliceAt('sand-dev', 'sand', 4.5, 6.5, { boundBy: 'notBefore' }),
        ],
      }),
    );

    expect(chart.notBeforeFlags).toEqual([{ rowIndex: 1, offset: 4.5 }]);
    // The flag and the bar are the same number: the date is the floor, and the
    // bar is standing on it. A flag drawn anywhere else would be the chart
    // disagreeing with itself about the same day.
    expect(chart.bars[1].start).toBe(chart.notBeforeFlags[0].offset);
    expect(chart.bars[1].floorWords).toBe('Held by its start-no-earlier-than date');
  });

  /**
   * A slice **estimated** at no days: real, and drawn as a mark of no width.
   *
   * `expectedDays({0, 0, 0})` is 0 — `libs/domain/src/estimate.test.ts` says so
   * — so a slice somebody has estimated can still be zero workdays long. The
   * geometry keeps the bar, the panel draws a tick at its start because a
   * `<rect width="0">` paints nothing, and it takes no room on the axis and
   * moves the horizon nowhere. An unestimated slice is the test below, and it
   * is a different answer.
   */
  it('keeps a zero-day estimate as a bar of no width that takes no room', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 3), rowAt('sand', 3, 3)],
        slices: [
          sliceAt('strip-dev', 'strip', 0, 3),
          sliceAt('sand-dev', 'sand', 3, 3, { duration: 0 }),
        ],
      }),
    );

    expect(chart.bars.map((bar) => [bar.sliceId, bar.start, bar.duration, bar.drawnSpan])).toEqual([
      ['strip-dev', 0, 3, 3],
      ['sand-dev', 3, 0, 0],
    ]);
    expect(chart.horizon).toBe(3);
  });

  /**
   * An unestimated slice: zero days on the engine, two workdays on the paper.
   *
   * The engine's numbers are untouched — `duration`, `start` and `finish` are
   * what be-01 sent — and `drawnSpan` alone carries the assumption. See
   * {@link ASSUMED_UNESTIMATED_WORKDAYS}.
   */
  it('draws an unestimated slice across the assumed span, from its engine start', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 3), rowAt('sand', 3, 3)],
        slices: [
          sliceAt('strip-dev', 'strip', 0, 3),
          sliceAt('sand-dev', 'sand', 3, 3, { estimated: false }),
        ],
      }),
    );

    // Proof: `drawnSpan: slice.estimated ? slice.duration :
    // ASSUMED_UNESTIMATED_WORKDAYS` reverted to `drawnSpan: slice.duration` —
    // the zero-width tick this change exists to replace. **Both** tests here
    // failed: this one on `expected [ …, [ 'sand-dev', 3, 3, 0 ] ] to deeply
    // equal [ …, [ 'sand-dev', 3, 3, 2 ] ]`, and `stretches the horizon to hold
    // the assumed span` on `expected 3 to be 5`. Watched, 2026-08-09.
    expect(
      chart.bars.map((bar) => [bar.sliceId, bar.start, bar.duration, bar.drawnSpan, bar.estimated]),
    ).toEqual([
      ['strip-dev', 0, 3, 3, true],
      ['sand-dev', 3, 0, ASSUMED_UNESTIMATED_WORKDAYS, false],
    ]);
  });

  it('stretches the horizon to hold the assumed span, so the ghost bar has canvas', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 3), rowAt('sand', 3, 3)],
        slices: [
          sliceAt('strip-dev', 'strip', 0, 3),
          sliceAt('sand-dev', 'sand', 3, 3, { estimated: false }),
        ],
      }),
    );

    // Proof, of the horizon's own half: `Math.max(horizon, bar.finish,
    // bar.start + bar.drawnSpan)` cut back to `Math.max(horizon, bar.finish)`,
    // with the drawn span left in place — this test alone failed, on `expected
    // 3 to be 5`, and the two-day bar hung two workdays off the end of a canvas
    // that stopped at 3. Watched, 2026-08-09.
    expect(chart.horizon).toBe(3 + ASSUMED_UNESTIMATED_WORKDAYS);
  });

  it('draws nothing, and throws nothing, for a plan with no rows at all', () => {
    const chart = layOutGantt(planOf({}));

    expect(chart).toEqual({
      labels: [],
      bars: [],
      brackets: [],
      arrows: [],
      personLinks: [],
      notBeforeFlags: [],
      horizon: 1,
    });
  });
});

/**
 * The scale on its own, before any mark is placed through it.
 *
 * Every case below is taken at an offset **past the first weekend**, where the
 * calendar number and the workday number differ. A case at workday 3 passes
 * unchanged on the axis this replaces and so proves nothing.
 */
describe('the calendar scale', () => {
  /** The Monday every fixture in here begins on. */
  const MONDAY = '2026-08-10';

  it('keeps a fraction inside the workday it belongs to', () => {
    const scale = calendarScale(MONDAY);

    // Before any weekend has passed the two axes agree, fractions included: a
    // slice 3.5 workdays into the schedule is still 3.5 workdays into it.
    expect(scale.startOf(3.5)).toBe(3.5);
    expect(scale.startOf(4.75)).toBe(4.75);
  });

  it('jumps the weekend', () => {
    const scale = calendarScale(MONDAY);

    // Monday 2026-08-17 and Monday 2026-08-24 — the whole point of the change,
    // in three numbers.
    expect(scale.startOf(5)).toBe(7);
    expect(scale.startOf(5.25)).toBe(7.25);
    expect(scale.startOf(10)).toBe(14);
  });

  it('ends a span that finished on the Friday at the Saturday', () => {
    const scale = calendarScale(MONDAY);

    // A span 3 → 5 stops where the Friday stops, and its successor starting at
    // the same 5 stands at 7 — the Monday. The two readings differ by exactly
    // the weekend between them, which is the gap a reader sees.
    expect(scale.startOf(3)).toBe(3);
    expect(scale.endOf(5)).toBe(5);
    expect(scale.startOf(5)).toBe(7);
  });

  it('draws across a weekend a span runs through', () => {
    const scale = calendarScale(MONDAY);

    // 3 → 6 works on the Monday after, so the weekend is inside the span and
    // the bar is drawn over it rather than skipping it.
    expect(scale.endOf(6)).toBe(8);
  });

  it('begins a Saturday project on the Monday', () => {
    // The normalisation `addWorkdays` already makes, inherited rather than
    // re-implemented: a project starting Saturday 2026-08-08 answers exactly
    // like one starting on the Monday after it.
    const scale = calendarScale('2026-08-08');

    expect(scale.startOf(0)).toBe(0);
    expect(scale.startOf(5)).toBe(7);
    expect(scale.endOf(5)).toBe(5);
  });

  it('reads a drifted whole offset exactly as the whole day it is', () => {
    const scale = calendarScale(MONDAY);

    // The engine's chained doubles drift to either side of a whole day —
    // 1/6 + 49/6 + 4/6 arrives as 8.999999999999998 — and the scale must
    // answer what it answers for the whole day, or the chart stands a bar
    // almost a full calendar day away from the dates printed beside it.
    expect(scale.startOf(8.999999999999998)).toBe(scale.startOf(9));
    expect(scale.startOf(5.000000000000001)).toBe(scale.startOf(5));
    // The end reading has more to lose: a drifted 15.000000000000002 read as
    // fractional takes the *start* reading — the far side of the weekend —
    // instead of the end of day 14.
    expect(scale.endOf(15.000000000000002)).toBe(scale.endOf(15));
    expect(scale.endOf(8.999999999999998)).toBe(scale.endOf(9));
  });

  it('answers below zero rather than throwing', () => {
    const scale = calendarScale(MONDAY);

    // The band outside the schedule is canvas and not schedule time, and
    // `addWorkdays` refuses it. One calendar day per unit out there.
    expect(scale.startOf(-0.25)).toBe(-0.25);
    expect(scale.endOf(-0.25)).toBe(-0.25);
    expect(scale.startOf(0)).toBe(0);
    expect(scale.endOf(0)).toBe(0);
  });

  it('refuses a start date that is not a calendar date', () => {
    expect(() => calendarScale('2026-02-31')).toThrow(/not a calendar date/);
  });
});

/**
 * Every mark placed through the scale at once, which is the point: a mark left
 * on a workday number misaligns from the first weekend on, and only a fixture
 * that reaches past one can see it.
 */
describe('placing the chart on a calendar', () => {
  /** The Monday every fixture in here begins on. */
  const MONDAY = '2026-08-10';

  it('puts a bar at the calendar day its workday is', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 5, 8)],
        slices: [sliceAt('strip-dev', 'strip', 5, 8)],
      }),
    );

    const placed = placeOnCalendar(chart, MONDAY);

    // Workday 5 is Monday 2026-08-17, seven calendar days in, and the three
    // workdays after it are the Mon/Tue/Wed with no weekend among them.
    expect(placed.bars[0].x).toBe(7);
    expect(placed.bars[0].width).toBe(3);
    // And the engine's own bar rides along untouched, which is what
    // `data-start`/`data-finish` and every sentence are written from.
    expect(placed.bars[0].bar.start).toBe(5);
    expect(placed.bars[0].bar.finish).toBe(8);
    expect(chart.bars[0].start).toBe(5);
  });

  it('draws a bar across the weekend it works through, and not one it stops before', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 3, 5), rowAt('sand', 3, 6)],
        slices: [sliceAt('strip-dev', 'strip', 3, 5), sliceAt('sand-dev', 'sand', 3, 6)],
      }),
    );

    const placed = placeOnCalendar(chart, MONDAY);

    // 3 → 5 is the Thursday and the Friday: two days wide, with no weekend
    // tail. 3 → 6 works on the Monday after, so its bar is drawn over the
    // weekend inside it and is five days wide.
    expect([placed.bars[0].x, placed.bars[0].width]).toEqual([3, 2]);
    expect([placed.bars[1].x, placed.bars[1].width]).toEqual([3, 5]);
  });

  it('spans a bracket from its earliest start to its latest finish, on the calendar', () => {
    const chart = layOutGantt(
      planOf({
        rows: [
          rowAt('hull', 0, 6, { leaf: false }),
          rowAt('strip', 0, 3, { depth: 1 }),
          rowAt('sand', 2, 6, { depth: 1 }),
        ],
        slices: [sliceAt('strip-dev', 'strip', 0, 3), sliceAt('sand-dev', 'sand', 2, 6)],
      }),
    );

    const placed = placeOnCalendar(chart, MONDAY);

    expect(placed.brackets[0].from).toBe(0);
    expect(placed.brackets[0].to).toBe(8);
  });

  it('leaves a weekend between a predecessor’s finish and its successor’s start', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 5), rowAt('sand', 5, 7)],
        slices: [
          sliceAt('strip-dev', 'strip', 0, 5, { personId: 'kat' }),
          sliceAt('sand-dev', 'sand', 5, 7, {
            personId: 'kat',
            boundBy: 'person',
            resourcePredecessorId: 'strip-dev',
          }),
        ],
        dependencies: [{ predecessorId: 'strip', successorId: 'sand' }],
      }),
    );

    const placed = placeOnCalendar(chart, MONDAY);

    // The hand-off across a weekend, on both marks that draw one: the arrow
    // leaves the Friday's right edge at 5 and arrives at the Monday at 7, so
    // the two bars do not touch.
    expect([placed.arrows[0].fromX, placed.arrows[0].toX]).toEqual([5, 7]);
    expect([placed.personLinks[0].fromX, placed.personLinks[0].toX]).toEqual([5, 7]);
    expect(placed.bars[0].x + placed.bars[0].width).toBe(5);
    expect(placed.bars[1].x).toBe(7);
  });

  it('stands a not-before flag on the calendar day its workday is', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('sand', 5, 7, { notBeforeOffset: 5 })],
        slices: [sliceAt('sand-dev', 'sand', 5, 7)],
      }),
    );

    const placed = placeOnCalendar(chart, MONDAY);

    expect(placed.notBeforeFlags[0].x).toBe(7);
    // And the workday it holds at rides along, because the words the caret
    // shows are date arithmetic on that number and never on the coordinate.
    expect(placed.notBeforeFlags[0].workday).toBe(5);
  });

  it('reaches a horizon that holds an assumed span in calendar days', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('sand', 3, 3)],
        slices: [sliceAt('sand-dev', 'sand', 3, 3, { duration: 0, estimated: false })],
      }),
    );

    const placed = placeOnCalendar(chart, MONDAY);

    // Two workdays drawn from the Thursday is the Friday, and the horizon
    // stops there rather than at the workday number 3 the engine gave.
    expect(chart.horizon).toBe(3 + ASSUMED_UNESTIMATED_WORKDAYS);
    expect(placed.horizon).toBe(5);
    expect(placed.bars[0].width).toBe(2);
  });

  it('leaves a mark of no days standing where it starts, not behind it', () => {
    const chart = layOutGantt(
      planOf({
        // Everything here is on the Monday past the first weekend, where a
        // finish reading and a start reading are two calendar days apart: a
        // zero-day estimate, a parent projecting nothing, and an arrow leaving
        // that parent. Read as a finish alone, all three would be drawn at 5
        // — the Friday's edge — while the day they belong to is 7.
        rows: [
          rowAt('hull', 5, 5, { leaf: false }),
          rowAt('strip', 5, 5, { depth: 1 }),
          rowAt('sand', 5, 7),
        ],
        slices: [
          sliceAt('strip-dev', 'strip', 5, 5, { duration: 0 }),
          sliceAt('sand-dev', 'sand', 5, 7),
        ],
        dependencies: [{ predecessorId: 'hull', successorId: 'sand' }],
      }),
    );

    const placed = placeOnCalendar(chart, MONDAY);

    // The zero-day estimate keeps its zero width and stands on the Monday.
    expect([placed.bars[0].x, placed.bars[0].width]).toEqual([7, 0]);
    expect(placed.brackets[0]).toMatchObject({ from: 7, to: 7 });
    expect(placed.arrows[0].fromX).toBe(7);
  });

  it('places a plan with no start date on the workdays it came in on', () => {
    const chart = layOutGantt(
      planOf({
        rows: [
          rowAt('hull', 0, 7, { leaf: false }),
          rowAt('strip', 0, 5, { depth: 1 }),
          rowAt('sand', 5, 7, { depth: 1, notBeforeOffset: 5 }),
        ],
        slices: [sliceAt('strip-dev', 'strip', 0, 5), sliceAt('sand-dev', 'sand', 5, 7)],
        dependencies: [{ predecessorId: 'strip', successorId: 'sand' }],
      }),
    );

    const placed = placeOnWorkdays(chart);

    // Not a calendar at all: every number is the engine's own, which is what
    // the panel draws while a plan has no start date.
    expect([placed.bars[1].x, placed.bars[1].width]).toEqual([5, 2]);
    expect(placed.brackets[0].to).toBe(7);
    expect([placed.arrows[0].fromX, placed.arrows[0].toX]).toEqual([5, 5]);
    expect(placed.notBeforeFlags[0].x).toBe(5);
    expect(placed.horizon).toBe(chart.horizon);
  });
});
