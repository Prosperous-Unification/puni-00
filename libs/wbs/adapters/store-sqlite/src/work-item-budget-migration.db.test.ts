import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const MIGRATION = '20261023170000_add_work_item_budget';
const BASELINE = '20261023160000_add_measure_estimate';

let dir: string;
let path: string;
let db: Database;

/**
 * A store at {@link BASELINE} shaped like dev: project `p` owned by `org-a`,
 * project `q` owned by nobody, a cost fact and a cost trio written before
 * bases existed, beside a token fact.
 */
function seedBaseline(): void {
  db.run("INSERT INTO users (id, username, password_hash, created_at) VALUES ('u', 'u', 'x', 1)");
  db.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
  db.run(
    "INSERT INTO project (id, name, owner_id, revision, created_at) VALUES ('p', 'Plan', 'u', 0, 1), ('q', 'Other', 'u', 0, 1)",
  );
  db.run("INSERT INTO project_organization (resource_id, organization_id) VALUES ('p', 'org-a')");
  db.run(
    "INSERT INTO step (id, project_id, name, position) VALUES ('p-dev', 'p', 'Dev', 10), ('q-dev', 'q', 'Dev', 10)",
  );
  db.run(
    "INSERT INTO work_item (id, project_id, name, position, revision) VALUES ('p-one', 'p', 'One', 1, 0), ('q-one', 'q', 'One', 1, 0)",
  );
  db.run(
    `INSERT INTO step_measure (work_item_id, step_id, metric, measure_id, value, recorded_at)
     SELECT 'p-one', 'p-dev', NULL, id, 700, 5 FROM measure WHERE organization_id = 'org-a' AND key = 'cost'`,
  );
  db.run(
    "INSERT INTO step_measure (work_item_id, step_id, metric, value, recorded_at) VALUES ('p-one', 'p-dev', 'token_actual', 15, 6)",
  );
  db.run(
    `INSERT INTO measure_estimate (work_item_id, step_id, measure_key, measure_id, optimistic, realistic, pessimistic)
     SELECT 'p-one', 'p-dev', 'cost', id, 1, 2, 3 FROM measure WHERE organization_id = 'org-a' AND key = 'cost'`,
  );
}

function budgets(): unknown[] {
  return db
    .query(
      `SELECT b.work_item_id, b.measure_key, m.key, b.cap, b.policy, b.hold_per_attempt
       FROM work_item_budget AS b LEFT JOIN measure AS m ON m.id = b.measure_id
       ORDER BY b.work_item_id, b.measure_key`,
    )
    .all();
}

const budgetOn = (workItemId: string, key: string, cap = 10, policy = 'strict') =>
  db.run(
    `INSERT INTO work_item_budget (work_item_id, measure_key, measure_id, cap, policy)
     VALUES ('${workItemId}', '${key}', (SELECT m.id FROM measure AS m
       JOIN project_organization AS po ON po.organization_id = m.organization_id
       JOIN work_item AS w ON w.project_id = po.resource_id
       WHERE w.id = '${workItemId}' AND m.key = '${key}'), ${String(cap)}, '${policy}')`,
  );

