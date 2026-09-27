import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { DrizzleEventLogStore, type EventLogTransactionalWrite } from './event-log';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { createOptimizationRepository } from './optimization';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;
const CONTRACT = '7+0.1.0';
const BUDGET = 60_000;
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'wbs-optimization-adapter-'));
  dirs.push(dir);
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const sql = openDatabase(path);
  try {
    sql.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u-1', 'owner', 'hash', 1)",
    );
    sql.run(
      "INSERT INTO project (id, name, owner_id, restricted, revision, created_at, optimization_enabled, schedule_engine, schedule_objective) VALUES ('p-1', 'plan', 'u-1', 0, 0, 1, 1, 'optimized', 'pri')",
    );
  } finally {
    sql.close();
  }
  const db = openDrizzle(path);
  const log = new DrizzleEventLogStore(db, OPEN);
  const key = {
    projectId: 'p-1',
    inputHash: 'input-a',
    contractVersion: CONTRACT,
    budgetMs: BUDGET,
  };
  const generation = createOptimizationRepository(db, log).allocateGeneration(
    'p-1',
    CONTRACT,
    key.inputHash,
    10,
  );
  if (generation === null) throw new Error('fixture generation refused');
  return { path, db, log, key, generation };
}

function count(path: string, table: string): number {
  const sql = openDatabase(path);
  try {
    return (sql.query(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count;
  } finally {
    sql.close();
  }
}

describe('Optimization SQLite adapter', () => {
  it('projects a cache miss as a non-ready variant before admission callbacks', () => {
    const { db, log, key } = fixture();
    const repository = createOptimizationRepository(db, log);
    expect(repository.readPairAndAdmit(key, () => undefined)).toEqual({
      pri: { kind: 'non-ready', state: { state: 'idle' }, schedule: null },
      time: { kind: 'non-ready', state: { state: 'idle' }, schedule: null },
    });
  });

  it('returns the pre-callback cache snapshot when admission commits a marker', () => {
    const { db, log, key, generation } = fixture();
    const repository = createOptimizationRepository(db, log);
    const pair = repository.readPairAndAdmit(key, ({ objective }) => {
      if (objective !== 'pri') return;
      const slot = {
        projectId: key.projectId,
        contractVersion: key.contractVersion,
        generation,
        objective,
        budgetMs: key.budgetMs,
        ownerId: 'blue',
        attemptToken: 'callback-attempt',
      };
      const admission = repository.reserveSlot({ ...slot, now: 10 });
      if (admission.kind !== 'reserved') throw new Error('fixture admission refused');
      expect(
        repository.recordOutcome({
          claim: slot,
          inputHash: key.inputHash,
          admittedCancelEpoch: admission.admittedCancelEpoch,
          outcome: { kind: 'failed', reason: 'internal-error' },
          now: 11,
        }).kind,
      ).toBe('stored');
      repository.releaseSlot(slot);
    });
    expect(pair.pri.state).toEqual({ state: 'idle' });
    expect(repository.readPairAndAdmit(key, () => undefined).pri.state).toEqual({
      state: 'failed',
      reason: 'internal-error',
    });
  });

  it('checks Retry eligibility before creating a token', () => {
    const { db, log, key } = fixture();
    let tokens = 0;
    const decision = createOptimizationRepository(db, log).admitRetry({
      key: { ...key, inputHash: 'stale-input' },
      objective: 'pri',
      ownerId: 'blue',
      now: 10,
      attemptToken: () => {
        tokens++;
        return 'token';
      },
    });
    expect(decision).toEqual({ kind: 'not-retryable', state: 'idle' });
    expect(tokens).toBe(0);
  });

  it('retains a failed marker until an eligible Retry reserves, then reports liveness', () => {
    const { db, log, key, generation } = fixture();
    const repository = createOptimizationRepository(db, log);
    const slot = {
      projectId: key.projectId,
      contractVersion: CONTRACT,
      generation,
      objective: 'pri' as const,
      budgetMs: BUDGET,
      ownerId: 'blue',
      attemptToken: 'first',
    };
    const admitted = repository.reserveSlot({ ...slot, now: 10 });
    expect(admitted.kind).toBe('reserved');
    if (admitted.kind !== 'reserved') throw new Error('fixture admission refused');
    const write = {
      claim: slot,
      inputHash: key.inputHash,
      admittedCancelEpoch: admitted.admittedCancelEpoch,
      outcome: { kind: 'failed', reason: 'internal-error' } as const,
      now: 20,
    };
    const committed = repository.recordOutcome(write);
    expect(committed.kind).toBe('stored');
    if (committed.kind !== 'stored') throw new Error('fixture outcome refused');
    expect(committed.event.type).toBe('schedule_optimization_failed');
    expect(repository.recordOutcome(write)).toEqual({ kind: 'already-recorded' });
    repository.releaseSlot(slot);
    let tokens = 0;
    const retry = () =>
      repository.admitRetry({
        key,
        objective: 'pri',
        ownerId: 'green',
        now: 20,
        attemptToken: () => `retry-${String(tokens++)}`,
      });
    expect(retry()).toMatchObject({ kind: 'accepted', generation });
    expect(repository.readPairAndAdmit(key, () => undefined).pri.state.state).toBe('failed');
    expect(retry()).toEqual({ kind: 'already-running' });
    expect(tokens).toBe(1);
  });

  it('rolls back cache, event, and sequencer if event recording writes then throws', () => {
    const { path, db, log, key, generation } = fixture();
    const writer: EventLogTransactionalWrite = {
      recordEventIn: (tx, subscription, message, createdAt) => {
        log.recordEventIn(tx, subscription, message, createdAt);
        throw new Error('injected event failure');
      },
    };
    const repository = createOptimizationRepository(db, writer);
    const admission = repository.reserveSlot({
      projectId: key.projectId,
      contractVersion: CONTRACT,
      generation,
      objective: 'pri',
      budgetMs: BUDGET,
      ownerId: 'blue',
      attemptToken: 'token',
      now: 10,
    });
    expect(admission.kind).toBe('reserved');
    if (admission.kind !== 'reserved') throw new Error('fixture admission refused');
    expect(() =>
      repository.recordOutcome({
        claim: {
          projectId: 'p-1',
          contractVersion: CONTRACT,
          generation,
          objective: 'pri',
          budgetMs: BUDGET,
          ownerId: 'blue',
          attemptToken: 'token',
        },
        inputHash: key.inputHash,
        admittedCancelEpoch: admission.admittedCancelEpoch,
        outcome: { kind: 'failed', reason: 'internal-error' },
        now: 20,
      }),
    ).toThrow('injected event failure');
    expect(count(path, 'optimized_schedule_cache')).toBe(0);
    expect(count(path, 'event_log')).toBe(0);
    expect(count(path, 'event_sequencer')).toBe(0);
  });

  it('rejects a stored outcome with no event envelope before committing', () => {
    const { path, db, key, generation } = fixture();
    const writer: EventLogTransactionalWrite = {
      // Deliberately breach the trusted store contract to test the adapter boundary.
      recordEventIn: () => undefined as never,
    };
    const repository = createOptimizationRepository(db, writer);
    const admission = repository.reserveSlot({
      projectId: key.projectId,
      contractVersion: CONTRACT,
      generation,
      objective: 'pri',
      budgetMs: BUDGET,
      ownerId: 'blue',
      attemptToken: 'token',
      now: 10,
    });
    expect(admission.kind).toBe('reserved');
    if (admission.kind !== 'reserved') throw new Error('fixture admission refused');
    expect(() =>
      repository.recordOutcome({
        claim: {
          projectId: 'p-1',
          contractVersion: CONTRACT,
          generation,
          objective: 'pri',
          budgetMs: BUDGET,
          ownerId: 'blue',
          attemptToken: 'token',
        },
        inputHash: key.inputHash,
        admittedCancelEpoch: admission.admittedCancelEpoch,
        outcome: { kind: 'failed', reason: 'internal-error' },
        now: 20,
      }),
    ).toThrow('stored optimization outcome has no durable event envelope');
    expect(count(path, 'optimized_schedule_cache')).toBe(0);
  });
});
