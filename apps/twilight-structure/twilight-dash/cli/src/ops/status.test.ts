import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';

import { afterEach, describe, expect, test } from 'bun:test';

import { monotonicClock } from '../clock';
import { fakeCredential } from '../compute/testing/credential';
import { ampleHost, gate, hostPoolFixture, jobType } from '../resources/host-pool.test.fixture';
import { loadResourceConfiguration, ResourceRuntime } from '../resources/runtime';
import { type OpsDependencies, opsHandlers, runOps } from './commands';
import { insideOpsNamespace } from './ops.test.fixture';
import { HostJobRunRecords } from './run-records';
import { linuxScopeTelemetry } from './scope';
import { formatSpan } from './status';

/**
 * `dash-host-jobs` task 3.3: `ops job status` names what the host is doing, line for line. In
 * the namespace because `resources init` refuses a unit an unrelated process could hold.
 */
if (insideOpsNamespace(import.meta.path))
  describe('ops job status (task 3.3, J13)', () => {
    const cleanups: (() => void)[] = [];
    const payloads: ChildProcess[] = [];
    afterEach(async () => {
      for (const payload of payloads.splice(0)) {
        if (payload.exitCode === null && payload.signalCode === null) {
          payload.kill('SIGKILL');
          await once(payload, 'exit');
        }
      }
      for (const cleanup of cleanups.splice(0)) cleanup();
    });
    const start = 1800000000000;
    let now = start;
    const clock = { read: () => now };

    function pool(gateTrees: number) {
      now = start;
      const fixture = hostPoolFixture({
        cpuCores: 8,
        memoryGib: 15,
        headroom: { cpuCores: 0, memoryGib: 2 },
        gateTrees,
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
      return { ...fixture, runtime };
    }

    function dependencies(stdout: string[]): OpsDependencies {
      return {
        clock,
        monotonic: monotonicClock(),
        environment: process.env,
        cwd: process.cwd(),
        stdout: (text) => stdout.push(text),
        stderr: () => {
          throw new Error('status writes nothing on stderr');
        },
        telemetry: linuxScopeTelemetry(),
        host: ampleHost,
        user: 'puni1',
      };
    }

    function status(config: string): string[] {
      const stdout: string[] = [];
      expect(
        opsHandlers['job status'](
          { command: 'ops', words: 'job status', config },
          dependencies(stdout),
        ),
      ).toBe(0);
      return stdout.join('').split('\n').slice(0, -1);
    }

    test('one running, one waiting: the gate with its tree and peak, then the build', () => {
      const { runtime, config, root, trees } = pool(1);
      const queued = runtime.enqueueHostJob(
        { descriptor: gate, label: 'gate:0a518a42', waitSeconds: 0 },
        process.pid,
      );
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      const admitted = runtime.pollHostJob(queued.ticket, () => undefined);
      if (admitted.kind !== 'admitted') throw new Error(`gate not admitted: ${admitted.kind}`);
      runtime.prepareHostJob(admitted.job.id);
      const payload = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
      payloads.push(payload);
      if (payload.pid === undefined) throw new Error('payload did not start');
      now = start + 5000;
      runtime.recordHostJobLaunch(admitted.job.id, payload.pid);
      const records = HostJobRunRecords.open(root, false);
      records.begin(
        {
          jobId: admitted.job.id,
          type: 'gate',
          label: 'gate:0a518a42',
          descriptor: gate,
          descriptorDigest: 'a'.repeat(64),
          cataloguePath: '/checkout/infra/jobs/catalogue.json',
          launcherSha: 'b'.repeat(40),
          argumentProfile: '<sha>',
          argv: ['bin/h2puni-gate.sh', 'b'.repeat(40)],
          hostClass: 'linux-x64-8c-15g',
          unit: `dash-job-${admitted.job.id}`,
          cgroup: `/app.slice/dash-job-${admitted.job.id}.scope`,
          tmpDirectory: admitted.job.locator,
          units: [{ exclusiveId: 'gate_tree', path: trees[0] ?? '' }],
          startedAt: now,
        },
        {
          kind: 'gate',
          observedAt: now,
          counters: {
            memoryPeak: 2.5 * 1024 ** 3,
            memoryCurrent: 1024 ** 3,
            cpuUsageUsec: 1,
            cpuUserUsec: 1,
            cpuSystemUsec: 0,
            pidsCurrent: 3,
            memoryHighEvents: 0,
          },
          tmpBytes: 0,
          containers: null,
          failure: null,
        },
      );
      records.close();
      now = start + 10000;
      const build = jobType('website-dev-build', 6, 8);
      const waiting = runtime.enqueueHostJob(
        { descriptor: build, label: 'build:site', waitSeconds: 120 },
        process.pid,
      );
      if (waiting.kind !== 'queued') throw new Error(waiting.reason);
      expect(runtime.pollHostJob(waiting.ticket, () => undefined).kind).toBe('waiting');
      now = start + 65000;
      expect(status(config)).toEqual([
        'host pool enrollment-one: mode observe; allocatable 8 cores, 13 GiB, 16 disk units, 16 slots; reserved 4 cores, 6 GiB, 0 disk units, 1 slots',
        `running gate gate:0a518a42 pid ${String(payload.pid)} age 1m00s envelope 4 cores 6 GiB 0 GiB tmp peak 2.5 GiB units gate_tree=${trees[0] ?? ''} settlement held (compute held, tmp held, gate_tree held)`,
        `waiting website-dev-build build:site pid ${String(process.pid)} age 55s budget 1m05s overtakes 0`,
      ]);
    });

    test('an idle pool says so', () => {
      const { config, root } = pool(0);
      HostJobRunRecords.open(root, false).close();
      expect(status(config)).toEqual([
        'host pool enrollment-one: mode observe; allocatable 8 cores, 13 GiB, 16 disk units, 16 slots; reserved 0 cores, 0 GiB, 0 disk units, 0 slots',
        'running none',
        'waiting none',
      ]);
    });

    test('status refuses 70 when the run records are missing, creating nothing', async () => {
      const { config, root } = pool(0);
      const stderr: string[] = [];
      const code = await runOps(
        { command: 'ops', words: 'job status', config },
        { ...dependencies([]), stderr: (text) => stderr.push(text) },
      );
      expect(code).toBe(70);
      expect(stderr).toEqual([
        `error: ops job status: host job run records ${root}/.dash/host-job-runs.sqlite are missing; \`ops pool init\` creates them\n`,
      ]);
      expect(existsSync(HostJobRunRecords.pathOf(root))).toBe(false);
    });

    test('a job whose payload never ran says so', () => {
      const { runtime, config, root } = pool(0);
      HostJobRunRecords.open(root, false).close();
      const queued = runtime.enqueueHostJob(
        { descriptor: jobType('test-queued', 1, 1), label: 'lane:refused', waitSeconds: 0 },
        process.pid,
      );
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      const admitted = runtime.pollHostJob(queued.ticket, () => undefined);
      if (admitted.kind !== 'admitted') throw new Error(`not admitted: ${admitted.kind}`);
      runtime.prepareHostJob(admitted.job.id);
      const leader = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
      payloads.push(leader);
      if (leader.pid === undefined) throw new Error('leader did not start');
      runtime.recordHostJobLaunch(admitted.job.id, leader.pid);
      runtime.recordHostJobLaunchFailure(
        admitted.job.id,
        'payload did not run: systemd-run did not start scope dash-job-x',
      );
      expect(() => {
        runtime.recordHostJobLaunchFailure(admitted.job.id, 'payload did not run: twice');
      }).toThrow('host job has no unopened launch to record');
      expect(() => runtime.recordHostJobExit(admitted.job.id, 1)).toThrow(
        'host job has no running payload to record',
      );
      expect(runtime.inspectHostJob(admitted.job.id).exitCode).toBeNull();
      expect(status(config)[1]).toEndWith(
        '; payload did not run: systemd-run did not start scope dash-job-x',
      );
    });

    test('spans read as hours and minutes, minutes and seconds, or seconds', () => {
      expect([0, 999, 45000, 185000, 3720000, -5000].map(formatSpan)).toEqual([
        '0s',
        '0s',
        '45s',
        '3m05s',
        '1h02m',
        '0s',
      ]);
    });
  });
