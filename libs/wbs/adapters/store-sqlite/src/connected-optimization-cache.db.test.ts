import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildConnectedSolverRequest } from '@wbs/contracts/solver/build-connected-request';
import {
  encodeBoundaryCertificate,
  encodeConnectedSuccess,
} from '@wbs/contracts/solver/connected-durable';
import { sliceKey } from '@wbs/domain';
import { afterEach, beforeEach, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';

import { connectedCapturedOptimizationReaderOf } from './connected-captured-optimization-reader';
import { response, stage } from './connected-optimization.fixture';
import {
  readConnectedOptimizationPair,
  storeConnectedOptimizationOutcomeIn,
} from './connected-optimization-cache';
import { captureConnectedQuestion, hashConnectedBytes } from './connected-question-identity';
import { openConnection, openDatabase, openDrizzle } from './db';
import { runMigrations } from './migrate';
import { allocateGeneration } from './optimization-generation';
import { readOptimizedPair } from './optimized-schedule-cache';
import { optimizationBoundaryCertificate, optimizedScheduleCache, solverSlot } from './schema';
const installed = { solverVersion: '0.4.0', budgetMs: 1000 };
const folder = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let directory: string;
let path: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'connected-cache-'));
  path = join(directory, 'store.db');
  runMigrations(path, folder);
  const sqlite = openDatabase(path);
  sqlite.run("INSERT INTO users(id,username,password_hash,created_at) VALUES('u','u','x',1)");
  sqlite.run(
    "INSERT INTO project(id,name,owner_id,created_at,optimization_enabled) VALUES('B','B','u',1,1)",
  );
  sqlite.close();
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});
function fixture(fractional = false) {
  const captured = stage(fractional);
  const questions = {
    pri: captureConnectedQuestion(captured, 'pri', installed),
    time: captureConnectedQuestion(captured, 'time', installed),
  };
  const { stageBytes, ...identity } = questions.time;
  expect(stageBytes).toBeTruthy();
  const prepared = buildConnectedSolverRequest(captured, identity, installed, 'time');
  if (prepared.kind === 'failed') throw Error(prepared.failure);
  const outcome =
    prepared.kind === 'boundary-infeasible'
      ? {
          kind: 'boundary-infeasible' as const,
          certificate: encodeBoundaryCertificate(
            captured,
            identity,
            prepared.request,
            prepared.evidence,
            hashConnectedBytes,
          ),
        }
      : {
          kind: 'ok' as const,
          success: encodeConnectedSuccess(
            captured,
            identity,
            prepared.request,
            response(prepared.request).stdout,
            hashConnectedBytes,
          ),
        };
  return { questions, outcome };
}
function write(fractional = false) {
  const captured = fixture(fractional);
  const question = captured.questions.time;
  const connection = openConnection(path);
  const db = connection.db;
  const generation = allocateGeneration(db, 'B', question.contractVersion, question.inputHash, 1);
  const claim = {
    projectId: 'B',
    contractVersion: question.contractVersion,
    generation,
    objective: 'time' as const,
    budgetMs: 1000,
    ownerId: 'owner',
    attemptToken: 'attempt',
  };
  db.insert(solverSlot)
    .values({
      ...claim,
      lifecycle: 'starting',
      startedAt: 10,
      heartbeatAt: 10,
      admittedDeadlineAt: 2000,
    })
    .run();
  return {
    db,
    close: connection.close,
    ...captured,
    write: { claim, admittedCancelEpoch: 0, question, outcome: captured.outcome, now: 11 },
  };
}
it('strict connected success reads separately from local envelope v1', () => {
  const attempt = write();
  expect(
    attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write)),
  ).toBe('stored');
  expect(
    readConnectedOptimizationPair(attempt.db, { questions: attempt.questions }).variants.time.kind,
  ).toBe('ok');
  expect(
    readConnectedOptimizationPair(attempt.db, { questions: attempt.questions }).variants.pri.kind,
  ).toBe('miss');
  expect(readOptimizedPair(attempt.db, attempt.questions.time).time.kind).toBe('corrupt');
});
it('retains the fractional boundary certificate across generation turnover and reopen', () => {
  const attempt = write(true);
  expect(attempt.outcome.kind).toBe('boundary-infeasible');
  expect(
    attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write)),
  ).toBe('stored');
  allocateGeneration(attempt.db, 'B', attempt.questions.time.contractVersion, 'changed', 20);
  attempt.close();
  const reopened = openDrizzle(path);
  expect(
    readConnectedOptimizationPair(reopened, { questions: attempt.questions }).variants.time.kind,
  ).toBe('boundary-infeasible');
  expect(reopened.select().from(optimizationBoundaryCertificate).all()).toHaveLength(1);
});
it('fences changed input hash without generation change and writes neither table', () => {
  const attempt = write(true);
  const sqlite = openDatabase(path);
  sqlite.run("UPDATE optimization_generation SET input_hash='changed'");
  sqlite.close();
  expect(
    attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write)),
  ).toBe('superseded');
  expect(attempt.db.select().from(optimizationBoundaryCertificate).all()).toHaveLength(0);
  expect(attempt.db.select().from(optimizedScheduleCache).all()).toHaveLength(0);
});

