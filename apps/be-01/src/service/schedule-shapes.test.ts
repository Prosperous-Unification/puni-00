import { describe, expect, it } from 'bun:test';

import type { WorkItem } from '../repository';
import type { DependencyEdge, Slice } from './schedule';
import { schedule, sliceKey } from './schedule';

/**
 * Graph shapes the scheduling engine has to hold: diamonds, ties, deep parent
 * expansion, degenerate edges, and the arithmetic over long chains. The basics
 * — chains, fan-in, floats on a two-branch plan — live in `schedule.test.ts`;
 * this file is the shapes that file does not draw.
 */

const DEV = 'role-dev';

let position = 0;
const item = (id: string, parentId: string | null = null): WorkItem => ({
  id,
  projectId: 'p1',
  parentId,
  position: (position += 10),
  name: id,
  notes: '',
  frozenNumber: null,
  startNoEarlierThan: null,
  serviceTeamId: null,
  revision: 0,
});

const edge = (predecessorId: string, successorId: string): DependencyEdge => ({
  predecessorId,
  successorId,
});

/** One unassigned slice per leaf, from a `days` record; a missing id is unestimated. */
const plan = (
  rows: readonly WorkItem[],
  edges: readonly DependencyEdge[],
  days: Record<string, number>,
  notBefore?: ReadonlyMap<string, number>,
) => {
  const childless = new Set(rows.map((row) => row.parentId).filter((id) => id !== null));
  const slices: Slice[] = rows
    .filter((row) => !childless.has(row.id))
    .map((row) => ({
      workItemId: row.id,
      roleId: DEV,
      days: row.id in days ? days[row.id] : null,
      personId: null,
    }));
  return schedule(rows, edges, slices, notBefore);
};

