import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SEEDED_MEASURE_DEFINITIONS } from '@wbs/domain';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const MIGRATION = '20261023100000_add_measure';
const BASELINE = '20261022130100_widen_organization_audit_organization_limits';

let dir: string;
let path: string;
let db: Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-measure-schema-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  db = openDatabase(path);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

interface StoredMeasure {
  key: string;
  name: string;
  unit: string;
  kind: string;
  scale: string;
  three_point: number;
  show_by_default: number;
  schedules_work: number;
  derived: number;
  order: number;
  currency: string | null;
  created_at: number | null;
  created_by: string | null;
}

function measuresOf(organizationId: string): StoredMeasure[] {
  return db
    .query<StoredMeasure, [string]>(
      'SELECT key, name, unit, kind, scale, three_point, show_by_default, schedules_work, derived, "order", currency, created_at, created_by FROM measure WHERE organization_id = ? ORDER BY "order"',
    )
    .all(organizationId);
}

/** The seeded rows as the migration stores them, stamped with their organization's creation. */
function seededRows(createdAt: number): StoredMeasure[] {
  return SEEDED_MEASURE_DEFINITIONS.map((each) => ({
    key: each.key,
    name: each.name,
    unit: each.unit,
    kind: each.kind,
    scale: each.scale,
    three_point: Number(each.threePoint),
    show_by_default: Number(each.showByDefault),
    schedules_work: Number(each.schedulesWork),
    derived: Number(each.derived),
    order: each.order,
    currency: each.currency,
    created_at: createdAt,
    created_by: null,
  }));
}

function organization(id: string, createdAt = 7): void {
  db.run(
    `INSERT INTO organization (id, name, created_at) VALUES ('${id}', '${id}', ${String(createdAt)})`,
  );
}

function define(organizationId: string, key: string, extra = ''): void {
  db.run(
    `INSERT INTO measure (id, organization_id, key, name, unit, kind, scale, three_point, show_by_default, schedules_work, derived, "order", currency, created_at)
     VALUES ('${organizationId}-${key}', '${organizationId}', '${key}', '${key}', 'u', ${extra === '' ? "'count', 'integer', 1, 0, 0, 0, 9, NULL" : extra}, 1)`,
  );
}

