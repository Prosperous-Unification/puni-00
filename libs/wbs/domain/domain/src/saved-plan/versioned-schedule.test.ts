import { describe, expect, test } from 'bun:test';

import type { Schedule } from '../schedule';
import { SCHEDULE_ALGORITHM_ID } from '../schedule';
import { workdayOrdinalOf } from '../workday';
import { connectedHistoryFixture } from './connected-history.fixture';
import { readSavedConnectedScheduleEvidence } from './connected-schedule';
import { readSavedDependencyHistory } from './dependency-history';
import {
  buildConnectedScheduleBody,
  CONNECTED_SCHEDULE_ALGORITHM_ID,
  readSavedConnectedScheduleBody,
  serializeSavedConnectedScheduleBody,
} from './versioned-schedule';

function buildTargetFixture() {
  const { history, evidence } = connectedHistoryFixture();
  // The codec fixture's arbitrary common-axis origin predates real calendar validation.
  const encoded = JSON.stringify(evidence)
    .replaceAll('20727', String(workdayOrdinalOf('2026-10-01')))
    .replaceAll('20728', String(workdayOrdinalOf('2026-10-02')));
  const connection = readSavedConnectedScheduleEvidence(JSON.parse(encoded));
  const dependencyHistory = readSavedDependencyHistory(history);
  if (dependencyHistory.kind !== 'connected') throw new Error('expected connected fixture');
  const planned: Schedule = {
    workItems: new Map(Object.entries(connection.composite.workItems).filter(([id]) => id === 'a')),
    slices: new Map(
      Object.entries(connection.composite.slices)
        .filter(([, slice]) => slice.workItemId === 'a')
        .map(([key, slice]) => [
          key,
          { ...slice, capacityPredecessorIds: [...slice.capacityPredecessorIds] },
        ]),
    ),
    waitingForPerson: 0,
    waitingForCapacity: 0,
    eventsVisited: 7,
  };
  return { planned, dependencyHistory, connection };
}

describe('connected schedule body builder', () => {
  test('canonicalizes reversed idle members without changing stage execution order', () => {
    const { history, evidence } = connectedHistoryFixture();
    const dependencyHistory = readSavedDependencyHistory({
      ...history,
      projects: history.projects.map((project) => ({
        ...project,
        startDate: null,
        workItems: [],
        steps: [],
      })),
      relationships: [],
      graph: { nodes: [], edges: [] },
      ownership: [],
      readiness: [],
    });
    if (dependencyHistory.kind !== 'connected') throw new Error('expected connected fixture');
    const planned: Schedule = {
      workItems: new Map(),
      slices: new Map(),
      waitingForPerson: 0,
      waitingForCapacity: 0,
      eventsVisited: 0,
    };
    const placement = { workItems: {}, slices: {}, waitingForPerson: 0, waitingForCapacity: 0 };
    const connection = readSavedConnectedScheduleEvidence({
      ...evidence,
      originOrdinal: null,
      baseline: placement,
      composite: placement,
      stages: [],
      idleProjects: ['A', 'B'],
    });
    const forward = buildConnectedScheduleBody(planned, null, dependencyHistory, connection);
    const reverse = buildConnectedScheduleBody(planned, null, dependencyHistory, {
      ...connection,
      idleProjects: ['B', 'A'],
    });
    expect(serializeSavedConnectedScheduleBody(reverse)).toBe(
      serializeSavedConnectedScheduleBody(forward),
    );
    expect(reverse.connection.idleProjects).toEqual(['B', 'A']);

    const active = buildTargetFixture();
    const body = buildConnectedScheduleBody(
      active.planned,
      '2026-10-01',
      active.dependencyHistory,
      active.connection,
    );
    const stages = [...body.connection.stages].reverse();
    const reordered = readSavedConnectedScheduleBody(
      JSON.parse(
        serializeSavedConnectedScheduleBody({
          ...body,
          connection: { ...body.connection, stages },
        }),
      ),
    );
    expect(reordered.connection.stages.map((stage) => stage.projectId)).toEqual(
      stages.map((stage) => stage.projectId),
    );
  });

  test('serializes deterministic independent bytes after caller maps change', () => {
    const { planned, dependencyHistory, connection } = buildTargetFixture();
    const body = buildConnectedScheduleBody(planned, '2026-10-01', dependencyHistory, connection);
    const bytes = serializeSavedConnectedScheduleBody(body);
    expect(
      serializeSavedConnectedScheduleBody({
        ...body,
        slices: Object.fromEntries(Object.entries(body.slices).reverse()),
      }),
    ).toBe(bytes);
    planned.slices.clear();
    planned.workItems.clear();
    expect(serializeSavedConnectedScheduleBody(body)).toBe(bytes);
    expect(Object.keys(readSavedConnectedScheduleBody(JSON.parse(bytes)).slices)).toHaveLength(2);
  });

  test('dates the selected target and validates retained connection evidence before returning v2', () => {
    const { planned, dependencyHistory, connection } = buildTargetFixture();
    const body = buildConnectedScheduleBody(planned, '2026-10-01', dependencyHistory, connection);
    expect(CONNECTED_SCHEDULE_ALGORITHM_ID).toBe(`connected-selection-v1:${SCHEDULE_ALGORITHM_ID}`);
    expect(body.version).toBe(2);
    expect(body.algorithmId).toBe(CONNECTED_SCHEDULE_ALGORITHM_ID);
    expect(body.workItems['a'].startsOn).toBe('2026-10-01');
    expect(body.slices['a\u0000design'].startsOn).toBe('2026-10-02');
    expect(body.connection).toEqual(connection);
    expect(body).not.toHaveProperty('eventsVisited');
    expect(Object.isFrozen(body)).toBe(true);
  });

  test('refuses target membership omissions before writer admission', () => {
    const { planned, dependencyHistory, connection } = buildTargetFixture();
    expect(() =>
      buildConnectedScheduleBody(
        { ...planned, slices: new Map() },
        '2026-10-01',
        dependencyHistory,
        connection,
      ),
    ).toThrow('target_membership');
  });

  test('refuses mismatched cross-body placement state', () => {
    const { planned, dependencyHistory, connection } = buildTargetFixture();
    expect(() =>
      buildConnectedScheduleBody(
        planned,
        '2026-10-01',
        { ...dependencyHistory, placementState: { kind: 'unavailable', reason: 'cycle' } },
        connection,
      ),
    ).toThrow('placement_state');
  });

  test('refuses an anchor that would reinterpret captured dates', () => {
    const { planned, dependencyHistory, connection } = buildTargetFixture();
    expect(() =>
      buildConnectedScheduleBody(planned, '2026-10-02', dependencyHistory, connection),
    ).toThrow('target_anchor');
  });
});
