import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { readMigrationFolders, rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const ATTEMPTS = '20261012120000_add_step_node_attempts';
/** The migration below this one, where every rollback here stops. */
const BASELINE = readMigrationFolders(FOLDER)
  .map(({ name }) => name)
  .filter((name) => name < ATTEMPTS)
  .at(-1);
let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-step-node-attempt-migration-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function withDatabase<T>(read: (sqlite: Database) => T): T {
  const sqlite = openDatabase(path);
  try {
    return read(sqlite);
  } finally {
    sqlite.close();
  }
}

/** One leaf with two steps, inserted as the outgoing colour writes them: no timezone named. */
function seed(sqlite: Database): void {
  sqlite.run(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u','owner','x',1)",
  );
  sqlite.run(
    "INSERT INTO project (id, name, owner_id, restricted, estimate_method, revision, created_at) VALUES ('p','Project','u',0,'pert',0,1)",
  );
  sqlite.run(
    "INSERT INTO step (id, project_id, name, position) VALUES ('dev','p','Dev',10),('qa','p','QA',20)",
  );
  sqlite.run(
    "INSERT INTO work_item (id, project_id, position, name, revision) VALUES ('a','p',1,'A',0)",
  );
}

function insertAttempt(
  sqlite: Database,
  attempt: {
    step?: string;
    number: number;
    startedAt?: number;
    endedAt: number | null;
    outcome: string | null;
  },
): void {
  sqlite
    .query(
      `INSERT INTO step_node_attempt (work_item_id, step_id, attempt_number, started_at, ended_at, outcome)
       VALUES ('a', ?1, ?2, ?3, ?4, ?5)`,
    )
    .run(
      attempt.step ?? 'dev',
      attempt.number,
      attempt.startedAt ?? 100,
      attempt.endedAt,
      attempt.outcome,
    );
}

const tableNames = (sqlite: Database) =>
  sqlite
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map(({ name }) => name);

const columnsOfProject = (sqlite: Database) =>
  sqlite
    .query<{ name: string }, []>("SELECT name FROM pragma_table_info('project')")
    .all()
    .map(({ name }) => name);

describe(ATTEMPTS, () => {
  it('applies the table and an old-writer project insert reads UTC', () => {
    withDatabase((sqlite) => {
      seed(sqlite);
      expect(tableNames(sqlite)).toContain('step_node_attempt');
      expect(
        sqlite.query<{ timezone: string }, []>("SELECT timezone FROM project WHERE id = 'p'").get(),
      ).toEqual({ timezone: 'UTC' });
      insertAttempt(sqlite, { number: 1, endedAt: 200, outcome: 'failed' });
      insertAttempt(sqlite, { number: 2, endedAt: null, outcome: null });
      expect(
        sqlite.query('SELECT attempt_number, outcome FROM step_node_attempt ORDER BY 1').all(),
      ).toEqual([
        { attempt_number: 1, outcome: 'failed' },
        { attempt_number: 2, outcome: null },
      ]);
    });
  });

  /**
   * Proof: with `step_node_attempt_running_state` dropped from `migration.sql`,
   * this case failed on `Received function did not throw` at the first
   * `toThrow` — an outcome without an end was stored; watched 2026-10-12.
   */
  it('refuses an outcome without an end and an end without an outcome', () => {
    withDatabase((sqlite) => {
      seed(sqlite);
      expect(() => {
        insertAttempt(sqlite, { number: 1, endedAt: null, outcome: 'failed' });
      }).toThrow('CHECK constraint failed: step_node_attempt_running_state');
      expect(() => {
        insertAttempt(sqlite, { number: 1, endedAt: 200, outcome: null });
      }).toThrow('CHECK constraint failed: step_node_attempt_running_state');
    });
  });

  it('refuses an end before its start, a number below one and an unknown outcome', () => {
    withDatabase((sqlite) => {
      seed(sqlite);
      expect(() => {
        insertAttempt(sqlite, { number: 1, startedAt: 300, endedAt: 200, outcome: 'failed' });
      }).toThrow('CHECK constraint failed: step_node_attempt_order');
      expect(() => {
        insertAttempt(sqlite, { number: 0, endedAt: null, outcome: null });
      }).toThrow('CHECK constraint failed: step_node_attempt_number');
      expect(() => {
        insertAttempt(sqlite, { number: 1, endedAt: 200, outcome: 'abandoned' });
      }).toThrow('CHECK constraint failed: step_node_attempt_outcome');
    });
  });

  it('holds at most one running attempt per node', () => {
    withDatabase((sqlite) => {
      seed(sqlite);
      insertAttempt(sqlite, { number: 1, endedAt: null, outcome: null });
      expect(() => {
        insertAttempt(sqlite, { number: 2, endedAt: null, outcome: null });
      }).toThrow(
        'UNIQUE constraint failed: step_node_attempt.work_item_id, step_node_attempt.step_id',
      );
      // Another node of the same leaf runs on its own.
      insertAttempt(sqlite, { step: 'qa', number: 1, endedAt: null, outcome: null });
    });
  });

  it('rolls back and reapplies over no attempts', () => {
    withDatabase(seed);
    if (BASELINE === undefined) throw new Error('no migration below the attempts');
    expect(rollbackTo(path, FOLDER, BASELINE)).toContain(ATTEMPTS);
    withDatabase((sqlite) => {
      expect(tableNames(sqlite)).not.toContain('step_node_attempt');
      expect(columnsOfProject(sqlite)).not.toContain('timezone');
    });
    runMigrations(path, FOLDER);
    withDatabase((sqlite) => {
      expect(tableNames(sqlite)).toContain('step_node_attempt');
      expect(columnsOfProject(sqlite)).toContain('timezone');
    });
  });

  /**
   * Proof: the three guard statements removed from `down.sql` made this case
   * fail on `Received function did not throw` — the rollback dropped the
   * attempt and its migration record; watched 2026-10-12.
   */
  it('rollback refused over a row, naming the CLI, keeping the row and the record', () => {
    withDatabase((sqlite) => {
      seed(sqlite);
      insertAttempt(sqlite, { number: 1, endedAt: 200, outcome: 'succeeded' });
    });
    if (BASELINE === undefined) throw new Error('no migration below the attempts');
    expect(() => rollbackTo(path, FOLDER, BASELINE)).toThrow(
      'CHECK constraint failed: step node attempts exist: save and remove them with step-node-attempt-rollback-cli.ts',
    );
    expect(() => rollbackTo(path, FOLDER, BASELINE)).toThrow(
      'docs/runbook-prod-deploy.md#step-node-attempt-rollback',
    );
    withDatabase((sqlite) => {
      expect(sqlite.query('SELECT attempt_number FROM step_node_attempt').all()).toEqual([
        { attempt_number: 1 },
      ]);
      expect(
        sqlite
          .query<{ name: string | null }, [string]>(
            'SELECT name FROM __drizzle_migrations WHERE name = ?1',
          )
          .all(ATTEMPTS),
      ).toHaveLength(1);
    });
  });
});
