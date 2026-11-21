import { schedule } from '@wbs/domain';
import { openMemorySource } from '@wbs/store-memory';
import { expect, it } from 'bun:test';

import type { CapturedFanout } from '../ports/fanout-capture-store';
import { recordCommittedFanout } from './committed-fanout';
import { compareSharedPeopleFanout, type FanoutWorkPackage } from './shared-people-fanout';

function workPackage(
  workPackageId: string,
  personIds: string[],
  incomingBasis: string,
): FanoutWorkPackage {
  const assigned = personIds.at(-1) ?? null;
  const planned = schedule(
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
    [
      {
        workItemId: `${workPackageId}-row`,
        stepId: 'build',
        days: 1,
        personId: assigned,
        width: 1,
        poolIds: [],
      },
    ],
    new Map(),
    new Map(),
    'whole-item',
    new Map(),
  );
  return {
    workPackageId,
    organizationId: 'org-a',
    name: workPackageId,
    rankPosition: 10,
    startDate: '2026-10-05',
    personIds,
    inputHash: 'same',
    incomingBasis,
    settings: { optimizationEnabled: false, scheduleEngine: 'fast', scheduleObjective: 'pri' },
    outcome: { kind: 'scheduled', fast: planned, optimization: null },
  };
}

it('treats both changed connection endpoints as direct causes without adding transitive recipients', async () => {
  const beforeWorkPackages = [
    workPackage('A', ['ana'], 'a'),
    workPackage('B', ['ana', 'ben'], 'b'),
    workPackage('C', ['ben'], 'old'),
  ];
  const afterWorkPackages = [
    beforeWorkPackages[0],
    workPackage('B', ['ben'], 'b'),
    workPackage('C', ['ben'], 'new'),
  ];
  const captured = (workPackages: FanoutWorkPackage[], bFact: string): CapturedFanout => ({
    observation: { mode: 'shared', organizationId: 'org-a', workPackages },
    dependency: null,
    localFacts: new Map([
      ['A', 'same'],
      ['B', bFact],
      ['C', 'same'],
    ]),
  });
  const eventLog = openMemorySource().stores.eventLog;
  const committed = await recordCommittedFanout(
    eventLog,
    captured(beforeWorkPackages, 'old'),
    captured(afterWorkPackages, 'new'),
    () => 1,
  );

  expect(committed.map(({ workPackageId, event }) => [workPackageId, event])).toEqual([
    ['C', { type: 'elsewhere_changed', workPackageId: 'C', causeWorkPackageId: 'A' }],
    ['C', { type: 'elsewhere_changed', workPackageId: 'C', causeWorkPackageId: 'B' }],
  ]);
  expect(await eventLog.rangeSince('work-package:C', -1)).toHaveLength(2);
});

it('uses an addressed retirement cause when selected display changes at equal local facts', async () => {
  const upstream = workPackage('A', ['ana'], 'same-basis');
  if (upstream.outcome.kind !== 'scheduled') throw new Error('fixture must schedule A');
  const selected = schedule(
    [{ id: 'A-row', parentId: null, position: 10, frozenNumber: null, priority: null }],
    [],
    [{ workItemId: 'A-row', stepId: 'build', days: 1, personId: 'ana', width: 1, poolIds: [] }],
    new Map([['A-row', 2]]),
    new Map(),
    'whole-item',
    new Map(),
  );
  const ready: FanoutWorkPackage = {
    ...upstream,
    outcome: {
      kind: 'scheduled',
      fast: upstream.outcome.fast,
      optimization: {
        inputHash: 'same',
        generation: 1,
        contractVersion: '7+0.3.0',
        budgetMs: 60_000,
        variants: { pri: { state: 'ready', proof: 'proven' }, time: { state: 'idle' } },
        schedules: { pri: selected, time: null },
      },
    },
    settings: { optimizationEnabled: true, scheduleEngine: 'optimized', scheduleObjective: 'pri' },
  };
  const downstream = workPackage('B', ['ana'], 'same-basis');
  const afterUpstream: FanoutWorkPackage = {
    ...upstream,
    settings: ready.settings,
    outcome: {
      kind: 'scheduled',
      fast: upstream.outcome.fast,
      optimization: {
        inputHash: 'same',
        generation: null,
        contractVersion: '7+0.3.0',
        budgetMs: 60_000,
        variants: { pri: { state: 'idle' }, time: { state: 'idle' } },
        schedules: { pri: null, time: null },
      },
    },
  };
  const before: CapturedFanout = {
    observation: { mode: 'shared', organizationId: 'org-a', workPackages: [ready, downstream] },
    dependency: null,
    localFacts: new Map([
      ['A', 'same'],
      ['B', 'same'],
    ]),
  };
  const after: CapturedFanout = {
    observation: {
      mode: 'shared',
      organizationId: 'org-a',
      workPackages: [afterUpstream, downstream],
    },
    dependency: null,
    localFacts: new Map([
      ['A', 'same'],
      ['B', 'same'],
    ]),
  };
  const comparison = compareSharedPeopleFanout({
    before: before.observation,
    after: after.observation,
    directCauses: ['A'],
  });
  expect(
    comparison.projections.find(({ workPackageId }) => workPackageId === 'A')?.bookingsChanged,
  ).toBe(true);
  expect(comparison.recipients).toEqual([{ workPackageId: 'B', causeWorkPackageId: 'A' }]);
  const committed = await recordCommittedFanout(
    openMemorySource().stores.eventLog,
    before,
    after,
    () => 1,
    ['A'],
  );
  expect(committed.map(({ workPackageId, event }) => [workPackageId, event])).toEqual([
    ['B', { type: 'elsewhere_changed', workPackageId: 'B', causeWorkPackageId: 'A' }],
  ]);
});

