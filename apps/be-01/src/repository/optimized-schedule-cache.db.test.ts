import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  decodeSchedule,
  encodeSchedule,
  type PlannedRow,
  type Schedule,
  schedule,
  type Slice,
  sliceKey,
} from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { runMigrations } from './migrate';
import { readMigrationFolders, rollbackTo } from './migrate-down';
import { toOptimizedScheduleCacheRow } from './optimizer-rows';
import { optimizedScheduleCache } from './schema';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

/** The migration under test, and the newest in the folder. */
const OPTIMIZER_TABLES = '20260904100000_add_optimizer_tables';
/** The one below it, which is where every rollback here stops. */
const LOOKUP_INDEXES = '20260902120000_add_lookup_indexes';

/**
 * What `20260904100000_add_optimizer_tables` adds, enumerated rather than
 * counted (tasks.md 3.7, Fable r14 Important 1).
 *
 * "Three companion tables" beside the cache is the phrase a `down.sql` gets
 * built from, and an implementer working from a three-item list ships a
 * rollback that strands one table — the aborted blue/green deploy this proof
 * exists to prevent. So the count is four, and the list is written out.
 */
const ADDED_TABLES = [
  'optimization_generation',
  'optimized_schedule_cache',
  'solver_queue',
  'solver_slot',
] as const;

const ADDED_INDEX = 'solver_queue_dequeue_order';
const ADDED_PROJECT_COLUMN = 'optimization_delete_pending_at';

function tempDb(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'wbs-optimizer-cache-'));
  return {
    path: join(dir, 'test.db'),
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function tables(path: string): string[] {
  const db = openDatabase(path);
  try {
    return db
      .query(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all()
      .map((row) => (row as { name: string }).name);
  } finally {
    db.close();
  }
}

function indexes(path: string): string[] {
  const db = openDatabase(path);
  try {
    return db
      .query(`SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name`)
      .all()
      .map((row) => (row as { name: string }).name);
  } finally {
    db.close();
  }
}

function projectColumns(path: string): string[] {
  const db = openDatabase(path);
  try {
    return db
      .query('PRAGMA table_info(project)')
      .all()
      .map((row) => (row as { name: string }).name);
  } finally {
    db.close();
  }
}

/** Runs one statement and answers the error message, or null when it succeeded. */
function refusal(path: string, sql: string): string | null {
  const db = openDatabase(path);
  try {
    db.run(sql);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    db.close();
  }
}

function seedProject(path: string, id: string): void {
  const db = openDatabase(path);
  try {
    db.run(
      `INSERT INTO users (id, username, password_hash, created_at) VALUES ('u-1', 'u', 'h', 1)`,
    );
    db.run(
      `INSERT INTO project (id, name, owner_id, restricted, revision, created_at)
       VALUES ('${id}', 'Rewire the shed', 'u-1', 0, 0, 1)`,
    );
  } finally {
    db.close();
  }
}

function cacheRow(status: string, resultJson: string, failureReason: string): string {
  return `INSERT INTO optimized_schedule_cache
    (project_id, input_hash, objective, contract_version, budget_ms,
     generation, status, result_json, failure_reason, created_at)
    VALUES ('p-1', 'h1', 'pri', '7+1.0.0', 60000, 1, '${status}', ${resultJson}, ${failureReason}, 1)`;
}

describe('the optimizer migration', () => {
  it('creates the four tables, the dequeue index and the project fence', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);

      for (const table of ADDED_TABLES) expect(tables(db.path)).toContain(table);
      expect(indexes(db.path)).toContain(ADDED_INDEX);
      expect(projectColumns(db.path)).toContain(ADDED_PROJECT_COLUMN);
    } finally {
      db.cleanup();
    }
  });

  it('is the newest in the folder, so it heads every rollback', () => {
    expect(readMigrationFolders(FOLDER).at(-1)?.name).toBe(OPTIMIZER_TABLES);
  });

  it('is idempotent on an already-migrated file', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      const before = [...tables(db.path), ...indexes(db.path)];

      // The second run applies nothing: every folder is already stamped, and
      // `CREATE TABLE` without `IF NOT EXISTS` would throw if it ran again.
      runMigrations(db.path, FOLDER);

      expect([...tables(db.path), ...indexes(db.path)]).toEqual(before);
    } finally {
      db.cleanup();
    }
  });

  /**
   * The 3.7 proof, and the reason it enumerates: a `down.sql` written from
   * "three companion tables" leaves one behind, and a table that survived a
   * rollback is a `CREATE TABLE` that throws on the re-apply — the aborted
   * blue/green deploy, reproduced.
   */
  it('rolls back everything it added and leaves every pre-existing table intact', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      const migrated = tables(db.path);

      expect(rollbackTo(db.path, FOLDER, LOOKUP_INDEXES)).toEqual([OPTIMIZER_TABLES]);

      const rolledBack = tables(db.path);
      for (const table of ADDED_TABLES) expect(rolledBack).not.toContain(table);
      expect(indexes(db.path)).not.toContain(ADDED_INDEX);
      expect(projectColumns(db.path)).not.toContain(ADDED_PROJECT_COLUMN);

      // Everything else is untouched: the rollback took exactly the four tables
      // and nothing that was there before them.
      expect(rolledBack).toEqual(migrated.filter((name) => !ADDED_TABLES.includes(name as never)));
    } finally {
      db.cleanup();
    }
  });

  it('re-applies onto the rolled-back file and lands the same schema', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      const first = [...tables(db.path), ...indexes(db.path), ...projectColumns(db.path)];

      rollbackTo(db.path, FOLDER, LOOKUP_INDEXES);
      runMigrations(db.path, FOLDER);

      expect([...tables(db.path), ...indexes(db.path), ...projectColumns(db.path)]).toEqual(first);
    } finally {
      db.cleanup();
    }
  });

  /**
   * The blue/green half: the outgoing release reads and writes `project`
   * knowing nothing about the new column, and the migration must not make its
   * statements invalid. A column-less `INSERT` is exactly what that release
   * runs, and it fails against a `NOT NULL` addition without a default —
   * which is why the fence is nullable.
   */
  it('leaves the outgoing release’s project writes running', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      seedProject(db.path, 'p-1');

      const read = openDatabase(db.path);
      try {
        expect(read.query(`SELECT id FROM project WHERE id = 'p-1'`).all()).toHaveLength(1);
      } finally {
        read.close();
      }
    } finally {
      db.cleanup();
    }
  });
});

