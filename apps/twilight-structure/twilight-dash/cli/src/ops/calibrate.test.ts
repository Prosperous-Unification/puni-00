import { type ChildProcess, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, describe, expect, test } from 'bun:test';

import { monotonicClock, wallClock } from '../clock';
import { fakeCredential } from '../compute/testing/credential';
import {
  ampleHost,
  build,
  gate,
  hostPoolFixture,
  jobType,
} from '../resources/host-pool.test.fixture';
import {
  type HostJob,
  type HostJobRequest,
  loadResourceConfiguration,
  ResourceRuntime,
} from '../resources/runtime';
import { type OpsCommand, type OpsDependencies, opsHandlers, runOps } from './commands';
import { calibrateHostJob, type JobRunDependencies, runHostJob } from './job-run';
import {
  catalogueCheckout,
  fakeScopeTelemetry,
  fakeSystemdRun,
  type FixtureJobType,
  insideOpsNamespace,
  payloadScript,
  probeUserScopes,
} from './ops.test.fixture';
import { OpsRefusal } from './refusal';
import { HostJobRunRecords } from './run-records';
import { linuxScopeTelemetry, scopeArguments, type ScopeTelemetry } from './scope';

/**
 * `dash-host-jobs` task 4.1 against a real ledger: a calibration waits for the pool to drain,
 * holds all of it and runs unbounded; then `ops job calibrate`, `propose` and `audit` end to
 * end over the fake scope seam, and the unbounded scope on a real user manager.
 */
