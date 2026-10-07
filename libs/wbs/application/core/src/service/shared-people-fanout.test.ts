import { schedule, workdayOrdinalOf } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import type { ScheduleRead } from '../ports/scheduler';
import { compareSharedPeopleFanout, type FanoutProject } from './shared-people-fanout';

function placed(
  projectId: string,
  start: number,
  width = 1,
  days = 1,
  personId: string | null = 'ana',
) {
  return schedule(
    [{ id: `${projectId}-row`, parentId: null, position: 10, frozenNumber: null, priority: null }],
    [],
    [{ workItemId: `${projectId}-row`, stepId: 'build', days, personId, width, poolIds: [] }],
    new Map([[`${projectId}-row`, start]]),
    new Map(),
    'whole-item',
    new Map(),
  );
}

function project(projectId: string, outcome: ScheduleRead): FanoutProject {
  return {
    projectId,
    organizationId: 'org-a',
    name: projectId,
    rankPosition: 10,
    startDate: '2026-10-05',
    personIds: ['ana'],
    inputHash: 'same-input',
    incomingBasis: null,
    settings: { optimizationEnabled: true, scheduleEngine: 'optimized', scheduleObjective: 'pri' },
    outcome,
  };
}

function fast(projectId: string): ScheduleRead {
  return {
    kind: 'scheduled',
    fast: placed(projectId, 0),
    optimization: {
      inputHash: 'same-input',
      generation: 1,
      contractVersion: '15+0.2.0',
      budgetMs: 1000,
      variants: { pri: { state: 'pending' }, time: { state: 'idle' } },
      schedules: { pri: null, time: null },
    },
  };
}

