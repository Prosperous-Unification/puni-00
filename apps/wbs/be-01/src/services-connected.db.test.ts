import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildConnectedSolverRequest } from '@wbs/contracts/solver/build-connected-request';
import { encodeConnectedSuccess } from '@wbs/contracts/solver/connected-durable';
import { clockOf } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { CREATOR_ADMISSION } from '@wbs/core/ports/edit-admission';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { canonicalConnectedStageInput } from '@wbs/domain';
import { createLogger } from '@wbs/observability';
import {
  openSqliteSource,
  SqliteOrganizationAccess,
  type SqliteSource,
  userBoundOrganizationOf,
} from '@wbs/store-sqlite';
import { createLivePlanStore } from '@wbs/store-sqlite/chain-snapshot';
import { response } from '@wbs/store-sqlite/connected-optimization.fixture';
import {
  captureConnectedQuestion,
  hashConnectedBytes,
} from '@wbs/store-sqlite/connected-question-identity';
import { openDatabase, openReadOnlyConnection } from '@wbs/store-sqlite/db';
import {
  optimizationGeneration,
  optimizedScheduleCache,
  solverQueue,
} from '@wbs/store-sqlite/schema';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { openSpaceDatabase } from '@wbs/store-sqlite/testing/space-database';
import { afterEach, expect, test } from 'bun:test';

import type { ReservedSpawnRequest } from './module/optimization/contract';
import { BACKEND_DEPENDENCY_CAPABILITY } from './runtime/dependency-support';
import { buildServices, type OptimizerRuntime } from './services';
import { testApp } from './testing/app-fixture';
import { testLocalAuthService } from './testing/auth-fixture';
import { trackReadObservations } from './testing/read-observation.fixture';

const installed = { solverVersion: '0.4.0', budgetMs: 1000 };
const access = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
} as const;
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});

function compose(source: SqliteSource, optimizer?: OptimizerRuntime) {
  const errors: string[] = [];
  let bound: ReturnType<SqliteSource['bindLivePlans']> | undefined;
  const bind = source.bindLivePlans.bind(source);
  const services = buildServices({
    source: {
      ...source,
      bindLivePlans: (options) => {
        bound = bind(options);
        return bound;
      },
    },
    commandAccess: localCommandAccess,
    clock: clockOf({ now: () => 12, newId: () => crypto.randomUUID() }),
    now: () => 12,
    logger: createLogger({
      service: 'be-01',
      destination: {
        write: (line: string) => {
          errors.push(line);
        },
      },
    }),
    jwtKey: 'k'.repeat(32),
    gwUrl: 'http://gw.invalid',
    internalAuthSecret: 's'.repeat(32),
    pushFetch: () => Promise.resolve(Response.json({ delivered_to_sockets: 0 })),
    ...(optimizer === undefined ? {} : { optimizer }),
  });
  cleanups.push(async () => {
    await services.optimizer?.stop();
    await source.close();
  });
  if (bound === undefined) throw Error('source was not bound');
  const app = testApp({
    ...services,
    writes: services,
    auth: testLocalAuthService({ id: 'ada', username: 'ada', scopes: ['read', 'write'] }),
    organizations: new SqliteOrganizationAccess(
      source.db,
      userBoundOrganizationOf(() => Promise.resolve('org-a')),
      () => 12,
    ),
  });
  const tree = async (mounted = app, projectId = 'a1') => {
    const response = await mounted.handle(
      new Request(`http://localhost/api/projects/${projectId}/work-items`, {
        headers: { 'X-WBS-Expected-Organization': 'org-a' },
      }),
    );
    expect(response.status).toBe(200);
    const decoded: unknown = await response.json();
    return decoded as {
      readonly slices: readonly { readonly id: string; readonly earliestStart: number }[];
    };
  };
  return { services, errors, source, bound, tree, app };
}
function stream(bytes: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(bytes));
      controller.close();
    },
  });
}
async function fixture(runtime = true, mode: 'isolated' | 'shared' = 'isolated', held = false) {
  const folder = mkdtempSync(join(tmpdir(), 'connected-composition-'));
  const path = await openSpaceDatabase(folder);
  seedDependencyAuthority(path);
  const sqlite = openDatabase(path);
  sqlite.run("UPDATE organization_activation SET state='activated',activated_at=1");
  sqlite.run(
    "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES('org-a','ada','member',1)",
  );
  sqlite.run("UPDATE project SET estimate_rounding='exact',start_date='2026-10-05'");
  sqlite.run("UPDATE organization SET shared_people=? WHERE id='org-a'", [
    mode === 'shared' ? 1 : 0,
  ]);
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
  const launched: ReservedSpawnRequest[] = [];
  const probe = Object.assign(trackReadObservations(), { writerReads: [] as number[] });
  let holdChildren = held;
  const children = new Set<() => void>();
  const finishChildren = () => {
    holdChildren = false;
    for (const finish of children) finish();
    children.clear();
  };
  const source = openSqliteSource({
    dependencyCapability: BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
    openReadOnlyConnection: probe.openConnection,
  });
  const enter = source.gate.enter.bind(source.gate);
  source.gate.enter = (work) => {
    probe.writerReads.push(probe.borrowed);
    return enter(work);
  };
  cleanups.push(() => {
    finishChildren();
    return Promise.resolve();
  });
  const composed = compose(
    source,
    runtime
      ? {
          ...installed,
          spawn: (asked) => {
            expect(probe.borrowed).toBe(0);
            launched.push(asked);
            if (asked.kind !== 'connected') throw Error('expected connected launch');
            const completion = Promise.withResolvers<number>();
            const finish = () => {
              completion.resolve(0);
            };
            children.add(finish);
            if (!holdChildren) finish();
            return Promise.resolve({
              pid: 100 + launched.length,
              stdout: stream(response(asked.request, 'boundary-infeasible').stdout),
              stderr: stream(''),
              exited: completion.promise,
              verdict: () => undefined,
              kill: finish,
            });
          },
        }
      : undefined,
  );
  // Cleanup runs in insertion order; persistence outlives the composed source.
  cleanups.push(() => {
    sqlite.close();
    rmSync(folder, { recursive: true, force: true });
    return Promise.resolve();
  });
  const capture = async () => {
    const captured = await composed.services.workItems.optimizationCapture('a1');
    if (captured.kind !== 'scheduled' || captured.input.kind !== 'connected')
      throw Error('expected installed connected capture');
    return captured.input.stage;
  };
  const edit = async (days: number) => {
    const response = await composed.app.handle(
      new Request('http://localhost/api/projects/a2/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-WBS-Expected-Organization': 'org-a' },
        body: JSON.stringify({
          commands: [
            {
              kind: 'setEstimate',
              workItemId: 'a2',
              stepId: 'a2-s',
              days: { optimistic: days, realistic: days, pessimistic: days },
            },
          ],
        }),
      }),
    );
    expect(response.status).toBe(200);
  };
  return { ...composed, sqlite, source, launched, probe, capture, edit, path, finishChildren };
}

