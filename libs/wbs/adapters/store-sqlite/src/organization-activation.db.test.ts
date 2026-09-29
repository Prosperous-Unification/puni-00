import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- a file that is not SQLite cannot pass openDatabase's pragma checks, and the unreadable case needs one open
import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import {
  type BrokenActivationMarker,
  OrganizationActivationRefused,
  readOrganizationActivation as readMarker,
} from './organization-activation';

/** Reads the marker through drizzle over a raw fixture connection, as repositories will. */
function readOrganizationActivation(db: Database): ReturnType<typeof readMarker> {
  return readMarker(drizzle({ client: db }));
}

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const ORGANIZATION_OWNERSHIP = '20260927130000_add_organization_ownership';
const ORGANIZATION_ACTIVATION = '20260927180000_add_organization_activation';
/** Main's step code column, stamped after the marker and so reversed before it. */
const STEP_CODE = '20260927150000_add_step_code';
const ORGANIZATION_BRIDGE = '20260927190000_add_organization_bridge';
/**
 * The newest: the triggers that freeze organization ownership, stamped after
 * {@link ORGANIZATION_BRIDGE} and reversed before it.
 */
const ORGANIZATION_FROZEN = '20260927200000_freeze_organization_ownership';
/** Stamped after the bridge, so every rollback below the bridge reverses it first. */
const TYPED_DEPENDENCY = '20260927213000_add_typed_dependency';
/** The step allowance column, stamped between {@link STEP_CODE} and the marker. */
const STEP_ALLOWANCE = '20260927170000_add_step_allowance';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-organization-activation-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function withDb<T>(use: (db: Database) => T): T {
  const db = openDatabase(path);
  try {
    return use(db);
  } finally {
    db.close();
  }
}

function readBrokenMarker(db: Database): BrokenActivationMarker {
  try {
    readOrganizationActivation(db);
  } catch (error) {
    if (error instanceof OrganizationActivationRefused) return error.marker;
    throw error;
  }
  throw new Error('the marker was read as trusted');
}

/** A fixture that writes `corruption` past the marker's CHECKs, as damaged storage would. */
function damage(corruption: string): (db: Database) => void {
  return (db) => {
    db.run('PRAGMA ignore_check_constraints = ON');
    db.run(corruption);
  };
}

function activate(db: Database): void {
  db.run(
    "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
  );
}

function readAppliedMigrations(): string[] {
  return withDb((db) =>
    db
      .query<{ name: string }, []>('SELECT name FROM __drizzle_migrations ORDER BY created_at')
      .all()
      .map((row) => row.name),
  );
}

describe('readOrganizationActivation', () => {
  it('reads the seeded marker as pre-activation', () => {
    expect(withDb(readOrganizationActivation)).toBe('pre_activation');
  });

  it('reads an activated marker', () => {
    expect(
      withDb((db) => {
        activate(db);
        return readOrganizationActivation(db);
      }),
    ).toBe('activated');
  });

  it('refuses an absent marker table', () => {
    rollbackTo(path, FOLDER, ORGANIZATION_OWNERSHIP);
    expect(withDb(readBrokenMarker)).toBe('absent');
  });

  it('refuses an unreadable database', () => {
    const garbage = join(dir, 'garbage.db');
    writeFileSync(garbage, Buffer.alloc(8192, 0x5a));
    const db = new Database(garbage);
    try {
      expect(readBrokenMarker(db)).toBe('unreadable');
    } finally {
      db.close();
    }
  });

  it('refuses an unreadable marker table', () => {
    withDb((db) => {
      db.run('ALTER TABLE organization_activation RENAME COLUMN state TO lost_state');
      expect(readBrokenMarker(db)).toBe('unreadable');
    });
  });

  it.each([
    ['no row', 'DELETE FROM organization_activation'],
    ['an unknown state', "UPDATE organization_activation SET state = 'on'"],
    ['activation without a time', "UPDATE organization_activation SET state = 'activated'"],
    ['a time before activation', 'UPDATE organization_activation SET activated_at = 5'],
    [
      'a second row',
      "INSERT INTO organization_activation (singleton, state) VALUES (2, 'pre_activation')",
    ],
    [
      'a text time',
      "UPDATE organization_activation SET state = 'activated', activated_at = 'soon'",
    ],
    ['a wrong singleton', 'UPDATE organization_activation SET singleton = 2'],
  ])('refuses a malformed marker with %s', (_label, corruption) => {
    withDb((db) => {
      db.run('PRAGMA ignore_check_constraints = ON');
      db.run('DROP TRIGGER organization_activation_single_row');
      db.run(corruption);
      expect(readBrokenMarker(db)).toBe('malformed');
    });
  });
});

