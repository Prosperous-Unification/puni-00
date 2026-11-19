import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { readMigrationFolders, rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const BASELINE = '20261110100000_rename_project_to_work_package';
const PROJECT = '20261110110000_add_project';
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'engagement-project-'));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function withinStore<T>(path: string, use: (sqlite: Database) => T): T {
  const sqlite = openDatabase(path);
  try {
    return use(sqlite);
  } finally {
    sqlite.close();
  }
}

function prepareStore() {
  const migrations = join(directory, 'migrations');
  mkdirSync(migrations);
  const preceding = readMigrationFolders(FOLDER).filter(({ name }) => name < BASELINE);
  expect(preceding).toHaveLength(110);
  for (const migration of preceding)
    cpSync(join(FOLDER, migration.name), join(migrations, migration.name), { recursive: true });
  const path = join(directory, 'store.db');
  runMigrations(path, migrations);
  cpSync(join(FOLDER, BASELINE), join(migrations, BASELINE), { recursive: true });
  runMigrations(path, migrations);
  withinStore(path, (sqlite) => {
    sqlite.run(
      "INSERT INTO users(id,username,created_at) VALUES('owner','Owner',1),('author','Author',1)",
    );
    sqlite.run(
      "INSERT INTO organization(id,name,created_at) VALUES('org-a','A',1),('org-b','B',1),('empty','Empty',1)",
    );
    sqlite.run(
      "INSERT INTO work_package(id,name,owner_id,created_by,created_at,revision) VALUES('a','A','owner',NULL,2,4),('b','B','owner','author',3,7),('c','C','owner',NULL,4,2)",
    );
    sqlite.run(
      "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('a','org-a'),('b','org-a'),('c','org-b')",
    );
    sqlite.run("INSERT INTO step(id,work_package_id,name,code) VALUES('step','a','Develop','DEV')");
    sqlite.run(
      "INSERT INTO work_item(id,work_package_id,parent_id,position,name) VALUES('root','a',NULL,0,'Root'),('child','a','root',0,'Child')",
    );
    sqlite.run(
      "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('grant','org-a','work_package','a','user','owner','package-manager','backfill',1)",
    );
  });
  return { path, migrations };
}

function installProject(store: { path: string; migrations: string }): void {
  // Selecting available folders lets the first RED reach the existing migrator and schema.
  for (const migration of readMigrationFolders(FOLDER).filter(({ name }) => name === PROJECT))
    cpSync(join(FOLDER, migration.name), join(store.migrations, migration.name), {
      recursive: true,
    });
  runMigrations(store.path, store.migrations);
}

function snapshotStore(path: string) {
  return withinStore(path, (sqlite) => ({
    schema: sqlite
      .query('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name')
      .all(),
    tables: sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map(({ name }) => ({
        name,
        rows: sqlite
          .query('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid')
          .all(),
      })),
  }));
}

function expectRefusal(invoke: () => void, diagnostic: string): void {
  let failure: unknown;
  try {
    invoke();
  } catch (error: unknown) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  while (failure instanceof Error && failure.cause !== undefined) failure = failure.cause;
  if (!(failure instanceof Error)) throw new Error('native refusal absent');
  expect(failure.message).toContain(diagnostic);
}