describe(MIGRATION, () => {
  // Proof: with the five seeding INSERTs removed from migration.sql, this case
  // read no definitions for either existing organization; watched 2026-10-23.
  it('seeds the five definitions for every organization that existed before it', () => {
    expect(rollbackTo(path, FOLDER, BASELINE)).toEqual([MIGRATION]);
    organization('org-a', 11);
    organization('org-b', 12);
    runMigrations(path, FOLDER);
    expect(measuresOf('org-a')).toEqual(seededRows(11));
    expect(measuresOf('org-b')).toEqual(seededRows(12));
  });

  // Proof: with the organization trigger removed from migration.sql, this case
  // read no definitions for the new organization; watched 2026-10-23.
  it('seeds the five definitions for every organization created after it, in the same statement', () => {
    organization('org-new', 21);
    expect(measuresOf('org-new')).toEqual(seededRows(21));
    const ids = db.query<{ id: string }, []>('SELECT id FROM measure').all();
    expect(new Set(ids.map(({ id }) => id)).size).toBe(5);
  });

  // Proof: with `measure_organization_key` made non-unique, the second `tokens`
  // stored; with `measure_one_scheduling` made non-unique, the second scheduling
  // measure stored; watched 2026-10-23.
  it('holds one key and one scheduling measure per organization', () => {
    organization('org-a');
    organization('org-b');
    expect(() => {
      define('org-a', 'tokens');
    }).toThrow('UNIQUE constraint failed: measure.organization_id, measure.key');
    expect(() => {
      define('org-a', 'gpu', "'duration', 'integer', 1, 0, 1, 0, 9, NULL");
    }).toThrow('UNIQUE constraint failed: measure.organization_id');
    define('org-a', 'gpu');
    define('org-b', 'gpu');
    expect(measuresOf('org-a').map(({ key }) => key)).toContain('gpu');
  });

  // Proof: each CHECK replaced by `CHECK (1)` failed its own refusal here;
  // watched 2026-10-23.
  it('refuses a malformed key, kind, scale, flag, order or currency', () => {
    organization('org-a');
    for (const key of ['Gpu', '9gpu', 'gpu-minutes', '', 'x'.repeat(41)])
      expect(() => {
        define('org-a', key);
      }).toThrow('CHECK constraint failed: measure_key');
    for (const [extra, check] of [
      ["'speed', 'integer', 1, 0, 0, 0, 9, NULL", 'measure_kind'],
      ["'count', 'float', 1, 0, 0, 0, 9, NULL", 'measure_scale'],
      ["'count', 'integer', 2, 0, 0, 0, 9, NULL", 'measure_flags'],
      ["'count', 'integer', 1, 0, 0, 0, 1.5, NULL", 'measure_order'],
      ["'count', 'integer', 1, 0, 0, 0, -1, NULL", 'measure_order'],
      ["'money', 'integer', 1, 0, 0, 0, 9, NULL", 'measure_currency'],
      ["'count', 'integer', 1, 0, 0, 0, 9, 'USD'", 'measure_currency'],
      ["'money', 'integer', 1, 0, 0, 0, 9, 'usd'", 'measure_currency'],
    ] as const)
      expect(() => {
        define('org-a', 'gpu', extra);
      }).toThrow(`CHECK constraint failed: ${check}`);
    define('org-a', 'fee', "'money', 'integer', 1, 0, 0, 0, 9, 'EUR'");
  });

  // Proof: with `ON DELETE CASCADE` removed from migration.sql, the delete
  // failed on `FOREIGN KEY constraint failed`; watched 2026-10-23.
  it('goes with its organization', () => {
    db.run('PRAGMA foreign_keys = ON');
    organization('org-a');
    organization('org-b');
    db.run("DELETE FROM organization WHERE id = 'org-a'");
    expect(measuresOf('org-a')).toEqual([]);
    expect(measuresOf('org-b')).toHaveLength(5);
  });

  // Proof: with the frozen-key trigger removed from migration.sql, the key
  // update stored `llm_tokens`; watched 2026-10-23.
  it('never changes a key or its organization, but renames freely', () => {
    organization('org-a');
    organization('org-b');
    expect(() => {
      db.run(
        "UPDATE measure SET key = 'llm_tokens' WHERE organization_id = 'org-a' AND key = 'tokens'",
      );
    }).toThrow('measure key and organization are immutable');
    expect(() => {
      db.run(
        "UPDATE measure SET organization_id = 'org-b' WHERE organization_id = 'org-a' AND key = 'cost'",
      );
    }).toThrow('measure key and organization are immutable');
    db.run(
      "UPDATE measure SET name = 'LLM tokens' WHERE organization_id = 'org-a' AND key = 'tokens'",
    );
    expect(measuresOf('org-a').find(({ key }) => key === 'tokens')?.name).toBe('LLM tokens');
  });

  // Proof: with the guard statements removed from down.sql, this case failed:
  // the rollback dropped the table with `gpu` in it; watched 2026-10-23.
  it('refuses rollback while a defined measure exists, keeping the table and the ledger', () => {
    organization('org-a');
    define('org-a', 'gpu');
    const ledger = () =>
      db.query<{ name: string }, []>('SELECT name FROM __drizzle_migrations ORDER BY id').all();
    const before = ledger();
    expect(() => rollbackTo(path, FOLDER, BASELINE)).toThrow(/defined measures exist/);
    expect(measuresOf('org-a')).toHaveLength(6);
    expect(ledger()).toEqual(before);
  });

  it('rolls back over seeded definitions alone, and comes forward seeding again', () => {
    organization('org-a', 5);
    db.run("UPDATE measure SET name = 'LLM tokens' WHERE key = 'tokens'");
    expect(rollbackTo(path, FOLDER, BASELINE)).toEqual([MIGRATION]);
    expect(
      db
        .query(
          "SELECT name FROM sqlite_master WHERE name LIKE '%measure%' AND name NOT LIKE '%step_measure%'",
        )
        .all(),
    ).toEqual([]);
    // The outgoing release's organizations get no seed while the table is gone.
    organization('org-b', 6);
    runMigrations(path, FOLDER);
    expect(measuresOf('org-a')).toEqual(seededRows(5));
    expect(measuresOf('org-b')).toEqual(seededRows(6));
  });
});
