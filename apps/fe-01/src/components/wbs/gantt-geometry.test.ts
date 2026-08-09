import { describe, expect, it } from 'vitest';

import {
  type BarColor,
  GanttDataError,
  type GanttPlan,
  type GanttRow,
  type GanttSlice,
  inkOn,
  layOutGantt,
  PERSON_BAR_COLORS,
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
  float: 0,
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
   * A slice of no days: real, and drawn as a mark of no width.
   *
   * The engine gives an unestimated pair zero days, and a zero-length slice
   * takes no place in the queue. The geometry keeps the bar — the row has to be
   * able to say the slice exists, and the panel draws a tick at its start
   * because a `<rect width="0">` paints nothing — but it takes no room on the
   * axis and moves the horizon nowhere.
   */
  it('keeps a zero-day slice as a bar of no width that takes no room', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 0, 3), rowAt('sand', 3, 3)],
        slices: [
          sliceAt('strip-dev', 'strip', 0, 3),
          sliceAt('sand-dev', 'sand', 3, 3, { estimated: false }),
        ],
      }),
    );

    expect(chart.bars.map((bar) => [bar.sliceId, bar.start, bar.duration])).toEqual([
      ['strip-dev', 0, 3],
      ['sand-dev', 3, 0],
    ]);
    expect(chart.horizon).toBe(3);
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
