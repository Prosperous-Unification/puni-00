import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  encodeOptimizedResult,
  type OptimizedResult,
  RESULT_DTO_VERSION,
} from '@wbs/contracts/solver/optimized-result';
import { type PlannedRow, type Schedule, schedule, type Slice } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { runMigrations } from './migrate';
import { allocateGeneration } from './optimization-generation';
import {
  type AdmissionClaim,
  admissionStillCurrent,
  type CachedOutcome,
  type OptimizedCacheKey,
  type OptimizedPair,
  type OutcomeToStore,
  type OutcomeWriteResult,
  readOptimizedPair,
  storeOptimizedOutcome,
  writerStillHolds,
} from './optimized-schedule-cache';
import { optimizedScheduleCache } from './schema';

/**
 * tasks.md 4.2's proof file, for the half 4.1 has landed: the read.
 *
 * Every case here goes through {@link readOptimizedPair} rather than off a raw
 * select, because the claims are about the *read path* — the generation
 * predicate, the 3.8 boundary and the decode seam — and a select would prove
 * only that SQLite stored what it was given. The spawner-count halves of 4.2,
 * 4.4 and 4.8 wait for the coordinator; what is provable without it is which
 * outcome each stored shape reads as, and that is what the spawn rules are
 * written against.
 */

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

const CONTRACT = '7+1.0.0';
const HASH = 'h1';
const BUDGET = 60_000;

const KEY: OptimizedCacheKey = {
  projectId: 'p-1',
  inputHash: HASH,
  contractVersion: CONTRACT,
  budgetMs: BUDGET,
};