for (const mode of ['isolated', 'shared'] as const) {
  // Proof: legacy optimizationInput and each missing digest installer link made mounted upstream commands log an error instead of launching their exact connected question.
  test(`installed ${mode} connected capture launches exact detached pre-selection question and retains terminal outcome`, async () => {
    const f = await fixture(true, mode);
    await f.edit(2);
    const stage = await f.capture();
    const question = captureConnectedQuestion(stage, 'time', installed);
    const optimizer = f.services.optimizer;
    if (optimizer === undefined) throw Error('optimizer missing');
    await optimizer.drain();
    expect(f.errors).toEqual([]);
    expect(f.launched).toHaveLength(2);
    for (const asked of f.launched) {
      expect(asked.kind).toBe('connected');
      expect(asked.key.inputHash).toBe(question.inputHash);
      if (asked.kind !== 'connected') throw Error('connected launch expected');
      expect(canonicalConnectedStageInput(asked.stage)).toBe(canonicalConnectedStageInput(stage));
      expect(asked.request.scope.questionHash).toBe(
        captureConnectedQuestion(stage, asked.objective, installed).questionHash,
      );
    }
    expect(f.sqlite.query('SELECT * FROM solver_slot').all()).toEqual([]);
    expect(f.sqlite.query('SELECT * FROM solver_queue').all()).toEqual([]);
    expect(await f.tree()).toMatchObject({
      optimization: { variants: { time: { state: 'boundary-infeasible' } } },
    });
    const refused = await f.app.handle(
      new Request('http://localhost/api/projects/a1/optimization/retry', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-WBS-Expected-Organization': 'org-a' },
        body: JSON.stringify({ inputHash: question.inputHash, objective: 'time' }),
      }),
    );
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      code: 'not-retryable',
      state: 'boundary-infeasible',
    });
    optimizer.inputChanged('a1');
    await optimizer.drain();
    expect(f.launched).toHaveLength(2);
    await f.edit(3);
    const next = await f.capture();
    expect(captureConnectedQuestion(next, 'time', installed).inputHash).not.toBe(
      question.inputHash,
    );
    await optimizer.drain();
    expect(f.launched).toHaveLength(4);
    expect(f.errors).toEqual([]);
  });

  // Proof: omitted owned config failed mounted ready state; omitted borrowed forwarding failed the in-UoW mounted tree. Adding one day during final projection failed the mounted start (2 instead of 1).
  test(`installed ${mode} ready tree export and aggregate retain selected placement without admission`, async () => {
    const f = await fixture(true, mode);
    // Independent real SQLite setup creates the durable answer; the assertions below
    // must still reach HTTP when production installation is deliberately omitted.
    const initial = await createLivePlanStore({
      kind: 'owned',
      openConnection: () => openReadOnlyConnection(f.path),
      schedulerOf: () => fastScheduler,
      connected: { ...installed, now: () => 12 },
    }).read('a1', access);
    if (initial.kind !== 'connected' || initial.projection.placement.kind !== 'scheduled')
      throw Error('seed stage missing');
    const stage = initial.projection.placement.stages.find(
      (selection) => selection.stage.projectId === 'a1',
    )?.stage;
    if (stage === undefined) throw Error('seed target missing');
    const question = captureConnectedQuestion(stage, 'time', installed);
    const { stageBytes, ...identity } = question;
    expect(stageBytes).toBe(canonicalConnectedStageInput(stage));
    const prepared = buildConnectedSolverRequest(stage, identity, installed, 'time');
    if (prepared.kind !== 'request') throw Error('expected ready request');
    const request = prepared.request;
    const offsets = Object.fromEntries(
      request.slices.map((slice) => [slice.key, request.movementReferenceOffsets[slice.key]]),
    );
    const term = (value: number) => ({ value, stageValue: value, bound: 0, status: 'feasible' });
    const success = encodeConnectedSuccess(
      stage,
      identity,
      request,
      JSON.stringify({
        wireVersion: 5,
        scope: {
          kind: 'connected-stage',
          projectId: 'a1',
          inputHash: question.inputHash,
          questionHash: question.questionHash,
        },
        status: 'feasible',
        offsets,
        objectiveValues: {
          makespan: term(
            Math.max(...request.slices.map((slice) => offsets[slice.key] + slice.durationUnits)),
          ),
          priority: term(
            request.slices.reduce(
              (sum, slice) =>
                sum + slice.priorityWeight * (offsets[slice.key] + slice.durationUnits),
              0,
            ),
          ),
          movement: term(0),
        },
      }),
      hashConnectedBytes,
    );
    f.source.db
      .insert(optimizedScheduleCache)
      .values({
        ...question,
        generation: 1,
        status: 'ok',
        resultJson: JSON.stringify(success),
        createdAt: 12,
      })
      .run();
    f.source.db
      .insert(optimizedScheduleCache)
      .values({
        ...captureConnectedQuestion(stage, 'pri', installed),
        generation: 1,
        status: 'failed',
        failureReason: 'timeout',
        createdAt: 12,
      })
      .run();
    const mountedTree = await f.tree();
    expect(mountedTree).toMatchObject({ optimization: { variants: { time: { state: 'ready' } } } });
    const tree = await f.services.workItems.treeWithin('a1', access);
    if (tree === null || 'kind' in tree) throw Error('scheduled tree expected');
    expect(tree).toMatchObject({ optimization: { variants: { time: { state: 'ready' } } } });
    const exported = await f.services.workItems.exportWithin('a1', access);
    expect(exported.kind).toBe('connected');
    if (exported.kind !== 'connected') throw Error('connected export expected');
    expect(exported.tree).toEqual(tree);
    if (mode === 'shared') {
      const aggregate = await f.services.workItems.sharedTreesWithin('ada', access);
      expect(aggregate.kind).toBe('shared');
      if (aggregate.kind !== 'shared') throw Error('shared aggregate expected');
      expect(aggregate.entries.find((entry) => entry.projectId === 'a1')?.tree).toEqual(tree);
    }
    // Borrowed command reads must retain the same installed connected reader.
    await f.bound.uow.run(async (scope) => {
      const borrowed = servicesOver(scope.stores, {
        admission: CREATOR_ADMISSION,
        dependencyContext: createLocalDependencyContext(scope.stores),
        clock: clockOf({ now: () => 12, newId: () => crypto.randomUUID() }),
        broadcast: recordingBroadcaster(),
        scheduler: fastScheduler,
        schedulerMode: 'capture',
      });
      const mounted = testApp({
        ...f.services,
        ...borrowed,
        writes: f.services,
        auth: testLocalAuthService({ id: 'ada', username: 'ada', scopes: ['read', 'write'] }),
        organizations: new SqliteOrganizationAccess(
          f.source.db,
          userBoundOrganizationOf(() => Promise.resolve('org-a')),
          () => 12,
        ),
      });
      expect(await f.tree(mounted)).toEqual(mountedTree);
      return { commit: true, value: undefined };
    });
    expect(await f.tree()).toMatchObject({
      optimization: { variants: { time: { state: 'ready' } } },
    });
    expect(
      mountedTree.slices.map((slice: { id: string; earliestStart: number }) => [
        slice.id,
        slice.earliestStart,
      ]),
    ).toEqual([...stage.starts].filter(([key]) => key.startsWith('a1\u0000')));
    expect(f.launched).toEqual([]);
    for (const table of ['optimization_generation', 'solver_queue', 'solver_slot'])
      expect(f.sqlite.query(`SELECT * FROM ${table}`).all()).toEqual([]);
  });
}

