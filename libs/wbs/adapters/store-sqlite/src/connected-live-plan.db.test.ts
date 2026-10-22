import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { servicesOver } from '@wbs/core/compose';
import { CREATOR_ADMISSION } from '@wbs/core/ports/edit-admission';
import { projectConnectedTree } from '@wbs/core/service/connected-tree';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { sliceKey } from '@wbs/domain';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { createLivePlanStore } from './chain-snapshot';
import { openConnection, openDatabase, openReadOnlyConnection } from './db';
import { createReadSnapshotLifetime } from './read-snapshot-lifetime';
import { openSqliteSource } from './source';
import { openSpaceDatabase } from './testing/space-database';

let folder: string;
let path: string;
const access = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
} as const;
function write(statement: string) {
  const client = openDatabase(path);
  try {
    client.run(statement);
  } finally {
    client.close();
  }
}
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'connected-live-'));
  path = await openSpaceDatabase(folder);
  write("UPDATE organization_activation SET state = 'activated', activated_at = 1");
  write(
    "INSERT INTO organization_membership (organization_id,user_id,role,created_at) VALUES ('org-a','ada','member',1)",
  );
  for (const id of ['a1', 'a2']) {
    write(
      `INSERT INTO work_item (id,project_id,position,name,readiness) VALUES ('${id}','${id}',10,'${id}','ready')`,
    );
    write(`INSERT INTO step (id,project_id,name,position) VALUES ('${id}-s','${id}','Build',10)`);
  }
  write(
    "INSERT INTO external_dependency (id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('edge','org-a','a2','a1','a2','a1','whole','whole','FS')",
  );
});
afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});
const reader = () =>
  createLivePlanStore({
    kind: 'owned',
    openConnection: () => openReadOnlyConnection(path),
    schedulerOf: () => fastScheduler,
  });

async function failureOf(pending: Promise<unknown>): Promise<Error> {
  try {
    await pending;
  } catch (failure) {
    if (failure instanceof Error) return failure;
    throw failure;
  }
  throw new Error('expected refusal');
}

test('actual isolated live route captures remote readiness without a calendar', async () => {
  const observed = await reader().read('a1', access);
  expect(observed.kind).toBe('connected');
  if (observed.kind !== 'connected') throw new Error('expected connected live route');
  expect(observed.projection.placement.kind).toBe('dependency_calendar_missing');
  expect(observed.readiness.eligibilityByNode.get(sliceKey('a1', 'a1-s'))?.canStart).toBe(false);
  expect([...observed.metadataByProject.keys()]).toEqual(['a1', 'a2']);
  write(
    "INSERT INTO step_progress (work_item_id,step_id,state,stated_at) VALUES ('a2','a2-s','done',1)",
  );
  const next = await reader().read('a1', access);
  if (next.kind !== 'connected') throw new Error('expected connected live route');
  expect(next.readiness.eligibilityByNode.get(sliceKey('a1', 'a1-s'))?.canStart).toBe(true);
  expect(observed.readiness.eligibilityByNode.get(sliceKey('a1', 'a1-s'))?.canStart).toBe(false);
});

test('connected export refuses instead of returning an incomplete document', async () => {
  expect((await failureOf(reader().readExport('a1', access))).message).toContain(
    'connected export is unsupported',
  );
});

test('remote hold changes the connected proxy reading in the next observation', async () => {
  const before = await reader().read('a1', access);
  if (before.kind !== 'connected') throw new Error('expected connected live route');
  write("UPDATE work_item SET hold = 'on_hold' WHERE id = 'a2'");
  const after = await reader().read('a1', access);
  if (after.kind !== 'connected') throw new Error('expected connected live route');
  expect(before.readiness.statuses.get('a1')).not.toBe('blocked_by_proxy');
  expect(after.readiness.statuses.get('a1')).toBe('blocked_by_proxy');
  expect(after.readiness.nodes.readings.get('a1')?.['a1-s']).toBe('blocked_by_proxy');
});

