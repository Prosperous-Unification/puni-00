import { addWorkdays } from '@wbs/domain/workday';
import { describe, expect, it } from 'vitest';

import { GanttDataError } from './gantt-geometry';
import {
  chartTypedDependencies,
  factEndStopOf,
  heldLeafIdsOf,
  notBeforeOffsetOf,
} from './plan-chart-input';

it('refuses an unknown typed chart relationship', () => {
  expect(() =>
    chartTypedDependencies([
      {
        id: 'future',
        type: 'SF',
        predecessor: { scope: 'whole', workItemId: 'A' },
        successor: { scope: 'whole', workItemId: 'B' },
      },
    ]),
  ).toThrow(GanttDataError);
});

it.each(['SS', 'FF'] as const)('reads a %s chart relationship', (type) => {
  expect(
    chartTypedDependencies([
      {
        id: 'typed',
        type,
        predecessor: { scope: 'whole', workItemId: 'A' },
        successor: { scope: 'whole', workItemId: 'B' },
      },
    ]),
  ).toMatchObject([{ type }]);
});

/** A Monday, so the weekend cases below have one to roll over. */
const START = '2026-08-10';

describe('factEndStopOf', () => {
  it('stops one past the last workday the fact end names', () => {
    // `addWorkdays`' own inverse plus one: a bar drawn to this stop covers the
    // fact end's whole day, in the engine's exclusive-finish sense.
    expect(factEndStopOf(START, addWorkdays(START, 3))).toBe(4);
    expect(factEndStopOf(START, addWorkdays(START, 0))).toBe(1);
  });

  it('rolls a weekend fact end back to the Friday, never forward to the Monday', () => {
    // 2026-08-15 is a Saturday. `workdaysBetween` — the not-before's reader —
    // would answer the Monday's offset and draw a bar through a weekend nobody
    // worked; `deadlineOffsetOf` rolls back.
    //
    // Proof: `deadlineOffsetOf` replaced by `workdaysBetween`, and this fails on
    // `expected 6 to be 5`; watched 2026-09-12.
    expect(factEndStopOf(START, '2026-08-15')).toBe(factEndStopOf(START, '2026-08-14'));
    expect(factEndStopOf(START, '2026-08-15')).toBe(5);
  });

  it('stops at day zero for work finished before the plan began', () => {
    expect(factEndStopOf(START, '2026-08-01')).toBe(0);
  });

  it('places nothing without a fact end or without a calendar', () => {
    expect(factEndStopOf(START, null)).toBeNull();
    expect(factEndStopOf(null, '2026-08-14')).toBeNull();
  });
});

describe('notBeforeOffsetOf, as the fact start’s reader', () => {
  it('places a fact start on the workday it names', () => {
    expect(notBeforeOffsetOf(START, addWorkdays(START, 2))).toBe(2);
    expect(notBeforeOffsetOf(null, '2026-08-12')).toBeNull();
  });
});

describe('heldLeafIdsOf (add-work-item-statuses)', () => {
  it('names every leaf whose stored hold is on hold, a held leaf later marked done included', () => {
    const held = heldLeafIdsOf([
      { id: 'branch', subRows: [{ id: 'x' }], status: 'on_hold', hold: null },
      { id: 'strip', subRows: [], status: 'done', hold: 'on_hold' },
      { id: 'sand', subRows: [], status: 'blocked', hold: 'blocked' },
      { id: 'paint', subRows: [], status: 'unknown', hold: null },
    ]);
    expect([...held]).toEqual(['strip']);
  });
});
