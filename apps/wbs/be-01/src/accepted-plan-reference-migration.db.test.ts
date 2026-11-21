import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import {
  captureAppliedMigrationSet,
  restoreAppliedMigrationSet,
} from '@wbs/store-sqlite/migration-set';
import { afterEach, beforeEach, expect, test } from 'bun:test';

const production = new URL('../drizzle', import.meta.url).pathname;
const migration = '20261117190000_add_accepted_plan_references';
const identity = { target: 'test', attempt: 'accepted-reference', candidate: migration };
let directory: string;
let database: string;
let folder: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'accepted-reference-migration-'));
  database = join(directory, 'test.db');
  folder = join(directory, 'migrations');
  mkdirSync(folder);
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function stageMigration(name: string) {
  const staged = join(folder, name);
  mkdirSync(staged);
  for (const script of ['migration.sql', 'down.sql'])
    copyFileSync(join(production, name, script), join(staged, script));
}

function migrateCandidate() {
  for (const entry of readdirSync(production, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      entry.name < migration &&
      existsSync(join(production, entry.name, 'migration.sql'))
    )
      stageMigration(entry.name);
  }
  runMigrations(database, folder);
  const baseline = captureAppliedMigrationSet(database, folder, identity);
  expect(baseline.applied.length).toBeGreaterThan(0);
  expect(baseline.pending).toEqual([]);
  stageMigration(migration);
  const capture = captureAppliedMigrationSet(database, folder, identity);
  expect(capture.applied).toEqual(baseline.applied);
  expect(capture.pending.map(({ name }) => name)).toEqual([migration]);
  runMigrations(database, folder);
  return capture;
}

test('restores the complete captured migration ledger while the register and policy are pristine', () => {
  const capture = migrateCandidate();
  const installed = captureAppliedMigrationSet(database, folder, identity);
  const added = installed.applied.filter(({ name }) => name === migration);
  expect(added).toHaveLength(1);
  expect(restoreAppliedMigrationSet(database, folder, capture)).toEqual([migration]);
  expect(captureAppliedMigrationSet(database, folder, identity).applied).toEqual(capture.applied);
  const db = openDatabase(database);
  try {
    expect(
      db
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'accepted_plan_reference%'",
        )
        .all(),
    ).toEqual([]);
  } finally {
    db.close();
  }
});

test.each([
  [
    'retained history',
    "INSERT INTO accepted_plan_reference (organization_id, project_id, repository, change, version, reference_digest, write_basis, artifacts, subject, accepted_at, policy_revision) VALUES ('org-a', 'project-a', 'repo-a', 'change-a', 1, 'digest', 'basis', '{}', '{}', 1, 1)",
    /accepted plan reference history exists/,
  ],
  [
    'changed protected policy',
    'UPDATE accepted_plan_reference_policy SET revision = 2 WHERE singleton = 1',
    /the protected acceptance policy differs/,
  ],
  [
    'changed grants at the migration-owned revision',
    `UPDATE accepted_plan_reference_policy SET grants = '[{"scope":{"organizationId":"org-a","projectId":"project-a","repository":"repo","change":"change-a"},"operation":"accept_reference","subject":{"kind":"first_party","accountId":"account-a"}}]' WHERE singleton = 1`,
    /the protected acceptance policy differs/,
  ],
  [
    'missing protected policy',
    'DELETE FROM accepted_plan_reference_policy',
    /the protected acceptance policy differs/,
  ],
] as const)(
  'retains the full schema and migration ledger when rollback encounters %s',
  (_, inject, refusal) => {
    const capture = migrateCandidate();
    const db = openDatabase(database);
    const policyQuery = 'SELECT singleton, revision, grants FROM accepted_plan_reference_policy';
    let expectedPolicy: unknown[];
    try {
      expect(db.run(inject).changes).toBe(1);
      expectedPolicy = db.query(policyQuery).all();
    } finally {
      db.close();
    }
    const installed = captureAppliedMigrationSet(database, folder, identity);
    expect(() => restoreAppliedMigrationSet(database, folder, capture)).toThrow(refusal);
    expect(captureAppliedMigrationSet(database, folder, identity).applied).toEqual(
      installed.applied,
    );
    const retained = openDatabase(database);
    try {
      expect(retained.query(policyQuery).all()).toEqual(expectedPolicy);
      expect(
        retained
          .query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'accepted_plan_reference%' ORDER BY name",
          )
          .all(),
      ).toEqual([{ name: 'accepted_plan_reference' }, { name: 'accepted_plan_reference_policy' }]);
    } finally {
      retained.close();
    }
  },
);

test('refuses rollback when an extra policy row accompanies the pristine policy', () => {
  const capture = migrateCandidate();
  const installed = captureAppliedMigrationSet(database, folder, identity);
  const policyQuery =
    'SELECT singleton, revision, grants FROM accepted_plan_reference_policy ORDER BY singleton';
  const schemaQuery =
    "SELECT type, name, sql FROM sqlite_master WHERE tbl_name IN ('accepted_plan_reference', 'accepted_plan_reference_policy') ORDER BY type, name";
  const historyQuery = 'SELECT count(*) AS history FROM accepted_plan_reference';
  const expectedPolicy = [
    { singleton: 1, revision: 1, grants: '[]' },
    { singleton: 2, revision: 1, grants: '[]' },
  ];
  const db = openDatabase(database);
  let schema: unknown[];
  try {
    const insert = "INSERT INTO accepted_plan_reference_policy VALUES (2, 1, '[]')";
    expect(() => db.run(insert)).toThrow(/CHECK constraint failed/);
    db.run('PRAGMA ignore_check_constraints = ON');
    try {
      expect(db.run(insert).changes).toBe(1);
    } finally {
      db.run('PRAGMA ignore_check_constraints = OFF');
    }
    expect(db.query('PRAGMA ignore_check_constraints').get()).toEqual({
      ignore_check_constraints: 0,
    });
    expect(db.query(policyQuery).all()).toEqual(expectedPolicy);
    expect(db.query(historyQuery).get()).toEqual({ history: 0 });
    schema = db.query(schemaQuery).all();
    expect(schema.length).toBeGreaterThanOrEqual(2);
  } finally {
    db.close();
  }

  expect(() => restoreAppliedMigrationSet(database, folder, capture)).toThrow(
    /the protected acceptance policy differs/,
  );
  expect(captureAppliedMigrationSet(database, folder, identity)).toEqual(installed);
  const retained = openDatabase(database);
  try {
    expect(retained.query(policyQuery).all()).toEqual(expectedPolicy);
    expect(retained.query(historyQuery).get()).toEqual({ history: 0 });
    expect(retained.query(schemaQuery).all()).toEqual(schema);
  } finally {
    retained.close();
  }
});