function dependencyCapture(
  facts: readonly (readonly [string, string])[],
  connections: readonly (readonly [string, string])[],
): CapturedFanout {
  return {
    observation: { mode: 'isolated', organizationId: 'org-a', workPackages: [] },
    localFacts: new Map(),
    dependency: {
      organizationId: 'org-a',
      workPackages: new Map(facts),
      connections: connections.map(([predecessorWorkPackageId, successorWorkPackageId]) => ({
        key: `${predecessorWorkPackageId}-${successorWorkPackageId}`,
        predecessorWorkPackageId,
        successorWorkPackageId,
      })),
    },
  };
}

it('invalidates a transitive dependency component without shared people or bookings', async () => {
  const before = dependencyCapture(
    [
      ['A', 'open'],
      ['B', 'same'],
      ['C', 'same'],
    ],
    [
      ['A', 'B'],
      ['B', 'C'],
    ],
  );
  const after = dependencyCapture(
    [
      ['A', 'complete'],
      ['B', 'same'],
      ['C', 'same'],
    ],
    [
      ['A', 'B'],
      ['B', 'C'],
    ],
  );
  const committed = await recordCommittedFanout(
    openMemorySource().stores.eventLog,
    before,
    after,
    () => 1,
  );
  expect(committed.map(({ event }) => event)).toEqual([
    { type: 'elsewhere_changed', workPackageId: 'B', causeWorkPackageId: 'A' },
    { type: 'elsewhere_changed', workPackageId: 'C', causeWorkPackageId: 'A' },
  ]);
});

it('refreshes surviving old and new components after topology changes', async () => {
  const facts = [
    ['A', 'same'],
    ['B', 'same'],
    ['C', 'same'],
    ['D', 'same'],
  ] as const;
  const before = dependencyCapture(facts, [
    ['A', 'B'],
    ['C', 'D'],
  ]);
  const after = dependencyCapture(facts, [
    ['A', 'C'],
    ['C', 'D'],
  ]);
  const committed = await recordCommittedFanout(
    openMemorySource().stores.eventLog,
    before,
    after,
    () => 1,
  );
  expect(
    committed.map(({ workPackageId, event }) => [
      workPackageId,
      event.type === 'elsewhere_changed' ? event.causeWorkPackageId : null,
    ]),
  ).toEqual([
    ['A', 'B'],
    ['A', 'C'],
    ['B', 'A'],
    ['C', 'A'],
    ['D', 'A'],
    ['D', 'C'],
  ]);
});

it('refreshes dependency recipients when authored relationship semantics change', async () => {
  const before = dependencyCapture(
    [
      ['A', 'same'],
      ['B', 'same'],
    ],
    [['A', 'B']],
  );
  if (before.dependency === null) throw new Error('missing dependency fixture');
  const after: CapturedFanout = {
    ...before,
    dependency: {
      ...before.dependency,
      connections: before.dependency.connections.map((edge) => ({
        ...edge,
        key: 'changed-FS-to-SS',
      })),
    },
  };
  const committed = await recordCommittedFanout(
    openMemorySource().stores.eventLog,
    before,
    after,
    () => 1,
  );
  expect(committed.map(({ event }) => event)).toEqual([
    { type: 'elsewhere_changed', workPackageId: 'A', causeWorkPackageId: 'B' },
    { type: 'elsewhere_changed', workPackageId: 'B', causeWorkPackageId: 'A' },
  ]);
});

it('refuses mismatched dependency capture organizations before recording events', () => {
  const before = dependencyCapture(
    [
      ['A', 'before'],
      ['B', 'same'],
    ],
    [['A', 'B']],
  );
  if (before.dependency === null) throw new Error('missing dependency fixture');
  const after: CapturedFanout = {
    ...before,
    dependency: { ...before.dependency, organizationId: 'org-b' },
  };
  expect(
    recordCommittedFanout(openMemorySource().stores.eventLog, before, after, () => 1),
  ).rejects.toThrow('dependency capture organizations are inconsistent');
});

it('does not invent a dependency path by mixing old and new topology edges', async () => {
  const facts = [
    ['A', 'same'],
    ['B', 'same'],
    ['C', 'same'],
  ] as const;
  const before = dependencyCapture(facts, [['A', 'B']]);
  const after = dependencyCapture(facts, [['B', 'C']]);
  const committed = await recordCommittedFanout(
    openMemorySource().stores.eventLog,
    before,
    after,
    () => 1,
  );
  expect(
    committed.map(({ workPackageId, event }) => [
      workPackageId,
      event.type === 'elsewhere_changed' ? event.causeWorkPackageId : null,
    ]),
  ).toEqual([
    ['A', 'B'],
    ['B', 'A'],
    ['B', 'C'],
    ['C', 'B'],
  ]);
});

it('refuses an explicit cause missing from the complete partitioned inventory', () => {
  const capture: CapturedFanout = {
    observation: { mode: 'shared', organizationId: 'org-a', workPackages: [] },
    dependency: {
      organizationId: 'org-a',
      workPackages: new Map([['A', 'connected']]),
      connections: [],
    },
    localFacts: new Map(),
  };
  expect(
    recordCommittedFanout(openMemorySource().stores.eventLog, capture, capture, () => 1, [
      'absent',
    ]),
  ).rejects.toThrow('direct cause absent from both captures');
});