test('absent runtime remains explicitly unavailable and allocates no solver work', async () => {
  const f = await fixture(false);
  expect(f.services.optimizer).toBeUndefined();
  expect(await f.services.workItems.treeWithin('a1', access)).toMatchObject({
    scheduleError: { kind: 'engine_unavailable', reason: 'adapter_missing' },
  });
  for (const table of ['optimization_generation', 'solver_queue', 'solver_slot'])
    expect(f.sqlite.query(`SELECT * FROM ${table}`).all()).toEqual([]);
});

for (const fault of ['changed-question', 'calendar', 'throw'] as const) {
  test(`installed restart dequeues old connected question with ${fault} without leaking its slot`, async () => {
    const f = await fixture();
    const stage = await f.capture();
    const question = captureConnectedQuestion(stage, 'time', installed);
    f.source.db
      .insert(optimizationGeneration)
      .values({
        projectId: 'a1',
        contractVersion: question.contractVersion,
        generation: 1,
        inputHash: question.inputHash,
        cancelEpoch: 0,
        updatedAt: 1,
      })
      .run();
    f.source.db
      .insert(solverQueue)
      .values({
        projectId: 'a1',
        contractVersion: question.contractVersion,
        generation: 1,
        objective: 'time',
        budgetMs: installed.budgetMs,
        admittedCancelEpoch: 0,
        enqueuedAt: 1,
      })
      .run();
    if (fault === 'calendar') f.sqlite.run("UPDATE project SET start_date=NULL WHERE id='a2'");
    if (fault === 'throw') f.sqlite.run("UPDATE estimate SET realistic=-1 WHERE work_item_id='a2'");
    if (fault === 'changed-question')
      f.sqlite.run(
        "UPDATE estimate SET optimistic=2,realistic=2,pessimistic=2 WHERE work_item_id='a2'",
      );
    const optimizer = f.services.optimizer;
    if (optimizer === undefined) throw Error('optimizer missing');
    optimizer.start();
    await optimizer.drain();
    await optimizer.stop();
    expect(f.sqlite.query('SELECT * FROM solver_slot').all()).toEqual([]);
    expect(f.sqlite.query('SELECT * FROM solver_queue').all()).toEqual([]);
    expect(f.probe.borrowed).toBe(0);
    if (fault === 'changed-question') {
      expect(f.launched).toHaveLength(2);
      const next = captureConnectedQuestion(await f.capture(), 'time', installed);
      expect(next.inputHash).not.toBe(question.inputHash);
      expect(f.launched.map((asked) => asked.key.inputHash)).toEqual([
        next.inputHash,
        next.inputHash,
      ]);
      expect(f.errors).toEqual([]);
    } else {
      expect(f.launched).toEqual([]);
      if (fault === 'throw') expect(f.errors.join('')).toContain('optimizer child failed');
      else expect(f.errors).toEqual([]);
    }
  });
}

for (const mode of ['isolated', 'shared'] as const) {
  test(`cold mounted ${mode} connected tree admits only its detached target after read closure`, async () => {
    const f = await fixture(true, mode, true);
    // The predecessor is also enabled: a target read must not fan admission out to it.
    f.sqlite.run("UPDATE project SET optimization_enabled=1 WHERE id='a2'");
    const observed = await f.bound.stores.livePlans?.read('a1', access);
    if (observed?.kind !== 'connected' || observed.projection.placement.kind !== 'scheduled')
      throw Error('expected connected stage capture');
    const stage = observed.projection.placement.stages.find(
      (selection) => selection.stage.projectId === 'a1',
    )?.stage;
    if (stage === undefined) throw Error('target stage missing');
    const observations = f.probe.observations;
    const first = await f.tree();
    expect(f.launched).toHaveLength(2);
    expect(f.probe.observations - observations).toBe(1);
    expect(f.probe.writerReads.length).toBeGreaterThan(0);
    expect(f.probe.writerReads.every((open) => open === 0)).toBe(true);
    expect(first).toMatchObject({
      optimization: { variants: { pri: { state: 'idle' }, time: { state: 'idle' } } },
    });
    expect(f.probe.borrowed).toBe(0);
    expect(f.launched).toHaveLength(2);
    expect(f.launched.map((asked) => [asked.key.projectId, asked.objective]).sort()).toEqual([
      ['a1', 'pri'],
      ['a1', 'time'],
    ]);
    for (const asked of f.launched) {
      if (asked.kind !== 'connected') throw Error('expected connected launch');
      expect(canonicalConnectedStageInput(asked.stage)).toBe(canonicalConnectedStageInput(stage));
      expect(asked.key.inputHash).toBe(
        captureConnectedQuestion(stage, asked.objective, installed).inputHash,
      );
    }
    await Promise.all([f.tree(), f.tree(), f.tree()]);
    f.services.optimizer?.inputChanged('a1');
    // Background capture shares current work; it must not reserve another seat.
    await f.services.workItems.optimizationCapture('a1');
    expect(f.launched).toHaveLength(2);
    f.finishChildren();
    await f.services.optimizer?.drain();
    const ledger = () =>
      ['optimization_generation', 'solver_slot', 'solver_queue', 'event_log'].map((table) =>
        f.sqlite.query(`SELECT * FROM ${table}`).all(),
      );
    const terminal = ledger();
    expect(await f.tree()).toMatchObject({
      optimization: {
        variants: { pri: { state: 'boundary-infeasible' }, time: { state: 'boundary-infeasible' } },
      },
    });
    await f.tree();
    expect(f.launched.filter((asked) => asked.key.projectId === 'a1')).toHaveLength(2);
    expect(ledger()).toEqual(terminal);
    expect(f.errors).toEqual([]);
  });
}

