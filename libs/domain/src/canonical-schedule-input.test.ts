import { describe, expect, it } from 'bun:test';

import {
  canonicalScheduleInput,
  type ScheduleInput,
  scheduleInputHash,
} from './canonical-schedule-input';
import type { PlannedRow } from './derive-numbers';
import { serializeSchedule } from './fast-golden-corpus';
import { schedule, type Slice } from './schedule';

/**
 * Task 1.3, first half. **Every mutation case here asserts two things**: that
 * the hash moved, and what `schedule()` did about the same edit.
 *
 * A hash test that only compares two strings can pass while being wrong in
 * either direction. Too loose and it serves a stale schedule as current; too
 * strict and it evicts a cache on an edit that changes nothing, which is a
 * quiet performance bug nobody gets a red for. Running the engine in the same
 * `it` is what makes the difference visible, and it is cheap: these are
 * four-row plans.
 *
 * So the cases below come in three kinds, and the kind is stated per case:
 *
 * - **moves a placement** — hash differs AND the schedule differs. The pair
 *   the cache exists to keep apart.
 * - **deliberately stricter** — hash differs and the schedule is IDENTICAL
 *   today. Two of these, and both are load-bearing rather than sloppy: the
 *   fact is one a later edit turns into a placement, and hashing the resolved
 *   value instead would hide it.
 * - **must not move the hash** — hash equal AND the schedule equal. The
 *   asymmetry in (c) lives or dies on these.
 *
 * Still to land: `width` and `frozenNumber`, each of which needs its own base.
 * Both were written, run, and came back with a byte-identical schedule from
 * their own `not.toEqual` (run 12 chunk 3), so they are absent because they
 * were not proved rather than because they were forgotten. 1.9's `parentId`
 * reparenting and `stepId` identity swap are open too. The deadline case is
 * TASK-241's to make green —
 * `deadlines` is declared-pending here, proved present in the string and
 * proved inert in the engine, never silently skipped.
 */

const row = (
  id: string,
  parentId: string | null,
  position: number,
  priority: number | null,
): PlannedRow => ({ id, parentId, position, frozenNumber: null, priority });

const step = (
  workItemId: string,
  stepId: string | null,
  days: number | null,
  extra: Partial<Slice> = {},
): Slice => ({
  workItemId,
  stepId,
  days,
  personId: null,
  width: 1,
  poolIds: ['team'],
  ...extra,
});

/**
 * One plan, chosen so each mutation below has somewhere to move.
 *
 * `p` is a parent carrying a priority that binds nothing — every leaf under and
 * beside it carries its own, and `priorityByLeaf` takes the nearest ancestor
 * that has one (`schedule.ts:1447`). `a` has two steps, so the intra-item order
 * is a real order and `reach` has two arms to choose between. `b` waits for `a`,
 * which is what makes its floor and the pool size invisible until they clear
 * that edge — `c` is here for exactly that reason, unblocked and on the same
 * one-slot pool, so a floor above the predecessor and a second slot each have
 * somewhere to show.
 *
 * `c` was added after the first run: with `a → b` the only shape in the plan,
 * `the notBefore floor moved` and `the pool grew to two slots` both came back
 * with an IDENTICAL schedule and failed their own `not.toEqual` — 391 pass /
 * 2 fail at `b5e64717`. The hash was right in both; the fixture could not see
 * it, which is precisely what the second assertion is for.
 */
const BASE: ScheduleInput = {
  rows: [row('p', null, 10, 3), row('a', 'p', 1, 7), row('b', null, 20, 9), row('c', null, 30, 9)],
  edges: [{ predecessorId: 'a', successorId: 'b' }],
  slices: [step('a', 'design', 2), step('a', 'build', 3), step('b', null, 2), step('c', null, 2)],
  notBefore: new Map([['b', 1]]),
  poolSizes: new Map([['team', 1]]),
  reach: 'whole-item',
  deadlines: new Map(),
};

const run = (input: ScheduleInput): unknown =>
  serializeSchedule(
    schedule(input.rows, input.edges, input.slices, input.notBefore, input.poolSizes, input.reach),
  );

const movesAPlacement = (name: string, mutated: ScheduleInput): void => {
  it(`${name} — moves a placement, so the hash must move`, () => {
    expect(scheduleInputHash(mutated)).not.toBe(scheduleInputHash(BASE));
    expect(run(mutated)).not.toEqual(run(BASE));
  });
};

