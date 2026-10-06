import { schedule } from '@wbs/domain';
import { openMemorySource } from '@wbs/store-memory';
import { expect, it } from 'bun:test';

import type { CapturedFanout } from '../ports/fanout-capture-store';
import { recordCommittedFanout } from './committed-fanout';
import type { FanoutProject } from './shared-people-fanout';

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
