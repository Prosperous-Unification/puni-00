import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, describe, expect, it } from 'bun:test';

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const MIGRATIONS = join(APP_ROOT, 'drizzle');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function runCli(file: string, dbPath: string, ...args: string[]) {
  return runCliFrom(APP_ROOT, file, dbPath, ...args);
}

async function runCliFrom(root: string, file: string, dbPath: string, ...args: string[]) {
  const child = Bun.spawn([process.execPath, 'run', join(APP_ROOT, 'src', file), ...args], {
    cwd: root,
    env: { ...process.env, DB_PATH: dbPath },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

function migrationLedgerAt(dbPath: string): { name: string; hash: string; created_at: number }[] {
  const sqlite = openDatabase(dbPath);
  try {
    const exists = sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
      )
      .get();
    if (exists === null) return [];
    return sqlite
      .query<{ name: string; hash: string; created_at: number }, []>(
        'SELECT name, hash, created_at FROM __drizzle_migrations ORDER BY created_at, name',
      )
      .all();
  } finally {
    sqlite.close();
  }
}

function addMigration(root: string, name: string, up: string, down: string): void {
  const folder = join(root, 'drizzle', name);
  mkdirSync(folder);
  writeFileSync(join(folder, 'migration.sql'), up);
  writeFileSync(join(folder, 'down.sql'), down);
}

function schemaAt(dbPath: string): string[] {
  const sqlite = openDatabase(dbPath);
  try {
    return sqlite
      .query<{ sql: string | null }, []>(
        `SELECT sql FROM sqlite_master
         WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
         ORDER BY type, name`,
      )
      .all()
      .flatMap((row) => (row.sql === null ? [] : [row.sql]));
  } finally {
    sqlite.close();
  }
}

async function prepareIntegrityFixture(): Promise<{
  root: string;
  dbPath: string;
  capturePath: string;
  identity: string[];
  baseline: string;
  first: string;
  second: string;
  captured: {
    format: string;
    version: number;
    target: string;
    attempt: string;
    candidate: string;
    applied: { name: string; hash: string }[];
    pending: { name: string; hash: string; downHash: string }[];
  };
}> {
  const root = mkdtempSync(join(tmpdir(), 'wbs-migration-set-integrity-'));
  roots.push(root);
  const dbPath = join(root, 'plan.db');
  const capturePath = join(root, 'capture.json');
  const baseline = '20260101000000_baseline';
  const first = '20260101000001_add_first';
  const second = '20260101000002_add_second';
  mkdirSync(join(root, 'drizzle'));
  addMigration(
    root,
    baseline,
    'CREATE TABLE baseline_table (id text);',
    'DROP TABLE baseline_table;',
  );
  runMigrations(dbPath, join(root, 'drizzle'));
  addMigration(root, first, 'CREATE TABLE first_table (id text);', 'DROP TABLE first_table;');
  addMigration(root, second, 'CREATE TABLE second_table (id text);', 'DROP TABLE second_table;');
  const identity = ['--target=wbs-be-01', '--attempt=integrity-test', '--candidate=cafebabe'];
  const capture = await runCliFrom(root, 'migrate-status-cli.ts', dbPath, '--capture', ...identity);
  expect(capture.exitCode).toBe(0);
  writeFileSync(capturePath, capture.stdout);
  const captured = JSON.parse(capture.stdout) as {
    format: string;
    version: number;
    target: string;
    attempt: string;
    candidate: string;
    applied: { name: string; hash: string }[];
    pending: { name: string; hash: string; downHash: string }[];
  };
  expect(captured.applied.map((entry) => entry.name)).toEqual([baseline]);
  expect(captured.pending.map((entry) => entry.name)).toEqual([first, second]);
  return { root, dbPath, capturePath, identity, baseline, first, second, captured };
}

async function restoreFixture(fixture: Awaited<ReturnType<typeof prepareIntegrityFixture>>) {
  return runCliFrom(
    fixture.root,
    'migrate-down-cli.ts',
    fixture.dbPath,
    `--capture-file=${fixture.capturePath}`,
    ...fixture.identity,
  );
}

describe('migration deploy entrypoints', () => {
  it('restores an older newly introduced migration after a newer shared-people baseline', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-migration-set-cli-'));
    roots.push(root);
    const dbPath = join(root, 'plan.db');
    const migrations = join(root, 'drizzle');
    const capturePath = join(root, 'capture.json');
    const candidateName = '20261001020000_add_browser_auth_lifecycle';
    cpSync(MIGRATIONS, migrations, { recursive: true });
    runMigrations(dbPath, MIGRATIONS);
    const baselineLedger = migrationLedgerAt(dbPath);
    expect(baselineLedger.at(-1)?.name).toBe('20261005110000_add_shared_people');
    const baselineSchema = schemaAt(dbPath);
    const sqlite = openDatabase(dbPath);
    try {
      sqlite.run(
        "INSERT INTO users (id,username,password_hash,created_at) VALUES ('sentinel','owner','x',1)",
      );
    } finally {
      sqlite.close();
    }

    addMigration(
      root,
      candidateName,
      'CREATE TABLE browser_auth_lifecycle (id text PRIMARY KEY);',
      'DROP TABLE browser_auth_lifecycle;',
    );
    const identity = ['--target=wbs-be-01', '--attempt=abort-test', '--candidate=deadbeef'];
    const capture = await runCliFrom(
      root,
      'migrate-status-cli.ts',
      dbPath,
      '--capture',
      ...identity,
    );
    expect(capture.exitCode).toBe(0);
    const captured: unknown = JSON.parse(capture.stdout);
    expect(captured).toMatchObject({
      format: 'applied-migration-set',
      version: 1,
      target: 'wbs-be-01',
      attempt: 'abort-test',
      candidate: 'deadbeef',
      applied: baselineLedger.map(({ name, hash }) => ({ name, hash })),
      pending: [{ name: candidateName }],
    });
    writeFileSync(capturePath, capture.stdout);

    expect(await runCliFrom(root, 'migrate-cli.ts', dbPath)).toEqual({
      exitCode: 0,
      stdout: 'migrations applied\n',
      stderr: '',
    });
    expect(schemaAt(dbPath).some((ddl) => ddl.includes('browser_auth_lifecycle'))).toBe(true);
    expect(migrationLedgerAt(dbPath)).toHaveLength(baselineLedger.length + 1);

    const restored = await runCliFrom(
      root,
      'migrate-down-cli.ts',
      dbPath,
      `--capture-file=${capturePath}`,
      ...identity,
    );
    expect(restored.exitCode).toBe(0);
    expect(restored.stderr).toBe('');
    expect(restored.stdout).toContain(candidateName);
    expect(schemaAt(dbPath)).toEqual(baselineSchema);
    expect(migrationLedgerAt(dbPath)).toEqual(baselineLedger);
    const after = openDatabase(dbPath);
    try {
      expect(after.query("SELECT id FROM users WHERE id = 'sentinel'").all()).toEqual([
        { id: 'sentinel' },
      ]);
    } finally {
      after.close();
    }
  }, 60_000);

  it('preserves an older migration already captured and repeats exact restoration safely', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-migration-set-preserve-'));
    roots.push(root);
    const dbPath = join(root, 'plan.db');
    const capturePath = join(root, 'capture.json');
    const lifecycle = '20261001020000_add_browser_auth_lifecycle';
    const addition = '20261006010000_add_after_lifecycle';
    cpSync(MIGRATIONS, join(root, 'drizzle'), { recursive: true });
    addMigration(
      root,
      lifecycle,
      'CREATE TABLE browser_auth_lifecycle (id text PRIMARY KEY);',
      'DROP TABLE browser_auth_lifecycle;',
    );
    runMigrations(dbPath, join(root, 'drizzle'));
    const sqlite = openDatabase(dbPath);
    try {
      sqlite.run("INSERT INTO browser_auth_lifecycle (id) VALUES ('retained')");
    } finally {
      sqlite.close();
    }
    const baseline = migrationLedgerAt(dbPath);
    addMigration(
      root,
      addition,
      'CREATE TABLE after_lifecycle (id text PRIMARY KEY);',
      'DROP TABLE after_lifecycle;',
    );
    const identity = ['--target=wbs-be-01', '--attempt=preserve-test', '--candidate=feedbeef'];
    const capture = await runCliFrom(
      root,
      'migrate-status-cli.ts',
      dbPath,
      '--capture',
      ...identity,
    );
    expect(capture.exitCode).toBe(0);
    const captured: unknown = JSON.parse(capture.stdout);
    expect(captured).toMatchObject({
      applied: baseline.map(({ name, hash }) => ({ name, hash })),
      pending: [{ name: addition }],
    });
    writeFileSync(capturePath, capture.stdout);
    expect((await runCliFrom(root, 'migrate-cli.ts', dbPath)).exitCode).toBe(0);
    const args = [`--capture-file=${capturePath}`, ...identity];
    expect((await runCliFrom(root, 'migrate-down-cli.ts', dbPath, ...args)).stdout).toContain(
      addition,
    );
    expect(migrationLedgerAt(dbPath)).toEqual(baseline);
    const restored = openDatabase(dbPath);
    try {
      expect(restored.query('SELECT id FROM browser_auth_lifecycle').all()).toEqual([
        { id: 'retained' },
      ]);
      expect(
        restored.query("SELECT name FROM sqlite_master WHERE name = 'after_lifecycle'").all(),
      ).toEqual([]);
    } finally {
      restored.close();
    }
    expect((await runCliFrom(root, 'migrate-down-cli.ts', dbPath, ...args)).stdout).toContain(
      '(already restored)',
    );
    expect(migrationLedgerAt(dbPath)).toEqual(baseline);
  }, 60_000);

  it('restores an explicitly empty captured set', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-migration-set-empty-'));
    roots.push(root);
    const dbPath = join(root, 'plan.db');
    const capturePath = join(root, 'capture.json');
    const candidate = '20260101000000_add_first';
    mkdirSync(join(root, 'drizzle'));
    addMigration(
      root,
      candidate,
      'CREATE TABLE first_migration (id text PRIMARY KEY);',
      'DROP TABLE first_migration;',
    );
    openDatabase(dbPath).close();
    const identity = ['--target=wbs-be-01', '--attempt=empty-test', '--candidate=cafebabe'];
    const capture = await runCliFrom(
      root,
      'migrate-status-cli.ts',
      dbPath,
      '--capture',
      ...identity,
    );
    expect(capture.exitCode).toBe(0);
    expect(JSON.parse(capture.stdout)).toMatchObject({
      applied: [],
      pending: [{ name: candidate }],
    });
    writeFileSync(capturePath, capture.stdout);
    expect((await runCliFrom(root, 'migrate-cli.ts', dbPath)).exitCode).toBe(0);
    expect(migrationLedgerAt(dbPath)).toHaveLength(1);
    expect(
      (
        await runCliFrom(
          root,
          'migrate-down-cli.ts',
          dbPath,
          `--capture-file=${capturePath}`,
          ...identity,
        )
      ).exitCode,
    ).toBe(0);
    expect(migrationLedgerAt(dbPath)).toEqual([]);
    expect(schemaAt(dbPath).some((ddl) => ddl.includes('first_migration'))).toBe(false);
  }, 60_000);

  it('refuses capture when its database is absent without creating a file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-migration-set-missing-'));
    roots.push(root);
    const dbPath = join(root, 'absent.db');
    cpSync(MIGRATIONS, join(root, 'drizzle'), { recursive: true });
    const capture = await runCliFrom(
      root,
      'migrate-status-cli.ts',
      dbPath,
      '--capture',
      '--target=wbs-be-01',
      '--attempt=missing-test',
      '--candidate=cafebabe',
    );
    expect(capture.exitCode).not.toBe(0);
    expect(capture.stdout).toBe('');
    expect(readdirSync(root)).not.toContain('absent.db');
  }, 60_000);

  it('refuses a zero-error down script when the ledger still records the addition', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-migration-set-ledger-fault-'));
    roots.push(root);
    const dbPath = join(root, 'plan.db');
    const capturePath = join(root, 'capture.json');
    const candidate = '20260101000000_add_candidate';
    mkdirSync(join(root, 'drizzle'));
    addMigration(
      root,
      candidate,
      'CREATE TABLE candidate_table (id text);',
      'DROP TABLE candidate_table;',
    );
    openDatabase(dbPath).close();
    const identity = ['--target=wbs-be-01', '--attempt=ledger-test', '--candidate=cafebabe'];
    const capture = await runCliFrom(
      root,
      'migrate-status-cli.ts',
      dbPath,
      '--capture',
      ...identity,
    );
    expect(capture.exitCode).toBe(0);
    writeFileSync(capturePath, capture.stdout);
    expect((await runCliFrom(root, 'migrate-cli.ts', dbPath)).exitCode).toBe(0);
    const sqlite = openDatabase(dbPath);
    try {
      sqlite.run(`CREATE TRIGGER retain_candidate AFTER DELETE ON __drizzle_migrations
        WHEN old.name = '${candidate}' BEGIN
          INSERT INTO __drizzle_migrations (hash, created_at, name)
          VALUES (old.hash, old.created_at, old.name);
        END`);
    } finally {
      sqlite.close();
    }
    const refused = await runCliFrom(
      root,
      'migrate-down-cli.ts',
      dbPath,
      `--capture-file=${capturePath}`,
      ...identity,
    );
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr).toContain('migration ledger differs from captured applied set');
    expect(migrationLedgerAt(dbPath).map((row) => row.name)).toEqual([candidate]);
  }, 60_000);

  it('refuses conflicting exact-set and legacy rollback modes before changing the ledger', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-migration-set-conflict-'));
    roots.push(root);
    const dbPath = join(root, 'plan.db');
    const capturePath = join(root, 'capture.json');
    const candidate = '20260101000000_add_candidate';
    mkdirSync(join(root, 'drizzle'));
    addMigration(
      root,
      candidate,
      'CREATE TABLE candidate_table (id text);',
      'DROP TABLE candidate_table;',
    );
    openDatabase(dbPath).close();
    const identity = ['--target=wbs-be-01', '--attempt=mixed-test', '--candidate=cafebabe'];
    const capture = await runCliFrom(
      root,
      'migrate-status-cli.ts',
      dbPath,
      '--capture',
      ...identity,
    );
    expect(capture.exitCode).toBe(0);
    writeFileSync(capturePath, capture.stdout);
    expect((await runCliFrom(root, 'migrate-cli.ts', dbPath)).exitCode).toBe(0);
    const before = migrationLedgerAt(dbPath);

    const refused = await runCliFrom(
      root,
      'migrate-down-cli.ts',
      dbPath,
      `--capture-file=${capturePath}`,
      '--to=none',
      ...identity,
    );
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr).toContain('mutually exclusive');
    expect(migrationLedgerAt(dbPath)).toEqual(before);
    expect(schemaAt(dbPath).some((ddl) => ddl.includes('candidate_table'))).toBe(true);
  }, 60_000);

  it('refuses duplicate capture identity flags before reading the database', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-migration-set-duplicate-'));
    roots.push(root);
    const dbPath = join(root, 'plan.db');
    mkdirSync(join(root, 'drizzle'));
    addMigration(
      root,
      '20260101000000_add_candidate',
      'CREATE TABLE candidate_table (id text);',
      'DROP TABLE candidate_table;',
    );
    openDatabase(dbPath).close();
    const refused = await runCliFrom(
      root,
      'migrate-status-cli.ts',
      dbPath,
      '--capture',
      '--target=wbs-be-01',
      '--target=other',
      '--attempt=duplicate-test',
      '--candidate=cafebabe',
    );
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr).toContain('duplicate --target');
    expect(migrationLedgerAt(dbPath)).toEqual([]);
  }, 60_000);

  it('refuses reordered pending migrations before one down script can commit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-migration-set-order-'));
    roots.push(root);
    const dbPath = join(root, 'plan.db');
    const capturePath = join(root, 'capture.json');
    const first = '20260101000000_add_first';
    const second = '20260101000001_add_second';
    mkdirSync(join(root, 'drizzle'));
    addMigration(
      root,
      first,
      'CREATE TABLE first_candidate (id text);',
      'DROP TABLE first_candidate;',
    );
    addMigration(
      root,
      second,
      'CREATE TABLE second_candidate (id text);',
      "INSERT INTO first_candidate (id) VALUES ('cleanup');\n--> statement-breakpoint\nDROP TABLE second_candidate;",
    );
    openDatabase(dbPath).close();
    const identity = ['--target=wbs-be-01', '--attempt=order-test', '--candidate=cafebabe'];
    const capture = await runCliFrom(
      root,
      'migrate-status-cli.ts',
      dbPath,
      '--capture',
      ...identity,
    );
    expect(capture.exitCode).toBe(0);
    const parsed: unknown = JSON.parse(capture.stdout);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('pending' in parsed) ||
      !Array.isArray(parsed.pending)
    ) {
      throw new Error('capture does not contain pending migrations');
    }
    const pending = parsed.pending as unknown[];
    writeFileSync(capturePath, JSON.stringify({ ...parsed, pending: [...pending].reverse() }));
    expect((await runCliFrom(root, 'migrate-cli.ts', dbPath)).exitCode).toBe(0);
    const before = migrationLedgerAt(dbPath);
    const refused = await runCliFrom(
      root,
      'migrate-down-cli.ts',
      dbPath,
      `--capture-file=${capturePath}`,
      ...identity,
    );
    expect(refused.exitCode).not.toBe(0);
    expect(migrationLedgerAt(dbPath)).toEqual(before);
    expect(schemaAt(dbPath).some((ddl) => ddl.includes('first_candidate'))).toBe(true);
    expect(schemaAt(dbPath).some((ddl) => ddl.includes('second_candidate'))).toBe(true);
    expect(refused.stderr).toContain('pending migration order');
  }, 60_000);

  it('resumes exact restoration after one down script and ledger deletion committed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-migration-set-resume-'));
    roots.push(root);
    const dbPath = join(root, 'plan.db');
    const capturePath = join(root, 'capture.json');
    const first = '20261006010000_first_after_baseline';
    const second = '20261006020000_second_after_baseline';
    cpSync(MIGRATIONS, join(root, 'drizzle'), { recursive: true });
    runMigrations(dbPath, MIGRATIONS);
    const baseline = migrationLedgerAt(dbPath);
    addMigration(root, first, 'CREATE TABLE first_after (id text);', 'DROP TABLE first_after;');
    addMigration(root, second, 'CREATE TABLE second_after (id text);', 'DROP TABLE second_after;');
    const identity = ['--target=wbs-be-01', '--attempt=resume-test', '--candidate=cafebabe'];
    const capture = await runCliFrom(
      root,
      'migrate-status-cli.ts',
      dbPath,
      '--capture',
      ...identity,
    );
    expect(capture.exitCode).toBe(0);
    writeFileSync(capturePath, capture.stdout);
    expect((await runCliFrom(root, 'migrate-cli.ts', dbPath)).exitCode).toBe(0);
    expect(
      (await runCliFrom(root, 'migrate-down-cli.ts', dbPath, `--to=${first}`)).stdout,
    ).toContain(second);
    const resumed = await runCliFrom(
      root,
      'migrate-down-cli.ts',
      dbPath,
      `--capture-file=${capturePath}`,
      ...identity,
    );
    expect(resumed.exitCode).toBe(0);
    expect(resumed.stdout).toContain(first);
    expect(resumed.stdout).not.toContain(second);
    expect(migrationLedgerAt(dbPath)).toEqual(baseline);
    expect(schemaAt(dbPath).some((ddl) => ddl.includes('first_after'))).toBe(false);
    expect(schemaAt(dbPath).some((ddl) => ddl.includes('second_after'))).toBe(false);
  }, 60_000);

  it('refuses a missing capture before reversing either applied addition', async () => {
    const fixture = await prepareIntegrityFixture();
    expect((await runCliFrom(fixture.root, 'migrate-cli.ts', fixture.dbPath)).exitCode).toBe(0);
    const before = migrationLedgerAt(fixture.dbPath);
    rmSync(fixture.capturePath);
    const refused = await restoreFixture(fixture);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr).toContain('ENOENT');
    expect(migrationLedgerAt(fixture.dbPath)).toEqual(before);
  }, 60_000);

  it('refuses an unreadable capture in a nonprivileged CLI process', async () => {
    if (process.getuid?.() === 0)
      throw new Error('unreadability proof needs a nonprivileged runner');
    const fixture = await prepareIntegrityFixture();
    expect((await runCliFrom(fixture.root, 'migrate-cli.ts', fixture.dbPath)).exitCode).toBe(0);
    const before = migrationLedgerAt(fixture.dbPath);
    chmodSync(fixture.capturePath, 0o000);
    const refused = await restoreFixture(fixture);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr).toContain('EACCES');
    expect(migrationLedgerAt(fixture.dbPath)).toEqual(before);
  }, 60_000);

  it.each([
    ['malformed JSON', '{'],
    ['unsupported capture version', { version: 2 }],
    ['duplicate migration identity', { pending: 'duplicate' }],
  ])(
    'refuses %s before reversing an addition',
    async (label, mutation) => {
      const fixture = await prepareIntegrityFixture();
      expect((await runCliFrom(fixture.root, 'migrate-cli.ts', fixture.dbPath)).exitCode).toBe(0);
      const before = migrationLedgerAt(fixture.dbPath);
      const contents =
        typeof mutation === 'string'
          ? mutation
          : JSON.stringify({
              ...fixture.captured,
              ...mutation,
              applied:
                'pending' in mutation && mutation.pending === 'duplicate'
                  ? [fixture.captured.applied[0], fixture.captured.applied[0]]
                  : fixture.captured.applied,
              pending: fixture.captured.pending,
            });
      writeFileSync(fixture.capturePath, contents);
      const refused = await restoreFixture(fixture);
      expect(refused.exitCode).not.toBe(0);
      expect(migrationLedgerAt(fixture.dbPath)).toEqual(before);
      expect(schemaAt(fixture.dbPath).some((ddl) => ddl.includes('first_table'))).toBe(true);
      expect(schemaAt(fixture.dbPath).some((ddl) => ddl.includes('second_table'))).toBe(true);
    },
    60_000,
  );

  it.each(['target', 'attempt', 'candidate'] as const)(
    'refuses a capture belonging to another %s before reversing an addition',
    async (field) => {
      const fixture = await prepareIntegrityFixture();
      expect((await runCliFrom(fixture.root, 'migrate-cli.ts', fixture.dbPath)).exitCode).toBe(0);
      const before = migrationLedgerAt(fixture.dbPath);
      writeFileSync(fixture.capturePath, JSON.stringify({ ...fixture.captured, [field]: 'other' }));
      const refused = await restoreFixture(fixture);
      expect(refused.exitCode).not.toBe(0);
      expect(refused.stderr).toContain('another target, attempt or candidate');
      expect(migrationLedgerAt(fixture.dbPath)).toEqual(before);
    },
    60_000,
  );

  it('refuses an unexpected applied migration before reversing a candidate', async () => {
    const fixture = await prepareIntegrityFixture();
    expect((await runCliFrom(fixture.root, 'migrate-cli.ts', fixture.dbPath)).exitCode).toBe(0);
    const sqlite = openDatabase(fixture.dbPath);
    try {
      sqlite.run(
        "INSERT INTO __drizzle_migrations (hash, created_at, name) VALUES (?, ?, 'other_migration')",
        ['a'.repeat(64), 20260101000003],
      );
    } finally {
      sqlite.close();
    }
    const before = migrationLedgerAt(fixture.dbPath);
    const refused = await restoreFixture(fixture);
    expect(refused.exitCode).not.toBe(0);
    expect(migrationLedgerAt(fixture.dbPath)).toEqual(before);
    expect(refused.stderr).toContain('unexpected or changed migration other_migration');
  }, 60_000);

  it('refuses a changed pending ledger identity before reversing either candidate', async () => {
    const fixture = await prepareIntegrityFixture();
    expect((await runCliFrom(fixture.root, 'migrate-cli.ts', fixture.dbPath)).exitCode).toBe(0);
    const sqlite = openDatabase(fixture.dbPath);
    try {
      sqlite.run('UPDATE __drizzle_migrations SET hash = ? WHERE name = ?', [
        'c'.repeat(64),
        fixture.first,
      ]);
    } finally {
      sqlite.close();
    }
    const before = migrationLedgerAt(fixture.dbPath);
    const refused = await restoreFixture(fixture);
    expect(refused.exitCode).not.toBe(0);
    expect(migrationLedgerAt(fixture.dbPath)).toEqual(before);
    expect(schemaAt(fixture.dbPath).some((ddl) => ddl.includes('second_table'))).toBe(true);
    expect(refused.stderr).toContain(`unexpected or changed migration ${fixture.first}`);
  }, 60_000);

  it('refuses capture when the applied baseline ledger has duplicate names', async () => {
    const fixture = await prepareIntegrityFixture();
    const sqlite = openDatabase(fixture.dbPath);
    try {
      sqlite.run(
        'INSERT INTO __drizzle_migrations (hash, created_at, name) SELECT hash, created_at, name FROM __drizzle_migrations WHERE name = ?',
        [fixture.baseline],
      );
    } finally {
      sqlite.close();
    }
    const before = migrationLedgerAt(fixture.dbPath);
    const refused = await runCliFrom(
      fixture.root,
      'migrate-status-cli.ts',
      fixture.dbPath,
      '--capture',
      ...fixture.identity,
    );
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stdout).toBe('');
    expect(refused.stderr).toContain(`duplicate applied migration ${fixture.baseline}`);
    expect(migrationLedgerAt(fixture.dbPath)).toEqual(before);
  }, 60_000);

  it.each(['baseline', 'pending'] as const)(
    'refuses a duplicate observed %s ledger name before reversing either candidate',
    async (kind) => {
      const fixture = await prepareIntegrityFixture();
      expect((await runCliFrom(fixture.root, 'migrate-cli.ts', fixture.dbPath)).exitCode).toBe(0);
      const duplicated = kind === 'baseline' ? fixture.baseline : fixture.first;
      const sqlite = openDatabase(fixture.dbPath);
      try {
        sqlite.run(
          'INSERT INTO __drizzle_migrations (hash, created_at, name) SELECT hash, created_at, name FROM __drizzle_migrations WHERE name = ?',
          [duplicated],
        );
      } finally {
        sqlite.close();
      }
      const before = migrationLedgerAt(fixture.dbPath);
      const beforeSchema = schemaAt(fixture.dbPath);
      const refused = await restoreFixture(fixture);
      expect(refused.exitCode).not.toBe(0);
      expect(migrationLedgerAt(fixture.dbPath)).toEqual(before);
      expect(schemaAt(fixture.dbPath)).toEqual(beforeSchema);
      expect(refused.stderr).toContain(`duplicate applied migration ${duplicated}`);
    },
    60_000,
  );

  it('refuses a malformed captured migration hash before reversing an addition', async () => {
    const fixture = await prepareIntegrityFixture();
    expect((await runCliFrom(fixture.root, 'migrate-cli.ts', fixture.dbPath)).exitCode).toBe(0);
    const before = migrationLedgerAt(fixture.dbPath);
    writeFileSync(
      fixture.capturePath,
      JSON.stringify({
        ...fixture.captured,
        applied: [{ name: fixture.baseline, hash: 'not-a-sha256' }],
      }),
    );
    const refused = await restoreFixture(fixture);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr).toContain('Invalid string');
    expect(migrationLedgerAt(fixture.dbPath)).toEqual(before);
  }, 60_000);

  it.each(['missing', 'changed'] as const)(
    'refuses a %s captured baseline ledger identity before reversing a candidate',
    async (fault) => {
      const fixture = await prepareIntegrityFixture();
      expect((await runCliFrom(fixture.root, 'migrate-cli.ts', fixture.dbPath)).exitCode).toBe(0);
      const sqlite = openDatabase(fixture.dbPath);
      try {
        sqlite.run(
          fault === 'missing'
            ? 'DELETE FROM __drizzle_migrations WHERE name = ?'
            : 'UPDATE __drizzle_migrations SET hash = ? WHERE name = ?',
          fault === 'missing' ? [fixture.baseline] : ['b'.repeat(64), fixture.baseline],
        );
      } finally {
        sqlite.close();
      }
      const before = migrationLedgerAt(fixture.dbPath);
      const refused = await restoreFixture(fixture);
      expect(refused.exitCode).not.toBe(0);
      expect(migrationLedgerAt(fixture.dbPath)).toEqual(before);
      expect(refused.stderr).toContain(
        `captured migration ${fixture.baseline} is absent or changed`,
      );
    },
    60_000,
  );

  it.each(['migration.sql', 'down.sql'] as const)(
    'refuses changed %s bytes before reversing either candidate',
    async (script) => {
      const fixture = await prepareIntegrityFixture();
      expect((await runCliFrom(fixture.root, 'migrate-cli.ts', fixture.dbPath)).exitCode).toBe(0);
      const before = migrationLedgerAt(fixture.dbPath);
      const path = join(fixture.root, 'drizzle', fixture.first, script);
      writeFileSync(path, `${readFileSync(path, 'utf8')}\n-- changed after capture`);
      const refused = await restoreFixture(fixture);
      expect(refused.exitCode).not.toBe(0);
      expect(migrationLedgerAt(fixture.dbPath)).toEqual(before);
      expect(schemaAt(fixture.dbPath).some((ddl) => ddl.includes('second_table'))).toBe(true);
      expect(refused.stderr).toContain(script === 'down.sql' ? 'down script' : 'migration script');
    },
    60_000,
  );

  it.each(['migration.sql', 'down.sql'] as const)(
    'refuses missing %s before reversing either candidate',
    async (script) => {
      const fixture = await prepareIntegrityFixture();
      expect((await runCliFrom(fixture.root, 'migrate-cli.ts', fixture.dbPath)).exitCode).toBe(0);
      const before = migrationLedgerAt(fixture.dbPath);
      rmSync(join(fixture.root, 'drizzle', fixture.first, script));
      const refused = await restoreFixture(fixture);
      expect(refused.exitCode).not.toBe(0);
      expect(migrationLedgerAt(fixture.dbPath)).toEqual(before);
      expect(schemaAt(fixture.dbPath).some((ddl) => ddl.includes('second_table'))).toBe(true);
    },
    60_000,
  );

  it.each(['migration.sql', 'down.sql'] as const)(
    'refuses unreadable %s in a nonprivileged CLI before reversing either candidate',
    async (script) => {
      if (process.getuid?.() === 0)
        throw new Error('unreadability proof needs a nonprivileged runner');
      const fixture = await prepareIntegrityFixture();
      expect((await runCliFrom(fixture.root, 'migrate-cli.ts', fixture.dbPath)).exitCode).toBe(0);
      const before = migrationLedgerAt(fixture.dbPath);
      chmodSync(join(fixture.root, 'drizzle', fixture.first, script), 0o000);
      const refused = await restoreFixture(fixture);
      expect(refused.exitCode).not.toBe(0);
      expect(refused.stderr).toContain('EACCES');
      expect(migrationLedgerAt(fixture.dbPath)).toEqual(before);
      expect(schemaAt(fixture.dbPath).some((ddl) => ddl.includes('second_table'))).toBe(true);
    },
    60_000,
  );

  it('restores a partial forward application and repeats as a verified no-op', async () => {
    const fixture = await prepareIntegrityFixture();
    const firstOnly = join(fixture.root, 'first-only');
    mkdirSync(firstOnly);
    cpSync(join(fixture.root, 'drizzle', fixture.first), join(firstOnly, fixture.first), {
      recursive: true,
    });
    runMigrations(fixture.dbPath, firstOnly);
    expect(migrationLedgerAt(fixture.dbPath).map((row) => row.name)).toEqual([
      fixture.baseline,
      fixture.first,
    ]);
    const restored = await restoreFixture(fixture);
    expect(restored.exitCode).toBe(0);
    expect(restored.stdout).toContain(fixture.first);
    expect(restored.stdout).not.toContain(fixture.second);
    expect(migrationLedgerAt(fixture.dbPath).map((row) => row.name)).toEqual([fixture.baseline]);
    expect((await restoreFixture(fixture)).stdout).toContain('(already restored)');
  }, 60_000);

  it('rolls back a failed down statement and its ledger deletion, then retries with the same capture', async () => {
    const fixture = await prepareIntegrityFixture();
    const down = join(fixture.root, 'drizzle', fixture.first, 'down.sql');
    writeFileSync(
      down,
      "INSERT INTO first_table (id) VALUES ('marker');\n--> statement-breakpoint\nDROP TABLE missing_cleanup;\n--> statement-breakpoint\nDROP TABLE first_table;",
    );
    const recaptured = await runCliFrom(
      fixture.root,
      'migrate-status-cli.ts',
      fixture.dbPath,
      '--capture',
      ...fixture.identity,
    );
    expect(recaptured.exitCode).toBe(0);
    writeFileSync(fixture.capturePath, recaptured.stdout);
    expect((await runCliFrom(fixture.root, 'migrate-cli.ts', fixture.dbPath)).exitCode).toBe(0);
    const refused = await restoreFixture(fixture);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr).toContain(`rolling back ${fixture.first} failed`);
    expect(migrationLedgerAt(fixture.dbPath).map((row) => row.name)).toEqual([
      fixture.baseline,
      fixture.first,
    ]);
    const sqlite = openDatabase(fixture.dbPath);
    try {
      expect(sqlite.query('SELECT id FROM first_table').all()).toEqual([]);
      sqlite.run('CREATE TABLE missing_cleanup (id text)');
    } finally {
      sqlite.close();
    }
    const retried = await restoreFixture(fixture);
    expect(retried.exitCode).toBe(0);
    expect(migrationLedgerAt(fixture.dbPath).map((row) => row.name)).toEqual([fixture.baseline]);
  }, 60_000);

  it('import the SQLite source runners without moving their app paths', () => {
    const expectedImports = new Map<string, readonly string[]>([
      ['migrate-cli.ts', ["from '@wbs/store-sqlite/migrate'"]],
      ['migrate-down-cli.ts', ["from '@wbs/store-sqlite/migrate-down'"]],
      [
        'migrate-status-cli.ts',
        ["from '@wbs/store-sqlite/db'", "from '@wbs/store-sqlite/migrate-down'"],
      ],
      [
        'backfill-step-codes-cli.ts',
        [
          "from '@wbs/store-sqlite/db'",
          "from '@wbs/store-sqlite/event-log'",
          "from '@wbs/store-sqlite/step-code-backfill'",
        ],
      ],
      [
        'typed-dependency-rollback-cli.ts',
        ["from '@wbs/store-sqlite/db'", "from '@wbs/store-sqlite/typed-dependency-rollback'"],
      ],
      [
        'work-item-status-facts-rollback-cli.ts',
        ["from '@wbs/store-sqlite/db'", "from '@wbs/store-sqlite/work-item-status-facts-rollback'"],
      ],
      [
        'space-rollback-cli.ts',
        ["from '@wbs/store-sqlite/db'", "from '@wbs/store-sqlite/space-rollback'"],
      ],
      [
        'project-rank-rollback-cli.ts',
        ["from '@wbs/store-sqlite/db'", "from '@wbs/store-sqlite/project-rank-rollback'"],
      ],
    ]);
    for (const [file, imports] of expectedImports) {
      const source = readFileSync(join(APP_ROOT, 'src', file), 'utf8');
      for (const expectedImport of imports) expect(source).toContain(expectedImport);
    }
  });

  it('applies, reports, and reverses the newest migration through the stable CLI paths', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-migration-cli-'));
    roots.push(root);
    const dbPath = join(root, 'plan.db');
    const baselineMigrations = join(root, 'baseline-migrations');
    const names = readdirSync(MIGRATIONS).sort();
    const latest = names.at(-1);
    const baseline = names.at(-2);
    if (latest === undefined || baseline === undefined) {
      throw new Error('migration CLI round trip requires at least two migrations');
    }
    for (const name of names.slice(0, -1)) {
      cpSync(join(MIGRATIONS, name), join(baselineMigrations, name), { recursive: true });
    }
    runMigrations(dbPath, baselineMigrations);
    const priorSchema = schemaAt(dbPath);

    // Proof: importing `@wbs/store-sqlite/migrate-missing` from migrate-cli.ts
    // made this production invocation exit 1 with `Cannot find module
    // '@wbs/store-sqlite/migrate-missing'` instead of applying `latest`.
    // Changing its folder from `./drizzle` to `../drizzle` separately made the
    // same invocation exit 1 with `ENOENT: scandir '../drizzle'`. Observed
    // 2026-09-10.
    const up = await runCli('migrate-cli.ts', dbPath);
    expect(up).toEqual({ exitCode: 0, stdout: 'migrations applied\n', stderr: '' });
    expect((await runCli('migrate-status-cli.ts', dbPath)).stdout.trim()).toBe(latest);

    const down = await runCli('migrate-down-cli.ts', dbPath, `--to=${baseline}`);
    expect(down.exitCode).toBe(0);
    expect(down.stderr).toBe('');
    expect(down.stdout).toContain(`rolled back: ${latest}`);
    expect(schemaAt(dbPath)).toEqual(priorSchema);
    expect((await runCli('migrate-status-cli.ts', dbPath)).stdout.trim()).toBe(baseline);
  }, 60_000);

  it('previews organization selection read-only, and fails without a database', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-selection-preview-cli-'));
    roots.push(root);
    const dbPath = join(root, 'plan.db');
    runMigrations(dbPath, MIGRATIONS);
    const previewed = await runCli('organization-selection-preview-cli.ts', dbPath);
    expect(previewed.exitCode).toBe(0);
    expect(JSON.parse(previewed.stdout)).toEqual({ marker: 'pre_activation', users: [] });
    const missing = await runCli('organization-selection-preview-cli.ts', join(root, 'none.db'));
    expect(missing.exitCode).not.toBe(0);
  }, 60_000);

  it('codes the steps an older release left uncoded, and codes nothing on a rerun', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-backfill-cli-'));
    roots.push(root);
    const dbPath = join(root, 'plan.db');
    runMigrations(dbPath, MIGRATIONS);
    const sqlite = openDatabase(dbPath);
    try {
      sqlite.run(
        "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u', 'owner', 'x', 1)",
      );
      sqlite.run(
        'INSERT INTO project (id, name, owner_id, restricted, estimate_method, start_date, revision, created_at)' +
          " VALUES ('p', 'Shed', 'u', 0, 'pert', NULL, 0, 1)",
      );
      // The outgoing release's statement: it names no `code`.
      sqlite.run("INSERT INTO step (id, project_id, name, position) VALUES ('s', 'p', 'Dev', 10)");
    } finally {
      sqlite.close();
    }

    const first = await runCli('backfill-step-codes-cli.ts', dbPath);
    expect(first).toEqual({
      exitCode: 0,
      stdout: 'coded step s in project p as dev\nstep codes backfilled: 1\n',
      stderr: '',
    });
    const again = await runCli('backfill-step-codes-cli.ts', dbPath);
    expect(again).toEqual({ exitCode: 0, stdout: 'step codes backfilled: 0\n', stderr: '' });
  }, 60_000);

  it('exits non-zero when the backfill cannot run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-backfill-cli-'));
    roots.push(root);
    // An unmigrated file has no `step` table: the backfill must fail the
    // command, not report zero steps coded.
    const failed = await runCli('backfill-step-codes-cli.ts', join(root, 'empty.db'));
    expect(failed.exitCode).not.toBe(0);
    expect(failed.stderr).toContain('no such table: step');
  }, 60_000);

  it('saves, removes and restores spaces through the rollback CLI', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-spaces-cli-'));
    roots.push(root);
    const dbPath = join(root, 'plan.db');
    const savedPath = join(root, 'spaces.json');
    runMigrations(dbPath, MIGRATIONS);
    const sqlite = openDatabase(dbPath);
    try {
      sqlite.run(
        "INSERT INTO users (id,username,password_hash,created_at) VALUES ('u','owner','x',1)",
      );
      sqlite.run("INSERT INTO organization (id,name,created_at) VALUES ('o','O',1)");
      sqlite.run(
        "INSERT INTO project (id,name,owner_id,restricted,estimate_method,revision,created_at) VALUES ('p','Project','u',0,'pert',0,1)",
      );
      sqlite.run("INSERT INTO project_organization (resource_id,organization_id) VALUES ('p','o')");
      sqlite.run(
        "INSERT INTO space (id,organization_id,name,revision,created_at,created_by) VALUES ('s','o','Q3',1,1,'u')",
      );
      sqlite.run(
        "INSERT INTO space_project (space_id,project_id,organization_id,position,created_at,created_by) VALUES ('s','p','o',10,1,'u')",
      );
    } finally {
      sqlite.close();
    }
    expect(await runCli('space-rollback-cli.ts', dbPath, 'save', savedPath)).toEqual({
      exitCode: 0,
      stdout: 'spaces saved: 1\n',
      stderr: '',
    });
    expect(JSON.parse(readFileSync(savedPath, 'utf8'))).toMatchObject({
      format: 'space-save',
      version: 1,
      spaces: [{ id: 's', members: [{ projectId: 'p', position: 10 }] }],
    });
    expect(await runCli('space-rollback-cli.ts', dbPath, 'remove', savedPath)).toEqual({
      exitCode: 0,
      stdout: 'spaces removed: 1\n',
      stderr: '',
    });
    expect(await runCli('space-rollback-cli.ts', dbPath, 'restore', savedPath)).toEqual({
      exitCode: 0,
      stdout: 'spaces restored: 1\n',
      stderr: '',
    });
    const restored = openDatabase(dbPath);
    try {
      expect(restored.query('SELECT space_id, project_id FROM space_project').all()).toEqual([
        { space_id: 's', project_id: 'p' },
      ]);
    } finally {
      restored.close();
    }
    const invalid = await runCli('space-rollback-cli.ts', dbPath, 'erase', savedPath);
    expect(invalid.exitCode).not.toBe(0);
    expect(invalid.stderr).toContain('usage:');
    const missingArgument = await runCli('space-rollback-cli.ts', dbPath, 'restore');
    expect(missingArgument.exitCode).not.toBe(0);
    expect(missingArgument.stderr).toContain('usage:');
    const absentFile = await runCli(
      'space-rollback-cli.ts',
      dbPath,
      'remove',
      join(root, 'absent.json'),
    );
    expect(absentFile.exitCode).not.toBe(0);
    expect(absentFile.stderr).toContain('ENOENT');
  }, 60_000);

  it('saves, removes and restores project ranks through the rollback CLI', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-project-rank-cli-'));
    roots.push(root);
    const dbPath = join(root, 'plan.db');
    const savedPath = join(root, 'ranks.json');
    runMigrations(dbPath, MIGRATIONS);
    const sqlite = openDatabase(dbPath);
    try {
      sqlite.run(
        "INSERT INTO users (id,username,password_hash,created_at) VALUES ('u','owner','x',1)",
      );
      sqlite.run("INSERT INTO organization (id,name,created_at) VALUES ('o','O',1)");
      sqlite.run(
        "INSERT INTO project (id,name,owner_id,restricted,estimate_method,revision,created_at) VALUES ('p','Project','u',0,'pert',0,1)",
      );
      sqlite.run("INSERT INTO project_organization (resource_id,organization_id) VALUES ('p','o')");
      sqlite.run(
        "INSERT INTO project_rank (project_id,organization_id,position,created_at,updated_at,created_by) VALUES ('p','o',10,1,1,'u')",
      );
    } finally {
      sqlite.close();
    }
    expect(await runCli('project-rank-rollback-cli.ts', dbPath, 'save', savedPath)).toEqual({
      exitCode: 0,
      stdout: 'project ranks saved: 1\n',
      stderr: '',
    });
    expect(JSON.parse(readFileSync(savedPath, 'utf8'))).toMatchObject({
      format: 'project-rank-save',
      version: 1,
      ranks: [{ projectId: 'p', organizationId: 'o', position: 10 }],
    });
    expect(await runCli('project-rank-rollback-cli.ts', dbPath, 'remove', savedPath)).toEqual({
      exitCode: 0,
      stdout: 'project ranks removed: 1\n',
      stderr: '',
    });
    expect(await runCli('project-rank-rollback-cli.ts', dbPath, 'restore', savedPath)).toEqual({
      exitCode: 0,
      stdout: 'project ranks restored: 1\n',
      stderr: '',
    });
    const invalid = await runCli('project-rank-rollback-cli.ts', dbPath, 'erase', savedPath);
    expect(invalid.exitCode).not.toBe(0);
    expect(invalid.stderr).toContain('usage:');
    const missingArgument = await runCli('project-rank-rollback-cli.ts', dbPath, 'restore');
    expect(missingArgument.exitCode).not.toBe(0);
    expect(missingArgument.stderr).toContain('usage:');
  }, 60_000);

  it('saves, removes and restores readiness and holds through the rollback CLI', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-hold-cli-'));
    roots.push(root);
    const dbPath = join(root, 'plan.db');
    const savedPath = join(root, 'holds.json');
    runMigrations(dbPath, MIGRATIONS);
    const sqlite = openDatabase(dbPath);
    try {
      sqlite.run(
        "INSERT INTO users (id,username,password_hash,created_at) VALUES ('u','owner','x',1)",
      );
      sqlite.run(
        "INSERT INTO project (id,name,owner_id,restricted,estimate_method,revision,created_at) VALUES ('p','Project','u',0,'pert',0,1)",
      );
      sqlite.run(
        "INSERT INTO work_item (id,project_id,position,name,revision,hold) VALUES ('a','p',1,'A',0,'on_hold')",
      );
    } finally {
      sqlite.close();
    }
    expect(
      await runCli('work-item-status-facts-rollback-cli.ts', dbPath, 'save', savedPath),
    ).toEqual({
      exitCode: 0,
      stdout: 'work item status facts saved: 1\n',
      stderr: '',
    });
    expect(
      await runCli('work-item-status-facts-rollback-cli.ts', dbPath, 'remove', savedPath),
    ).toEqual({
      exitCode: 0,
      stdout: 'work item status facts removed: 1\n',
      stderr: '',
    });
    expect(
      await runCli('work-item-status-facts-rollback-cli.ts', dbPath, 'restore', savedPath),
    ).toEqual({
      exitCode: 0,
      stdout: 'work item status facts restored: 1\n',
      stderr: '',
    });
    const restored = openDatabase(dbPath);
    try {
      expect(
        restored
          .query<{ hold: string | null }, []>("SELECT hold FROM work_item WHERE id = 'a'")
          .get(),
      ).toEqual({ hold: 'on_hold' });
    } finally {
      restored.close();
    }
    const invalid = await runCli(
      'work-item-status-facts-rollback-cli.ts',
      dbPath,
      'erase',
      savedPath,
    );
    expect(invalid.exitCode).not.toBe(0);
    expect(invalid.stderr).toContain('usage:');
    const missingArgument = await runCli(
      'work-item-status-facts-rollback-cli.ts',
      dbPath,
      'restore',
    );
    expect(missingArgument.exitCode).not.toBe(0);
    expect(missingArgument.stderr).toContain('usage:');
  }, 60_000);

  it('saves, removes and restores typed rows through the rollback CLI', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-typed-cli-'));
    roots.push(root);
    const dbPath = join(root, 'plan.db');
    const savedPath = join(root, 'typed.json');
    runMigrations(dbPath, MIGRATIONS);
    const sqlite = openDatabase(dbPath);
    try {
      sqlite.run(
        "INSERT INTO users (id,username,password_hash,created_at) VALUES ('u','owner','x',1)",
      );
      sqlite.run(
        "INSERT INTO project (id,name,owner_id,restricted,estimate_method,revision,created_at) VALUES ('p','Project','u',0,'pert',0,1)",
      );
      sqlite.run(
        "INSERT INTO work_item (id,project_id,position,name,revision) VALUES ('a','p',1,'A',0),('b','p',2,'B',0)",
      );
      sqlite.run(
        "INSERT INTO typed_dependency (id,project_id,predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type,created_at) VALUES ('link','p','a','whole','b','whole','FS',12)",
      );
    } finally {
      sqlite.close();
    }
    expect(await runCli('typed-dependency-rollback-cli.ts', dbPath, 'save', savedPath)).toEqual({
      exitCode: 0,
      stdout: 'typed dependencies saved: 1\n',
      stderr: '',
    });
    expect(JSON.parse(readFileSync(savedPath, 'utf8'))).toMatchObject({
      format: 'typed-dependency-save',
      version: 1,
      rows: [{ id: 'link', createdAt: 12 }],
    });
    expect(await runCli('typed-dependency-rollback-cli.ts', dbPath, 'remove', savedPath)).toEqual({
      exitCode: 0,
      stdout: 'typed dependencies removed: 1\n',
      stderr: '',
    });
    expect(await runCli('typed-dependency-rollback-cli.ts', dbPath, 'restore', savedPath)).toEqual({
      exitCode: 0,
      stdout: 'typed dependencies restored: 1\n',
      stderr: '',
    });
    const restored = openDatabase(dbPath);
    try {
      expect(restored.query<{ id: string }, []>('SELECT id FROM typed_dependency').all()).toEqual([
        { id: 'link' },
      ]);
    } finally {
      restored.close();
    }
    const invalid = await runCli('typed-dependency-rollback-cli.ts', dbPath, 'erase', savedPath);
    expect(invalid.exitCode).not.toBe(0);
    expect(invalid.stderr).toContain('usage:');
    const missingArgument = await runCli('typed-dependency-rollback-cli.ts', dbPath, 'restore');
    expect(missingArgument.exitCode).not.toBe(0);
    expect(missingArgument.stderr).toContain('usage:');
    const absentFile = await runCli(
      'typed-dependency-rollback-cli.ts',
      dbPath,
      'remove',
      join(root, 'absent.json'),
    );
    expect(absentFile.exitCode).not.toBe(0);
    expect(absentFile.stderr).toContain('ENOENT');
    const unreadableFile = await runCli('typed-dependency-rollback-cli.ts', dbPath, 'remove', root);
    expect(unreadableFile.exitCode).not.toBe(0);
  }, 60_000);
});
