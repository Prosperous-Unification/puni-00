import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { copyRecoveryPrefix, readRecoveryState } from './testing/recovery-state';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function identities(path: string) {
  const sqlite = openDatabase(path);
  try {
    return sqlite.query('SELECT name,hash FROM __drizzle_migrations ORDER BY name').all();
  } finally {
    sqlite.close();
  }
}
function prepare(through: string) {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-historical-recovery-'));
  directories.push(directory);
  const folder = copyRecoveryPrefix(directory, through),
    path = join(directory, 'old.sqlite');
  runMigrations(path, folder);
  const sqlite = openDatabase(path);
  try {
    sqlite.run("INSERT INTO users(id,username,password_hash,created_at) VALUES('ada','ada','x',1)");
    sqlite.run("INSERT INTO organization(id,name,created_at) VALUES('org-a','A',1)");
    sqlite.run(
      "INSERT INTO project(id,name,owner_id,created_at,created_by) VALUES('a1','A','ada',1,'ada')",
    );
    sqlite.run(
      "INSERT INTO project_organization(resource_id,organization_id) VALUES('a1','org-a')",
    );
    sqlite.run(
      "INSERT INTO project_rank(project_id,organization_id,position,created_at,updated_at,created_by) VALUES('a1','org-a',3,1,2,'ada')",
    );
  } finally {
    sqlite.close();
  }
  return { path, folder };
}
it('historical rank prefix refuses populated downgrade and reinstalls only its exact old schema', () => {
  const { path, folder } = prepare('20260929180000_add_project_rank'),
    before = readRecoveryState(path),
    ledger = identities(path);
  expect(() => rollbackTo(path, folder, '20260929100000_add_spaces')).toThrow(
    'project ranks exist',
  );
  expect(readRecoveryState(path)).toEqual(before);
  let sqlite = openDatabase(path);
  let saved: unknown[];
  try {
    saved = sqlite.query('SELECT * FROM project_rank ORDER BY project_id').all();
    sqlite.run('DELETE FROM project_rank');
  } finally {
    sqlite.close();
  }
  expect(rollbackTo(path, folder, '20260929100000_add_spaces')).toEqual([
    '20260929180000_add_project_rank',
  ]);
  runMigrations(path, folder);
  sqlite = openDatabase(path);
  try {
    sqlite.run(
      "INSERT INTO project_rank(project_id,organization_id,position,created_at,updated_at,created_by) VALUES('a1','org-a',3,1,2,'ada')",
    );
    expect(sqlite.query('SELECT * FROM project_rank ORDER BY project_id').all()).toEqual(saved);
  } finally {
    sqlite.close();
  }
  expect(identities(path)).toEqual(ledger);
  expect(
    readRecoveryState(path).schema.map(({ type, name, tbl_name }) => ({ type, name, tbl_name })),
  ).toEqual(before.schema.map(({ type, name, tbl_name }) => ({ type, name, tbl_name })));
});
it('historical shared downgrade guards both saved facts and retains complete ordered migration selection', () => {
  const { path, folder } = prepare('20261103110000_add_initial_access_offers');
  let sqlite = openDatabase(path);
  try {
    sqlite.run("UPDATE organization SET shared_people=1 WHERE id='org-a'");
  } finally {
    sqlite.close();
  }
  const before = readRecoveryState(path),
    ledger = identities(path);
  // Probe the shared migration at its own historical epoch after later empty additions settle.
  rollbackTo(path, folder, '20261005110000_add_shared_people');
  const atShared = readRecoveryState(path);
  expect(() =>
    rollbackTo(path, folder, '20261001010000_add_browser_credential_revocations'),
  ).toThrow('shared organizations exist');
  expect(readRecoveryState(path)).toEqual(atShared);
  sqlite = openDatabase(path);
  try {
    sqlite.run("UPDATE organization SET shared_people=0 WHERE id='org-a'");
  } finally {
    sqlite.close();
  }
  const ranked = readRecoveryState(path);
  expect(() =>
    rollbackTo(path, folder, '20261001010000_add_browser_credential_revocations'),
  ).toThrow('project ranks exist');
  expect(readRecoveryState(path)).toEqual(ranked);
  // Reinstall only the same immutable110 prefix before exercising complete ordered removal.
  runMigrations(path, folder);
  sqlite = openDatabase(path);
  let expected: string[];
  try {
    sqlite.run('DELETE FROM project_rank');
    sqlite.run('UPDATE organization SET shared_people=0');
    expected = sqlite
      .query<{ name: string }, [string]>(
        'SELECT name FROM __drizzle_migrations WHERE name>? ORDER BY id DESC',
      )
      .all('20261001010000_add_browser_credential_revocations')
      .map((each) => each.name);
  } finally {
    sqlite.close();
  }
  expect(expected).toContain('20261015110000_add_step_node_parallelism');
  expect(rollbackTo(path, folder, '20261001010000_add_browser_credential_revocations')).toEqual(
    expected,
  );
  runMigrations(path, folder);
  sqlite = openDatabase(path);
  try {
    sqlite.run(
      "INSERT INTO project_rank(project_id,organization_id,position,created_at,updated_at,created_by) VALUES('a1','org-a',3,1,2,'ada')",
    );
    sqlite.run("UPDATE organization SET shared_people=1 WHERE id='org-a'");
  } finally {
    sqlite.close();
  }
  expect(identities(path)).toEqual(ledger);
  const after = readRecoveryState(path);
  expect(after.schema.map(({ type, name, tbl_name }) => ({ type, name, tbl_name }))).toEqual(
    before.schema.map(({ type, name, tbl_name }) => ({ type, name, tbl_name })),
  );
  for (const name of ['users', 'organization', 'project', 'project_organization', 'project_rank'])
    expect(after.tables.find((table) => table.name === name)).toEqual(
      before.tables.find((table) => table.name === name),
    );
});
