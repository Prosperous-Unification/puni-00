import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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
  const child = Bun.spawn([process.execPath, 'run', `src/${file}`, ...args], {
    cwd: APP_ROOT,
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

describe('migration deploy entrypoints', () => {
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
        'work-item-hold-rollback-cli.ts',
        ["from '@wbs/store-sqlite/db'", "from '@wbs/store-sqlite/work-item-hold-rollback'"],
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

  it('saves, removes and restores holds through the rollback CLI', async () => {
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
    expect(await runCli('work-item-hold-rollback-cli.ts', dbPath, 'save', savedPath)).toEqual({
      exitCode: 0,
      stdout: 'work item holds saved: 1\n',
      stderr: '',
    });
    expect(await runCli('work-item-hold-rollback-cli.ts', dbPath, 'remove', savedPath)).toEqual({
      exitCode: 0,
      stdout: 'work item holds removed: 1\n',
      stderr: '',
    });
    expect(await runCli('work-item-hold-rollback-cli.ts', dbPath, 'restore', savedPath)).toEqual({
      exitCode: 0,
      stdout: 'work item holds restored: 1\n',
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
    const invalid = await runCli('work-item-hold-rollback-cli.ts', dbPath, 'erase', savedPath);
    expect(invalid.exitCode).not.toBe(0);
    expect(invalid.stderr).toContain('usage:');
    const missingArgument = await runCli('work-item-hold-rollback-cli.ts', dbPath, 'restore');
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
