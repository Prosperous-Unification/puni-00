import { schedule, workdayOrdinalOf } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import type { ScheduleRead } from '../ports/scheduler';
import { compareSharedPeopleFanout, type FanoutWorkPackage } from './shared-people-fanout';

function placed(
  workPackageId: string,
  start: number,
  width = 1,
  days = 1,
  personId: string | null = 'ana',
) {
  return schedule(
    [
      {
        id: `${workPackageId}-row`,
        parentId: null,
        position: 10,
        frozenNumber: null,
        priority: null,
      },
    ],
    [],
    [{ workItemId: `${workPackageId}-row`, stepId: 'build', days, personId, width, poolIds: [] }],
    new Map([[`${workPackageId}-row`, start]]),
    new Map(),
    'whole-item',
    new Map(),
  );
}

function workPackage(workPackageId: string, outcome: ScheduleRead): FanoutWorkPackage {
  return {
    workPackageId,
    organizationId: 'org-a',
    name: workPackageId,
    rankPosition: 10,
    startDate: '2026-10-05',
    personIds: ['ana'],
    inputHash: 'same-input',
    incomingBasis: null,
    settings: { optimizationEnabled: true, scheduleEngine: 'optimized', scheduleObjective: 'pri' },
    outcome,
  };
}

function fast(workPackageId: string): ScheduleRead {
  return {
    kind: 'scheduled',
    fast: placed(workPackageId, 0),
    optimization: {
      inputHash: 'same-input',
      generation: 1,
      contractVersion: '17+0.3.0',
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
        contractVersion: '17+0.3.0',
        budgetMs: 1000,
        variants: { pri: { state: 'ready', proof: 'proven' }, time: { state: 'idle' } },
        schedules: { pri: placed('A', 3), time: null },
      },
    };
    const before = [workPackage('A', fast('A')), workPackage('B', fast('B'))];
    const after = [workPackage('A', ready), workPackage('B', fast('B'))];

    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', workPackages: before },
      after: { mode: 'shared', organizationId: 'org-a', workPackages: after },
      directCauses: ['A'],
    });

    expect(comparison.recipients).toEqual([{ workPackageId: 'B', causeWorkPackageId: 'A' }]);
    expect(comparison.projections.find(({ workPackageId }) => workPackageId === 'A')).toMatchObject(
      {
        before: {
          availability: 'available',
          bookings: [{ personId: 'ana', workPackageId: 'A', workItemId: 'A-row', stepId: 'build' }],
        },
        after: {
          availability: 'available',
          bookings: [{ personId: 'ana', workPackageId: 'A', workItemId: 'A-row', stepId: 'build' }],
        },
        bookingsChanged: true,
        availabilityChanged: false,
      },
    );
    const a = comparison.projections.find(({ workPackageId }) => workPackageId === 'A');
    expect(a?.before?.bookings[0]?.start).toBe(workdayOrdinalOf('2026-10-05'));
    expect(a?.after?.bookings[0]?.start).toBe(workdayOrdinalOf('2026-10-05') + 3);
  });

  it('equal hashes retain availability transitions with no bookings', () => {
    const unavailable = workPackage('A', {
      kind: 'engine_unavailable',
      error: 'engine_unavailable',
      engine: 'optimized',
    });
    const cycle: FanoutWorkPackage = { ...unavailable, outcome: { kind: 'cycle' } };
    const before = [unavailable, workPackage('B', fast('B'))];
    const after = [cycle, workPackage('B', fast('B'))];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', workPackages: before },
      after: { mode: 'shared', organizationId: 'org-a', workPackages: after },
      directCauses: ['A'],
    });

    expect(before[0]?.inputHash).toBe(after[0]?.inputHash);
    expect(comparison.projections.find(({ workPackageId }) => workPackageId === 'A')).toMatchObject(
      {
        before: { availability: 'engine_unavailable', bookings: [] },
        after: { availability: 'cycle', bookings: [] },
        bookingsChanged: false,
        availabilityChanged: true,
      },
    );
    expect(comparison.recipients).toEqual([{ workPackageId: 'B', causeWorkPackageId: 'A' }]);
  });

  it('removed bridge retains recipients reached in the old topology', () => {
    const aBefore = workPackage('A', fast('A'));
    const aAfter = { ...aBefore, outcome: { kind: 'cycle' as const } };
    const bridge = { ...workPackage('B', fast('B')), personIds: ['ana', 'bob'] };
    const oldWorkPackages = [
      aBefore,
      bridge,
      { ...workPackage('C', fast('C')), personIds: ['bob'] },
    ];
    const newWorkPackages = [aAfter, { ...bridge, personIds: ['ana'] }, oldWorkPackages[2]];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', workPackages: oldWorkPackages },
      after: { mode: 'shared', organizationId: 'org-a', workPackages: newWorkPackages },
      directCauses: ['A'],
    });

    expect(comparison.recipients).toEqual([
      { workPackageId: 'B', causeWorkPackageId: 'A' },
      { workPackageId: 'C', causeWorkPackageId: 'A' },
    ]);
  });

  it('does not invent a path from mixed old and new edges', () => {
    const aBefore = workPackage('A', fast('A'));
    const aAfter = { ...aBefore, outcome: { kind: 'cycle' as const } };
    const oldWorkPackages = [
      aBefore,
      { ...workPackage('B', fast('B')), personIds: ['ana'] },
      { ...workPackage('C', fast('C')), personIds: ['bob'] },
    ];
    const newWorkPackages = [
      aAfter,
      { ...oldWorkPackages[1], personIds: ['bob'] },
      oldWorkPackages[2],
    ];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', workPackages: oldWorkPackages },
      after: { mode: 'shared', organizationId: 'org-a', workPackages: newWorkPackages },
      directCauses: ['A'],
    });

    expect(comparison.recipients).toEqual([{ workPackageId: 'B', causeWorkPackageId: 'A' }]);
  });

  it('deduplicates and orders recipient/cause pairs independent of capture order', () => {
    const before = [
      workPackage('Z', fast('Z')),
      workPackage('A', fast('A')),
      workPackage('B', fast('B')),
    ];
    const after = before.map((entry) =>
      entry.workPackageId === 'B' ? entry : { ...entry, outcome: { kind: 'cycle' as const } },
    );
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', workPackages: before },
      after: { mode: 'shared', organizationId: 'org-a', workPackages: after },
      directCauses: ['Z', 'A', 'Z'],
    });

    expect(comparison.recipients).toEqual([
      { workPackageId: 'A', causeWorkPackageId: 'Z' },
      { workPackageId: 'B', causeWorkPackageId: 'A' },
      { workPackageId: 'B', causeWorkPackageId: 'Z' },
    ]);
  });

  it('keeps isolated and foreign organization work packages outside shared fan-out', () => {
    const before = [
      workPackage('A', fast('A')),
      workPackage('B', fast('B')),
      { ...workPackage('X', fast('X')), organizationId: 'org-b' },
    ];
    const after = before.map((entry) =>
      entry.workPackageId === 'A' ? { ...entry, outcome: { kind: 'cycle' as const } } : entry,
    );
    const sharedBefore = { mode: 'shared' as const, organizationId: 'org-a', workPackages: before };
    const sharedAfter = { mode: 'shared' as const, organizationId: 'org-a', workPackages: after };

    expect(
      compareSharedPeopleFanout({ before: sharedBefore, after: sharedAfter, directCauses: ['A'] })
        .recipients,
    ).toEqual([{ workPackageId: 'B', causeWorkPackageId: 'A' }]);
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
      workPackage('A', fast('A')),
      { ...workPackage('B', fast('B')), incomingBasis: 'old-A' },
      { ...workPackage('C', fast('C')), incomingBasis: 'unchanged' },
    ];
    const after = [
      { ...before[0], personIds: ['bob'] },
      { ...before[1], incomingBasis: 'without-A' },
      before[2],
    ];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', workPackages: before },
      after: { mode: 'shared', organizationId: 'org-a', workPackages: after },
      directCauses: ['A'],
    });

    expect(comparison.projections.find(({ workPackageId }) => workPackageId === 'A')).toMatchObject(
      {
        bookingsChanged: false,
        availabilityChanged: false,
      },
    );
    expect(comparison.recipients).toEqual([{ workPackageId: 'B', causeWorkPackageId: 'A' }]);
  });

  it('rename and rank respacing with the same order are silent', () => {
    const before = [workPackage('A', fast('A')), workPackage('B', fast('B'))];
    const after = [
      { ...before[0], name: 'Renamed A', rankPosition: 100 },
      { ...before[1], rankPosition: 200 },
    ];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', workPackages: before },
      after: { mode: 'shared', organizationId: 'org-a', workPackages: after },
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
        ...workPackage('A', { kind: 'scheduled', fast: placed('A', 0, 2), optimization: null }),
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
      before: { mode: 'shared', organizationId: 'org-a', workPackages: before },
      after: { mode: 'shared', organizationId: 'org-a', workPackages: after },
      directCauses: ['A'],
    });
    const interval = comparison.projections[0];
    expect(interval.bookingsChanged).toBe(true);
    expect(interval.before?.bookings[0]).toMatchObject({
      personId: 'ana',
      workPackageId: 'A',
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
    const a = workPackage('A', fast('A'));
    const b = { ...workPackage('B', fast('B')), startDate: null, personIds: ['ana', 'bob'] };
    const c = { ...workPackage('C', fast('C')), personIds: ['bob'] };
    const before = [a, b, c];
    const after = [{ ...a, outcome: { kind: 'calendar_range' as const } }, b, c];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', workPackages: before },
      after: { mode: 'shared', organizationId: 'org-a', workPackages: after },
      directCauses: ['A'],
    });

    expect(
      comparison.projections.find(({ workPackageId }) => workPackageId === 'B')?.before,
    ).toEqual({
      availability: 'undated',
      bookings: [],
    });
    expect(
      comparison.projections.find(({ workPackageId }) => workPackageId === 'A')?.after,
    ).toEqual({
      availability: 'calendar_range',
      bookings: [],
    });
    expect(comparison.recipients).toEqual([]);
  });

  it('keeps cycle and calendar-range bridges reachable while skipping their bookings', () => {
    const a = workPackage('A', fast('A'));
    const b = {
      ...workPackage('B', fast('B')),
      personIds: ['ana', 'bob'],
      outcome: { kind: 'cycle' as const },
    };
    const c = {
      ...workPackage('C', fast('C')),
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
      before: { mode: 'shared', organizationId: 'org-a', workPackages: before },
      after: { mode: 'shared', organizationId: 'org-a', workPackages: after },
      directCauses: ['A'],
    });

    expect(
      comparison.projections.find(({ workPackageId }) => workPackageId === 'B')?.after,
    ).toEqual({
      availability: 'cycle',
      bookings: [],
    });
    expect(
      comparison.projections.find(({ workPackageId }) => workPackageId === 'C')?.after,
    ).toEqual({
      availability: 'calendar_range',
      bookings: [],
    });
    expect(
      comparison.projections.find(({ workPackageId }) => workPackageId === 'A')?.after,
    ).toEqual({
      availability: 'engine_unavailable',
      bookings: [],
    });
    expect(comparison.recipients).toEqual([
      { workPackageId: 'B', causeWorkPackageId: 'A' },
      { workPackageId: 'C', causeWorkPackageId: 'A' },
    ]);
  });

  it('an undated cause cannot pass bookings to a dated lower work package', () => {
    const cause = { ...workPackage('A', fast('A')), startDate: null };
    const recipient = workPackage('B', fast('B'));
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', workPackages: [cause, recipient] },
      after: {
        mode: 'shared',
        organizationId: 'org-a',
        workPackages: [{ ...cause, outcome: { kind: 'cycle' } }, recipient],
      },
      directCauses: ['A'],
    });
    expect(comparison.projections[0]?.availabilityChanged).toBe(true);
    expect(comparison.recipients).toEqual([]);
  });

  it('omits zero-time and unassigned slices without calling them unavailable', () => {
    const zero = {
      ...workPackage('A', fast('A')),
      settings: {
        optimizationEnabled: false,
        scheduleEngine: 'fast' as const,
        scheduleObjective: 'pri' as const,
      },
      outcome: { kind: 'scheduled' as const, fast: placed('A', 0, 1, 0), optimization: null },
    };
    const unassigned = {
      ...workPackage('B', fast('B')),
      settings: zero.settings,
      outcome: { kind: 'scheduled' as const, fast: placed('B', 0, 1, 1, null), optimization: null },
    };
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', workPackages: [zero, unassigned] },
      after: { mode: 'shared', organizationId: 'org-a', workPackages: [zero, unassigned] },
      directCauses: [],
    });
    expect(comparison.projections.map(({ after }) => after)).toEqual([
      { availability: 'available', bookings: [] },
      { availability: 'available', bookings: [] },
    ]);
  });

  it('retains deleted cause identity and excludes deleted recipients', () => {
    const a = workPackage('A', fast('A'));
    const b = workPackage('B', fast('B'));
    const deletedCause = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', workPackages: [a, b] },
      after: { mode: 'shared', organizationId: 'org-a', workPackages: [b] },
      directCauses: ['A'],
    });
    expect(deletedCause.recipients).toEqual([{ workPackageId: 'B', causeWorkPackageId: 'A' }]);
    const deletedRecipient = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', workPackages: [a, b] },
      after: {
        mode: 'shared',
        organizationId: 'org-a',
        workPackages: [{ ...a, outcome: { kind: 'cycle' } }],
      },
      directCauses: ['A'],
    });
    expect(deletedRecipient.recipients).toEqual([]);
  });

  it('does not fan out topology-only changes to unchanged incoming bases', () => {
    const before = [workPackage('A', fast('A')), workPackage('B', fast('B'))];
    const after = [{ ...before[0], personIds: ['bob'] }, before[1]];
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', workPackages: before },
      after: { mode: 'shared', organizationId: 'org-a', workPackages: after },
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
      ...workPackage('A', fast('A')),
      settings,
      outcome: { kind: 'scheduled' as const, fast: planned, optimization: null },
    };
    const after = {
      ...before,
      outcome: { kind: 'scheduled' as const, fast: reordered, optimization: null },
    };
    const comparison = compareSharedPeopleFanout({
      before: { mode: 'shared', organizationId: 'org-a', workPackages: [before] },
      after: { mode: 'shared', organizationId: 'org-a', workPackages: [after] },
      directCauses: ['A'],
    });
    expect(comparison.projections[0]?.bookingsChanged).toBe(false);
    expect(comparison.projections[0]?.before?.bookings).toEqual(
      comparison.projections[0]?.after?.bookings,
    );
  });

  it('refuses an explicit cause missing from both captures', () => {
    const captured = { mode: 'shared' as const, organizationId: 'org-a', workPackages: [] };
    expect(() =>
      compareSharedPeopleFanout({ before: captured, after: captured, directCauses: ['absent'] }),
    ).toThrow('direct cause absent from both captures');
  });

  it('refuses shared captures with missing or inconsistent organization identity', () => {
    const captured = {
      mode: 'shared' as const,
      organizationId: 'org-a',
      workPackages: [workPackage('A', fast('A'))],
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