function tempDb(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'wbs-optimized-cache-'));
  return {
    path: join(dir, 'test.db'),
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function seedProject(path: string): void {
  const db = openDatabase(path);
  try {
    db.run(
      `INSERT INTO users (id, username, password_hash, created_at) VALUES ('u-1', 'u', 'h', 1)`,
    );
    db.run(
      `INSERT INTO project (id, name, owner_id, restricted, revision, created_at)
       VALUES ('p-1', 'Rewire the shed', 'u-1', 0, 0, 1)`,
    );
  } finally {
    db.close();
  }
}

/** Three two-day blocks in a pool of one, so a stored plan has real waits in it. */
function realPlan(): Schedule {
  const rows: PlannedRow[] = ['a', 'b', 'c'].map((id, at) => ({
    id,
    parentId: null,
    position: (at + 1) * 10,
    frozenNumber: null,
    priority: null,
  }));
  const slices: Slice[] = ['a', 'b', 'c'].map((workItemId) => ({
    workItemId,
    stepId: 'step-dev',
    days: 2,
    personId: null,
    width: 1,
    poolIds: ['team-platform'],
  }));
  return schedule(rows, [], slices, new Map(), new Map([['team-platform', 1]]));
}

function solverResult(plan: Schedule): OptimizedResult {
  return {
    publication: 'solver',
    objectiveValues: {
      makespan: { value: 288, stageValue: 288, bound: 288, status: 'optimal' },
      priority: { value: 41, stageValue: 41, bound: 40, status: 'feasible' },
      movement: { value: 7, stageValue: null, bound: null, status: 'unknown' },
    },
    schedule: plan,
  };
}

/** A prepared database with one allocated generation and nothing cached. */
function prepared(path: string): number {
  runMigrations(path, FOLDER);
  seedProject(path);
  return allocateGeneration(openDrizzle(path), 'p-1', CONTRACT, HASH, 1);
}

/**
 * Writes a row with raw SQL on purpose.
 *
 * The corrupt cases store payloads the typed insert would never produce, and
 * the whole point of 4.8 is what happens to a row this release did not write —
 * one from an earlier version, a restored backup, a hand repair. Going through
 * drizzle's typed insert would prove only that the encoder and the decoder
 * agree, which `optimized-result-dto.test.ts` already proves.
 */
function storeRow(
  path: string,
  values: {
    objective: string;
    generation: number;
    status: string;
    resultJson: string | null;
    failureReason: string | null;
    inputHash?: string;
    contractVersion?: string;
    budgetMs?: number;
  },
): void {
  const db = openDatabase(path);
  try {
    const quote = (value: string | null): string =>
      value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`;
    db.run(
      `INSERT INTO optimized_schedule_cache
         (project_id, input_hash, objective, contract_version, budget_ms,
          generation, status, result_json, failure_reason, created_at)
       VALUES ('p-1', ${quote(values.inputHash ?? HASH)}, '${values.objective}',
               ${quote(values.contractVersion ?? CONTRACT)}, ${String(values.budgetMs ?? BUDGET)},
               ${String(values.generation)}, '${values.status}', ${quote(values.resultJson)},
               ${quote(values.failureReason)}, 7)`,
    );
  } finally {
    db.close();
  }
}

function storedRowCount(path: string): number {
  const db = openDatabase(path);
  try {
    return (db.query('SELECT COUNT(*) AS n FROM optimized_schedule_cache').get() as { n: number })
      .n;
  } finally {
    db.close();
  }
}

function read(path: string, key: OptimizedCacheKey = KEY): OptimizedPair {
  return readOptimizedPair(openDrizzle(path), key);
}

describe('what a stored pair reads as', () => {
  it('serves both objectives for the full key, objectiveValues and plan intact', () => {
    const db = tempDb();
    try {
      const generation = prepared(db.path);
      const plan = realPlan();
      const source = solverResult(plan);
      // Load-bearing: over an empty plan the schedule assertion below is vacuous.
      expect(plan.slices.size).toBe(3);
      const payload = JSON.stringify(encodeOptimizedResult(source));
      for (const objective of ['pri', 'time']) {
        storeRow(db.path, {
          objective,
          generation,
          status: 'ok',
          resultJson: payload,
          failureReason: null,
        });
      }

      const pair = read(db.path);

      expect(pair.pri.kind).toBe('ok');
      expect(pair.time.kind).toBe('ok');
      if (pair.pri.kind !== 'ok') throw new Error('unreachable');
      expect(pair.pri.result.objectiveValues).toEqual(source.objectiveValues);
      expect(pair.pri.result.publication).toBe('solver');
      expect(pair.pri.result.schedule).toEqual(plan);
      expect(pair.pri.generation).toBe(generation);
      expect(pair.pri.createdAt).toBe(7);
    } finally {
      db.cleanup();
    }
  });

  it('reads one objective and misses the other when only one has committed', () => {
    const db = tempDb();
    try {
      const generation = prepared(db.path);
      storeRow(db.path, {
        objective: 'pri',
        generation,
        status: 'ok',
        resultJson: JSON.stringify(encodeOptimizedResult(solverResult(realPlan()))),
        failureReason: null,
      });

      const pair = read(db.path);

      expect(pair.pri.kind).toBe('ok');
      expect(pair.time).toEqual({ kind: 'miss' });
    } finally {
      db.cleanup();
    }
  });

  /**
   * 4.2's three key-column misses in one case, because they are one claim: the
   * primary key decides the row, and a read for a different key is a miss
   * rather than a near-enough hit. `budgetMs` is the one an implementer drops —
   * it is the only key column that is neither the plan nor the release.
   */
  it('misses a raised budget, a bumped contract version and a changed hash', () => {
    const db = tempDb();
    try {
      const generation = prepared(db.path);
      storeRow(db.path, {
        objective: 'pri',
        generation,
        status: 'ok',
        resultJson: JSON.stringify(encodeOptimizedResult(solverResult(realPlan()))),
        failureReason: null,
      });

      expect(read(db.path, { ...KEY, budgetMs: 120_000 }).pri).toEqual({ kind: 'miss' });
      expect(read(db.path, { ...KEY, contractVersion: '8+1.0.0' }).pri).toEqual({ kind: 'miss' });
      expect(read(db.path, { ...KEY, inputHash: 'h2' }).pri).toEqual({ kind: 'miss' });
      // And the row is still there — a miss is a miss, not an eviction.
      expect(storedRowCount(db.path)).toBe(1);
    } finally {
      db.cleanup();
    }
  });

  /**
   * 4.3's claim, at the layer that decides it. A `failed` row is readable —
   * that is what makes the marker suppress a re-spawn — but it never reads
   * `ok`, and serving one as a schedule would publish an empty plan as an
   * optimized one.
   */
  it('never lets a failed row satisfy a read, and carries its reason', () => {
    const db = tempDb();
    try {
      const generation = prepared(db.path);
      storeRow(db.path, {
        objective: 'time',
        generation,
        status: 'failed',
        resultJson: null,
        failureReason: 'timeout',
      });

      const outcome = read(db.path).time;

      expect(outcome.kind).toBe('failed');
      if (outcome.kind !== 'failed') throw new Error('unreachable');
      expect(outcome.reason).toBe('timeout');
    } finally {
      db.cleanup();
    }
  });
});

describe('the generation predicate on the read', () => {
  /**
   * 4.6's ABA fence, read-side. Allocation deletes superseded rows, but a read
   * between the allocation and its delete must not serve an answer computed
   * against a plan that no longer exists — so the predicate lives on the read
   * as well as in the eviction, and this case writes the stale row *after* the
   * allocation precisely so no delete can hide the defect.
   */
  it('misses a row from an older generation and leaves it in place', () => {
    const db = tempDb();
    try {
      const first = prepared(db.path);
      const second = allocateGeneration(openDrizzle(db.path), 'p-1', CONTRACT, HASH, 2);
      expect(second).toBeGreaterThan(first);

      storeRow(db.path, {
        objective: 'pri',
        generation: first,
        status: 'ok',
        resultJson: JSON.stringify(encodeOptimizedResult(solverResult(realPlan()))),
        failureReason: null,
      });

      expect(read(db.path).pri).toEqual({ kind: 'miss' });
      expect(storedRowCount(db.path)).toBe(1);
    } finally {
      db.cleanup();
    }
  });

  it('serves nothing before the first allocation, however many rows exist', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      seedProject(db.path);
      storeRow(db.path, {
        objective: 'pri',
        generation: 1,
        status: 'ok',
        resultJson: JSON.stringify(encodeOptimizedResult(solverResult(realPlan()))),
        failureReason: null,
      });

      const pair = read(db.path);

      expect(pair.pri).toEqual({ kind: 'miss' });
      expect(pair.time).toEqual({ kind: 'miss' });
      expect(storedRowCount(db.path)).toBe(1);
    } finally {
      db.cleanup();
    }
  });
});

describe('a payload the decoder refuses', () => {
  /**
   * 4.8's rule, and the one that had to be argued for rather than implemented:
   * the row is **left in place**. Deleting it and reporting a miss turns
   * corruption into a read-triggered solve — the timer retry Dany rejected,
   * arriving through the cache instead of the clock — and destroys the evidence
   * at the moment it is found.
   */
  const survives = (path: string, outcome: CachedOutcome, matching: RegExp): void => {
    expect(outcome.kind).toBe('corrupt');
    if (outcome.kind !== 'corrupt') throw new Error('unreachable');
    expect(outcome.reason).toMatch(matching);
    expect(storedRowCount(path)).toBe(1);
  };

  it('reads a truncated payload as corrupt and keeps the row', () => {
    const db = tempDb();
    try {
      const generation = prepared(db.path);
      const whole = JSON.stringify(encodeOptimizedResult(solverResult(realPlan())));
      storeRow(db.path, {
        objective: 'pri',
        generation,
        status: 'ok',
        resultJson: whole.slice(0, Math.floor(whole.length / 2)),
        failureReason: null,
      });

      survives(db.path, read(db.path).pri, /JSON|Unexpected|parse/i);
    } finally {
      db.cleanup();
    }
  });

  it('reads a wrong dtoVersion as corrupt and keeps the row', () => {
    const db = tempDb();
    try {
      const generation = prepared(db.path);
      const stored = encodeOptimizedResult(solverResult(realPlan()));
      storeRow(db.path, {
        objective: 'pri',
        generation,
        status: 'ok',
        resultJson: JSON.stringify({ ...stored, dtoVersion: RESULT_DTO_VERSION + 1 }),
        failureReason: null,
      });

      survives(db.path, read(db.path).pri, /dtoVersion/);
    } finally {
      db.cleanup();
    }
  });

  /**
   * The `CHECK` forbids this row, so only a database written before the
   * constraint existed can hold it — which is the same provenance argument the
   * 3.8 boundary is built on. It reads `corrupt` rather than throwing because a
   * throw here would wedge the plan read for **both** objectives on one bad
   * row, which is the outcome `corrupt` exists to prevent.
   */
  it('reads an ok row with no payload as corrupt rather than throwing', () => {
    const db = tempDb();
    try {
      const generation = prepared(db.path);
      const raw = openDatabase(db.path);
      try {
        raw.run('PRAGMA ignore_check_constraints = ON');
        raw.run(
          `INSERT INTO optimized_schedule_cache
             (project_id, input_hash, objective, contract_version, budget_ms,
              generation, status, result_json, failure_reason, created_at)
           VALUES ('p-1', '${HASH}', 'pri', '${CONTRACT}', ${String(BUDGET)}, ${String(generation)},
                   'ok', NULL, NULL, 7)`,
        );
      } finally {
        raw.close();
      }

      survives(db.path, read(db.path).pri, /no result_json/);
    } finally {
      db.cleanup();
    }
  });
});

describe('a plan-infeasible row, as far as its codec exists', () => {
  /**
   * Assumption A1 (schema.ts) reuses `result_json` for the infeasibility
   * certificate, and says a payload that fails to decode reads `corrupt` on
   * exactly the rule an `ok` row obeys. `decodePlanInfeasible` belongs to the
   * failure path and does not exist yet, so what is asserted here is the half
   * A1 fixes and this layer can honestly check — the versioned envelope.
   *
   * **What falsifies the split:** a certificate whose offending-item list is
   * malformed reads `plan-infeasible` today. Once the codec lands it must read
   * `corrupt`, and the change is to `decodePayload`, not to any caller.
   */
  it('reads a versioned certificate as plan-infeasible and hands it over whole', () => {
    const db = tempDb();
    try {
      const generation = prepared(db.path);
      const certificate = { dtoVersion: 1, items: [{ workItemId: 'a', deadline: 10 }] };
      storeRow(db.path, {
        objective: 'time',
        generation,
        status: 'plan-infeasible',
        resultJson: JSON.stringify(certificate),
        failureReason: null,
      });

      const outcome = read(db.path).time;

      expect(outcome.kind).toBe('plan-infeasible');
      if (outcome.kind !== 'plan-infeasible') throw new Error('unreachable');
      expect(outcome.certificate).toEqual(certificate);
    } finally {
      db.cleanup();
    }
  });

  it('reads an unversioned certificate as corrupt and keeps the row', () => {
    const db = tempDb();
    try {
      const generation = prepared(db.path);
      storeRow(db.path, {
        objective: 'time',
        generation,
        status: 'plan-infeasible',
        resultJson: JSON.stringify({ items: [] }),
        failureReason: null,
      });

      const outcome = read(db.path).time;

      expect(outcome.kind).toBe('corrupt');
      if (outcome.kind !== 'corrupt') throw new Error('unreachable');
      expect(outcome.reason).toMatch(/dtoVersion/);
      expect(storedRowCount(db.path)).toBe(1);
    } finally {
      db.cleanup();
    }
  });
});

describe('the 3.8 boundary still throws on the read path', () => {
  /**
   * 4.8's first half. An unknown *enum value* is not a corrupt payload: there
   * is no honest answer to a question about a token this release has never
   * heard of, so the read throws naming the column and the value, exactly as
   * `toProject` does. The distinction from `corrupt` is the point — one is an
   * absent payload, the other an unrecognised vocabulary.
   */
  it('throws naming the column when a stored objective is unknown', () => {
    const db = tempDb();
    try {
      const generation = prepared(db.path);
      const raw = openDatabase(db.path);
      try {
        raw.run('PRAGMA ignore_check_constraints = ON');
        raw.run(
          `INSERT INTO optimized_schedule_cache
             (project_id, input_hash, objective, contract_version, budget_ms,
              generation, status, result_json, failure_reason, created_at)
           VALUES ('p-1', '${HASH}', 'cost', '${CONTRACT}', ${String(BUDGET)}, ${String(generation)},
                   'failed', NULL, 'timeout', 7)`,
        );
      } finally {
        raw.close();
      }

      expect(() => read(db.path)).toThrow(/optimized_schedule_cache\.objective.*cost/);
    } finally {
      db.cleanup();
    }
  });

  it('leaves the drizzle-typed insert path working for a well-formed row', () => {
    const db = tempDb();
    try {
      const generation = prepared(db.path);
      openDrizzle(db.path)
        .insert(optimizedScheduleCache)
        .values({
          projectId: 'p-1',
          inputHash: HASH,
          objective: 'pri',
          contractVersion: CONTRACT,
          budgetMs: BUDGET,
          generation,
          status: 'failed',
          resultJson: null,
          failureReason: 'oom',
          createdAt: 7,
        })
        .run();

      const outcome = read(db.path).pri;

      expect(outcome.kind).toBe('failed');
      if (outcome.kind !== 'failed') throw new Error('unreachable');
      expect(outcome.reason).toBe('oom');
    } finally {
      db.cleanup();
    }
  });
});

describe("the writer's own slot, which is 4.1's first condition", () => {
  /**
   * The fence that is not implied by the row existing. A reclaimed owner
   * re-reserving the same seat has the same primary key and the same `ownerId`;
   * only the freshly minted token tells the two attempts apart, and it is what
   * keeps a late write from a reclaimed child out of the cache.
   */
  const CLAIM = {
    projectId: 'p-1',
    contractVersion: CONTRACT,
    generation: 1,
    objective: 'pri',
    budgetMs: BUDGET,
    ownerId: 'coordinator-a',
    attemptToken: 'tok-1',
  } as const;

  function reserve(
    path: string,
    generation: number,
    over: { ownerId?: string; attemptToken?: string; lifecycle?: string } = {},
  ): void {
    const db = openDatabase(path);
    try {
      db.run(
        `INSERT INTO solver_slot
           (project_id, contract_version, generation, objective, budget_ms,
            owner_id, attempt_token, lifecycle, pid, started_at, heartbeat_at,
            cancel_requested_at, admitted_deadline_at)
         VALUES ('p-1', '${CONTRACT}', ${String(generation)}, 'pri', ${String(BUDGET)},
                 '${over.ownerId ?? CLAIM.ownerId}', '${over.attemptToken ?? CLAIM.attemptToken}',
                 '${over.lifecycle ?? 'running'}', 4242, 1, 1, NULL, 99)`,
      );
    } finally {
      db.close();
    }
  }

  const holds = (path: string, claim = CLAIM): boolean =>
    writerStillHolds(openDrizzle(path), claim);

  it('holds when the seat carries this attempt', () => {
    const db = tempDb();
    try {
      prepared(db.path);
      reserve(db.path, 1);

      expect(holds(db.path)).toBe(true);
    } finally {
      db.cleanup();
    }
  });

  it('does not hold when the seat is empty', () => {
    const db = tempDb();
    try {
      prepared(db.path);

      expect(holds(db.path)).toBe(false);
    } finally {
      db.cleanup();
    }
  });

  /**
   * The case the token exists for, and the one a row-existence check passes:
   * same project, same seat, same coordinator, second attempt.
   */
  it('does not hold when the same owner has re-reserved the seat', () => {
    const db = tempDb();
    try {
      prepared(db.path);
      reserve(db.path, 1, { attemptToken: 'tok-2' });

      expect(holds(db.path)).toBe(false);
    } finally {
      db.cleanup();
    }
  });

  it('does not hold when another coordinator took the seat with this token', () => {
    const db = tempDb();
    try {
      prepared(db.path);
      reserve(db.path, 1, { ownerId: 'coordinator-b' });

      expect(holds(db.path)).toBe(false);
    } finally {
      db.cleanup();
    }
  });

  /** A different generation is a different seat, not the same one moved on. */
  it('does not hold against a slot reserved under another generation', () => {
    const db = tempDb();
    try {
      prepared(db.path);
      reserve(db.path, 2);

      expect(holds(db.path)).toBe(false);
    } finally {
      db.cleanup();
    }
  });

  /**
   * `starting` is a real reservation whose process has not been forked yet, so
   * it authorizes a write. Requiring `running` would refuse a legitimate commit
   * from a child that finished before its lifecycle row was advanced.
   */
  it('holds on a starting slot, because a reservation is not a process', () => {
    const db = tempDb();
    try {
      prepared(db.path);
      const raw = openDatabase(db.path);
      try {
        raw.run(
          `INSERT INTO solver_slot
             (project_id, contract_version, generation, objective, budget_ms,
              owner_id, attempt_token, lifecycle, pid, started_at, heartbeat_at,
              cancel_requested_at, admitted_deadline_at)
           VALUES ('p-1', '${CONTRACT}', 1, 'pri', ${String(BUDGET)},
                   '${CLAIM.ownerId}', '${CLAIM.attemptToken}', 'starting', NULL, 1, 1, NULL, 99)`,
        );
      } finally {
        raw.close();
      }

      expect(holds(db.path)).toBe(true);
    } finally {
      db.cleanup();
    }
  });

  /** 3.8 again: a corrupted slot row must not silently authorize a write. */
  it('throws naming the column when the slot lifecycle is unknown', () => {
    const db = tempDb();
    try {
      prepared(db.path);
      const raw = openDatabase(db.path);
      try {
        raw.run('PRAGMA ignore_check_constraints = ON');
        raw.run(
          `INSERT INTO solver_slot
             (project_id, contract_version, generation, objective, budget_ms,
              owner_id, attempt_token, lifecycle, pid, started_at, heartbeat_at,
              cancel_requested_at, admitted_deadline_at)
           VALUES ('p-1', '${CONTRACT}', 1, 'pri', ${String(BUDGET)},
                   '${CLAIM.ownerId}', '${CLAIM.attemptToken}', 'wedged', 1, 1, 1, NULL, 99)`,
        );
      } finally {
        raw.close();
      }

      expect(() => holds(db.path)).toThrow(/solver_slot\.lifecycle.*wedged/);
    } finally {
      db.cleanup();
    }
  });
});

describe("the generation the attempt was admitted under, which is 4.1's second and third conditions", () => {
  const ADMITTED: AdmissionClaim = {
    projectId: 'p-1',
    contractVersion: CONTRACT,
    generation: 1,
    admittedCancelEpoch: 0,
  };

  const current = (path: string, claim = ADMITTED): boolean =>
    admissionStillCurrent(openDrizzle(path), claim);

  function bumpCancelEpoch(path: string): void {
    const db = openDatabase(path);
    try {
      db.run(
        `UPDATE optimization_generation SET cancel_epoch = cancel_epoch + 1
         WHERE project_id = 'p-1' AND contract_version = '${CONTRACT}'`,
      );
    } finally {
      db.close();
    }
  }

  it('is current for the generation just allocated', () => {
    const db = tempDb();
    try {
      const generation = prepared(db.path);

      expect(current(db.path, { ...ADMITTED, generation })).toBe(true);
    } finally {
      db.cleanup();
    }
  });

  it('is not current once a new generation has been allocated', () => {
    const db = tempDb();
    try {
      const first = prepared(db.path);
      allocateGeneration(openDrizzle(db.path), 'p-1', CONTRACT, 'h2', 2);

      expect(current(db.path, { ...ADMITTED, generation: first })).toBe(false);
    } finally {
      db.cleanup();
    }
  });

  /**
   * The cancel a generation bump cannot stand in for: the plan did not change,
   * so `generation` is untouched, and only the epoch says the run was cancelled.
   */
  it('is not current once the cancel epoch has moved under an unchanged generation', () => {
    const db = tempDb();
    try {
      const generation = prepared(db.path);
      bumpCancelEpoch(db.path);

      expect(current(db.path, { ...ADMITTED, generation })).toBe(false);
    } finally {
      db.cleanup();
    }
  });

  it('is not current when there is no generation row at all', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      seedProject(db.path);

      expect(current(db.path)).toBe(false);
    } finally {
      db.cleanup();
    }
  });

  /** Blue and green each own their row, so green's allocation is not blue's. */
  it("is unaffected by another contract version's allocation", () => {
    const db = tempDb();
    try {
      const generation = prepared(db.path);
      allocateGeneration(openDrizzle(db.path), 'p-1', '8+1.0.0', 'h1', 2);

      expect(current(db.path, { ...ADMITTED, generation })).toBe(true);
    } finally {
      db.cleanup();
    }
  });

  /**
   * `draining` admits no new work; it does not discard a solve already admitted
   * and still holding its slot. Refusing that commit would throw the completed
   * work away and leave the key with no outcome at all.
   */
  it('stays current while the generation is draining', () => {
    const db = tempDb();
    try {
      const generation = prepared(db.path);
      const raw = openDatabase(db.path);
      try {
        raw.run(
          `UPDATE optimization_generation SET admission_state = 'draining'
           WHERE project_id = 'p-1' AND contract_version = '${CONTRACT}'`,
        );
      } finally {
        raw.close();
      }

      expect(current(db.path, { ...ADMITTED, generation })).toBe(true);
    } finally {
      db.cleanup();
    }
  });
});

describe("4.1's conditional write, with all four conditions composed", () => {
  const CLAIM = {
    projectId: 'p-1',
    contractVersion: CONTRACT,
    generation: 1,
    objective: 'pri',
    budgetMs: BUDGET,
    ownerId: 'coordinator-a',
    attemptToken: 'tok-1',
  } as const;

  /** The seat the writer holds, exactly as the coordinator reserves it. */
  function reserve(path: string, over: { attemptToken?: string } = {}): void {
    const db = openDatabase(path);
    try {
      db.run(
        `INSERT INTO solver_slot
           (project_id, contract_version, generation, objective, budget_ms,
            owner_id, attempt_token, lifecycle, pid, started_at, heartbeat_at,
            cancel_requested_at, admitted_deadline_at)
         VALUES ('p-1', '${CONTRACT}', 1, 'pri', ${String(BUDGET)},
                 '${CLAIM.ownerId}', '${over.attemptToken ?? CLAIM.attemptToken}',
                 'running', 4242, 1, 1, NULL, 99)`,
      );
    } finally {
      db.close();
    }
  }

  function setEnabled(path: string, enabled: 0 | 1): void {
    const db = openDatabase(path);
    try {
      db.run(`UPDATE project SET optimization_enabled = ${String(enabled)} WHERE id = 'p-1'`);
    } finally {
      db.close();
    }
  }

  function bumpCancelEpoch(path: string): void {
    const db = openDatabase(path);
    try {
      db.run(
        `UPDATE optimization_generation SET cancel_epoch = cancel_epoch + 1
         WHERE project_id = 'p-1' AND contract_version = '${CONTRACT}'`,
      );
    } finally {
      db.close();
    }
  }

  /**
   * A prepared database with one allocated generation, the seat reserved and
   * the project switched on — the state a legitimate commit starts from.
   */
  function admitted(path: string): number {
    const generation = prepared(path);
    reserve(path);
    setEnabled(path, 1);
    return generation;
  }

  function commit(
    path: string,
    outcome: OutcomeToStore,
    over: { attemptToken?: string; generation?: number; admittedCancelEpoch?: number } = {},
  ): OutcomeWriteResult {
    return storeOptimizedOutcome(openDrizzle(path), {
      claim: {
        ...CLAIM,
        attemptToken: over.attemptToken ?? CLAIM.attemptToken,
        generation: over.generation ?? CLAIM.generation,
      },
      inputHash: HASH,
      admittedCancelEpoch: over.admittedCancelEpoch ?? 0,
      outcome,
      now: 1_700,
    });
  }

  it('stores an ok row the pair read serves back whole', () => {
    const db = tempDb();
    try {
      admitted(db.path);
      const plan = realPlan();
      // Load-bearing: over an empty plan the schedule assertion below is vacuous.
      expect(plan.slices.size).toBe(3);
      const source = solverResult(plan);

      expect(commit(db.path, { kind: 'ok', result: source })).toBe('stored');

      const pair = read(db.path);
      expect(pair.time.kind).toBe('miss');
      expect(pair.pri.kind).toBe('ok');
      if (pair.pri.kind !== 'ok') throw new Error('unreachable');
      expect(pair.pri.result.objectiveValues).toEqual(source.objectiveValues);
      expect(pair.pri.result.schedule).toEqual(plan);
      expect(pair.pri.generation).toBe(1);
      expect(pair.pri.createdAt).toBe(1_700);
    } finally {
      db.cleanup();
    }
  });

  it('stores a failed row carrying its reason and no payload', () => {
    const db = tempDb();
    try {
      admitted(db.path);

      expect(commit(db.path, { kind: 'failed', reason: 'timeout' })).toBe('stored');

      const pair = read(db.path);
      expect(pair.pri.kind).toBe('failed');
      if (pair.pri.kind !== 'failed') throw new Error('unreachable');
      expect(pair.pri.reason).toBe('timeout');
    } finally {
      db.cleanup();
    }
  });

  /**
   * The condition the token exists for: the seat was reclaimed and re-reserved
   * by a second attempt, so this writer's own token is no longer in it.
   */
  it('refuses a writer whose seat carries a newer attempt, and stores nothing', () => {
    const db = tempDb();
    try {
      admitted(db.path);
      const reclaimed = openDatabase(db.path);
      try {
        reclaimed.run(`UPDATE solver_slot SET attempt_token = 'tok-2' WHERE project_id = 'p-1'`);
      } finally {
        reclaimed.close();
      }

      expect(commit(db.path, { kind: 'failed', reason: 'timeout' })).toBe('superseded');
      expect(storedRowCount(db.path)).toBe(0);
    } finally {
      db.cleanup();
    }
  });

  it('refuses a writer whose generation has been superseded, and stores nothing', () => {
    const db = tempDb();
    try {
      admitted(db.path);
      allocateGeneration(openDrizzle(db.path), 'p-1', CONTRACT, 'h2', 2);

      expect(commit(db.path, { kind: 'failed', reason: 'timeout' })).toBe('superseded');
      expect(storedRowCount(db.path)).toBe(0);
    } finally {
      db.cleanup();
    }
  });

  it('refuses a writer admitted under an older cancel epoch, and stores nothing', () => {
    const db = tempDb();
    try {
      admitted(db.path);
      bumpCancelEpoch(db.path);

      expect(commit(db.path, { kind: 'failed', reason: 'timeout' })).toBe('superseded');
      expect(storedRowCount(db.path)).toBe(0);
    } finally {
      db.cleanup();
    }
  });

  /**
   * The fourth predicate, and the one no other fence covers: admission
   * happened while the project was on, and the owner switched it off while the
   * solve was still running. Every other condition still holds here — same
   * seat, same token, same generation, same cancel epoch.
   */
  it('refuses a commit against a project whose optimizer was switched off mid-solve', () => {
    const db = tempDb();
    try {
      admitted(db.path);
      setEnabled(db.path, 0);

      expect(commit(db.path, { kind: 'ok', result: solverResult(realPlan()) })).toBe('superseded');
      expect(storedRowCount(db.path)).toBe(0);
    } finally {
      db.cleanup();
    }
  });

  /** The default every existing project already carries, never turned on. */
  it('refuses a commit against a project that was never switched on', () => {
    const db = tempDb();
    try {
      prepared(db.path);
      reserve(db.path);

      expect(commit(db.path, { kind: 'failed', reason: 'timeout' })).toBe('superseded');
      expect(storedRowCount(db.path)).toBe(0);
    } finally {
      db.cleanup();
    }
  });

  /**
   * 4.1's headline sentence: a superseded run cannot overwrite an `ok` with a
   * `failed`. The primary key omits `generation`, so the two collide by
   * construction and the insert is conditional rather than an upsert.
   */
  it('does not overwrite a stored ok with a failed for the same key', () => {
    const db = tempDb();
    try {
      admitted(db.path);
      const source = solverResult(realPlan());
      expect(commit(db.path, { kind: 'ok', result: source })).toBe('stored');

      expect(commit(db.path, { kind: 'failed', reason: 'timeout' })).toBe('already-recorded');

      expect(storedRowCount(db.path)).toBe(1);
      const pair = read(db.path);
      expect(pair.pri.kind).toBe('ok');
      if (pair.pri.kind !== 'ok') throw new Error('unreachable');
      expect(pair.pri.createdAt).toBe(1_700);
    } finally {
      db.cleanup();
    }
  });
});

describe("4.1b's retention bound, which is a bound and not an exclusion", () => {
  const CLAIM = {
    projectId: 'p-1',
    contractVersion: CONTRACT,
    generation: 1,
    objective: 'pri',
    budgetMs: BUDGET,
    ownerId: 'coordinator-a',
    attemptToken: 'tok-1',
  } as const;

  /** One seat per budget, because the slot's primary key carries `budgetMs`. */
  function reserve(path: string, budgetMs: number, contractVersion = CONTRACT): void {
    const db = openDatabase(path);
    try {
      db.run(
        `INSERT INTO solver_slot
           (project_id, contract_version, generation, objective, budget_ms,
            owner_id, attempt_token, lifecycle, pid, started_at, heartbeat_at,
            cancel_requested_at, admitted_deadline_at)
         VALUES ('p-1', '${contractVersion}', 1, 'pri', ${String(budgetMs)},
                 'coordinator-a', 'tok-1', 'running', 4242, 1, 1, NULL, 99)`,
      );
    } finally {
      db.close();
    }
  }

  function enable(path: string): void {
    const db = openDatabase(path);
    try {
      db.run(`UPDATE project SET optimization_enabled = 1 WHERE id = 'p-1'`);
    } finally {
      db.close();
    }
  }

  function commit(
    path: string,
    budgetMs: number,
    now: number,
    contractVersion = CONTRACT,
  ): OutcomeWriteResult {
    return storeOptimizedOutcome(openDrizzle(path), {
      claim: { ...CLAIM, budgetMs, contractVersion },
      inputHash: HASH,
      admittedCancelEpoch: 0,
      outcome: { kind: 'failed', reason: 'timeout' },
      now,
    });
  }

  /** Every stored `(contract_version, budget_ms)` for the one objective. */
  function liveBudgets(path: string): { contract: string; budget: number }[] {
    const db = openDatabase(path);
    try {
      return (
        db
          .query(
            `SELECT contract_version AS contract, budget_ms AS budget
               FROM optimized_schedule_cache WHERE objective = 'pri'
              ORDER BY contract_version, budget_ms`,
          )
          .all() as { contract: string; budget: number }[]
      ).map((row) => ({ contract: row.contract, budget: row.budget }));
    } finally {
      db.close();
    }
  }

  /**
   * 4.1b proof (a): raise `budgetMs` three times and bump `contractVersion`
   * with no plan edit at all — same project, same objective, same input hash —
   * and at most two rows survive per project per objective per live contract
   * version. The bound is per contract version, so the bumped release's own
   * row is *not* evicted by the old one's: that is the blue/green half.
   */
  it('keeps two budgets per live contract version and evicts the oldest', () => {
    const db = tempDb();
    try {
      prepared(db.path);
      enable(db.path);

      for (const [budget, at] of [
        [60_000, 10],
        [90_000, 20],
        [120_000, 30],
      ] as const) {
        reserve(db.path, budget);
        expect(commit(db.path, budget, at)).toBe('stored');
      }

      // The bumped release, sharing the file and the plan.
      const green = '8+1.0.0';
      allocateGeneration(openDrizzle(db.path), 'p-1', green, HASH, 40);
      reserve(db.path, 60_000, green);
      expect(commit(db.path, 60_000, 50, green)).toBe('stored');

      // Ordered by `contract_version` then `budget_ms`, so blue's two rows
      // come first: '7+1.0.0' sorts before '8+1.0.0'.
      expect(liveBudgets(db.path)).toEqual([
        { contract: CONTRACT, budget: 90_000 },
        { contract: CONTRACT, budget: 120_000 },
        { contract: green, budget: 60_000 },
      ]);
    } finally {
      db.cleanup();
    }
  });

  /**
   * The livelock the exclusive rule caused, as the state that used to be
   * impossible: two budgets under ONE contract version both survive, so
   * neither release deletes the other's row and neither re-solves.
   */
  it('lets two releases reading different budgets keep a row each', () => {
    const db = tempDb();
    try {
      prepared(db.path);
      enable(db.path);
      reserve(db.path, 60_000);
      expect(commit(db.path, 60_000, 10)).toBe('stored');
      reserve(db.path, 120_000);
      expect(commit(db.path, 120_000, 20)).toBe('stored');

      expect(liveBudgets(db.path)).toEqual([
        { contract: CONTRACT, budget: 60_000 },
        { contract: CONTRACT, budget: 120_000 },
      ]);
      // And both are servable, which is what makes the spawn count stop rising.
      expect(read(db.path, { ...KEY, budgetMs: 60_000 }).pri.kind).toBe('failed');
      expect(read(db.path, { ...KEY, budgetMs: 120_000 }).pri.kind).toBe('failed');
    } finally {
      db.cleanup();
    }
  });
});
