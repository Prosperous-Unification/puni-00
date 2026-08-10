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

  it('throws on an edge from a parent onto its own nested leaf', () => {
    // Expansion turns `P → L` into `L → L` among the pairs: a leaf in front of
    // itself, which is a cycle of one.
    const rows = [item('P'), item('C', 'P'), item('L', 'C'), item('other', 'P')];

    expect(() => plan(rows, [edge('P', 'L')], { L: 1, other: 1 })).toThrow(/cycle/i);
  });

  it('throws on the same edge drawn upward, leaf onto ancestor', () => {
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
    // and 0/3/8. The exact sum is 15; the doubles say 15.000000000000002,
    // because a chain accumulates `finish = start + days` across work items
    // and the engine's anchoring — deliberately — reaches only within one work
    // item. This test records that behaviour as it stands; where the extra bit
    // becomes a whole printed day is `work-item.service.test.ts`'s DEFECT
    // case, and this assertion is the bit it grows from.
    const rows = [item('a'), item('b'), item('c')];
    const found = plan(rows, [edge('a', 'b'), edge('b', 'c')], {
      a: 45 / 6,
      b: 25 / 6,
      c: 20 / 6,
    }).workItems;

    expect(found.get('c')?.earliestFinish).toBeCloseTo(15, 12);
    expect(found.get('c')?.earliestFinish).toBe(15.000000000000002);
  });
});
