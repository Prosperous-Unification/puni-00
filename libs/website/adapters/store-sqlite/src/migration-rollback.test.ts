import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { websiteMigrations } from './migration-catalogue';
import { WebsiteStore } from './store';

const schemaQuery =
  "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name";

/** A fresh in-memory database with every catalogue migration through `last` applied as raw SQL. */
function migrateThrough(last: number): Database {
  const database = new Database(':memory:');
  database.run('PRAGMA foreign_keys = ON');
  for (const migration of websiteMigrations().slice(0, last + 1))
    database.run(readFileSync(join(migration.directory, 'migration.sql'), 'utf8'));
  return database;
}

function readDown(directory: string): string {
  return readFileSync(join(directory, 'down.sql'), 'utf8');
}

test('every website migration ships a down.sql', () => {
  const missing = websiteMigrations().filter(
    (migration) => !existsSync(join(migration.directory, 'down.sql')),
  );
  expect(missing.map((migration) => migration.name)).toEqual([]);
});

for (const [index, migration] of websiteMigrations().entries())
  test(`${migration.name} down.sql restores the exact schema before it`, () => {
    const database = migrateThrough(index);
    const expected = migrateThrough(index - 1);
    try {
      // Proof: deleting the last statement of 001_initial/down.sql left a table behind here.
      database.run(readDown(migration.directory));
      expect(database.query(schemaQuery).all()).toEqual(expected.query(schemaQuery).all());
    } finally {
      database.close();
      expected.close();
    }
  });

test('the downs applied newest first take the full schema back to empty', () => {
  const migrations = websiteMigrations();
  const database = migrateThrough(migrations.length - 1);
  try {
    for (const migration of migrations.toReversed()) database.run(readDown(migration.directory));
    expect(database.query(schemaQuery).all()).toEqual([]);
  } finally {
    database.close();
  }
});

test('the current store starts on a database a newer release migrated additively', () => {
  const directory = mkdtempSync(join(tmpdir(), 'puni-migration-rollback-'));
  const path = join(directory, 'website.sqlite');
  try {
    new WebsiteStore(path).close();
    const newer = new Database(path);
    newer.run('CREATE TABLE future_feature (id TEXT PRIMARY KEY)');
    newer
      .query('INSERT INTO schema_migration (name, checksum) VALUES (?, ?)')
      .run('999_future_feature', 'f'.repeat(64));
    newer.close();
    // A release rollback runs the previous API on the schema the newer one left behind.
    // Proof: refusing an applied migration missing from the catalogue made this throw.
    const reopened = new WebsiteStore(path);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
