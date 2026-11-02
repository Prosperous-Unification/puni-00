import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { fakeCredential } from '../compute/testing/credential';
import { ampleHost, build, hostPoolFixture } from './host-pool.test.fixture';
import {
  declaredContainersOnly,
  type HostJob,
  loadResourceConfiguration,
  ResourceRuntime,
} from './runtime';

/**
 * `dash-host-jobs` slice 3 review F1, outside any namespace on purpose: an enrolled host always
 * runs same-user processes whose descriptors are unreadable (`(sd-pam)` exists exactly when the
 * user manager J8 requires is up), and settlement must tell those apart from a holder inside
 * the job's scope. Every test here sees this host's real `/proc`.
 */
const NON_DUMPABLE_HOLDER = [
  'import ctypes,os,sys,time',
  "held=open(sys.argv[1]+'/held','w')",
  // PR_SET_DUMPABLE (4) to 0: /proc/<pid>/fd becomes unreadable to this same user.
  'assert ctypes.CDLL(None).prctl(4,0,0,0,0)==0',
  "open(sys.argv[2]+'.part','w').write('ready')",
  "os.rename(sys.argv[2]+'.part',sys.argv[2])",
  'time.sleep(120)',
].join('\n');

const scopes = Bun.spawnSync(
  ['systemd-run', '--user', '--scope', '--quiet', '--collect', '--', 'true'],
  { stdout: 'pipe', stderr: 'pipe', timeout: 30000 },
);
const scopeReason =
  scopes.exitCode === 0
    ? ''
    : ` (skipped: systemd-run --user --scope answered exit ${String(scopes.exitCode)}: ${scopes.stderr.toString().trim().split('\n')[0] ?? ''})`;

describe('host-job hold inspection on a real host (review F1)', () => {
  const cleanups: (() => void)[] = [];
  const children: ChildProcess[] = [];
  afterEach(async () => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await once(child, 'exit');
      }
    }
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const clock = { read: () => 1800000000000 };

  /** A pool, one admitted job whose payload ran and exited, its tmp directory prepared. */
  async function finishedJob(): Promise<{ runtime: ResourceRuntime; job: HostJob; base: string }> {
    const fixture = hostPoolFixture({
      cpuCores: 4,
      memoryGib: 8,
      headroom: { cpuCores: 0, memoryGib: 1 },
      gateTrees: 0,
      credential: fakeCredential(),
    });
    cleanups.push(fixture.remove);
    const runtime = ResourceRuntime.initialize(
      loadResourceConfiguration(fixture.config),
      clock,
      ampleHost,
    );
    cleanups.unshift(() => {
      runtime.close();
    });
    const queued = runtime.enqueueHostJob(
      { descriptor: build, label: 'holds', waitSeconds: 0 },
      process.pid,
    );
    if (queued.kind !== 'queued') throw new Error(queued.reason);
    const admitted = runtime.pollHostJob(queued.ticket, () => undefined);
    if (admitted.kind !== 'admitted') throw new Error(`not admitted: ${admitted.kind}`);
    const job = runtime.prepareHostJob(admitted.job.id);
    // The payload waits for its line on stdin, so its identity is persisted while it lives.
    const payload = spawn('/bin/sh', ['-c', 'read gate'], {
      detached: true,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    const exited = once(payload, 'exit');
    if (payload.pid === undefined) throw new Error('payload did not start');
    runtime.recordHostJobLaunch(job.id, payload.pid);
    payload.stdin.end('go\n');
    await exited;
    runtime.recordHostJobExit(job.id, 0);
    return { runtime, job, base: fixture.base };
  }

  /** Start a non-dumpable process holding a file in the job's tmp directory; resolve its pid. */
  async function holder(argv: readonly string[], job: HostJob, base: string): Promise<number> {
    const ready = join(base, 'holder-ready');
    const child = spawn(argv[0] ?? 'python3', [...argv.slice(1), job.locator, ready], {
      detached: true,
      stdio: 'ignore',
    });
    children.push(child);
    for (let attempt = 0; !existsSync(ready); attempt++) {
      if (attempt > 3000 || child.exitCode !== null) throw new Error('holder did not start');
      await Bun.sleep(5);
    }
    expect(readFileSync(ready, 'utf8')).toBe('ready');
    if (child.pid === undefined) throw new Error('holder has no pid');
    return child.pid;
  }

  function settled(runtime: ResourceRuntime, job: HostJob): HostJob {
    let current = runtime.settleHostJob(job.id, declaredContainersOnly);
    for (let attempt = 0; attempt < 20 && current.state !== 'released'; attempt++)
      current = runtime.settleHostJob(job.id, declaredContainersOnly);
    return current;
  }

  test('a non-dumpable process outside the job scope does not hold its tmp directory', async () => {
    const { runtime, job, base } = await finishedJob();
    const pid = await holder(['python3', '-c', NON_DUMPABLE_HOLDER], job, base);
    const current = settled(runtime, job);
    // Proof: see `inspectHolds`; without its scope branch this entry was `blocked` "cannot
    // inspect process PID <pid>" (2026-11-02, Slice 3 review F1).
    expect(current.tmpDisk.state).toBe('released');
    expect(current.tmpDisk.reason).toStartWith(
      'tmp directory removed and holds verified; uninspectable_outside_scope: ',
    );
    expect(current.tmpDisk.reason).toContain(`${String(pid)} (python3)`);
    expect(current.state).toBe('released');
  }, 60000);

  test.skipIf(scopes.exitCode !== 0)(
    `a non-dumpable process inside the job scope still holds its tmp directory${scopeReason}`,
    async () => {
      const { runtime, job, base } = await finishedJob();
      const pid = await holder(
        [
          'systemd-run',
          '--user',
          '--scope',
          '--quiet',
          '--collect',
          '--unit',
          `dash-job-${job.id}`,
          '--',
          'python3',
          '-c',
          NON_DUMPABLE_HOLDER,
        ],
        job,
        base,
      );
      const current = settled(runtime, job);
      // Proof: see `inspectHolds`; without its `outsideScope` test this entry was `released`
      // with the holder alive inside the scope (2026-11-02, Slice 3 review F1).
      expect(current.tmpDisk.state).toBe('blocked');
      expect(current.tmpDisk.reason).toContain(`cannot inspect process PID ${String(pid)}`);
      expect(existsSync(join(job.locator, 'held'))).toBe(true);
    },
    60000,
  );
});
