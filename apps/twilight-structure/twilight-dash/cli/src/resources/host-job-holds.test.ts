import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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

  /**
   * A pool and one admitted job whose payload ran and exited, its tmp directory prepared.
   * `beforeLaunch` runs once the tmp directory exists and before the payload's leader starts:
   * a process it starts predates the job.
   */
  async function finishedJob(
    beforeLaunch: (job: HostJob, base: string) => Promise<void> = () => Promise.resolve(),
  ): Promise<{ runtime: ResourceRuntime; job: HostJob; base: string }> {
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
    await beforeLaunch(job, fixture.base);
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
    return { runtime, job: runtime.inspectHostJob(job.id), base: fixture.base };
  }

  /** Start a non-dumpable process holding a file in the job's tmp directory; resolve its pid. */
  async function holder(argv: readonly string[], job: HostJob, base: string): Promise<number> {
    const ready = join(base, `holder-ready-${randomUUID()}`);
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

  /** Start `python3 -c` non-dumpable inside its own user scope `unit`. */
  const inScope = (unit: string): string[] => [
    'systemd-run',
    '--user',
    '--scope',
    '--quiet',
    '--collect',
    '--unit',
    unit,
    '--',
    'python3',
    '-c',
    NON_DUMPABLE_HOLDER,
  ];

  test('a non-dumpable process outside the job scope does not hold its tmp directory', async () => {
    let pid = 0;
    const { runtime, job } = await finishedJob(async (prepared, base) => {
      pid = await holder(['python3', '-c', NON_DUMPABLE_HOLDER], prepared, base);
    });
    const current = settled(runtime, job);
    // Proof: see `inspectHolds`; without its scope branch this entry was `blocked` "cannot
    // inspect process PID <pid>" (2026-11-02, Slice 3 review F1).
    expect(current.tmpDisk.state).toBe('released');
    expect(current.tmpDisk.reason).toStartWith(
      'tmp directory removed and holds verified; uninspectable_outside_scope: ',
    );
    // The most recently started processes are named first, so the holder is among them.
    expect(current.tmpDisk.reason).toContain(`${String(pid)} (python3)`);
    expect(current.state).toBe('released');
  }, 60000);

  test('a non-dumpable process started after the job, outside its scope, still holds', async () => {
    const { runtime, job, base } = await finishedJob();
    const pid = await holder(['python3', '-c', NON_DUMPABLE_HOLDER], job, base);
    const current = settled(runtime, job);
    // Proof: see `outsideScope`; without its start comparison this entry was `released` with
    // the file still open (2026-11-02, Slice 3 review R1).
    expect(current.tmpDisk.state).toBe('blocked');
    expect(current.tmpDisk.reason).toContain(`cannot inspect process PID ${String(pid)} (python3)`);
    expect(existsSync(join(job.locator, 'held'))).toBe(true);
  }, 60000);

  test.skipIf(scopes.exitCode !== 0)(
    `a non-dumpable process that left for another scope after the job still holds${scopeReason}`,
    async () => {
      const { runtime, job, base } = await finishedJob();
      // The reviewer's probe: a later process in `dash-job-other-<uuid>.scope`, not the job's.
      const pid = await holder(inScope(`dash-job-other-${randomUUID()}`), job, base);
      const current = settled(runtime, job);
      // Proof: see `outsideScope`; without its start comparison this entry was `released`
      // while the holder kept `held` open (2026-11-02, Slice 3 review R1).
      expect(current.tmpDisk.state).toBe('blocked');
      expect(current.tmpDisk.reason).toContain(`cannot inspect process PID ${String(pid)}`);
      expect(existsSync(join(job.locator, 'held'))).toBe(true);
    },
    60000,
  );

  test.skipIf(scopes.exitCode !== 0)(
    `a non-dumpable process inside the job scope still holds its tmp directory${scopeReason}`,
    async () => {
      const { runtime, job, base } = await finishedJob();
      const pid = await holder(inScope(`dash-job-${job.id}`), job, base);
      const current = settled(runtime, job);
      // Proof: see `inspectHolds`; with `outsideScope` always true this entry was `released`
      // with the holder alive inside the scope (2026-11-02, Slice 3 review F1).
      expect(current.tmpDisk.state).toBe('blocked');
      expect(current.tmpDisk.reason).toContain(`cannot inspect process PID ${String(pid)}`);
      expect(current.tmpDisk.reason).toContain(`systemctl --user stop dash-job-${job.id}.scope`);
      expect(existsSync(join(job.locator, 'held'))).toBe(true);
    },
    60000,
  );

  test('the outside-scope note names three and counts the rest', async () => {
    const pids: number[] = [];
    const { runtime, job } = await finishedJob(async (prepared, base) => {
      for (let index = 0; index < 5; index++)
        pids.push(await holder(['python3', '-c', NON_DUMPABLE_HOLDER], prepared, base));
    });
    const current = settled(runtime, job);
    expect(current.tmpDisk.state).toBe('released');
    const note = /uninspectable_outside_scope: (.*?)(?: and (\d+) more)?$/.exec(
      current.tmpDisk.reason,
    );
    expect(note?.[1]?.split(', ').length).toBe(3);
    expect(Number(note?.[2])).toBeGreaterThanOrEqual(2);
  }, 60000);
});
