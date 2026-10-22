import { schedule } from '@wbs/domain';
import { openMemorySource } from '@wbs/store-memory';
import { expect, it } from 'bun:test';

import type { CapturedFanout } from '../ports/fanout-capture-store';
import { recordCommittedFanout } from './committed-fanout';
import { compareSharedPeopleFanout, type FanoutProject } from './shared-people-fanout';

function project(projectId: string, personIds: string[], incomingBasis: string): FanoutProject {
  const assigned = personIds.at(-1) ?? null;
  const planned = schedule(
    [{ id: `${projectId}-row`, parentId: null, position: 10, frozenNumber: null, priority: null }],
    [],
    [
      {
        workItemId: `${projectId}-row`,
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
    projectId,
    organizationId: 'org-a',
    name: projectId,
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
  const beforeProjects = [
    project('A', ['ana'], 'a'),
    project('B', ['ana', 'ben'], 'b'),
    project('C', ['ben'], 'old'),
  ];
  const afterProjects = [
    beforeProjects[0],
    project('B', ['ben'], 'b'),
    project('C', ['ben'], 'new'),
  ];
  const captured = (projects: FanoutProject[], bFact: string): CapturedFanout => ({
    observation: { mode: 'shared', organizationId: 'org-a', projects },
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
    captured(beforeProjects, 'old'),
    captured(afterProjects, 'new'),
    () => 1,
  );

  expect(committed.map(({ projectId, event }) => [projectId, event])).toEqual([
    ['C', { type: 'elsewhere_changed', projectId: 'C', causeProjectId: 'A' }],
    ['C', { type: 'elsewhere_changed', projectId: 'C', causeProjectId: 'B' }],
  ]);
  expect(await eventLog.rangeSince('project:C', -1)).toHaveLength(2);
});

it('uses an addressed retirement cause when selected display changes at equal local facts', async () => {
  const upstream = project('A', ['ana'], 'same-basis');
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
  const ready: FanoutProject = {
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
  const downstream = project('B', ['ana'], 'same-basis');
  const afterUpstream: FanoutProject = {
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
    observation: { mode: 'shared', organizationId: 'org-a', projects: [ready, downstream] },
    dependency: null,
    localFacts: new Map([
      ['A', 'same'],
      ['B', 'same'],
    ]),
  };
  const after: CapturedFanout = {
    observation: { mode: 'shared', organizationId: 'org-a', projects: [afterUpstream, downstream] },
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
  expect(comparison.projections.find(({ projectId }) => projectId === 'A')?.bookingsChanged).toBe(
    true,
  );
  expect(comparison.recipients).toEqual([{ projectId: 'B', causeProjectId: 'A' }]);
  const committed = await recordCommittedFanout(
    openMemorySource().stores.eventLog,
    before,
    after,
    () => 1,
    ['A'],
  );
  expect(committed.map(({ projectId, event }) => [projectId, event])).toEqual([
    ['B', { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' }],
  ]);
});

function dependencyCapture(
  facts: readonly (readonly [string, string])[],
  connections: readonly (readonly [string, string])[],
): CapturedFanout {
  return {
    observation: { mode: 'isolated', organizationId: 'org-a', projects: [] },
    localFacts: new Map(),
    dependency: {
      organizationId: 'org-a',
      projects: new Map(facts),
      connections: connections.map(([predecessorProjectId, successorProjectId]) => ({
        key: `${predecessorProjectId}-${successorProjectId}`,
        predecessorProjectId,
        successorProjectId,
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
    { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' },
    { type: 'elsewhere_changed', projectId: 'C', causeProjectId: 'A' },
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
    committed.map(({ projectId, event }) => [
      projectId,
      event.type === 'elsewhere_changed' ? event.causeProjectId : null,
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
    { type: 'elsewhere_changed', projectId: 'A', causeProjectId: 'B' },
    { type: 'elsewhere_changed', projectId: 'B', causeProjectId: 'A' },
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
    committed.map(({ projectId, event }) => [
      projectId,
      event.type === 'elsewhere_changed' ? event.causeProjectId : null,
    ]),
  ).toEqual([
    ['A', 'B'],
    ['B', 'A'],
    ['B', 'C'],
    ['C', 'B'],
  ]);
});