const mustNotMoveTheHash = (name: string, same: ScheduleInput): void => {
  it(`${name} — same schedule, so the hash must not move`, () => {
    expect(run(same)).toEqual(run(BASE));
    expect(scheduleInputHash(same)).toBe(scheduleInputHash(BASE));
  });
};

/**
 * A second base, for the one fact {@link BASE} structurally cannot see.
 *
 * `position` reaches a schedule only through `deriveNumbers`, and the number is
 * the **third of four** leveling tie-breaks (`schedule.ts:1902`) — so it decides
 * nothing unless two slices tie on priority, start and float first. Every leaf
 * in `BASE` carries its own priority, which is what makes its parent-priority
 * case work and what makes it blind here.
 *
 * This is the shape that isolates the tie, and it is the corpus case
 * `inverted-numbering-tie` in miniature: two leaves, no priority anywhere, one
 * pool slot between them, and the `rows` array declared in the opposite order to
 * `position` so the number and the plan's own order disagree. `node.at` is the
 * slice index **within** a work item (`schedule.ts:1813`), so with one slice
 * each both are 0 and the number is the only line in `goesFirst` that separates
 * them.
 */
const TIED: ScheduleInput = {
  rows: [row('x', null, 20, null), row('y', null, 10, null)],
  edges: [],
  slices: [step('x', null, 2), step('y', null, 2)],
  notBefore: new Map(),
  poolSizes: new Map([['team', 1]]),
  reach: 'whole-item',
  deadlines: new Map(),
};

