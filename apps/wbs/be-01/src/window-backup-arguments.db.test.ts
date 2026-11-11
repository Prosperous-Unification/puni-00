import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMigrations } from '@wbs/store-sqlite/migrate';
import { afterEach, expect, test } from 'bun:test';

const APP_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
for (const command of ['backup', 'assert'] as const) {
  for (const malformed of [
    'missing-db',
    'missing-argument',
    'empty-report',
    'unknown-option',
    'duplicate-option',
  ] as const) {
    test(
      'refuses ' + command + ' ' + malformed + ' before changing database or artifacts',
      async () => {
        const root = mkdtempSync(join(tmpdir(), 'window-argument-'));
        roots.push(root);
        const sourcePath = join(root, 'source.db');
        const snapshotPath = join(root, 'snapshot.db');
        const reportPath = join(root, 'report.json');
        runMigrations(sourcePath, join(APP_ROOT, 'drizzle'));
        const before = readFileSync(sourcePath);
        let args =
          command === 'backup'
            ? [snapshotPath, '--report=' + reportPath]
            : ['--report=' + reportPath];
        if (malformed === 'missing-argument') args = [];
        if (malformed === 'empty-report')
          args = command === 'backup' ? [snapshotPath, '--report='] : ['--report='];
        if (malformed === 'unknown-option') args.unshift('--unknown=denied');
        if (malformed === 'duplicate-option') args.push('--report=' + reportPath);
        const environment: NodeJS.ProcessEnv = { ...process.env, DB_PATH: sourcePath };
        if (malformed === 'missing-db') delete environment['DB_PATH'];
        const child = Bun.spawn(
          [
            process.execPath,
            'run',
            'src/' + (command === 'backup' ? 'backup-db-cli.ts' : 'assert-window-cli.ts'),
            ...args,
          ],
          {
            cwd: APP_ROOT,
            env: environment,
            stdout: 'pipe',
            stderr: 'pipe',
            signal: AbortSignal.timeout(3500),
            killSignal: 'SIGKILL',
          },
        );
        const [exitCode, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        expect(exitCode).not.toBe(0);
        expect(child.signalCode).toBeNull();
        expect(stdout).toBe('');
        expect(stderr).toContain(
          'error: ' +
            (malformed === 'missing-db'
              ? 'DB_PATH must be set'
              : malformed === 'duplicate-option' && command === 'backup'
                ? 'reportPath was supplied more than once'
                : malformed === 'empty-report' && command === 'backup'
                  ? 'reportPath must be set'
                  : 'usage:'),
        );
        expect(readFileSync(sourcePath)).toEqual(before);
        expect(existsSync(snapshotPath)).toBe(false);
        expect(existsSync(reportPath)).toBe(false);
      },
    );
  }
}

test('refuses two backup targets before changing either artifact', async () => {
  const root = mkdtempSync(join(tmpdir(), 'window-two-targets-'));
  roots.push(root);
  const sourcePath = join(root, 'source.db');
  runMigrations(sourcePath, join(APP_ROOT, 'drizzle'));
  const before = readFileSync(sourcePath);
  const first = join(root, 'first.db');
  const second = join(root, 'second.db');
  const child = Bun.spawn([process.execPath, 'run', 'src/backup-db-cli.ts', first, second], {
    cwd: APP_ROOT,
    env: { ...process.env, DB_PATH: sourcePath },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode).not.toBe(0);
  expect(stdout).toBe('');
  expect(stderr).toContain('usage:');
  expect(readFileSync(sourcePath)).toEqual(before);
  expect(existsSync(first)).toBe(false);
  expect(existsSync(second)).toBe(false);
});

test('refuses a FIFO source without waiting for a writer or creating artifacts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'window-fifo-source-'));
  roots.push(root);
  const sourcePath = join(root, 'source.db');
  const snapshotPath = join(root, 'snapshot.db');
  const reportPath = join(root, 'report.json');
  expect(Bun.spawnSync(['mkfifo', sourcePath]).exitCode).toBe(0);
  const child = Bun.spawn(
    [process.execPath, 'run', 'src/backup-db-cli.ts', snapshotPath, '--report=' + reportPath],
    {
      cwd: APP_ROOT,
      env: { ...process.env, DB_PATH: sourcePath },
      stdout: 'pipe',
      stderr: 'pipe',
      signal: AbortSignal.timeout(3500),
      killSignal: 'SIGKILL',
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode).not.toBe(0);
  expect(child.signalCode).toBeNull();
  expect(stdout).toBe('');
  expect(stderr).toContain('error: sourcePath is not a readable regular file');
  expect(existsSync(snapshotPath)).toBe(false);
  expect(existsSync(reportPath)).toBe(false);
});

test('reports retained artifacts on actual CLI failure after snapshot publication', async () => {
  const filesystem = await import('node:fs');
  const root = mkdtempSync(join(tmpdir(), 'window-cli-retention-'));
  roots.push(root);
  const sourcePath = join(root, 'source.db');
  runMigrations(sourcePath, join(APP_ROOT, 'drizzle'));
  const before = readFileSync(sourcePath);
  const snapshotPath = join(root, 'snapshot.db');
  const parent = join(root, 'report-parent');
  filesystem.mkdirSync(parent);
  filesystem.chmodSync(parent, 0o500);
  const reportPath = join(parent, 'report.json');
  try {
    const child = Bun.spawn(
      [process.execPath, 'run', 'src/backup-db-cli.ts', snapshotPath, '--report=' + reportPath],
      {
        cwd: APP_ROOT,
        env: { ...process.env, DB_PATH: sourcePath },
        stdout: 'pipe',
        stderr: 'pipe',
        signal: AbortSignal.timeout(3500),
        killSignal: 'SIGKILL',
      },
    );
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode).not.toBe(0);
    expect(child.signalCode).toBeNull();
    expect(stdout).toBe('');
    expect(stderr).toContain('EACCES');
    const prefix = 'window backup failed with artifact state:';
    const line = stderr.split('\n').find((line) => line.startsWith(prefix));
    expect(line).toBeDefined();
    if (line === undefined) throw new Error('actual retained-artifact diagnostic missing');
    const artifacts: unknown = JSON.parse(line.slice(prefix.length));
    expect(artifacts).toMatchObject({
      snapshotPath,
      reportPath,
      snapshotPublication: 'published',
      reportPublication: 'not_published',
      stages: [{ kind: 'snapshot' }, { kind: 'report', parent, path: null }],
    });
    expect(existsSync(snapshotPath)).toBe(true);
    expect(existsSync(reportPath)).toBe(false);
    expect(readFileSync(sourcePath)).toEqual(before);
  } finally {
    filesystem.chmodSync(parent, 0o700);
  }
});