if (insideOpsNamespace(import.meta.path)) {
  const scopes = probeUserScopes();
  const scopeSkip = scopes.available ? '' : ` (skipped: ${scopes.reason})`;
  if (!scopes.available)
    process.stderr.write(`ops job calibrate real-scope test skipped: ${scopes.reason}\n`);
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
  const scratch = mkdtempSync(join(tmpdir(), 'dash-calibrate-'));
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });
  const silent = (): void => undefined;
  const clock = wallClock();
  const monotonic = monotonicClock();

  /** A pool of 8 cores and 15 GiB (headroom 2 GiB) with two gate trees. */
  function pool() {
    const fixture = hostPoolFixture({
      cpuCores: 8,
      memoryGib: 15,
      headroom: { cpuCores: 0, memoryGib: 2 },
      gateTrees: 2,
      credential: fakeCredential(),
    });
    cleanups.push(fixture.remove);
    return fixture;
  }

  describe('calibration admission (task 4.1, J9)', () => {
    function runtimeOf(config: string): ResourceRuntime {
      const runtime = ResourceRuntime.initialize(
        loadResourceConfiguration(config),
        clock,
        ampleHost,
      );
      cleanups.unshift(() => {
        runtime.close();
      });
      return runtime;
    }
    function queue(runtime: ResourceRuntime, request: HostJobRequest): string {
      const queued = runtime.enqueueHostJob(request, process.pid);
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      return queued.ticket;
    }
    function admitted(runtime: ResourceRuntime, ticket: string): HostJob {
      const outcome = runtime.pollHostJob(ticket, silent);
      if (outcome.kind !== 'admitted') throw new Error(`expected admission, got ${outcome.kind}`);
      return outcome.job;
    }
    function launch(runtime: ResourceRuntime, job: HostJob) {
      runtime.prepareHostJob(job.id);
      const payload = spawn('/bin/sh', ['-c', 'read gate'], {
        detached: true,
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      payloads.push(payload);
      const exited = once(payload, 'exit');
      if (payload.pid === undefined) throw new Error('payload did not start');
      runtime.recordHostJobLaunch(job.id, payload.pid);
      return {
        release: async () => {
          payload.stdin.end('go\n');
          await exited;
        },
      };
    }

    test('a calibration waits for the pool to drain', async () => {
      const { config, trees } = pool();
      const runtime = runtimeOf(config);
      const running = admitted(
        runtime,
        queue(runtime, { descriptor: gate, label: 'gate:1', waitSeconds: 0 }),
      );
      const payload = launch(runtime, running);
      const calibration = queue(runtime, {
        descriptor: build,
        label: 'calibration',
        waitSeconds: 600,
        calibration: true,
      });
      // The build's envelope fits beside the gate; a calibration still waits.
      expect(runtime.pollHostJob(calibration, silent).kind).toBe('waiting');
      await payload.release();
      runtime.sweep();
      expect(runtime.inspectHostJob(running.id).state).toBe('released');
      const job = admitted(runtime, calibration);
      expect(job.calibration).toBe(true);
      expect(job.units.map((unit) => [unit.exclusiveId, unit.path])).toEqual(
        trees.map((tree) => ['gate_tree', tree]),
      );
    });

    test('a calibration holds the whole allocatable vector', () => {
      const { config } = pool();
      const runtime = runtimeOf(config);
      admitted(
        runtime,
        queue(runtime, {
          descriptor: build,
          label: 'calibration',
          waitSeconds: 0,
          calibration: true,
        }),
      );
      const status = runtime.hostPoolStatus();
      expect(status.reserved).toEqual(status.allocatable);
      expect(status.units.every((unit) => unit.heldBy !== null)).toBe(true);
      const small = queue(runtime, {
        descriptor: jobType('test-queued', 1, 1),
        label: 'test:1',
        waitSeconds: 600,
      });
      expect(runtime.pollHostJob(small, silent).kind).toBe('waiting');
    });

    test('a calibration measures an envelope larger than the pool; a run of it is refused 73', () => {
      const { config } = pool();
      const runtime = runtimeOf(config);
      const huge = jobType('huge', 1, 99);
      expect(
        runtime.enqueueHostJob({ descriptor: huge, label: 'run', waitSeconds: 0 }, process.pid),
      ).toEqual({
        kind: 'refused',
        exitCode: 73,
        reason: 'host job huge refused: memoryGib 99 exceeds allocatable 13',
      });
      expect(
        admitted(
          runtime,
          queue(runtime, {
            descriptor: huge,
            label: 'calibration',
            waitSeconds: 0,
            calibration: true,
          }),
        ).calibration,
      ).toBe(true);
    });

    test('a calibration scope sets no memory bound; a run sets MemoryHigh, and MemoryMax for cap', () => {
      const capped = { ...gate, enforcement: 'cap' as const };
      expect(scopeArguments('u', capped, false).slice(-4)).toEqual([
        '-p',
        'MemoryHigh=6G',
        '-p',
        'MemoryMax=6G',
      ]);
      expect(scopeArguments('u', capped, true).filter((word) => word.startsWith('Memory'))).toEqual(
        [],
      );
    });
  });

  describe('ops job calibrate, propose and audit end to end (tasks 4.1, 4.2)', () => {
    const types: FixtureJobType[] = [
      { id: 'gate', cpuCores: 2, memoryGib: 1, tmpDiskGib: 1, exclusive: ['gate_tree'] },
    ];
    const fakePath = `${fakeSystemdRun(join(scratch, `bin-${randomUUID()}`), 'exec')}:${process.env['PATH'] ?? ''}`;

    function dependencies(
      cwd: string,
      stdout: string[],
      stderr: string[],
      telemetry: ScopeTelemetry,
      PATH = fakePath,
    ): OpsDependencies {
      return {
        clock,
        monotonic,
        environment: { ...process.env, PATH },
        cwd,
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
        telemetry,
        host: ampleHost,
        user: 'puni1',
      };
    }

    function initialized() {
      const fixture = pool();
      const checkout = catalogueCheckout(join(fixture.base, 'checkout'), types);
      const out: string[] = [];
      expect(
        opsHandlers['pool init'](
          { command: 'ops', words: 'pool init', config: fixture.config },
          dependencies(checkout, out, out, linuxScopeTelemetry()),
        ),
      ).toBe(0);
      return { ...fixture, checkout };
    }

    const calibrate = (config: string, argv: string[]): OpsCommand => ({
      command: 'ops',
      words: 'job calibrate',
      config,
      type: 'gate',
      label: 'calibration',
      waitSeconds: 0,
      pollSeconds: 1,
      argv,
    });

    test('three calibrations record calibration records; propose prints a patch and writes nothing; audit reads them', async () => {
      const { config, root, checkout, base, trees } = initialized();
      const telemetry = fakeScopeTelemetry(join(base, 'cgroupfs'));
      const seen = join(base, 'unit');
      const payload = payloadScript(
        join(base, 'calibrate.sh'),
        `printf '%s\\n' "$DASH_JOB_UNIT_GATE_TREE" >> ${seen}`,
      );
      for (let run = 0; run < 3; run++) {
        const stderr: string[] = [];
        expect(
          await runOps(calibrate(config, [payload]), dependencies(checkout, [], stderr, telemetry)),
        ).toBe(0);
      }
      expect(readFileSync(seen, 'utf8')).toBe(`${trees[0] ?? ''}\n`.repeat(3));
      const records = HostJobRunRecords.openForReading(root);
      const listed = records.list();
      records.close();
      expect(listed.map((record) => [record.calibration, record.exitCode])).toEqual([
        [true, 0],
        [true, 0],
        [true, 0],
      ]);
      expect(listed[0]?.toolchain).toBe(`bun ${Bun.version}+${Bun.revision.slice(0, 9)}`);
      const ledger = ResourceRuntime.open(loadResourceConfiguration(config), clock);
      const jobs = ledger.listHostJobs();
      ledger.close();
      expect(jobs.map((job) => [job.calibration, job.units.length, job.state])).toEqual([
        [true, 2, 'released'],
        [true, 2, 'released'],
        [true, 2, 'released'],
      ]);

      const catalogue = join(checkout, 'infra', 'jobs', 'catalogue.json');
      const digest = (): string =>
        createHash('sha256').update(readFileSync(catalogue)).digest('hex');
      const before = digest();
      const stdout: string[] = [];
      expect(
        await runOps(
          {
            command: 'ops',
            words: 'job propose',
            config,
            type: 'gate',
            hostClass: undefined,
            toolchain: undefined,
          },
          dependencies(checkout, stdout, [], telemetry),
        ),
      ).toBe(0);
      const printed = stdout.join('');
      const ids = listed.map((record) => record.jobId).join(', ');
      expect(printed).toContain(
        `memoryGib: 1 (p95 0 GiB over 3 uncapped, unthrottled records: ${ids})`,
      );
      expect(printed).toContain('"kind": "calibrated"');
      expect(digest()).toBe(before);

      const audited: string[] = [];
      expect(
        await runOps(
          { command: 'ops', words: 'job audit', config, now: undefined },
          dependencies(checkout, audited, [], telemetry),
        ),
      ).toBe(0);
      expect(audited).toEqual(['no drift\n']);
      const expired: string[] = [];
      expect(
        await runOps(
          { command: 'ops', words: 'job audit', config, now: '2100-01-01T00:00:00Z' },
          dependencies(checkout, expired, [], telemetry),
        ),
      ).toBe(1);
      expect(expired.join('')).toContain(
        'gate estimate_expired: provenance estimated until 2099-12-31',
      );
    }, 120_000);

    test('propose refuses naming the count before three calibrations', async () => {
      const { config, checkout, base } = initialized();
      const telemetry = fakeScopeTelemetry(join(base, 'cgroupfs'));
      expect(
        await runOps(calibrate(config, ['true']), dependencies(checkout, [], [], telemetry)),
      ).toBe(0);
      const stderr: string[] = [];
      expect(
        await runOps(
          {
            command: 'ops',
            words: 'job propose',
            config,
            type: 'gate',
            hostClass: undefined,
            toolchain: undefined,
          },
          dependencies(checkout, [], stderr, telemetry),
        ),
      ).toBe(1);
      expect(stderr).toEqual([
        'error: ops job propose: gate has 1 uncapped, unthrottled records for memoryGib; 1 calibration records for cpuCores and durationSeconds; 1 records for tmpDiskGib; at least 3 complete records per dimension are needed (provisional); no patch printed\n',
      ]);
    }, 60_000);

    test('--now must be an ISO instant', async () => {
      const { config, checkout } = initialized();
      const stderr: string[] = [];
      expect(
        await runOps(
          { command: 'ops', words: 'job audit', config, now: 'tomorrow' },
          dependencies(checkout, [], stderr, linuxScopeTelemetry()),
        ),
      ).toBe(64);
      expect(stderr).toEqual([
        'error: ops job audit: --now "tomorrow" is not an ISO-8601 UTC instant\n',
      ]);
    });

    test('a bun that cannot name its revision refuses 70 before anything is reserved', async () => {
      const { config, checkout, base } = initialized();
      const broken = join(base, 'broken-bun');
      mkdirSync(broken);
      payloadScript(join(broken, 'bun'), 'exit 3');
      const launcher: JobRunDependencies = {
        clock,
        monotonic,
        environment: { ...process.env, PATH: `${broken}:${fakePath}` },
        cwd: checkout,
        report: silent,
        telemetry: fakeScopeTelemetry(join(base, 'cgroupfs')),
        host: ampleHost,
        sampleIntervalMs: 10_000,
        settleBudgetMs: 20_000,
        user: 'puni1',
      };
      let refused: unknown;
      try {
        await runHostJob(
          {
            config,
            type: 'gate',
            label: 'lane:test',
            waitSeconds: 0,
            pollSeconds: 1,
            argv: ['true'],
          },
          launcher,
        );
      } catch (cause) {
        refused = cause;
      }
      expect(refused instanceof OpsRefusal && [refused.exitCode, refused.message]).toEqual([
        70,
        `${join(broken, 'bun')} --revision answered exit 3 ""; the run's toolchain is unknown`,
      ]);
      const ledger = ResourceRuntime.open(loadResourceConfiguration(config), clock);
      expect(ledger.listHostJobs()).toEqual([]);
      ledger.close();
    });

    test.skipIf(!scopes.available)(
      `a calibration runs with no MemoryHigh${scopeSkip}`,
      async () => {
        const { config, checkout, base } = initialized();
        const seen = join(base, 'bounds');
        const payload = payloadScript(
          join(base, 'bounds.sh'),
          `cgroup=$(sed -n 's/^0:://p' /proc/self/cgroup); cat /sys/fs/cgroup$cgroup/memory.high /sys/fs/cgroup$cgroup/memory.max > ${seen}`,
        );
        const launcher: JobRunDependencies = {
          clock,
          monotonic,
          environment: process.env,
          cwd: checkout,
          report: silent,
          telemetry: linuxScopeTelemetry(),
          host: ampleHost,
          sampleIntervalMs: 10_000,
          settleBudgetMs: 20_000,
          user: 'puni1',
        };
        expect(
          await calibrateHostJob(
            {
              config,
              type: 'gate',
              label: 'calibration',
              waitSeconds: 0,
              pollSeconds: 1,
              argv: [payload],
            },
            launcher,
          ),
        ).toBe(0);
        expect(readFileSync(seen, 'utf8')).toBe('max\nmax\n');
      },
      60_000,
    );
  });
}