it('captured adapter projects validated durable success without runtime writes', () => {
  const attempt = write();
  attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write));
  const before = attempt.db.select().from(solverSlot).all();
  const reader = connectedCapturedOptimizationReaderOf(attempt.db, { ...installed, now: () => 12 });
  const observed = reader.readConnectedCaptured({
    stage: stage(),
    enabled: true,
    objective: 'time',
  });
  expect(observed.variants.time.state).toBe('ready');
  expect(observed.candidates.time?.starts.size).toBe(1);
  expect(attempt.db.select().from(solverSlot).all()).toEqual(before);
});
for (const [name, sql] of [
  ['generation', 'UPDATE optimization_generation SET generation=2'],
  ['epoch', 'UPDATE optimization_generation SET cancel_epoch=1'],
  ['owner', "UPDATE solver_slot SET owner_id='other'"],
  ['token', "UPDATE solver_slot SET attempt_token='other'"],
  ['disabled', 'UPDATE project SET optimization_enabled=0'],
] as const)
  it(`refuses stale ${name} without either physical write`, () => {
    const attempt = write(true);
    const sqlite = openDatabase(path);
    sqlite.run(sql);
    sqlite.close();
    expect(
      attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write)),
    ).toBe('superseded');
    expect(attempt.db.select().from(optimizationBoundaryCertificate).all()).toHaveLength(0);
    expect(attempt.db.select().from(optimizedScheduleCache).all()).toHaveLength(0);
  });
