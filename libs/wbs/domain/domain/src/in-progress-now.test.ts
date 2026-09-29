import { describe, expect, it } from 'bun:test';

import {
  inProgressLeavesOf,
  type InProgressRow,
  type InProgressTree,
  sortInProgress,
} from './in-progress-now';

const row = (overrides: Partial<InProgressRow> & Pick<InProgressRow, 'id'>): InProgressRow => ({
  parentId: null,
  number: '1',
  name: overrides.id,
  status: 'unknown',
  dates: null,
  assignees: {},
  progress: {},
  ...overrides,
});

const tree = (overrides: Partial<InProgressTree>): InProgressTree => ({
  workItems: [],
  slices: [],
  steps: [
    { id: 'dev', name: 'Dev' },
    { id: 'qa', name: 'QA' },
  ],
  assignedPeople: [
    { id: 'kat', name: 'Kat' },
    { id: 'lee', name: 'Lee' },
  ],
  ...overrides,
});

describe('inProgressLeavesOf', () => {
  it('lists the leaves whose folded status is in progress, with their step and people', () => {
    const leaves = inProgressLeavesOf(
      tree({
        workItems: [
          row({ id: 'p', number: '1', status: 'in_progress' }),
          row({
            id: 'c1',
            parentId: 'p',
            number: '1.1',
            status: 'in_progress',
            dates: { startsOn: '2026-10-01', endsOn: '2026-10-09' },
            assignees: { dev: 'kat', qa: 'lee' },
            progress: { dev: 'done', qa: 'in_progress' },
          }),
          row({ id: 'c2', parentId: 'p', number: '1.2', status: 'ready' }),
        ],
        slices: [
          { workItemId: 'c1', stepId: 'dev', lateBy: null },
          { workItemId: 'c1', stepId: 'qa', lateBy: 2 },
          { workItemId: 'c2', stepId: 'dev', lateBy: 5 },
        ],
      }),
    );
    expect(leaves).toEqual([
      {
        workItemId: 'c1',
        number: '1.1',
        name: 'c1',
        dates: { startsOn: '2026-10-01', endsOn: '2026-10-09' },
        lateBy: 2,
        assignees: [
          { id: 'kat', name: 'Kat' },
          { id: 'lee', name: 'Lee' },
        ],
        step: { id: 'qa', name: 'QA' },
      },
    ]);
  });

  it('never lists a held leaf, whatever its step says', () => {
    // Proof, observed 2026-09-29: with the status check replaced by "any step
    // reads in_progress", this listed both the held leaf `h` and the blocked
    // leaf `b` (Received + 26 lines).
    expect(
      inProgressLeavesOf(
        tree({
          workItems: [
            row({ id: 'h', status: 'on_hold', progress: { dev: 'in_progress' } }),
            row({ id: 'b', status: 'blocked', progress: { dev: 'in_progress' } }),
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe('sortInProgress', () => {
  it('orders by end date with undated last, then space position, then number', () => {
    const item = (id: string, endsOn: string | null, position: number, number: string) => ({
      id,
      endsOn,
      position,
      number,
    });
    const ordered = sortInProgress(
      [
        item('undated', null, 1, '1'),
        item('late-2', '2026-10-09', 20, '1'),
        item('late-1b', '2026-10-09', 10, '2'),
        item('late-1a', '2026-10-09', 10, '1.10'),
        item('late-1c', '2026-10-09', 10, '1.9'),
        item('early', '2026-10-01', 30, '9'),
      ],
      ({ endsOn }) => endsOn,
    );
    expect(ordered.map(({ id }) => id)).toEqual([
      'early',
      'late-1c',
      'late-1a',
      'late-1b',
      'late-2',
      'undated',
    ]);
  });
});
