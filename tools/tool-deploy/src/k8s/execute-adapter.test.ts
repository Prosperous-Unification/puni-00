import { copyFileSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { scratchSync } from '@tools/test-scratch';
import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';

import {
  BACKEND_TASK_SCRIPT,
  backendTaskJob,
  type BackendTaskReport,
  captureFromReport,
  jobName,
  kubectlEffects,
  parseLease,
  parseTaskReport,
  run,
} from './execute';
import { sealMigrationCapture } from './migration-capture';

const CAPTURE_ID = {
  target: 'k8s:uid-lab:wbs-solver:wbs-data:/data/wbs.sqlite',
  attempt: 'tx',
  candidate: 'img',
};

const BACKEND = resolve(import.meta.dir, '../../../../apps/wbs/be-01');
const FAULT_MIGRATION = '29991231010000_lab_rollback_failure';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function task(env: Record<string, string>, cwd: string = BACKEND): BackendTaskReport {
  const child = Bun.spawnSync({
    cmd: ['bun', '-e', BACKEND_TASK_SCRIPT],
    cwd,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return parseTaskReport(child.stdout.toString());
}

function taskError(env: Record<string, string>, cwd: string): string {
  try {
    task(env, cwd);
    return 'resolved';
  } catch (error: unknown) {
    return stripVTControlCharacters(error instanceof Error ? error.message : String(error));
  }
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => 'resolved',
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
  );
}

describe('BACKEND_TASK_SCRIPT against the real be-01 migrations', () => {
  it('refuses a legacy --to-only candidate before taking a capture snapshot', () => {
    const root = scratchSync('wbs-k3s-legacy-capability-');
    roots.push(root);
    const db = join(root, 'wbs.sqlite');
    const snapshots = join(root, 'snapshots');
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'drizzle'));
    new Database(db).close();
    writeFileSync(join(root, 'src', 'migrate-status-cli.ts'), "console.log('none');\n");
    writeFileSync(
      join(root, 'src', 'migrate-down-cli.ts'),
      "if (!process.argv.includes('--to=none')) throw new Error('legacy --to required');\n",
    );
    expect(
      taskError(
        { DB_PATH: db, PUNI_TASK: 'capture', PUNI_RELEASE: 'tx', PUNI_SNAPSHOT_DIR: snapshots },
        root,
      ),
    ).toMatch(/^error: exact-set migration CLI capability probe failed:/m);
    expect(existsSync(snapshots)).toBe(false);
  });

  for (const kind of ['missing', 'unreadable'] as const) {
    it(`refuses ${kind === 'missing' ? 'a' : 'an'} ${kind} capability executable before database access`, () => {
      const root = scratchSync('wbs-k3s-capability-file-');
      roots.push(root);
      const db = join(root, 'absent.sqlite');
      const snapshots = join(root, 'snapshots');
      mkdirSync(join(root, 'src'));
      if (kind === 'unreadable') {
        const executable = join(root, 'src', 'migrate-capabilities-cli.ts');
        writeFileSync(executable, "console.log('unexpected');");
        chmodSync(executable, 0o000);
      }
      const refusal = taskError(
        { DB_PATH: db, PUNI_TASK: 'capture', PUNI_RELEASE: 'tx', PUNI_SNAPSHOT_DIR: snapshots },
        root,
      );
      expect(refusal).toMatch(/^error: exact-set migration CLI capability probe failed:/m);
      expect(refusal).toContain(kind === 'missing' ? 'Module not found' : 'EACCES reading');
      expect(() => readFileSync(db)).toThrow();
      expect(() => readFileSync(join(snapshots, 'tx.sqlite'))).toThrow();
    });
  }

  for (const [name, source] of [
    ['nonzero exit', "throw new Error('broken capability executable');"],
    ['malformed stdout', "console.log('none');"],
    [
      'extra stdout',
      "console.log('noise'); console.log(JSON.stringify({protocol:'wbs-migration',version:1,capabilities:['capture-v1','restore-v1-sha256']}));",
    ],
    ['null response', "console.log('null');"],
    [
      'non-array capabilities',
      "console.log(JSON.stringify({protocol:'wbs-migration',version:1,capabilities:{capture:true,restore:true}}));",
    ],
    [
      'wrong protocol',
      "console.log(JSON.stringify({protocol:'other',version:1,capabilities:['capture-v1','restore-v1-sha256']}));",
    ],
    [
      'wrong version',
      "console.log(JSON.stringify({protocol:'wbs-migration',version:2,capabilities:['capture-v1','restore-v1-sha256']}));",
    ],
    [
      'unknown field',
      "console.log(JSON.stringify({protocol:'wbs-migration',version:1,capabilities:['capture-v1','restore-v1-sha256'],legacy:true}));",
    ],
    [
      'duplicate capability',
      "console.log(JSON.stringify({protocol:'wbs-migration',version:1,capabilities:['capture-v1','restore-v1-sha256','restore-v1-sha256']}));",
    ],
    [
      'unknown capability',
      "console.log(JSON.stringify({protocol:'wbs-migration',version:1,capabilities:['capture-v1','legacy']}));",
    ],
    [
      'missing capture',
      "console.log(JSON.stringify({protocol:'wbs-migration',version:1,capabilities:['legacy','restore-v1-sha256']}));",
    ],
    [
      'missing restore',
      "console.log(JSON.stringify({protocol:'wbs-migration',version:1,capabilities:['capture-v1']}));",
    ],
  ] as const) {
    it(`refuses ${name} before opening SQLite or creating a snapshot`, () => {
      const root = scratchSync('wbs-k3s-capability-refusal-');
      roots.push(root);
      const db = join(root, 'absent.sqlite');
      const snapshots = join(root, 'snapshots');
      mkdirSync(join(root, 'src'));
      writeFileSync(join(root, 'src', 'migrate-capabilities-cli.ts'), source);
      const reason =
        name === 'nonzero exit'
          ? 'capability probe failed:'
          : ['malformed stdout', 'extra stdout'].includes(name)
            ? 'capability response is malformed'
            : [
                  'null response',
                  'non-array capabilities',
                  'wrong protocol',
                  'wrong version',
                  'unknown field',
                ].includes(name)
              ? 'capability response is unsupported'
              : 'capability response lacks required operations';
      expect(
        taskError(
          { DB_PATH: db, PUNI_TASK: 'capture', PUNI_RELEASE: 'tx', PUNI_SNAPSHOT_DIR: snapshots },
          root,
        ),
      ).toMatch(new RegExp(`^error: exact-set migration CLI ${reason}`, 'm'));
      expect(() => readFileSync(db)).toThrow();
      expect(() => readFileSync(join(snapshots, 'tx.sqlite'))).toThrow();
    });
  }

  it('accepts the two declared capabilities in either order', () => {
    const root = scratchSync('wbs-k3s-capability-order-');
    roots.push(root);
    const db = join(root, 'wbs.sqlite');
    const snapshots = join(root, 'snapshots');
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'drizzle'));
    new Database(db).close();
    writeFileSync(
      join(root, 'src', 'migrate-capabilities-cli.ts'),
      "console.log(JSON.stringify({protocol:'wbs-migration',version:1,capabilities:['restore-v1-sha256','capture-v1']}));",
    );
    expect(
      task(
        { DB_PATH: db, PUNI_TASK: 'capture', PUNI_RELEASE: 'tx', PUNI_SNAPSHOT_DIR: snapshots },
        root,
      ).snapshot?.path,
    ).toBe(join(snapshots, 'tx.sqlite'));
  });

  it('retains schema and ledger after a failing down script, then recovers with the same capture', () => {
    const root = scratchSync('wbs-k3s-down-fault-');
    roots.push(root);
    const db = join(root, 'wbs.sqlite');
    symlinkSync(join(BACKEND, 'src'), join(root, 'src'), 'dir');
    mkdirSync(join(root, 'drizzle'));
    const baseline = '20261005110000_newer_baseline';
    const baselineFolder = join(root, 'drizzle', baseline);
    mkdirSync(baselineFolder);
    writeFileSync(
      join(baselineFolder, 'migration.sql'),
      'CREATE TABLE baseline_table (id INTEGER);',
    );
    writeFileSync(join(baselineFolder, 'down.sql'), 'DROP TABLE baseline_table;');
    new Database(db).close();
    const before = task({ DB_PATH: db, PUNI_TASK: 'migrate' }, root).applied;
    const candidateFolder = join(root, 'drizzle', FAULT_MIGRATION);
    mkdirSync(candidateFolder);
    const fixture = resolve(
      import.meta.dir,
      '../../../../deploy/k8s/wbs/lab/fault-migrations',
      FAULT_MIGRATION,
    );
    copyFileSync(join(fixture, 'migration.sql'), join(candidateFolder, 'migration.sql'));
    copyFileSync(join(fixture, 'down.sql'), join(candidateFolder, 'down.sql'));
    const snapshots = join(root, 'snapshots');
    mkdirSync(snapshots);
    const capture = captureFromReport(
      task(
        { DB_PATH: db, PUNI_TASK: 'capture', PUNI_RELEASE: 'tx', PUNI_SNAPSHOT_DIR: snapshots },
        root,
      ),
      CAPTURE_ID,
    ).capture;
    const migrated = task({ DB_PATH: db, PUNI_TASK: 'migrate' }, root).applied;
    const rollbackEnv = {
      DB_PATH: db,
      PUNI_TASK: 'rollback',
      PUNI_CAPTURE_BYTES: capture.bytes,
      PUNI_CAPTURE_SHA256: capture.sha256,
      PUNI_CAPTURE_TARGET: CAPTURE_ID.target,
      PUNI_CAPTURE_ATTEMPT: CAPTURE_ID.attempt,
      PUNI_CAPTURE_CANDIDATE: CAPTURE_ID.candidate,
    };
    expect(() => task(rollbackEnv, root)).toThrow();
    expect(task({ DB_PATH: db, PUNI_TASK: 'status' }, root).applied).toEqual(migrated);
    const blocked = new Database(db);
    expect(blocked.query('SELECT allowed FROM lab_rollback_control WHERE id = 1').get()).toEqual({
      allowed: 0,
    });
    blocked.run('UPDATE lab_rollback_control SET allowed = 1 WHERE id = 1');
    blocked.close();
    expect(task(rollbackEnv, root).applied).toEqual(before);
    const restored = new Database(db, { readonly: true });
    expect(
      restored.query("SELECT name FROM sqlite_master WHERE name = 'lab_rollback_control'").all(),
    ).toEqual([]);
    restored.close();
  }, 60_000);

  it('reverses an older candidate migration after a newer baseline using the generated script', () => {
    const root = scratchSync('wbs-k3s-older-');
    roots.push(root);
    const db = join(root, 'wbs.sqlite');
    symlinkSync(join(BACKEND, 'src'), join(root, 'src'), 'dir');
    mkdirSync(join(root, 'drizzle'));
    const baseline = '20261005110000_newer_baseline';
    const candidate = '20261001020000_older_candidate';
    const addFolder = (name: string, table: string): void => {
      const folder = join(root, 'drizzle', name);
      mkdirSync(folder);
      writeFileSync(
        join(folder, 'migration.sql'),
        `CREATE TABLE ${table} (id INTEGER PRIMARY KEY);`,
      );
      writeFileSync(join(folder, 'down.sql'), `DROP TABLE ${table};`);
    };
    addFolder(baseline, 'baseline_table');
    Bun.spawnSync({ cmd: ['bun', '-e', `new (require('bun:sqlite').Database)('${db}').close()`] });
    expect(
      task({ DB_PATH: db, PUNI_TASK: 'migrate' }, root).applied.map((row) => row.name),
    ).toEqual([baseline]);
    const baselineDb = new Database(db);
    baselineDb.run('INSERT INTO baseline_table(id) VALUES (7)');
    baselineDb.close();
    addFolder(candidate, 'candidate_table');
    const snapshots = join(root, 'snapshots');
    mkdirSync(snapshots);
    const captured = captureFromReport(
      task(
        { DB_PATH: db, PUNI_TASK: 'capture', PUNI_RELEASE: 'tx', PUNI_SNAPSHOT_DIR: snapshots },
        root,
      ),
      CAPTURE_ID,
    );
    expect(captured.capture.pending.map((row) => row.name)).toEqual([candidate]);
    expect(
      task({ DB_PATH: db, PUNI_TASK: 'migrate' }, root).applied.map((row) => row.name),
    ).toEqual([candidate, baseline]);
    const restored = task(
      {
        DB_PATH: db,
        PUNI_TASK: 'rollback',
        PUNI_CAPTURE_BYTES: captured.capture.bytes,
        PUNI_CAPTURE_SHA256: captured.capture.sha256,
        PUNI_CAPTURE_TARGET: CAPTURE_ID.target,
        PUNI_CAPTURE_ATTEMPT: CAPTURE_ID.attempt,
        PUNI_CAPTURE_CANDIDATE: CAPTURE_ID.candidate,
      },
      root,
    );
    expect(restored.applied.map(({ name, hash }) => ({ name, hash }))).toEqual([
      ...captured.capture.applied,
    ]);
    const restoredDb = new Database(db, { readonly: true });
    expect(restoredDb.query('SELECT id FROM baseline_table').all()).toEqual([{ id: 7 }]);
    expect(
      restoredDb.query("SELECT name FROM sqlite_master WHERE name = 'candidate_table'").all(),
    ).toEqual([]);
    restoredDb.close();
    task({ DB_PATH: db, PUNI_TASK: 'migrate' }, root);
    const effects = kubectlEffects({
      kubectl: 'kubectl',
      kubeconfig: null,
      context: 'lab',
      namespaces: { app: 'wbs', backend: 'wbs-solver' },
      stateDir: root,
      overlay: root,
      anonymousProjectsStatus: 200,
      rolloutTimeoutSeconds: 5,
      jobTimeoutSeconds: 5,
      drainTimeoutMs: 1000,
      leaseDurationSeconds: 20,
      log: () => undefined,
    });
    const printed = effects.manualSchemaCommand('tx', 'img', CAPTURE_ID, captured.capture);
    expect(printed).toContain("'create' '-f'");
    const manifestPath = join(root, `${jobName('manual-rollback', 'tx')}.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      spec: {
        template: {
          spec: { containers: { image: string; env: { name: string; value: string }[] }[] };
        };
      };
    };
    const container = manifest.spec.template.spec.containers[0];
    expect(container.image).toBe('img');
    const manualEnv = Object.fromEntries(container.env.map(({ name, value }) => [name, value]));
    expect(manualEnv['PUNI_CAPTURE_SHA256']).toBe(captured.capture.sha256);
    expect(manualEnv['PUNI_CAPTURE_BYTES']).toBe(captured.capture.bytes);
    expect(
      task({ ...manualEnv, DB_PATH: db }, root).applied.map(({ name, hash }) => ({ name, hash })),
    ).toEqual([...captured.capture.applied]);
    const beforeTamper = task({ DB_PATH: db, PUNI_TASK: 'migrate' }, root);
    expect(() =>
      task(
        {
          ...manualEnv,
          DB_PATH: db,
          PUNI_CAPTURE_BYTES: captured.capture.bytes.replace('"pending"', '"tampered"'),
        },
        root,
      ),
    ).toThrow('migration capture SHA-256 differs from the recorded deploy attempt');
    expect(task({ DB_PATH: db, PUNI_TASK: 'status' }, root).applied).toEqual(beforeTamper.applied);
  }, 60_000);

  it('migrates, captures a verified snapshot and rolls back to the captured baseline', () => {
    const root = scratchSync('wbs-k3s-task-');
    roots.push(root);
    const db = join(root, 'wbs.sqlite');
    // The script refuses a missing database rather than creating an empty one.
    expect(() => task({ DB_PATH: db, PUNI_TASK: 'status' })).toThrow('does not exist');
    Bun.spawnSync({ cmd: ['bun', '-e', `new (require('bun:sqlite').Database)('${db}').close()`] });

    const migrated = task({ DB_PATH: db, PUNI_TASK: 'migrate' });
    const names = migrated.folders.map((f) => f.name);
    expect(migrated.applied.map((a) => a.name)).toEqual(names);

    const baseline = names[names.length - 3];
    const legacy = Bun.spawnSync({
      cmd: ['bun', 'run', 'src/migrate-down-cli.ts', `--to=${baseline}`],
      cwd: BACKEND,
      env: { ...process.env, DB_PATH: db },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(legacy.exitCode).toBe(0);
    mkdirSync(join(root, 'snapshots'));
    const captured = captureFromReport(
      task({
        DB_PATH: db,
        PUNI_TASK: 'capture',
        PUNI_RELEASE: 'r1',
        PUNI_SNAPSHOT_DIR: join(root, 'snapshots'),
      }),
      CAPTURE_ID,
    );
    expect(captured.capture.baseline).toBe(baseline);
    expect(captured.capture.pending.map((p) => p.name)).toEqual(names.slice(-2));
    expect(captured.snapshot.path).toBe(join(root, 'snapshots', 'r1.sqlite'));
    expect(captured.snapshot.sha256).toMatch(/^[0-9a-f]{64}$/);

    const restored = task({ DB_PATH: db, PUNI_TASK: 'migrate' });
    expect(restored.applied.map((a) => a.name)).toEqual(names);
    const rollbackEnv = {
      DB_PATH: db,
      PUNI_TASK: 'rollback',
      PUNI_CAPTURE_BYTES: captured.capture.bytes,
      PUNI_CAPTURE_SHA256: captured.capture.sha256,
      PUNI_CAPTURE_TARGET: CAPTURE_ID.target,
      PUNI_CAPTURE_ATTEMPT: CAPTURE_ID.attempt,
      PUNI_CAPTURE_CANDIDATE: CAPTURE_ID.candidate,
    };
    const missingCapture = Bun.spawnSync({
      cmd: ['bun', '-e', BACKEND_TASK_SCRIPT],
      cwd: BACKEND,
      env: { ...process.env, DB_PATH: db, PUNI_TASK: 'rollback' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(missingCapture.exitCode).toBe(1);
    expect(stripVTControlCharacters(missingCapture.stderr.toString()).split('\n')).toContain(
      'error: exact-set rollback requires captured bytes, digest and caller identity',
    );
    expect(() =>
      task({
        ...rollbackEnv,
        PUNI_CAPTURE_BYTES: captured.capture.bytes.replace('"pending"', '"tampered"'),
      }),
    ).toThrow('migration capture SHA-256 differs from the recorded deploy attempt');
    expect(task({ DB_PATH: db, PUNI_TASK: 'status' }).applied).toEqual(restored.applied);
    expect(task(rollbackEnv).applied.map(({ name, hash }) => ({ name, hash }))).toEqual([
      ...captured.capture.applied,
    ]);
  }, 60_000);
});

describe('captureFromReport', () => {
  const report: BackendTaskReport = {
    applied: [{ name: '0001', hash: 'a'.repeat(64) }],
    folders: [
      { name: '0001', hash: 'a'.repeat(64), downSha256: 'c'.repeat(64) },
      { name: '0002', hash: 'b'.repeat(64), downSha256: 'd'.repeat(64) },
    ],
    snapshot: { path: '/data/snapshots/r.sqlite', sha256: 'f'.repeat(64) },
  };

  it('derives the baseline and pending down scripts', () => {
    expect(captureFromReport(report, CAPTURE_ID).capture).toEqual(
      sealMigrationCapture(
        CAPTURE_ID,
        [{ name: '0001', hash: 'a'.repeat(64) }],
        [{ name: '0002', hash: 'b'.repeat(64), downHash: 'd'.repeat(64) }],
      ),
    );
  });

  it('refuses a capture whose applied migration the candidate edited', () => {
    const edited = {
      ...report,
      folders: [{ name: '0001', hash: 'changed', downSha256: 'c'.repeat(64) }],
    };
    expect(() => captureFromReport(edited, CAPTURE_ID)).toThrow('carries a different migration');
  });

  it('refuses a pending migration without a down script', () => {
    const missing = {
      ...report,
      folders: [report.folders[0], { name: '0002', hash: 'b'.repeat(64), downSha256: null }],
    };
    expect(() => captureFromReport(missing, CAPTURE_ID)).toThrow('0002 has no down.sql');
  });
});

describe('parseTaskReport', () => {
  it('requires exactly one marked result line', () => {
    expect(() => parseTaskReport('migrations applied\n')).toThrow('0 result lines');
    const line = `PUNI_RESULT ${JSON.stringify({ applied: [], folders: [], snapshot: null })}`;
    expect(() => parseTaskReport(`${line}\n${line}\n`)).toThrow('2 result lines');
    expect(parseTaskReport(`noise\n${line}\n`).applied).toEqual([]);
  });
});

describe('backendTaskJob', () => {
  it('can never run a second pod beside the first and satisfies trusted admission', () => {
    const job = backendTaskJob(
      { namespaces: { app: 'wbs', backend: 'wbs-solver' } },
      'wbs-migrate-x',
      'img@sha256:1',
      {},
    );
    const spec = job['spec'] as Record<string, unknown>;
    expect(spec['backoffLimit']).toBe(0);
    expect(spec['podReplacementPolicy']).toBe('Failed');
    const pod = (spec['template'] as { spec: Record<string, unknown> }).spec;
    expect(pod['serviceAccountName']).toBe('wbs-backend');
    expect(pod['automountServiceAccountToken']).toBe(false);
    expect(pod['nodeSelector']).toEqual({ 'puni.dev/capability-product': 'true' });
  });

  it('keeps object names within the Kubernetes limit', () => {
    expect(
      jobName('manual-rollback', 'b'.repeat(12) + '-' + 'c'.repeat(12)).length,
    ).toBeLessThanOrEqual(63);
  });
});

describe('run', () => {
  it('kills a subprocess past its deadline', async () => {
    const started = Date.now();
    expect(await rejection(run(['sleep', '5'], null, 200))).toContain(
      'exceeded 200ms and was killed',
    );
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

/** A kubectl stand-in: Jobs are absent, one backend pod runs, and every create is logged. */
function fakeKubectl(root: string): { path: string; log: string } {
  const path = join(root, 'kubectl');
  const log = join(root, 'calls.log');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `echo "$*" >> ${log}`,
      'case "$*" in',
      '  *" get job "*) echo "Error from server (NotFound): jobs not found" >&2; exit 1 ;;',
      '  *" get pods "*) echo "pod/wbs-backend-5c9f-abcde" ;;',
      '  *) exit 0 ;;',
      'esac',
      '',
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  writeFileSync(log, '');
  return { path, log };
}

describe('schema Jobs through the kubectl adapter', () => {
  it('prints an executable manual recovery command with the pinned kubeconfig and intact arguments', () => {
    const root = scratchSync('wbs-k3s-manual-');
    roots.push(root);
    const spaced = join(root, "manual state's files");
    mkdirSync(spaced);
    const kubectl = join(spaced, 'kubectl fake');
    const argumentLog = join(root, 'arguments.log');
    writeFileSync(kubectl, '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$ARG_LOG"\n');
    chmodSync(kubectl, 0o755);
    const kubeconfig = join(spaced, 'credentials with spaces');
    const effects = kubectlEffects({
      kubectl,
      kubeconfig,
      context: 'same named context',
      namespaces: { app: 'wbs', backend: 'wbs-solver' },
      stateDir: spaced,
      overlay: root,
      anonymousProjectsStatus: 200,
      rolloutTimeoutSeconds: 5,
      jobTimeoutSeconds: 5,
      drainTimeoutMs: 1000,
      leaseDurationSeconds: 20,
      log: () => undefined,
    });
    const command = effects.manualSchemaCommand(
      'tx',
      'img',
      CAPTURE_ID,
      sealMigrationCapture(CAPTURE_ID, [], []),
    );
    const invocation = Bun.spawnSync({
      cmd: ['bash', '-c', command],
      env: { ...process.env, ARG_LOG: argumentLog },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(invocation.exitCode).toBe(0);
    expect(readFileSync(argumentLog, 'utf8').trimEnd().split('\n')).toEqual([
      '--kubeconfig',
      kubeconfig,
      '--context',
      'same named context',
      'create',
      '-f',
      join(spaced, 'wbs-manual-rollback-tx.json'),
    ]);
  });

  it('refuses a foreign capture before rendering manual recovery or contacting the cluster', async () => {
    const root = scratchSync('wbs-k3s-kubectl-');
    roots.push(root);
    const kubectl = fakeKubectl(root);
    const effects = kubectlEffects({
      kubectl: kubectl.path,
      kubeconfig: null,
      context: 'lab',
      namespaces: { app: 'wbs', backend: 'wbs-solver' },
      stateDir: root,
      overlay: root,
      anonymousProjectsStatus: 200,
      rolloutTimeoutSeconds: 5,
      jobTimeoutSeconds: 5,
      drainTimeoutMs: 1000,
      leaseDurationSeconds: 20,
      log: () => undefined,
    });
    const capture = sealMigrationCapture(CAPTURE_ID, [], []);
    const foreign = sealMigrationCapture({ ...CAPTURE_ID, target: 'another-target' }, [], []);
    expect(() => effects.manualSchemaCommand('tx', 'img', CAPTURE_ID, foreign)).toThrow(
      'belongs to another target, attempt or candidate',
    );
    expect(await rejection(effects.rollbackSchema('tx', 'img', CAPTURE_ID, foreign))).toContain(
      'belongs to another target, attempt or candidate',
    );
    expect(readFileSync(kubectl.log, 'utf8')).toBe('');
    expect(() => effects.manualSchemaCommand('tx', 'another-image', CAPTURE_ID, capture)).toThrow(
      'schema Job caller differs',
    );
    expect(
      await rejection(effects.rollbackSchema('another-attempt', 'img', CAPTURE_ID, capture)),
    ).toContain('schema Job caller differs');
  });

  for (const [name, start] of [
    ['migrate', (effects: ReturnType<typeof kubectlEffects>) => effects.migrate('tx', 'img')],
    [
      'observeDownMigrations',
      (effects: ReturnType<typeof kubectlEffects>) => effects.observeDownMigrations('tx', 'img'),
    ],
    [
      'rollbackSchema',
      (effects: ReturnType<typeof kubectlEffects>) =>
        effects.rollbackSchema('tx', 'img', CAPTURE_ID, sealMigrationCapture(CAPTURE_ID, [], [])),
    ],
    ['capture', (effects: ReturnType<typeof kubectlEffects>) => effects.capture(CAPTURE_ID, 'img')],
  ] as const) {
    it(`refuses every schema Job while a writer runs: ${name}`, async () => {
      const root = scratchSync('wbs-k3s-kubectl-');
      roots.push(root);
      const kubectl = fakeKubectl(root);
      const effects = kubectlEffects({
        kubectl: kubectl.path,
        kubeconfig: null,
        context: 'lab',
        namespaces: { app: 'wbs', backend: 'wbs-solver' },
        stateDir: root,
        overlay: root,
        anonymousProjectsStatus: 200,
        rolloutTimeoutSeconds: 5,
        jobTimeoutSeconds: 5,
        drainTimeoutMs: 1000,
        leaseDurationSeconds: 20,
        log: () => undefined,
      });
      expect(await rejection(start(effects))).toContain(
        'writer pods exist (pod/wbs-backend-5c9f-abcde)',
      );
      expect(readFileSync(kubectl.log, 'utf8')).not.toContain(' create ');
    });
  }
});

describe('parseLease', () => {
  it('reads holder, renewal, duration, park state and journal', () => {
    const lease = parseLease(
      JSON.stringify({
        metadata: {
          resourceVersion: '42',
          annotations: { 'puni.dev/journal': '/j.json', 'puni.dev/parked': 'rollback-failed' },
        },
        spec: {
          holderIdentity: 'tx#run',
          renewTime: '2026-09-18T05:00:00.000000Z',
          leaseDurationSeconds: 20,
        },
      }),
    );
    expect(lease).toEqual({
      holder: 'tx#run',
      renewedAtMs: Date.parse('2026-09-18T05:00:00.000Z'),
      durationSeconds: 20,
      parked: 'rollback-failed',
      journal: '/j.json',
      version: '42',
    });
  });

  it('refuses a Lease without a renewal time', () => {
    expect(() =>
      parseLease(
        JSON.stringify({ metadata: { resourceVersion: '1' }, spec: { holderIdentity: 'x' } }),
      ),
    ).toThrow('lacks holderIdentity, renewTime');
  });
});

describe('backend rollouts through the kubectl adapter', () => {
  it('moves the backup CronJob with every backend rollout', async () => {
    const root = scratchSync('wbs-k3s-kubectl-');
    roots.push(root);
    const kubectl = fakeKubectl(root);
    const effects = kubectlEffects({
      kubectl: kubectl.path,
      kubeconfig: null,
      context: 'lab',
      namespaces: { app: 'wbs', backend: 'wbs-solver' },
      stateDir: root,
      overlay: root,
      anonymousProjectsStatus: 200,
      rolloutTimeoutSeconds: 5,
      jobTimeoutSeconds: 5,
      drainTimeoutMs: 1000,
      leaseDurationSeconds: 20,
      log: () => undefined,
    });
    const image = (tier: string) => `registry.example/${tier}@sha256:${'1'.repeat(64)}`;
    await effects.rolloutTiers({
      sourceSha: 'a'.repeat(40),
      images: {
        backend: image('be'),
        gateway: image('gw'),
        frontend: image('fe'),
        mcp: image('mcp'),
      },
    });
    const calls = readFileSync(kubectl.log, 'utf8').split('\n');
    const cron = calls.findIndex((line) => line.includes('patch cronjob sqlite-backup'));
    expect(cron).toBeGreaterThanOrEqual(0);
    expect(calls[cron]).toContain(`"name":"backup","image":"${image('be')}"`);
    expect(cron).toBeLessThan(
      calls.findIndex((line) => line.includes('patch deployment wbs-backend')),
    );
    const verify = calls.findIndex((line) => line.includes('patch cronjob sqlite-backup-verify'));
    expect(calls[verify]).toContain(`"name":"verify","image":"${image('be')}"`);
    expect(verify).toBeLessThan(
      calls.findIndex((line) => line.includes('patch deployment wbs-backend')),
    );
  });
});
