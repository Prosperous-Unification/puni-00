import { describe, expect, it } from 'vitest';

import { spaceGanttLanesOf } from './space-gantt';

describe('spaceGanttLanesOf', () => {
  it('spans the bars from the earliest start to the latest end, in row order', () => {
    expect(
      spaceGanttLanesOf([
        { projectId: 'b', name: 'B', schedule: { startsOn: '2026-10-06', endsOn: '2026-10-10' } },
        { projectId: 'a', name: 'A', schedule: { startsOn: '2026-10-01', endsOn: '2026-10-05' } },
      ]),
    ).toEqual([
      {
        kind: 'bar',
        projectId: 'b',
        name: 'B',
        left: 50,
        width: 50,
        label: 'B: 2026-10-06 to 2026-10-10',
      },
      {
        kind: 'bar',
        projectId: 'a',
        name: 'A',
        left: 0,
        width: 50,
        label: 'A: 2026-10-01 to 2026-10-05',
      },
    ]);
  });

  it('labels each undated, loading, unavailable and failed project, and draws it no bar', () => {
    const lanes = spaceGanttLanesOf([
      { projectId: 'a', name: 'A', schedule: { startsOn: '2026-10-01', endsOn: '2026-10-01' } },
      { projectId: 'u', name: 'U', schedule: 'undated' },
      { projectId: 'l', name: 'L', schedule: 'loading' },
      { projectId: 'x', name: 'X', schedule: 'unavailable' },
      { projectId: 'f', name: 'F', schedule: 'failed' },
    ]);
    expect(lanes[0]).toMatchObject({ kind: 'bar', left: 0, width: 100 });
    expect(lanes.slice(1).map((lane) => [lane.kind, lane.label])).toEqual([
      ['blank', 'U: no dates'],
      ['blank', 'L: loading'],
      ['blank', 'X: schedule unavailable'],
      ['blank', 'F: figures could not be loaded'],
    ]);
  });

  it('draws only blanks when no project is dated', () => {
    expect(spaceGanttLanesOf([{ projectId: 'u', name: 'U', schedule: 'undated' }])).toEqual([
      { kind: 'blank', projectId: 'u', name: 'U', gap: 'undated', label: 'U: no dates' },
    ]);
  });
});
