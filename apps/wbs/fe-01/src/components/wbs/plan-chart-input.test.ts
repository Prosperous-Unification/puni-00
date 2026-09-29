import { addWorkdays } from '@wbs/domain/workday';
import { describe, expect, it } from 'vitest';

import type { PlanRead } from '@/lib/wbs-api';

import { planOf, rowAt, sliceAt } from './gantt-fixtures';
import { GanttDataError, layOutGantt } from './gantt-geometry';
import {
  chartTypedDependencies,
  elsewhereHoldersOf,
  factEndStopOf,
  notBeforeOffsetOf,
} from './plan-chart-input';
import { chartReadOf } from './use-plan-read';

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

describe('the holders a plan read labels, on the chart', () => {
  // Only what `chartReadOf` reads; the rest of a plan read is not this test's.
  const read = {
    slices: [],
    steps: [],
    assignedPeople: [],
    depReach: 'whole-item',
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
    estimateRounding: 'ceil',
    elsewhereHolders: [
      {
        projectId: 'platform',
        projectName: 'Platform',
        workItemId: 'w-9',
        number: '010.3',
        name: 'Rewire',
      },
    ],
  } as unknown as PlanRead;

  it('carries each label from the read to the bar that waits for it', () => {
    const chart = layOutGantt(
      planOf({
        rows: [rowAt('strip', 2, 5)],
        slices: [
          sliceAt('strip-dev', 'strip', 2, 5, {
            personId: 'kat',
            boundBy: 'elsewhere',
            elsewhereHolder: { projectId: 'platform', workItemId: 'w-9' },
          }),
        ],
        personNames: new Map([['kat', 'Kat']]),
        elsewhereHolders: elsewhereHoldersOf(chartReadOf(read, 1).elsewhereHolders),
      }),
    );
    expect(chart.bars[0].floorWords).toBe('Waits for Kat to finish 010.3 Rewire in Platform');
  });

  it('reads no holders from a plan nothing outranks', () => {
    const outranked = { ...read, elsewhereHolders: undefined } as unknown as PlanRead;
    expect(chartReadOf(outranked, 1).elsewhereHolders).toEqual([]);
  });
});
