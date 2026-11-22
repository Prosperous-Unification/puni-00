import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { servicesOver } from '@wbs/core/compose';
import { LEGACY_EDIT_ADMISSION } from '@wbs/core/ports/edit-admission';
import { workPackageConnectedTree } from '@wbs/core/service/connected-tree';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { canonicalConnectedStageInput, sliceKey } from '@wbs/domain';
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { createLivePlanStore } from './chain-snapshot';
import { captureConnectedQuestion } from './connected-question-identity';
import { openConnection, openDatabase, openReadOnlyConnection } from './db';
import { createReadSnapshotLifetime } from './read-snapshot-lifetime';
import { optimizedScheduleCache } from './schema';
import { openSqliteSource } from './source';
import { seedDependencyAuthority } from './testing/dependency-activation';
import { CAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { openSpaceDatabase } from './testing/space-database';
import { WorkItemRepository } from './work-item';
import { WorkPackageRepository } from './work-package';

let folder: string;
let path: string;
const access = {
  principal: { id: 'ada' },
  kind: 'scoped',
  scope: { cap: null, organizationId: 'org-a', userId: 'ada', role: 'member' },
} as const;
function write(statement: string) {
  const client = openDatabase(path);
  try {
    client.run(statement);
  } finally {
    client.close();
  }
}
function seedBuildStep(workPackageId: string): void {
  const client = openDatabase(path);
  const projectId = 'project-' + workPackageId;
  const stepId = workPackageId + '-s';
  try {
    client.transaction(() => {
      client.run(
        "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES(?,'org-a',?,1,'ada')",
        [projectId, projectId],
      );
      client.run('UPDATE work_package SET project_id=? WHERE id=?', [projectId, workPackageId]);
      client.run(
        "INSERT INTO step_definition(id,organization_id,code,name,estimate_unit,default_allowance_bps,position,defined_at_scope_kind,defined_at_scope_id,origin) VALUES(?,'org-a',?,?,'workdays',0,10,'project',?,'authored')",
        [stepId, stepId, 'Build ' + workPackageId, projectId],
      );
      client.run(
        "INSERT INTO step_binding(id,organization_id,scope_kind,scope_id,step_id,position,origin) VALUES(?,'org-a','project',?,?,10,'authored')",
        ['binding-' + stepId, projectId, stepId],
      );
      client.run(
        "INSERT INTO work_package_step(work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision) VALUES(?,?,'workdays',0,0)",
        [workPackageId, stepId],
      );
    })();
  } finally {
    client.close();
  }
}
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'connected-live-'));
  path = await openSpaceDatabase(folder);
  seedDependencyAuthority(path);
  write("UPDATE organization_activation SET state = 'activated', activated_at = 1");
  for (const id of ['a1', 'a2']) {
    write(
      `INSERT INTO work_item (id,work_package_id,position,name,readiness) VALUES ('${id}','${id}',10,'${id}','ready')`,
    );
    seedBuildStep(id);
  }
  write(
    "INSERT INTO external_dependency (id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('edge','org-a','a2','a1','a2','a1','whole','whole','FS')",
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
  expect([...observed.metadataByWorkPackage.keys()]).toEqual(['a1', 'a2']);
  write(
    "INSERT INTO step_progress (work_item_id,step_id,state,stated_at) VALUES ('a2','a2-s','done',1)",
  );
  const next = await reader().read('a1', access);
  if (next.kind !== 'connected') throw new Error('expected connected live route');
  expect(next.readiness.eligibilityByNode.get(sliceKey('a1', 'a1-s'))?.canStart).toBe(true);
  expect(observed.readiness.eligibilityByNode.get(sliceKey('a1', 'a1-s'))?.canStart).toBe(false);
});