it('the actual migrator creates one engagement project per populated organization and mandatory parents', () => {
  const store = prepareStore();
  const retained = withinStore(store.path, (sqlite) => ({
    packages: sqlite
      .query<
        { [column: string]: string | number | null; owner_id: string; created_by: string | null },
        []
      >('SELECT * FROM work_package ORDER BY id')
      .all()
      .map(({ owner_id, created_by, ...columns }) => ({
        ...columns,
        created_by: created_by ?? owner_id,
      })),
    tree: sqlite.query('SELECT * FROM work_item ORDER BY id').all(),
    codes: sqlite.query('SELECT * FROM work_package_abbreviation ORDER BY work_package_id').all(),
    grants: sqlite.query('SELECT * FROM access_grant ORDER BY id').all(),
    columns: sqlite
      .query<
        {
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
        },
        []
      >('PRAGMA table_info(work_package)')
      .all()
      .filter(({ name }) => name !== 'owner_id')
      .map(({ cid: _position, ...column }) => ({
        ...column,
        notnull: column.name === 'created_by' ? 1 : column.notnull,
      })),
    constraintNames: sqlite
      .query<{ sql: string }, []>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='work_package'",
      )
      .all()
      .flatMap(({ sql }) => [...sql.matchAll(/CONSTRAINT\s+`([^`]+)`/g)].map((match) => match[1]))
      .filter((name) => name !== 'fk_project_owner_id_users_id_fk'),
    objects: sqlite
      .query(
        "SELECT type,name,sql FROM sqlite_master WHERE type IN ('index','trigger','view') ORDER BY type,name",
      )
      .all(),
  }));
  installProject(store);
  withinStore(store.path, (sqlite) => {
    expect(
      sqlite.query("SELECT name FROM sqlite_master WHERE type='table' AND name='project'").get(),
    ).toEqual({ name: 'project' });
    expect(
      sqlite
        .query(
          'SELECT organization_id,name,created_at,created_by,revision FROM project ORDER BY organization_id',
        )
        .all(),
    ).toEqual([
      {
        organization_id: 'org-a',
        name: 'Migrated work packages',
        created_at: 2,
        created_by: null,
        revision: 0,
      },
      {
        organization_id: 'org-b',
        name: 'Migrated work packages',
        created_at: 4,
        created_by: null,
        revision: 0,
      },
    ]);
    expect(
      sqlite
        .query(
          'SELECT w.id,p.organization_id,w.created_by,w.revision FROM work_package w JOIN project p ON p.id=w.project_id ORDER BY w.id',
        )
        .all(),
    ).toEqual([
      { id: 'a', organization_id: 'org-a', created_by: 'owner', revision: 4 },
      { id: 'b', organization_id: 'org-a', created_by: 'author', revision: 7 },
      { id: 'c', organization_id: 'org-b', created_by: 'owner', revision: 2 },
    ]);
    const columns = sqlite
      .query<{ name: string; notnull: number }, []>('PRAGMA table_info(work_package)')
      .all();
    expect(columns.some(({ name }) => name === 'owner_id')).toBe(false);
    expect(columns.find(({ name }) => name === 'project_id')?.notnull).toBe(1);
    expect(columns.find(({ name }) => name === 'created_by')?.notnull).toBe(1);
    expect(
      sqlite
        .query<
          {
            cid: number;
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
          },
          []
        >('PRAGMA table_info(work_package)')
        .all()
        .filter(({ name }) => name !== 'project_id')
        .map(({ cid: _position, ...column }) => column),
    ).toEqual(retained.columns);
    expect(
      sqlite
        .query<{ sql: string }, []>(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='work_package'",
        )
        .all()
        .flatMap(({ sql }) =>
          [...sql.matchAll(/CONSTRAINT\s+`([^`]+)`/g)].map((match) => match[1]),
        ),
    ).toEqual(retained.constraintNames);
    expect(
      sqlite
        .query<{ [column: string]: string | number | null; project_id: string }, []>(
          'SELECT * FROM work_package ORDER BY id',
        )
        .all()
        .map(({ project_id: _parent, ...columns }) => columns),
    ).toEqual(retained.packages);
    expect(sqlite.query('SELECT * FROM work_item ORDER BY id').all()).toEqual(retained.tree);
    expect(
      sqlite.query('SELECT * FROM work_package_abbreviation ORDER BY work_package_id').all(),
    ).toEqual(retained.codes);
    expect(sqlite.query('SELECT * FROM access_grant ORDER BY id').all()).toEqual(retained.grants);
    expect(
      sqlite
        .query(
          "SELECT type,name,sql FROM sqlite_master WHERE type IN ('index','trigger','view') AND name NOT LIKE 'sqlite_autoindex_project_%' AND name NOT IN ('work_package_project_organization_insert','work_package_project_organization_update','work_package_project_ownership_insert','project_work_package_organization_update') ORDER BY type,name",
        )
        .all(),
    ).toEqual(retained.objects);
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

it('refuses an unmapped work package atomically', () => {
  const store = prepareStore();
  withinStore(store.path, (sqlite) =>
    sqlite.run(
      "INSERT INTO work_package(id,name,owner_id,created_at) VALUES('unmapped','Unmapped','owner',5)",
    ),
  );
  const before = snapshotStore(store.path);
  expectRefusal(() => {
    installProject(store);
  }, 'project backfill requires organization ownership and creator');
  expect(snapshotStore(store.path)).toEqual(before);
});

it('refuses a missing access-grant predecessor atomically', () => {
  const store = prepareStore();
  withinStore(store.path, (sqlite) => sqlite.run('DROP TABLE access_grant'));
  const before = snapshotStore(store.path);
  expectRefusal(() => {
    installProject(store);
  }, 'no such table: access_grant');
  expect(snapshotStore(store.path)).toEqual(before);
});

it('refuses an unavailable historical creator atomically', () => {
  const store = prepareStore();
  withinStore(store.path, (sqlite) => {
    sqlite.run('PRAGMA foreign_keys=OFF');
    sqlite.run("UPDATE work_package SET owner_id='absent',created_by=NULL WHERE id='a'");
  });
  const before = snapshotStore(store.path);
  expectRefusal(() => {
    installProject(store);
  }, 'project backfill foreign keys invalid');
  expect(snapshotStore(store.path)).toEqual(before);
});

it('requires a real parent and creator and preserves organization ownership on parent changes', () => {
  const store = prepareStore();
  installProject(store);
  withinStore(store.path, (sqlite) => {
    expectRefusal(
      () =>
        sqlite.run(
          "INSERT INTO work_package(id,name,created_by,created_at) VALUES('missing','Missing','owner',5)",
        ),
      'NOT NULL',
    );
    expectRefusal(
      () =>
        sqlite.run(
          "INSERT INTO work_package(id,project_id,name,created_by,created_at) VALUES('bad','absent','Bad','owner',5)",
        ),
      'FOREIGN KEY',
    );
    expectRefusal(
      () => sqlite.run("UPDATE work_package SET created_by=NULL WHERE id='a'"),
      'NOT NULL',
    );
    expectRefusal(
      () =>
        sqlite.run(
          "UPDATE work_package SET project_id=(SELECT id FROM project WHERE organization_id='org-b') WHERE id='a'",
        ),
      'work package project organization mismatch',
    );
    expectRefusal(
      () =>
        sqlite.run(
          "UPDATE project SET organization_id='org-b',name='Moved parent' WHERE organization_id='org-a'",
        ),
      'work package project organization mismatch',
    );
    sqlite.run(
      "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('another','org-a','Another',5,'author')",
    );
    sqlite.run("UPDATE work_package SET project_id='another' WHERE id='a'");
    expect(sqlite.query("SELECT project_id FROM work_package WHERE id='a'").get()).toEqual({
      project_id: 'another',
    });
  });
});

it('refuses project rollback without changing schema, rows or the complete ledger', () => {
  const store = prepareStore();
  installProject(store);
  const before = snapshotStore(store.path);
  expectRefusal(
    () => rollbackTo(store.path, store.migrations, BASELINE),
    'project rollback requires restoring the verified window snapshot',
  );
  expect(snapshotStore(store.path)).toEqual(before);
});

it('refuses cross-organization ownership in the actual insert-then-map order and the legacy bridge', () => {
  const store = prepareStore();
  installProject(store);
  withinStore(store.path, (sqlite) => {
    sqlite.run("UPDATE organization SET legacy=1 WHERE id='org-a'");
    expectRefusal(
      () =>
        sqlite.run(
          "INSERT INTO work_package(id,project_id,name,created_by,created_at) SELECT 'legacy-bad',id,'Bad','owner',5 FROM project WHERE organization_id='org-b'",
        ),
      'work package project organization mismatch',
    );
    expect(sqlite.query("SELECT id FROM work_package WHERE id='legacy-bad'").get()).toBeNull();
    sqlite.run("UPDATE organization_activation SET state='activated',activated_at=10");
    sqlite.run(
      "INSERT INTO work_package(id,project_id,name,created_by,created_at) SELECT 'new',id,'New','owner',5 FROM project WHERE organization_id='org-a'",
    );
    expectRefusal(
      () =>
        sqlite.run(
          "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('new','org-b')",
        ),
      'work package project organization mismatch',
    );
    sqlite.run(
      "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('new','org-a')",
    );
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

it('retains project name, organization and creator constraints without inventing an actor', () => {
  const store = prepareStore();
  installProject(store);
  withinStore(store.path, (sqlite) => {
    expectRefusal(
      () =>
        sqlite.run(
          "INSERT INTO project(id,organization_id,name,created_at) VALUES('duplicate','org-a','Migrated work packages',5)",
        ),
      'UNIQUE',
    );
    expectRefusal(
      () =>
        sqlite.run(
          "INSERT INTO project(id,organization_id,name,created_at) VALUES('blank','org-a','',5)",
        ),
      'CHECK',
    );
    expectRefusal(
      () =>
        sqlite.run(
          "INSERT INTO project(id,organization_id,name,created_at) VALUES('missing-org','absent','New',5)",
        ),
      'FOREIGN KEY',
    );
    expectRefusal(
      () =>
        sqlite.run(
          "INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES('missing-author','org-a','New',5,'absent')",
        ),
      'FOREIGN KEY',
    );
    expect(
      sqlite
        .query<{ name: string }, []>('PRAGMA table_info(project)')
        .all()
        .some((column) => column.name === 'space_id'),
    ).toBe(false);
  });
});

it('also rejects a cross-organization parent when deferred ownership is inserted first', () => {
  const store = prepareStore();
  installProject(store);
  withinStore(store.path, (sqlite) => {
    sqlite.run('BEGIN');
    try {
      sqlite.run('PRAGMA defer_foreign_keys=ON');
      sqlite.run(
        "INSERT INTO work_package_organization(resource_id,organization_id) VALUES('premapped','org-b')",
      );
      expectRefusal(
        () =>
          sqlite.run(
            "INSERT INTO work_package(id,project_id,name,created_by,created_at) SELECT 'premapped',id,'Premapped','owner',5 FROM project WHERE organization_id='org-a'",
          ),
        'work package project organization mismatch',
      );
    } finally {
      sqlite.run('ROLLBACK');
    }
    expect(
      sqlite
        .query("SELECT resource_id FROM work_package_organization WHERE resource_id='premapped'")
        .get(),
    ).toBeNull();
  });
});
