import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import { storedStepBlockageReplayKindsCommand } from '@tools/docker';
import { Database } from 'bun:sqlite';
import { afterEach, expect, it } from 'bun:test';

import { buildReplayInventoryCommand } from './replay-capability';

function diagnostics(stderr: string): string {
  return stderr
    .split('\n')
    .filter((line) => /^(?:SQLiteError|error): /.test(line))
    .join('\n');
}

const backend = resolve(import.meta.dir, '../../../../apps/wbs/be-01');
const migrations = join(backend, 'drizzle');

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function migrateFixture(path: string, migrations: string, rollback: boolean): void {
  const script = rollback
    ? "import {rollbackTo} from '@wbs/store-sqlite/migrate-down'; rollbackTo(process.env.DB_PATH,process.env.MIGRATIONS,'20261014130000_add_shared_people_restore_receipts');"
    : "import {runMigrations} from '@wbs/store-sqlite/migrate'; runMigrations(process.env.DB_PATH,process.env.MIGRATIONS);";
  const child = Bun.spawnSync({
    cmd: ['bun', '-e', script],
    cwd: backend,
    env: { ...process.env, DB_PATH: path, MIGRATIONS: resolve(migrations) },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
}

function fixture() {
  const root = mkdtempSync('/tmp/activation-admission-');
  roots.push(root);
  const path = join(root, 'wbs.sqlite');
  const db = new Database(path);
  db.run(
    'CREATE TABLE __drizzle_migrations (name TEXT); CREATE TABLE step_blockage (id INTEGER); CREATE TABLE command_journal (payload TEXT, inverse TEXT, preconditions TEXT)',
  );
  for (const migration of [
    '20261014140000_add_step_blockage_activation',
    '20261015100000_add_step_blockage_activation_receipt',
  ]) {
    db.run(readFileSync(join(migrations, migration, 'migration.sql'), 'utf8'));
    db.query('INSERT INTO __drizzle_migrations VALUES (?)').run(migration);
  }
  return { path, db };
}

for (const [name, command] of [
  ['Kubernetes', () => buildReplayInventoryCommand()],
  ['Compose', () => storedStepBlockageReplayKindsCommand('fixture').slice(2)],
] as const) {
  it(`${name} inventories enabled-empty independently of image application code`, () => {
    const { path, db } = fixture();
    db.run("UPDATE step_blockage_activation SET state='ENABLED'");
    db.query('INSERT INTO step_blockage_activation_receipt VALUES (1,?)').run(
      JSON.stringify({
        protocol: 'step-blockage-activation',
        version: 1,
        activationId: 'attended',
        candidateImage: `be@sha256:${'1'.repeat(64)}`,
        rollbackImage: `be@sha256:${'2'.repeat(64)}`,
        databaseIdentity: '/data/wbs.sqlite',
        activatedAt: 1,
      }),
    );
    db.close();
    const child = Bun.spawnSync({
      cmd: [...command()],
      env: { ...process.env, DB_PATH: path },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(child.exitCode).toBe(0);
    expect(JSON.parse(child.stdout.toString())).toEqual([
      { kind: 'step_blockage_activation_v1', count: 1 },
    ]);
  });
}

for (const [name, command] of [
  ['Kubernetes', () => buildReplayInventoryCommand()],
  ['Compose', () => storedStepBlockageReplayKindsCommand('fixture').slice(2)],
] as const) {
  for (const fault of [
    'missing-marker',
    'wrong-marker',
    'wrong-marker-id',
    'duplicate-marker',
    'missing-marker-table',
    'duplicate-ledger',
    'malformed-ledger',
    'missing-ledger',
    'missing-trigger',
    'missing-update-trigger',
    'missing-delete-trigger',
    'altered-trigger',
    'missing-receipt',
    'missing-receipt-ledger',
    'weakened-receipt',
    'disabled-receipt',
    'enabled-no-receipt',
    'malformed-receipt',
  ] as const) {
    it(`${name} refuses broken authority: ${fault}`, () => {
      const { path, db } = fixture();
      if (fault === 'wrong-marker-id') {
        db.run('PRAGMA ignore_check_constraints=ON');
        db.run('UPDATE step_blockage_activation SET id=2');
      }
      if (fault === 'duplicate-marker') {
        db.run('PRAGMA ignore_check_constraints=ON');
        db.run("INSERT INTO step_blockage_activation VALUES (2,'DISABLED')");
      }
      if (fault === 'missing-marker-table') db.run('DROP TABLE step_blockage_activation');
      if (fault === 'duplicate-ledger')
        db.run(
          "INSERT INTO __drizzle_migrations VALUES ('20261014140000_add_step_blockage_activation')",
        );
      if (fault === 'malformed-ledger') db.run('UPDATE __drizzle_migrations SET name=NULL');
      if (fault === 'missing-marker') db.run('DELETE FROM step_blockage_activation');
      if (fault === 'wrong-marker') {
        db.run('PRAGMA ignore_check_constraints=ON');
        db.run("UPDATE step_blockage_activation SET state='UNKNOWN'");
      }
      if (fault === 'missing-ledger')
        db.run(
          "DELETE FROM __drizzle_migrations WHERE name='20261014140000_add_step_blockage_activation'",
        );
      if (fault === 'missing-trigger' || fault === 'altered-trigger')
        db.run('DROP TRIGGER step_blockage_admit_insert');
      if (fault === 'missing-update-trigger') db.run('DROP TRIGGER step_blockage_admit_update');
      if (fault === 'missing-delete-trigger') db.run('DROP TRIGGER step_blockage_admit_delete');
      if (fault === 'altered-trigger')
        db.run(
          'CREATE TRIGGER step_blockage_admit_insert BEFORE INSERT ON step_blockage BEGIN SELECT 1; END',
        );
      if (fault === 'missing-receipt-ledger')
        db.run(
          "DELETE FROM __drizzle_migrations WHERE name='20261015100000_add_step_blockage_activation_receipt'",
        );
      if (fault === 'missing-receipt' || fault === 'weakened-receipt')
        db.run('DROP TABLE step_blockage_activation_receipt');
      if (fault === 'weakened-receipt')
        db.run('CREATE TABLE step_blockage_activation_receipt (id INTEGER, receipt TEXT)');
      if (fault === 'disabled-receipt' || fault === 'malformed-receipt')
        db.run("INSERT INTO step_blockage_activation_receipt VALUES (1,'{}')");
      if (fault === 'enabled-no-receipt' || fault === 'malformed-receipt')
        db.run("UPDATE step_blockage_activation SET state='ENABLED'");
      db.close();
      const child = Bun.spawnSync({
        cmd: [...command()],
        env: { ...process.env, DB_PATH: path },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(child.exitCode).not.toBe(0);
      const diagnostic = {
        'missing-marker': 'invalid step blockage activation marker',
        'wrong-marker': 'invalid step blockage activation marker',
        'wrong-marker-id': 'invalid step blockage activation marker',
        'duplicate-marker': 'invalid step blockage activation marker',
        'missing-marker-table': 'invalid step blockage activation table',
        'duplicate-ledger': 'missing step blockage activation migration',
        'malformed-ledger': 'step blockage migration ledger is malformed',
        'missing-ledger': 'incoherent pre-marker step blockage authority',
        'missing-trigger': 'invalid step blockage activation triggers',
        'missing-update-trigger': 'invalid step blockage activation triggers',
        'missing-delete-trigger': 'invalid step blockage activation triggers',
        'altered-trigger': 'invalid step blockage activation triggers',
        'missing-receipt': 'invalid step blockage receipt schema or migration',
        'missing-receipt-ledger': 'invalid step blockage receipt schema or migration',
        'weakened-receipt': 'invalid step blockage receipt schema or migration',
        'disabled-receipt': 'disabled step blockage authority has a receipt',
        'enabled-no-receipt': 'enabled step blockage authority has no exact receipt',
        'malformed-receipt': 'invalid step blockage activation receipt',
      }[fault];
      expect(diagnostics(child.stderr.toString())).toContain(diagnostic);
    });
  }
}

it('backend image advertises activation separately from journal replay vocabulary', () => {
  const child = Bun.spawnSync({
    cmd: ['bun', 'run', 'src/step-blockage-replay-kinds-cli.ts'],
    cwd: backend,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.exitCode).toBe(0);
  expect(JSON.parse(child.stdout.toString())).toContain('step_blockage_activation_v1');
});

for (const [name, command] of [
  ['Kubernetes', () => buildReplayInventoryCommand()],
  ['Compose', () => storedStepBlockageReplayKindsCommand('fixture').slice(2)],
] as const) {
  it(`${name} positively classifies a coherent pre-marker database`, () => {
    const { path, db } = fixture();
    for (const action of ['insert', 'update', 'delete'])
      db.run(`DROP TRIGGER step_blockage_admit_${action}`);
    db.run(
      'DROP TABLE step_blockage_activation; DROP TABLE step_blockage_activation_receipt; DELETE FROM __drizzle_migrations',
    );
    db.close();
    const child = Bun.spawnSync({
      cmd: [...command()],
      env: { ...process.env, DB_PATH: path },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(child.exitCode).toBe(0);
    expect(JSON.parse(child.stdout.toString())).toEqual([]);
  });

  it(`${name} accepts compatible pre-receipt DISABLED without creating receipt authority`, () => {
    const { path, db } = fixture();
    db.run(
      "DROP TABLE step_blockage_activation_receipt; DELETE FROM __drizzle_migrations WHERE name='20261015100000_add_step_blockage_activation_receipt'",
    );
    db.close();
    const before = readFileSync(path);
    const child = Bun.spawnSync({
      cmd: [...command()],
      env: { ...process.env, DB_PATH: path },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(child.exitCode).toBe(0);
    expect(JSON.parse(child.stdout.toString())).toEqual([]);
    expect(readFileSync(path)).toEqual(before);
  });
}

for (const [name, command] of [
  ['Kubernetes', () => buildReplayInventoryCommand()],
  ['Compose', () => storedStepBlockageReplayKindsCommand('fixture').slice(2)],
] as const) {
  for (const remnant of [
    'marker-table',
    'marker-view',
    'receipt-table',
    'receipt-view',
    'receipt-ledger',
    'insert-trigger',
    'update-trigger',
    'delete-trigger',
    'missing-ledger',
  ] as const) {
    it(`${name} refuses incoherent pre-marker authority: ${remnant}`, () => {
      const { path, db } = fixture();
      for (const action of ['insert', 'update', 'delete'])
        db.run(`DROP TRIGGER step_blockage_admit_${action}`);
      db.run(
        'DROP TABLE step_blockage_activation; DROP TABLE step_blockage_activation_receipt; DELETE FROM __drizzle_migrations',
      );
      if (remnant === 'marker-table')
        db.run('CREATE TABLE step_blockage_activation (id INTEGER, state TEXT)');
      if (remnant === 'marker-view')
        db.run("CREATE VIEW step_blockage_activation AS SELECT 1 AS id, 'DISABLED' AS state");
      if (remnant === 'receipt-table')
        db.run('CREATE TABLE step_blockage_activation_receipt (id INTEGER, receipt TEXT)');
      if (remnant === 'receipt-view')
        db.run("CREATE VIEW step_blockage_activation_receipt AS SELECT 1 AS id, '{}' AS receipt");
      if (remnant === 'receipt-ledger')
        db.run(
          "INSERT INTO __drizzle_migrations VALUES ('20261015100000_add_step_blockage_activation_receipt')",
        );
      if (remnant.endsWith('-trigger'))
        db.run(
          `CREATE TRIGGER step_blockage_admit_${remnant.split('-')[0]} BEFORE ${remnant.split('-')[0]} ON step_blockage BEGIN SELECT 1; END`,
        );
      if (remnant === 'missing-ledger') db.run('DROP TABLE __drizzle_migrations');
      db.close();
      const child = Bun.spawnSync({
        cmd: [...command()],
        env: { ...process.env, DB_PATH: path },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(child.exitCode).not.toBe(0);
      expect(diagnostics(child.stderr.toString())).toContain(
        remnant === 'missing-ledger'
          ? 'migration ledger is missing or malformed'
          : 'incoherent pre-marker',
      );
    });
  }
}

for (const [name, command] of [
  ['Kubernetes', () => buildReplayInventoryCommand()],
  ['Compose', () => storedStepBlockageReplayKindsCommand('fixture').slice(2)],
] as const) {
  for (const fault of [
    'missing-database',
    'unreadable-database',
    'missing-ledger-column',
    'unreadable-ledger',
  ] as const) {
    it(`${name} refuses unavailable trusted state: ${fault}`, () => {
      if (process.getuid?.() === 0)
        throw new Error('unreadability proof requires a nonprivileged runner');
      const { path, db } = fixture();
      if (fault === 'missing-ledger-column')
        db.run('ALTER TABLE __drizzle_migrations RENAME COLUMN name TO broken');
      db.close();
      if (fault === 'missing-database') rmSync(path);
      if (fault === 'unreadable-database' || fault === 'unreadable-ledger') chmodSync(path, 0);
      try {
        const child = Bun.spawnSync({
          cmd: [...command()],
          env: { ...process.env, DB_PATH: path },
          stdout: 'pipe',
          stderr: 'pipe',
        });
        expect(child.exitCode).not.toBe(0);
        expect(diagnostics(child.stderr.toString())).toContain(
          fault === 'missing-ledger-column'
            ? 'no such column: name'
            : 'unable to open database file',
        );
      } finally {
        if (fault !== 'missing-database') chmodSync(path, 0o600);
      }
    });
  }

  for (const route of ['fresh', 'rollback'] as const) {
    it(`${name} accepts a real ${route} migrated pre-marker baseline`, () => {
      const root = mkdtempSync('/tmp/activation-real-baseline-');
      roots.push(root);
      const path = join(root, 'wbs.sqlite');
      if (route === 'fresh') {
        const staged = join(root, 'drizzle');
        mkdirSync(staged);
        for (const migration of readdirSync(migrations)) {
          if (
            /^\d{14}_/.test(migration) &&
            migration < '20261014140000_add_step_blockage_activation'
          )
            cpSync(join(migrations, migration), join(staged, migration), { recursive: true });
        }
        migrateFixture(path, staged, false);
      } else {
        migrateFixture(path, migrations, false);
        migrateFixture(path, migrations, true);
      }
      const before = readFileSync(path);
      const child = Bun.spawnSync({
        cmd: [...command()],
        env: { ...process.env, DB_PATH: path },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(child.exitCode).toBe(0);
      expect(JSON.parse(child.stdout.toString())).toEqual([]);
      expect(readFileSync(path)).toEqual(before);
    });
  }
}

const receiptFields = {
  protocol: 'step-blockage-activation',
  version: 1,
  activationId: 'attended',
  candidateImage: `be@sha256:${'1'.repeat(64)}`,
  rollbackImage: `be@sha256:${'2'.repeat(64)}`,
  databaseIdentity: '/data/wbs.sqlite',
  activatedAt: 1,
};
for (const [name, command] of [
  ['Kubernetes', () => buildReplayInventoryCommand()],
  ['Compose', () => storedStepBlockageReplayKindsCommand('fixture').slice(2)],
] as const) {
  for (const [field, value] of [
    ['protocol', 'other'],
    ['version', 2],
    ['activationId', ''],
    ['activationId', 3],
    ['candidateImage', 'be:latest'],
    ['candidateImage', [`be@sha256:${'1'.repeat(64)}`]],
    ['rollbackImage', 'be:latest'],
    ['rollbackImage', [`be@sha256:${'2'.repeat(64)}`]],
    ['databaseIdentity', ''],
    ['databaseIdentity', 3],
    ['activatedAt', -1],
    ['activatedAt', 1.5],
    ['activatedAt', '1'],
    ['unexpected', true],
  ] as const) {
    it(`${name} refuses invalid receipt field ${field}=${JSON.stringify(value)}`, () => {
      const { path, db } = fixture();
      db.run("UPDATE step_blockage_activation SET state='ENABLED'");
      db.query('INSERT INTO step_blockage_activation_receipt VALUES (1,?)').run(
        JSON.stringify({ ...receiptFields, [field]: value }),
      );
      db.close();
      const child = Bun.spawnSync({
        cmd: [...command()],
        env: { ...process.env, DB_PATH: path },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(child.exitCode).not.toBe(0);
      expect(diagnostics(child.stderr.toString())).toContain(
        'invalid step blockage activation receipt',
      );
    });
  }
}

for (const [name, command] of [
  ['Kubernetes', () => buildReplayInventoryCommand()],
  ['Compose', () => storedStepBlockageReplayKindsCommand('fixture').slice(2)],
] as const) {
  it(`${name} refuses a view substituted for the migration ledger`, () => {
    const { path, db } = fixture();
    db.run(
      'ALTER TABLE __drizzle_migrations RENAME TO forged; CREATE VIEW __drizzle_migrations AS SELECT name FROM forged',
    );
    db.close();
    const child = Bun.spawnSync({
      cmd: [...command()],
      env: { ...process.env, DB_PATH: path },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(child.exitCode).not.toBe(0);
    expect(diagnostics(child.stderr.toString())).toContain(
      'migration ledger is missing or malformed',
    );
  });

  it(`${name} retains pre-marker journal obligations`, () => {
    const { path, db } = fixture();
    for (const action of ['insert', 'update', 'delete'])
      db.run(`DROP TRIGGER step_blockage_admit_${action}`);
    db.run(
      'DROP TABLE step_blockage_activation; DROP TABLE step_blockage_activation_receipt; DELETE FROM __drizzle_migrations',
    );
    db.query('INSERT INTO command_journal VALUES (?,?,?)').run(
      '{"forward":{"do":"replace_blockage"}}',
      '{"do":"patch"}',
      '{}',
    );
    db.close();
    const child = Bun.spawnSync({
      cmd: [...command()],
      env: { ...process.env, DB_PATH: path },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(child.exitCode).toBe(0);
    expect(JSON.parse(child.stdout.toString())).toEqual([{ kind: 'replace_blockage', count: 1 }]);
  });
}

for (const [name, command] of [
  ['Kubernetes', () => buildReplayInventoryCommand()],
  ['Compose', () => storedStepBlockageReplayKindsCommand('fixture').slice(2)],
] as const) {
  it(`${name} refuses a view substituted for migrated marker authority`, () => {
    const { path, db } = fixture();
    db.run(
      "DROP TABLE step_blockage_activation; CREATE VIEW step_blockage_activation AS SELECT 1 AS id, 'DISABLED' AS state",
    );
    db.close();
    const child = Bun.spawnSync({
      cmd: [...command()],
      env: { ...process.env, DB_PATH: path },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(child.exitCode).not.toBe(0);
    expect(diagnostics(child.stderr.toString())).toContain(
      'invalid step blockage activation table',
    );
  });
}
