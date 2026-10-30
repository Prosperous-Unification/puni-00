import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { servicesOver } from '@wbs/core/compose';
import { CREATOR_ADMISSION } from '@wbs/core/ports/edit-admission';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { contractVersionOf } from '@wbs/domain';
import { SqliteOrganizationAccess, userBoundOrganizationOf } from '@wbs/store-sqlite';
import { createLivePlanStore } from '@wbs/store-sqlite/chain-snapshot';
import { response } from '@wbs/store-sqlite/connected-optimization.fixture';
import {
  captureConnectedQuestion,
  hashConnectedBytes,
} from '@wbs/store-sqlite/connected-question-identity';
import { openDatabase, openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { openSqliteSource } from '@wbs/store-sqlite/source';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { openSpaceDatabase } from '@wbs/store-sqlite/testing/space-database';
import { afterEach, expect, it } from 'bun:test';

import type { ReservedSpawnRequest } from '../module/optimization/contract';
import { OptimizationCoordinator } from '../module/optimization/optimization.feature';
import { DrizzleEventLogStore } from '../repository/event-log';
import { OPEN } from '../repository/gate';
import { createOptimizationRepository } from '../repository/optimization';
import { scheduleInputHash } from '../repository/schedule-input-hash';
import { BACKEND_DEPENDENCY_CAPABILITY } from '../runtime/dependency-support';
import { createDequeueReservationOwner } from '../service/optimization-dequeue-reservation';
import { createInitialReservationOwner } from '../service/optimization-initial-reservation';
import { createOptimizationObservationOwner } from '../service/optimization-observation';
import { createOptimizationOutcomeOwner } from '../service/optimization-outcome';
import { createRetryReservationOwner } from '../service/optimization-retry-reservation';
import { testApp } from '../testing/app-fixture';
import { testLocalAuthService } from '../testing/auth-fixture';

const installed = { solverVersion: '0.4.0', budgetMs: 1000, now: () => 12 };
const access = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
} as const;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});
function stream(bytes: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(bytes));
      controller.close();
    },
  });
}
async function fixture(failedPri = false, installedReader = true) {
  const folder = mkdtempSync(join(tmpdir(), 'mounted-connected-retry-'));
  const path = await openSpaceDatabase(folder);
  seedDependencyAuthority(path);
  const sqlite = openDatabase(path);
  sqlite.run("UPDATE organization_activation SET state='activated',activated_at=1");
  sqlite.run(
    "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','ada','member',1)",
  );
  sqlite.run("UPDATE project SET estimate_rounding='exact',start_date='2026-10-05'");
  sqlite.run("UPDATE project SET schedule_engine='optimized',optimization_enabled=1 WHERE id='a1'");
  for (const id of ['a1', 'a2']) {
    sqlite.run('INSERT INTO work_item(id,project_id,position,name) VALUES(?,?,10,?)', [id, id, id]);
    sqlite.run('INSERT INTO step(id,project_id,name,position) VALUES(?,?,?,10)', [
      id + '-s',
      id,
      'Build',
    ]);
    sqlite.run(
      'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES(?,?,1,1,1)',
      [id, id + '-s'],
    );
  }
  sqlite.run(
    "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES('edge','org-a','a2','a1','a2','a1','whole','whole','FS')",
  );
  const source = openSqliteSource({
    dependencyCapability: BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
  });
  let openReads = 0;
  let readCount = 0;
  let afterRead: (() => void) | undefined;
  const plans = createLivePlanStore({
    kind: 'owned',
    openConnection: () => {
      const connection = openReadOnlyConnection(path);
      openReads++;
      readCount++;
      return {
        ...connection,
        close: () => {
          connection.close();
          openReads--;
          afterRead?.();
        },
      };
    },
    schedulerOf: () => fastScheduler,
    ...(installedReader ? { connected: installed } : {}),
  });
  const graph = servicesOver(
    { ...source.stores, livePlans: plans },
    {
      admission: CREATOR_ADMISSION,
      dependencyContext: createLocalDependencyContext(source.stores),
      clock: testClock,
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
    },
  );
  const bound = source.bindLivePlans({ schedulerOf: () => fastScheduler });
  const delivery = { now: () => 12, deliverCommitted: () => Promise.resolve() };
  const repository = {
    ...createOptimizationRepository(
      source.db,
      new DrizzleEventLogStore(source.db, OPEN),
      source.gate,
    ),
    observeForAdmission: createOptimizationObservationOwner(source.db, bound.uow, delivery),
    recordOutcome: createOptimizationOutcomeOwner(source.db, bound.uow, delivery),
    reserveSlot: createInitialReservationOwner(source.db, bound.uow, delivery),
    dequeueRequest: createDequeueReservationOwner(source.db, bound.uow, delivery),
    admitRetry: ((admit) => (ask: Parameters<typeof admit>[0]) => {
      expect(openReads).toBe(0);
      return admit(ask);
    })(createRetryReservationOwner(source.db, bound.uow, delivery)),
  };
  const launched: ReservedSpawnRequest[] = [];
  const errors: unknown[] = [];
  let sequence = 0;
  const coordinator = new OptimizationCoordinator({
    ...installed,
    contractVersion: contractVersionOf(installed.solverVersion),
    repository,
    hashInput: scheduleInputHash,
    hashConnectedBytes,
    ownerId: 'mounted',
    attemptToken: () => `attempt-${String(++sequence)}`,
    inputOf: () => {
      throw Error('unexpected local input');
    },
    enabledOf: () => Promise.resolve(true),
    captureOf: () => graph.workItems.optimizationCapture('a1'),
    spawn: (asked) => {
      expect(openReads).toBe(0);
      launched.push(asked);
      if (asked.kind !== 'connected') throw Error('expected connected launcher');
      return Promise.resolve({
        pid: 100 + sequence,
        stdout: stream(
          response(
            asked.request,
            failedPri && asked.objective === 'pri' ? 'unknown' : 'boundary-infeasible',
          ).stdout,
        ),
        stderr: stream(''),
        exited: Promise.resolve(0),
        verdict: () => undefined,
        kill: () => undefined,
      });
    },
    sleep: () => Promise.resolve(),
    onChildError: (error) => {
      errors.push(error);
    },
    deliverCommitted: () => Promise.resolve(),
  });
  const app = testApp({
    ...graph,
    workItems: graph.workItems,
    optimizer: coordinator,
    auth: testLocalAuthService({ id: 'ada', username: 'ada', scopes: ['read', 'write'] }),
    organizations: new SqliteOrganizationAccess(
      source.db,
      userBoundOrganizationOf(() => Promise.resolve('org-a')),
      () => 12,
    ),
  });
  const capture = async () => {
    const captured = await graph.workItems.optimizationCaptureWithin('a1', access);
    if (captured.kind !== 'scheduled' || captured.input.kind !== 'connected')
      throw Error('expected connected stage');
    return { ...captured, input: captured.input };
  };
  const send = (inputHash: string, objective: 'pri' | 'time' = 'time', projectId = 'a1') =>
    app.handle(
      new Request(`http://localhost/api/projects/${projectId}/optimization/retry`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-WBS-Expected-Organization': 'org-a' },
        body: JSON.stringify({ inputHash, objective }),
      }),
    );
  const snapshot = () =>
    [
      'optimization_generation',
      'optimization_boundary_certificate',
      'optimized_schedule_cache',
      'solver_slot',
      'solver_queue',
      'event_log',
      'event_sequencer',
      'organization_audit',
    ].map((table) => sqlite.query(`SELECT * FROM ${table}`).all());
  cleanups.push(async () => {
    await coordinator.stop();
    sqlite.close();
    await source.close();
    rmSync(folder, { recursive: true, force: true });
  });
  return {
    source,
    sqlite,
    graph,
    coordinator,
    launched,
    errors,
    capture,
    send,
    snapshot,
    openReads: () => openReads,
    readCount: () => readCount,
    afterRead: (action: () => void) => {
      afterRead = action;
    },
  };
}

