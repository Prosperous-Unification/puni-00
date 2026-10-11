import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';

import { writeAtomic } from './lib/atomic';
import { execute, type SwapExecutionIo } from './swap';

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), '../../../apps/wbs/be-01/src');
const roots: string[] = [];

async function failureMessage(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
    return '';
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

function printedRecoveryArguments(failure: string, capturePath: string): string[] {
  const quoted = [...failure.matchAll(/'([^']*)'/g)].map((match) => match[1]);
  const dockerIndex = quoted.indexOf('docker');
  const cliIndex = quoted.indexOf('src/migrate-down-cli.ts', dockerIndex);
  if (dockerIndex === -1 || cliIndex === -1) throw new Error('no printed recovery CLI');
  return quoted
    .slice(cliIndex + 1)
    .map((argument) =>
      argument === '--capture-file=/migration-capture.json'
        ? `--capture-file=${capturePath}`
        : argument,
    );
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function migrationAt(root: string, name: string, up: string, down: string): void {
  const folder = join(root, 'drizzle', name);
  mkdirSync(folder);
  writeFileSync(join(folder, 'migration.sql'), up);
  writeFileSync(join(folder, 'down.sql'), down);
}

function ledgerAt(dbPath: string): { name: string; hash: string }[] {
  const sqlite = new Database(dbPath, { readonly: true, create: false });
  try {
    return sqlite
      .query<{ name: string; hash: string }, []>(
        'SELECT name, hash FROM __drizzle_migrations ORDER BY name, hash',
      )
      .all();
  } finally {
    sqlite.close();
  }
}

function tablesAt(dbPath: string): string[] {
  const sqlite = new Database(dbPath, { readonly: true, create: false });
  try {
    return sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
  } finally {
    sqlite.close();
  }
}

function prepareComposeFixture(
  rollback: 'real' | 'zero' | 'fail' | 'tamper-copy' | 'tamper-host' = 'real',
  observedDbPath = '/data/plan.db',
) {
  const root = mkdtempSync(join(tmpdir(), 'wbs-compose-migration-'));
  roots.push(root);
  const dbPath = join(root, 'plan.db');
  const baseline = '20261005110000_add_shared_people';
  const candidate = '20261001020000_older_candidate_probe';
  mkdirSync(join(root, 'drizzle'));
  migrationAt(root, baseline, 'CREATE TABLE shared_people (id text);', 'DROP TABLE shared_people;');
  new Database(dbPath).close();
  const baselineRun = Bun.spawnSync([process.execPath, 'run', join(BACKEND, 'migrate-cli.ts')], {
    cwd: root,
    env: { ...process.env, DB_PATH: dbPath },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (baselineRun.exitCode !== 0) throw new Error(baselineRun.stderr.toString());
  const baselineLedger = ledgerAt(dbPath);
  const baselineTables = tablesAt(dbPath);
  migrationAt(
    root,
    candidate,
    'CREATE TABLE older_candidate_probe (id text);',
    'DROP TABLE older_candidate_probe;',
  );
  const containerFiles = new Map<string, string>();
  const commands: string[][] = [];
  const io: SwapExecutionIo & {
    captureStateDir: string;
    readCapture: (path: string) => Promise<string>;
  } = {
    captureStateDir: root,
    readCapture: (path) => Bun.file(path).text(),
    writeAtomic,
    readPhase: () => Promise.resolve('committed'),
    writePhase: () => Promise.resolve(),
    sh: (args) => {
      commands.push(args);
      if (args[0] === 'stop') return Promise.resolve('');
      if (args[0] === 'exec' && args[2] === 'printenv' && args[3] === 'DB_PATH') {
        return Promise.resolve(`${observedDbPath}\n`);
      }
      if (args[0] === 'cp') {
        const source = args.at(1);
        const destination = args.at(2)?.split(':', 2).at(1);
        if (source === undefined || destination === undefined) throw new Error('bad docker cp');
        const contents = readFileSync(source, 'utf8');
        containerFiles.set(destination, rollback === 'tamper-copy' ? `${contents} ` : contents);
        return Promise.resolve('');
      }
      if (args.includes('src/migrate-capture-digest-cli.ts')) {
        const containerPath = args.at(5);
        const contents =
          containerPath === undefined ? undefined : containerFiles.get(containerPath);
        if (contents === undefined) throw new Error('copied capture missing');
        const localPath = join(root, 'copied-capture.json');
        writeFileSync(localPath, contents);
        const child = Bun.spawnSync(
          [process.execPath, 'run', join(BACKEND, 'migrate-capture-digest-cli.ts'), localPath],
          { cwd: root, stdout: 'pipe', stderr: 'pipe' },
        );
        if (child.exitCode !== 0) throw new Error(child.stderr.toString());
        return Promise.resolve(child.stdout.toString());
      }
      if (
        args.includes('src/migrate-down-cli.ts') &&
        (rollback === 'zero' || rollback === 'fail')
      ) {
        if (rollback === 'fail') throw new Error('modeled exact-set down refusal');
        return Promise.resolve('reported restored without reversing');
      }
      if (
        args.includes('src/migrate-status-cli.ts') ||
        args.includes('src/migrate-cli.ts') ||
        args.includes('src/migrate-down-cli.ts')
      ) {
        const file = args.at(4);
        if (file === undefined) throw new Error('missing backend CLI');
        const commandArgs = args.slice(5).map((argument) => {
          if (!argument.startsWith('--capture-file=')) return argument;
          const containerPath = argument.slice('--capture-file='.length);
          const contents = containerFiles.get(containerPath);
          if (contents === undefined) throw new Error(`capture not copied: ${containerPath}`);
          const localPath = join(root, 'container-capture.json');
          writeFileSync(localPath, contents);
          return `--capture-file=${localPath}`;
        });
        const child = Bun.spawnSync(
          [process.execPath, 'run', join(BACKEND, file.replace('src/', '')), ...commandArgs],
          { cwd: root, env: { ...process.env, DB_PATH: dbPath }, stdout: 'pipe', stderr: 'pipe' },
        );
        if (child.exitCode !== 0) throw new Error(child.stderr.toString());
        return Promise.resolve(child.stdout.toString());
      }
      if (rollback === 'tamper-host') {
        const captureName = readdirSync(root).find((name) =>
          name.startsWith('migration-be-01-green-'),
        );
        if (captureName === undefined) throw new Error('capture missing before modeled tamper');
        const capturePath = join(root, captureName);
        const capture = JSON.parse(readFileSync(capturePath, 'utf8')) as {
          applied: { name: string; hash: string }[];
          pending: { name: string; hash: string; downHash: string }[];
        };
        const baselineIdentity = capture.applied.at(0);
        if (baselineIdentity === undefined) throw new Error('baseline identity missing');
        const downHash = createHash('sha256')
          .update(readFileSync(join(root, 'drizzle', baseline, 'down.sql')))
          .digest('hex');
        capture.applied = [];
        capture.pending.push({ ...baselineIdentity, downHash });
        writeFileSync(capturePath, JSON.stringify(capture));
      }
      throw new Error('modeled pre-route failure after migration');
    },
  };
  return { root, dbPath, baseline, baselineLedger, baselineTables, candidate, commands, io };
}

describe('Compose migration command adapter', () => {
  it('refuses a capture digest flag outside exact-set down mode', () => {
    const { root, dbPath, baseline } = prepareComposeFixture();
    const digest = 'a'.repeat(64);
    for (const [script, flags] of [
      ['migrate-status-cli.ts', ['--capture', '--target=t', '--attempt=a', '--candidate=c']],
      ['migrate-down-cli.ts', [`--to=${baseline}`]],
    ] as const) {
      const child = Bun.spawnSync(
        [process.execPath, 'run', join(BACKEND, script), ...flags, `--capture-sha256=${digest}`],
        { cwd: root, env: { ...process.env, DB_PATH: dbPath }, stdout: 'pipe', stderr: 'pipe' },
      );
      expect(child.exitCode).not.toBe(0);
    }
  });

  it('digest CLI refuses paths outside /tmp and ambiguous arguments', () => {
    const { root } = prepareComposeFixture();
    const outside = join(root, 'not-a-capture.json');
    writeFileSync(outside, 'not a capture');
    for (const arguments_ of [['/data/wbs.db'], [outside, outside]]) {
      const child = Bun.spawnSync(
        [process.execPath, 'run', join(BACKEND, 'migrate-capture-digest-cli.ts'), ...arguments_],
        { cwd: root, stdout: 'pipe', stderr: 'pipe' },
      );
      expect(child.exitCode).not.toBe(0);
      expect(child.stderr.toString()).toContain('exactly one /tmp capture path');
    }
  });

  it('aborts to the captured set when an older candidate follows a newer baseline', async () => {
    const { root, dbPath, baselineLedger, baselineTables, commands, io } = prepareComposeFixture();
    expect(
      await failureMessage(
        execute(
          { tier: 'be', from: 'blue', to: 'green', steps: ['migrate', 'grant-alias'] },
          'registry/be-01@sha256:abc',
          'deadbeef',
          io,
        ),
      ),
    ).toContain('modeled pre-route failure');
    expect(commands.some((args) => args.includes('src/migrate-cli.ts'))).toBe(true);
    expect(ledgerAt(dbPath)).toEqual(baselineLedger);
    expect(tablesAt(dbPath)).toEqual(baselineTables);
    expect(readdirSync(root).some((name) => name.endsWith('.json'))).toBe(true);
  }, 60_000);

  it('does not accept a zero-exit down command that leaves the candidate recorded', async () => {
    const { root, dbPath, candidate, commands, io } = prepareComposeFixture('zero');
    expect(
      await failureMessage(
        execute(
          { tier: 'be', from: 'blue', to: 'green', steps: ['migrate', 'grant-alias'] },
          'registry/be-01@sha256:abc',
          'deadbeef',
          io,
        ),
      ),
    ).toContain('migration ledger differs from persisted captured applied set');
    expect(ledgerAt(dbPath).map((row) => row.name)).toContain(candidate);
    expect(tablesAt(dbPath)).toContain('older_candidate_probe');
    expect(commands.at(-1)).toEqual(['stop', 'be-01-green']);
    expect(readdirSync(root).some((name) => name.startsWith('migration-be-01-green-'))).toBe(true);
  }, 60_000);

  it('retains a usable pinned-image recovery command after green stops', async () => {
    const { root, dbPath, baselineLedger, candidate, commands, io } = prepareComposeFixture('fail');
    let failure: unknown;
    try {
      await execute(
        { tier: 'be', from: 'blue', to: 'green', steps: ['migrate', 'grant-alias'] },
        'registry/be-01@sha256:abc',
        'deadbeef',
        io,
      );
    } catch (caught) {
      failure = caught;
    }
    const captureName = readdirSync(root).find((name) => name.startsWith('migration-be-01-green-'));
    if (captureName === undefined) throw new Error('retained capture was not written');
    const capturePath = join(root, captureName);
    expect(failure).toHaveProperty(
      'message',
      expect.stringContaining(`source=${capturePath},target=/migration-capture.json,readonly`),
    );
    expect(failure).toHaveProperty(
      'message',
      expect.stringContaining("'registry/be-01@sha256:abc'"),
    );
    expect(failure).toHaveProperty('message', expect.stringContaining("'docker' 'run' '--rm'"));
    expect(failure).toHaveProperty(
      'message',
      expect.stringContaining("'type=bind,source=/home/puni1/wbs/data,target=/data'"),
    );
    expect(failure).toHaveProperty('message', expect.stringContaining("'DB_PATH=/data/plan.db'"));
    expect(failure).not.toHaveProperty('message', expect.stringContaining('--env-file'));
    expect(commands.at(-1)).toEqual(['stop', 'be-01-green']);
    expect(ledgerAt(dbPath).map((row) => row.name)).toContain(candidate);

    const recoveryArguments = printedRecoveryArguments(String(failure), capturePath);
    const manual = Bun.spawnSync(
      [process.execPath, 'run', join(BACKEND, 'migrate-down-cli.ts'), ...recoveryArguments],
      { cwd: root, env: { ...process.env, DB_PATH: dbPath }, stdout: 'pipe', stderr: 'pipe' },
    );
    expect(manual.exitCode).toBe(0);
    expect(ledgerAt(dbPath)).toEqual(baselineLedger);
    expect(tablesAt(dbPath)).not.toContain('older_candidate_probe');
  }, 60_000);

  it('refuses a modified host capture before copying or reversing migrations', async () => {
    const { dbPath, candidate, commands, io } = prepareComposeFixture();
    let reads = 0;
    const readCapture = io.readCapture;
    io.readCapture = async (path) => {
      const contents = await readCapture(path);
      reads += 1;
      return reads === 1 ? contents : `${contents} `;
    };
    expect(
      await failureMessage(
        execute(
          { tier: 'be', from: 'blue', to: 'green', steps: ['migrate', 'grant-alias'] },
          'registry/be-01@sha256:abc',
          'deadbeef',
          io,
        ),
      ),
    ).toContain('retained migration capture bytes differ');
    expect(ledgerAt(dbPath).map((row) => row.name)).toContain(candidate);
    expect(commands.some((args) => args[0] === 'cp')).toBe(false);
    expect(commands.some((args) => args.includes('src/migrate-down-cli.ts'))).toBe(false);
  }, 60_000);

  it('refuses changed copied bytes before invoking exact-set down', async () => {
    const { dbPath, candidate, commands, io } = prepareComposeFixture('tamper-copy');
    expect(
      await failureMessage(
        execute(
          { tier: 'be', from: 'blue', to: 'green', steps: ['migrate', 'grant-alias'] },
          'registry/be-01@sha256:abc',
          'deadbeef',
          io,
        ),
      ),
    ).toContain('copied migration capture bytes differ');
    expect(ledgerAt(dbPath).map((row) => row.name)).toContain(candidate);
    expect(commands.some((args) => args.includes('src/migrate-down-cli.ts'))).toBe(false);
  }, 60_000);

  it('refuses a green DB_PATH outside the mounted data directory before capture or migration', async () => {
    const { dbPath, baselineLedger, commands, io } = prepareComposeFixture(
      'real',
      '/elsewhere/plan.db',
    );
    expect(
      await failureMessage(
        execute(
          { tier: 'be', from: 'blue', to: 'green', steps: ['migrate'] },
          'registry/be-01@sha256:abc',
          'deadbeef',
          io,
        ),
      ),
    ).toContain('green DB_PATH is not under the mounted /data directory');
    expect(ledgerAt(dbPath)).toEqual(baselineLedger);
    expect(commands.some((args) => args.includes('src/migrate-status-cli.ts'))).toBe(false);
    expect(commands.some((args) => args.includes('src/migrate-cli.ts'))).toBe(false);
  }, 60_000);

  it('manual recovery refuses a tampered retained capture before deleting the baseline', async () => {
    const { root, dbPath, baseline, candidate, commands, io } =
      prepareComposeFixture('tamper-host');
    const failure = await failureMessage(
      execute(
        { tier: 'be', from: 'blue', to: 'green', steps: ['migrate', 'grant-alias'] },
        'registry/be-01@sha256:abc',
        'deadbeef',
        io,
      ),
    );
    expect(failure).toContain('retained migration capture bytes differ');
    expect(commands.some((args) => args.includes('src/migrate-down-cli.ts'))).toBe(false);
    const captureName = readdirSync(root).find((name) => name.startsWith('migration-be-01-green-'));
    if (captureName === undefined) throw new Error('retained capture missing');
    const capturePath = join(root, captureName);
    const recoveryArguments = printedRecoveryArguments(failure, capturePath);
    expect(
      recoveryArguments.some((argument) => /^--capture-sha256=[0-9a-f]{64}$/.test(argument)),
    ).toBe(true);
    const beforeManualLedger = ledgerAt(dbPath);
    const beforeManualTables = tablesAt(dbPath);
    const malformedArguments = recoveryArguments.map((argument) =>
      argument.startsWith('--capture-sha256=') ? '--capture-sha256=bad' : argument,
    );
    const malformed = Bun.spawnSync(
      [process.execPath, 'run', join(BACKEND, 'migrate-down-cli.ts'), ...malformedArguments],
      { cwd: root, env: { ...process.env, DB_PATH: dbPath }, stdout: 'pipe', stderr: 'pipe' },
    );
    expect(malformed.exitCode).not.toBe(0);
    expect(malformed.stderr.toString()).toContain('lowercase SHA-256 digest');
    expect(ledgerAt(dbPath)).toEqual(beforeManualLedger);
    expect(tablesAt(dbPath)).toEqual(beforeManualTables);
    const manual = Bun.spawnSync(
      [process.execPath, 'run', join(BACKEND, 'migrate-down-cli.ts'), ...recoveryArguments],
      { cwd: root, env: { ...process.env, DB_PATH: dbPath }, stdout: 'pipe', stderr: 'pipe' },
    );
    expect(manual.exitCode).not.toBe(0);
    expect(manual.stderr.toString()).toContain('capture SHA-256 differs');
    expect(ledgerAt(dbPath)).toEqual(beforeManualLedger);
    expect(tablesAt(dbPath)).toEqual(beforeManualTables);
    expect(ledgerAt(dbPath).map((row) => row.name)).toEqual([candidate, baseline].sort());
    expect(tablesAt(dbPath)).toContain('shared_people');
    expect(tablesAt(dbPath)).toContain('older_candidate_probe');
  }, 60_000);
});
