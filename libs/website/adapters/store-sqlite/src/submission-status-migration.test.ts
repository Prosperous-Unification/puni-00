import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { websiteMigrations } from './migration-catalogue';

test('irrelevant marking adds and rolls back its own column with prior submissions intact', () => {
  using database = new Database(':memory:');
  const migrations = websiteMigrations();
  const index = migrations.findIndex(({ name }) => name === '016_submission_irrelevant');
  if (index < 0) throw new Error('Missing submission migration');
  const migration = migrations[index];
  for (const { directory } of migrations.slice(0, index))
    database.run(readFileSync(join(directory, 'migration.sql'), 'utf8'));

  database.run(`INSERT INTO intake_draft (id, description, claim_hash, created_at, expires_at)
    VALUES ('draft', 'Preserve this description', 'claim', 1, 100);
    INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at)
    VALUES ('proposal', 'draft', 'owner@example.test', 'Brief', 'receipt', 'contacted', 2, 3)`);
  const display = 'SELECT id, email, brief, receipt, status FROM proposal_submission';
  const original = database.query(display).get();
  database.run(readFileSync(join(migration.directory, 'migration.sql'), 'utf8'));
  expect(database.query('SELECT irrelevant_at FROM proposal_submission').get()).toEqual({
    irrelevant_at: null,
  });
  expect(database.query(display).get()).toEqual(original);
  database.run('UPDATE proposal_submission SET irrelevant_at = 4');
  database.run(readFileSync(join(migration.directory, 'down.sql'), 'utf8'));
  expect(database.query(display).get()).toEqual(original);
  expect(
    database
      .query(
        "SELECT name FROM pragma_table_info('proposal_submission') WHERE name = 'irrelevant_at'",
      )
      .all(),
  ).toEqual([]);
});
