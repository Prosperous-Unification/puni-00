import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { openConnection, openDatabase } from './db';
import { HISTORICAL_DEPENDENCY_MIGRATION } from './dependency-bootstrap-history';
import { inspectDependencyBootstrap } from './dependency-migration-admission';
import { runMigrations } from './migrate';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const MAIN_END = '20261101120000_add_host_job_projection';
const DELAYED = [
  '20261022210000_add_project_abbreviations',
  '20261022211000_add_external_dependencies',
  '20261022212000_add_cross_project_dependency_activation',
  '20261022213000_add_optimization_boundary_certificates',
];
const DEPENDENCY_NAME = '20260806084828_add_dependencies';
const HISTORICAL_HASH = 'b9b22317105b8562d53f9547a1401a28409c4a4735b591de8c04f0e02e7a9aba';
/** Independent original SQL witness from the retained 24499e8a source; no archive or Git runtime dependency. */
const ORIGINAL_SQL =
  'CREATE TABLE `dependency` (\n\t`id` text PRIMARY KEY,\n\t`project_id` text NOT NULL,\n\t`predecessor_id` text NOT NULL,\n\t`successor_id` text NOT NULL,\n\tCONSTRAINT `fk_dependency_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`),\n\tCONSTRAINT `fk_dependency_predecessor_id_work_item_id_fk` FOREIGN KEY (`predecessor_id`) REFERENCES `work_item`(`id`),\n\tCONSTRAINT `fk_dependency_successor_id_work_item_id_fk` FOREIGN KEY (`successor_id`) REFERENCES `work_item`(`id`)\n);\n--> statement-breakpoint\nCREATE INDEX `dependency_project` ON `dependency` (`project_id`);--> statement-breakpoint\nCREATE UNIQUE INDEX `dependency_pair` ON `dependency` (`predecessor_id`,`successor_id`);';
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dependency-bootstrap-test-'));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function hashBytes(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
/** Reads SQL bytes independently of the production Drizzle migration reader. */
function readIdentities(folder: string) {
  return readdirSync(folder)
    .sort()
    .map((name) => ({ name, hash: hashBytes(readFileSync(join(folder, name, 'migration.sql'))) }));
}
function createKnownMain(usesHistorical: boolean): string {
  const staged = join(directory, 'main'),
    path = join(directory, 'source.db');
  mkdirSync(staged);
  const identities = readIdentities(FOLDER).filter(
    ({ name }) => name <= MAIN_END && !DELAYED.includes(name),
  );
  expect(identities).toHaveLength(103);
  expect(hashBytes(JSON.stringify(identities))).toBe(
    '68eb1ad31c377b493d20da473c6d3d18d842914f8d9179c4888f1f2b1e0123b1',
  );
  for (const { name } of identities)
    cpSync(join(FOLDER, name), join(staged, name), { recursive: true });
  if (usesHistorical) {
    expect(hashBytes(ORIGINAL_SQL)).toBe(HISTORICAL_HASH);
    expect(Buffer.byteLength(ORIGINAL_SQL)).toBe(694);
    writeFileSync(join(staged, DEPENDENCY_NAME, 'migration.sql'), ORIGINAL_SQL);
  }
  runMigrations(path, staged);
  const sqlite = openDatabase(path);
  try {
    const ledger = sqlite
      .query<{ name: string; hash: string }, []>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      )
      .all();
    expect(ledger).toHaveLength(103);
    expect(hashBytes(JSON.stringify(ledger))).toBe(
      usesHistorical
        ? 'dc311f3427af09351bf67673a43bcca065a2dc385185a95b85e04faf995c937a'
        : '68eb1ad31c377b493d20da473c6d3d18d842914f8d9179c4888f1f2b1e0123b1',
    );
    expect(
      sqlite
        .query<{ table: string; from: string; on_delete: string }, []>(
          'PRAGMA foreign_key_list(dependency)',
        )
        .all()
        .map(({ table, from, on_delete }) => ({ table, from, on_delete }))
        .sort((first, second) => first.from.localeCompare(second.from)),
    ).toEqual([
      { table: 'users', from: 'created_by', on_delete: 'NO ACTION' },
      {
        table: 'work_item',
        from: 'predecessor_id',
        on_delete: usesHistorical ? 'NO ACTION' : 'CASCADE',
      },
      { table: 'project', from: 'project_id', on_delete: 'NO ACTION' },
      {
        table: 'work_item',
        from: 'successor_id',
        on_delete: usesHistorical ? 'NO ACTION' : 'CASCADE',
      },
    ]);
    sqlite.run(
      "INSERT INTO users(id,username,password_hash,created_at) VALUES('owner','Owner','x',1)",
    );
    sqlite.run(
      "INSERT INTO project(id,name,owner_id,created_at) VALUES('plan','Original plan','owner',1)",
    );
  } finally {
    sqlite.close();
  }
  return path;
}
function snapshotDatabase(sqlite: Database) {
  const schema = sqlite
    .query('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name')
    .all();
  const tables = sqlite
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map(({ name }) => ({
      name,
      rows: sqlite.query('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all(),
    }));
  return { schema, tables };
}
function expectCertificate(path: string, folder: string, expected: 'historical' | RegExp) {
  const sqlite = openDatabase(path),
    connection = openConnection(path);
  const before = snapshotDatabase(sqlite);
  try {
    if (expected === 'historical')
      expect(inspectDependencyBootstrap(connection.db, folder)).toBe('historical');
    else expect(() => inspectDependencyBootstrap(connection.db, folder)).toThrow(expected);
  } finally {
    try {
      expect(snapshotDatabase(sqlite)).toEqual(before);
    } finally {
      connection.close();
      sqlite.close();
    }
  }
}
function mutateDatabase(path: string, statement: string) {
  const sqlite = openDatabase(path);
  try {
    sqlite.run(statement);
  } finally {
    sqlite.close();
  }
}
function stageInspectionFolder(): string {
  const staged = join(directory, 'inspection');
  cpSync(FOLDER, staged, { recursive: true });
  return staged;
}

it('pins the archived SQL hash and exact original bytes', () => {
  expect(hashBytes(HISTORICAL_DEPENDENCY_MIGRATION.sql)).toBe(HISTORICAL_HASH);
  expect(Buffer.byteLength(HISTORICAL_DEPENDENCY_MIGRATION.sql)).toBe(694);
  expect(HISTORICAL_DEPENDENCY_MIGRATION.sql).toBe(ORIGINAL_SQL);
  expect(HISTORICAL_DEPENDENCY_MIGRATION.name).toBe(DEPENDENCY_NAME);
  expect(HISTORICAL_DEPENDENCY_MIGRATION.hash).toBe(HISTORICAL_HASH);
});

for (const usesHistorical of [false, true])
  it(
    'certifies the known103 ' +
      (usesHistorical ? 'original' : 'canonical') +
      ' ledger and complete source without mutation',
    () => {
      expectCertificate(createKnownMain(usesHistorical), FOLDER, 'historical');
    },
  );

const corruptions = [
  [
    "UPDATE __drizzle_migrations SET hash='altered' WHERE name='20261101120000_add_host_job_projection'",
    /uncertified dependency authority history/,
  ],
  [
    "DELETE FROM __drizzle_migrations WHERE name='20261101120000_add_host_job_projection'",
    /uncertified dependency authority migration set/,
  ],
  [
    "UPDATE __drizzle_migrations SET name='20261101120001_unknown' WHERE name='20261101120000_add_host_job_projection'",
    /uncertified dependency authority history/,
  ],
  ['DROP INDEX actual_by_step', /uncertified dependency authority schema/],
  ['DROP TABLE __drizzle_migrations', /__drizzle_migrations/],
  ['ALTER TABLE __drizzle_migrations RENAME COLUMN hash TO unreadable_hash', /hash/],
  [
    "UPDATE __drizzle_migrations SET name=X'41' WHERE name='20261101120000_add_host_job_projection'",
    /uncertified dependency authority migration set/,
  ],
  [
    "UPDATE __drizzle_migrations SET name=NULL WHERE name='20261101120000_add_host_job_projection'",
    /uncertified dependency authority migration set/,
  ],
  [
    "UPDATE __drizzle_migrations SET name=41 WHERE name='20261101120000_add_host_job_projection'",
    /uncertified dependency authority migration set/,
  ],
] as const;
for (const [statement, diagnostic] of corruptions)
  it('refuses uncertified103 source: ' + statement, () => {
    const path = createKnownMain(false);
    mutateDatabase(path, statement);
    expectCertificate(path, FOLDER, diagnostic);
  });

for (const name of DELAYED)
  it('refuses a partial delayed ledger entry: ' + name, () => {
    const path = createKnownMain(false),
      sqlite = openDatabase(path);
    const identity = readIdentities(FOLDER).find((entry) => entry.name === name);
    if (identity === undefined)
      throw new Error('required delayed fixture identity is absent: ' + name);
    try {
      sqlite
        .query('INSERT INTO __drizzle_migrations(name,hash,created_at) VALUES(?,?,1)')
        .run(name, identity.hash);
    } finally {
      sqlite.close();
    }
    expectCertificate(path, FOLDER, /uncertified dependency authority history/);
  });

it('refuses matching altered disk and ledger outside the pinned profile', () => {
  const path = createKnownMain(false),
    staged = stageInspectionFolder();
  const sqlPath = join(staged, MAIN_END, 'migration.sql');
  const sql = readFileSync(sqlPath, 'utf8') + '\n-- unrecognized historical identity\n';
  writeFileSync(sqlPath, sql);
  const sqlite = openDatabase(path);
  try {
    sqlite
      .query('UPDATE __drizzle_migrations SET hash=? WHERE name=?')
      .run(hashBytes(sql), MAIN_END);
  } finally {
    sqlite.close();
  }
  expectCertificate(path, staged, /uncertified dependency authority migration set/);
});

for (const usesHistorical of [false, true])
  it(
    'refuses an unknown dependency hash on ' +
      (usesHistorical ? 'original' : 'canonical') +
      ' schema',
    () => {
      const path = createKnownMain(usesHistorical);
      mutateDatabase(
        path,
        "UPDATE __drizzle_migrations SET hash='unknown' WHERE name='20260806084828_add_dependencies'",
      );
      expectCertificate(path, FOLDER, /uncertified dependency authority history/);
    },
  );

it('refuses the historical dependency hash paired with canonical cascading schema', () => {
  const path = createKnownMain(false),
    sqlite = openDatabase(path);
  try {
    sqlite
      .query('UPDATE __drizzle_migrations SET hash=? WHERE name=?')
      .run(HISTORICAL_HASH, DEPENDENCY_NAME);
  } finally {
    sqlite.close();
  }
  expectCertificate(path, FOLDER, /uncertified dependency authority schema/);
});

for (const pending of ['20261023000000_probe_inside_history', '20261231000000_probe_forward'])
  it('distinguishes pending migration placement: ' + pending, () => {
    const path = createKnownMain(false),
      staged = stageInspectionFolder();
    if (pending === '20261231000000_probe_forward')
      expect(readIdentities(staged).every(({ name }) => name < pending)).toBe(true);
    const folder = join(staged, pending);
    mkdirSync(folder);
    writeFileSync(
      join(folder, 'migration.sql'),
      'CREATE TABLE bootstrap_pending_probe(id INTEGER);',
    );
    writeFileSync(join(folder, 'down.sql'), 'DROP TABLE bootstrap_pending_probe;');
    expectCertificate(
      path,
      staged,
      pending === '20261231000000_probe_forward'
        ? 'historical'
        : /uncertified dependency authority migration set/,
    );
  });
