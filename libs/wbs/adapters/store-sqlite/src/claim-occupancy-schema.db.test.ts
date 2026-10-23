import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const MIGRATION = '20261020130000_add_claim_occupancy';
const BASELINE = '20261020120000_add_resources';

let dir: string;
let path: string;
let db: Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-claim-occupancy-schema-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  db = openDatabase(path);
  for (const statement of [
    "INSERT INTO users (id, username, created_at) VALUES ('u1', 'u1', 1)",
    "INSERT INTO project (id, name, owner_id, created_at) VALUES ('p1', 'Plan', 'u1', 1)",
    "INSERT INTO step (id, project_id, name) VALUES ('dev', 'p1', 'Dev')",
    "INSERT INTO work_item (id, project_id, name, position, revision) VALUES ('w1', 'p1', 'Build', 1, 0)",
    "INSERT INTO person (id, name) VALUES ('claire', 'Claire')",
    "INSERT INTO claim (id, work_item_id, step_id, person_id, created_by) VALUES ('c1', 'w1', 'dev', 'claire', 'u1')",
    "INSERT INTO resource (id, name, kind, unit_label) VALUES ('ram', 'h2puni ram', 'divisible', 'GB')",
  ])
    db.run(statement);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function count(): number {
  const row = db.query<{ n: number }, []>('SELECT count(*) AS n FROM claim_occupancy').get();
  if (row === null) throw new Error('no count from claim_occupancy');
  return row.n;
}

function occupy(claimId: string, resourceId: string, units: number | string): void {
  db.run(
    `INSERT INTO claim_occupancy (claim_id, resource_id, units) VALUES ('${claimId}', '${resourceId}', ${String(units)})`,
  );
}

describe(MIGRATION, () => {
  it('holds 1 or more whole units, one row per claim and resource', () => {
    occupy('c1', 'ram', 4);
    for (const units of [0, -1, 1.5, "'4'"])
      expect(() => {
        occupy('c1', 'ram', units);
      }).toThrow(/CHECK constraint failed: claim_occupancy_units|UNIQUE constraint failed/);
    expect(() => {
      occupy('c1', 'ram', 2);
    }).toThrow('UNIQUE constraint failed: claim_occupancy.claim_id, claim_occupancy.resource_id');
    expect(count()).toBe(1);
  });

  it('refuses a units figure below 1 before the key is even asked', () => {
    expect(() => {
      occupy('c1', 'ram', 0);
    }).toThrow('CHECK constraint failed: claim_occupancy_units');
  });

  it('refuses a row naming a claim or a resource nobody holds', () => {
    expect(() => {
      occupy('absent', 'ram', 1);
    }).toThrow('FOREIGN KEY constraint failed');
    expect(() => {
      occupy('c1', 'absent', 1);
    }).toThrow('FOREIGN KEY constraint failed');
  });

  it('goes with its claim', () => {
    occupy('c1', 'ram', 4);
    db.run("DELETE FROM claim WHERE id = 'c1'");
    expect(count()).toBe(0);
  });

  it('goes with its resource, leaving the claim standing', () => {
    occupy('c1', 'ram', 4);
    db.run("DELETE FROM resource WHERE id = 'ram'");
    expect(count()).toBe(0);
    expect(db.query('SELECT id FROM claim').all()).toEqual([{ id: 'c1' }]);
  });

  it('refuses rollback while a claim holds units, keeping the table and the ledger', () => {
    occupy('c1', 'ram', 4);
    const before = db
      .query<{ name: string }, []>('SELECT name FROM __drizzle_migrations ORDER BY id')
      .all();
    expect(() => rollbackTo(path, FOLDER, BASELINE)).toThrow(/claim occupancy exists/);
    expect(count()).toBe(1);
    // The newer, empty machine credential and organization limits migrations reverse first.
    expect(
      db.query<{ name: string }, []>('SELECT name FROM __drizzle_migrations ORDER BY id').all(),
    ).toEqual(
      before.filter(
        ({ name }) =>
          ![
            '20261022100000_add_machine_credential',
            '20261022110000_widen_organization_audit_machine_credentials',
            '20261022110100_check_machine_credential_id',
            '20261022120000_scope_trusted_issuer_audience',
            '20261022130000_add_organization_limits',
            '20261022130100_widen_organization_audit_organization_limits',
            '20261022140000_add_resource_provider',
            '20261022140100_widen_organization_audit_compute_providers',
            '20261023100000_add_claim_lease',
            '20261023140000_add_measure',
            '20261023150000_key_step_measure',
            '20261023160000_add_measure_estimate',
            '20261023170000_add_work_item_budget',
          ].includes(name),
      ),
    );
  });

  it('rolls back when empty and comes forward again', () => {
    expect(rollbackTo(path, FOLDER, BASELINE)).toEqual([
      '20261023170000_add_work_item_budget',
      '20261023160000_add_measure_estimate',
      '20261023150000_key_step_measure',
      '20261023140000_add_measure',
      '20261023100000_add_claim_lease',
      '20261022140100_widen_organization_audit_compute_providers',
      '20261022140000_add_resource_provider',
      '20261022130100_widen_organization_audit_organization_limits',
      '20261022130000_add_organization_limits',
      '20261022120000_scope_trusted_issuer_audience',
      '20261022110100_check_machine_credential_id',
      '20261022110000_widen_organization_audit_machine_credentials',
      '20261022100000_add_machine_credential',
      MIGRATION,
    ]);
    expect(db.query("SELECT name FROM sqlite_master WHERE name = 'claim_occupancy'").all()).toEqual(
      [],
    );
    runMigrations(path, FOLDER);
    occupy('c1', 'ram', 4);
    expect(count()).toBe(1);
  });
});
