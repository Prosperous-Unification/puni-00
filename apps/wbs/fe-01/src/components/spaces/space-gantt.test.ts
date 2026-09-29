import { describe, expect, it } from 'vitest';

import { spaceGanttLanesOf } from './space-gantt';

describe('spaceGanttLanesOf', () => {
  it('spans the bars from the earliest start to the latest end, in row order', () => {
    expect(
      spaceGanttLanesOf([
        { projectId: 'b', name: 'B', dates: { startsOn: '2026-10-06', endsOn: '2026-10-10' } },
        { projectId: 'a', name: 'A', dates: { startsOn: '2026-10-01', endsOn: '2026-10-05' } },
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

  it('draws an undated project as a labelled blank, never a bar', () => {
    const lanes = spaceGanttLanesOf([
      { projectId: 'a', name: 'A', dates: { startsOn: '2026-10-01', endsOn: '2026-10-01' } },
      { projectId: 'u', name: 'Undated', dates: null },
    ]);
    expect(lanes[1]).toEqual({
      kind: 'blank',
      projectId: 'u',
      name: 'Undated',
      label: 'Undated: no dates',
    });
    expect(lanes[0]).toMatchObject({ kind: 'bar', left: 0, width: 100 });
  });

  it('draws only blanks when no project is dated', () => {
    expect(spaceGanttLanesOf([{ projectId: 'u', name: 'U', dates: null }])).toEqual([
      { kind: 'blank', projectId: 'u', name: 'U', label: 'U: no dates' },
    ]);
  });
});
