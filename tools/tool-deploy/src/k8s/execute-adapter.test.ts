import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

import {
  BACKEND_TASK_SCRIPT,
  backendTaskJob,
  type BackendTaskReport,
  captureFromReport,
  jobName,
  parseTaskReport,
  run,
} from './execute';

const BACKEND = resolve(import.meta.dir, '../../../../apps/wbs/be-01');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function task(env: Record<string, string>): BackendTaskReport {
  const child = Bun.spawnSync({
    cmd: ['bun', '-e', BACKEND_TASK_SCRIPT],
    cwd: BACKEND,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return parseTaskReport(child.stdout.toString());
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => 'resolved',
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
  );
}

describe('BACKEND_TASK_SCRIPT against the real be-01 migrations', () => {
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
    task({ DB_PATH: db, PUNI_TASK: 'rollback', PUNI_BASELINE: baseline });
    mkdirSync(join(root, 'snapshots'));
    const captured = captureFromReport(
      task({
        DB_PATH: db,
        PUNI_TASK: 'capture',
        PUNI_RELEASE: 'r1',
        PUNI_SNAPSHOT_DIR: join(root, 'snapshots'),
      }),
    );
    expect(captured.capture.baseline).toBe(baseline);
    expect(captured.capture.pending.map((p) => p.name)).toEqual(names.slice(-2));
    expect(captured.snapshot.path).toBe(join(root, 'snapshots', 'r1.sqlite'));
    expect(captured.snapshot.sha256).toMatch(/^[0-9a-f]{64}$/);

    const restored = task({ DB_PATH: db, PUNI_TASK: 'migrate' });
    expect(restored.applied.map((a) => a.name)).toEqual(names);
  }, 60_000);
});

describe('captureFromReport', () => {
  const report: BackendTaskReport = {
    applied: [{ name: '0001', hash: 'h1' }],
    folders: [
      { name: '0001', hash: 'h1', downSha256: 'd1' },
      { name: '0002', hash: 'h2', downSha256: 'd2' },
    ],
    snapshot: { path: '/data/snapshots/r.sqlite', sha256: 'f'.repeat(64) },
  };

  it('derives the baseline and pending down scripts', () => {
    expect(captureFromReport(report).capture).toEqual({
      baseline: '0001',
      applied: [{ name: '0001', hash: 'h1' }],
      pending: [{ name: '0002', downSha256: 'd2' }],
    });
  });

  it('refuses a capture whose applied migration the candidate edited', () => {
    const edited = { ...report, folders: [{ name: '0001', hash: 'changed', downSha256: 'd1' }] };
    expect(() => captureFromReport(edited)).toThrow('carries a different migration');
  });

  it('refuses a pending migration without a down script', () => {
    const missing = {
      ...report,
      folders: [report.folders[0], { name: '0002', hash: 'h2', downSha256: null }],
    };
    expect(() => captureFromReport(missing)).toThrow('0002 has no down.sql');
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