test('configured connected live tree refuses missing admission while borrowed capture remains inert', async () => {
  const f = await fixture();
  const graph = servicesOver(f.bound.stores, {
    admission: CREATOR_ADMISSION,
    dependencyContext: createLocalDependencyContext(f.bound.stores),
    clock: clockOf({ now: () => 12, newId: () => crypto.randomUUID() }),
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  });
  const missingAdmission = await graph.workItems.treeWithin('a1', access).then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(missingAdmission).toBeInstanceOf(Error);
  expect(String(missingAdmission)).toContain('connected optimizer admission');
  await f.bound.uow.run(async (scope) => {
    await scope.stores.estimates.set(
      { workItemId: 'a2', stepId: 'a2-s', optimistic: 3, realistic: 3, pessimistic: 3 },
      { by: 'ada', at: 12 },
    );
    const borrowed = servicesOver(scope.stores, {
      admission: CREATOR_ADMISSION,
      dependencyContext: createLocalDependencyContext(scope.stores),
      clock: clockOf({ now: () => 12, newId: () => crypto.randomUUID() }),
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
      schedulerMode: 'capture',
      admitConnectedOptimization: () => {
        throw Error('live admission reached borrowed capture');
      },
    });
    const mounted = testApp({
      ...f.services,
      ...borrowed,
      writes: f.services,
      auth: testLocalAuthService({ id: 'ada', username: 'ada', scopes: ['read', 'write'] }),
      organizations: new SqliteOrganizationAccess(
        f.source.db,
        userBoundOrganizationOf(() => Promise.resolve('org-a')),
        () => 12,
      ),
    });
    const captured = await f.tree(mounted);
    expect(captured).toMatchObject({ optimization: { variants: { time: { state: 'idle' } } } });
    expect(captured.slices.map((slice) => slice.earliestStart)).toEqual([3]);
    expect(await scope.stores.estimates.listByProject('a2')).toMatchObject([{ realistic: 3 }]);
    expect(f.sqlite.query("SELECT realistic FROM estimate WHERE work_item_id='a2'").get()).toEqual({
      realistic: 1,
    });
    return { commit: false, value: undefined };
  });
  expect(await f.bound.stores.estimates.listByProject('a2')).toMatchObject([{ realistic: 1 }]);
  expect(f.launched).toEqual([]);
});

for (const mode of ['isolated', 'shared'] as const) {
  test(`installed ${mode} non-public connected observations reserve no optimizer work`, async () => {
    const f = await fixture(true, mode);
    await f.services.workItems.tree('a1');
    await f.services.workItems.exportWithin('a1', access);
    await f.services.workItems.optimizationCapture('a1');
    await f.services.workItems.optimizationCaptureWithin('a1', access);
    if (mode === 'shared') await f.services.workItems.sharedTreesWithin('ada', access);
    await f.services.optimizer?.drain();
    expect(f.launched).toEqual([]);
    for (const table of ['optimization_generation', 'solver_queue', 'solver_slot'])
      expect(f.sqlite.query(`SELECT * FROM ${table}`).all()).toEqual([]);
  });
}

for (const fault of ['disabled', 'calendar', 'denied'] as const) {
  test(`mounted connected live ${fault} read allocates no optimizer work`, async () => {
    const f = await fixture();
    if (fault === 'disabled')
      f.sqlite.run("UPDATE project SET optimization_enabled=0 WHERE id='a1'");
    if (fault === 'calendar') f.sqlite.run("UPDATE project SET start_date=NULL WHERE id='a2'");
    if (fault === 'denied') {
      const refused = await f.app.handle(
        new Request('http://localhost/api/projects/a1/work-items', {
          headers: { 'X-WBS-Expected-Organization': 'org-b' },
        }),
      );
      expect(refused.status).toBe(409);
    } else {
      if (fault === 'disabled') {
        const captureOnly = servicesOver(f.bound.stores, {
          admission: CREATOR_ADMISSION,
          dependencyContext: createLocalDependencyContext(f.bound.stores),
          clock: clockOf({ now: () => 12, newId: () => crypto.randomUUID() }),
          broadcast: recordingBroadcaster(),
          scheduler: fastScheduler,
        });
        await captureOnly.workItems.treeWithin('a1', access);
      }
      const tree = await f.tree();
      if (fault === 'calendar')
        expect(tree).toMatchObject({ scheduleError: { kind: 'dependency_calendar_missing' } });
    }
    expect(f.launched).toEqual([]);
    for (const table of ['optimization_generation', 'solver_queue', 'solver_slot'])
      expect(f.sqlite.query(`SELECT * FROM ${table}`).all()).toEqual([]);
  });
}

for (const fault of ['disabled', 'draining'] as const) {
  test(`mounted connected live admission respects ${fault} committed at read closure`, async () => {
    const f = await fixture();
    if (fault === 'draining') {
      const question = captureConnectedQuestion(await f.capture(), 'time', installed);
      f.source.db
        .insert(optimizationGeneration)
        .values({
          projectId: 'a1',
          contractVersion: question.contractVersion,
          generation: 1,
          inputHash: question.inputHash,
          cancelEpoch: 0,
          updatedAt: 1,
        })
        .run();
    }
    f.probe.onReleased = () => {
      f.probe.onReleased = () => undefined;
      if (fault === 'disabled')
        f.sqlite.run("UPDATE project SET optimization_enabled=0 WHERE id='a1'");
      else
        f.sqlite.run(
          "UPDATE optimization_generation SET admission_state='draining' WHERE project_id='a1'",
        );
    };
    expect(await f.tree()).toMatchObject({
      optimization: { enabled: true, variants: { time: { state: 'idle' } } },
    });
    expect(f.launched).toEqual([]);
    for (const table of ['solver_queue', 'solver_slot'])
      expect(f.sqlite.query(`SELECT * FROM ${table}`).all()).toEqual([]);
  });
}

