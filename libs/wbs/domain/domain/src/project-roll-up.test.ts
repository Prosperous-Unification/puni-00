import { expect, test } from 'bun:test';

import type { WorkPackageRollUp } from './work-package-roll-up';
import * as rollUps from './work-package-roll-up';

function child(overrides: Partial<WorkPackageRollUp> = {}): WorkPackageRollUp {
  return {
    kind: 'rolled_up',
    dates: null,
    finalTotal: 0,
    status: 'unknown',
    counts: {
      byStatus: {
        unknown: 0,
        draft: 0,
        ready: 0,
        in_progress: 0,
        blocked_by_proxy: 0,
        on_hold: 0,
        blocked: 0,
        done: 0,
      },
      leaves: 0,
      estimated: 0,
    },
    scheduleError: null,
    waitingForPerson: 0,
    waitingForCapacity: 0,
    displayed: 'fast',
    workPackageRevision: 3,
    seq: 7,
    ...overrides,
  };
}

test('project totals span child dates and add effort and leaf counts without inventing one engine or revision', () => {
  const first = child({
    dates: { startsOn: '2026-11-02', endsOn: '2026-11-17' },
    finalTotal: 12,
    status: 'done',
    waitingForPerson: 2,
  });
  first.counts.byStatus.done = 2;
  first.counts.leaves = 2;
  first.counts.estimated = 1;
  const second = child({
    dates: { startsOn: '2026-11-09', endsOn: '2026-12-02' },
    finalTotal: 8,
    status: 'ready',
    waitingForCapacity: 4,
  });
  second.counts.byStatus.ready = 3;
  second.counts.leaves = 3;
  second.counts.estimated = 3;
  const folded = rollUps.rollUpProject([first, second]);
  expect(folded).toEqual({
    kind: 'rolled_up',
    dates: { startsOn: '2026-11-02', endsOn: '2026-12-02' },
    finalTotal: 20,
    status: 'in_progress',
    counts: {
      byStatus: {
        unknown: 0,
        draft: 0,
        ready: 3,
        in_progress: 0,
        blocked_by_proxy: 0,
        on_hold: 0,
        blocked: 0,
        done: 2,
      },
      leaves: 5,
      estimated: 4,
    },
    waitingForPerson: 2,
    waitingForCapacity: 4,
  });
  expect(first.counts.byStatus.ready).toBe(0);
});

test('a project with no readable children has an explicit empty rollup', () => {
  expect(rollUps.rollUpProject([])).toEqual({ kind: 'empty' });
});

test('an unavailable child refuses a partial project total while available child figures remain independent', () => {
  expect(rollUps.rollUpProject([child({ finalTotal: 12 }), { kind: 'unavailable' }])).toEqual({
    kind: 'unavailable',
  });
});

test('a failed child schedule suppresses the project span but retains known effort and counts', () => {
  expect(
    rollUps.rollUpProject([
      child({ dates: { startsOn: '2026-11-02', endsOn: '2026-11-17' }, finalTotal: 12 }),
      child({ scheduleError: 'cycle', finalTotal: 8 }),
    ]),
  ).toMatchObject({ kind: 'rolled_up', dates: null, finalTotal: 20 });
});

test('project status folds package states, including a silent empty package, by the normal parent rule', () => {
  expect(
    rollUps.rollUpProject([child({ status: 'on_hold' }), child({ status: 'on_hold' })]),
  ).toMatchObject({ status: 'on_hold' });
  expect(rollUps.rollUpProject([child({ status: 'done' }), child()])).toMatchObject({
    status: 'in_progress',
  });
});

test('undated children contribute effort and do not invent dates', () => {
  expect(rollUps.rollUpProject([child({ finalTotal: 4 })])).toMatchObject({
    dates: null,
    finalTotal: 4,
  });
});
