import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { StepMeasureRepository } from './step-measure';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const MIGRATION = '20261023150000_key_step_measure';
const BASELINE = '20261023140000_add_measure';
/** The measure estimates, which reverse first over single-point token trios alone. */
const MEASURE_ESTIMATES = '20261023160000_add_measure_estimate';
const WORK_ITEM_BUDGETS = '20261023170000_add_work_item_budget';
/** This change's two migrations (`wbs-shared-occupancy`), newer still, which reverse first. */
const DIRECTORY_CAPACITY = '20261025100100_add_resource_directory_capacity';
const DIRECTORY_AUDIT = '20261025100000_widen_organization_audit_directory_capacity';

let dir: string;
let path: string;
let db: Database;

/**
 * A store at {@link BASELINE} holding what dev holds: project `p` owned by
 * `org-a`, project `q` owned by nobody, and token estimates, token facts and
 * hours facts on both, written in the old shape with audit columns.
 */
function seedBaseline(): void {
  db.run("INSERT INTO users (id, username, password_hash, created_at) VALUES ('u', 'u', 'x', 1)");
  db.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
  db.run(
    "INSERT INTO project (id, name, owner_id, revision, created_at) VALUES ('p', 'Plan', 'u', 0, 1), ('q', 'Other', 'u', 0, 1)",
  );
  db.run("INSERT INTO project_organization (resource_id, organization_id) VALUES ('p', 'org-a')");
  db.run(
    "INSERT INTO step (id, project_id, name, position) VALUES ('p-dev', 'p', 'Dev', 10), ('p-qa', 'p', 'QA', 20), ('q-dev', 'q', 'Dev', 10)",
  );
  db.run(
    "INSERT INTO work_item (id, project_id, name, position, revision) VALUES ('p-one', 'p', 'One', 1, 0), ('q-one', 'q', 'One', 1, 0)",
  );
  db.run(
    `INSERT INTO step_measure (work_item_id, step_id, metric, value, recorded_at, created_at, updated_at, created_by) VALUES
      ('p-one', 'p-dev', 'token_estimate', 12000, 5, 5, NULL, 'u'),
      ('p-one', 'p-dev', 'token_actual', 15000, 6, 6, 7, 'u'),
      ('p-one', 'p-dev', 'hours_actual', 2.5, 8, 8, NULL, 'u'),
      ('p-one', 'p-qa', 'hours_actual', 0, 9, 9, NULL, NULL),
      ('q-one', 'q-dev', 'token_actual', 300, 10, 10, NULL, 'u')`,
  );
}

interface FactRow {
  work_item_id: string;
  step_id: string;
  metric: string | null;
  value: number;
  recorded_at: number;
  created_at: number | null;
  updated_at: number | null;
  created_by: string | null;
}

const LEGACY_COLUMNS =
  'work_item_id, step_id, metric, value, recorded_at, created_at, updated_at, created_by';

function legacyRows(): FactRow[] {
  return db
    .query<FactRow, []>(
      `SELECT ${LEGACY_COLUMNS} FROM step_measure ORDER BY work_item_id, step_id, metric`,
    )
    .all();
}

function keyOf(workItemId: string, stepId: string, metric: string): string | null {
  const row = db
    .query<{ key: string | null }, [string, string, string]>(
      `SELECT m.key AS key FROM step_measure AS sm LEFT JOIN measure AS m ON m.id = sm.measure_id
       WHERE sm.work_item_id = ? AND sm.step_id = ? AND sm.metric = ?`,
    )
    .get(workItemId, stepId, metric);
  if (row === null) throw new Error(`no ${metric} fact on ${workItemId}/${stepId}`);
  return row.key;
}

function measureId(organizationId: string, key: string): string {
  const row = db
    .query<{ id: string }, [string, string]>(
      'SELECT id FROM measure WHERE organization_id = ? AND key = ?',
    )
    .get(organizationId, key);
  if (row === null) throw new Error(`${organizationId} defines no ${key}`);
  return row.id;
}