async function displacedFixture() {
  const f = await fixture(true, 'isolated', true);
  f.sqlite.run(
    "UPDATE estimate SET optimistic=5,realistic=5,pessimistic=5 WHERE work_item_id='a1'",
  );
  f.sqlite.run("UPDATE project SET schedule_engine='fast',optimization_enabled=0 WHERE id='a2'");
  f.sqlite.run(
    "UPDATE project SET schedule_engine='optimized',schedule_objective='pri',optimization_enabled=1 WHERE id='a3'",
  );
  f.sqlite.run("INSERT INTO step(id,project_id,name,position) VALUES('c-s','a3','Build',10)");
  f.sqlite.run("INSERT INTO service_team(id,name) VALUES('c-team','C capacity')");
  f.sqlite.run(
    "INSERT INTO service_team_organization(resource_id,organization_id,name) VALUES('c-team','org-a','C capacity')",
  );
  f.sqlite.run(
    "INSERT INTO project_team_capacity(project_id,service_team_id,size) VALUES('a3','c-team',1)",
  );
  for (const [id, position, days] of [
    ['c-long', 10, 2],
    ['c-short', 20, 1],
  ] as const) {
    f.sqlite.run('INSERT INTO work_item(id,project_id,position,name,priority) VALUES(?,?,?,?,1)', [
      id,
      'a3',
      position,
      id,
    ]);
    f.sqlite.run(
      'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES(?,?,?,?,?)',
      [id, 'c-s', days, days, days],
    );
    f.sqlite.run("INSERT INTO work_item_team(work_item_id,team_id) VALUES(?,'c-team')", [id]);
    f.sqlite.run(
      "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES(?,'org-a','a1','a3','a1',?,'whole','whole','FS')",
      ['b-to-' + id, id],
    );
  }
  const capture = async () => {
    const observed = await f.bound.stores.livePlans?.read('a1', access);
    if (observed?.kind !== 'connected' || observed.projection.placement.kind !== 'scheduled')
      throw Error('displaced connected placement missing');
    return observed.projection.placement;
  };
  const initial = await capture();
  const cStage = initial.stages.find((selection) => selection.stage.projectId === 'a3')?.stage;
  if (cStage === undefined) throw Error('C seed stage missing');
  const question = captureConnectedQuestion(cStage, 'pri', installed);
  const { stageBytes, ...identity } = question;
  expect(stageBytes).toBe(canonicalConnectedStageInput(cStage));
  const prepared = buildConnectedSolverRequest(cStage, identity, installed, 'pri');
  if (prepared.kind !== 'request') throw Error('C request missing');
  const request = prepared.request;
  expect(request.quantum).toBe(48);
  expect(
    request.slices.map((slice) => [slice.key, slice.durationUnits, slice.priorityWeight]),
  ).toEqual([
    ['c-long\u0000c-s', 96, 1],
    ['c-short\u0000c-s', 48, 1],
  ]);
  const offsets = Object.fromEntries(
    request.slices.map((slice) => [slice.key, slice.key.includes('c-short') ? 288 : 336]),
  );
  const term = (value: number) => ({ value, stageValue: value, bound: 0, status: 'feasible' });
  const success = encodeConnectedSuccess(
    cStage,
    identity,
    request,
    JSON.stringify({
      wireVersion: 5,
      scope: {
        kind: 'connected-stage',
        projectId: 'a3',
        inputHash: question.inputHash,
        questionHash: question.questionHash,
      },
      status: 'feasible',
      offsets,
      objectiveValues: { makespan: term(432), priority: term(768), movement: term(144) },
    }),
    hashConnectedBytes,
  );
  f.source.db
    .insert(optimizedScheduleCache)
    .values({
      ...question,
      generation: 1,
      status: 'ok',
      resultJson: JSON.stringify(success),
      createdAt: 12,
    })
    .run();
  const selected = await capture();
  const bStage = selected.stages.find((selection) => selection.stage.projectId === 'a1')?.stage;
  if (bStage === undefined) throw Error('B stage missing');
  expect(cStage.starts.get('c-long\u0000c-s')).toBe(6);
  expect(cStage.starts.get('c-short\u0000c-s')).toBe(8);
  expect(selected.stages.find((selection) => selection.stage.projectId === 'a3')).toMatchObject({
    chosen: {
      chosen: 'optimized',
      baselineValues: { priority: 17 },
      optimizedValues: { priority: 16 },
    },
  });
  expect(selected.combined.slices.get('c-short\u0000c-s')?.earliestStart).toBe(6);
  expect(selected.combined.slices.get('c-long\u0000c-s')?.earliestStart).toBe(7);
  expect(bStage.starts.get('c-short\u0000c-s')).toBe(8);
  const finalStage = {
    ...bStage,
    starts: new Map(
      [...selected.combined.slices].map(([key, slice]) => [key, slice.earliestStart]),
    ),
    finishes: new Map(
      [...selected.combined.slices].map(([key, slice]) => [key, slice.earliestFinish]),
    ),
  };
  return { ...f, bStage, finalStage };
}

