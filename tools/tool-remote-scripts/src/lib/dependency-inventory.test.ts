import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { buildDependencyInventoryCommand, decodeDormantDependencies } from './dependency-inventory';
import { storedSnapshotCommand } from './sqlite-probe';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});
const authority = '20261022212000_add_cross_project_dependency_activation';
const external = '20261022211000_add_external_dependencies';
const dormant = {
  protocol: 'wbs-dependency-preservation',
  version: 1,
  state: 'DISABLED',
  externalRelationships: 0,
} as const;
function fixture(transform: (sql: string) => string = (sql) => sql) {
  const root = mkdtempSync(join(tmpdir(), 'dependency-inventory-'));
  roots.push(root);
  const path = join(root, 'wbs.db');
  const sqlite = new Database(path, { create: true });
  // Minimal relationship/ledger fixture plus the exact authority migration, without product imports.
  sqlite.run(
    `CREATE TABLE __drizzle_migrations(name TEXT,hash TEXT); CREATE TABLE external_dependency(id TEXT);`,
  );
  for (const name of [authority, external])
    sqlite.run('INSERT INTO __drizzle_migrations VALUES (?,?)', [name, 'a'.repeat(64)]);
  sqlite.run(
    transform(
      readFileSync(
        new URL(`../../../../apps/wbs/be-01/drizzle/${authority}/migration.sql`, import.meta.url),
        'utf8',
      ),
    ),
  );
  return { sqlite, path };
}
function observe(path: string) {
  const child = Bun.spawnSync(storedSnapshotCommand(buildDependencyInventoryCommand()), {
    env: { ...process.env, DB_PATH: path },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return decodeDormantDependencies(child.stdout.toString());
}
test('coordinator generated command admits only dormant authority', () => {
  const { sqlite, path } = fixture();
  sqlite.close();
  expect(observe(path)).toEqual(dormant);
});
for (const [fault, sql] of Object.entries({
  enabled: "UPDATE cross_project_dependency_activation SET state='ENABLED'",
  marker: 'DELETE FROM cross_project_dependency_activation',
  'wrong-id':
    'PRAGMA ignore_check_constraints=ON; UPDATE cross_project_dependency_activation SET id=2',
  'unknown-state':
    "PRAGMA ignore_check_constraints=ON; UPDATE cross_project_dependency_activation SET state='UNKNOWN'",
  receipt: "INSERT INTO cross_project_dependency_activation_receipt VALUES(1,'{}')",
  ledger: `DELETE FROM __drizzle_migrations WHERE name='${authority}'`,
  'external-ledger': `DELETE FROM __drizzle_migrations WHERE name='${external}'`,
  'duplicate-ledger': `INSERT INTO __drizzle_migrations VALUES('${authority}','${'a'.repeat(64)}')`,
  'malformed-hash': "UPDATE __drizzle_migrations SET hash='bad'",
  'ledger-view':
    'ALTER TABLE __drizzle_migrations RENAME TO ledger; CREATE VIEW __drizzle_migrations AS SELECT * FROM ledger',
  'external-view':
    'DROP TABLE external_dependency; CREATE VIEW external_dependency AS SELECT 1 AS id WHERE 0',
  'blank-name': `INSERT INTO __drizzle_migrations VALUES ('','${'a'.repeat(64)}')`,
  'null-hash': 'UPDATE __drizzle_migrations SET hash=NULL',
  ...Object.fromEntries(
    ['insert', 'update', 'delete'].flatMap((action) => [
      [`missing-${action}`, `DROP TRIGGER external_dependency_admit_${action}`],
      [
        `altered-${action}`,
        `DROP TRIGGER external_dependency_admit_${action}; CREATE TRIGGER external_dependency_admit_${action} BEFORE ${action.toUpperCase()} ON external_dependency BEGIN SELECT RAISE(ABORT,'bad'); END`,
      ],
    ]),
  ),
}))
  test(`coordinator generated command refuses ${fault}`, () => {
    const { sqlite, path } = fixture();
    sqlite.run(sql);
    sqlite.close();
    expect(() => observe(path)).toThrow();
  });
for (const output of [
  '[]',
  '{}',
  'null',
  JSON.stringify({ ...dormant, version: true }),
  JSON.stringify({ ...dormant, state: 'ENABLED' }),
  JSON.stringify({ ...dormant, extra: 0 }),
  JSON.stringify({ ...dormant, externalRelationships: 1 }),
])
  test(`decoder refuses ${output}`, () => {
    expect(() => decodeDormantDependencies(output)).toThrow();
  });

test('coordinator generated command refuses retained external relationships with intact triggers', () => {
  const { sqlite, path } = fixture();
  const trigger = sqlite
    .query<{ sql: string }, []>(
      "SELECT sql FROM sqlite_master WHERE name='external_dependency_admit_insert'",
    )
    .get();
  if (trigger === null) throw new Error('fixture trigger absent');
  sqlite.run(
    "DROP TRIGGER external_dependency_admit_insert; INSERT INTO external_dependency VALUES('edge')",
  );
  sqlite.run(trigger.sql);
  sqlite.close();
  expect(() => observe(path)).toThrow('retains external relationships');
});
for (const [fault, from, to] of [
  ['marker-schema', 'CHECK (id = 1)', 'CHECK (id >= 1)'],
  ['receipt-schema', 'CHECK (json_valid(receipt))', 'CHECK (1)'],
  ...['insert', 'update', 'delete'].map((action) => [
    `numeric-version-${action}`,
    `json_type(receipt,'$.version') IN ('integer','real') AND `,
    '',
  ]),
])
  test(`coordinator generated command refuses ${fault}`, () => {
    const { sqlite, path } = fixture((sql) => {
      if (fault.startsWith('numeric-version-')) {
        const action = fault.slice('numeric-version-'.length);
        const start = sql.indexOf(`CREATE TRIGGER external_dependency_admit_${action}`);
        return sql.slice(0, start) + sql.slice(start).replace(from, to);
      }
      return sql.replace(from, to);
    });
    sqlite.close();
    expect(() => observe(path)).toThrow();
  });
for (const fault of ['absent', 'unreadable', 'malformed'] as const)
  test(`coordinator generated command refuses ${fault} source`, () => {
    const { sqlite, path } = fixture();
    sqlite.close();
    if (fault === 'absent') rmSync(path);
    if (fault === 'malformed') writeFileSync(path, 'not sqlite');
    if (fault === 'unreadable') {
      expect(process.geteuid?.()).toBeGreaterThan(0);
      chmodSync(path, 0);
    }
    expect(() => observe(path)).toThrow();
  });

test('generated scanner requires explicit DB_PATH', () => {
  const env = { ...process.env };
  delete env['DB_PATH'];
  const child = Bun.spawnSync(buildDependencyInventoryCommand(), {
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.exitCode).not.toBe(0);
  expect(child.stderr.toString()).toContain('DB_PATH must be set');
});
test('generated scanner readonly boundary rejects injected authority writes', () => {
  const { sqlite, path } = fixture();
  sqlite.close();
  const command = buildDependencyInventoryCommand().map((part) =>
    part.replace(
      'try { process.stdout',
      "try { db.run('CREATE TABLE forbidden_authority_write(id INTEGER)'); process.stdout",
    ),
  );
  const child = Bun.spawnSync(storedSnapshotCommand(command), {
    env: { ...process.env, DB_PATH: path },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.exitCode).not.toBe(0);
  expect(child.stderr.toString()).toContain('readonly');
});
