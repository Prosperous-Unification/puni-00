import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const MIGRATION = '20261022130000_add_organization_limits';
/** The newer audit widening, which reverses first in its own transaction. */
const LIMITS_AUDIT = '20261022130100_widen_organization_audit_organization_limits';
/** The newer measure definitions, which reverse first over seeded rows alone. */
const MEASURE = '20261023100000_add_measure';
/** The measure-keyed facts, which reverse first over legacy facts alone. */
const MEASURE_FACTS = '20261023110000_key_step_measure';
const BASELINE = '20261022120000_scope_trusted_issuer_audience';

let dir: string;
let path: string;
let db: Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-organization-limits-migration-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  db = openDatabase(path);
  db.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function count(): number {
  const row = db.query<{ n: number }, []>('SELECT count(*) AS n FROM organization_limits').get();
  if (row === null) throw new Error('no count from organization_limits');
  return row.n;
}

function insert(agents: string, claims: string, units: string, organizationId = 'org-a'): void {
  db.run(
    `INSERT INTO organization_limits (organization_id, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource, created_at) VALUES ('${organizationId}', ${agents}, ${claims}, ${units}, 1)`,
  );
}

describe(MIGRATION, () => {
  it('holds one row of three caps per organization', () => {
    insert('8', '40', '64');
    expect(() => {
      insert('9', '41', '65');
    }).toThrow('UNIQUE constraint failed: organization_limits.organization_id');
    expect(count()).toBe(1);
  });

  it('accepts the bounds 0 and 1,000,000 themselves', () => {
    insert('0', '1000000', '0');
    expect(count()).toBe(1);
  });

  // Proof: each CHECK replaced by `CHECK (1)` in turn failed exactly its own
  // column's case here (7 pass, 1 fail each); watched 2026-10-22.
  for (const [column, place] of [
    ['max_agent_persons', 0],
    ['max_concurrent_claims', 1],
    ['max_capacity_units_per_resource', 2],
  ] as const)
    it(`refuses a null, fractional, text, negative or over-bound ${column}`, () => {
      for (const bad of ['NULL', '1.5', "'eight'", '-1', '1000001']) {
        const caps = ['8', '40', '64'];
        caps[place] = bad;
        const [agents = '', claims = '', units = ''] = caps;
        expect(() => {
          insert(agents, claims, units);
        }).toThrow(
          bad === 'NULL'
            ? `NOT NULL constraint failed: organization_limits.${column}`
            : `CHECK constraint failed: organization_limits_${column}`,
        );
      }
      expect(count()).toBe(0);
    });

  it('refuses a row of no organization', () => {
    db.run('PRAGMA foreign_keys = ON');
    expect(() => {
      insert('8', '40', '64', 'org-nowhere');
    }).toThrow('FOREIGN KEY constraint failed');
  });

  // Proof: with the guard statements removed from down.sql, this case failed
  // (7 pass, 1 fail): the rollback dropped the table with its row; watched 2026-10-22.
  it('refuses rollback while an organization holds its own caps, keeping the table and the ledger', () => {
    insert('8', '40', '64');
    const before = db
      .query<{ name: string }, []>('SELECT name FROM __drizzle_migrations ORDER BY id')
      .all();
    expect(() => rollbackTo(path, FOLDER, BASELINE)).toThrow(/organization limits exist/);
    expect(count()).toBe(1);
    expect(
      db.query<{ name: string }, []>('SELECT name FROM __drizzle_migrations ORDER BY id').all(),
    ).toEqual(
      before.filter(
        ({ name }) => name !== LIMITS_AUDIT && name !== MEASURE && name !== MEASURE_FACTS,
      ),
    );
  });

  it('rolls back when empty and comes forward again', () => {
    expect(rollbackTo(path, FOLDER, BASELINE)).toEqual([
      MEASURE_FACTS,
      MEASURE,
      LIMITS_AUDIT,
      MIGRATION,
    ]);
    expect(
      db.query("SELECT name FROM sqlite_master WHERE name = 'organization_limits'").all(),
    ).toEqual([]);
    runMigrations(path, FOLDER);
    insert('8', '40', '64');
    expect(count()).toBe(1);
  });
});