test('displaced mounted live admission retains B pre-selection question after C Pri selection', async () => {
  const f = await displacedFixture();
  const observations = f.probe.observations;
  const tree = await f.tree();
  expect(f.probe.observations - observations).toBe(1);
  expect(tree).toMatchObject({
    optimization: { variants: { pri: { state: 'idle' }, time: { state: 'idle' } } },
  });
  expect(f.probe.borrowed).toBe(0);
  expect(f.probe.writerReads.length).toBeGreaterThan(0);
  expect(f.probe.writerReads.every((open) => open === 0)).toBe(true);
  expect(tree.slices.map((slice) => [slice.id, slice.earliestStart])).toEqual([
    ['a1\u0000a1-s', 1],
  ]);
  expect(f.launched.map((asked) => [asked.key.projectId, asked.objective]).sort()).toEqual([
    ['a1', 'pri'],
    ['a1', 'time'],
  ]);
  for (const asked of f.launched) {
    if (asked.kind !== 'connected') throw Error('connected B request missing');
    const question = captureConnectedQuestion(f.bStage, asked.objective, installed);
    const { stageBytes, ...identity } = question;
    const expected = buildConnectedSolverRequest(f.bStage, identity, installed, asked.objective);
    expect(canonicalConnectedStageInput(asked.stage)).toBe(stageBytes);
    expect(asked.key.inputHash).toBe(question.inputHash);
    expect(expected.kind).toBe('request');
    if (expected.kind !== 'request') throw Error('B request missing');
    expect(asked.request).toEqual(expected.request);
    expect(asked.request.scope.questionHash).toBe(question.questionHash);
    expect(asked.request.scope.fixed).toEqual([
      { projectId: 'a2', key: 'a2\u0000a2-s', start: 0, finish: 1 },
      { projectId: 'a3', key: 'c-long\u0000c-s', start: 6, finish: 8 },
      { projectId: 'a3', key: 'c-short\u0000c-s', start: 8, finish: 9 },
    ]);
    expect(
      asked.request.scope.boundaries.find((boundary) => boundary.relationshipId === 'edge'),
    ).toMatchObject({ direction: 'incoming', minimumStartUnits: 48 });
    expect(
      asked.request.scope.boundaries.find((boundary) => boundary.relationshipId === 'b-to-c-short'),
    ).toMatchObject({ direction: 'outgoing', maximumStartUnits: 144 });
    expect(asked.request.movementReferenceOffsets).toEqual({ 'a1\u0000a1-s': 48 });
    const finalQuestion = captureConnectedQuestion(f.finalStage, asked.objective, installed);
    const { stageBytes: finalBytes, ...finalIdentity } = finalQuestion;
    expect(finalBytes).not.toBe(stageBytes);
    const finalRequest = buildConnectedSolverRequest(
      f.finalStage,
      finalIdentity,
      installed,
      asked.objective,
    );
    if (finalRequest.kind !== 'request') throw Error('final comparison request missing');
    expect(
      finalRequest.request.scope.boundaries.find(
        (boundary) => boundary.relationshipId === 'b-to-c-short',
      ),
    ).toMatchObject({ maximumStartUnits: 48 });
    expect(question.inputHash).not.toBe(
      captureConnectedQuestion(f.finalStage, asked.objective, installed).inputHash,
    );
  }
  expect(f.errors).toEqual([]);
});

test('displaced mounted Retry accepts retained B hash and refuses final composite hash', async () => {
  const f = await displacedFixture();
  const question = captureConnectedQuestion(f.bStage, 'pri', installed);
  f.source.db
    .insert(optimizedScheduleCache)
    .values({
      ...question,
      generation: 1,
      status: 'failed',
      failureReason: 'timeout',
      createdAt: 12,
    })
    .run();
  f.source.db
    .insert(optimizationGeneration)
    .values({
      projectId: 'a1',
      contractVersion: question.contractVersion,
      generation: 1,
      inputHash: question.inputHash,
      cancelEpoch: 0,
      updatedAt: 12,
    })
    .run();
  const retry = (inputHash: string) =>
    f.app.handle(
      new Request('http://localhost/api/projects/a1/optimization/retry', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-WBS-Expected-Organization': 'org-a' },
        body: JSON.stringify({ inputHash, objective: 'pri' }),
      }),
    );
  const ledger = () =>
    [
      'optimization_generation',
      'solver_queue',
      'solver_slot',
      'optimized_schedule_cache',
      'event_log',
    ].map((table) => f.sqlite.query(`SELECT * FROM ${table}`).all());
  const before = ledger();
  const refused = await retry(captureConnectedQuestion(f.finalStage, 'pri', installed).inputHash);
  expect(refused.status).toBe(409);
  expect(await refused.json()).toMatchObject({ code: 'stale-input-hash' });
  expect(f.launched).toEqual([]);
  expect(ledger()).toEqual(before);
  const accepted = await retry(question.inputHash);
  expect(accepted.status).toBe(202);
  expect(await accepted.json()).toMatchObject({ state: 'retrying', inputHash: question.inputHash });
  expect(f.launched).toHaveLength(1);
  const asked = f.launched[0];
  if (asked.kind !== 'connected') throw Error('connected Retry missing');
  expect(asked.objective).toBe('pri');
  expect(asked.key.projectId).toBe('a1');
  expect(asked.key.inputHash).toBe(question.inputHash);
  expect(canonicalConnectedStageInput(asked.stage)).toBe(question.stageBytes);
  const { stageBytes, ...identity } = question;
  expect(stageBytes).toBe(canonicalConnectedStageInput(f.bStage));
  const prepared = buildConnectedSolverRequest(f.bStage, identity, installed, 'pri');
  if (prepared.kind !== 'request') throw Error('Retry comparison request missing');
  expect(asked.request).toEqual(prepared.request);
  expect(f.probe.writerReads.every((open) => open === 0)).toBe(true);
  expect(f.probe.borrowed).toBe(0);
  expect(f.errors).toEqual([]);
});