it('mounted connected Retry returns retained terminal 409 without writes or a launcher', async () => {
  const f = await fixture();
  const captured = await f.capture();
  await f.coordinator.admitCaptured({ projectId: 'a1', ...captured });
  await f.coordinator.drain();
  expect(f.errors).toEqual([]);
  const before = f.snapshot();
  const launches = f.launched.length;
  const question = captureConnectedQuestion(captured.input.stage, 'time', installed);
  const reply = await f.send(question.inputHash);
  expect(reply.status).toBe(409);
  expect(await reply.json()).toEqual({ code: 'not-retryable', state: 'boundary-infeasible' });
  expect(f.snapshot()).toEqual(before);
  expect(f.launched).toHaveLength(launches);
  expect(f.openReads()).toBe(0);
});

it('mounted connected Retry compares submitted hash before retained terminal preflight', async () => {
  const f = await fixture();
  const captured = await f.capture();
  await f.coordinator.admitCaptured({ projectId: 'a1', ...captured });
  await f.coordinator.drain();
  const before = f.snapshot();
  const reply = await f.send('old-hash');
  expect(reply.status).toBe(409);
  expect(await reply.json()).toEqual({
    code: 'stale-input-hash',
    currentInputHash: captureConnectedQuestion(captured.input.stage, 'time', installed).inputHash,
  });
  expect(f.snapshot()).toEqual(before);
});

it('mounted connected Retry reports target and missing calendars without writes', async () => {
  const f = await fixture();
  f.sqlite.run("UPDATE project SET start_date=NULL WHERE id='a2'");
  const before = f.snapshot();
  const reply = await f.send('unused');
  expect(reply.status).toBe(409);
  expect(await reply.json()).toEqual({
    code: 'schedule-input-unavailable',
    reason: 'dependency_calendar_missing',
    projectId: 'a1',
    projects: [{ projectId: 'a2', abbreviation: 'PA2', name: 'a2' }],
  });
  expect(f.snapshot()).toEqual(before);
  expect(f.launched).toEqual([]);
});