it('refuses timestamps before admission and claims for another objective budget or contract', () => {
  const attempt = write(true);
  for (const claim of [
    { ...attempt.write.claim, objective: 'pri' as const },
    { ...attempt.write.claim, budgetMs: 2 },
    { ...attempt.write.claim, contractVersion: 'other' },
  ]) {
    expect(() =>
      attempt.db.transaction((tx) =>
        storeConnectedOptimizationOutcomeIn(tx, { ...attempt.write, claim }),
      ),
    ).toThrow('claim differs');
  }
  expect(() =>
    attempt.db.transaction((tx) =>
      storeConnectedOptimizationOutcomeIn(tx, { ...attempt.write, now: 9 }),
    ),
  ).toThrow('predates');
  expect(attempt.db.select().from(optimizationBoundaryCertificate).all()).toHaveLength(0);
});
it('reads retained evidence without any generation and changed questions miss', () => {
  const attempt = write(true);
  attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write));
  const sqlite = openDatabase(path);
  sqlite.run('DELETE FROM optimization_generation');
  sqlite.close();
  const original = readConnectedOptimizationPair(attempt.db, { questions: attempt.questions });
  expect(original.generation).toBeNull();
  expect(original.variants.time.kind).toBe('boundary-infeasible');
  const originalStage = stage(true);
  const changed = {
    ...originalStage,
    starts: new Map(originalStage.starts).set(sliceKey('c', null), 1.25),
    finishes: new Map(originalStage.finishes).set(sliceKey('c', null), 2.25),
  };
  const questions = {
    pri: captureConnectedQuestion(changed, 'pri', installed),
    time: captureConnectedQuestion(changed, 'time', installed),
  };
  expect(readConnectedOptimizationPair(attempt.db, { questions }).variants.time.kind).toBe('miss');
  expect(
    readConnectedOptimizationPair(attempt.db, { questions: attempt.questions }).variants.time.kind,
  ).toBe('boundary-infeasible');
});
it('duplicate certificates are idempotent and malformed retained bytes throw', () => {
  const attempt = write(true);
  expect(
    attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write)),
  ).toBe('stored');
  expect(
    attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write)),
  ).toBe('already-recorded');
  expect(attempt.db.select().from(optimizationBoundaryCertificate).all()).toHaveLength(1);
  const sqlite = openDatabase(path);
  sqlite.run("UPDATE optimization_boundary_certificate SET certificate_json='{' ");
  sqlite.close();
  expect(() =>
    readConnectedOptimizationPair(attempt.db, { questions: attempt.questions }),
  ).toThrow();
  expect(() =>
    attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write)),
  ).toThrow();
});
it('atomically replaces an older diagnostic and rolls both mutations back on failed insertion', () => {
  const attempt = write(true);
  const question = attempt.questions.time;
  attempt.db
    .insert(optimizedScheduleCache)
    .values({
      ...question,
      generation: 1,
      status: 'failed',
      failureReason: 'timeout',
      createdAt: 1,
    })
    .run();
  const sqlite = openDatabase(path);
  sqlite.run(
    "CREATE TRIGGER fail_certificate BEFORE INSERT ON optimization_boundary_certificate BEGIN SELECT RAISE(ABORT,'injected insertion failure'); END",
  );
  sqlite.close();
  expect(() =>
    attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write)),
  ).toThrow();
  expect(attempt.db.select().from(optimizedScheduleCache).all()).toHaveLength(1);
  expect(attempt.db.select().from(optimizationBoundaryCertificate).all()).toHaveLength(0);
  const restored = openDatabase(path);
  restored.run('DROP TRIGGER fail_certificate');
  restored.close();
  expect(
    attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write)),
  ).toBe('stored');
  expect(attempt.db.select().from(optimizedScheduleCache).all()).toHaveLength(0);
  expect(attempt.db.select().from(optimizationBoundaryCertificate).all()).toHaveLength(1);
});
it('refuses ready or ordinary infeasible conflicts and cannot mask a retained certificate', () => {
  const attempt = write(true);
  const question = attempt.questions.time;
  attempt.db
    .insert(optimizedScheduleCache)
    .values({
      ...question,
      generation: 1,
      status: 'plan-infeasible',
      resultJson: JSON.stringify({
        dtoVersion: 1,
        items: [{ ownerWorkItemId: 'b', boundWorkItemId: 'b', effectiveDeadlineOffset: 0 }],
      }),
      createdAt: 1,
    })
    .run();
  expect(() =>
    attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write)),
  ).toThrow('conflicts');
  attempt.db.delete(optimizedScheduleCache).where(eq(optimizedScheduleCache.projectId, 'B')).run();
  attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write));
  attempt.db
    .insert(optimizedScheduleCache)
    .values({
      ...question,
      generation: 1,
      status: 'failed',
      failureReason: 'timeout',
      createdAt: 1,
    })
    .run();
  expect(() => readConnectedOptimizationPair(attempt.db, { questions: attempt.questions })).toThrow(
    'conflicting',
  );
});
for (const field of ['projectId', 'inputHash', 'objective', 'contractVersion', 'budgetMs'] as const)
  it(`rejects retained row with mismatched ${field}`, () => {
    const attempt = write(true);
    if (attempt.outcome.kind !== 'boundary-infeasible') throw Error('fixture');
    const question = attempt.questions.time;
    const changed = {
      ...attempt.outcome.certificate,
      identity: {
        ...attempt.outcome.certificate.identity,
        [field]: field === 'budgetMs' ? 2000 : 'forged',
      },
    };
    attempt.db
      .insert(optimizationBoundaryCertificate)
      .values({
        ...question,
        certificateJson: JSON.stringify(changed),
        generation: 1,
        attemptToken: 'old',
        createdAt: 1,
      })
      .run();
    expect(() =>
      readConnectedOptimizationPair(attempt.db, { questions: attempt.questions }),
    ).toThrow();
  });
