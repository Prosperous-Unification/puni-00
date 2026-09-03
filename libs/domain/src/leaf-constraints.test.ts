import { describe, expect, it } from 'bun:test';

import { leafDeadlinesOf, leafFloorsOf } from './leaf-constraints';
import type { PlannedRow } from './derive-numbers';
import { indexTree } from './schedule';

/** A grandparent, a parent under it, and two leaves under the parent. */
const rows: readonly PlannedRow[] = [
  { id: 'G', parentId: null, position: 0, frozenNumber: null, priority: null },
  { id: 'P', parentId: 'G', position: 0, frozenNumber: null, priority: null },
  { id: 'L1', parentId: 'P', position: 0, frozenNumber: null, priority: null },
  { id: 'L2', parentId: 'P', position: 1, frozenNumber: null, priority: null },
  { id: 'X', parentId: null, position: 1, frozenNumber: null, priority: null },
];
const index = indexTree(rows);

describe('leafFloorsOf', () => {
  it('carries a floor written on a parent down to every leaf beneath it', () => {
    expect([...leafFloorsOf(new Map([['P', 4]]), index)]).toEqual([
      ['L1', 4],
      ['L2', 4],
    ]);
  });

  it('keeps each leaf the LATEST of its own floor and every ancestor’s', () => {
    // The defect this rule exists for, in one assertion: a copy-down would give
    // L1 the parent's day 3 and lose its own day 9. `Math.max`, never a
    // copy-down — watched failing 2026-08-10 in `schedule-shapes.test.ts`.
    const floors = leafFloorsOf(
      new Map([
        ['P', 3],
        ['L1', 9],
      ]),
      index,
    );
    expect(floors.get('L1')).toBe(9);
    expect(floors.get('L2')).toBe(3);
  });

  it('reaches two levels down, from a grandparent', () => {
    const floors = leafFloorsOf(new Map([['G', 6]]), index);
    expect(floors.get('L1')).toBe(6);
    expect(floors.get('L2')).toBe(6);
  });

  it('leaves a leaf no floor reaches out of the map entirely', () => {
    // Absence is the unconstrained state, and it is the common one: callers
    // read it as day zero. Present-with-a-zero would be the same number and a
    // different fact.
    expect(leafFloorsOf(new Map([['P', 4]]), index).has('X')).toBe(false);
    expect([...leafFloorsOf(new Map(), index)]).toEqual([]);
  });

  it('floors at day zero, because a start before day zero has no representation', () => {
    expect(leafFloorsOf(new Map([['L1', -5]]), index).get('L1')).toBe(0);
  });

  it('ignores an id the tree does not carry rather than throwing', () => {
    // A floor on a deleted row is stale data, not a corrupt plan: it binds
    // nothing because nothing is beneath it.
    expect([...leafFloorsOf(new Map([['gone', 7]]), index)]).toEqual([]);
  });
});

describe('leafDeadlinesOf', () => {
  it('carries a deadline written on a parent down to every leaf beneath it', () => {
    expect([...leafDeadlinesOf(new Map([['P', 20]]), index)]).toEqual([
      ['L1', 20],
      ['L2', 20],
    ]);
  });

  it('keeps each leaf the EARLIEST of its own deadline and every ancestor’s', () => {
    // The mirror of the floor rule and the whole reason the two functions are
    // not one with a comparator argument. `Math.max` here would let a loose
    // parent date RELAX a child's own — a constraint an edit above can only
    // ever weaken is not a deadline.
    const deadlines = leafDeadlinesOf(
      new Map([
        ['P', 20],
        ['L1', 12],
      ]),
      index,
    );
    expect(deadlines.get('L1')).toBe(12);
    expect(deadlines.get('L2')).toBe(20);
  });

  it('takes the tighter ancestor when two of them bind', () => {
    const deadlines = leafDeadlinesOf(
      new Map([
        ['G', 30],
        ['P', 18],
      ]),
      index,
    );
    expect(deadlines.get('L1')).toBe(18);
    expect(deadlines.get('L2')).toBe(18);
  });

  it('leaves an unconstrained leaf absent and does NOT seed it with zero', () => {
    // The one place the two folds must disagree. A floor's identity is day
    // zero; a deadline has none, so absence is the answer and the wire spells
    // it `deadlineUnits: null`. A zero seed would make every unconstrained plan
    // instantly infeasible.
    const deadlines = leafDeadlinesOf(new Map([['L1', 12]]), index);
    expect(deadlines.has('L2')).toBe(false);
    expect(deadlines.has('X')).toBe(false);
    expect([...leafDeadlinesOf(new Map(), index)]).toEqual([]);
  });

  it('keeps a day-zero deadline, which is a real and very tight constraint', () => {
    // Guards the `?? 0`-shaped mistake from the other side: written with an
    // `own ?? Infinity` seed this still passes, but written with `own ?? 0` —
    // the floor's own idiom — day zero would win every later comparison.
    const deadlines = leafDeadlinesOf(
      new Map([
        ['P', 0],
        ['L1', 12],
      ]),
      index,
    );
    expect(deadlines.get('L1')).toBe(0);
    expect(deadlines.get('L2')).toBe(0);
  });

  it('ignores an id the tree does not carry rather than throwing', () => {
    expect([...leafDeadlinesOf(new Map([['gone', 7]]), index)]).toEqual([]);
  });
});