/** Applies every migration, steps back to {@link BASELINE}, seeds, and comes forward. */
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-step-measure-key-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  expect(rollbackTo(path, FOLDER, BASELINE)).toEqual([
    DIRECTORY_CAPACITY,
    DIRECTORY_AUDIT,
    WORK_ITEM_BUDGETS,
    MEASURE_ESTIMATES,
    MIGRATION,
  ]);
  db = openDatabase(path);
  seedBaseline();
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function comeForward(): void {
  db.close();
  runMigrations(path, FOLDER);
  db = openDatabase(path);
}

describe(MIGRATION, () => {
  // Proof: with the back-fill made `CASE WHEN 0` in migration.sql, this case
  // read NULL keys for p's token and hours facts; watched 2026-10-23.
  it('keys every existing token and hours fact to its organization’s definition', () => {
    const before = legacyRows();
    comeForward();
    expect(legacyRows()).toEqual(before);
    expect(keyOf('p-one', 'p-dev', 'token_actual')).toBe('tokens');
    expect(keyOf('p-one', 'p-dev', 'hours_actual')).toBe('hours');
    expect(keyOf('p-one', 'p-qa', 'hours_actual')).toBe('hours');
    // The estimate stays unkeyed (slice 3), and so does a fact nobody owns.
    expect(keyOf('p-one', 'p-dev', 'token_estimate')).toBeNull();
    expect(keyOf('q-one', 'q-dev', 'token_actual')).toBeNull();
  });

  it('reads every existing fact back unchanged through the store', async () => {
    comeForward();
    const repo = new StepMeasureRepository(openDrizzle(path), OPEN);
    expect(await repo.listByProject('p')).toEqual([
      { workItemId: 'p-one', stepId: 'p-dev', metric: 'hours_actual', value: 2.5, recordedAt: 8 },
      { workItemId: 'p-one', stepId: 'p-dev', metric: 'token_actual', value: 15000, recordedAt: 6 },
      {
        workItemId: 'p-one',
        stepId: 'p-dev',
        metric: 'token_estimate',
        value: 12000,
        recordedAt: 5,
      },
      { workItemId: 'p-one', stepId: 'p-qa', metric: 'hours_actual', value: 0, recordedAt: 9 },
    ]);
    expect(await repo.listByProject('q')).toEqual([
      { workItemId: 'q-one', stepId: 'q-dev', metric: 'token_actual', value: 300, recordedAt: 10 },
    ]);
  });

  // Proof: with `WHEN 0` on `step_measure_keys_legacy_fact`, this case read a
  // NULL key for the inserted fact; watched 2026-10-23.
  it('keys a fact the outgoing release inserts by metric alone, and takes its upsert', () => {
    comeForward();
    db.run('DELETE FROM step_measure');
    // The outgoing release's statement: no `measure_id`, conflict on the old key.
    const upsert = (value: number) =>
      db.run(
        `INSERT INTO step_measure (work_item_id, step_id, metric, value, recorded_at, created_at, created_by)
         VALUES ('p-one', 'p-dev', 'token_actual', ${String(value)}, 20, 20, 'u')
         ON CONFLICT (work_item_id, step_id, metric) DO UPDATE SET value = excluded.value`,
      );
    upsert(40);
    upsert(41);
    expect(keyOf('p-one', 'p-dev', 'token_actual')).toBe('tokens');
    expect(legacyRows().map(({ metric, value }) => [metric, value])).toEqual([
      ['token_actual', 41],
    ]);
    db.run(
      "INSERT INTO step_measure (work_item_id, step_id, metric, value, recorded_at) VALUES ('p-one', 'p-qa', 'token_estimate', 1, 21)",
    );
    expect(keyOf('p-one', 'p-qa', 'token_estimate')).toBeNull();
  });

  // Proof: with the UPDATE in `project_organization_keys_measure_facts`
  // replaced by `SELECT 1`, this case read NULL for q's fact; watched 2026-10-23.
  it('keys an unowned project’s facts when an organization takes it', () => {
    comeForward();
    db.run("INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)");
    db.run("INSERT INTO project_organization (resource_id, organization_id) VALUES ('q', 'org-b')");
    expect(keyOf('q-one', 'q-dev', 'token_actual')).toBe('tokens');
    const organizationOfKey = db
      .query<{ organization_id: string }, []>(
        "SELECT m.organization_id FROM step_measure AS sm JOIN measure AS m ON m.id = sm.measure_id WHERE sm.work_item_id = 'q-one'",
      )
      .get();
    expect(organizationOfKey).toEqual({ organization_id: 'org-b' });
  });

  // Proof: with `step_measure_measure_key` made a plain index, the second
  // insert stored a second gpu fact; watched 2026-10-23.
  it('holds one fact per definition and step node, and refuses a row naming nothing', () => {
    comeForward();
    db.run(
      `INSERT INTO measure (id, organization_id, key, name, unit, kind, scale, three_point, show_by_default, schedules_work, derived, "order", currency)
       VALUES ('gpu', 'org-a', 'gpu_minutes', 'GPU', 'min', 'duration', 'integer', 1, 0, 0, 0, 6, NULL)`,
    );
    const insertGpu = () =>
      db.run(
        "INSERT INTO step_measure (work_item_id, step_id, measure_id, value, recorded_at) VALUES ('p-one', 'p-dev', 'gpu', 3, 30)",
      );
    insertGpu();
    expect(insertGpu).toThrow('UNIQUE constraint failed');
    expect(() =>
      db.run(
        "INSERT INTO step_measure (work_item_id, step_id, value, recorded_at) VALUES ('p-one', 'p-qa', 3, 30)",
      ),
    ).toThrow('step_measure_addressed');
    expect(() => db.run("DELETE FROM measure WHERE id = 'gpu'")).toThrow(
      'FOREIGN KEY constraint failed',
    );
    expect(measureId('org-a', 'gpu_minutes')).toBe('gpu');
  });

  // Proof: with the guard's count replaced by 0 in down.sql, this case dropped
  // the gpu fact on the narrow table's NOT NULL instead of refusing by name;
  // watched 2026-10-23.
  it('refuses rollback while a fact is on a defined measure, keeping it', () => {
    comeForward();
    db.run(
      `INSERT INTO measure (id, organization_id, key, name, unit, kind, scale, three_point, show_by_default, schedules_work, derived, "order", currency)
       VALUES ('gpu', 'org-a', 'gpu_minutes', 'GPU', 'min', 'duration', 'integer', 1, 0, 0, 0, 6, NULL)`,
    );
    db.run(
      "INSERT INTO step_measure (work_item_id, step_id, measure_id, value, recorded_at) VALUES ('p-one', 'p-dev', 'gpu', 3, 30)",
    );
    db.close();
    expect(() => rollbackTo(path, FOLDER, BASELINE)).toThrow('facts on defined measures exist');
    db = openDatabase(path);
    expect(
      db.query("SELECT COUNT(*) AS n FROM step_measure WHERE measure_id = 'gpu'").get(),
    ).toEqual({ n: 1 });
  });

  it('rolls back to the old shape keeping every legacy fact, and comes forward again', () => {
    const before = legacyRows();
    const oldShape = db
      .query<{ sql: string }, []>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'step_measure'",
      )
      .get();
    comeForward();
    db.close();
    expect(rollbackTo(path, FOLDER, BASELINE)).toEqual([
      DIRECTORY_CAPACITY,
      DIRECTORY_AUDIT,
      WORK_ITEM_BUDGETS,
      MEASURE_ESTIMATES,
      MIGRATION,
    ]);
    db = openDatabase(path);
    expect(legacyRows()).toEqual(before);
    const columns = db
      .query<{ name: string; pk: number }, []>(
        "SELECT name, pk FROM pragma_table_info('step_measure')",
      )
      .all();
    expect(columns.map(({ name }) => name)).not.toContain('measure_id');
    expect(columns.filter(({ pk }) => pk > 0).map(({ name }) => name)).toEqual([
      'work_item_id',
      'step_id',
      'metric',
    ]);
    expect(oldShape).not.toBeNull();
    comeForward();
    expect(legacyRows()).toEqual(before);
    expect(keyOf('p-one', 'p-dev', 'token_actual')).toBe('tokens');
  });
});