it('mounted connected Retry reports an idle target without creating a question', async () => {
  const f = await fixture();
  f.sqlite.run("UPDATE work_item SET hold='on_hold' WHERE id='a1'");
  const before = f.snapshot();
  const reply = await f.send('unused');
  expect(reply.status).toBe(409);
  expect(await reply.json()).toEqual({ code: 'not-retryable', state: 'idle' });
  expect(f.snapshot()).toEqual(before);
  expect(f.launched).toEqual([]);
});

it('mounted Retry admits failed Pri beside terminal Time using the current connected hash', async () => {
  const f = await fixture(true);
  const captured = await f.capture();
  await f.coordinator.admitCaptured({ projectId: 'a1', ...captured });
  await f.coordinator.drain();
  expect(f.errors).toEqual([]);
  const hash = captureConnectedQuestion(captured.input.stage, 'pri', installed).inputHash;
  const before = f.snapshot();
  const terminal = await f.send(hash);
  expect(await terminal.json()).toEqual({ code: 'not-retryable', state: 'boundary-infeasible' });
  expect(f.snapshot()).toEqual(before);
  const reply = await f.send(hash, 'pri');
  expect(reply.status).toBe(202);
  expect(await reply.json()).toMatchObject({ state: 'retrying', inputHash: hash });
  await f.coordinator.drain();
  expect(f.errors).toEqual([]);
  expect(f.launched.map((asked) => asked.objective)).toEqual(['pri', 'time', 'pri']);
  expect(f.openReads()).toBe(0);
});

it('mounted Retry rebuilds a changed foreign boundary before terminal lookup', async () => {
  const f = await fixture();
  const captured = await f.capture();
  await f.coordinator.admitCaptured({ projectId: 'a1', ...captured });
  await f.coordinator.drain();
  const oldHash = captureConnectedQuestion(captured.input.stage, 'time', installed).inputHash;
  f.sqlite.run(
    "UPDATE estimate SET optimistic=2,realistic=2,pessimistic=2 WHERE work_item_id='a2'",
  );
  const fresh = await f.capture();
  const currentHash = captureConnectedQuestion(fresh.input.stage, 'time', installed).inputHash;
  expect(currentHash).not.toBe(oldHash);
  const before = f.snapshot();
  const reply = await f.send(oldHash);
  expect(reply.status).toBe(409);
  expect(await reply.json()).toEqual({ code: 'stale-input-hash', currentInputHash: currentHash });
  expect(f.snapshot()).toEqual(before);
});

it('mounted Retry retains terminal authority before a replaced generation and conceals foreign targets', async () => {
  const f = await fixture();
  const captured = await f.capture();
  await f.coordinator.admitCaptured({ projectId: 'a1', ...captured });
  await f.coordinator.drain();
  f.sqlite.run(
    "UPDATE optimization_generation SET input_hash='replacement',generation=generation+1 WHERE project_id='a1'",
  );
  const before = f.snapshot();
  const reply = await f.send(
    captureConnectedQuestion(captured.input.stage, 'time', installed).inputHash,
  );
  expect(reply.status).toBe(409);
  expect(await reply.json()).toEqual({ code: 'not-retryable', state: 'boundary-infeasible' });
  const foreign = await f.send('unused', 'time', 'b1');
  expect(foreign.status).toBe(404);
  expect(await foreign.json()).toEqual({ error: 'not_found' });
  expect(f.snapshot()).toEqual(before);
});

it('mounted connected Retry preserves explicit unavailable input with no mutation', async () => {
  const f = await fixture(false, false);
  const before = f.snapshot();
  const reply = await f.send('unused');
  expect(reply.status).toBe(409);
  expect(await reply.json()).toEqual({
    code: 'schedule-input-unavailable',
    reason: 'engine_unavailable',
    projectId: 'a1',
  });
  expect(f.snapshot()).toEqual(before);
  expect(f.launched).toEqual([]);
});

it('mounted connected Retry authorizes before capture and rechecks membership inside the writer', async () => {
  const f = await fixture();
  const captured = await f.capture();
  await f.coordinator.admitCaptured({ projectId: 'a1', ...captured });
  await f.coordinator.drain();
  const hash = captureConnectedQuestion(captured.input.stage, 'time', installed).inputHash;
  const reads = f.readCount();
  const foreign = await f.send(hash, 'time', 'b1');
  expect(foreign.status).toBe(404);
  expect(f.readCount()).toBe(reads);
  const before = f.snapshot();
  f.afterRead(() => {
    f.sqlite.run("DELETE FROM organization_membership WHERE user_id='ada'");
  });
  const reply = await f.send(hash);
  expect(reply.status).toBe(403);
  expect(await reply.json()).toEqual({ error: 'forbidden' });
  expect(f.snapshot()).toEqual(before);
  expect(f.openReads()).toBe(0);
});