async function interleavingFixture() {
  const f = await fixture(true, 'isolated', true);
  f.sqlite.run('DELETE FROM external_dependency');
  f.sqlite.run('DELETE FROM estimate');
  f.sqlite.run('DELETE FROM work_item');
  f.sqlite.run('DELETE FROM step');
  f.sqlite.run(
    "UPDATE project SET schedule_engine='optimized',schedule_objective='pri',optimization_enabled=1 WHERE id IN ('a1','a2')",
  );
  f.sqlite.run(
    "INSERT INTO project_rank(project_id,organization_id,position,created_at,created_by) VALUES('a2','org-a',0,1,'ada'),('a1','org-a',0,1,'ada')",
  );
  for (const project of ['a1', 'a2']) {
    f.sqlite.run('INSERT INTO service_team(id,name) VALUES(?,?)', [project, project]);
    f.sqlite.run(
      "INSERT INTO service_team_organization(resource_id,organization_id,name) VALUES(?,'org-a',?)",
      [project, project],
    );
    f.sqlite.run(
      'INSERT INTO project_team_capacity(project_id,service_team_id,size) VALUES(?,?,1)',
      [project, project],
    );
    const steps = project === 'a1' ? ['design', 'test'] : ['build'];
    for (const [position, step] of steps.entries())
      f.sqlite.run('INSERT INTO step(id,project_id,name,position) VALUES(?,?,?,?)', [
        step,
        project,
        step,
        position,
      ]);
    for (const [position, suffix] of ['long', 'short'].entries()) {
      const id = project + '-' + suffix;
      f.sqlite.run(
        'INSERT INTO work_item(id,project_id,position,name,priority) VALUES(?,?,?,?,1)',
        [id, project, position, id],
      );
      f.sqlite.run('INSERT INTO work_item_team(work_item_id,team_id) VALUES(?,?)', [id, project]);
      for (const step of steps) {
        const days = suffix === 'long' && step !== 'test' ? 2 : 1;
        f.sqlite.run(
          'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES(?,?,?,?,?)',
          [id, step, days, days, days],
        );
      }
    }
  }
  for (const predecessor of ['long', 'short'])
    for (const successor of ['long', 'short'])
      for (const [from, to, fromStep, toStep] of [
        ['a1', 'a2', 'design', 'build'],
        ['a2', 'a1', 'build', 'test'],
      ])
        f.sqlite.run(
          "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,predecessor_step_id,successor_step_id,type) VALUES(?,'org-a',?,?,?,?,'node','node',?,?,'FS')",
          [
            from + predecessor + to + successor,
            from,
            to,
            from + '-' + predecessor,
            to + '-' + successor,
            fromStep,
            toStep,
          ],
        );
  const capture = async () => {
    const observed = await f.bound.stores.livePlans?.read('a1', access);
    if (observed?.kind !== 'connected' || observed.projection.placement.kind !== 'scheduled')
      throw Error('interleaving placement missing');
    return observed.projection.placement;
  };
  const seed = (
    stage: Parameters<typeof captureConnectedQuestion>[0],
    objective: 'pri' | 'time',
    days: Readonly<Record<string, number>>,
  ) => {
    const question = captureConnectedQuestion(stage, objective, installed);
    const { stageBytes, ...identity } = question;
    expect(stageBytes).toBe(canonicalConnectedStageInput(stage));
    const prepared = buildConnectedSolverRequest(stage, identity, installed, objective);
    if (prepared.kind !== 'request') throw Error('interleaving request missing');
    const request = prepared.request;
    const offsets = Object.fromEntries(
      Object.entries(days).map(([key, start]) => [key, start * 48]),
    );
    const finishes = request.slices.map((slice) => offsets[slice.key] + slice.durationUnits);
    const term = (value: number) => ({ value, stageValue: value, bound: 0, status: 'feasible' });
    const success = encodeConnectedSuccess(
      stage,
      identity,
      request,
      JSON.stringify({
        wireVersion: 5,
        scope: {
          kind: 'connected-stage',
          projectId: stage.projectId,
          inputHash: question.inputHash,
          questionHash: question.questionHash,
        },
        status: 'feasible',
        offsets,
        objectiveValues: {
          makespan: term(Math.max(...finishes)),
          priority: term(
            request.slices.reduce(
              (sum, slice, index) => sum + slice.priorityWeight * finishes[index],
              0,
            ),
          ),
          movement: term(
            request.slices.reduce(
              (sum, slice) =>
                sum + Math.abs(offsets[slice.key] - request.movementReferenceOffsets[slice.key]),
              0,
            ),
          ),
        },
      }),
      hashConnectedBytes,
    );
    f.source.db
      .insert(optimizedScheduleCache)
      .values({
        ...question,
        generation: 1,
        status: 'ok',
        resultJson: JSON.stringify(success),
        createdAt: 12,
      })
      .run();
    return question;
  };
  const initial = await capture();
  const a = initial.stages.find((selection) => selection.stage.projectId === 'a1');
  if (a === undefined) throw Error('A stage missing');
  const aDays = {
    'a1-long\u0000design': 1,
    'a1-short\u0000design': 0,
    'a1-long\u0000test': 7,
    'a1-short\u0000test': 6,
  };
  seed(a.stage, 'pri', aDays);
  seed(
    a.stage,
    'time',
    Object.fromEntries([...a.stage.starts].filter(([key]) => key.startsWith('a1-'))),
  );
  const afterA = await capture();
  const b = afterA.stages.find((selection) => selection.stage.projectId === 'a2');
  if (b === undefined) throw Error('B stage missing');
  seed(b.stage, 'pri', { 'a2-long\u0000build': 4, 'a2-short\u0000build': 3 });
  seed(b.stage, 'time', { 'a2-long\u0000build': 3, 'a2-short\u0000build': 5 });
  return { ...f, capture, initial, afterA, a: a.stage, b: b.stage };
}

// Proof: inverted ordering, original-Fast stage reuse, wrong objective, and double visits each fail this mounted test; final-stage substitution fails its retained bytes. See verify-task-7.3-interleaving.md.
test('mounted interleaving selects both durable Pri candidates once and retains stage identities', async () => {
  const f = await interleavingFixture();
  const selected = await f.capture();
  expect(selected.stages.map((selection) => selection.stage.projectId)).toEqual(['a1', 'a2']);
  expect(selected.stages.map((selection) => selection.chosen?.chosen)).toEqual([
    'optimized',
    'optimized',
  ]);
  expect([...selected.combined.slices].map(([key, slice]) => [key, slice.earliestStart])).toEqual([
    ['a1-long\u0000design', 1],
    ['a1-long\u0000test', 7],
    ['a1-short\u0000design', 0],
    ['a1-short\u0000test', 6],
    ['a2-long\u0000build', 4],
    ['a2-short\u0000build', 3],
  ]);
  expect(f.b.starts.get('a1-short\u0000design')).toBe(0);
  expect(f.a.starts.get('a2-short\u0000build')).toBe(5);
  expect(selected.stages.map((selection) => canonicalConnectedStageInput(selection.stage))).toEqual(
    [canonicalConnectedStageInput(f.a), canonicalConnectedStageInput(f.b)],
  );
  expect(
    selected.stages.every(
      (selection) =>
        selection.optimization?.variants.pri.state === 'ready' &&
        selection.optimization.variants.time.state === 'ready',
    ),
  ).toBe(true);
  for (const selection of selected.stages) {
    const bytes = canonicalConnectedStageInput(selection.stage);
    expect(selection.optimization?.candidates.pri?.question.stageBytes).toBe(bytes);
    expect(selection.optimization?.candidates.time?.question.stageBytes).toBe(bytes);
  }
  for (let repeat = 0; repeat < 2; repeat++) {
    const observations = f.probe.observations;
    const tree = await f.tree();
    expect(f.probe.observations - observations).toBe(1);
    expect(tree.slices.map((slice) => [slice.id, slice.earliestStart])).toEqual([
      ['a1-long\u0000design', 1],
      ['a1-long\u0000test', 7],
      ['a1-short\u0000design', 0],
      ['a1-short\u0000test', 6],
    ]);
    expect(tree).toMatchObject({
      optimization: { inputHash: captureConnectedQuestion(f.a, 'pri', installed).inputHash },
    });
    const bTree = await f.tree(f.app, 'a2');
    expect(bTree.slices.map((slice) => [slice.id, slice.earliestStart])).toEqual([
      ['a2-long\u0000build', 4],
      ['a2-short\u0000build', 3],
    ]);
    expect(bTree).toMatchObject({
      optimization: { inputHash: captureConnectedQuestion(f.b, 'pri', installed).inputHash },
    });
    expect(await f.capture()).toEqual(selected);
  }
  expect(f.launched).toEqual([]);
  expect(f.errors).toEqual([]);
});