test('connected export captures required detached document evidence without a calendar', async () => {
  const observed = await reader().readExport('a1', access);
  expect(observed.kind).toBe('connected');
  if (observed.kind !== 'connected') throw new Error('expected connected export');
  expect(observed.workPackageId).toBe('a1');
  expect(observed.document.markers).toEqual([]);
  expect(observed.document.stepParallels).toEqual([]);
  expect(observed.projection.placement.kind).toBe('dependency_calendar_missing');
  write("UPDATE work_package SET name = 'Next' WHERE id = 'a2'");
  expect(observed.metadataByWorkPackage.get('a2')?.workPackage.name).not.toBe('Next');
  const next = await reader().readExport('a1', access);
  if (next.kind !== 'connected') throw new Error('expected connected export');
  expect(next.metadataByWorkPackage.get('a2')?.workPackage.name).toBe('Next');
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

test.each(['isolated', 'shared'] as const)(
  '%s aggregate reuses one detached connected read with explicit member identity',
  async (mode) => {
    write(
      `UPDATE organization SET shared_people=${mode === 'shared' ? '1' : '0'} WHERE id='org-a'`,
    );
    write("INSERT INTO work_item (id,work_package_id,position,name) VALUES ('a3','a3',10,'a3')");
    seedBuildStep('a3');
    write("INSERT INTO person (id,name) VALUES ('p','P')");
    write(
      "INSERT INTO person_organization (resource_id,organization_id,name) VALUES ('p','org-a','P')",
    );
    for (const id of ['a1', 'a3'])
      write(
        `INSERT INTO assignment (work_item_id,step_id,person_id) VALUES ('${id}','${id}-s','p')`,
      );
    const captured: string[] = [];
    const observed = await createLivePlanStore({
      kind: 'owned',
      openConnection: () => openReadOnlyConnection(path),
      schedulerOf: () => fastScheduler,
      captureRead: {
        afterFirstRead: ({ workPackageId }) => {
          captured.push(workPackageId);
          return Promise.resolve();
        },
      },
    }).readAggregate('ada', access);
    expect(observed.kind).toBe(mode === 'shared' ? 'shared' : 'isolated-connected');
    if (observed.kind !== 'shared' && observed.kind !== 'isolated-connected')
      throw new Error('expected shared');
    expect(observed.entries.map((entry) => entry.workPackageId)).toEqual(['a1', 'a2', 'a3', 'a4']);
    const first = observed.entries.at(0);
    const second = observed.entries.at(1);
    if (first === undefined || second === undefined) throw new Error('expected members');
    expect(first.plan.kind).toBe('connected');
    expect(second.plan).toBe(first.plan);
    expect(first.basis).toBeNull();
    expect(second.basis).toBeNull();
    if (first.plan.kind !== 'connected' || second.plan.kind !== 'connected')
      throw new Error('expected connected');
    expect(workPackageConnectedTree(first.plan, 'a1').metadata.workPackage.id).toBe('a1');
    expect(workPackageConnectedTree(second.plan, 'a2').metadata.workPackage.id).toBe('a2');
    expect(first.plan.projection.placement.kind).toBe('dependency_calendar_missing');
    expect(captured.filter((id) => id === 'a1')).toHaveLength(1);
    expect(captured.filter((id) => id === 'a2')).toHaveLength(1);
    expect(captured.filter((id) => id === 'a3')).toHaveLength(1);
    if (mode === 'shared') expect(observed.entries[2]?.plan).toBe(first.plan);
    else {
      expect(observed.entries[2]?.plan.kind).toBe('local');
      expect(
        first.plan.projection.capture.workPackages.map(({ workPackageId }) => workPackageId),
      ).toEqual(['a1', 'a2']);
    }
    expect(observed.entries[3]?.plan.kind).toBe(mode === 'shared' ? 'shared' : 'local');
  },
);

test('a shared person peer selects the same external component from either target', async () => {
  write("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  write("INSERT INTO work_item (id,work_package_id,position,name) VALUES ('a3','a3',10,'a3')");
  seedBuildStep('a3');
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
  expect(direct.projection.capture.workPackages.map((member) => member.workPackageId)).toEqual([
    'a1',
    'a2',
    'a3',
  ]);
  const peer = await reader().read('a3', access);
  expect(peer.kind).toBe('connected');
  if (peer.kind !== 'connected') throw new Error('connected expected');
  expect(peer.projection.capture.workPackages.map((member) => member.workPackageId)).toEqual([
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
      `INSERT INTO work_item (id,work_package_id,position,name) VALUES ('${id}','${id}',10,'${id}')`,
    );
    seedBuildStep(id);
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
    "INSERT INTO external_dependency (id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('bridge','org-a','a3','a2','a3','a2','whole','whole','FS')",
  );
  for (const id of ['a1', 'a2', 'a3', 'a4']) {
    const observed = await reader().read(id, access);
    expect(observed.kind).toBe('connected');
    if (observed.kind !== 'connected') throw new Error(`connected expected for ${id}`);
    expect(observed.projection.capture.workPackages.map((member) => member.workPackageId)).toEqual([
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
  expect(after.metadataByWorkPackage.get('a2')?.attempts).toHaveLength(1);
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
      `INSERT INTO work_item (id,work_package_id,position,name) VALUES ('local-${number}','a1',${String(at + 20)},'local-${number}')`,
    );
    if (at > 0)
      write(
        `INSERT INTO typed_dependency (id,work_package_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('local-edge-${number}','a1','local-${predecessor}','local-${number}','whole','whole','FS')`,
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
  const source = openSqliteSource({
    dependencyCapability: CAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
    organizationDefaultLimits: {
      maxAgentPersons: 50,
      maxConcurrentClaims: 200,
      maxCapacityUnitsPerResource: 10_000,
    },
  }).bindLivePlans({
    schedulerOf: () => {
      throw new Error('claim must not invoke scheduler');
    },
  });
  try {
    await source.uow.run(async (scope) => {
      const graph = servicesOver(scope.stores, {
        dependencyContext: createLocalDependencyContext(scope.stores),
        admission: LEGACY_EDIT_ADMISSION,
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
      expect(await scope.stores.claims.listByWorkPackage('a1')).toHaveLength(1);
      return { commit: false, value: undefined };
    });
  } finally {
    await source.close();
  }
});

test('foreign holder labels remain captured after closure and subsequent live renames', async () => {
  write("UPDATE organization SET shared_people=1 WHERE id='org-a'");
  write("UPDATE work_package SET start_date='2026-10-05' WHERE id IN ('a1','a2')");
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
  const first = workPackageConnectedTree(captured, 'a1');
  expect(first.elsewhereHolders).toHaveLength(1);
  sealed = true;
  write("UPDATE work_package SET name='New live work_package' WHERE id='a2'");
  write("UPDATE work_item SET name='New live row',frozen_number='999' WHERE id='a2'");
  write("UPDATE person_organization SET name='New live person' WHERE resource_id='holder-person'");
  const retained = workPackageConnectedTree(captured, 'a1');
  expect(retained.elsewhereHolders).toEqual(first.elsewhereHolders);
  expect(retained.reads.people.find((person) => person.id === 'holder-person')?.name).toBe(
    'Local holder',
  );
  expect(opened).toBe(1);
});

test.each(['isolated', 'shared'] as const)(
  '%s aggregate schedules disconnected external components once each',
  async (mode) => {
    write(
      `UPDATE organization SET shared_people=${mode === 'shared' ? '1' : '0'} WHERE id='org-a'`,
    );
    for (const id of ['a3', 'a4']) {
      write(
        `INSERT INTO work_item(id,work_package_id,position,name,readiness) VALUES ('${id}','${id}',10,'${id}','ready')`,
      );
      seedBuildStep(id);
    }
    write(
      "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('second','org-a','a4','a3','a4','a3','whole','whole','FS')",
    );
    write(
      "UPDATE work_package SET start_date='2026-10-19',estimate_method='realistic',estimate_rounding='exact'",
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
        afterFirstRead: ({ workPackageId }) => {
          captured.push(workPackageId);
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
    if (observed.kind !== 'shared' && observed.kind !== 'isolated-connected')
      throw new Error('expected shared');
    expect(observed.entries.map(({ workPackageId }) => workPackageId)).toEqual([
      'a1',
      'a2',
      'a3',
      'a4',
    ]);
    expect(scheduled).toBe(2);
    expect(
      queries.filter((query) => query.includes('FROM step_node_attempt f LEFT JOIN work_item')),
    ).toHaveLength(4);
    expect(captured.sort()).toEqual(['a1', 'a2', 'a3', 'a4']);
    for (const [successorId, predecessorId] of [
      ['a1', 'a2'],
      ['a3', 'a4'],
    ]) {
      const successor = observed.entries.find(({ workPackageId }) => workPackageId === successorId);
      const predecessor = observed.entries.find(
        ({ workPackageId }) => workPackageId === predecessorId,
      );
      if (successor?.plan.kind !== 'connected' || predecessor?.plan.kind !== 'connected')
        throw new Error('expected connected');
      expect(successor.plan).toBe(predecessor.plan);
      const target = workPackageConnectedTree(successor.plan, successorId);
      const upstream = workPackageConnectedTree(predecessor.plan, predecessorId);
      expect(target.placement.kind).toBe('scheduled');
      expect(upstream.placement.kind).toBe('scheduled');
      const direct = await reader().read(successorId, access);
      if (direct.kind !== 'connected') throw new Error('expected connected');
      expect(target.placement).toEqual(workPackageConnectedTree(direct, successorId).placement);
    }
  },
);

test.each(['isolated', 'shared'] as const)(
  '%s aggregate captures calendars links and metadata in one observation',
  async (mode) => {
    write(
      `UPDATE organization SET shared_people=${mode === 'shared' ? '1' : '0'} WHERE id='org-a'`,
    );
    write("UPDATE work_package SET start_date='2026-10-19'");
    let edited = false;
    const store = createLivePlanStore({
      kind: 'owned',
      openConnection: () => openReadOnlyConnection(path),
      schedulerOf: () => fastScheduler,
      captureRead: {
        afterFirstRead: () => {
          if (edited) return Promise.resolve();
          edited = true;
          write("UPDATE work_package SET start_date='2026-10-26',name='Next remote' WHERE id='a2'");
          write("UPDATE work_item SET name='Next row' WHERE id='a2'");
          write("UPDATE external_dependency SET type='SS' WHERE id='edge'");
          return Promise.resolve();
        },
      },
    });
    const first = await store.readAggregate('ada', access);
    const next = await store.readAggregate('ada', access);
    if (
      (first.kind !== 'shared' && first.kind !== 'isolated-connected') ||
      (next.kind !== 'shared' && next.kind !== 'isolated-connected')
    )
      throw new Error('expected shared');
    const oldRead = first.entries.at(0)?.plan;
    const newRead = next.entries.at(0)?.plan;
    if (oldRead?.kind !== 'connected' || newRead?.kind !== 'connected')
      throw new Error('expected connected');
    const oldTree = workPackageConnectedTree(oldRead, 'a1');
    const newTree = workPackageConnectedTree(newRead, 'a1');
    expect(oldRead.metadataByWorkPackage.get('a2')?.workPackage.name).toBe('a2');
    expect(newRead.metadataByWorkPackage.get('a2')?.workPackage.name).toBe('Next remote');
    expect(oldRead.metadataByWorkPackage.get('a2')?.workItems[0]?.name).toBe('a2');
    expect(newRead.metadataByWorkPackage.get('a2')?.workItems[0]?.name).toBe('Next row');
    expect(oldTree.dependencies[0]?.type).toBe('FS');
    expect(newTree.dependencies[0]?.type).toBe('SS');
    expect(
      oldRead.projection.capture.workPackages.find(({ workPackageId }) => workPackageId === 'a2')
        ?.reads.workPackage.startDate,
    ).toBe('2026-10-19');
    expect(
      newRead.projection.capture.workPackages.find(({ workPackageId }) => workPackageId === 'a2')
        ?.reads.workPackage.startDate,
    ).toBe('2026-10-26');
  },
);

test.each(['isolated', 'shared'] as const)(
  'borrowed %s aggregate sees staged relationships and expires without owning the transaction',
  async (mode) => {
    write(
      `UPDATE organization SET shared_people=${mode === 'shared' ? '1' : '0'} WHERE id='org-a'`,
    );
    write("DELETE FROM external_dependency WHERE id='edge'");
    const connection = openConnection(path);
    const lifetime = createReadSnapshotLifetime();
    connection.db.run(sql.raw('BEGIN IMMEDIATE'));
    try {
      connection.db.run(
        sql.raw(
          "INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('staged','org-a','a2','a1','a2','a1','whole','whole','FS')",
        ),
      );
      const store = createLivePlanStore({
        kind: 'borrowed',
        db: connection.db,
        lifetime,
        schedulerOf: () => fastScheduler,
      });
      const observed = await store.readAggregate('ada', access);
      if (observed.kind !== 'shared' && observed.kind !== 'isolated-connected')
        throw new Error('expected shared');
      expect(observed.entries.at(0)?.plan.kind).toBe('connected');
      const plan = observed.entries.at(0)?.plan;
      if (plan?.kind !== 'connected') throw new Error('expected connected');
      expect(workPackageConnectedTree(plan, 'a1').dependencies.map(({ id }) => id)).toEqual([
        'staged',
      ]);
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
    if (mode === 'isolated') {
      expect(next.kind).toBe('isolated');
    } else {
      if (next.kind !== 'shared') throw new Error('expected shared');
      expect(next.entries.at(0)?.plan.kind).toBe('shared');
    }
  },
);

test.each(['calendar', 'optimized'] as const)(
  'shared aggregate unavailable %s allocates no durable solver or execution work',
  async (reason) => {
    write("UPDATE organization SET shared_people=1 WHERE id='org-a'");
    if (reason === 'optimized') {
      write("UPDATE work_package SET start_date='2026-10-19'");
      write(
        "UPDATE work_package SET schedule_engine='optimized',optimization_enabled=1 WHERE id='a2'",
      );
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

for (const mode of ['isolated', 'shared'] as const) {
  test(`${mode} private connected capture returns detached stage without admission`, async () => {
    if (mode === 'shared') write("UPDATE organization SET shared_people=1 WHERE id='org-a'");
    write("UPDATE work_package SET start_date='2026-10-05',estimate_rounding='exact'");
    write(
      "UPDATE work_package SET schedule_engine='optimized',optimization_enabled=1 WHERE id='a1'",
    );
    for (const id of ['a1', 'a2'])
      write(
        `INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES ('${id}','${id}-s',1,1,1)`,
      );
    const source = openSqliteSource({
      dependencyCapability: CAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      dbPath: path,
    });
    const observer = openDatabase(path);
    const solverState = () =>
      [
        'optimization_generation',
        'optimized_schedule_cache',
        'solver_slot',
        'solver_queue',
        'event_log',
      ].map((table) => observer.query(`SELECT * FROM ${table}`).all());
    const before = solverState();
    const plans = createLivePlanStore({
      kind: 'owned',
      openConnection: () => openReadOnlyConnection(path),
      schedulerOf: () => fastScheduler,
      connected: { solverVersion: '0.4.0', budgetMs: 1000, now: () => 12 },
    });
    const graph = servicesOver(
      { ...source.stores, livePlans: plans },
      {
        dependencyContext: createLocalDependencyContext(source.stores),
        admission: LEGACY_EDIT_ADMISSION,
        clock: testClock,
        broadcast: recordingBroadcaster(),
        scheduler: fastScheduler,
      },
    );
    try {
      const captured = await graph.workItems.optimizationCaptureWithin('a1', access);
      expect(captured.kind).toBe('scheduled');
      if (captured.kind !== 'scheduled' || captured.input.kind !== 'connected')
        throw Error('expected connected stage');
      expect(captured.enabled).toBe(true);
      expect(captured.input.stage.starts.get(sliceKey('a2', 'a2-s'))).toBe(0);
      expect(captured.input.stage.starts.get(sliceKey('a1', 'a1-s'))).toBe(1);
      expect(canonicalConnectedStageInput(captured.input.stage)).toBeTruthy();
      const background = await graph.workItems.optimizationCapture('a1');
      expect(background).toEqual(captured);
      const retained = await plans.read('a1', access);
      if (retained.kind !== 'connected') throw Error('expected connected');
      const projected = workPackageConnectedTree(retained, 'a1');
      expect(projected.optimization?.stage).toEqual(captured.input.stage);
      expect(projected.optimization?.optimization?.variants.time.state).toBe('idle');
      await plans.readAggregate('ada', access);
      expect(solverState()).toEqual(before);
      write("UPDATE work_package SET optimization_enabled=0 WHERE id='a1'");
      expect(captured.enabled).toBe(true);
      const next = await graph.workItems.optimizationCapture('a1');
      expect(next.kind === 'scheduled' && next.enabled).toBe(false);
      expect(canonicalConnectedStageInput(captured.input.stage)).toBeTruthy();
      write("UPDATE work_package SET start_date=NULL WHERE id='a1'");
      expect((await graph.workItems.optimizationCapture('a1')).kind).toBe(
        'dependency_calendar_missing',
      );
      write("UPDATE work_item SET hold='on_hold' WHERE id='a1'");
      expect(await graph.workItems.optimizationCapture('a1')).toEqual({
        kind: 'idle',
        enabled: false,
      });
    } finally {
      observer.close();
      await source.close();
    }
  });
}

for (const mode of ['isolated', 'shared'] as const) {
  for (const ownership of ['owned', 'borrowed'] as const) {
    test(`${ownership} ${mode} real selection excludes a rival publication until next observation`, async () => {
      if (mode === 'shared') write("UPDATE organization SET shared_people=1 WHERE id='org-a'");
      write("UPDATE work_package SET start_date='2026-10-05',estimate_rounding='exact'");
      write(
        "UPDATE work_package SET schedule_engine='optimized',optimization_enabled=1,schedule_objective='time' WHERE id='a1'",
      );
      for (const id of ['a1', 'a2'])
        write(
          `INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES ('${id}','${id}-s',1,1,1)`,
        );
      const installed = { solverVersion: '0.4.0', budgetMs: 1000, now: () => 12 };
      const setup = {
        kind: 'owned' as const,
        openConnection: () => openReadOnlyConnection(path),
        schedulerOf: () => fastScheduler,
        connected: installed,
      };
      const initial = await createLivePlanStore(setup).read('a1', access);
      if (initial.kind !== 'connected' || initial.projection.placement.kind !== 'scheduled')
        throw Error('expected stage');
      const stage = initial.projection.placement.stages.find(
        (selection) => selection.stage.workPackageId === 'a1',
      )?.stage;
      if (stage === undefined) throw Error('expected a1 stage');
      const question = captureConnectedQuestion(stage, 'time', installed);
      let published = false;
      const captureRead = {
        afterFirstRead: () => {
          if (!published) {
            published = true;
            const publisher = openConnection(path);
            try {
              publisher.db
                .insert(optimizedScheduleCache)
                .values({
                  ...question,
                  generation: 1,
                  status: 'failed',
                  failureReason: 'timeout',
                  createdAt: 12,
                })
                .run();
            } finally {
              publisher.close();
            }
          }
          return Promise.resolve();
        },
      };
      const owner = openConnection(path);
      const lifetime = createReadSnapshotLifetime();
      try {
        if (ownership === 'borrowed') owner.db.run(sql.raw('BEGIN'));
        const store = createLivePlanStore(
          ownership === 'owned'
            ? { ...setup, captureRead }
            : {
                kind: 'borrowed',
                db: owner.db,
                lifetime,
                schedulerOf: () => fastScheduler,
                connected: installed,
                captureRead,
              },
        );
        const held = await store.read('a1', access);
        if (held.kind !== 'connected' || held.projection.placement.kind !== 'scheduled')
          throw Error('expected selection');
        const target = held.projection.placement.stages.find(
          (selection) => selection.stage.workPackageId === 'a1',
        );
        expect(published).toBe(true);
        expect(target?.optimization?.variants.time.state).toBe('idle');
        const detached = canonicalConnectedStageInput(stage);
        lifetime.expire();
        if (ownership === 'borrowed') {
          owner.db.run(sql.raw('COMMIT'));
          expect((await failureOf(store.read('a1', access))).message).toContain('closed');
        }
        const next = await createLivePlanStore(setup).read('a1', access);
        if (next.kind !== 'connected' || next.projection.placement.kind !== 'scheduled')
          throw Error('expected next');
        expect(
          next.projection.placement.stages.find(
            (selection) => selection.stage.workPackageId === 'a1',
          )?.optimization?.variants.time.state,
        ).toBe('failed');
        expect(canonicalConnectedStageInput(stage)).toBe(detached);
      } finally {
        lifetime.expire();
        owner.close();
      }
    });
  }
}

test('connected export holds labels settings marker and sparse facts in one SQLite observation', async () => {
  write(
    "INSERT INTO calendar_marker(id,scope_kind,scope_id,date,name,created_at) VALUES('marker','work_package','a1','2026-10-22','Old marker',1)",
  );
  let edited = false;
  const plans = createLivePlanStore({
    kind: 'owned',
    openConnection: () => openReadOnlyConnection(path),
    schedulerOf: () => fastScheduler,
    captureRead: {
      afterFirstRead: () => {
        if (!edited) {
          edited = true;
          write("UPDATE work_package SET name='Next remote' WHERE id='a2'");
          write("UPDATE work_package SET estimate_rounding='exact' WHERE id='a1'");
          write("UPDATE calendar_marker SET name='Next marker' WHERE id='marker'");
          write(
            "INSERT INTO step_parallel(work_item_id,step_id,max_parallel) VALUES('a1','a1-s',2)",
          );
        }
        return Promise.resolve();
      },
    },
  });
  const before = await plans.readExport('a1', access);
  if (before.kind !== 'connected') throw new Error('expected connected export');
  expect(before.metadataByWorkPackage.get('a2')?.workPackage.name).not.toBe('Next remote');
  expect(before.metadataByWorkPackage.get('a1')?.workPackage.estimateRounding).toBe('ceil');
  expect(before.document.markers.map((marker) => marker.name)).toEqual(['Old marker']);
  expect(before.document.stepParallels).toEqual([]);
  const after = await plans.readExport('a1', access);
  if (after.kind !== 'connected') throw new Error('expected connected export');
  expect(after.metadataByWorkPackage.get('a2')?.workPackage.name).toBe('Next remote');
  expect(after.metadataByWorkPackage.get('a1')?.workPackage.estimateRounding).toBe('exact');
  expect(after.document.markers.map((marker) => marker.name)).toEqual(['Next marker']);
  expect(after.document.stepParallels).toEqual([
    { workItemId: 'a1', stepId: 'a1-s', maxParallel: 2 },
  ]);
});

test.each(['isolated', 'shared'] as const)(
  '%s aggregate preserves person capacity across a disconnected local member',
  async (mode) => {
    write(
      `UPDATE organization SET shared_people=${mode === 'shared' ? '1' : '0'} WHERE id='org-a'`,
    );
    write(
      "UPDATE work_package SET start_date='2026-10-05',estimate_method='realistic',estimate_rounding='exact'",
    );
    write(
      "INSERT INTO work_item(id,work_package_id,position,name,readiness) VALUES('a3','a3',10,'a3','ready')",
    );
    seedBuildStep('a3');
    write("INSERT INTO person(id,name) VALUES('p','Root P')");
    write(
      "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('p','org-a','Local P')",
    );
    for (const id of ['a1', 'a2', 'a3']) {
      write(
        `INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES('${id}','${id}-s',1,1,1)`,
      );
      write(`INSERT INTO assignment(work_item_id,step_id,person_id) VALUES('${id}','${id}-s','p')`);
    }
    if (mode === 'isolated') write("DELETE FROM work_package_rank WHERE work_package_id='a3'");
    const observed = await reader().readAggregate('ada', access);
    if (observed.kind !== 'shared' && observed.kind !== 'isolated-connected')
      throw new Error('captured aggregate required');
    expect(observed.entries.map(({ workPackageId }) => workPackageId)).toEqual([
      'a1',
      'a2',
      'a3',
      'a4',
    ]);
    const component = observed.entries.find(({ workPackageId }) => workPackageId === 'a1')?.plan;
    const third = observed.entries.find(({ workPackageId }) => workPackageId === 'a3')?.plan;
    if (component?.kind !== 'connected') throw new Error('component required');
    if (mode === 'isolated') {
      expect(
        component.projection.capture.workPackages.map(({ workPackageId }) => workPackageId),
      ).toEqual(['a1', 'a2']);
      if (
        third?.kind !== 'local' ||
        third.chain.kind !== 'scheduled' ||
        third.chain.scheduled.kind !== 'scheduled'
      )
        throw new Error('singleton local required');
      expect(third.chain.input.elsewhere).toBeUndefined();
      expect(third.chain.scheduled.fast.slices.get(sliceKey('a3', 'a3-s'))?.earliestStart).toBe(0);
      const person = { id: 'p', name: 'Local P', kind: 'person', accountId: null, teamIds: [] };
      expect(third.chain.reads.people).toContainEqual(person);
    } else {
      expect(third).toBe(component);
      expect(
        component.projection.capture.workPackages.map(({ workPackageId }) => workPackageId),
      ).toEqual(['a1', 'a2', 'a3']);
      expect(component.projection.placement.kind).toBe('scheduled');
      if (component.projection.placement.kind !== 'scheduled')
        throw new Error('placement required');
      const thirdTree = workPackageConnectedTree(component, 'a3');
      expect(thirdTree.placement.kind).toBe('scheduled');
      // Shared capacity consumes both earlier work package bookings before the unrelated member.
      expect(
        component.projection.placement.byWorkPackage.get('a3')?.slices.get(sliceKey('a3', 'a3-s'))
          ?.earliestStart,
      ).toBe(2);
    }
  },
);

test.each(['absent address', 'unreadable rows', 'missing metadata'] as const)(
  'isolated aggregate refuses required %s instead of omitting a member',
  async (fault) => {
    // These original methods are called with the exact captured repository receiver below.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const listRows = WorkItemRepository.prototype.listByWorkPackage;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const findWorkPackage = WorkPackageRepository.prototype.findInOrganization;
    let reached = 0;
    const rows = spyOn(WorkItemRepository.prototype, 'listByWorkPackage').mockImplementation(
      async function (this: WorkItemRepository, workPackageId) {
        if (fault === 'unreadable rows' && workPackageId === 'a2') {
          reached += 1;
          throw new Error('injected unreadable aggregate rows');
        }
        return listRows.call(this, workPackageId);
      },
    );
    const workPackages = spyOn(
      WorkPackageRepository.prototype,
      'findInOrganization',
    ).mockImplementation(async function (
      this: WorkPackageRepository,
      workPackageId,
      organizationId,
    ) {
      const workPackage = await findWorkPackage.call(this, workPackageId, organizationId);
      if (fault === 'missing metadata' && workPackageId === 'a2') {
        reached += 1;
        expect(workPackage?.id).toBe('a2');
        return null;
      }
      return workPackage;
    });
    try {
      if (fault === 'absent address')
        write("DELETE FROM work_package_abbreviation WHERE work_package_id='a2'");

      const refusal = await failureOf(reader().readAggregate('ada', access));
      if (fault === 'unreadable rows') {
        expect(reached).toBe(1);
        expect(refusal.message).toContain('injected unreadable aggregate rows');
      }
      if (fault === 'missing metadata') expect(reached).toBe(1);
      if (fault === 'missing metadata')
        expect(refusal.message).toContain('connected capture names an unreadable work package');
      if (fault === 'absent address') expect(refusal.message).toContain('abbreviation is missing');
    } finally {
      rows.mockRestore();
      workPackages.mockRestore();
    }
  },
);

test.each(['membership', 'activation'] as const)(
  'isolated aggregate rechecks %s before capture',
  async (fault) => {
    const store = reader();
    if (fault === 'membership')
      write("DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='ada'");
    else {
      write('DROP TRIGGER organization_activation_no_revert');
      write("UPDATE organization_activation SET state='pre_activation',activated_at=NULL");
    }
    expect(await store.readAggregate('ada', access)).toEqual({
      kind: 'access_refused',
      refusal: fault === 'membership' ? 'not_a_member' : 'no_active_organization',
    });
  },
);

test('pre-consumer ownership and foreign endpoint SQL refusals preserve every table', () => {
  write(
    "INSERT INTO work_item(id,work_package_id,position,name) VALUES('b1','b1',10,'Foreign row')",
  );
  const connection = openDatabase(path);
  try {
    const tables = connection
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name",
      )
      .all();
    const snapshot = () =>
      tables.map(({ name }) => ({
        name,
        rows: connection.query(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all(),
      }));
    const before = snapshot();
    expect(() => {
      write("UPDATE work_package_organization SET organization_id='org-b' WHERE resource_id='a2'");
    }).toThrow('organization ownership is immutable');
    expect(snapshot()).toEqual(before);
    expect(() => {
      write(
        "UPDATE external_dependency SET predecessor_work_package_id='b1',predecessor_work_item_id='b1' WHERE id='edge'",
      );
    }).toThrow('FOREIGN KEY constraint failed');
    expect(snapshot()).toEqual(before);
  } finally {
    connection.close();
  }
});
