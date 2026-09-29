import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, describe, expect, it } from 'bun:test';

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
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

function runSql(dbPath: string, statement: string): void {
  const sqlite = openDatabase(dbPath);
  try {
    sqlite.run(statement);
  } finally {
    sqlite.close();
  }
}

function markers(dbPath: string): string[] {
  const sqlite = openDatabase(dbPath);
  try {
    return sqlite
      .query<{ v: string }, []>('SELECT v FROM backup_marker ORDER BY rowid')
      .all()
      .map(({ v }) => v);
  } finally {
    sqlite.close();
  }
}

describe('backup-db-cli and restore-db-cli', () => {
  it('back up the database the swap is about to migrate, and restore it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-backup-cli-'));
    roots.push(root);
    const dbPath = join(root, 'wbs.db');
    runMigrations(dbPath, join(APP_ROOT, 'drizzle'));
    runSql(dbPath, 'CREATE TABLE backup_marker (v TEXT NOT NULL)');
    runSql(dbPath, "INSERT INTO backup_marker (v) VALUES ('before')");
    const snapshotPath = join(root, 'backups', 'wbs-pre-deploy.db');

    const backup = await runCli('backup-db-cli.ts', dbPath, snapshotPath);
    expect(backup.exitCode).toBe(0);
    const reported = JSON.parse(backup.stdout) as { path: string; migrations: string[] };
    expect(reported.path).toBe(snapshotPath);
    expect(reported.migrations.length).toBeGreaterThan(0);

    runSql(dbPath, "INSERT INTO backup_marker (v) VALUES ('after')");
    expect(markers(dbPath)).toEqual(['before', 'after']);

    const restore = await runCli('restore-db-cli.ts', dbPath, snapshotPath);
    expect(restore.exitCode).toBe(0);
    expect(markers(dbPath)).toEqual(['before']);
  });

  it('refuses a backup without a target path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-backup-cli-'));
    roots.push(root);
    const dbPath = join(root, 'wbs.db');
    runMigrations(dbPath, join(APP_ROOT, 'drizzle'));

    const backup = await runCli('backup-db-cli.ts', dbPath);
    expect(backup.exitCode).not.toBe(0);
    expect(backup.stderr).toContain('usage: backup-db-cli.ts');
  });

  it('refuses to restore a snapshot that does not exist, leaving the database in place', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-backup-cli-'));
    roots.push(root);
    const dbPath = join(root, 'wbs.db');
    runMigrations(dbPath, join(APP_ROOT, 'drizzle'));

    const restore = await runCli('restore-db-cli.ts', dbPath, join(root, 'absent.db'));
    expect(restore.exitCode).not.toBe(0);
    expect(existsSync(dbPath)).toBe(true);
  });
});