for (const field of ['projectId', 'inputHash', 'contractVersion', 'budgetMs'] as const)
  for (const physical of ['certificate', 'cache'] as const)
    it(`isolates ${physical} lookup by ${field}`, () => {
      const attempt = write(true);
      const question = attempt.questions.time;
      const sqlite = openDatabase(path);
      sqlite.run("INSERT INTO project(id,name,owner_id,created_at) VALUES('other','Other','u',1)");
      sqlite.close();
      const changed = { ...question, [field]: field === 'budgetMs' ? 2000 : 'other' };
      if (physical === 'certificate')
        attempt.db
          .insert(optimizationBoundaryCertificate)
          .values({
            ...changed,
            certificateJson: 'malformed off-key bytes',
            generation: 1,
            attemptToken: 'older',
            createdAt: 1,
          })
          .run();
      else
        attempt.db
          .insert(optimizedScheduleCache)
          .values({
            ...changed,
            status: 'failed',
            failureReason: 'timeout',
            generation: 1,
            createdAt: 1,
          })
          .run();
      expect(
        readConnectedOptimizationPair(attempt.db, { questions: attempt.questions }).variants.time
          .kind,
      ).toBe('miss');
    });
it('live budget pruning cannot evict a retained terminal', () => {
  const attempt = write(true);
  attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write));
  for (const budgetMs of [2000, 3000, 4000]) {
    const options = { ...installed, budgetMs };
    const question = captureConnectedQuestion(stage(true), 'time', options);
    const claim = { ...attempt.write.claim, budgetMs, attemptToken: `budget-${String(budgetMs)}` };
    attempt.db
      .insert(solverSlot)
      .values({
        ...claim,
        lifecycle: 'starting',
        startedAt: 10,
        heartbeatAt: 10,
        admittedDeadlineAt: 5000,
      })
      .run();
    expect(
      attempt.db.transaction((tx) =>
        storeConnectedOptimizationOutcomeIn(tx, {
          ...attempt.write,
          claim,
          question,
          outcome: { kind: 'failed', reason: 'timeout' },
          now: budgetMs,
        }),
      ),
    ).toBe('stored');
  }
  expect(attempt.db.select().from(optimizedScheduleCache).all()).toHaveLength(2);
  expect(
    readConnectedOptimizationPair(attempt.db, { questions: attempt.questions }).variants.time.kind,
  ).toBe('boundary-infeasible');
});
for (const mode of ['isolated', 'shared'] as const)
  it(`reads all ${mode} stage selections from the supplied snapshot`, () => {
    const attempt = write();
    const captured = { ...stage(), mode };
    const questions = {
      pri: captureConnectedQuestion(captured, 'pri', installed),
      time: captureConnectedQuestion(captured, 'time', installed),
    };
    attempt.db.delete(solverSlot).where(eq(solverSlot.projectId, 'B')).run();
    const connection = openDatabase(path);
    connection.run('BEGIN');
    // Establish the WAL snapshot before another connection publishes.
    expect(
      connection.query('SELECT count(*) AS count FROM optimized_schedule_cache').get(),
    ).toEqual({ count: 0 });
    const borrowed = drizzle({ client: connection });
    const reader = connectedCapturedOptimizationReaderOf(borrowed, { ...installed, now: () => 12 });
    expect(
      reader.readConnectedCaptured({ stage: captured, enabled: true, objective: 'time' }).variants
        .time.state,
    ).toBe('idle');
    const prepared = buildConnectedSolverRequest(captured, questions.time, installed, 'time');
    if (prepared.kind !== 'request') throw Error('fixture');
    const { stageBytes, ...identity } = questions.time;
    expect(stageBytes).toBeTruthy();
    const success = encodeConnectedSuccess(
      captured,
      identity,
      prepared.request,
      response(prepared.request).stdout,
      hashConnectedBytes,
    );
    // Publication bypasses writer admission only in this snapshot visibility fixture.
    attempt.db
      .insert(optimizedScheduleCache)
      .values({
        ...questions.time,
        generation: 1,
        status: 'ok',
        resultJson: JSON.stringify(success),
        createdAt: 12,
      })
      .run();
    expect(
      reader.readConnectedCaptured({ stage: captured, enabled: true, objective: 'time' }).variants
        .time.state,
    ).toBe('idle');
    connection.run('COMMIT');
    expect(
      reader.readConnectedCaptured({ stage: captured, enabled: true, objective: 'time' }).variants
        .time.state,
    ).toBe('ready');
    connection.close();
  });
