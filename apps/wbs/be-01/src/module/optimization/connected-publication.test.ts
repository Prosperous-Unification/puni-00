import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CommittedProjectEvent } from '@wbs/core/ports/committed-fanout';
import type { OptimizationInput } from '@wbs/core/ports/optimization-input';
import { sliceKey } from '@wbs/domain';
import { response, stage } from '@wbs/store-sqlite/connected-optimization.fixture';
import { readConnectedOptimizationPair } from '@wbs/store-sqlite/connected-optimization-cache';
import {
  captureConnectedQuestion,
  hashConnectedBytes,
} from '@wbs/store-sqlite/connected-question-identity';
import { openSqliteSource } from '@wbs/store-sqlite/source';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, expect, it } from 'bun:test';

import { openDatabase } from '../../repository/db';
import { DrizzleEventLogStore } from '../../repository/event-log';
import { OPEN } from '../../repository/gate';
import { runMigrations } from '../../repository/migrate';
import { createOptimizationRepository } from '../../repository/optimization';
import { allocateGeneration } from '../../repository/optimization-generation';
import { readGeneration } from '../../repository/optimization-generation';
import { enqueueSolverRequest } from '../../repository/optimization-queue';
import { scheduleInputHash } from '../../repository/schedule-input-hash';
import {
  eventSequencer,
  optimizationGeneration,
  optimizedScheduleCache,
  solverQueue,
} from '../../repository/schema';
import { eventLog, optimizationBoundaryCertificate, solverSlot } from '../../repository/schema';
import { createDequeueReservationOwner } from '../../service/optimization-dequeue-reservation';
import { createInitialReservationOwner } from '../../service/optimization-initial-reservation';
import { createOptimizationObservationOwner } from '../../service/optimization-observation';
import { createOptimizationOutcomeOwner } from '../../service/optimization-outcome';
import { createRetryReservationOwner } from '../../service/optimization-retry-reservation';
import { capturedSchedulerFixture } from '../../testing/captured-scheduler-fixture';
import type { ReservedSpawnRequest } from './contract';
import {
  OptimizationCoordinator,
  type OptimizationCoordinatorOptions,
} from './optimization.feature';

