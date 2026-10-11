import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { allocateEnabledGeneration } from '@wbs/store-sqlite/optimization-generation';
import { afterEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import type { CommittedDecision } from '../module/optimization/contract';
import { openDatabase, openDrizzle } from './db';
import { DrizzleEventLogStore, type EventLogTransactionalWrite } from './event-log';
import { type Gate, OPEN, WriteCoordinator } from './gate';
import { runMigrations } from './migrate';
import { createOptimizationRepository } from './optimization';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;
const CONTRACT = '7+0.1.0';
const BUDGET = 60_000;
const dirs: string[] = [];

function decisionOf<T>(committed: CommittedDecision<T>): T {
  expect(committed.envelopes).toEqual([]);
  return committed.decision;
}

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
  const generation = allocateEnabledGeneration(db, 'p-1', CONTRACT, key.inputHash, 10);
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
  it('keeps one generation identity when a competing source turn supersedes its input', async () => {
    const { db, log, key, generation } = fixture();
    const lane = new WriteCoordinator();
    let competed = false;
    let competitor: Promise<void> | undefined;
    const gate: Gate = {
      enter<T>(work: () => Promise<T>): Promise<T> {
        const observation = lane.enter(work);
        if (!competed) {
          competed = true;
          competitor = lane.enter(() =>
            Promise.resolve().then(() => {
              expect(allocateEnabledGeneration(db, key.projectId, CONTRACT, 'input-b', 12)).toBe(
                generation + 1,
              );
              expect(
                allocateEnabledGeneration(db, key.projectId, CONTRACT, key.inputHash, 13),
              ).toBe(generation + 2);
              db.run(
                sql.raw(
                  "INSERT INTO optimized_schedule_cache (project_id, input_hash, objective, contract_version, budget_ms, generation, status, failure_reason, created_at) VALUES ('p-1', 'input-a', 'pri', '7+0.1.0', 60000, 3, 'failed', 'timeout', 13)",
                ),
              );
            }),
          );
        }
        return observation;
      },
    };
    const repository = createOptimizationRepository(db, log, gate);

    const observed = await repository.observeForAdmission(key, 11).then(decisionOf);
    if (competitor === undefined) throw new Error('competing source turn was not queued');
    await competitor;
    expect(observed).toMatchObject({
      kind: 'observed',
      generation,
      pair: {
        pri: { kind: 'non-ready', state: { state: 'idle' } },
        time: { kind: 'non-ready', state: { state: 'idle' } },
      },
      requests: [
        { key, objective: 'pri' },
        { key, objective: 'time' },
      ],
    });
    expect(db.all(sql.raw('SELECT generation, input_hash FROM optimization_generation'))).toEqual([
      { generation: generation + 2, input_hash: key.inputHash },
    ]);
    // Proof: splitting generation allocation and pair/objective read into two
    // public turns let the queued generation 3 failed PRI row enter a response
    // labelled generation 1, leaving only TIME in its objective list.
  });

  it('waits for the source owner before observing one generation, pair and objective list', async () => {
    const { path, db, log, key, generation } = fixture();
    const gate = new WriteCoordinator();
    const repository = createOptimizationRepository(db, log, gate);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const outer = gate.enter(async () => {
      db.run(sql.raw('BEGIN IMMEDIATE'));
      db.run(sql.raw("UPDATE optimization_generation SET input_hash = 'uncommitted'"));
      entered.resolve(undefined);
      await release.promise;
      db.run(sql.raw('ROLLBACK'));
    });
    await entered.promise;
    let settled = false;
    try {
      const observation = repository.observeForAdmission(key, 11).then((committed) => {
        settled = true;
        expect(committed.envelopes).toEqual([]);
        return decisionOf(committed);
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      const outside = openDatabase(path);
      try {
        expect(
          outside.query('SELECT generation, input_hash FROM optimization_generation').all(),
        ).toEqual([{ generation, input_hash: key.inputHash }]);
      } finally {
        outside.close();
      }
      release.resolve(undefined);
      await outer;
      const observed = await observation;
      expect(observed).toMatchObject({
        kind: 'observed',
        generation,
        pair: {
          pri: { kind: 'non-ready', state: { state: 'idle' } },
          time: { kind: 'non-ready', state: { state: 'idle' } },
        },
        requests: [
          { key, objective: 'pri' },
          { key, objective: 'time' },
        ],
      });
      expect(db.all(sql.raw('SELECT generation, input_hash FROM optimization_generation'))).toEqual(
        [{ generation, input_hash: key.inputHash }],
      );
    } finally {
      release.resolve(undefined);
      await outer;
    }
  });

  it('keeps live generation allocation outside an awaited source owner that rolls back', async () => {
    const { db, log, key, generation } = fixture();
    const gate = new WriteCoordinator();
    const repository = createOptimizationRepository(db, log, gate);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const outer = gate.enter(async () => {
      db.run(sql.raw('BEGIN IMMEDIATE'));
      entered.resolve(undefined);
      await release.promise;
      db.run(sql.raw('ROLLBACK'));
    });
    await entered.promise;
    let settled = false;
    try {
      const allocation = Promise.resolve(
        repository.allocateGeneration(key.projectId, key.contractVersion, 'input-b', 11),
      ).then((allocated) => {
        settled = true;
        return allocated;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      release.resolve(undefined);
      await outer;
      expect(await allocation).toBe(generation + 1);
      expect(db.all(sql.raw('SELECT generation, input_hash FROM optimization_generation'))).toEqual(
        [{ generation: generation + 1, input_hash: 'input-b' }],
      );
    } finally {
      release.resolve(undefined);
      await outer;
    }
  });

  it('keeps a live variant observation outside an awaited source owner', async () => {
    const { db, log, key, generation } = fixture();
    const gate = new WriteCoordinator();
    const repository = createOptimizationRepository(db, log, gate);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const outer = gate.enter(async () => {
      db.run(sql.raw('BEGIN IMMEDIATE'));
      entered.resolve(undefined);
      await release.promise;
      db.run(sql.raw('ROLLBACK'));
    });
    await entered.promise;
    let settled = false;
    try {
      const observation = repository.isVariantLive(key, generation, 'pri', 11).then((live) => {
        settled = true;
        return live;
      });
      await Promise.resolve();
      await Bun.sleep(0);
      expect(settled).toBe(false);
      release.resolve(undefined);
      await outer;
      expect(await observation).toBe(false);
    } finally {
      release.resolve(undefined);
      await outer;
    }
    // Proof: removing only the live observation gate settled the read inside
    // the awaiting source owner, before its transaction rolled back.
  });

  it('does not let live slot reservation join an awaited source owner', async () => {
    const { db, log, key, generation } = fixture();
    const gate = new WriteCoordinator();
    const repository = createOptimizationRepository(db, log, gate);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const outer = gate.enter(async () => {
      db.run(sql.raw('BEGIN IMMEDIATE'));
      entered.resolve(undefined);
      await release.promise;
      db.run(sql.raw('ROLLBACK'));
    });
    await entered.promise;
    const request = {
      projectId: key.projectId,
      contractVersion: key.contractVersion,
      generation,
      objective: 'pri' as const,
      budgetMs: key.budgetMs,
      ownerId: 'blue',
      attemptToken: 'reserved-after-owner',
      now: 11,
    };
    let settled = false;
    try {
      const reservation = Promise.resolve(repository.reserveSlot(request).then(decisionOf)).then(
        (admission) => {
          settled = true;
          return admission;
        },
      );
      await Promise.resolve();
      expect(settled).toBe(false);
      release.resolve(undefined);
      await outer;
      expect((await reservation).kind).toBe('reserved');
      expect(db.all(sql.raw('SELECT attempt_token FROM solver_slot'))).toEqual([
        { attempt_token: 'reserved-after-owner' },
      ]);
    } finally {
      release.resolve(undefined);
      await outer;
    }
  });

  it('keeps a live heartbeat outside an awaited source owner that rolls back', async () => {
    const { db, log, key, generation } = fixture();
    const slot = {
      projectId: key.projectId,
      contractVersion: key.contractVersion,
      generation,
      objective: 'pri' as const,
      budgetMs: key.budgetMs,
      ownerId: 'blue',
      attemptToken: 'heartbeat-after-owner',
    };
    const owned = createOptimizationRepository(db, log, OPEN);
    const seed = await owned.reserveSlot({ ...slot, now: 10 }).then(decisionOf);
    if (seed.kind !== 'reserved') throw new Error('fixture admission refused');
    if (!(await owned.bindSlot({ ...slot, pid: 12_345 }))) throw new Error('fixture bind refused');
    const gate = new WriteCoordinator();
    const repository = createOptimizationRepository(db, log, gate);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const outer = gate.enter(async () => {
      db.run(sql.raw('BEGIN IMMEDIATE'));
      entered.resolve(undefined);
      await release.promise;
      db.run(sql.raw('ROLLBACK'));
    });
    await entered.promise;
    let settled = false;
    try {
      const heartbeat = Promise.resolve(
        repository.refreshSlot({ ...slot, admittedCancelEpoch: seed.admittedCancelEpoch, now: 21 }),
      ).then((state) => {
        settled = true;
        return state;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      release.resolve(undefined);
      await outer;
      expect(await heartbeat).toEqual({ kind: 'live' });
      expect(db.all(sql.raw('SELECT heartbeat_at FROM solver_slot'))).toEqual([
        { heartbeat_at: 21 },
      ]);
    } finally {
      release.resolve(undefined);
      await outer;
    }
  });

  it('keeps a stored outcome and its event outside an awaited source owner', async () => {
    const { db, log, key, generation } = fixture();
    const slot = {
      projectId: key.projectId,
      contractVersion: key.contractVersion,
      generation,
      objective: 'pri' as const,
      budgetMs: key.budgetMs,
      ownerId: 'blue',
      attemptToken: 'outcome-after-owner',
    };
    const seed = await createOptimizationRepository(db, log, OPEN)
      .reserveSlot({
        ...slot,
        now: 10,
      })
      .then(decisionOf);
    if (seed.kind !== 'reserved') throw new Error('fixture admission refused');
    const gate = new WriteCoordinator();
    const repository = createOptimizationRepository(db, log, gate);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const outer = gate.enter(async () => {
      db.run(sql.raw('BEGIN IMMEDIATE'));
      entered.resolve(undefined);
      await release.promise;
      db.run(sql.raw('ROLLBACK'));
    });
    await entered.promise;
    let settled = false;
    try {
      const recorded = Promise.resolve(
        repository.recordOutcome({
          claim: slot,
          inputHash: key.inputHash,
          admittedCancelEpoch: seed.admittedCancelEpoch,
          outcome: { kind: 'failed', reason: 'internal-error' },
          now: 21,
        }),
      ).then((outcome) => {
        settled = true;
        return outcome;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      release.resolve(undefined);
      await outer;
      expect(decisionOf(await recorded).kind).toBe('stored');
      expect(db.all(sql.raw('SELECT count(*) AS count FROM optimized_schedule_cache'))).toEqual([
        { count: 1 },
      ]);
      expect(db.all(sql.raw('SELECT count(*) AS count FROM event_log'))).toEqual([{ count: 1 }]);
    } finally {
      release.resolve(undefined);
      await outer;
    }
  });

  it('keeps a durable queue insertion outside an awaited source owner', async () => {
    const { db, log, key, generation } = fixture();
    const gate = new WriteCoordinator();
    const repository = createOptimizationRepository(db, log, gate);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const outer = gate.enter(async () => {
      db.run(sql.raw('BEGIN IMMEDIATE'));
      entered.resolve(undefined);
      await release.promise;
      db.run(sql.raw('ROLLBACK'));
    });
    await entered.promise;
    let settled = false;
    try {
      const queued = Promise.resolve(
        repository.enqueueRequest({
          projectId: key.projectId,
          contractVersion: key.contractVersion,
          generation,
          objective: 'pri',
          budgetMs: key.budgetMs,
          enqueuedAt: 11,
        }),
      ).then((outcome) => {
        settled = true;
        return outcome;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      release.resolve(undefined);
      await outer;
      expect(await queued).toEqual({ kind: 'queued' });
      expect(db.all(sql.raw('SELECT objective FROM solver_queue'))).toEqual([{ objective: 'pri' }]);
    } finally {
      release.resolve(undefined);
      await outer;
    }
  });

  it('keeps exact-token slot release outside an awaited source owner', async () => {
    const { db, log, key, generation } = fixture();
    const slot = {
      projectId: key.projectId,
      contractVersion: key.contractVersion,
      generation,
      objective: 'pri' as const,
      budgetMs: key.budgetMs,
      ownerId: 'blue',
      attemptToken: 'release-after-owner',
    };
    const seed = await createOptimizationRepository(db, log, OPEN)
      .reserveSlot({
        ...slot,
        now: 10,
      })
      .then(decisionOf);
    if (seed.kind !== 'reserved') throw new Error('fixture admission refused');
    const gate = new WriteCoordinator();
    const repository = createOptimizationRepository(db, log, gate);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const outer = gate.enter(async () => {
      db.run(sql.raw('BEGIN IMMEDIATE'));
      entered.resolve(undefined);
      await release.promise;
      db.run(sql.raw('ROLLBACK'));
    });
    await entered.promise;
    let settled = false;
    try {
      const released = Promise.resolve(repository.releaseSlot(slot)).then((outcome) => {
        settled = true;
        return outcome;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      release.resolve(undefined);
      await outer;
      expect((await released).released).toBe(true);
      expect(db.all(sql.raw('SELECT attempt_token FROM solver_slot'))).toEqual([]);
    } finally {
      release.resolve(undefined);
      await outer;
    }
  });

  it('keeps a launcher bind outside an awaited source owner', async () => {
    const { db, log, key, generation } = fixture();
    const slot = {
      projectId: key.projectId,
      contractVersion: key.contractVersion,
      generation,
      objective: 'pri' as const,
      budgetMs: key.budgetMs,
      ownerId: 'blue',
      attemptToken: 'bind-after-owner',
    };
    const seed = await createOptimizationRepository(db, log, OPEN)
      .reserveSlot({
        ...slot,
        now: 10,
      })
      .then(decisionOf);
    if (seed.kind !== 'reserved') throw new Error('fixture admission refused');
    const gate = new WriteCoordinator();
    const repository = createOptimizationRepository(db, log, gate);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const outer = gate.enter(async () => {
      db.run(sql.raw('BEGIN IMMEDIATE'));
      entered.resolve(undefined);
      await release.promise;
      db.run(sql.raw('ROLLBACK'));
    });
    await entered.promise;
    let settled = false;
    try {
      const bound = Promise.resolve(repository.bindSlot({ ...slot, pid: 12_345 })).then((ok) => {
        settled = true;
        return ok;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      release.resolve(undefined);
      await outer;
      expect(await bound).toBe(true);
      expect(db.all(sql.raw('SELECT lifecycle, pid FROM solver_slot'))).toEqual([
        { lifecycle: 'running', pid: 12_345 },
      ]);
    } finally {
      release.resolve(undefined);
      await outer;
    }
  });

  it('keeps a FIFO dequeue outside an awaited source owner', async () => {
    const { db, log, key, generation } = fixture();
    const seeded = await createOptimizationRepository(db, log, OPEN).enqueueRequest({
      projectId: key.projectId,
      contractVersion: key.contractVersion,
      generation,
      objective: 'pri',
      budgetMs: key.budgetMs,
      enqueuedAt: 10,
    });
    if (seeded.kind !== 'queued') throw new Error('fixture queue refused');
    const gate = new WriteCoordinator();
    const repository = createOptimizationRepository(db, log, gate);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const outer = gate.enter(async () => {
      db.run(sql.raw('BEGIN IMMEDIATE'));
      entered.resolve(undefined);
      await release.promise;
      db.run(sql.raw('ROLLBACK'));
    });
    await entered.promise;
    let settled = false;
    try {
      const dequeued = Promise.resolve(
        repository
          .dequeueRequest({ ownerId: 'blue', attemptToken: 'dequeued', now: 11 })
          .then(decisionOf),
      ).then((outcome) => {
        settled = true;
        return outcome;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      release.resolve(undefined);
      await outer;
      expect((await dequeued).kind).toBe('reserved');
      expect(db.all(sql.raw('SELECT objective FROM solver_queue'))).toEqual([]);
      expect(db.all(sql.raw('SELECT attempt_token FROM solver_slot'))).toEqual([
        { attempt_token: 'dequeued' },
      ]);
    } finally {
      release.resolve(undefined);
      await outer;
    }
  });

  it('keeps a drain reconciliation outside an awaited source owner', async () => {
    const { db, log } = fixture();
    db.run(sql.raw("UPDATE optimization_generation SET admission_state = 'draining'"));
    const gate = new WriteCoordinator();
    const repository = createOptimizationRepository(db, log, gate);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const outer = gate.enter(async () => {
      db.run(sql.raw('BEGIN IMMEDIATE'));
      entered.resolve(undefined);
      await release.promise;
      db.run(sql.raw('ROLLBACK'));
    });
    await entered.promise;
    let settled = false;
    try {
      const sweep = Promise.resolve(repository.reconcileDrains(11)).then((outcome) => {
        settled = true;
        return outcome;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      release.resolve(undefined);
      await outer;
      expect((await sweep).finished).toBe(1);
      expect(db.all(sql.raw('SELECT project_id FROM optimization_generation'))).toEqual([]);
    } finally {
      release.resolve(undefined);
      await outer;
    }
  });

  it('waits for an overlapping rolled-back unit of work before accepting Retry', async () => {
    const { db, log, key, generation } = fixture();
    db.run(
      sql.raw(
        "INSERT INTO users (id, username, password_hash, created_at) VALUES ('sam', 'sam', 'hash', 1)",
      ),
    );
    db.run(sql.raw("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)"));
    db.run(
      sql.raw(
        "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'sam', 'super_admin', 1)",
      ),
    );
    db.run(
      sql.raw(
        "INSERT INTO project_organization (resource_id, organization_id) VALUES ('p-1', 'org-a')",
      ),
    );
    db.run(sql.raw("UPDATE project SET restricted = 1 WHERE id = 'p-1'"));
    const gate = new WriteCoordinator();
    const repository = createOptimizationRepository(db, log, gate);
    const slot = {
      projectId: key.projectId,
      contractVersion: CONTRACT,
      generation,
      objective: 'pri' as const,
      budgetMs: BUDGET,
      ownerId: 'blue',
      attemptToken: 'first',
    };
    const admitted = await repository.reserveSlot({ ...slot, now: 10 }).then(decisionOf);
    if (admitted.kind !== 'reserved') throw new Error('fixture admission refused');
    expect(
      (
        await repository.recordOutcome({
          claim: slot,
          inputHash: key.inputHash,
          admittedCancelEpoch: admitted.admittedCancelEpoch,
          outcome: { kind: 'failed', reason: 'internal-error' },
          now: 20,
        })
      ).decision.kind,
    ).toBe('stored');
    await repository.releaseSlot(slot);
    let release: (() => void) | undefined;
    let opened: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      opened = resolve;
    });
    const closed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const outer = gate.enter(async () => {
      db.run(sql.raw('BEGIN IMMEDIATE'));
      opened?.();
      await closed;
      db.run(sql.raw('ROLLBACK'));
    });
    await ready;
    let settled = false;
    const retry = Promise.resolve(
      repository
        .admitRetry({
          key,
          objective: 'pri',
          ownerId: 'green',
          now: 21,
          attemptToken: () => 'retry',
          scoped: { organizationId: 'org-a', actorId: 'sam' },
        })
        .then(decisionOf),
    ).then((decision) => {
      settled = true;
      return decision;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release?.();
    await outer;
    expect(await retry).toMatchObject({ kind: 'accepted', generation });
    expect(db.all(sql.raw('SELECT attempt_token FROM solver_slot'))).toEqual([
      { attempt_token: 'retry' },
    ]);
    expect(db.all(sql.raw('SELECT detail FROM organization_audit'))).toEqual([
      { detail: '{"optimizer":"retry"}' },
    ]);
  });
  it('projects a cache miss before reserving the captured objectives', async () => {
    const { db, log, key } = fixture();
    const repository = createOptimizationRepository(db, log, OPEN);
    const observed = await repository.observeForAdmission(key, 10).then(decisionOf);
    if (observed.kind !== 'observed') throw new Error('fixture observation refused');
    expect(observed.pair).toEqual({
      pri: { kind: 'non-ready', state: { state: 'idle' }, schedule: null },
      time: { kind: 'non-ready', state: { state: 'idle' }, schedule: null },
    });
  });

  it('returns the pre-admission cache snapshot when a later write commits a marker', async () => {
    const { db, log, key, generation } = fixture();
    const repository = createOptimizationRepository(db, log, OPEN);
    const observed = await repository.observeForAdmission(key, 10).then(decisionOf);
    if (observed.kind !== 'observed') throw new Error('fixture observation refused');
    expect(observed.requests.map(({ objective }) => objective)).toContain('pri');
    const objective = 'pri' as const;
    const slot = {
      projectId: key.projectId,
      contractVersion: key.contractVersion,
      generation,
      objective,
      budgetMs: key.budgetMs,
      ownerId: 'blue',
      attemptToken: 'callback-attempt',
    };
    const admission = await repository.reserveSlot({ ...slot, now: 10 }).then(decisionOf);
    if (admission.kind !== 'reserved') throw new Error('fixture admission refused');
    expect(
      (
        await repository.recordOutcome({
          claim: slot,
          inputHash: key.inputHash,
          admittedCancelEpoch: admission.admittedCancelEpoch,
          outcome: { kind: 'failed', reason: 'internal-error' },
          now: 11,
        })
      ).decision.kind,
    ).toBe('stored');
    await repository.releaseSlot(slot);
    expect(observed.pair.pri.state).toEqual({ state: 'idle' });
    const later = await repository.observeForAdmission(key, 12).then(decisionOf);
    if (later.kind !== 'observed') throw new Error('fixture observation refused');
    expect(later.pair.pri.state).toEqual({
      state: 'failed',
      reason: 'internal-error',
    });
  });

  it('checks Retry eligibility before creating a token', async () => {
    const { db, log, key } = fixture();
    let tokens = 0;
    const decision = await createOptimizationRepository(db, log, OPEN)
      .admitRetry({
        key: { ...key, inputHash: 'stale-input' },
        objective: 'pri',
        ownerId: 'blue',
        now: 10,
        attemptToken: () => {
          tokens++;
          return 'token';
        },
      })
      .then(decisionOf);
    expect(decision).toEqual({ kind: 'not-retryable', state: 'idle' });
    expect(tokens).toBe(0);
  });

  it('retains a failed marker until an eligible Retry reserves, then reports liveness', async () => {
    const { db, log, key, generation } = fixture();
    const repository = createOptimizationRepository(db, log, OPEN);
    const slot = {
      projectId: key.projectId,
      contractVersion: CONTRACT,
      generation,
      objective: 'pri' as const,
      budgetMs: BUDGET,
      ownerId: 'blue',
      attemptToken: 'first',
    };
    const admitted = await repository.reserveSlot({ ...slot, now: 10 }).then(decisionOf);
    expect(admitted.kind).toBe('reserved');
    if (admitted.kind !== 'reserved') throw new Error('fixture admission refused');
    const write = {
      claim: slot,
      inputHash: key.inputHash,
      admittedCancelEpoch: admitted.admittedCancelEpoch,
      outcome: { kind: 'failed', reason: 'internal-error' } as const,
      now: 20,
    };
    const committed = await repository.recordOutcome(write);
    expect(committed.envelopes).toEqual([]);
    expect(committed.decision.kind).toBe('stored');
    if (committed.decision.kind !== 'stored') throw new Error('fixture outcome refused');
    expect(committed.decision.event.type).toBe('schedule_optimization_failed');
    expect(await repository.recordOutcome(write)).toEqual({
      decision: { kind: 'already-recorded' },
      envelopes: [],
    });
    expect(
      await repository.recordOutcome({ ...write, claim: { ...slot, attemptToken: 'stale' } }),
    ).toEqual({
      decision: { kind: 'superseded' },
      envelopes: [],
    });
    await repository.releaseSlot(slot);
    let tokens = 0;
    const retry = () =>
      repository
        .admitRetry({
          key,
          objective: 'pri',
          ownerId: 'green',
          now: 20,
          attemptToken: () => `retry-${String(tokens++)}`,
        })
        .then(decisionOf);
    expect(await retry()).toMatchObject({ kind: 'accepted', generation });
    const observed = await repository.observeForAdmission(key, 21).then(decisionOf);
    if (observed.kind !== 'observed') throw new Error('fixture observation refused');
    expect(observed.pair.pri.state.state).toBe('failed');
    expect(await retry()).toEqual({ kind: 'already-running' });
    expect(tokens).toBe(1);
  });

  it('rolls back cache, event, and sequencer if event recording writes then throws', async () => {
    const { path, db, log, key, generation } = fixture();
    const writer: EventLogTransactionalWrite = {
      recordEventIn: (tx, subscription, message, createdAt) => {
        log.recordEventIn(tx, subscription, message, createdAt);
        throw new Error('injected event failure');
      },
    };
    const repository = createOptimizationRepository(db, writer, OPEN);
    const admission = await repository
      .reserveSlot({
        projectId: key.projectId,
        contractVersion: CONTRACT,
        generation,
        objective: 'pri',
        budgetMs: BUDGET,
        ownerId: 'blue',
        attemptToken: 'token',
        now: 10,
      })
      .then(decisionOf);
    expect(admission.kind).toBe('reserved');
    if (admission.kind !== 'reserved') throw new Error('fixture admission refused');
    const failure = await repository
      .recordOutcome({
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
      })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(failure).toMatchObject({ message: 'injected event failure' });
    expect(count(path, 'optimized_schedule_cache')).toBe(0);
    expect(count(path, 'event_log')).toBe(0);
    expect(count(path, 'event_sequencer')).toBe(0);
  });

  it('rejects a stored outcome with no event envelope before committing', async () => {
    const { path, db, key, generation } = fixture();
    const writer: EventLogTransactionalWrite = {
      // Deliberately breach the trusted store contract to test the adapter boundary.
      recordEventIn: () => undefined as never,
    };
    const repository = createOptimizationRepository(db, writer, OPEN);
    const admission = await repository
      .reserveSlot({
        projectId: key.projectId,
        contractVersion: CONTRACT,
        generation,
        objective: 'pri',
        budgetMs: BUDGET,
        ownerId: 'blue',
        attemptToken: 'token',
        now: 10,
      })
      .then(decisionOf);
    expect(admission.kind).toBe('reserved');
    if (admission.kind !== 'reserved') throw new Error('fixture admission refused');
    const failure = await repository
      .recordOutcome({
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
      })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(failure).toMatchObject({
      message: 'stored optimization outcome has no durable event envelope',
    });
    expect(count(path, 'optimized_schedule_cache')).toBe(0);
  });
});