describe('canonicalScheduleInput / scheduleInputHash', () => {
  it('is a 64-character hex digest, and the same input twice is the same digest', () => {
    const digest = scheduleInputHash(BASE);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(scheduleInputHash(BASE)).toBe(digest);
  });

  /**
   * The check-that-cannot-fail guard, R5. `JSON.stringify` renders a `Map` as
   * `{}`, so a canonicalizer that passed `notBefore`, `poolSizes` or
   * `deadlines` straight through would hash three empty objects and every plan
   * with the same rows would collide. These read the values rather than the
   * shape.
   */
  it('puts every one of the seven arguments in the string, maps included', () => {
    const canonical = canonicalScheduleInput({
      ...BASE,
      deadlines: new Map([['b', 9]]),
    });
    expect(canonical).toContain('"notBefore":[["b",1]]');
    expect(canonical).toContain('"poolSizes":[["team",1]]');
    expect(canonical).toContain('"deadlines":[["b",9]]');
    expect(canonical).toContain('"reach":"whole-item"');
    expect(canonical).toContain('"frozenNumber":null');
    expect(canonical).not.toContain('{}');
  });

  describe('mutations that move a placement', () => {
    movesAPlacement('two slices of one work item swapped', {
      ...BASE,
      slices: [
        step('a', 'build', 3),
        step('a', 'design', 2),
        step('b', null, 2),
        step('c', null, 2),
      ],
    });

    /**
     * `null` is "nobody has estimated this" and spends
     * {@link ASSUMED_SLICE_WORKDAYS}; `0` is "estimated, and it is nothing" and
     * spends no time and no slot. A canonical form that let `??` collapse them
     * would serve one plan's schedule for the other.
     */
    movesAPlacement('days null is not days zero', {
      ...BASE,
      slices: [
        step('a', 'design', null),
        step('a', 'build', 3),
        step('b', null, 2),
        step('c', null, 2),
      ],
    });

    movesAPlacement('depReach flipped to anchor-slice', { ...BASE, reach: 'anchor-slice' });

    movesAPlacement('the notBefore floor moved above the predecessor', {
      ...BASE,
      notBefore: new Map([['b', 9]]),
    });

    movesAPlacement('the pool grew to two slots', {
      ...BASE,
      poolSizes: new Map([['team', 2]]),
    });

    /**
     * A named assignee is a queue of one, and it is a floor the pool does not
     * supply: `c` and `a`'s build sit on opposite sides of the plan's only edge,
     * so nothing keeps them off each other until one person holds both.
     */
    movesAPlacement('one person put on two slices that did not share one', {
      ...BASE,
      slices: [
        step('a', 'design', 2),
        step('a', 'build', 3, { personId: 'kat' }),
        step('b', null, 2),
        step('c', null, 2, { personId: 'kat' }),
      ],
    });

    movesAPlacement('an estimate changed', {
      ...BASE,
      slices: [
        step('a', 'design', 2),
        step('a', 'build', 4),
        step('b', null, 2),
        step('c', null, 2),
      ],
    });

    movesAPlacement('an authored edge added', {
      ...BASE,
      edges: [
        { predecessorId: 'a', successorId: 'b' },
        { predecessorId: 'c', successorId: 'a' },
      ],
    });

    /**
     * `position`, on {@link TIED}, because it reaches a placement only through
     * the number tie-break. The proof is the swap: make the number order agree
     * with the array order instead of contradicting it, and the slice that was
     * going first stops going first.
     */
    it('position swapped between two tied leaves — moves a placement, so the hash must move', () => {
      const mutated: ScheduleInput = {
        ...TIED,
        rows: [row('x', null, 10, null), row('y', null, 20, null)],
      };
      expect(scheduleInputHash(mutated)).not.toBe(scheduleInputHash(TIED));
      expect(run(mutated)).not.toEqual(run(TIED));
    });
  });

  describe('mutations the hash is deliberately stricter about than today’s engine', () => {
    /**
     * The as-written priority on a parent that binds no leaf. Every leaf
     * carries its own priority, so `priorityByLeaf` never reaches `p` and the
     * schedule is byte-identical — and it stays that way only until somebody
     * clears `a`'s priority or moves a work item under `p`. Hashing the
     * resolved leaf priority instead would leave every cached row for this
     * project matching its key across an edit that changes what the project
     * means.
     */
    it('a parent’s as-written priority, which binds no leaf today', () => {
      const mutated: ScheduleInput = {
        ...BASE,
        rows: [
          row('p', null, 10, 4),
          row('a', 'p', 1, 7),
          row('b', null, 20, 9),
          row('c', null, 30, 9),
        ],
      };
      expect(run(mutated)).toEqual(run(BASE));
      expect(scheduleInputHash(mutated)).not.toBe(scheduleInputHash(BASE));
    });

    /**
     * The seventh argument, declared-pending for TASK-241. `schedule()` has six
     * parameters today, so a deadline cannot move a placement here and this
     * case asserts exactly that rather than pretending otherwise: present in
     * the string, inert in the engine. When TASK-241 lands the field and Fast's
     * earliest-effective-deadline tie-break, this case moves up to
     * `movesAPlacement` and the `toEqual` below is the line that fails first.
     */
    it('a deadline, which the engine cannot yet read (TASK-241)', () => {
      const mutated: ScheduleInput = { ...BASE, deadlines: new Map([['b', 3]]) };
      expect(run(mutated)).toEqual(run(BASE));
      expect(scheduleInputHash(mutated)).not.toBe(scheduleInputHash(BASE));
    });
  });

  describe('facts that must not move the hash', () => {
    /**
     * The (c) asymmetry, and the reason it is not a rounding error. The global
     * slice order is whatever `WorkItemRepo.listByProject` returned and it has
     * no `ORDER BY`, so hashing it made one unchanged project hash two ways
     * between reads. Grouping by work item and ordering the groups is what
     * makes this stable; preserving each group's own order is what keeps the
     * swap case above red.
     */
    mustNotMoveTheHash('the global slice order across work items', {
      ...BASE,
      slices: [
        step('c', null, 2),
        step('b', null, 2),
        step('a', 'design', 2),
        step('a', 'build', 3),
      ],
    });

    mustNotMoveTheHash('the rows array reordered into the same tree', {
      ...BASE,
      rows: [
        row('c', null, 30, 9),
        row('b', null, 20, 9),
        row('p', null, 10, 3),
        row('a', 'p', 1, 7),
      ],
    });

    /** `poolIds` is a set: `jointWindowFor` waits for the same pools either way. */
    mustNotMoveTheHash('poolIds reordered, and a duplicate in them', {
      ...BASE,
      slices: [
        step('a', 'design', 2, { poolIds: ['team', 'team'] }),
        step('a', 'build', 3),
        step('b', null, 2),
        step('c', null, 2),
      ],
    });
  });

  /**
   * The engine's own refusals, not a second copy of them. A canonicalizer that
   * accepted input `schedule()` throws on would hand out a cache key for a call
   * that cannot run, and the first thing anybody would do with that key is
   * write a row under it.
   */
  it('refuses a slice for something that is not a leaf, exactly as schedule() does', () => {
    const orphaned: ScheduleInput = { ...BASE, slices: [step('p', null, 2)] };
    expect(() => canonicalScheduleInput(orphaned)).toThrow(/not a leaf/);
    expect(() => run(orphaned)).toThrow(/not a leaf/);
  });
});
