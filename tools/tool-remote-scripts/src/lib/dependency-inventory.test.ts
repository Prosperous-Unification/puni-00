import {
  chmodSync,
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { completeActivationFixture } from '../fixtures/dependency-complete-activation';
import { roots as activationRoots } from '../fixtures/source-startup';
import { buildDependencyInventoryCommand, decodeDormantDependencies } from './dependency-inventory';
import { storedSnapshotCommand } from './sqlite-probe';

const roots: string[] = [];
afterEach(() => {
  for (const root of [...roots.splice(0), ...activationRoots.splice(0)])
    rmSync(root, { recursive: true });
});
const authority = '20261022212000_add_cross_project_dependency_activation';
const external = '20261022211000_add_external_dependencies';
const dormant = {
  protocol: 'wbs-dependency-preservation',
  version: 1,
  state: 'DISABLED',
  externalRelationships: 0,
} as const;
const migrationsDirectory = new URL('../../../../apps/wbs/be-01/drizzle/', import.meta.url)
  .pathname;
function fixture(
  transform: (sql: string) => string = (sql) => sql,
  epoch: 'legacy' | 'renamed' | 'catalogue' = 'renamed',
) {
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
  if (epoch !== 'legacy') {
    const renames = readFileSync(
      join(migrationsDirectory, '20261110100000_rename_project_to_work_package/migration.sql'),
      'utf8',
    )
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(
        (statement) =>
          statement.startsWith('ALTER TABLE \x60cross_project_dependency_activation\x60') ||
          statement.startsWith('ALTER TABLE \x60cross_project_dependency_activation_receipt\x60'),
      );
    expect(renames).toHaveLength(2);
    for (const statement of renames) sqlite.run(statement);
  }
  if (epoch === 'catalogue') {
    const triggers = readFileSync(
      join(migrationsDirectory, '20261115130000_add_step_catalogue/migration.sql'),
      'utf8',
    )
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement.startsWith('CREATE TRIGGER external_dependency_admit_'));
    expect(triggers).toHaveLength(3);
    for (const action of ['insert', 'update', 'delete'])
      sqlite.run('DROP TRIGGER external_dependency_admit_' + action);
    for (const statement of triggers) sqlite.run(statement);
  }
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
test('coordinator generated command admits real current119 dormant stores', async () => {
  const current = await completeActivationFixture(['prod']);
  for (const path of [current.prodPath, current.devPath]) expect(observe(path)).toEqual(dormant);
}, 30000);
test('coordinator generated command admits only dormant authority', () => {
  const { sqlite, path } = fixture();
  sqlite.close();
  expect(observe(path)).toEqual(dormant);
});
for (const [fault, sql] of Object.entries({
  enabled: "UPDATE cross_work_package_dependency_activation SET state='ENABLED'",
  marker: 'DELETE FROM cross_work_package_dependency_activation',
  'wrong-id':
    'PRAGMA ignore_check_constraints=ON; UPDATE cross_work_package_dependency_activation SET id=2',
  'unknown-state':
    "PRAGMA ignore_check_constraints=ON; UPDATE cross_work_package_dependency_activation SET state='UNKNOWN'",
  receipt: "INSERT INTO cross_work_package_dependency_activation_receipt VALUES(1,'{}')",
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

test('coordinator generated command admits actual migrated116 dormant authority', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dependency-current-prefix-'));
  roots.push(directory);
  const predecessor = '20261115120000_add_step_migration_report';
  const names = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name <= predecessor)
    .map((entry) => entry.name)
    .sort();
  expect(names).toHaveLength(116);
  expect(names.at(-1)).toBe(predecessor);
  for (const name of names)
    cpSync(join(migrationsDirectory, name), join(directory, name), { recursive: true });
  const migrated = await completeActivationFixture(['prod'], directory);
  for (const path of [migrated.prodPath, migrated.devPath]) expect(observe(path)).toEqual(dormant);
}, 30000);

test('coordinator generated command refuses predecessor project authority explicitly', () => {
  const { sqlite, path } = fixture((sql) => sql, 'legacy');
  sqlite.close();
  expect(() => observe(path)).toThrow(
    'requires real table cross_work_package_dependency_activation; historical stores require an explicit compatibility adapter',
  );
});

for (const table of [
  'cross_work_package_dependency_activation',
  'cross_work_package_dependency_activation_receipt',
])
  test('coordinator generated command refuses authority view ' + table, () => {
    const { sqlite, path } = fixture();
    sqlite.run(
      'ALTER TABLE "' +
        table +
        '" RENAME TO "' +
        table +
        '_stored"; CREATE VIEW "' +
        table +
        '" AS SELECT * FROM "' +
        table +
        '_stored"',
    );
    sqlite.close();
    expect(() => observe(path)).toThrow('requires real table ' + table);
  });

for (const epoch of ['renamed', 'catalogue'] as const)
  for (const action of ['insert', 'update', 'delete'])
    for (const fault of ['missing', 'altered', 'numeric-version', 'mixed-spelling'])
      test('coordinator exact ' + epoch + ' trigger refuses ' + fault + '-' + action, () => {
        const { sqlite, path } = fixture((sql) => sql, epoch);
        const name = 'external_dependency_admit_' + action;
        const trigger = sqlite
          .query<{ sql: string }, [string]>(
            "SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?",
          )
          .get(name);
        if (trigger === null) throw new Error('fixture admission trigger absent');
        sqlite.run('DROP TRIGGER ' + name);
        if (fault === 'altered')
          sqlite.run(
            'CREATE TRIGGER ' +
              name +
              ' BEFORE ' +
              action.toUpperCase() +
              " ON external_dependency BEGIN SELECT RAISE(ABORT,'bad'); END",
          );
        if (fault === 'numeric-version') {
          const predicate = "json_type(receipt,'$.version') IN ('integer','real') AND ";
          expect(trigger.sql).toContain(predicate);
          sqlite.run(trigger.sql.replace(predicate, ''));
        }
        if (fault === 'mixed-spelling') {
          const from =
            epoch === 'renamed'
              ? 'FROM "cross_work_package_dependency_activation"'
              : 'FROM cross_work_package_dependency_activation';
          const to =
            epoch === 'renamed'
              ? 'FROM cross_work_package_dependency_activation'
              : 'FROM "cross_work_package_dependency_activation"';
          expect(trigger.sql).toContain(from);
          sqlite.run(trigger.sql.replace(from, to));
        }
        sqlite.close();
        expect(() => observe(path)).toThrow('invalid dependency admission trigger ' + action);
      });