describe('shapes — a diamond', () => {
  /**
   * ```
   *        ┌→ b (3) ─┐
   * a (2) ─┤         ├→ d (1)
   *        └→ c (5) ─┘
   * ```
   * One path through `c` is the long one; `b` rides beside it with two days
   * of room.
   */
  const diamond = () =>
    plan(
      [item('a'), item('b'), item('c'), item('d')],
      [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')],
      { a: 2, b: 3, c: 5, d: 1 },
    ).workItems;

  it('joins the fan back in at the later branch', () => {
    const found = diamond();

    expect(found.get('d')).toMatchObject({ earliestStart: 7, earliestFinish: 8 });
  });

  it('marks exactly the long path critical, and no other row', () => {
    const found = diamond();

    expect(found.get('a')).toMatchObject({ float: 0, critical: true });
    expect(found.get('c')).toMatchObject({ float: 0, critical: true });
    expect(found.get('d')).toMatchObject({ float: 0, critical: true });
    expect(found.get('b')).toMatchObject({ latestStart: 4, float: 2, critical: false });
  });
});

describe('shapes — a critical-path tie', () => {
  it('marks both of two equally long paths critical', () => {
    // Two three-day predecessors of one join: neither can slip, so a plan that
    // painted only one red would be telling the reader the other has room.
    const found = plan([item('a'), item('b'), item('c')], [edge('a', 'c'), edge('b', 'c')], {
      a: 3,
      b: 3,
      c: 1,
    }).workItems;

    expect(found.get('a')).toMatchObject({ float: 0, critical: true });
    expect(found.get('b')).toMatchObject({ float: 0, critical: true });
    expect(found.get('c')).toMatchObject({ float: 0, critical: true });
  });
});

describe('shapes — a dependency between two nested branches', () => {
  /**
   * ```
   * P                Q
   *   C1               D1
   *     L1 (2)           M1 (3)
   *     L2 (4)           M2 (1)
   *   L3 (1)
   * ```
   * `P → Q`, declared at the top: the whole of one branch before the whole of
   * the other, through a parent on **both** sides and a second level of
   * nesting under each.
   */
  const branches = () =>
    plan(
      [
        item('P'),
        item('C1', 'P'),
        item('L1', 'C1'),
        item('L2', 'C1'),
        item('L3', 'P'),
        item('Q'),
        item('D1', 'Q'),
        item('M1', 'D1'),
        item('M2', 'D1'),
      ],
      [edge('P', 'Q')],
      { L1: 2, L2: 4, L3: 1, M1: 3, M2: 1 },
    ).workItems;

  it('holds every leaf under the successor until every leaf under the predecessor is done', () => {
    const found = branches();

    // `L2` is the last of `P`'s leaves to finish, two levels down.
    expect(found.get('M1')).toMatchObject({ earliestStart: 4, earliestFinish: 7 });
    expect(found.get('M2')).toMatchObject({ earliestStart: 4, earliestFinish: 5 });
  });

  it('spans both parents over what their leaves actually do', () => {
    const found = branches();

    expect(found.get('P')).toMatchObject({ earliestStart: 0, earliestFinish: 4 });
    expect(found.get('Q')).toMatchObject({ earliestStart: 4, earliestFinish: 7 });
    expect(found.get('D1')).toMatchObject({ earliestStart: 4, earliestFinish: 7 });
  });
});

describe('shapes — degenerate edges the engine must refuse', () => {
  it('throws on a work item depending on itself', () => {
    // The write path refuses this as `ancestor`; the engine has to refuse it
    // too, because a restored database is under no such guard.
    expect(() => plan([item('a')], [edge('a', 'a')], { a: 1 })).toThrow(/cycle/i);
  });

  it('backstops a stored parent→own-nested-leaf edge the write path would have refused', () => {
    // Honestly: this edge can only reach the engine from outside the API — a
    // restored or hand-edited database — because `canDepend` refuses it as
    // `ancestor` at the write path (`dependency.test.ts`, 'refuses an ancestor
    // more than one level up, in both directions'). What the engine sees is
    // not "an ancestor": `expandToLeaves` turns `P → L` into, among the pairs,
    // `L → L` — a self-loop — and the topological sort throws on that
    // artifact. A backstop, not the guard.
    const rows = [item('P'), item('C', 'P'), item('L', 'C'), item('other', 'P')];

    expect(() => plan(rows, [edge('P', 'L')], { L: 1, other: 1 })).toThrow(/cycle/i);
  });

  it('backstops the same stored edge drawn upward, leaf onto ancestor', () => {
    // As above: the write path's `ancestor` refusal is the guard; the engine
    // only ever sees the expansion's `L → L` self-loop and throws on that.
    const rows = [item('P'), item('C', 'P'), item('L', 'C'), item('other', 'P')];

    expect(() => plan(rows, [edge('L', 'P')], { L: 1, other: 1 })).toThrow(/cycle/i);
  });

  it('throws on a cycle closed through three work items', () => {
    const rows = [item('a'), item('b'), item('c')];

    expect(() =>
      plan(rows, [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')], { a: 1, b: 1, c: 1 }),
    ).toThrow(/cycle/i);
  });
});

describe('shapes — an estimate of zero is not an absent one', () => {
  it('schedules a zero-day leaf as estimated and instant', () => {
    // Somebody looked and said "no time at all" — a milestone. The number is
    // the same as nobody having looked; the fact is the opposite one.
    const found = plan([item('gate'), item('after')], [edge('gate', 'after')], {
      gate: 0,
      after: 2,
    }).workItems;

    expect(found.get('gate')).toMatchObject({
      duration: 0,
      estimated: true,
      earliestStart: 0,
      earliestFinish: 0,
    });
    expect(found.get('after')).toMatchObject({ earliestStart: 0, earliestFinish: 2 });
  });
});

describe('shapes — a manual floor beside a dependency', () => {
  it('lets the later dependency swallow the floor, and names the dependency', () => {
    // The floor is a floor, not a pin: day 2 is already past when the five-day
    // predecessor lets go, so the floor decided nothing and must not be named.
    const rows = [item('a'), item('b')];
    const found = plan(rows, [edge('a', 'b')], { a: 5, b: 1 }, new Map([['b', 2]]));

    expect(found.workItems.get('b')).toMatchObject({ earliestStart: 5 });
    expect(found.slices.get(sliceKey('b', DEV))).toMatchObject({ boundBy: 'predecessor' });
  });

  it('lets the floor win when it is the later of the two, and names the floor', () => {
    const rows = [item('a'), item('b')];
    const found = plan(rows, [edge('a', 'b')], { a: 1, b: 1 }, new Map([['b', 6]]));

    expect(found.workItems.get('b')).toMatchObject({ earliestStart: 6 });
    expect(found.slices.get(sliceKey('b', DEV))).toMatchObject({ boundBy: 'notBefore' });
  });

  it('carries a grandparent’s floor two levels down to the leaf', () => {
    // Three tiers, a floor on every one, the grandparent's the latest: the
    // leaf takes day 6, not its own day 3 and not the parent's day 1. One
    // level of expansion is not the fix — the floor walks the whole tree.
    const rows = [item('G'), item('P', 'G'), item('L', 'P')];
    const floors = new Map([
      ['G', 6],
      ['P', 1],
      ['L', 3],
    ]);
    const found = plan(rows, [], { L: 2 }, floors);

    expect(found.workItems.get('L')).toMatchObject({ earliestStart: 6, earliestFinish: 8 });
    expect(found.slices.get(sliceKey('L', DEV))).toMatchObject({ boundBy: 'notBefore' });
  });

  it('composes ancestor floors with a dependency, each leaf keeping its own maximum', () => {
    // Grandparent → parent → two leaves, a different floor at every level,
    // and a five-day predecessor onto the parent — later than every floor on
    // `L1`, earlier than `L2`'s own. `L1` starts when the dependency lets go
    // and names it; `L2`'s own day-9 floor survives every ancestor's earlier
    // one — the case a naive copy-down (parent overwrites child) gets wrong —
    // and names `notBefore`. `L2`'s floor is listed **first**: a copy-down
    // only shows when an ancestor iterates after the child, and nothing about
    // the map promises parents come first.
    const rows = [item('pre'), item('G'), item('P', 'G'), item('L1', 'P'), item('L2', 'P')];
    const floors = new Map([
      ['L2', 9],
      ['G', 2],
      ['P', 3],
      ['L1', 4],
    ]);
    const found = plan(rows, [edge('pre', 'P')], { pre: 5, L1: 1, L2: 1 }, floors);

    expect(found.workItems.get('L1')).toMatchObject({ earliestStart: 5, earliestFinish: 6 });
    expect(found.slices.get(sliceKey('L1', DEV))).toMatchObject({ boundBy: 'predecessor' });
    expect(found.workItems.get('L2')).toMatchObject({ earliestStart: 9, earliestFinish: 10 });
    expect(found.slices.get(sliceKey('L2', DEV))).toMatchObject({ boundBy: 'notBefore' });
  });
});

describe('shapes — arithmetic over a long chain', () => {
  it('keeps a forty-day chain of whole days exactly whole', () => {
    // Whole days must never acquire a fraction, however many additions they go
    // through: `toBe`, not `toBeCloseTo`, is the assertion.
    const rows: WorkItem[] = [];
    const edges: DependencyEdge[] = [];
    const days: Record<string, number> = {};
    for (let at = 0; at < 40; at += 1) {
      const id = `link-${String(at)}`;
      rows.push(item(id));
      days[id] = 1;
      if (at > 0) edges.push(edge(`link-${String(at - 1)}`, id));
    }

    const found = plan(rows, edges, days).workItems;

    expect(found.get('link-39')).toMatchObject({ earliestStart: 39, earliestFinish: 40 });
    expect(found.get('link-39')).toMatchObject({ float: 0, critical: true });
    expect(found.get('link-0')).toMatchObject({ float: 0, critical: true });
  });

  it('accumulates PERT sixths across a chain to within a bit, not to the bit', () => {
    // Three PERT finals of 45/6, 25/6 and 20/6 days — the trios 0/8/13, 3/4/6
    // and 0/3/8. The exact sum is 15 and the doubles land a few ULPs off it,
    // because a chain accumulates `finish = start + days` across work items
    // and the engine's anchoring — deliberately — reaches only within one work
    // item. The engine reports its arithmetic verbatim; the calendar boundary
    // (`snapWorkdays`, in `datesOf` and `addWorkdays`) absorbs the drift with
    // a 1e-9 window, so what matters — and what is asserted — is the bound
    // that window rests on: the drift is real but stays orders of magnitude
    // inside it. Pinning the exact drifted double (15.000000000000002, as this
    // test first did) would assert one platform's rounding, not the contract.
    const rows = [item('a'), item('b'), item('c')];
    const found = plan(rows, [edge('a', 'b'), edge('b', 'c')], {
      a: 45 / 6,
      b: 25 / 6,
      c: 20 / 6,
    }).workItems;

    const finish = found.get('c')?.earliestFinish ?? NaN;
    expect(finish).not.toBe(15);
    expect(Math.abs(finish - 15)).toBeLessThan(1e-9);
  });

  it('answers a drifted negative float when a notBefore floor ends the project — pinned, not endorsed', () => {
    // A floor at day 13 stands a 23/6-day row past everything else in the
    // plan, so that row *is* the project finish — and the engine reports it
    // with a float of about -1.8e-15 and `critical: false`. The backward pass
    // reconstructs `latestStart` as `projectFinish - days`, and
    // `(13 + 23/6) - 23/6` is not 13 in doubles; the tight-path rule that
    // catches exactly this is scoped to plans with resource queues on
    // purpose (see `lateTimes` — a plan with nobody assigned must answer what
    // the engine before leveling answered, drift included).
    //
    // This test PINS that answer; it does not endorse it. The project's own
    // last row reporting negative slack and no red is a defect of the
    // reported float, held here so the day it changes is a deliberate one
    // rather than a silent side effect. The bound mirrors the chain test
    // above: the drift is real, nonzero, and orders of magnitude inside the
    // 1e-9 snap window that keeps it off the calendar.
    const rows = [item('done-early'), item('floored')];
    const found = plan(rows, [], { 'done-early': 3, floored: 23 / 6 }, new Map([['floored', 13]]));

    const floored = found.workItems.get('floored');
    if (floored === undefined) throw new Error('the floored row is not in the plan');
    // The floor held, and the row ends the project.
    expect(floored.earliestStart).toBe(13);
    expect(floored.earliestFinish).toBeGreaterThan(
      found.workItems.get('done-early')?.earliestFinish ?? NaN,
    );
    expect(found.slices.get(sliceKey('floored', DEV))).toMatchObject({ boundBy: 'notBefore' });
    // The pinned answer: negative by an IEEE-subtraction bit, and therefore
    // not critical.
    expect(floored.float).toBeLessThan(0);
    expect(floored.float).toBeGreaterThan(-1e-9);
    expect(floored.critical).toBe(false);
  });
});
