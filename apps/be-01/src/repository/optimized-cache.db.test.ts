import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  encodeOptimizedResult,
  type OptimizedResult,
  RESULT_DTO_VERSION,
} from '@wbs/contracts/solver/optimized-result';
import { type PlannedRow, schedule, type Schedule, type Slice } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { runMigrations } from './migrate';
import { allocateGeneration } from './optimization-generation';
import {
  type CachedOutcome,
  type OptimizedCacheKey,
  type OptimizedPair,
  readOptimizedPair,
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
               ${quote(values.contractVersion ?? CONTRACT)}, ${values.budgetMs ?? BUDGET},
               ${values.generation}, '${values.status}', ${quote(values.resultJson)},
               ${quote(values.failureReason)}, 7)`,
    );
  } finally {
    db.close();
  }
}

function storedRowCount(path: string): number {
  const db = openDatabase(path);
  try {
    return (
      db.query('SELECT COUNT(*) AS n FROM optimized_schedule_cache').get() as { n: number }
    ).n;
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
           VALUES ('p-1', '${HASH}', 'pri', '${CONTRACT}', ${BUDGET}, ${generation},
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
           VALUES ('p-1', '${HASH}', 'cost', '${CONTRACT}', ${BUDGET}, ${generation},
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