for (const state of ['idle', 'pending', 'failed', 'corrupt', 'boundary-infeasible'] as const) {
  test(`mounted interleaving ${state} B retains exact valid A-selected composite`, async () => {
    const f = await interleavingFixture();
    if (state === 'failed')
      f.sqlite.run(
        "UPDATE optimized_schedule_cache SET status='failed',failure_reason='timeout',result_json=NULL WHERE project_id='a2' AND objective='pri'",
      );
    else if (state === 'corrupt')
      f.sqlite.run(
        "UPDATE optimized_schedule_cache SET result_json='{' WHERE project_id='a2' AND objective='pri'",
      );
    else
      f.sqlite.run(
        "DELETE FROM optimized_schedule_cache WHERE project_id='a2' AND objective='pri'",
      );
    if (state === 'pending' || state === 'boundary-infeasible') {
      const response = await f.app.handle(
        new Request('http://localhost/api/projects/a2/work-items', {
          headers: { 'X-WBS-Expected-Organization': 'org-a' },
        }),
      );
      expect(response.status).toBe(200);
      expect(f.launched.map((asked) => [asked.key.projectId, asked.objective])).toEqual([
        ['a2', 'pri'],
      ]);
      if (state === 'boundary-infeasible') {
        f.finishChildren();
        await f.services.optimizer?.drain();
      }
    }
    const selected = await f.capture();
    expect(selected.combined).toEqual(f.afterA.combined);
    expect(selected.stages.map((selection) => selection.chosen?.chosen ?? null)).toEqual([
      'optimized',
      null,
    ]);
    expect(selected.stages[1]?.optimization?.variants.pri.state).toBe(state);
    expect(selected.stages[1]?.optimization?.variants.time.state).toBe('ready');
    expect(canonicalConnectedStageInput(selected.stages[1].stage)).toBe(
      canonicalConnectedStageInput(f.b),
    );
    if (state === 'boundary-infeasible') {
      expect(selected.stages[1]?.optimization?.variants.pri).toMatchObject({
        state,
        certificate: { kind: state, question: captureConnectedQuestion(f.b, 'pri', installed) },
      });
      const observations = f.probe.observations;
      await f.tree();
      expect(f.probe.observations - observations).toBe(1);
      expect(f.launched).toHaveLength(1);
    }
    const tree = await f.tree(f.app, 'a2');
    expect(tree).toMatchObject({ optimization: { variants: { pri: { state } } } });
    expect(tree.slices.map((slice) => [slice.id, slice.earliestStart])).toEqual([
      ['a2-long\u0000build', 3],
      ['a2-short\u0000build', 5],
    ]);
    expect(f.errors).toEqual([]);
  });
}

for (const choice of ['fast', 'disabled', 'time'] as const) {
  test(`mounted interleaving ${choice} B retains configured selection and A foreign starts`, async () => {
    const f = await interleavingFixture();
    if (choice === 'fast') f.sqlite.run("UPDATE project SET schedule_engine='fast' WHERE id='a2'");
    else if (choice === 'disabled')
      f.sqlite.run("UPDATE project SET optimization_enabled=0 WHERE id='a2'");
    else f.sqlite.run("UPDATE project SET schedule_objective='time' WHERE id='a2'");
    const selected = await f.capture();
    expect(selected.combined).toEqual(f.afterA.combined);
    expect(selected.stages[0]?.chosen?.chosen).toBe('optimized');
    expect(selected.stages[1]?.chosen?.chosen ?? null).toBe(choice === 'time' ? 'optimized' : null);
    expect(selected.stages[1]?.optimization === null).toBe(choice === 'disabled');
    if (choice !== 'disabled') {
      expect(selected.stages[1]?.optimization?.variants.pri.state).toBe('ready');
      expect(selected.stages[1]?.optimization?.variants.time.state).toBe('ready');
    }
    expect(selected.combined.slices.get('a1-short\u0000design')?.earliestStart).toBe(0);
    const tree = await f.tree(f.app, 'a2');
    expect(tree.slices.map((slice) => [slice.id, slice.earliestStart])).toEqual([
      ['a2-long\u0000build', 3],
      ['a2-short\u0000build', 5],
    ]);
    expect(f.launched).toEqual([]);
  });
}

test('mounted interleaving held member has no stage or optimization request', async () => {
  const f = await interleavingFixture();
  f.sqlite.run("UPDATE work_item SET hold='on_hold' WHERE project_id='a2'");
  const selected = await f.capture();
  expect(selected.stages.map((selection) => selection.stage.projectId)).toEqual(['a1']);
  expect([...selected.combined.slices.keys()].some((key) => key.startsWith('a2-'))).toBe(false);
  const tree = await f.tree();
  expect(tree.slices.some((slice) => slice.id.startsWith('a2-'))).toBe(false);
  expect(f.launched.every((asked) => asked.key.projectId === 'a1')).toBe(true);
  expect(f.errors).toEqual([]);
});

test('mounted interleaving rank precedes bytewise ID in the single stage pass', async () => {
  const f = await interleavingFixture();
  f.sqlite.run("UPDATE project_rank SET position=-1 WHERE project_id='a2'");
  const selected = await f.capture();
  expect(selected.stages.map((selection) => selection.stage.projectId)).toEqual(['a2', 'a1']);
  expect(selected.stages.map((selection) => selection.optimization?.variants.pri.state)).toEqual([
    'idle',
    'idle',
  ]);
  expect(selected.combined).toEqual(f.initial.combined);
  expect(f.launched).toEqual([]);
});
