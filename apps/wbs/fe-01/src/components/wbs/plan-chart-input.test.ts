import { addWorkdays } from '@wbs/domain/workday';
import { describe, expect, it } from 'vitest';

import type { PlanRead } from '@/lib/wbs-api';

import { planOf, rowAt, sliceAt } from './gantt-fixtures';
import { GanttDataError, layOutGantt } from './gantt-geometry';
import {
  chartAttemptNodes,
  chartTypedDependencies,
  elsewhereHoldersOf,
  factEndStopOf,
  heldLeafIdsOf,
  isHeld,
  markCount,
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

describe('isHeld (add-work-item-statuses)', () => {
  const leaf = (status: 'done' | 'on_hold' | 'unknown', hold: 'on_hold' | null) => ({
    status,
    hold,
    subRows: [],
  });

  it('puts On hold in a held leaf’s row even once it reads done', () => {
    expect(isHeld(leaf('done', 'on_hold'))).toBe(true);
    expect(isHeld(leaf('unknown', null))).toBe(false);
  });

  it('holds a parent only when every leaf beneath it is held', () => {
    const parent = (subRows: ReturnType<typeof leaf>[]) => ({
      status: 'on_hold' as const,
      hold: null,
      subRows,
    });
    expect(isHeld(parent([leaf('on_hold', 'on_hold'), leaf('done', 'on_hold')]))).toBe(true);
    expect(isHeld(parent([leaf('on_hold', 'on_hold'), leaf('unknown', null)]))).toBe(false);
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

it('counts marks as visible leaves times project steps', () => {
  expect(
    markCount(
      planOf({
        rows: [rowAt('branch', 0, 1, { leaf: false }), rowAt('a', 0, 1), rowAt('b', 0, 1)],
        steps: [
          { id: 'dev', name: 'Dev' },
          { id: 'review', name: 'Review' },
        ],
      }),
    ),
  ).toBe(4);
  expect(markCount(planOf({ rows: [] }))).toBe(0);
});

it('only eligible visible attempts count toward markCount and unavailable overlay adds no count', () => {
  const attempts = [
    {
      attemptNumber: 1,
      startedAt: 0,
      endedAt: 1,
      outcome: 'succeeded' as const,
      executorPersonId: null,
      reference: null,
      note: null,
    },
  ];
  const nodes = [{ id: 'sn', stepId: 'dev', reference: null, attempts }];
  const plan = planOf({
    startDate: '2026-08-10',
    timezone: 'UTC',
    rows: [
      rowAt('a', 0, 1, { attemptNodes: nodes }),
      rowAt('held', 0, 1, { held: true, attemptNodes: nodes }),
      rowAt('branch', 0, 1, { leaf: false, attemptNodes: nodes }),
      rowAt('unsliced', 0, 1, { attemptNodes: nodes }),
    ],
    slices: [sliceAt('a-dev', 'a', 0, 1), sliceAt('held-dev', 'held', 0, 1)],
  });
  expect(markCount(plan)).toBe(4);
  expect(markCount({ ...plan, timezone: null })).toBe(3);
  expect(markCount({ ...plan, startDate: null })).toBe(3);
  expect(markCount({ ...plan, rows: [] })).toBe(0);
});
it('attempts make 2500 forecast marks exceed the sub-day offer limit', () => {
  const rows = Array.from({ length: 2500 }, (_, index) => rowAt(String(index), 0, 1));
  rows[0] = {
    ...rows[0],
    attemptNodes: [
      {
        id: 'sn',
        stepId: 'dev',
        reference: null,
        attempts: [
          {
            attemptNumber: 1,
            startedAt: 0,
            endedAt: 1,
            outcome: 'succeeded',
            executorPersonId: null,
            reference: null,
            note: null,
          },
        ],
      },
    ],
  };
  expect(
    markCount(
      planOf({
        startDate: '2026-08-10',
        timezone: 'UTC',
        rows,
        slices: [sliceAt('0-dev', '0', 0, 1)],
      }),
    ),
  ).toBe(2501);
});

it('carries attempted node identity and rejects missing trusted references', () => {
  const attempts = [
    {
      attemptNumber: 1,
      startedAt: 0,
      endedAt: 1,
      outcome: 'failed' as const,
      executorPersonId: null,
      reference: null,
      note: null,
    },
  ];
  const row = { id: 'a', attempts: { dev: attempts } };
  expect(
    chartAttemptNodes(row, [{ id: 'sn', workItemId: 'a', stepId: 'dev', reference: '010.dev' }]),
  ).toEqual([{ id: 'sn', stepId: 'dev', reference: '010.dev', attempts }]);
  expect(() => chartAttemptNodes(row, [])).toThrow(GanttDataError);
  expect(chartAttemptNodes({ id: 'a' }, undefined)).toEqual([]);
});
