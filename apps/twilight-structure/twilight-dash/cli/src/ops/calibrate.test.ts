import { type ChildProcess, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterAll, afterEach, describe, expect, test } from 'bun:test';

import { monotonicClock, wallClock } from '../clock';
import { fakeCredential } from '../compute/testing/credential';
import {
  ampleHost,
  build,
  fixtureGit,
  gate,
  hostPoolFixture,
  jobType,
} from '../resources/host-pool.test.fixture';
import { privateLegacyLock } from '../resources/legacy-lock.test.fixture';
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
import { formatHostPoolStatus } from './status';

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
  function pool(gateTrees = 2, overrides: Record<string, unknown> = {}) {
    const fixture = hostPoolFixture(
      {
        cpuCores: 8,
        memoryGib: 15,
        headroom: { cpuCores: 0, memoryGib: 2 },
        gateTrees,
        credential: fakeCredential(),
      },
      // A small disk budget, so the whole-budget free-space check passes on any runner.
      { diskBudgetUnits: 2, ...overrides },
    );
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
      const { config } = pool();
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
      // Two 1 GiB disk units: the whole budget is 2 GiB for WBS.
      expect(job.reserved).toEqual({ ...runtime.hostPoolStatus().allocatable, tmpDiskGib: 2 });
    });

    test('a calibration of a gate holds every gate tree', () => {
      const { config, trees } = pool();
      const runtime = runtimeOf(config);
      const job = admitted(
        runtime,
        queue(runtime, {
          descriptor: gate,
          label: 'calibration',
          waitSeconds: 0,
          calibration: true,
        }),
      );
      expect(job.units.map((unit) => [unit.exclusiveId, unit.path])).toEqual(
        trees.map((tree) => ['gate_tree', tree]),
      );
    });

    test('a calibration of a type naming no unit holds none and ignores a dirty tree', () => {
      const { config, trees } = pool();
      const runtime = runtimeOf(config);
      writeFileSync(join(trees[0] ?? '', 'stray.txt'), 'dirty\n');
      const job = admitted(
        runtime,
        queue(runtime, {
          descriptor: build,
          label: 'calibration',
          waitSeconds: 0,
          calibration: true,
        }),
      );
      expect(job.units).toEqual([]);
      expect(runtime.hostPoolStatus().units.every((unit) => unit.heldBy === null)).toBe(true);
    });

    test('a calibration waits while a unit of its type is dirty', () => {
      const { config, trees } = pool();
      const runtime = runtimeOf(config);
      writeFileSync(join(trees[0] ?? '', 'stray.txt'), 'dirty\n');
      const outcome = runtime.pollHostJob(
        queue(runtime, {
          descriptor: gate,
          label: 'calibration',
          waitSeconds: 0,
          calibration: true,
        }),
        silent,
      );
      expect(outcome.kind).toBe('refused');
      expect(outcome.kind === 'refused' && outcome.reason).toContain(
        `units not free: ${trees[0] ?? ''} (dirty: ?? stray.txt)`,
      );
    });

    test('a calibration waits for free space for the whole disk budget, naming the shortfall', () => {
      // A headroom no disk has: the whole budget can never be covered.
      const { config, root } = pool(2, { headroomBytes: 2 ** 52 });
      const runtime = runtimeOf(config);
      const outcome = runtime.pollHostJob(
        queue(runtime, {
          descriptor: build,
          label: 'calibration',
          waitSeconds: 0,
          calibration: true,
        }),
        silent,
      );
      expect(outcome.kind).toBe('refused');
      expect(outcome.kind === 'refused' && outcome.reason).toMatch(
        new RegExp(
          `; free space \\d+ bytes under ${root} is below the ${String(2 * 1024 ** 3 + 2 ** 52)} needed \\(2 disk units plus ${String(2 ** 52)} bytes headroom\\)$`,
        ),
      );
    });

    test('a second calibration waits behind the first; status names both', () => {
      const { config } = pool();
      const runtime = runtimeOf(config);
      const first = admitted(
        runtime,
        queue(runtime, {
          descriptor: gate,
          label: 'calibration',
          waitSeconds: 0,
          calibration: true,
        }),
      );
      const second = queue(runtime, {
        descriptor: build,
        label: 'calibration:2',
        waitSeconds: 600,
        calibration: true,
      });
      // Two checks each keep the second out: the drain fit and the first's whole-vector
      // reservation. Proof: dropping either alone stayed green; dropping both admitted the
      // second beside the first (2026-11-02, Slice 4 review A13, verify.md).
      expect(runtime.pollHostJob(second, silent).kind).toBe('waiting');
      const lines = formatHostPoolStatus(
        runtime.hostPoolStatus(),
        new Map(),
        clock.read(),
        null,
        '/holds',
      );
      // Proof: without the `calibration` word the running and waiting lines began
      // `running gate calibration pid` and `waiting website-dev-build` (2026-11-02, review A7).
      expect(lines[1]?.startsWith(`running calibration gate calibration pid -`)).toBe(true);
      expect(lines[2]?.startsWith('waiting calibration website-dev-build calibration:2 pid ')).toBe(
        true,
      );
      expect(first.calibration).toBe(true);
    });

    test('a ledger row written before `reserved` was persisted reads it from its descriptor', () => {
      const { config, root } = pool();
      const runtime = runtimeOf(config);
      const job = admitted(
        runtime,
        queue(runtime, { descriptor: gate, label: 'gate:1', waitSeconds: 0 }),
      );
      const ledger = new Database(join(root, '.dash', 'resources.sqlite'));
      ledger.run("UPDATE host_jobs SET snapshot=json_remove(snapshot, '$.reserved') WHERE id=?", [
        job.id,
      ]);
      ledger.close();
      expect(runtime.inspectHostJob(job.id).reserved).toEqual({
        cpuCores: 4,
        memoryGib: 6,
        diskUnits: 0,
        workspaceSlots: 1,
        tmpDiskGib: 0,
      });
      expect(runtime.hostPoolStatus().reserved).toEqual({
        cpuCores: 4,
        memoryGib: 6,
        diskUnits: 0,
        workspaceSlots: 1,
      });
    });

    test('a calibration row without its reservation is refused', () => {
      const { config, root } = pool();
      const runtime = runtimeOf(config);
      const job = admitted(
        runtime,
        queue(runtime, {
          descriptor: gate,
          label: 'calibration',
          waitSeconds: 0,
          calibration: true,
        }),
      );
      const ledger = new Database(join(root, '.dash', 'resources.sqlite'));
      ledger.run("UPDATE host_jobs SET snapshot=json_remove(snapshot, '$.reserved') WHERE id=?", [
        job.id,
      ]);
      ledger.close();
      expect(() => runtime.inspectHostJob(job.id)).toThrow(
        `host job ${job.id} is a calibration with no persisted reservation`,
      );
    });

    test('a calibration naming an exclusive id with no units is refused 73', () => {
      const { config } = pool(0);
      const runtime = runtimeOf(config);
      expect(
        runtime.enqueueHostJob(
          { descriptor: gate, label: 'calibration', waitSeconds: 0, calibration: true },
          process.pid,
        ),
      ).toEqual({
        kind: 'refused',
        exitCode: 73,
        reason: 'host job gate refused: exclusive gate_tree has 0 units in this pool',
      });
    });

    test('a calibration holds the whole allocatable vector', () => {
      const { config } = pool();
      const runtime = runtimeOf(config);
      admitted(
        runtime,
        queue(runtime, {
          descriptor: gate,
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
        legacyLock: () => privateLegacyLock(join(cwd, '..')),
        connect: () => {
          throw new Error('no WBS call expected');
        },
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

      // A run from a scratch worktree since deleted is judged against this checkout by its id.
      const written = HostJobRunRecords.open(root, true);
      const template = listed.at(0);
      if (template === undefined) throw new Error('no run record');
      const gateSample = template.samples.at(0);
      if (gateSample === undefined) throw new Error('no gate sample');
      written.begin(
        {
          jobId: 'scratch-run',
          type: template.type,
          label: template.label,
          descriptor: template.descriptor,
          descriptorDigest: template.descriptorDigest,
          cataloguePath: '/vanished/scratch/infra/jobs/catalogue.json',
          launcherSha: template.launcherSha,
          argumentProfile: template.argumentProfile,
          argv: [...template.argv],
          hostClass: template.hostClass,
          unit: 'dash-job-scratch-run',
          cgroup: template.cgroup,
          tmpDirectory: template.tmpDirectory,
          units: [],
          startedAt: template.startedAt,
        },
        gateSample,
      );
      written.finish('scratch-run', {
        endedAt: template.startedAt + 1000,
        exitCode: 0,
        signal: null,
        telemetryFailure: null,
        ledgerFailure: null,
        attributionIncomplete: false,
        containers: [],
      });
      written.close();
      const vanished: string[] = [];
      expect(
        await runOps(
          { command: 'ops', words: 'job audit', config, now: undefined },
          dependencies(checkout, vanished, [], telemetry),
        ),
      ).toBe(0);
      expect(vanished).toEqual(['no drift\n']);
    }, 120_000);

    test('propose refuses a checkout without a usable catalogue, and an uncatalogued type', async () => {
      const { config, base, checkout } = initialized();
      const propose = async (cwd: string, type = 'gate') => {
        const stderr: string[] = [];
        const code = await runOps(
          {
            command: 'ops',
            words: 'job propose',
            config,
            type,
            hostClass: undefined,
            toolchain: undefined,
          },
          dependencies(cwd, [], stderr, linuxScopeTelemetry()),
        );
        return `${String(code)} ${stderr.join('')}`;
      };
      const plain = join(base, 'plain');
      mkdirSync(plain);
      const empty = join(base, 'empty');
      mkdirSync(empty);
      fixtureGit(empty, 'init', '--quiet');
      const bare = join(base, 'bare');
      mkdirSync(bare);
      fixtureGit(bare, 'init', '--quiet');
      writeFileSync(join(bare, 'README'), 'no catalogue\n');
      fixtureGit(bare, 'add', 'README');
      fixtureGit(bare, 'commit', '--quiet', '-m', 'no catalogue');
      const broken = join(base, 'broken');
      mkdirSync(join(broken, 'infra', 'jobs'), { recursive: true });
      fixtureGit(broken, 'init', '--quiet');
      writeFileSync(join(broken, 'infra', 'jobs', 'catalogue.json'), '{"schemaVersion": 1}\n');
      fixtureGit(broken, 'add', '.');
      fixtureGit(broken, 'commit', '--quiet', '-m', 'malformed');
      // Proof: see `readCommittedCatalogue` (catalogue.ts) for what each dropped refusal did.
      expect(await propose(plain)).toStartWith(
        `64 error: ops job propose: ${plain} is not inside a Git checkout with a job catalogue`,
      );
      expect(await propose(empty)).toStartWith(
        `64 error: ops job propose: ${empty} has no HEAD commit`,
      );
      expect(await propose(bare)).toStartWith(
        `64 error: ops job propose: ${bare}/infra/jobs/catalogue.json does not exist at `,
      );
      expect(await propose(broken)).toStartWith(
        `70 error: ops job propose: ${broken}/infra/jobs/catalogue.json at `,
      );
      expect(await propose(broken)).toContain(' is malformed: ');
      // Proof: without the handler's check the uncatalogued type reached `proposeEnvelope`,
      // which threw instead of refusing 64 (2026-11-02, review A13).
      expect(await propose(checkout, 'nightly')).toStartWith(
        `64 error: ops job propose: job type nightly is not in ${checkout}/infra/jobs/catalogue.json at `,
      );
    });

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
      for (const now of ['2026-13-45T00:00:00Z', '2026-02-30T00:00:00Z']) {
        const refused: string[] = [];
        expect(
          await runOps(
            { command: 'ops', words: 'job audit', config, now },
            dependencies(checkout, [], refused, linuxScopeTelemetry()),
          ),
        ).toBe(64);
        expect(refused).toEqual([
          `error: ops job audit: --now "${now}" is not an ISO-8601 UTC instant\n`,
        ]);
      }
    });

    test('a bun that answers its revision with garbage refuses 70', async () => {
      const { config, checkout, base } = initialized();
      const garbled = join(base, 'garbled-bun');
      mkdirSync(garbled);
      payloadScript(join(garbled, 'bun'), 'echo garbage');
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
          {
            clock,
            monotonic,
            environment: { ...process.env, PATH: `${garbled}:${fakePath}` },
            cwd: checkout,
            report: silent,
            telemetry: fakeScopeTelemetry(join(base, 'cgroupfs')),
            host: ampleHost,
            sampleIntervalMs: 10_000,
            settleBudgetMs: 20_000,
            user: 'puni1',
            legacyLock: privateLegacyLock(join(checkout, '..')),
          },
        );
      } catch (cause) {
        refused = cause;
      }
      // Proof: dropping the version pattern (exit status alone) made this test run the job,
      // no refusal (2026-11-02, Slice 4 review A13).
      expect(refused instanceof OpsRefusal && [refused.exitCode, refused.message]).toEqual([
        70,
        `${join(garbled, 'bun')} --revision answered exit 0 "garbage"; the run's toolchain is unknown`,
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
        legacyLock: privateLegacyLock(join(checkout, '..')),
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
          legacyLock: privateLegacyLock(join(checkout, '..')),
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