/** Applies every migration, steps back to {@link BASELINE}, seeds, and comes forward. */
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-work-item-budget-'));
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
  it('reads every figure written before it as unpriced, and keeps them', () => {
    expect(
      db.query('SELECT value, currency, rate_card_digest FROM step_measure ORDER BY value').all(),
    ).toEqual([
      { value: 15, currency: null, rate_card_digest: null },
      { value: 700, currency: null, rate_card_digest: null },
    ]);
    expect(db.query('SELECT currency, rate_card_digest FROM measure_estimate').all()).toEqual([
      { currency: null, rate_card_digest: null },
    ]);
  });

  // Proof: with the factor's CHECK made `CHECK (1)` in migration.sql, this
  // case stored a factor of 0; watched 2026-10-23.
  it('defaults every project’s budget factor to 1 and refuses 0', () => {
    expect(db.query('SELECT id, budget_factor FROM project ORDER BY id').all()).toEqual([
      { id: 'p', budget_factor: 1 },
      { id: 'q', budget_factor: 1 },
    ]);
    expect(() => db.run("UPDATE project SET budget_factor = 0 WHERE id = 'p'")).toThrow(
      'CHECK constraint failed',
    );
    expect(() => db.run("UPDATE project SET budget_factor = 1001 WHERE id = 'p'")).toThrow(
      'CHECK constraint failed',
    );
  });

  // Proof: with the policy CHECK made `CHECK (1)` in migration.sql, this case
  // stored the policy `firm`; watched 2026-10-23.
  it('refuses a budget outside the two policies, a negative cap and a half basis', () => {
    expect(() => budgetOn('p-one', 'tokens', 10, 'firm')).toThrow('CHECK constraint failed');
    expect(() => budgetOn('p-one', 'tokens', -1)).toThrow('CHECK constraint failed');
    expect(() => db.run("UPDATE step_measure SET currency = 'USD' WHERE value = 700")).toThrow(
      'CHECK constraint failed',
    );
    expect(() => db.run("UPDATE measure_estimate SET rate_card_digest = 'card-a'")).toThrow(
      'CHECK constraint failed',
    );
    budgetOn('p-one', 'tokens', 10, 'advisory');
    expect(budgets()).toEqual([
      {
        work_item_id: 'p-one',
        measure_key: 'tokens',
        key: 'tokens',
        cap: 10,
        policy: 'advisory',
        hold_per_attempt: null,
      },
    ]);
  });

  it('takes a work item’s budgets with it', () => {
    budgetOn('p-one', 'tokens');
    db.run("DELETE FROM work_item WHERE id = 'p-one'");
    expect(budgets()).toEqual([]);
  });

  // Proof: with the keying trigger's UPDATE replaced by `SELECT 1` in
  // migration.sql, this case read the budget unkeyed; watched 2026-10-23.
  it('keys an unowned project’s budgets when an organization takes it', () => {
    budgetOn('q-one', 'tokens');
    expect(budgets()).toEqual([expect.objectContaining({ work_item_id: 'q-one', key: null })]);
    db.run("INSERT INTO project_organization (resource_id, organization_id) VALUES ('q', 'org-a')");
    expect(budgets()).toEqual([expect.objectContaining({ work_item_id: 'q-one', key: 'tokens' })]);
  });

  // Proof: with the guard's comparison made `>= 0` in down.sql, this case
  // dropped the table with the budget; watched 2026-10-23.
  it('refuses rollback while a budget, a factor or a priced figure exists, keeping it', () => {
    const refused = () => {
      db.close();
      expect(() => rollbackTo(path, FOLDER, BASELINE)).toThrow(
        'budgets, budget factors or priced figures exist',
      );
      db = openDatabase(path);
    };
    budgetOn('p-one', 'tokens');
    refused();
    expect(budgets()).toHaveLength(1);
    db.run('DELETE FROM work_item_budget');
    db.run("UPDATE project SET budget_factor = 1.5 WHERE id = 'p'");
    refused();
    db.run("UPDATE project SET budget_factor = 1 WHERE id = 'p'");
    db.run(
      "UPDATE step_measure SET currency = 'USD', rate_card_digest = 'card-a' WHERE value = 700",
    );
    refused();
    db.run('UPDATE step_measure SET currency = NULL, rate_card_digest = NULL');
    db.run("UPDATE measure_estimate SET currency = 'USD', rate_card_digest = 'card-a'");
    refused();
  });

  it('rolls back over unpriced figures alone, keeping them, and comes forward again', () => {
    const facts = () =>
      db
        .query('SELECT work_item_id, step_id, metric, value FROM step_measure ORDER BY value')
        .all();
    const before = facts();
    db.close();
    expect(rollbackTo(path, FOLDER, BASELINE)).toEqual([MIGRATION]);
    db = openDatabase(path);
    expect(db.query("SELECT name FROM sqlite_master WHERE name LIKE '%budget%'").all()).toEqual([]);
    expect(facts()).toEqual(before);
    expect(
      db.query("SELECT name FROM pragma_table_info('project') WHERE name = 'budget_factor'").all(),
    ).toEqual([]);
    db.close();
    runMigrations(path, FOLDER);
    db = openDatabase(path);
    expect(budgets()).toEqual([]);
  });
});