describe('what the cache table refuses', () => {
  /**
   * SQLite text columns otherwise hold any combination a past bug wrote, so
   * each of these is the database refusing rather than the code remembering to
   * check (tasks.md 3.5).
   *
   * Proof: with `CONSTRAINT optimized_schedule_cache_payload` removed from
   * `20260904100000_add_optimizer_tables/migration.sql`, the first two cases
   * below accept their row and the `toContain('CHECK')` assertion fails
   * (2026-09-04).
   */
  it('refuses an ok row with no result and a failed row with one', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      seedProject(db.path, 'p-1');

      expect(refusal(db.path, cacheRow('ok', 'NULL', 'NULL'))).toContain('CHECK');
      expect(refusal(db.path, cacheRow('failed', `'{}'`, `'timeout'`))).toContain('CHECK');
      expect(refusal(db.path, cacheRow('failed', 'NULL', 'NULL'))).toContain('CHECK');
      expect(refusal(db.path, cacheRow('plan-infeasible', 'NULL', 'NULL'))).toContain('CHECK');
    } finally {
      db.cleanup();
    }
  });

  it('accepts the three well-formed shapes', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      seedProject(db.path, 'p-1');

      expect(refusal(db.path, cacheRow('ok', `'{"dtoVersion":1}'`, 'NULL'))).toBeNull();
      expect(
        refusal(db.path, cacheRow('failed', 'NULL', `'timeout'`).replace(`'h1'`, `'h2'`)),
      ).toBeNull();
      expect(
        refusal(
          db.path,
          cacheRow('plan-infeasible', `'{"dtoVersion":1,"items":[]}'`, 'NULL').replace(
            `'h1'`,
            `'h3'`,
          ),
        ),
      ).toBeNull();
    } finally {
      db.cleanup();
    }
  });

  it('refuses an unknown objective, status and failure reason', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      seedProject(db.path, 'p-1');

      expect(refusal(db.path, cacheRow('ok', `'{}'`, 'NULL').replace(`'pri'`, `'prio'`))).toContain(
        'CHECK',
      );
      expect(refusal(db.path, cacheRow('done', `'{}'`, 'NULL'))).toContain('CHECK');
      expect(refusal(db.path, cacheRow('failed', 'NULL', `'exploded'`))).toContain('CHECK');
    } finally {
      db.cleanup();
    }
  });

  it('takes its rows with the project, by the cascade and nothing else', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      seedProject(db.path, 'p-1');
      expect(refusal(db.path, cacheRow('ok', `'{"dtoVersion":1}'`, 'NULL'))).toBeNull();

      const db2 = openDatabase(db.path);
      try {
        db2.run(`DELETE FROM project WHERE id = 'p-1'`);
        expect(db2.query(`SELECT project_id FROM optimized_schedule_cache`).all()).toHaveLength(0);
      } finally {
        db2.close();
      }
    } finally {
      db.cleanup();
    }
  });
});