for (const dimension of [
  'projectId',
  'inputHash',
  'objective',
  'contractVersion',
  'budgetMs',
] as const)
  it(`compares decoded ${dimension} against the requested question`, () => {
    const attempt = write(true);
    const captured = {
      ...stage(true),
      ...(dimension === 'projectId' ? { projectId: 'A' } : {}),
      ...(dimension === 'inputHash' ? { mode: 'shared' as const } : {}),
    };
    const options = { ...installed, ...(dimension === 'budgetMs' ? { budgetMs: 2000 } : {}) };
    const objective = dimension === 'objective' ? 'pri' : 'time';
    const { stageBytes, ...identity } = captureConnectedQuestion(captured, objective, options);
    expect(stageBytes).toBeTruthy();
    const prepared = buildConnectedSolverRequest(captured, identity, options, objective);
    if (prepared.kind !== 'boundary-infeasible')
      throw Error(`fixture ${dimension} is not contradictory`);
    const certificate = encodeBoundaryCertificate(
      captured,
      identity,
      prepared.request,
      prepared.evidence,
      hashConnectedBytes,
    );
    const questions =
      dimension === 'contractVersion'
        ? {
            pri: captureConnectedQuestion(stage(true), 'pri', {
              ...installed,
              solverVersion: '0.4.1',
            }),
            time: captureConnectedQuestion(stage(true), 'time', {
              ...installed,
              solverVersion: '0.4.1',
            }),
          }
        : attempt.questions;
    attempt.db
      .insert(optimizationBoundaryCertificate)
      .values({
        ...questions.time,
        certificateJson: JSON.stringify(certificate),
        generation: 1,
        attemptToken: 'older',
        createdAt: 1,
      })
      .run();
    expect(() => readConnectedOptimizationPair(attempt.db, { questions })).toThrow(
      'identity differs',
    );
  });
it('malformed request identity cannot become a cache miss', () => {
  const attempt = fixture(true);
  const db = openDrizzle(path);
  for (const patch of [
    { quantum: 24 },
    { wireVersion: 4 },
    { questionHash: 'forged' },
    { stageBytes: 'truncated' },
  ]) {
    const questions = {
      pri: { ...attempt.questions.pri, ...patch },
      time: { ...attempt.questions.time, ...patch },
    };
    expect(() => readConnectedOptimizationPair(db, { questions })).toThrow();
  }
});
it('duplicate delivery compares validated evidence independently of JSON key order', () => {
  const attempt = write(true);
  attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write));
  if (attempt.outcome.kind !== 'boundary-infeasible') throw Error('fixture');
  const certificate = attempt.outcome.certificate;
  const reordered = {
    ...certificate,
    identity: { ...certificate.identity },
    evidence: { ...certificate.evidence },
  };
  const sqlite = openDatabase(path);
  sqlite.run('UPDATE optimization_boundary_certificate SET certificate_json=?', [
    JSON.stringify(Object.fromEntries(Object.entries(reordered).reverse())),
  ]);
  sqlite.close();
  expect(
    attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write)),
  ).toBe('already-recorded');
});
it('different current input hash cannot make another captured stage pending', () => {
  const attempt = write();
  const captured = { ...stage(), mode: 'shared' as const };
  const reader = connectedCapturedOptimizationReaderOf(attempt.db, { ...installed, now: () => 12 });
  expect(
    reader.readConnectedCaptured({ stage: captured, enabled: true, objective: 'time' }).variants
      .time.state,
  ).toBe('idle');
});