describe('compareSharedPeopleFanout', () => {
  it('selected displayed bookings determine fan-out rather than Fast', () => {
    const ready: ScheduleRead = {
      kind: 'scheduled',
      fast: placed('A', 0),
      optimization: {
        inputHash: 'same-input',
        generation: 1,
        contractVersion: '15+0.2.0',
        budgetMs: 1000,
        variants: { pri: { state: 'ready', proof: 'proven' }, time: { state: 'idle' } },
        schedules: { pri: placed('A', 3), time: null },
      },
    };
    const before = [project('A', fast('A')), project('B', fast('B'))];
    const after = [project('A', ready), project('B', fast('B'))];

    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: before },
      after: { mode: 'shared', organizationId: 'org-a', projects: after },
      directCauses: ['A'],
    });

    expect(comparison.recipients).toEqual([{ projectId: 'B', causeProjectId: 'A' }]);
    expect(comparison.projections.find(({ projectId }) => projectId === 'A')).toMatchObject({
      before: {
        availability: 'available',
        bookings: [{ personId: 'ana', projectId: 'A', workItemId: 'A-row', stepId: 'build' }],
      },
      after: {
        availability: 'available',
        bookings: [{ personId: 'ana', projectId: 'A', workItemId: 'A-row', stepId: 'build' }],
      },
      bookingsChanged: true,
      availabilityChanged: false,
    });
    const a = comparison.projections.find(({ projectId }) => projectId === 'A');
    expect(a?.before?.bookings[0]?.start).toBe(workdayOrdinalOf('2026-10-05'));
    expect(a?.after?.bookings[0]?.start).toBe(workdayOrdinalOf('2026-10-05') + 3);
  });

  it('equal hashes retain availability transitions with no bookings', () => {
    const unavailable = project('A', {
      kind: 'engine_unavailable',
      error: 'engine_unavailable',
      engine: 'optimized',
    });
    const cycle: FanoutProject = { ...unavailable, outcome: { kind: 'cycle' } };
    const before = [unavailable, project('B', fast('B'))];
    const after = [cycle, project('B', fast('B'))];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: before },
      after: { mode: 'shared', organizationId: 'org-a', projects: after },
      directCauses: ['A'],
    });

    expect(before[0]?.inputHash).toBe(after[0]?.inputHash);
    expect(comparison.projections.find(({ projectId }) => projectId === 'A')).toMatchObject({
      before: { availability: 'engine_unavailable', bookings: [] },
      after: { availability: 'cycle', bookings: [] },
      bookingsChanged: false,
      availabilityChanged: true,
    });
    expect(comparison.recipients).toEqual([{ projectId: 'B', causeProjectId: 'A' }]);
  });

  it('removed bridge retains recipients reached in the old topology', () => {
    const aBefore = project('A', fast('A'));
    const aAfter = { ...aBefore, outcome: { kind: 'cycle' as const } };
    const bridge = { ...project('B', fast('B')), personIds: ['ana', 'bob'] };
    const oldProjects = [aBefore, bridge, { ...project('C', fast('C')), personIds: ['bob'] }];
    const newProjects = [aAfter, { ...bridge, personIds: ['ana'] }, oldProjects[2]];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: oldProjects },
      after: { mode: 'shared', organizationId: 'org-a', projects: newProjects },
      directCauses: ['A'],
    });

    expect(comparison.recipients).toEqual([
      { projectId: 'B', causeProjectId: 'A' },
      { projectId: 'C', causeProjectId: 'A' },
    ]);
  });

  it('does not invent a path from mixed old and new edges', () => {
    const aBefore = project('A', fast('A'));
    const aAfter = { ...aBefore, outcome: { kind: 'cycle' as const } };
    const oldProjects = [
      aBefore,
      { ...project('B', fast('B')), personIds: ['ana'] },
      { ...project('C', fast('C')), personIds: ['bob'] },
    ];
    const newProjects = [aAfter, { ...oldProjects[1], personIds: ['bob'] }, oldProjects[2]];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: oldProjects },
      after: { mode: 'shared', organizationId: 'org-a', projects: newProjects },
      directCauses: ['A'],
    });

    expect(comparison.recipients).toEqual([{ projectId: 'B', causeProjectId: 'A' }]);
  });

  it('deduplicates and orders recipient/cause pairs independent of capture order', () => {
    const before = [project('Z', fast('Z')), project('A', fast('A')), project('B', fast('B'))];
    const after = before.map((entry) =>
      entry.projectId === 'B' ? entry : { ...entry, outcome: { kind: 'cycle' as const } },
    );
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: before },
      after: { mode: 'shared', organizationId: 'org-a', projects: after },
      directCauses: ['Z', 'A', 'Z'],
    });

    expect(comparison.recipients).toEqual([
      { projectId: 'A', causeProjectId: 'Z' },
      { projectId: 'B', causeProjectId: 'A' },
      { projectId: 'B', causeProjectId: 'Z' },
    ]);
  });

  it('keeps isolated and foreign organization projects outside shared fan-out', () => {
    const before = [
      project('A', fast('A')),
      project('B', fast('B')),
      { ...project('X', fast('X')), organizationId: 'org-b' },
    ];
    const after = before.map((entry) =>
      entry.projectId === 'A' ? { ...entry, outcome: { kind: 'cycle' as const } } : entry,
    );
    const sharedBefore = { mode: 'shared' as const, organizationId: 'org-a', projects: before };
    const sharedAfter = { mode: 'shared' as const, organizationId: 'org-a', projects: after };

    expect(
      compareSharedPeopleFanout({ before: sharedBefore, after: sharedAfter, directCauses: ['A'] })
        .recipients,
    ).toEqual([{ projectId: 'B', causeProjectId: 'A' }]);
    expect(
      compareSharedPeopleFanout({
        before: { ...sharedBefore, mode: 'isolated' },
        after: { ...sharedAfter, mode: 'isolated' },
        directCauses: ['A'],
      }).recipients,
    ).toEqual([]);
    expect(
      compareSharedPeopleFanout({
        before: { ...sharedBefore, mode: 'legacy' },
        after: { ...sharedAfter, mode: 'legacy' },
        directCauses: ['A'],
      }).recipients,
    ).toEqual([]);
  });

  it('topology-only connection changes invalidate only changed incoming bases', () => {
    const before = [
      project('A', fast('A')),
      { ...project('B', fast('B')), incomingBasis: 'old-A' },
      { ...project('C', fast('C')), incomingBasis: 'unchanged' },
    ];
    const after = [
      { ...before[0], personIds: ['bob'] },
      { ...before[1], incomingBasis: 'without-A' },
      before[2],
    ];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: before },
      after: { mode: 'shared', organizationId: 'org-a', projects: after },
      directCauses: ['A'],
    });

    expect(comparison.projections.find(({ projectId }) => projectId === 'A')).toMatchObject({
      bookingsChanged: false,
      availabilityChanged: false,
    });
    expect(comparison.recipients).toEqual([{ projectId: 'B', causeProjectId: 'A' }]);
  });

  it('rename and rank respacing with the same order are silent', () => {
    const before = [project('A', fast('A')), project('B', fast('B'))];
    const after = [
      { ...before[0], name: 'Renamed A', rankPosition: 100 },
      { ...before[1], rankPosition: 200 },
    ];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: before },
      after: { mode: 'shared', organizationId: 'org-a', projects: after },
      directCauses: ['A'],
    });
    expect(comparison.recipients).toEqual([]);
    expect(
      comparison.projections.every(
        ({ bookingsChanged, availabilityChanged }) => !bookingsChanged && !availabilityChanged,
      ),
    ).toBe(true);
  });

  it('compares absolute fractional bookings with slice identity', () => {
    const before = [
      {
        ...project('A', { kind: 'scheduled', fast: placed('A', 0, 2), optimization: null }),
        settings: {
          optimizationEnabled: false,
          scheduleEngine: 'fast' as const,
          scheduleObjective: 'pri' as const,
        },
      },
    ];
    const after = [
      {
        ...before[0],
        outcome: { kind: 'scheduled' as const, fast: placed('A', 0.5, 2), optimization: null },
      },
    ];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: before },
      after: { mode: 'shared', organizationId: 'org-a', projects: after },
      directCauses: ['A'],
    });
    const interval = comparison.projections[0];
    expect(interval.bookingsChanged).toBe(true);
    expect(interval.before?.bookings[0]).toMatchObject({
      personId: 'ana',
      projectId: 'A',
      workItemId: 'A-row',
      stepId: 'build',
    });
    expect(interval.after?.bookings[0]?.start).toBe(
      (interval.before?.bookings[0]?.start ?? 0) + 0.5,
    );
    expect(interval.before?.bookings[0]?.end).toBe(
      (interval.before?.bookings[0]?.start ?? 0) + 0.5,
    );
  });

  it('stops traversal at an undated bridge and keeps modeled absence separate', () => {
    const a = project('A', fast('A'));
    const b = { ...project('B', fast('B')), startDate: null, personIds: ['ana', 'bob'] };
    const c = { ...project('C', fast('C')), personIds: ['bob'] };
    const before = [a, b, c];
    const after = [{ ...a, outcome: { kind: 'calendar_range' as const } }, b, c];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: before },
      after: { mode: 'shared', organizationId: 'org-a', projects: after },
      directCauses: ['A'],
    });

    expect(comparison.projections.find(({ projectId }) => projectId === 'B')?.before).toEqual({
      availability: 'undated',
      bookings: [],
    });
    expect(comparison.projections.find(({ projectId }) => projectId === 'A')?.after).toEqual({
      availability: 'calendar_range',
      bookings: [],
    });
    expect(comparison.recipients).toEqual([]);
  });

  it('keeps cycle and calendar-range bridges reachable while skipping their bookings', () => {
    const a = project('A', fast('A'));
    const b = {
      ...project('B', fast('B')),
      personIds: ['ana', 'bob'],
      outcome: { kind: 'cycle' as const },
    };
    const c = {
      ...project('C', fast('C')),
      personIds: ['bob'],
      outcome: { kind: 'calendar_range' as const },
    };
    const before = [a, b, c];
    const after = [
      {
        ...a,
        outcome: {
          kind: 'engine_unavailable' as const,
          error: 'engine_unavailable' as const,
          engine: 'optimized' as const,
        },
      },
      b,
      c,
    ];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: before },
      after: { mode: 'shared', organizationId: 'org-a', projects: after },
      directCauses: ['A'],
    });

    expect(comparison.projections.find(({ projectId }) => projectId === 'B')?.after).toEqual({
      availability: 'cycle',
      bookings: [],
    });
    expect(comparison.projections.find(({ projectId }) => projectId === 'C')?.after).toEqual({
      availability: 'calendar_range',
      bookings: [],
    });
    expect(comparison.projections.find(({ projectId }) => projectId === 'A')?.after).toEqual({
      availability: 'engine_unavailable',
      bookings: [],
    });
    expect(comparison.recipients).toEqual([
      { projectId: 'B', causeProjectId: 'A' },
      { projectId: 'C', causeProjectId: 'A' },
    ]);
  });

  it('an undated cause cannot pass bookings to a dated lower project', () => {
    const cause = { ...project('A', fast('A')), startDate: null };
    const recipient = project('B', fast('B'));
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: [cause, recipient] },
      after: {
        mode: 'shared',
        organizationId: 'org-a',
        projects: [{ ...cause, outcome: { kind: 'cycle' } }, recipient],
      },
      directCauses: ['A'],
    });
    expect(comparison.projections[0]?.availabilityChanged).toBe(true);
    expect(comparison.recipients).toEqual([]);
  });

  it('omits zero-time and unassigned slices without calling them unavailable', () => {
    const zero = {
      ...project('A', fast('A')),
      settings: {
        optimizationEnabled: false,
        scheduleEngine: 'fast' as const,
        scheduleObjective: 'pri' as const,
      },
      outcome: { kind: 'scheduled' as const, fast: placed('A', 0, 1, 0), optimization: null },
    };
    const unassigned = {
      ...project('B', fast('B')),
      settings: zero.settings,
      outcome: { kind: 'scheduled' as const, fast: placed('B', 0, 1, 1, null), optimization: null },
    };
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: [zero, unassigned] },
      after: { mode: 'shared', organizationId: 'org-a', projects: [zero, unassigned] },
      directCauses: [],
    });
    expect(comparison.projections.map(({ after }) => after)).toEqual([
      { availability: 'available', bookings: [] },
      { availability: 'available', bookings: [] },
    ]);
  });

  it('retains deleted cause identity and excludes deleted recipients', () => {
    const a = project('A', fast('A'));
    const b = project('B', fast('B'));
    const deletedCause = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: [a, b] },
      after: { mode: 'shared', organizationId: 'org-a', projects: [b] },
      directCauses: ['A'],
    });
    expect(deletedCause.recipients).toEqual([{ projectId: 'B', causeProjectId: 'A' }]);
    const deletedRecipient = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: [a, b] },
      after: {
        mode: 'shared',
        organizationId: 'org-a',
        projects: [{ ...a, outcome: { kind: 'cycle' } }],
      },
      directCauses: ['A'],
    });
    expect(deletedRecipient.recipients).toEqual([]);
  });

  it('does not fan out topology-only changes to unchanged incoming bases', () => {
    const before = [project('A', fast('A')), project('B', fast('B'))];
    const after = [{ ...before[0], personIds: ['bob'] }, before[1]];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: before },
      after: { mode: 'shared', organizationId: 'org-a', projects: after },
      directCauses: ['A'],
    });
    expect(comparison.recipients).toEqual([]);
  });

  it('canonicalizes booking order independently of captured slice-map order', () => {
    const planned = schedule(
      ['first', 'second'].map((id, index) => ({
        id,
        parentId: null,
        position: index * 10,
        frozenNumber: null,
        priority: null,
      })),
      [],
      ['first', 'second'].map((workItemId) => ({
        workItemId,
        stepId: 'build',
        days: 1,
        personId: 'ana',
        width: 1,
        poolIds: [],
      })),
      new Map([
        ['first', 0],
        ['second', 1],
      ]),
      new Map(),
      'whole-item',
      new Map(),
    );
    const reordered = { ...planned, slices: new Map([...planned.slices].reverse()) };
    const settings = {
      optimizationEnabled: false,
      scheduleEngine: 'fast' as const,
      scheduleObjective: 'pri' as const,
    };
    const before = {
      ...project('A', fast('A')),
      settings,
      outcome: { kind: 'scheduled' as const, fast: planned, optimization: null },
    };
    const after = {
      ...before,
      outcome: { kind: 'scheduled' as const, fast: reordered, optimization: null },
    };
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', projects: [before] },
      after: { mode: 'shared', organizationId: 'org-a', projects: [after] },
      directCauses: ['A'],
    });
    expect(comparison.projections[0]?.bookingsChanged).toBe(false);
    expect(comparison.projections[0]?.before?.bookings).toEqual(
      comparison.projections[0]?.after?.bookings,
    );
  });

  it('refuses an explicit cause missing from both captures', () => {
    const captured = { mode: 'shared' as const, organizationId: 'org-a', projects: [] };
    expect(() =>
      compareSharedPeopleFanout({ before: captured, after: captured, directCauses: ['absent'] }),
    ).toThrow('direct cause absent from both captures');
  });

  it('refuses shared captures with missing or inconsistent organization identity', () => {
    const captured = {
      mode: 'shared' as const,
      organizationId: 'org-a',
      projects: [project('A', fast('A'))],
    };
    expect(() =>
      compareSharedPeopleFanout({
        before: { ...captured, organizationId: null },
        after: captured,
        directCauses: ['A'],
      }),
    ).toThrow('shared capture organization is missing or inconsistent');
    expect(() =>
      compareSharedPeopleFanout({
        before: captured,
        after: { ...captured, organizationId: 'org-b' },
        directCauses: ['A'],
      }),
    ).toThrow('shared capture organization is missing or inconsistent');
  });
});
