import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { readMigrationFolders, rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const BASELINE = '20261110100000_rename_project_to_work_package';
const AUDIT = '20261110110100_widen_organization_audit_projects';
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'audit-projects-'));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function prepareStore() {
  const migrations = join(directory, 'migrations');
  mkdirSync(migrations);
  for (const migration of readMigrationFolders(FOLDER).filter(({ name }) => name < BASELINE))
    cpSync(join(FOLDER, migration.name), join(migrations, migration.name), { recursive: true });
  const path = join(directory, 'store.db');
  runMigrations(path, migrations);
  cpSync(join(FOLDER, BASELINE), join(migrations, BASELINE), { recursive: true });
  runMigrations(path, migrations);
  const sqlite = openDatabase(path);
  try {
    sqlite.run("INSERT INTO organization(id,name,created_at) VALUES('org','Org',1)");
  } finally {
    sqlite.close();
  }
  return { path, migrations };
}

function installAudit(store: { path: string; migrations: string }): void {
  for (const migration of readMigrationFolders(FOLDER).filter(
    ({ name }) => name > BASELINE && name <= AUDIT,
  ))
    cpSync(join(FOLDER, migration.name), join(store.migrations, migration.name), {
      recursive: true,
    });
  runMigrations(store.path, store.migrations);
}

it('widens the actual audit CHECKs while preserving every old vocabulary, row, index and append-only trigger', () => {
  const store = prepareStore();
  const sqlite = openDatabase(store.path);
  let before;
  try {
    const schema = sqlite
      .query<{ sql: string }, []>("SELECT sql FROM sqlite_master WHERE name='organization_audit'")
      .get();
    if (schema === null) throw new Error('audit schema absent');
    const enums = [
      ...schema.sql.matchAll(/CHECK\s*\(`?(action|subject_kind)`? IN\s*\(([\s\S]*?)\)\)/g),
    ];
    expect(enums).toHaveLength(2);
    for (const enumeration of enums)
      for (const [ordinal, literal] of [...enumeration[2].matchAll(/'([^']+)'/g)].entries()) {
        const action = enumeration[1] === 'action' ? literal[1] : 'access_granted';
        const kind = enumeration[1] === 'subject_kind' ? literal[1] : 'access_grant';
        sqlite
          .query(
            'INSERT INTO organization_audit(id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at) VALUES(?,?,?,?,?,?,?,?)',
          )
          .run(
            enumeration[1] + '-' + String(ordinal),
            'org',
            'actor',
            action,
            kind,
            'subject-' + String(ordinal),
            JSON.stringify({
              credentialId: 'credential-' + String(ordinal),
              runId: 'run-' + String(ordinal),
              retained: 'projectId user bytes',
            }),
            ordinal * 86400000,
          );
      }
    before = {
      rows: sqlite.query('SELECT * FROM organization_audit ORDER BY id').all(),
      objects: sqlite
        .query(
          "SELECT type,name,sql FROM sqlite_master WHERE tbl_name='organization_audit' AND type!='table' ORDER BY type,name",
        )
        .all(),
    };
  } finally {
    sqlite.close();
  }
  installAudit(store);
  const migrated = openDatabase(store.path);
  try {
    expect(migrated.query('SELECT * FROM organization_audit ORDER BY id').all()).toEqual(
      before.rows,
    );
    expect(
      migrated
        .query(
          "SELECT type,name,sql FROM sqlite_master WHERE tbl_name='organization_audit' AND type!='table' ORDER BY type,name",
        )
        .all(),
    ).toEqual(before.objects);
    for (const action of [
      'project_created',
      'project_renamed',
      'project_deleted',
      'work_package_moved',
    ])
      migrated
        .query(
          "INSERT INTO organization_audit(id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at) VALUES(?,'org','actor',?,'project','project-id','{}',100)",
        )
        .run(action, action);
    expect(() =>
      migrated.run("UPDATE organization_audit SET detail='{}' WHERE id='project_created'"),
    ).toThrow('append-only');
    expect(() => migrated.run("DELETE FROM organization_audit WHERE id='project_created'")).toThrow(
      'append-only',
    );
    expect(() =>
      migrated.run(
        "INSERT INTO organization_audit(id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at) VALUES('unknown','org','actor','unknown','project','p','{}',1)",
      ),
    ).toThrow('CHECK');
    expect(() =>
      migrated.run(
        "INSERT INTO organization_audit(id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at) VALUES('unknown','org','actor','project_created','unknown','p','{}',1)",
      ),
    ).toThrow('CHECK');
    for (const action of ['machine_token_issued', 'machine_token_issued_overflow']) {
      const existing = migrated
        .query<{ detail: string; created_at: number }, [string]>(
          'SELECT detail,created_at FROM organization_audit WHERE action=?',
        )
        .get(action);
      if (existing === null) throw new Error('seeded audit uniqueness witness absent');
      expect(() =>
        migrated
          .query(
            "INSERT INTO organization_audit(id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at) VALUES(?,'org','actor',?,'machine_credential','credential',?,?)",
          )
          .run('duplicate-' + action, action, existing.detail, existing.created_at),
      ).toThrow('UNIQUE');
    }
    expect(migrated.query('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    migrated.close();
  }
});

it('refuses audit rollback and retains the complete audit rows and migration ledger', () => {
  const store = prepareStore();
  installAudit(store);
  const snapshot = () => {
    const sqlite = openDatabase(store.path);
    try {
      return {
        schema: sqlite.query('SELECT * FROM sqlite_master ORDER BY type,name').all(),
        audit: sqlite.query('SELECT * FROM organization_audit ORDER BY id').all(),
        ledger: sqlite.query('SELECT * FROM __drizzle_migrations ORDER BY id').all(),
      };
    } finally {
      sqlite.close();
    }
  };
  const before = snapshot();
  expect(() => rollbackTo(store.path, store.migrations, BASELINE)).toThrow(
    'audit project rollback requires restoring the verified window snapshot',
  );
  expect(snapshot()).toEqual(before);
});

it('refuses an invalid audit foreign key introduced after the project migration and preserves the full store', () => {
  const store = prepareStore();
  const project = '20261110110000_add_project';
  cpSync(join(FOLDER, project), join(store.migrations, project), { recursive: true });
  runMigrations(store.path, store.migrations);
  const sqlite = openDatabase(store.path);
  try {
    sqlite.run('PRAGMA foreign_keys=OFF');
    sqlite.run(
      "INSERT INTO organization_audit(id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at) VALUES('orphan','absent','actor','access_granted','access_grant','grant','{}',1)",
    );
  } finally {
    sqlite.close();
  }
  const snapshot = () => {
    const connection = openDatabase(store.path);
    try {
      return {
        schema: connection.query('SELECT * FROM sqlite_master ORDER BY type,name').all(),
        audit: connection.query('SELECT * FROM organization_audit ORDER BY id').all(),
        ledger: connection.query('SELECT * FROM __drizzle_migrations ORDER BY id').all(),
        tables: connection
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all()
          .map(({ name }) => ({
            name,
            rows: connection
              .query('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid')
              .all(),
          })),
      };
    } finally {
      connection.close();
    }
  };
  const before = snapshot();
  let refusal: unknown;
  try {
    installAudit(store);
  } catch (error) {
    refusal = error;
  }
  expect(refusal).toBeInstanceOf(Error);
  while (refusal instanceof Error && refusal.cause !== undefined) refusal = refusal.cause;
  if (!(refusal instanceof Error)) throw new Error('audit migration refusal absent');
  expect(refusal.message).toContain('violations = 0');
  expect(snapshot()).toEqual(before);
});
