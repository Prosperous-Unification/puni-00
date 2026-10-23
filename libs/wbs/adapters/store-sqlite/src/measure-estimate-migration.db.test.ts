import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const MIGRATION = '20261023120000_add_measure_estimate';
const BASELINE = '20261023110000_key_step_measure';

let dir: string;
let path: string;
let db: Database;

/**
 * A store at {@link BASELINE} shaped like dev: project `p` owned by `org-a`,
 * project `q` owned by nobody, legacy token estimates on both beside token and
 * hours facts, written with audit columns the way the outgoing release writes.
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
    "INSERT INTO work_item (id, project_id, name, position, revision) VALUES ('p-one', 'p', 'One', 1, 0), ('p-two', 'p', 'Two', 2, 0), ('q-one', 'q', 'One', 1, 0)",
  );
  db.run(
    `INSERT INTO step_measure (work_item_id, step_id, metric, value, recorded_at, created_at, updated_at, created_by) VALUES
      ('p-one', 'p-dev', 'token_estimate', 12000, 5, 5, NULL, 'u'),
      ('p-one', 'p-dev', 'token_actual', 15000, 6, 6, 7, 'u'),
      ('p-one', 'p-qa', 'hours_actual', 2.5, 8, 8, NULL, 'u'),
      ('q-one', 'q-dev', 'token_estimate', 50, 9, 9, NULL, NULL)`,
  );
}

interface TrioRow {
  work_item_id: string;
  step_id: string;
  measure_key: string;
  key: string | null;
  optimistic: number;
  realistic: number;
  pessimistic: number;
  single_point: number;
}

function trios(): TrioRow[] {
  return db
    .query<TrioRow, []>(
      `SELECT me.work_item_id, me.step_id, me.measure_key, m.key, me.optimistic, me.realistic,
         me.pessimistic, me.single_point
       FROM measure_estimate AS me LEFT JOIN measure AS m ON m.id = me.measure_id
       ORDER BY me.work_item_id, me.step_id, me.measure_key`,
    )
    .all();
}

function legacyRows(): unknown[] {
  return db
    .query(
      'SELECT work_item_id, step_id, metric, value, recorded_at, created_at, updated_at, created_by FROM step_measure ORDER BY work_item_id, step_id, metric',
    )
    .all();
}

function single(workItemId: string, stepId: string, value: number, key: string | null): TrioRow {
  return {
    work_item_id: workItemId,
    step_id: stepId,
    measure_key: 'tokens',
    key,
    optimistic: value,
    realistic: value,
    pessimistic: value,
    single_point: 1,
  };
}

/** Applies every migration, steps back to {@link BASELINE}, seeds, and comes forward. */
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-measure-estimate-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  expect(rollbackTo(path, FOLDER, BASELINE)).toEqual([MIGRATION]);
  db = openDatabase(path);
  seedBaseline();
  db.close();
  runMigrations(path, FOLDER);
  db = openDatabase(path);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe(MIGRATION, () => {
  // Proof: with the back-fill made `WHERE 0` in migration.sql, this case read
  // no trios; watched 2026-10-23.
  it('turns every legacy token estimate into a single-point tokens trio, keyed to its organization', () => {
    expect(trios()).toEqual([
      single('p-one', 'p-dev', 12000, 'tokens'),
      single('q-one', 'q-dev', 50, null),
    ]);
    // The legacy rows stay exactly as they were, for the outgoing release.
    expect(legacyRows()).toHaveLength(4);
    expect(legacyRows()).toContainEqual({
      work_item_id: 'p-one',
      step_id: 'p-dev',
      metric: 'token_estimate',
      value: 12000,
      recorded_at: 5,
      created_at: 5,
      updated_at: null,
      created_by: 'u',
    });
  });

  // Proof: with the insert trigger's WHEN made `0`, this case read no trio
  // after the outgoing release's insert; with the delete trigger's WHEN made
  // `0`, it kept the trio after the delete; watched 2026-10-23.
  it('mirrors a token estimate the outgoing release writes, and takes it with its delete', () => {
    // The outgoing release's own statements: insert by metric, then its upsert.
    db.run(
      "INSERT INTO step_measure (work_item_id, step_id, metric, value, recorded_at) VALUES ('p-two', 'p-dev', 'token_estimate', 7, 20)",
    );
    expect(trios()).toContainEqual(single('p-two', 'p-dev', 7, 'tokens'));
    db.run(
      "INSERT INTO step_measure (work_item_id, step_id, metric, value, recorded_at) VALUES ('p-two', 'p-dev', 'token_estimate', 9, 21) ON CONFLICT (work_item_id, step_id, metric) DO UPDATE SET value = excluded.value, recorded_at = excluded.recorded_at",
    );
    expect(trios()).toContainEqual(single('p-two', 'p-dev', 9, 'tokens'));
    db.run("DELETE FROM step_measure WHERE work_item_id = 'p-two' AND metric = 'token_estimate'");
    expect(trios().filter((row) => row.work_item_id === 'p-two')).toEqual([]);
  });

  it('replaces a three-point trio with a legacy figure written over it, and leaves it on a delete elsewhere', () => {
    db.run(
      "INSERT INTO measure_estimate (work_item_id, step_id, measure_key, optimistic, realistic, pessimistic) VALUES ('p-two', 'p-dev', 'tokens', 1, 2, 3)",
    );
    // No legacy row stands beside a three-point trio, so deleting none keeps it.
    db.run("DELETE FROM step_measure WHERE work_item_id = 'p-two'");
    expect(trios()).toContainEqual({
      work_item_id: 'p-two',
      step_id: 'p-dev',
      measure_key: 'tokens',
      key: null,
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
      single_point: 0,
    });
    db.run(
      "INSERT INTO step_measure (work_item_id, step_id, metric, value, recorded_at) VALUES ('p-two', 'p-dev', 'token_estimate', 4, 20)",
    );
    expect(trios()).toContainEqual(single('p-two', 'p-dev', 4, null));
  });

  // Proof: with the update trigger's WHEN made `0`, this case read the trio
  // still on `p-one` after the outgoing release's hand-down; watched 2026-10-23.
  it('moves the single-point trio with its legacy row', () => {
    // The outgoing release's `moveAll` at a first child's hand-down.
    db.run("UPDATE step_measure SET work_item_id = 'p-two' WHERE work_item_id = 'p-one'");
    expect(trios()).toEqual([
      single('p-two', 'p-dev', 12000, 'tokens'),
      single('q-one', 'q-dev', 50, null),
    ]);
  });

  // Proof: with `measure_estimate_ordered` made `CHECK (1)`, the unordered
  // insert stored; watched 2026-10-23.
  it('refuses an unordered trio and a single point that is not one', () => {
    const insert = (key: string, o: number, r: number, p: number, singlePoint: number) => () =>
      db.run(
        `INSERT INTO measure_estimate (work_item_id, step_id, measure_key, optimistic, realistic, pessimistic, single_point) VALUES ('p-two', 'p-dev', '${key}', ${String(o)}, ${String(r)}, ${String(p)}, ${String(singlePoint)})`,
      );
    expect(insert('cost', 5, 2, 9, 0)).toThrow(/measure_estimate_ordered/);
    expect(insert('cost', -1, 2, 9, 0)).toThrow(/measure_estimate_ordered/);
    expect(insert('tokens', 1, 2, 3, 1)).toThrow(/measure_estimate_single_point/);
    expect(insert('cost', 4, 4, 4, 1)).toThrow(/measure_estimate_single_point/);
    expect(trios().filter((row) => row.work_item_id === 'p-two')).toEqual([]);
  });

  // Proof: with the keying trigger's UPDATE replaced by `SELECT 1`, this case
  // read q's trio unkeyed; watched 2026-10-23.
  it('keys an unowned project’s trios when an organization takes it', () => {
    db.run("INSERT INTO project_organization (resource_id, organization_id) VALUES ('q', 'org-a')");
    expect(trios()).toContainEqual(single('q-one', 'q-dev', 50, 'tokens'));
  });

  // Proof: with the guard's comparison made `>= 0` in down.sql, this case
  // dropped the table with the three-point trio; watched 2026-10-23.
  it('refuses rollback while a three-point or defined trio exists, keeping it', () => {
    db.run(
      "INSERT INTO measure_estimate (work_item_id, step_id, measure_key, optimistic, realistic, pessimistic) VALUES ('p-two', 'p-dev', 'tokens', 1, 2, 3)",
    );
    db.close();
    expect(() => rollbackTo(path, FOLDER, BASELINE)).toThrow(
      'measure estimates the legacy token estimate cannot hold exist',
    );
    db = openDatabase(path);
    expect(trios()).toHaveLength(3);
    db.run("DELETE FROM measure_estimate WHERE work_item_id = 'p-two'");
    db.run(
      "INSERT INTO measure_estimate (work_item_id, step_id, measure_key, optimistic, realistic, pessimistic) VALUES ('p-two', 'p-dev', 'cost', 1, 1, 1)",
    );
    db.close();
    expect(() => rollbackTo(path, FOLDER, BASELINE)).toThrow(
      'measure estimates the legacy token estimate cannot hold exist',
    );
    db = openDatabase(path);
    expect(trios()).toHaveLength(3);
  });

  it('rolls back over single-point trios alone, keeping every legacy row, and comes forward again', () => {
    const before = legacyRows();
    db.close();
    expect(rollbackTo(path, FOLDER, BASELINE)).toEqual([MIGRATION]);
    db = openDatabase(path);
    expect(
      db.query("SELECT name FROM sqlite_master WHERE name LIKE '%measure_estimate%'").all(),
    ).toEqual([]);
    expect(legacyRows()).toEqual(before);
    db.close();
    runMigrations(path, FOLDER);
    db = openDatabase(path);
    expect(trios()).toEqual([
      single('p-one', 'p-dev', 12000, 'tokens'),
      single('q-one', 'q-dev', 50, null),
    ]);
  });
});
