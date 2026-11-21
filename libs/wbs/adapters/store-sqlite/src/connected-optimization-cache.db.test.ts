import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildConnectedSolverRequest } from '@wbs/contracts/solver/build-connected-request';
import {
  encodeBoundaryCertificate,
  encodeConnectedSuccess,
} from '@wbs/contracts/solver/connected-durable';
import { encodeOptimizedResult } from '@wbs/contracts/solver/optimized-result';
import { contractVersionOf, schedule, sliceKey } from '@wbs/domain';
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
import { allocateGeneration } from './optimization-generation';
import { readOptimizedPair } from './optimized-schedule-cache';
import { optimizationBoundaryCertificate, optimizedScheduleCache, solverSlot } from './schema';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
const installed = { solverVersion: '0.4.0', budgetMs: 1000 };
let directory: string;
let path: string;
let custody = { hasUnknownOwner: false };
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'connected-cache-'));
  path = join(directory, 'store.db');
  custody = { hasUnknownOwner: false };
  migrateEmptyCatalogueFixture({ path, directory, reportedAt: 1 }, custody);
  let sqlite: ReturnType<typeof openDatabase>;
  try {
    sqlite = openDatabase(path);
  } catch (cause: unknown) {
    custody.hasUnknownOwner = true;
    throw cause;
  }
  let primary: { cause: unknown } | undefined;
  try {
    sqlite.run("INSERT INTO users(id,username,password_hash,created_at) VALUES('u','u','x',1)");
    sqlite.run("INSERT INTO organization(id,name,created_at) VALUES('org','Cache organization',1)");
    sqlite.run(
      "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('captured-parent','org','Cache project',1,'u')",
    );
    // Minimal cache-FK ownership only; this row supplies no admitted Source birth evidence.
    sqlite.run(
      "INSERT INTO work_package(id,name,project_id,created_by,created_at,optimization_enabled) VALUES('B','B','captured-parent','u',1,1)",
    );
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    sqlite.close();
  } catch (cleanup: unknown) {
    custody.hasUnknownOwner = true;
    if (primary !== undefined)
      throw new AggregateError([primary.cause, cleanup], 'cache fixture setup and close failed', {
        cause: cleanup,
      });
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
});
afterEach(() => {
  if (custody.hasUnknownOwner)
    throw new Error('cache fixture ownership is unknown; retain ' + directory);
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
    workPackageId: 'B',
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

it('captured adapter work packages validated durable success without runtime writes', () => {
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
  ['disabled', 'UPDATE work_package SET optimization_enabled=0'],
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
  attempt.db
    .delete(optimizedScheduleCache)
    .where(eq(optimizedScheduleCache.workPackageId, 'B'))
    .run();
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
for (const field of [
  'workPackageId',
  'inputHash',
  'objective',
  'contractVersion',
  'budgetMs',
] as const)
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
for (const field of ['workPackageId', 'inputHash', 'contractVersion', 'budgetMs'] as const)
  for (const physical of ['certificate', 'cache'] as const)
    it(`isolates ${physical} lookup by ${field}`, () => {
      const attempt = write(true);
      const question = attempt.questions.time;
      const sqlite = openDatabase(path);
      sqlite.run(
        "INSERT INTO work_package(id,name,project_id,created_by,created_at) VALUES('other','Other','captured-parent','u',1)",
      );
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
    attempt.db.delete(solverSlot).where(eq(solverSlot.workPackageId, 'B')).run();
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
  'workPackageId',
  'inputHash',
  'objective',
  'contractVersion',
  'budgetMs',
] as const)
  it(`compares decoded ${dimension} against the requested question`, () => {
    const attempt = write(true);
    const captured = {
      ...stage(true),
      ...(dimension === 'workPackageId' ? { workPackageId: 'A' } : {}),
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

const damagedCacheRows = [
  { label: 'missing ok payload', status: 'ok', payload: null },
  { label: 'missing ordinary infeasible payload', status: 'plan-infeasible', payload: null },
  { label: 'missing failed reason', status: 'failed', payload: null },
  { label: 'truncated ok payload', status: 'ok', payload: '{' },
  { label: 'truncated ordinary infeasible payload', status: 'plan-infeasible', payload: '{' },
] as const;
for (const fault of damagedCacheRows) {
  function injectCacheFault(question: ReturnType<typeof captureConnectedQuestion>): void {
    const sqlite = openDatabase(path);
    try {
      // The production CHECK normally prevents this row; fault injection exercises damaged-state recovery.
      sqlite.run('PRAGMA ignore_check_constraints=ON');
      sqlite.run(
        'INSERT INTO optimized_schedule_cache(work_package_id,input_hash,objective,contract_version,budget_ms,generation,status,result_json,failure_reason,created_at) VALUES(?,?,?,?,?,1,?,?,NULL,1)',
        [
          question.workPackageId,
          question.inputHash,
          question.objective,
          question.contractVersion,
          question.budgetMs,
          fault.status,
          fault.payload,
        ],
      );
    } finally {
      sqlite.close();
    }
  }
  it(`models ${fault.label} as corruption through repository and captured reads`, () => {
    const attempt = write();
    injectCacheFault(attempt.questions.time);
    const before = attempt.db.select().from(optimizedScheduleCache).all();
    const observed = readConnectedOptimizationPair(attempt.db, { questions: attempt.questions });
    expect(observed.variants.time.kind).toBe('corrupt');
    const expired = connectedCapturedOptimizationReaderOf(attempt.db, {
      ...installed,
      now: () => 3000,
    });
    expect(
      expired.readConnectedCaptured({ stage: stage(), enabled: true, objective: 'time' }).variants
        .time.state,
    ).toBe('corrupt');
    const live = connectedCapturedOptimizationReaderOf(attempt.db, { ...installed, now: () => 12 });
    expect(
      live.readConnectedCaptured({ stage: stage(), enabled: true, objective: 'time' }).variants.time
        .state,
    ).toBe('retrying');
    expect(attempt.db.select().from(optimizedScheduleCache).all()).toEqual(before);
  });
  it(`replaces an older ${fault.label} with exact admitted terminal evidence`, () => {
    const attempt = write(true);
    injectCacheFault(attempt.questions.time);
    expect(
      attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write)),
    ).toBe('stored');
    expect(attempt.db.select().from(optimizedScheduleCache).all()).toHaveLength(0);
    const retained = attempt.db.select().from(optimizationBoundaryCertificate).all();
    expect(retained).toHaveLength(1);
    if (attempt.outcome.kind !== 'boundary-infeasible') throw Error('fixture');
    expect(JSON.parse(retained[0].certificateJson)).toEqual(attempt.outcome.certificate);
    expect(
      readConnectedOptimizationPair(attempt.db, { questions: attempt.questions }).variants.time
        .kind,
    ).toBe('boundary-infeasible');
  });
}

for (const previous of ['18', '19']) {
  it(`current20 local cache excludes equal-hash contract${previous} before payload decoding with a live generation`, () => {
    const connection = openConnection(path);
    try {
      const contractVersion = contractVersionOf(installed.solverVersion);
      expect(contractVersion).toBe('20+0.4.0');
      const key = {
        workPackageId: 'B',
        inputHash: 'unchanged-input',
        contractVersion,
        budgetMs: 1000,
      };
      const generation = allocateGeneration(connection.db, 'B', contractVersion, key.inputHash, 1);
      const plan = schedule(
        [{ id: 'a', parentId: null, position: 1, frozenNumber: null, priority: null }],
        [],
        [{ workItemId: 'a', stepId: null, days: 1, personId: null, width: 1, poolIds: [] }],
        new Map(),
        new Map(),
      );
      const payload = encodeOptimizedResult({
        publication: 'solver',
        schedule: plan,
        objectiveValues: {
          makespan: { value: 48, stageValue: 48, bound: 48, status: 'optimal' },
          priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
          movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
        },
      });
      connection.db
        .insert(optimizedScheduleCache)
        .values({
          ...key,
          generation,
          objective: 'time',
          status: 'ok',
          resultJson: JSON.stringify(payload),
          failureReason: null,
          createdAt: 2,
        })
        .run();
      expect(readOptimizedPair(connection.db, key).time.kind).toBe('ok');
      connection.db
        .update(optimizedScheduleCache)
        .set({
          contractVersion: `${previous}+0.4.0`,
          resultJson: 'unreadable old result',
        })
        .where(eq(optimizedScheduleCache.workPackageId, 'B'))
        .run();
      const retained = connection.db.select().from(optimizedScheduleCache).all();
      expect(retained).toHaveLength(1);
      expect(retained[0]?.generation).toBe(generation);
      expect(readOptimizedPair(connection.db, key).time.kind).toBe('miss');
      expect(connection.db.select().from(optimizedScheduleCache).all()).toEqual(retained);
      connection.db
        .update(optimizedScheduleCache)
        .set({
          contractVersion,
          resultJson: JSON.stringify({
            ...payload,
            schedule: { ...payload.schedule, dtoVersion: 4 },
          }),
        })
        .where(eq(optimizedScheduleCache.workPackageId, 'B'))
        .run();
      const corrupt = readOptimizedPair(connection.db, key).time;
      expect(corrupt.kind).toBe('corrupt');
      if (corrupt.kind !== 'corrupt') throw Error('fixture must reach current-contract corruption');
      expect(corrupt.reason).toContain('unknown dtoVersion 4; this release reads 5');
    } finally {
      connection.close();
    }
  });
}

for (const fractional of [false, true]) {
  const family = fractional ? 'certificate' : 'success';
  for (const previous of ['18', '19']) {
    it(`current20 connected ${family} excludes equal-hash contract${previous} before payload decoding`, () => {
      const attempt = write(fractional);
      try {
        expect(attempt.questions.time.contractVersion).toBe('20+0.4.0');
        expect(
          attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write)),
        ).toBe('stored');
        expect(
          readConnectedOptimizationPair(attempt.db, { questions: attempt.questions }).generation,
        ).not.toBeNull();
        expect(
          readConnectedOptimizationPair(attempt.db, { questions: attempt.questions }).variants.time
            .kind,
        ).toBe(fractional ? 'boundary-infeasible' : 'ok');
        if (fractional) {
          expect(attempt.db.select().from(optimizedScheduleCache).all()).toHaveLength(0);
          attempt.db
            .update(optimizationBoundaryCertificate)
            .set({
              contractVersion: `${previous}+0.4.0`,
              certificateJson: 'unreadable old certificate',
            })
            .where(eq(optimizationBoundaryCertificate.workPackageId, 'B'))
            .run();
          const retained = attempt.db.select().from(optimizationBoundaryCertificate).all();
          expect(retained).toHaveLength(1);
          expect(retained[0]?.inputHash).toBe(attempt.questions.time.inputHash);
          expect(retained[0]?.generation).toBe(attempt.write.claim.generation);
          expect(
            readConnectedOptimizationPair(attempt.db, { questions: attempt.questions }).variants
              .time.kind,
          ).toBe('miss');
          expect(attempt.db.select().from(optimizationBoundaryCertificate).all()).toEqual(retained);
        } else {
          expect(attempt.db.select().from(optimizationBoundaryCertificate).all()).toHaveLength(0);
          attempt.db
            .update(optimizedScheduleCache)
            .set({ contractVersion: `${previous}+0.4.0`, resultJson: 'unreadable old success' })
            .where(eq(optimizedScheduleCache.workPackageId, 'B'))
            .run();
          const retained = attempt.db.select().from(optimizedScheduleCache).all();
          expect(retained).toHaveLength(1);
          expect(retained[0]?.inputHash).toBe(attempt.questions.time.inputHash);
          expect(retained[0]?.generation).toBe(attempt.write.claim.generation);
          expect(
            readConnectedOptimizationPair(attempt.db, { questions: attempt.questions }).variants
              .time.kind,
          ).toBe('miss');
          expect(attempt.db.select().from(optimizedScheduleCache).all()).toEqual(retained);
        }
      } finally {
        attempt.close();
      }
    });
  }
  it(
    'current20 connected ' + family + ' keeps stale DTO as corruption rather than cache miss',
    () => {
      const attempt = write(fractional);
      try {
        expect(
          attempt.db.transaction((tx) => storeConnectedOptimizationOutcomeIn(tx, attempt.write)),
        ).toBe('stored');
        expect(
          readConnectedOptimizationPair(attempt.db, { questions: attempt.questions }).variants.time
            .kind,
        ).toBe(fractional ? 'boundary-infeasible' : 'ok');
        if (attempt.outcome.kind === 'boundary-infeasible') {
          attempt.db
            .update(optimizationBoundaryCertificate)
            .set({
              certificateJson: JSON.stringify({ ...attempt.outcome.certificate, dtoVersion: 1 }),
            })
            .where(eq(optimizationBoundaryCertificate.workPackageId, 'B'))
            .run();
          expect(() =>
            readConnectedOptimizationPair(attempt.db, { questions: attempt.questions }),
          ).toThrow(/dtoVersion.*2/);
        } else {
          attempt.db
            .update(optimizedScheduleCache)
            .set({ resultJson: JSON.stringify({ ...attempt.outcome.success, dtoVersion: 2 }) })
            .where(eq(optimizedScheduleCache.workPackageId, 'B'))
            .run();
          const corrupt = readConnectedOptimizationPair(attempt.db, {
            questions: attempt.questions,
          }).variants.time;
          expect(corrupt.kind).toBe('corrupt');
          if (corrupt.kind !== 'corrupt')
            throw Error('fixture must reach current-contract corruption');
          expect(corrupt.message).toMatch(/dtoVersion.*3/);
        }
      } finally {
        attempt.close();
      }
    },
  );
}
