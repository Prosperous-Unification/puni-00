import { describe, expect, it } from 'bun:test';

import type { WorkItemStatus } from './progress';
import { rollUpProject, type RollUpRow, type RollUpTree } from './project-roll-up';

const row = (overrides: Partial<RollUpRow> & Pick<RollUpRow, 'id'>): RollUpRow => ({
  parentId: null,
  status: 'unknown',
  finalTotal: 0,
  dates: null,
  estimated: false,
  ...overrides,
});

const tree = (workItems: RollUpRow[], overrides: Partial<RollUpTree> = {}): RollUpTree => ({
  workItems,
  scheduleError: null,
  waitingForPerson: 0,
  waitingForCapacity: 0,
  displayed: 'fast',
  projectRevision: 3,
  seq: 7,
  ...overrides,
});

describe('rollUpProject', () => {
  it('spans the dated roots and sums their final totals', () => {
    const rolled = rollUpProject(
      tree([
        row({ id: 'r1', finalTotal: 3, dates: { startsOn: '2026-10-01', endsOn: '2026-10-05' } }),
        row({ id: 'r2', finalTotal: 8, dates: { startsOn: '2026-10-03', endsOn: '2026-10-20' } }),
        row({ id: 'c1', parentId: 'r2', finalTotal: 8 }),
      ]),
    );
    expect(rolled.dates).toEqual({ startsOn: '2026-10-01', endsOn: '2026-10-20' });
    expect(rolled.finalTotal).toBe(11);
    expect(rolled).toMatchObject({ projectRevision: 3, seq: 7, displayed: 'fast' });
  });

  it('drops an undated (held) root from the span, and answers null when none is dated', () => {
    expect(
      rollUpProject(
        tree([
          row({ id: 'r1', dates: null }),
          row({ id: 'r2', dates: { startsOn: '2026-10-03', endsOn: '2026-10-04' } }),
        ]),
      ).dates,
    ).toEqual({ startsOn: '2026-10-03', endsOn: '2026-10-04' });
    expect(rollUpProject(tree([row({ id: 'r1' })])).dates).toBeNull();
  });

  it('answers no dates while the schedule failed', () => {
    expect(
      rollUpProject(
        tree([row({ id: 'r1', dates: { startsOn: '2026-10-01', endsOn: '2026-10-02' } })], {
          scheduleError: 'cycle',
        }),
      ).dates,
    ).toBeNull();
  });

  it('folds the roots, so a project whose roots are all on hold reads on_hold', () => {
    // Proof, observed 2026-09-29: with `foldStatuses` swapped for a fold by
    // the step-progress rule `agree` (seeded `unknown`), this read
    // `in_progress` instead of `on_hold`.
    expect(
      rollUpProject(
        tree([row({ id: 'r1', status: 'on_hold' }), row({ id: 'r2', status: 'on_hold' })]),
      ).status,
    ).toBe('on_hold');
    expect(rollUpProject(tree([])).status).toBe('unknown');
    expect(
      rollUpProject(tree([row({ id: 'r1', status: 'done' }), row({ id: 'r2', status: 'ready' })]))
        .status,
    ).toBe('in_progress');
  });

  it('counts leaves per status, leaves and estimated leaves, never parents', () => {
    const rolled = rollUpProject(
      tree([
        row({ id: 'r1', status: 'in_progress', estimated: true }),
        row({ id: 'c1', parentId: 'r1', status: 'done', estimated: true }),
        row({ id: 'c2', parentId: 'r1', status: 'ready' }),
        row({ id: 'r2', status: 'blocked', estimated: true }),
      ]),
    );
    const byStatus: Partial<Record<WorkItemStatus, number>> = {
      done: 1,
      ready: 1,
      blocked: 1,
    };
    expect(rolled.counts).toEqual({
      byStatus: {
        unknown: 0,
        draft: 0,
        ready: 0,
        in_progress: 0,
        blocked_by_proxy: 0,
        on_hold: 0,
        blocked: 0,
        done: 0,
        ...byStatus,
      },
      leaves: 3,
      estimated: 2,
    });
  });
});