test('shared aggregate reuses one detached connected read with explicit member identity', async () => {
  write("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  write("INSERT INTO work_item (id,project_id,position,name) VALUES ('a3','a3',10,'a3')");
  write("INSERT INTO step (id,project_id,name,position) VALUES ('a3-s','a3','Build',10)");
  write("INSERT INTO person (id,name) VALUES ('p','P')");
  write(
    "INSERT INTO person_organization (resource_id,organization_id,name) VALUES ('p','org-a','P')",
  );
  for (const id of ['a1', 'a3'])
    write(`INSERT INTO assignment (work_item_id,step_id,person_id) VALUES ('${id}','${id}-s','p')`);
  const captured: string[] = [];
  const observed = await createLivePlanStore({
    kind: 'owned',
    openConnection: () => openReadOnlyConnection(path),
    schedulerOf: () => fastScheduler,
    captureRead: {
      afterFirstRead: ({ projectId }) => {
        captured.push(projectId);
        return Promise.resolve();
      },
    },
  }).readAggregate('ada', access);
  expect(observed.kind).toBe('shared');
  if (observed.kind !== 'shared') throw new Error('expected shared');
  expect(observed.entries.map((entry) => entry.projectId)).toEqual(['a1', 'a2', 'a3', 'a4']);
  const first = observed.entries.at(0);
  const second = observed.entries.at(1);
  if (first === undefined || second === undefined) throw new Error('expected members');
  expect(first.plan.kind).toBe('connected');
  expect(second.plan).toBe(first.plan);
  expect(first.basis).toBeNull();
  expect(second.basis).toBeNull();
  if (first.plan.kind !== 'connected' || second.plan.kind !== 'connected')
    throw new Error('expected connected');
  expect(projectConnectedTree(first.plan, 'a1').metadata.project.id).toBe('a1');
  expect(projectConnectedTree(second.plan, 'a2').metadata.project.id).toBe('a2');
  expect(first.plan.projection.placement.kind).toBe('dependency_calendar_missing');
  expect(captured.filter((id) => id === 'a1')).toHaveLength(1);
  expect(captured.filter((id) => id === 'a2')).toHaveLength(1);
  expect(captured.filter((id) => id === 'a3')).toHaveLength(1);
  expect(observed.entries[2]?.plan).toBe(first.plan);
  expect(observed.entries[3]?.plan.kind).toBe('shared');
});

test('a shared person peer selects the same external component from either target', async () => {
  write("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  write("INSERT INTO work_item (id,project_id,position,name) VALUES ('a3','a3',10,'a3')");
  write("INSERT INTO step (id,project_id,name,position) VALUES ('a3-s','a3','Build',10)");
  write("INSERT INTO person (id,name) VALUES ('p','P')");
  write(
    "INSERT INTO person_organization (resource_id,organization_id,name) VALUES ('p','org-a','P')",
  );
  for (const id of ['a1', 'a3']) {
    write(`INSERT INTO assignment (work_item_id,step_id,person_id) VALUES ('${id}','${id}-s','p')`);
  }
  const direct = await reader().read('a1', access);
  expect(direct.kind).toBe('connected');
  if (direct.kind !== 'connected') throw new Error('connected expected');
  expect(direct.projection.capture.projects.map((member) => member.projectId)).toEqual([
    'a1',
    'a2',
    'a3',
  ]);
  const peer = await reader().read('a3', access);
  expect(peer.kind).toBe('connected');
  if (peer.kind !== 'connected') throw new Error('connected expected');
  expect(peer.projection.capture.projects.map((member) => member.projectId)).toEqual([
    'a1',
    'a2',
    'a3',
  ]);
  expect(peer.projection.placement.kind).toBe('dependency_calendar_missing');
});

test('alternating person and external bridges select one component from every rank', async () => {
  write("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  write("DELETE FROM external_dependency WHERE id = 'edge'");
  for (const id of ['a3', 'a4']) {
    write(
      `INSERT INTO work_item (id,project_id,position,name) VALUES ('${id}','${id}',10,'${id}')`,
    );
    write(`INSERT INTO step (id,project_id,name,position) VALUES ('${id}-s','${id}','Build',10)`);
  }
  for (const personId of ['p', 'q']) {
    write(`INSERT INTO person (id,name) VALUES ('${personId}','${personId}')`);
    write(
      `INSERT INTO person_organization (resource_id,organization_id,name) VALUES ('${personId}','org-a','${personId}')`,
    );
  }
  for (const [id, personId] of [
    ['a1', 'p'],
    ['a2', 'p'],
    ['a3', 'q'],
    ['a4', 'q'],
  ])
    write(
      `INSERT INTO assignment (work_item_id,step_id,person_id) VALUES ('${id}','${id}-s','${personId}')`,
    );
  write(
    "INSERT INTO external_dependency (id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('bridge','org-a','a3','a2','a3','a2','whole','whole','FS')",
  );
  for (const id of ['a1', 'a2', 'a3', 'a4']) {
    const observed = await reader().read(id, access);
    expect(observed.kind).toBe('connected');
    if (observed.kind !== 'connected') throw new Error(`connected expected for ${id}`);
    expect(observed.projection.capture.projects.map((member) => member.projectId)).toEqual([
      'a1',
      'a2',
      'a3',
      'a4',
    ]);
    expect(observed.projection.placement.kind).toBe('dependency_calendar_missing');
  }
});

test('remote SS attempt evidence crosses actual SQLite live capture', async () => {
  write("UPDATE external_dependency SET type = 'SS' WHERE id = 'edge'");
  const before = await reader().read('a1', access);
  if (before.kind !== 'connected') throw new Error('expected connected');
  expect(before.readiness.eligibilityByNode.get(sliceKey('a1', 'a1-s'))?.canStart).toBe(false);
  write(
    "INSERT INTO step_node_attempt (work_item_id,step_id,attempt_number,started_at,ended_at,outcome) VALUES ('a2','a2-s',1,1,2,'failed')",
  );
  const after = await reader().read('a1', access);
  if (after.kind !== 'connected') throw new Error('expected connected');
  expect(after.readiness.eligibilityByNode.get(sliceKey('a1', 'a1-s'))?.canStart).toBe(true);
  expect(after.metadataByProject.get('a2')?.attempts).toHaveLength(1);
});

test('unconnected isolated routing query count is independent of local edges', async () => {
  write("DELETE FROM external_dependency WHERE id = 'edge'");
  async function count() {
    const queries: string[] = [];
    const observed = await createLivePlanStore({
      kind: 'owned',
      openConnection: () =>
        openReadOnlyConnection(path, {
          logQuery(query) {
            queries.push(query);
          },
        }),
      schedulerOf: () => fastScheduler,
    }).read('a1', access);
    expect(observed.kind).toBe('isolated');
    return queries.length;
  }
  const empty = await count();
  for (let at = 0; at < 20; at++) {
    const number = String(at);
    const predecessor = String(at - 1);
    write(
      `INSERT INTO work_item (id,project_id,position,name) VALUES ('local-${number}','a1',${String(at + 20)},'local-${number}')`,
    );
    if (at > 0)
      write(
        `INSERT INTO typed_dependency (id,project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('local-edge-${number}','a1','local-${predecessor}','local-${number}','whole','whole','FS')`,
      );
  }
  const with19LocalRelationships = await count();
  expect(with19LocalRelationships).toBe(empty);
  expect(empty).toBeLessThanOrEqual(10);
});

test('execution observation captures FS prerequisites without invoking any scheduler', async () => {
  const execution = createLivePlanStore({
    kind: 'owned',
    openConnection: () => openReadOnlyConnection(path),
    schedulerOf: () => {
      throw new Error('execution must not invoke scheduler');
    },
  });
  const first = await execution.readExecution('a1', access, null);
  expect(first.kind).toBe('ready');
  if (first.kind !== 'ready') throw new Error('execution observation missing');
  expect(first.reads.eligibilityByNode.get(sliceKey('a1', 'a1-s'))?.canStart).toBe(false);
  write(
    "INSERT INTO step_progress (work_item_id,step_id,state,stated_at) VALUES ('a2','a2-s','done',1)",
  );
  const next = await execution.readExecution('a1', access, null);
  if (next.kind !== 'ready') throw new Error('execution observation missing');
  expect(next.reads.eligibilityByNode.get(sliceKey('a1', 'a1-s'))?.canStart).toBe(true);
  expect(first.reads.eligibilityByNode.get(sliceKey('a1', 'a1-s'))?.canStart).toBe(false);
});

test('execution observation rechecks membership and activation before materializing foreign evidence', async () => {
  write("DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='ada'");
  expect(await reader().readExecution('a1', access, null)).toEqual({
    kind: 'access_refused',
    refusal: 'not_a_member',
  });
  expect(await reader().readExecution('a1', { kind: 'legacy' }, null)).toEqual({
    kind: 'access_refused',
    refusal: 'no_active_organization',
  });
});

test('execution observation refuses foreign and absent targets alike', async () => {
  expect(await reader().readExecution('b1', access, null)).toEqual({ kind: 'not_found' });
  expect(await reader().readExecution('absent', access, null)).toEqual({ kind: 'not_found' });
});

test('borrowed service claim sees staged remote completion and collects its normal announcement', async () => {
  write("INSERT INTO person (id,name,account_id) VALUES ('executor','Executor','ada')");
  write(
    "INSERT INTO person_organization (resource_id,organization_id,name) VALUES ('executor','org-a','Executor')",
  );
  const source = openSqliteSource({ dbPath: path }).bindLivePlans({
    schedulerOf: () => {
      throw new Error('claim must not invoke scheduler');
    },
  });
  try {
    await source.uow.run(async (scope) => {
      const graph = servicesOver(scope.stores, {
        dependencyContext: createLocalDependencyContext(scope.stores),
        admission: CREATOR_ADMISSION,
        clock: testClock,
        broadcast: recordingBroadcaster(),
        scheduler: fastScheduler,
      });
      const input = {
        personId: 'executor',
        stepIds: ['a1-s'],
        runId: null,
        parentClaimId: null,
        assign: false,
        resources: null,
      };
      const blocked = await graph.workItems.collect(() =>
        graph.workItems.claim('a1', 'ada', input, access, null),
      );
      expect(blocked.result).toMatchObject({ ok: false, reason: 'prerequisites_unmet' });
      await scope.stores.progress.set(
        { workItemId: 'a2', stepId: 'a2-s', state: 'done', statedAt: 1 },
        { at: 1, by: 'ada' },
      );
      const accepted = await graph.workItems.collect(() =>
        graph.workItems.claim('a1', 'ada', input, access, null),
      );
      expect(accepted.result).toMatchObject({ ok: true, value: { alreadyHeld: false } });
      expect(accepted.dirty).toBe(true);
      expect(accepted.recordings).toHaveLength(1);
      expect(await scope.stores.claims.listByProject('a1')).toHaveLength(1);
      return { commit: false, value: undefined };
    });
  } finally {
    await source.close();
  }
});

test('foreign holder labels remain captured after closure and subsequent live renames', async () => {
  write("UPDATE organization SET shared_people=1 WHERE id='org-a'");
  write("UPDATE project SET start_date='2026-10-05' WHERE id IN ('a1','a2')");
  write("UPDATE external_dependency SET type='SS' WHERE id='edge'");
  write("INSERT INTO person(id,name) VALUES ('holder-person','Root holder')");
  write(
    "INSERT INTO person_organization(resource_id,organization_id,name) VALUES ('holder-person','org-a','Local holder')",
  );
  for (const id of ['a1', 'a2']) {
    write(
      `INSERT INTO assignment(work_item_id,step_id,person_id) VALUES ('${id}','${id}-s','holder-person')`,
    );
    write(
      `INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES ('${id}','${id}-s',1,1,1)`,
    );
  }
  let sealed = false;
  let opened = 0;
  const source = createLivePlanStore({
    kind: 'owned',
    openConnection: () => {
      if (sealed) throw new Error('captured holder display attempted another live read');
      opened++;
      return openReadOnlyConnection(path);
    },
    schedulerOf: () => fastScheduler,
  });
  const captured = await source.read('a1', access);
  if (captured.kind !== 'connected') throw new Error('expected captured component');
  const first = projectConnectedTree(captured, 'a1');
  expect(first.elsewhereHolders).toHaveLength(1);
  sealed = true;
  write("UPDATE project SET name='New live project' WHERE id='a2'");
  write("UPDATE work_item SET name='New live row',frozen_number='999' WHERE id='a2'");
  write("UPDATE person_organization SET name='New live person' WHERE resource_id='holder-person'");
  const retained = projectConnectedTree(captured, 'a1');
  expect(retained.elsewhereHolders).toEqual(first.elsewhereHolders);
  expect(retained.reads.people.find((person) => person.id === 'holder-person')?.name).toBe(
    'Local holder',
  );
  expect(opened).toBe(1);
});

test('shared aggregate schedules disconnected external components once each', async () => {
  write("UPDATE organization SET shared_people=1 WHERE id='org-a'");
  for (const id of ['a3', 'a4']) {
    write(
      `INSERT INTO work_item(id,project_id,position,name,readiness) VALUES ('${id}','${id}',10,'${id}','ready')`,
    );
    write(`INSERT INTO step(id,project_id,name,position) VALUES ('${id}-s','${id}','Build',10)`);
  }
  write(
    "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('second','org-a','a4','a3','a4','a3','whole','whole','FS')",
  );
  write(
    "UPDATE project SET start_date='2026-10-19',estimate_method='realistic',estimate_rounding='exact'",
  );
  for (const id of ['a1', 'a2', 'a3', 'a4'])
    write(
      `INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES ('${id}','${id}-s',2,2,2)`,
    );
  const captured: string[] = [];
  let scheduled = 0;
  const queries: string[] = [];
  const observed = await createLivePlanStore({
    kind: 'owned',
    openConnection: () =>
      openReadOnlyConnection(path, {
        logQuery: (query) => {
          queries.push(query);
        },
      }),
    captureRead: {
      afterFirstRead: ({ projectId }) => {
        captured.push(projectId);
        return Promise.resolve();
      },
    },
    schedulerOf: () => ({
      ...fastScheduler,
      readResolvedFast: (input) => {
        scheduled++;
        return fastScheduler.readResolvedFast(input);
      },
    }),
  }).readAggregate('ada', access);
  if (observed.kind !== 'shared') throw new Error('expected shared');
  expect(observed.entries.map(({ projectId }) => projectId)).toEqual(['a1', 'a2', 'a3', 'a4']);
  expect(scheduled).toBe(2);
  expect(queries.filter((query) => query.includes('from "step_node_attempt"'))).toHaveLength(4);
  expect(captured.sort()).toEqual(['a1', 'a2', 'a3', 'a4']);
  for (const [successorId, predecessorId] of [
    ['a1', 'a2'],
    ['a3', 'a4'],
  ]) {
    const successor = observed.entries.find(({ projectId }) => projectId === successorId);
    const predecessor = observed.entries.find(({ projectId }) => projectId === predecessorId);
    if (successor?.plan.kind !== 'connected' || predecessor?.plan.kind !== 'connected')
      throw new Error('expected connected');
    expect(successor.plan).toBe(predecessor.plan);
    const target = projectConnectedTree(successor.plan, successorId);
    const upstream = projectConnectedTree(predecessor.plan, predecessorId);
    expect(target.placement.kind).toBe('scheduled');
    expect(upstream.placement.kind).toBe('scheduled');
    const direct = await reader().read(successorId, access);
    if (direct.kind !== 'connected') throw new Error('expected connected');
    expect(target.placement).toEqual(projectConnectedTree(direct, successorId).placement);
  }
});

test('shared aggregate captures calendars links and metadata in one observation', async () => {
  write("UPDATE organization SET shared_people=1 WHERE id='org-a'");
  write("UPDATE project SET start_date='2026-10-19'");
  let edited = false;
  const store = createLivePlanStore({
    kind: 'owned',
    openConnection: () => openReadOnlyConnection(path),
    schedulerOf: () => fastScheduler,
    captureRead: {
      afterFirstRead: () => {
        if (edited) return Promise.resolve();
        edited = true;
        write("UPDATE project SET start_date='2026-10-26',name='Next remote' WHERE id='a2'");
        write("UPDATE work_item SET name='Next row' WHERE id='a2'");
        write("UPDATE external_dependency SET type='SS' WHERE id='edge'");
        return Promise.resolve();
      },
    },
  });
  const first = await store.readAggregate('ada', access);
  const next = await store.readAggregate('ada', access);
  if (first.kind !== 'shared' || next.kind !== 'shared') throw new Error('expected shared');
  const oldRead = first.entries.at(0)?.plan;
  const newRead = next.entries.at(0)?.plan;
  if (oldRead?.kind !== 'connected' || newRead?.kind !== 'connected')
    throw new Error('expected connected');
  const oldTree = projectConnectedTree(oldRead, 'a1');
  const newTree = projectConnectedTree(newRead, 'a1');
  expect(oldRead.metadataByProject.get('a2')?.project.name).toBe('a2');
  expect(newRead.metadataByProject.get('a2')?.project.name).toBe('Next remote');
  expect(oldRead.metadataByProject.get('a2')?.workItems[0]?.name).toBe('a2');
  expect(newRead.metadataByProject.get('a2')?.workItems[0]?.name).toBe('Next row');
  expect(oldTree.dependencies[0]?.type).toBe('FS');
  expect(newTree.dependencies[0]?.type).toBe('SS');
  expect(
    oldRead.projection.capture.projects.find(({ projectId }) => projectId === 'a2')?.reads.project
      .startDate,
  ).toBe('2026-10-19');
  expect(
    newRead.projection.capture.projects.find(({ projectId }) => projectId === 'a2')?.reads.project
      .startDate,
  ).toBe('2026-10-26');
});

test('borrowed shared aggregate sees staged relationships and expires without owning the transaction', async () => {
  write("UPDATE organization SET shared_people=1 WHERE id='org-a'");
  write("DELETE FROM external_dependency WHERE id='edge'");
  const connection = openConnection(path);
  const lifetime = createReadSnapshotLifetime();
  connection.db.run(sql.raw('BEGIN IMMEDIATE'));
  try {
    connection.db.run(
      sql.raw(
        "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('staged','org-a','a2','a1','a2','a1','whole','whole','FS')",
      ),
    );
    const store = createLivePlanStore({
      kind: 'borrowed',
      db: connection.db,
      lifetime,
      schedulerOf: () => fastScheduler,
    });
    const observed = await store.readAggregate('ada', access);
    if (observed.kind !== 'shared') throw new Error('expected shared');
    expect(observed.entries.at(0)?.plan.kind).toBe('connected');
    const plan = observed.entries.at(0)?.plan;
    if (plan?.kind !== 'connected') throw new Error('expected connected');
    expect(projectConnectedTree(plan, 'a1').dependencies.map(({ id }) => id)).toEqual(['staged']);
    expect(() => connection.db.run(sql.raw('BEGIN IMMEDIATE'))).toThrow(
      'Failed query: BEGIN IMMEDIATE',
    );
    lifetime.expire();
    expect((await failureOf(store.readAggregate('ada', access))).message).toContain('closed');
    expect(() => connection.db.run(sql.raw('BEGIN IMMEDIATE'))).toThrow(
      'Failed query: BEGIN IMMEDIATE',
    );
  } finally {
    lifetime.expire();
    connection.db.run(sql.raw('ROLLBACK'));
    connection.close();
  }
  const next = await reader().readAggregate('ada', access);
  if (next.kind !== 'shared') throw new Error('expected shared');
  expect(next.entries.at(0)?.plan.kind).toBe('shared');
});

test.each(['calendar', 'optimized'] as const)(
  'shared aggregate unavailable %s allocates no durable solver or execution work',
  async (reason) => {
    write("UPDATE organization SET shared_people=1 WHERE id='org-a'");
    if (reason === 'optimized') {
      write("UPDATE project SET start_date='2026-10-19'");
      write("UPDATE project SET schedule_engine='optimized',optimization_enabled=1 WHERE id='a2'");
    }
    function snapshotSolverState() {
      const client = openDatabase(path);
      try {
        return [
          'optimization_generation',
          'optimized_schedule_cache',
          'solver_slot',
          'solver_queue',
          'step_node_attempt',
          'step_node_attempt_issued',
          'event_log',
        ].map((table) => client.query(`SELECT * FROM ${table}`).all());
      } finally {
        client.close();
      }
    }
    const before = snapshotSolverState();
    const observed = await reader().readAggregate('ada', access);
    if (observed.kind !== 'shared') throw new Error('expected shared');
    const plan = observed.entries.at(0)?.plan;
    if (plan?.kind !== 'connected') throw new Error('expected connected');
    expect(plan.projection.placement.kind).toBe(
      reason === 'calendar' ? 'dependency_calendar_missing' : 'engine_unavailable',
    );
    expect(snapshotSolverState()).toEqual(before);
  },
);
