import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const STEP_CODE = '20260927150000_add_step_code';
/** The step allowance column `add-project-step-estimate-allowances` adds, stamped after {@link STEP_CODE}. */
const STEP_ALLOWANCE = '20260927170000_add_step_allowance';
/** The one below it, which is where every rollback here stops. */
const ORGANIZATION_OWNERSHIP = '20260927130000_add_organization_ownership';
/** The organization activation marker, stamped after this one and so reversed first. */
const ORGANIZATION_ACTIVATION = '20260927180000_add_organization_activation';
/** The legacy bridge, stamped after the marker and so reversed before it. */
const ORGANIZATION_BRIDGE = '20260927190000_add_organization_bridge';
/** The ownership freeze, stamped after the bridge and so reversed first. */
const ORGANIZATION_FROZEN = '20260927200000_freeze_organization_ownership';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-step-code-migration-'));
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

function readStepColumns(): { name: string; notnull: number; dflt_value: string | null }[] {
  return withDatabase((sqlite) =>
    sqlite
      .query<{ name: string; notnull: number; dflt_value: string | null }, []>(
        'SELECT name, "notnull", dflt_value FROM pragma_table_info(\'step\')',
      )
      .all(),
  );
}

function readStepIndexSql(): (string | null)[] {
  return withDatabase((sqlite) =>
    sqlite
      .query<{ sql: string | null }, []>(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'step' ORDER BY name",
      )
      .all()
      .map((row) => row.sql),
  );
}

/**
 * A user and two projects, written as raw SQL because drizzle is the new
 * release: the point of every case here is what an older writer sends.
 */
function seedProjects(sqlite: Database): void {
  sqlite.run(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u', 'owner', 'x', 1)",
  );
  for (const id of ['p', 'q']) {
    sqlite.run(
      'INSERT INTO project (id, name, owner_id, restricted, estimate_method, start_date, revision, created_at)' +
        ` VALUES ('${id}', 'Project ${id}', 'u', 0, 'pert', NULL, 0, 1)`,
    );
  }
}

describe(STEP_CODE, () => {
  it('adds one nullable column with no default and one partial unique index', () => {
    const code = readStepColumns().find((column) => column.name === 'code');
    expect(code).toEqual({ name: 'code', notnull: 0, dflt_value: null });
    expect(readStepIndexSql()).toContain(
      'CREATE UNIQUE INDEX `step_project_code` ON `step` (`project_id`,`code`) WHERE `code` IS NOT NULL',
    );
  });

  it('lets the outgoing release keep inserting steps, which land uncoded', () => {
    // Blue's `INSERT` names the columns it was compiled against, and none of
    // them is `code`: the row must land, and land NULL, which the store reads
    // as the modeled uncoded state until the post-swap backfill.
    withDatabase((sqlite) => {
      seedProjects(sqlite);
      sqlite.run("INSERT INTO step (id, project_id, name) VALUES ('s1', 'p', 'Design')");
      sqlite.run("INSERT INTO step (id, project_id, name) VALUES ('s2', 'p', 'Build')");
      const codes = sqlite
        .query<{ code: string | null }, []>('SELECT code FROM step ORDER BY id')
        .all();
      expect(codes).toEqual([{ code: null }, { code: null }]);
    });
  });

  /**
   * Proof: with `CREATE UNIQUE INDEX` made `CREATE INDEX` in `migration.sql`,
   * this case failed on `Received function did not throw` — the third insert
   * gave a second step in project `p` the code `qa`; watched 2026-09-27.
   */
  it('refuses a code already held in the project, and allows it in another project', () => {
    withDatabase((sqlite) => {
      seedProjects(sqlite);
      sqlite.run("INSERT INTO step (id, project_id, name, code) VALUES ('s1', 'p', 'QA', 'qa')");
      sqlite.run("INSERT INTO step (id, project_id, name, code) VALUES ('s2', 'q', 'QA', 'qa')");
      expect(() =>
        sqlite.run(
          "INSERT INTO step (id, project_id, name, code) VALUES ('s3', 'p', 'Testing', 'qa')",
        ),
      ).toThrow('UNIQUE constraint failed: step.project_id, step.code');
    });
  });

  it('rolls back the index and the column and re-applies onto the rolled-back file', () => {
    withDatabase((sqlite) => {
      seedProjects(sqlite);
      sqlite.run("INSERT INTO step (id, project_id, name, code) VALUES ('s1', 'p', 'Dev', 'dev')");
    });
    const before = readStepColumns().map((column) => column.name);

    expect(rollbackTo(path, FOLDER, ORGANIZATION_OWNERSHIP)).toEqual([
      ORGANIZATION_FROZEN,
      ORGANIZATION_BRIDGE,
      ORGANIZATION_ACTIVATION,
      STEP_ALLOWANCE,
      STEP_CODE,
    ]);

    expect(readStepColumns().map((column) => column.name)).toEqual(
      before.filter(
        (name) => name !== 'code' && name !== 'allowance_bps' && name !== 'allowance_revision',
      ),
    );
    expect(readStepIndexSql().some((sql) => sql?.includes('step_project_code') === true)).toBe(
      false,
    );
    // The step itself stays: what a rollback loses is the code, never the step.
    expect(
      withDatabase((sqlite) => sqlite.query<{ id: string }, []>('SELECT id FROM step').all()),
    ).toEqual([{ id: 's1' }]);

    runMigrations(path, FOLDER);
    expect(readStepColumns().map((column) => column.name)).toEqual(before);
    // Re-applied uncoded, not restored: the backfill derives it again.
    expect(
      withDatabase((sqlite) =>
        sqlite.query<{ code: string | null }, []>('SELECT code FROM step').all(),
      ),
    ).toEqual([{ code: null }]);
  });

  /**
   * The rollback states what it drops rather than tolerating an absent index:
   * a schema missing `step_project_code` is not the one this release made.
   *
   * Proof: with `IF EXISTS` put back on the `DROP INDEX` in `down.sql`, this
   * case fails on `Received function did not throw` — the rollback answered the
   * applied list instead of refusing; watched 2026-09-27.
   */
  it('refuses to roll back a schema whose code index is already gone', () => {
    withDatabase((sqlite) => sqlite.run('DROP INDEX step_project_code'));

    expect(() => rollbackTo(path, FOLDER, ORGANIZATION_OWNERSHIP)).toThrow('step_project_code');
  });
});