describe('a plan through the column it is stored in', () => {
  /**
   * tasks.md 4.12's watched red, the half `libs/domain`'s own cases cannot
   * reach: a **non-empty** plan out of the real engine, into
   * `optimized_schedule_cache.result_json`, and back through the repository's
   * read boundary.
   *
   * `schedule-cache-dto.test.ts` proves the codec against
   * `JSON.parse(JSON.stringify(...))`, which is the encoding. This proves the
   * **column**: SQLite's TEXT affinity, the row's `CHECK`s, and
   * {@link toOptimizedScheduleCacheRow} standing between the stored row and the
   * decode. The two are not the same claim — a payload that survives a string
   * round trip can still be refused by a constraint, truncated by a column, or
   * lost by a mapper that drops the field it does not name.
   */
  const DEV = 'step-dev';
  const PLATFORM = 'team-platform';

  /** Three two-day blocks in a pool of one, so the plan has real waits in it. */
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
      stepId: DEV,
      days: 2,
      personId: null,
      width: 1,
      poolIds: [PLATFORM],
    }));
    return schedule(rows, [], slices, new Map(), new Map([[PLATFORM, 1]]));
  }

  function storeAndRead(path: string, resultJson: string): Schedule {
    const db = openDrizzle(path);
    db.insert(optimizedScheduleCache)
      .values({
        projectId: 'p-1',
        inputHash: 'h1',
        objective: 'pri',
        contractVersion: '7+1.0.0',
        budgetMs: 60000,
        generation: 1,
        status: 'ok',
        resultJson,
        failureReason: null,
        createdAt: 1,
      })
      .run();
    const stored = db.select().from(optimizedScheduleCache).get();
    if (stored === undefined) throw new Error('broken fixture: nothing stored');
    // Through the 3.8 boundary, not off the raw select: that is where every
    // repository read of this table goes, and a mapper that dropped
    // `resultJson` would otherwise never be noticed by this case.
    const row = toOptimizedScheduleCacheRow(stored);
    if (row.resultJson === null) throw new Error('broken fixture: no payload stored');
    return decodeSchedule(JSON.parse(row.resultJson));
  }

  it('reloads a real plan out of result_json with both maps intact', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      seedProject(db.path, 'p-1');
      const plan = realPlan();

      // Load-bearing: over an empty plan every assertion below is vacuous.
      expect(plan.slices.size).toBe(3);
      expect(plan.waitingForCapacity).toBeGreaterThan(0);
      expect(plan.eventsVisited).toBeGreaterThan(0);

      const reloaded = storeAndRead(db.path, JSON.stringify(encodeSchedule(plan)));

      expect(reloaded).toEqual(plan);
      expect(reloaded.slices.get(sliceKey('a', DEV))).toEqual(plan.slices.get(sliceKey('a', DEV)));
      expect([...reloaded.slices.values()].some((one) => one.boundBy === 'capacity')).toBe(true);
    } finally {
      db.cleanup();
    }
  });

  it('stores a truncated payload without complaint, so the decode is the only guard', () => {
    const db = tempDb();
    try {
      runMigrations(db.path, FOLDER);
      seedProject(db.path, 'p-1');
      const whole = JSON.stringify(encodeSchedule(realPlan()));

      // No `CHECK` covers `result_json`'s contents (4.8), which is deliberate:
      // corruption must surface as `corrupt` on the read and be retryable,
      // rather than failing the write of a solve that already happened.
      expect(() => storeAndRead(db.path, whole.slice(0, whole.length - 20))).toThrow();
      const row = openDatabase(db.path)
        .query(`SELECT length(result_json) AS n FROM optimized_schedule_cache`)
        .get() as { n: number } | null;
      expect(row?.n).toBe(whole.length - 20);
    } finally {
      db.cleanup();
    }
  });
});
