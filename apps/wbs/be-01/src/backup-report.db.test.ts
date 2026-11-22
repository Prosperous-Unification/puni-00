import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase, openReadOnlyDatabase } from '@wbs/store-sqlite/db';
import { migrateEmptyCatalogueFixture } from '@wbs/store-sqlite/testing/catalogue-database';
import { afterEach, expect, test } from 'bun:test';

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wbs-window-report-'));
  roots.push(root);
  const sourcePath = join(root, 'wbs.db');
  migrateEmptyCatalogueFixture(
    { path: sourcePath, directory: root, reportedAt: 1 },
    { hasUnknownOwner: false },
  );
  const database = openDatabase(sourcePath);
  try {
    database.run('CREATE TABLE window_marker (value TEXT NOT NULL)');
    database.run("INSERT INTO window_marker VALUES ('preserved')");
  } finally {
    database.close();
  }
  return {
    sourcePath,
    snapshotPath: join(root, 'snapshot.db'),
    reportPath: join(root, 'report.json'),
  };
}

async function backup(sourcePath: string, snapshotPath: string, reportPath: string) {
  // Target first makes the pre-implementation CLI create only the intended temporary snapshot.
  const child = Bun.spawn(
    [process.execPath, 'run', 'src/backup-db-cli.ts', snapshotPath, `--report=${reportPath}`],
    {
      cwd: APP_ROOT,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', DB_PATH: sourcePath },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

function digest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function ledger(path: string) {
  const database = openReadOnlyDatabase(path);
  try {
    return database
      .query<{ name: string; hash: string }, []>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY created_at,name',
      )
      .all();
  } finally {
    database.close();
  }
}

test('writes actual source snapshot and complete ledger identities into a window report', async () => {
  const paths = fixture();
  const answer = await backup(paths.sourcePath, paths.snapshotPath, paths.reportPath);
  expect(answer.exitCode).toBe(0);
  const prefix = 'window backup retained artifacts:';
  const line = answer.stderr.split('\n').find((entry) => entry.startsWith(prefix));
  if (line === undefined) throw new Error('window backup retained-artifact diagnostic missing');
  const diagnostic: unknown = JSON.parse(line.slice(prefix.length));
  const pathMatcher: unknown = expect.any(String);
  expect(diagnostic).toMatchObject({
    snapshotPath: paths.snapshotPath,
    reportPath: paths.reportPath,
    snapshotPublication: 'published',
    reportPublication: 'published',
    stages: [
      { kind: 'snapshot', path: pathMatcher },
      { kind: 'report', path: pathMatcher },
    ],
  });
  const printedReport: unknown = JSON.parse(answer.stdout);
  const writtenReport: unknown = JSON.parse(readFileSync(paths.reportPath, 'utf8'));
  expect(printedReport).toEqual(writtenReport);
  expect(existsSync(paths.reportPath)).toBe(true);
  const report: unknown = JSON.parse(readFileSync(paths.reportPath, 'utf8'));
  expect(report).toEqual({
    version: 1,
    sourcePath: paths.sourcePath,
    sourceSha256: digest(paths.sourcePath),
    sourceBytes: statSync(paths.sourcePath).size,
    snapshotPath: paths.snapshotPath,
    snapshotSha256: digest(paths.snapshotPath),
    snapshotBytes: statSync(paths.snapshotPath).size,
    migrations: ledger(paths.sourcePath),
  });
  expect(ledger(paths.snapshotPath)).toEqual(ledger(paths.sourcePath));
});

test('refuses an existing report before creating a new snapshot or replacing operator evidence', async () => {
  const paths = fixture();
  const original = 'existing operator evidence\n';
  writeFileSync(paths.reportPath, original);
  const answer = await backup(paths.sourcePath, paths.snapshotPath, paths.reportPath);
  expect(answer.exitCode).not.toBe(0);
  expect(readFileSync(paths.reportPath, 'utf8')).toBe(original);
  expect(existsSync(paths.snapshotPath)).toBe(false);
});

for (const sidecar of ['-wal', '-shm', '-journal']) {
  for (const collision of ['report-source', 'snapshot-source', 'report-snapshot']) {
    test(
      'refuses SQLite namespace collision ' +
        collision +
        sidecar +
        ' before changing source or artifacts',
      async () => {
        const paths = fixture();
        const sourceBefore = readFileSync(paths.sourcePath);
        const snapshotPath =
          collision === 'snapshot-source' ? paths.sourcePath + sidecar : paths.snapshotPath;
        const reportPath =
          collision === 'report-source'
            ? paths.sourcePath + sidecar
            : collision === 'report-snapshot'
              ? snapshotPath + sidecar
              : paths.reportPath;
        expect(existsSync(snapshotPath)).toBe(false);
        expect(existsSync(reportPath)).toBe(false);
        const answer = await backup(paths.sourcePath, snapshotPath, reportPath);
        expect(answer.exitCode).not.toBe(0);
        expect(answer.stderr).toContain('SQLite path namespaces overlap');
        expect(readFileSync(paths.sourcePath)).toEqual(sourceBefore);
        expect(existsSync(snapshotPath)).toBe(false);
        expect(existsSync(reportPath)).toBe(false);
        for (const suffix of ['-wal', '-shm', '-journal'])
          expect(existsSync(paths.sourcePath + suffix)).toBe(false);
      },
    );
  }
}

test('refuses a source WAL report collision through an existing parent symlink', async () => {
  const paths = fixture();
  const alias = join(dirname(paths.sourcePath), 'alias');
  const filesystem = await import('node:fs');
  filesystem.symlinkSync(dirname(paths.sourcePath), alias, 'dir');
  const original = readFileSync(paths.sourcePath);
  const reportPath = join(alias, 'wbs.db-wal');
  const answer = await backup(paths.sourcePath, paths.snapshotPath, reportPath);
  expect(answer.exitCode).not.toBe(0);
  expect(answer.stderr).toContain('SQLite path namespaces overlap');
  expect(readFileSync(paths.sourcePath)).toEqual(original);
  expect(existsSync(paths.snapshotPath)).toBe(false);
  expect(existsSync(reportPath)).toBe(false);
});

test('no-flag backup keeps its original snapshot stdout without window retention diagnostics', async () => {
  const paths = fixture();
  const child = Bun.spawn([process.execPath, 'run', 'src/backup-db-cli.ts', paths.snapshotPath], {
    cwd: APP_ROOT,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', DB_PATH: paths.sourcePath },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode).toBe(0);
  expect(stderr).toBe('');
  expect(JSON.parse(stdout)).toEqual({
    path: paths.snapshotPath,
    sha256: digest(paths.snapshotPath),
    bytes: statSync(paths.snapshotPath).size,
    migrations: ledger(paths.sourcePath).map(({ name }) => name),
  });
  expect(existsSync(paths.reportPath)).toBe(false);
});
