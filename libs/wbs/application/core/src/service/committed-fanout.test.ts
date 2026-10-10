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
        contractVersion: '7+0.2.0',
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
        contractVersion: '7+0.2.0',
        budgetMs: 60_000,
        variants: { pri: { state: 'idle' }, time: { state: 'idle' } },
        schedules: { pri: null, time: null },
      },
    },
  };
  const before: CapturedFanout = {
    observation: { mode: 'shared', organizationId: 'org-a', projects: [ready, downstream] },
    localFacts: new Map([
      ['A', 'same'],
      ['B', 'same'],
    ]),
  };
  const after: CapturedFanout = {
    observation: { mode: 'shared', organizationId: 'org-a', projects: [afterUpstream, downstream] },
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