describe('organization activation marker schema', () => {
  it.each([
    ['an unknown state', "UPDATE organization_activation SET state = 'on'"],
    ['activation without a time', "UPDATE organization_activation SET state = 'activated'"],
    [
      'a second row',
      "INSERT INTO organization_activation (singleton, state) VALUES (2, 'pre_activation')",
    ],
    [
      'a text time',
      "UPDATE organization_activation SET state = 'activated', activated_at = 'soon'",
    ],
    ['a wrong singleton', 'UPDATE organization_activation SET singleton = 2'],
  ])('refuses %s', (_label, corruption) => {
    withDb((db) => {
      expect(() => db.run(corruption)).toThrow();
      expect(readOrganizationActivation(db)).toBe('pre_activation');
    });
  });

  it.each([
    ['reset', "UPDATE organization_activation SET state = 'pre_activation', activated_at = NULL"],
    ['timestamp change', 'UPDATE organization_activation SET activated_at = 6'],
    ['delete', 'DELETE FROM organization_activation'],
    [
      'replacement',
      "INSERT OR REPLACE INTO organization_activation (singleton, state) VALUES (1, 'pre_activation')",
    ],
    [
      'upsert',
      `INSERT INTO organization_activation (singleton, state) VALUES (1, 'pre_activation')
        ON CONFLICT (singleton) DO UPDATE SET state = 'pre_activation', activated_at = NULL`,
    ],
  ])('keeps an activated marker permanent against %s', (_label, erasure) => {
    withDb((db) => {
      db.run('PRAGMA recursive_triggers = OFF');
      activate(db);
      expect(() => db.run(erasure)).toThrow(/permanent|already exists/);
    });
    expect(withDb(readOrganizationActivation)).toBe('activated');
    expect(
      withDb((db) => db.query('SELECT activated_at FROM organization_activation').get()),
    ).toEqual({
      activated_at: 5,
    });
  });

  it('stays activated after every second-organization row is deleted', () => {
    withDb((db) => {
      activate(db);
      db.run("INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)");
      db.run("DELETE FROM organization WHERE id = 'org-b'");
    });
    expect(withDb(readOrganizationActivation)).toBe('activated');
  });

  it('rolls back before activation and reapplies with a fresh seed', () => {
    expect(rollbackTo(path, FOLDER, ORGANIZATION_OWNERSHIP)).toEqual([
      '20260929100000_add_spaces',
      '20260928200000_add_work_item_status_facts',
      '20260928040000_add_email_challenge',
      '20260928030000_add_delegation_use',
      '20260928020000_add_email_verification',
      '20260928010000_add_project_solution',
      '20260927220000_add_organization_audit',
      TYPED_DEPENDENCY,
      ORGANIZATION_FROZEN,
      ORGANIZATION_BRIDGE,
      ORGANIZATION_ACTIVATION,
      STEP_ALLOWANCE,
      STEP_CODE,
    ]);
    expect(readAppliedMigrations().at(-1)).toBe(ORGANIZATION_OWNERSHIP);
    runMigrations(path, FOLDER);
    expect(readAppliedMigrations().at(-1)).toBe('20260929100000_add_spaces');
    expect(withDb(readOrganizationActivation)).toBe('pre_activation');
  });

  it.each([
    ['an activated marker', activate],
    ['a missing row', (db: Database) => db.run('DELETE FROM organization_activation')],
    ['a wrong singleton', damage('UPDATE organization_activation SET singleton = 2')],
    ['an unknown state', damage("UPDATE organization_activation SET state = 'on'")],
    ['a time before activation', damage('UPDATE organization_activation SET activated_at = 5')],
    [
      'a second row',
      (db: Database) => {
        const trigger = db
          .query<{ sql: string }, []>(
            "SELECT sql FROM sqlite_master WHERE name = 'organization_activation_single_row'",
          )
          .get()?.sql;
        if (trigger === undefined) throw new Error('organization_activation_single_row is missing');
        db.run('DROP TRIGGER organization_activation_single_row');
        db.run('PRAGMA ignore_check_constraints = ON');
        db.run(
          "INSERT INTO organization_activation (singleton, state) VALUES (2, 'pre_activation')",
        );
        db.run(trigger);
      },
    ],
  ])('refuses rollback across %s and changes nothing', (_label, prepare) => {
    // Isolate this migration's reversal: newer migrations commit their own reversal first.
    rollbackTo(path, FOLDER, ORGANIZATION_ACTIVATION);
    withDb(prepare);
    const before = withDb((db) => db.query('SELECT * FROM organization_activation').all());
    expect(() => rollbackTo(path, FOLDER, ORGANIZATION_OWNERSHIP)).toThrow(
      /permanent|organization_activation_must_be_pre_activation/,
    );
    expect(readAppliedMigrations().at(-1)).toBe(ORGANIZATION_ACTIVATION);
    expect(withDb((db) => db.query('SELECT * FROM organization_activation').all())).toEqual(before);
  });
});
