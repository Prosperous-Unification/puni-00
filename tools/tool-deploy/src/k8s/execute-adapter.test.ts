import { mkdirSync, rmSync } from 'node:fs';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
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
  for (const [name, start] of [
    ['migrate', (effects: ReturnType<typeof kubectlEffects>) => effects.migrate('tx', 'img')],
    [
      'observeDownMigrations',
      (effects: ReturnType<typeof kubectlEffects>) => effects.observeDownMigrations('tx', 'img'),
    ],
    [
      'rollbackSchema',
      (effects: ReturnType<typeof kubectlEffects>) => effects.rollbackSchema('tx', 'img', 'none'),
    ],
    ['capture', (effects: ReturnType<typeof kubectlEffects>) => effects.capture('tx', 'img')],
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