const installed = { solverVersion: '0.4.0', budgetMs: 1000 };
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function stream(bytes: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(bytes));
      controller.close();
    },
  });
}
function fixture(
  fractional = true,
  terminal = false,
  overrides: Partial<OptimizationCoordinatorOptions> = {},
) {
  const directory = mkdtempSync(join(tmpdir(), 'connected-publication-'));
  directories.push(directory);
  const path = join(directory, 'store.db');
  runMigrations(path, new URL('../../../drizzle', import.meta.url).pathname);
  const sqlite = openDatabase(path);
  sqlite.run("INSERT INTO users(id,username,password_hash,created_at) VALUES('u','u','x',1)");
  sqlite.run(
    "INSERT INTO project(id,name,owner_id,created_at,optimization_enabled) VALUES('B','B','u',1,1)",
  );
  sqlite.close();
  const source = openSqliteSource({ dbPath: path });
  const bound = source.bindLivePlans({
    schedulerOf: () =>
      capturedSchedulerFixture(
        () => {
          throw new Error('unexpected local schedule');
        },
        () => false,
      ),
  });
  const delivered: CommittedProjectEvent[] = [];
  const delivery = { now: () => 10, deliverCommitted: () => Promise.resolve() };
  const repository = {
    ...createOptimizationRepository(
      source.db,
      new DrizzleEventLogStore(source.db, OPEN),
      source.gate,
    ),
    observeForAdmission: createOptimizationObservationOwner(source.db, bound.uow, delivery),
    recordOutcome: createOptimizationOutcomeOwner(source.db, bound.uow, delivery),
    admitRetry: createRetryReservationOwner(source.db, bound.uow, delivery),
    reserveSlot: createInitialReservationOwner(source.db, bound.uow, delivery),
    dequeueRequest: createDequeueReservationOwner(source.db, bound.uow, delivery),
  };
  let current: OptimizationInput = { kind: 'connected', stage: stage(fractional) };
  const launched: ReservedSpawnRequest[] = [];
  const errors: unknown[] = [];
  let token = 0;
  let childStatus = terminal ? 'boundary-infeasible' : 'feasible';
  let movement = 0;
  const coordinator = new OptimizationCoordinator({
    ...installed,
    contractVersion: captureConnectedQuestion(stage(), 'pri', installed).contractVersion,
    repository,
    hashInput: scheduleInputHash,
    hashConnectedBytes,
    ownerId: 'owner',
    now: () => 10,
    attemptToken: () => `attempt-${String(++token)}`,
    inputOf: () => {
      throw new Error('connected capture fell back to local input');
    },
    enabledOf: () => Promise.resolve(true),
    captureOf: () => Promise.resolve({ kind: 'scheduled' as const, input: current, enabled: true }),
    spawn: (asked) => {
      launched.push(asked);
      if (asked.kind !== 'connected') throw new Error('lost connected scope');
      const payload = JSON.parse(response(asked.request, childStatus).stdout) as {
        objectiveValues?: {
          movement: { value: number; stageValue: number; bound: number; status: string };
        };
      };
      if (payload.objectiveValues !== undefined)
        payload.objectiveValues.movement = {
          value: movement,
          stageValue: movement,
          bound: movement,
          status: 'optimal',
        };
      const stdout = JSON.stringify(payload);
      return Promise.resolve({
        pid: token + 100,
        stdout: stream(stdout),
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
    deliverCommitted: (envelopes) => {
      delivered.push(...envelopes);
      return Promise.resolve();
    },
    ...overrides,
  });
  const admit = async () =>
    coordinator.admitCaptured({ projectId: 'B', input: current, enabled: true });
  const questions = () => {
    if (current.kind !== 'connected') throw new Error('expected connected input');
    return {
      pri: captureConnectedQuestion(current.stage, 'pri', installed),
      time: captureConnectedQuestion(current.stage, 'time', installed),
    };
  };
  return {
    path,
    source,
    repository,
    coordinator,
    launched,
    delivered,
    errors,
    admit,
    questions,
    move: (units: number) => {
      movement = units;
    },
    respond: (status: string) => {
      childStatus = status;
    },
    change: (input: OptimizationInput) => {
      current = input;
    },
  };
}
it('commits fractional contradiction and its distinct event before releasing both seats without a child', async () => {
  const f = fixture();
  await f.admit();
  await f.coordinator.drain();
  expect(f.errors).toEqual([]);
  expect(f.launched).toHaveLength(0);
  expect(f.source.db.select().from(optimizationBoundaryCertificate).all()).toHaveLength(2);
  expect(f.source.db.select().from(solverSlot).all()).toHaveLength(0);
  expect(
    f.source.db
      .select()
      .from(eventLog)
      .all()
      .map((entry) => (JSON.parse(entry.message) as { type: string }).type),
  ).toEqual([
    'schedule_optimization_boundary_infeasible',
    'schedule_optimization_boundary_infeasible',
  ]);
});
it('retains solver-proven infeasibility through actual child exit and exact terminal storage', async () => {
  const f = fixture(false, true);
  await f.admit();
  await f.coordinator.drain();
  expect(f.errors).toEqual([]);
  expect(f.launched).toHaveLength(2);
  expect(
    readConnectedOptimizationPair(f.source.db, { questions: f.questions() }).variants.pri.kind,
  ).toBe('boundary-infeasible');
  expect(f.source.db.select().from(solverSlot).all()).toHaveLength(0);
});
it('Q1 to Q2 to Q1 admission and Retry read the retained certificate before generation mutation', async () => {
  const f = fixture();
  const q1 = f.questions();
  await f.admit();
  await f.coordinator.drain();
  const previous = stage(true);
  const changed = {
    ...previous,
    starts: new Map([...previous.starts, [sliceKey('c', null), 1.25]]),
    finishes: new Map([...previous.finishes, [sliceKey('c', null), 2.25]]),
  };
  f.change({ kind: 'connected', stage: changed });
  await f.admit();
  await f.coordinator.drain();
  const q2Generation = readGeneration(f.source.db, 'B', q1.pri.contractVersion);
  f.change({ kind: 'connected', stage: stage(true) });
  const before = f.source.db.select().from(eventLog).all();
  await f.admit();
  await f.coordinator.drain();
  expect(readGeneration(f.source.db, 'B', q1.pri.contractVersion)).toEqual(q2Generation);
  expect(f.source.db.select().from(eventLog).all()).toEqual(before);
  expect(
    await f.coordinator.retry({
      projectId: 'B',
      objective: 'pri',
      inputHash: q1.pri.inputHash,
      input: { kind: 'connected', stage: stage(true) },
    }),
  ).toMatchObject({ kind: 'not-retryable', state: 'boundary-infeasible' });
  expect(readGeneration(f.source.db, 'B', q1.pri.contractVersion)).toEqual(q2Generation);
  expect(f.launched).toHaveLength(2);
});

it('restart discards a stale queued connected question before admitting freshly captured boundaries', async () => {
  const f = fixture(false, true);
  const q1 = f.questions();
  const generation = allocateGeneration(
    f.source.db,
    'B',
    q1.pri.contractVersion,
    q1.pri.inputHash,
    1,
  );
  enqueueSolverRequest(f.source.db, {
    projectId: 'B',
    contractVersion: q1.pri.contractVersion,
    generation,
    objective: 'pri',
    budgetMs: installed.budgetMs,
    enqueuedAt: 2,
  });
  f.change({ kind: 'connected', stage: stage(true) });
  f.coordinator.start();
  await f.coordinator.stop();
  expect(f.errors).toEqual([]);
  expect(f.launched).toHaveLength(0);
  expect(f.source.db.select().from(solverQueue).all()).toHaveLength(0);
  expect(f.source.db.select().from(solverSlot).all()).toHaveLength(0);
  expect(f.source.db.select().from(optimizationBoundaryCertificate).all()).toHaveLength(2);
});
it('restart checks retained terminal evidence before launching an enqueued entry', async () => {
  const f = fixture();
  const q1 = f.questions();
  await f.admit();
  await f.coordinator.drain();
  const current = readGeneration(f.source.db, 'B', q1.pri.contractVersion);
  if (current === null) throw new Error('missing generation');
  enqueueSolverRequest(f.source.db, {
    projectId: 'B',
    contractVersion: q1.pri.contractVersion,
    generation: current.generation,
    objective: 'pri',
    budgetMs: installed.budgetMs,
    enqueuedAt: 3,
  });
  const before = f.source.db.select().from(eventLog).all();
  f.coordinator.start();
  await f.coordinator.stop();
  expect(f.errors).toEqual([]);
  expect(f.launched).toHaveLength(0);
  expect(f.source.db.select().from(solverSlot).all()).toHaveLength(0);
  expect(f.source.db.select().from(eventLog).all()).toEqual(before);
});
it('edit-triggered capture consumes the connected union without entering the legacy local builder', async () => {
  const f = fixture();
  f.coordinator.inputChanged('B');
  await f.coordinator.drain();
  expect(f.errors).toEqual([]);
  expect(f.launched).toHaveLength(0);
  expect(f.source.db.select().from(optimizationBoundaryCertificate).all()).toHaveLength(2);
});
it('rolls back terminal evidence and sequence together when the actual event insert fails', async () => {
  const f = fixture();
  const sqlite = openDatabase(f.path);
  sqlite.run(
    "CREATE TRIGGER reject_terminal BEFORE INSERT ON event_log BEGIN SELECT RAISE(ABORT, 'terminal event fault'); END",
  );
  sqlite.close();
  const rejected = await f.admit().then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(rejected).toBeInstanceOf(Error);
  expect(f.source.db.select().from(optimizationBoundaryCertificate).all()).toHaveLength(0);
  expect(f.source.db.select().from(optimizedScheduleCache).all()).toHaveLength(0);
  expect(f.source.db.select().from(eventLog).all()).toHaveLength(0);
  expect(f.source.db.select().from(eventSequencer).all()).toHaveLength(0);
});

it('holds a reserved preflight seat until its terminal transaction finishes', async () => {
  const f = fixture();
  const held = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const record = f.repository.recordOutcome;
  f.repository.recordOutcome = async (write) => {
    entered.resolve(undefined);
    await held.promise;
    return record(write);
  };
  const admission = f.admit();
  await entered.promise;
  expect(f.source.db.select().from(solverSlot).all()).toHaveLength(1);
  expect(f.source.db.select().from(optimizationBoundaryCertificate).all()).toHaveLength(0);
  held.resolve(undefined);
  await admission;
  await f.coordinator.drain();
  expect(f.errors).toEqual([]);
  expect(f.source.db.select().from(solverSlot).all()).toHaveLength(0);
  expect(f.source.db.select().from(optimizationBoundaryCertificate).all()).toHaveLength(2);
});
it('restart replaces an old-budget queued question with the installed exact question', async () => {
  const f = fixture();
  const q1 = f.questions();
  const generation = allocateGeneration(
    f.source.db,
    'B',
    q1.pri.contractVersion,
    q1.pri.inputHash,
    1,
  );
  enqueueSolverRequest(f.source.db, {
    projectId: 'B',
    contractVersion: q1.pri.contractVersion,
    generation,
    objective: 'pri',
    budgetMs: 2000,
    enqueuedAt: 2,
  });
  f.coordinator.start();
  await f.coordinator.stop();
  expect(f.errors).toEqual([]);
  expect(f.launched).toHaveLength(0);
  expect(f.source.db.select().from(solverSlot).all()).toHaveLength(0);
  expect(
    f.source.db
      .select()
      .from(optimizationBoundaryCertificate)
      .all()
      .map((entry) => entry.budgetMs),
  ).toEqual([1000, 1000]);
});

it('retry of a connected diagnostic rebuilds the connected request and terminal evaluator', async () => {
  const f = fixture(false);
  f.respond('unknown');
  await f.admit();
  await f.coordinator.drain();
  expect(
    readConnectedOptimizationPair(f.source.db, { questions: f.questions() }).variants.pri.kind,
  ).toBe('failed');
  f.respond('boundary-infeasible');
  expect(
    await f.coordinator.retry({
      projectId: 'B',
      objective: 'pri',
      inputHash: f.questions().pri.inputHash,
      input: { kind: 'connected', stage: stage(false) },
    }),
  ).toMatchObject({ kind: 'accepted' });
  await f.coordinator.drain();
  expect(f.errors).toEqual([]);
  expect(f.launched).toHaveLength(3);
  expect(
    readConnectedOptimizationPair(f.source.db, { questions: f.questions() }).variants.pri.kind,
  ).toBe('boundary-infeasible');
});
it('rechecks a competitor terminal committed between observation and initial reservation', async () => {
  const f = fixture();
  const reserve = f.repository.reserveSlot;
  let compete = true;
  const decisions: string[] = [];
  f.repository.reserveSlot = async (request) => {
    if (compete) {
      compete = false;
      await f.admit();
    }
    const committed = await reserve(request);
    decisions.push(committed.decision.kind);
    return committed;
  };
  await f.admit();
  await f.coordinator.drain();
  expect(decisions).toEqual(['reserved', 'reserved', 'closed', 'closed']);
  expect(f.errors).toEqual([]);
  expect(f.launched).toHaveLength(0);
  expect(f.source.db.select().from(optimizationBoundaryCertificate).all()).toHaveLength(2);
  expect(f.source.db.select().from(eventLog).all()).toHaveLength(2);
  expect(f.source.db.select().from(solverSlot).all()).toHaveLength(0);
});
it('refuses admission when enablement was revoked after detached capture', async () => {
  const f = fixture();
  const sqlite = openDatabase(f.path);
  sqlite.run("UPDATE project SET optimization_enabled=0 WHERE id='B'");
  sqlite.close();
  await f.admit();
  await f.coordinator.drain();
  expect(f.source.db.select().from(optimizationGeneration).all()).toHaveLength(0);
  expect(f.source.db.select().from(optimizationBoundaryCertificate).all()).toHaveLength(0);
});
it('requires the installed connected digest and matching installed contract', async () => {
  const absent = fixture(true, false, { hashConnectedBytes: undefined });
  const digestFailure = await absent.admit().then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(digestFailure).toMatchObject({ message: 'connected optimizer lacks installed digest' });
  const different = fixture(true, false, { contractVersion: 'other' });
  const contractFailure = await different.admit().then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(contractFailure).toMatchObject({
    message: 'connected optimizer contract differs from installed runtime',
  });
});
it('restart launches an explicitly queued connected Retry after its older diagnostic', async () => {
  const f = fixture(false);
  f.respond('unknown');
  await f.admit();
  await f.coordinator.drain();
  const question = f.questions().pri;
  const current = readGeneration(f.source.db, 'B', question.contractVersion);
  if (current === null) throw new Error('missing connected generation');
  enqueueSolverRequest(f.source.db, {
    projectId: 'B',
    contractVersion: question.contractVersion,
    generation: current.generation,
    objective: 'pri',
    budgetMs: installed.budgetMs,
    enqueuedAt: 11,
  });
  f.respond('boundary-infeasible');
  f.coordinator.start();
  await f.coordinator.stop();
  expect(f.errors).toEqual([]);
  expect(f.launched).toHaveLength(3);
  expect(
    readConnectedOptimizationPair(f.source.db, { questions: f.questions() }).variants.pri.kind,
  ).toBe('boundary-infeasible');
});

it('refuses a connected Retry whose target differs from the captured project', async () => {
  const f = fixture();
  const rejected = await f.coordinator
    .retry({
      projectId: 'other',
      objective: 'pri',
      inputHash: f.questions().pri.inputHash,
      input: { kind: 'connected', stage: stage(true) },
    })
    .then(
      () => null,
      (failure: unknown) => failure,
    );
  expect(rejected).toMatchObject({ message: 'connected Retry target differs' });
  expect(f.source.db.select().from(optimizationGeneration).all()).toHaveLength(0);
});

function scopedFixture() {
  const f = fixture(false);
  const sqlite = openDatabase(f.path);
  sqlite.run("INSERT INTO organization(id,name,created_at) VALUES('org','Org',1)");
  for (const projectId of ['A', 'C'])
    sqlite.run("INSERT INTO project(id,name,owner_id,created_at) VALUES(?,?,'u',1)", [
      projectId,
      projectId,
    ]);
  for (const projectId of ['A', 'B', 'C']) {
    sqlite.run("INSERT INTO project_organization(resource_id,organization_id) VALUES(?,'org')", [
      projectId,
    ]);
    sqlite.run('INSERT INTO work_item(id,project_id,name,position) VALUES(?,?,?,1)', [
      projectId.toLowerCase(),
      projectId,
      projectId,
    ]);
  }
  sqlite.run("UPDATE organization_activation SET state='activated',activated_at=1");
  sqlite.close();
  seedDependencyAuthority(f.path);
  const authored = openDatabase(f.path);
  authored.run(
    "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES('ab','org','A','B','a','b','whole','whole','FS'),('bc','org','B','C','b','c','whole','whole','FS')",
  );
  authored.close();
  const previous = stage(false);
  const captured = {
    ...previous,
    starts: new Map([...previous.starts, [sliceKey('b', null), 2], [sliceKey('c', null), 3]]),
    finishes: new Map([...previous.finishes, [sliceKey('b', null), 3], [sliceKey('c', null), 4]]),
  };
  f.change({ kind: 'connected', stage: captured });
  f.move(48);
  const question = f.questions().pri;
  // Isolate outcome publication from the independent first-generation observation fan-out.
  allocateGeneration(f.source.db, 'B', question.contractVersion, question.inputHash, 1);
  return { ...f, captured };
}
function storedSnapshot(f: ReturnType<typeof scopedFixture>) {
  return {
    generations: f.source.db.select().from(optimizationGeneration).all(),
    cache: f.source.db.select().from(optimizedScheduleCache).all(),
    events: f.source.db.select().from(eventLog).all(),
    sequences: f.source.db.select().from(eventSequencer).all(),
    certificates: f.source.db.select().from(optimizationBoundaryCertificate).all(),
  };
}
function changedQuestion(f: ReturnType<typeof scopedFixture>) {
  const captured = {
    ...f.captured,
    starts: new Map([...f.captured.starts, [sliceKey('c', null), 4]]),
    finishes: new Map([...f.captured.finishes, [sliceKey('c', null), 5]]),
  };
  const questions = {
    pri: captureConnectedQuestion(captured, 'pri', installed),
    time: captureConnectedQuestion(captured, 'time', installed),
  };
  return {
    projectId: 'B',
    inputHash: questions.pri.inputHash,
    contractVersion: questions.pri.contractVersion,
    budgetMs: installed.budgetMs,
    questions,
  };
}
function rejectConnectedRecipient(f: ReturnType<typeof scopedFixture>) {
  const sqlite = openDatabase(f.path);
  sqlite.run(
    "CREATE TRIGGER reject_connected_recipient BEFORE INSERT ON event_log WHEN NEW.subscription='project:C' AND json_extract(NEW.message,'$.type')='elsewhere_changed' BEGIN SELECT RAISE(ABORT,'connected recipient fault'); END",
  );
  sqlite.close();
}
it('scoped connected selected publication records and delivers foreign component invalidation', async () => {
  const f = scopedFixture();
  await f.admit();
  await f.coordinator.drain();
  expect(f.errors).toEqual([]);
  const selected = readConnectedOptimizationPair(f.source.db, { questions: f.questions() }).variants
    .pri;
  if (selected.kind !== 'ok') throw new Error('expected durable connected success');
  expect(selected.outcome.decision.chosen).toBe('optimized');
  expect(selected.outcome.decision.schedule.slices.get(sliceKey('b', null))?.earliestStart).toBe(1);
  const events = f.source.db
    .select()
    .from(eventLog)
    .all()
    .map((entry) => ({
      subscription: entry.subscription,
      message: JSON.parse(entry.message) as { type: string; causeProjectId?: string },
    }));
  expect(
    events.filter(
      ({ subscription, message }) =>
        subscription === 'project:C' &&
        message.type === 'elsewhere_changed' &&
        message.causeProjectId === 'B',
    ),
  ).toHaveLength(2);
  expect(
    f.delivered.some(
      ({ projectId, event }) =>
        projectId === 'C' && event.type === 'elsewhere_changed' && event.causeProjectId === 'B',
    ),
  ).toBe(true);
});
it('scoped connected generation eviction invalidates foreign component members', async () => {
  const f = scopedFixture();
  await f.admit();
  await f.coordinator.drain();
  const before = f.source.db.select().from(eventLog).all().length;
  const committed = await f.repository.observeForAdmission(changedQuestion(f), 20);
  expect(
    committed.envelopes.some(
      ({ projectId, event }) =>
        projectId === 'C' && event.type === 'elsewhere_changed' && event.causeProjectId === 'B',
    ),
  ).toBe(true);
  expect(f.source.db.select().from(optimizedScheduleCache).all()).toHaveLength(0);
  expect(
    f.source.db
      .select()
      .from(eventLog)
      .all()
      .slice(before)
      .filter((entry) => entry.subscription === 'project:C'),
  ).toHaveLength(1);
});
it('scoped connected recipient insert fault rolls back selected outcome and both event sequences', async () => {
  const f = scopedFixture();
  const before = storedSnapshot(f);
  rejectConnectedRecipient(f);
  await f.admit();
  await f.coordinator.drain();
  expect(f.errors).toHaveLength(2);
  expect(storedSnapshot(f)).toEqual(before);
});
it('scoped connected recipient insert fault rolls back generation eviction and recipient events', async () => {
  const f = scopedFixture();
  await f.admit();
  await f.coordinator.drain();
  const before = storedSnapshot(f);
  rejectConnectedRecipient(f);
  const rejected = await f.repository.observeForAdmission(changedQuestion(f), 20).then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(rejected).toBeInstanceOf(Error);
  expect(storedSnapshot(f)).toEqual(before);
});
