import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { arch, tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterAll, afterEach, describe, expect, test } from 'bun:test';

import { monotonicClock, wallClock } from '../clock';
import { fakeCredential } from '../compute/testing/credential';
import { ampleHost, fixtureGit, hostPoolFixture } from '../resources/host-pool.test.fixture';
import { loadResourceConfiguration, ResourceRuntime } from '../resources/runtime';
import { type OpsDependencies, opsHandlers, runOps } from './commands';
import { type JobRunDependencies, type JobRunRequest, killSession, runHostJob } from './job-run';
import {
  catalogueCheckout,
  catalogueOf,
  CONTAINER_IMAGE,
  fakeScopeTelemetry,
  type FakeSystemdRun,
  fakeSystemdRun,
  type FixtureJobType,
  insideOpsNamespace,
  payloadScript,
  probeDocker,
  probeUserScopes,
  refusingSystemdRun,
} from './ops.test.fixture';
import { OpsRefusal } from './refusal';
import { HostJobRunRecords } from './run-records';
import { linuxScopeTelemetry, type ScopeTelemetry } from './scope';

/**
 * `dash-host-jobs` tasks 3.1 and 3.2 against real scopes, a real ledger and, when the host has
 * them, a real Docker daemon: the requirement "A host job runs measured in its own scope", the
 * uncatalogued-type scenario and the declared container bounds of J16.
 */
if (insideOpsNamespace(import.meta.path)) {
  const scopes = probeUserScopes();
  const docker = probeDocker();
  const scopeSkip = scopes.available ? '' : ` (skipped: ${scopes.reason})`;
  const dockerSkip = docker.available ? '' : ` (skipped: ${docker.reason})`;
  if (!scopes.available)
    process.stderr.write(`ops job run real-scope tests skipped: ${scopes.reason}\n`);
  if (!docker.available)
    process.stderr.write(`ops job run container tests skipped: ${docker.reason}\n`);
  const cleanups: (() => void)[] = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const clock = wallClock();
  const monotonic = monotonicClock();
  const types: FixtureJobType[] = [
    { id: 'test-queued', cpuCores: 1, memoryGib: 1, tmpDiskGib: 1 },
    { id: 'gate', cpuCores: 2, memoryGib: 1, tmpDiskGib: 1, exclusive: ['gate_tree'] },
    { id: 'capped', cpuCores: 1, memoryGib: 1, enforcement: 'cap' },
    { id: 'boxed', cpuCores: 1, memoryGib: 1, containers: { memoryGib: 1, cpuCores: 1 } },
    { id: 'huge', cpuCores: 1, memoryGib: 99 },
    { id: 'pinned', cpuCores: 1, memoryGib: 1, argumentProfile: '<sha>' },
  ];

  /** A pool of 4 cores and 4 GiB (headroom 1 GiB), one gate tree, initialized by `ops pool init`. */
  function pool() {
    const fixture = hostPoolFixture({
      cpuCores: 4,
      memoryGib: 4,
      headroom: { cpuCores: 0, memoryGib: 1 },
      gateTrees: 1,
      credential: fakeCredential(),
    });
    cleanups.push(fixture.remove);
    const checkout = catalogueCheckout(join(fixture.base, 'checkout'), types);
    const out: string[] = [];
    const code = opsHandlers['pool init'](
      { command: 'ops', words: 'pool init', config: fixture.config },
      opsDependencies(checkout, out, out),
    );
    expect(code).toBe(0);
    return { ...fixture, checkout, initialized: out.join('') };
  }

  function opsDependencies(cwd: string, stdout: string[], stderr: string[]): OpsDependencies {
    return {
      clock,
      monotonic,
      environment: process.env,
      cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
      telemetry: linuxScopeTelemetry(),
      host: ampleHost,
      user: 'puni1',
    };
  }

  /**
   * Where a measured run's scope comes from (review F3): the fake seam (a fake `systemd-run` on
   * `PATH` that execs its command, fake counter files) runs on every host, CI included; the real
   * seam (this host's user manager and `/sys/fs/cgroup`) only where a user scope starts.
   */
  interface Seam {
    name: string;
    available: boolean;
    skip: string;
    environment: Readonly<Record<string, string | undefined>>;
    telemetry: ScopeTelemetry & { counterPath(cgroup: string, name: string): string };
  }
  const scratch = mkdtempSync(join(tmpdir(), 'dash-ops-seam-'));
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });
  const fakeBin = (behaviour: FakeSystemdRun): string =>
    fakeSystemdRun(join(scratch, `bin-${behaviour}-${randomUUID()}`), behaviour);
  const fakeRoot = join(scratch, 'cgroupfs');
  const fake: Seam = {
    name: 'fake scope',
    available: true,
    skip: '',
    environment: { ...process.env, PATH: `${fakeBin('exec')}:${process.env['PATH'] ?? ''}` },
    telemetry: fakeScopeTelemetry(fakeRoot),
  };
  const real: Seam = {
    name: 'real scope',
    available: scopes.available,
    skip: scopeSkip,
    environment: process.env,
    telemetry: {
      ...linuxScopeTelemetry(),
      counterPath: (cgroup, name) => join('/sys/fs/cgroup', cgroup, name),
    },
  };

  /** The launcher's dependencies over the fake seam unless `overrides` name others. */
  function runDependencies(
    cwd: string,
    report: string[],
    overrides: Partial<JobRunDependencies> = {},
    seam: Seam = fake,
  ): JobRunDependencies {
    return {
      clock,
      monotonic,
      environment: seam.environment,
      cwd,
      report: (line) => report.push(line),
      telemetry: seam.telemetry,
      host: ampleHost,
      sampleIntervalMs: 10_000,
      settleBudgetMs: 20_000,
      user: 'puni1',
      ...overrides,
    };
  }

  function request(
    config: string,
    type: string,
    argv: string[],
    label = 'lane:test',
  ): JobRunRequest {
    return { config, type, label, waitSeconds: 0, pollSeconds: 1, argv };
  }

  async function refusal(promise: Promise<number>): Promise<OpsRefusal> {
    try {
      await promise;
    } catch (cause) {
      if (cause instanceof OpsRefusal) return cause;
      throw cause;
    }
    throw new Error('expected a refusal');
  }

  function ledger(config: string) {
    const runtime = ResourceRuntime.open(loadResourceConfiguration(config), clock);
    cleanups.unshift(() => {
      runtime.close();
    });
    return runtime;
  }

  /** The one host job a scenario's pool recorded. */
  function onlyJob(config: string) {
    const jobs = ledger(config).listHostJobs();
    expect(jobs.length).toBe(1);
    const job = jobs.at(0);
    if (job === undefined) throw new Error('no host job recorded');
    return job;
  }

  function runRecord(root: string, jobId: string) {
    const records = HostJobRunRecords.open(root, true);
    try {
      const record = records.inspect(jobId);
      if (record === null) throw new Error(`no run record for ${jobId}`);
      return record;
    } finally {
      records.close();
    }
  }

  describe('the catalogue at the payload revision (task 3.1, J2)', () => {
    test('an uncatalogued type exits 64 naming the type and the catalogue, admitting nothing', async () => {
      const { config, checkout } = pool();
      const stderr: string[] = [];
      const code = await runOps(
        { command: 'ops', words: 'job run', ...request(config, 'nightly', ['true']) },
        opsDependencies(checkout, [], stderr),
      );
      expect(code).toBe(64);
      expect(stderr).toEqual([
        `error: ops job run: job type nightly is not in ${checkout}/infra/jobs/catalogue.json at ${readFileSync(join(checkout, '.git', 'refs', 'heads', 'master'), 'utf8').trim()}\n`,
      ]);
      expect(ledger(config).listHostJobs()).toEqual([]);
    });

    test('arguments outside the argument profile exit 64 naming the profile', async () => {
      const { config, checkout } = pool();
      const refused = await refusal(
        runHostJob(request(config, 'pinned', ['true', 'not-a-sha']), runDependencies(checkout, [])),
      );
      expect(refused.exitCode).toBe(64);
      expect(refused.message).toContain('job type pinned: arguments ["not-a-sha"]');
      expect(refused.message).toContain(`${checkout}/infra/jobs/catalogue.json`);
    });

    test('reads the catalogue at HEAD, not the working tree', async () => {
      const { config, checkout } = pool();
      writeFileSync(
        join(checkout, 'infra', 'jobs', 'catalogue.json'),
        JSON.stringify(catalogueOf([...types, { id: 'nightly', cpuCores: 1, memoryGib: 1 }])),
      );
      const refused = await refusal(
        runHostJob(request(config, 'nightly', ['true']), runDependencies(checkout, [])),
      );
      expect(refused.exitCode).toBe(64);
      expect(refused.message).toContain('job type nightly is not in');
    });
  });

  describe('refusals before anything is reserved (J5, J8, J16)', () => {
    test('refuses 70 when the user manager is unavailable, nothing reserved', async () => {
      const { config, checkout, base } = pool();
      const stub = refusingSystemdRun(
        join(base, 'stub-bin'),
        'Failed to connect to bus: No medium found',
      );
      const marker = join(base, 'payload-ran');
      const payload = payloadScript(join(base, 'payload.sh'), `touch ${marker}`);
      const refused = await refusal(
        runHostJob(
          request(config, 'test-queued', [payload]),
          runDependencies(checkout, [], {
            environment: { ...process.env, PATH: `${stub}:${process.env['PATH'] ?? ''}` },
          }),
        ),
      );
      expect(refused.exitCode).toBe(70);
      expect(refused.message).toBe(
        'ops job run: systemd-run --user cannot create a scope (Failed to connect to bus: No medium found); enable the user manager with `loginctl enable-linger puni1`',
      );
      expect(existsSync(marker)).toBe(false);
      const runtime = ledger(config);
      expect(runtime.listHostJobs()).toEqual([]);
      expect(runtime.hostPoolStatus().waiters).toEqual([]);
    });

    test('refuses 70 before admission when systemd-run is absent', async () => {
      const { config, checkout, base } = pool();
      const empty = join(base, 'empty-bin');
      mkdirSync(empty);
      const refused = await refusal(
        runHostJob(
          request(config, 'test-queued', ['true']),
          runDependencies(checkout, [], { environment: { ...process.env, PATH: empty } }),
        ),
      );
      expect(refused.exitCode).toBe(70);
      expect(refused.message).toContain('systemd-run is not on PATH');
      expect(refused.message).toContain('loginctl enable-linger puni1');
      expect(ledger(config).listHostJobs()).toEqual([]);
    });

    test('refuses 70 before admission when docker is absent and a bound is declared', async () => {
      const { config, checkout, base } = pool();
      const empty = join(base, 'empty-bin');
      mkdirSync(empty);
      const refused = await refusal(
        runHostJob(
          request(config, 'boxed', ['true']),
          runDependencies(checkout, [], { environment: { ...process.env, PATH: empty } }),
        ),
      );
      expect(refused.exitCode).toBe(70);
      expect(refused.message).toBe(
        'ops job run: job type boxed declares a containers bound, and docker is not on PATH to watch them (dash-host-jobs J16)',
      );
      expect(ledger(config).listHostJobs()).toEqual([]);
    });

    test('refuses 73 an envelope larger than the pool', async () => {
      const { config, checkout } = pool();
      const refused = await refusal(
        runHostJob(request(config, 'huge', ['true']), runDependencies(checkout, [])),
      );
      expect(refused.exitCode).toBe(73);
      expect(refused.message).toBe('host job huge refused: memoryGib 99 exceeds allocatable 3');
      expect(ledger(config).listHostJobs()).toEqual([]);
    });

    test('refuses 75 a wait-zero caller with a live ticket ahead, naming it', async () => {
      const { config, checkout } = pool();
      const runtime = ledger(config);
      const ahead = runtime.enqueueHostJob(
        {
          descriptor: {
            id: 'test-queued',
            envelope: { cpuCores: 1, memoryGib: 1, tmpDiskGib: 0, exclusive: [] },
            containers: 'none',
            enforcement: 'observe',
          },
          label: 'lane:ahead',
          waitSeconds: 600,
        },
        process.pid,
      );
      expect(ahead.kind).toBe('queued');
      const refused = await refusal(
        runHostJob(request(config, 'test-queued', ['true']), runDependencies(checkout, [])),
      );
      expect(refused.exitCode).toBe(75);
      expect(refused.message).toContain('wait budget 0 with live tickets ahead: lane:ahead');
    });

    test('refuses run records that are not an owner-only regular file', () => {
      const { root, base } = pool();
      const path = HostJobRunRecords.pathOf(root);
      const refusalText = `host job run records ${path} must be an owner-only regular file`;
      const replace = (make: () => void): void => {
        rmSync(path, { recursive: true, force: true });
        make();
      };
      const elsewhere = join(base, 'elsewhere.sqlite');
      for (const [name, make] of [
        [
          'symlink',
          () => {
            writeFileSync(elsewhere, '', { mode: 0o600 });
            symlinkSync(elsewhere, path);
          },
        ],
        [
          'directory',
          () => {
            mkdirSync(path, { mode: 0o700 });
          },
        ],
        [
          'mode 0644',
          () => {
            writeFileSync(path, '', { mode: 0o644 });
            chmodSync(path, 0o644);
          },
        ],
      ] as const) {
        replace(make);
        expect(() => HostJobRunRecords.open(root, false), name).toThrow(refusalText);
        expect(() => HostJobRunRecords.openForReading(root), name).toThrow(refusalText);
      }
      // Another account's file cannot be made without another account: unverified here.
    });

    test('refuses run records of another schema version', () => {
      const { root } = pool();
      const path = HostJobRunRecords.pathOf(root);
      const db = new Database(path);
      db.run('PRAGMA user_version=7');
      db.close();
      const text = `host job run records ${path} have schema version 7; this Dash knows 1`;
      expect(() => HostJobRunRecords.open(root, true)).toThrow(text);
      expect(() => HostJobRunRecords.openForReading(root)).toThrow(text);
    });

    test.skipIf(Bun.which('docker') === null)(
      'refuses 70 before admission when the docker daemon does not answer',
      async () => {
        const { config, checkout } = pool();
        const refused = await refusal(
          runHostJob(
            request(config, 'boxed', ['true']),
            runDependencies(checkout, [], {
              environment: { ...fake.environment, DOCKER_HOST: 'unix:///nonexistent/docker.sock' },
            }),
          ),
        );
        expect(refused.exitCode).toBe(70);
        expect(refused.message).toStartWith(
          'ops job run: job type boxed declares a containers bound, and the docker daemon does not answer (',
        );
        expect(refused.message).not.toContain('not on PATH');
        expect(ledger(config).listHostJobs()).toEqual([]);
      },
    );

    test('refuses 70 run records missing beside a ledger with host jobs', async () => {
      const { config, checkout, root } = pool();
      const runtime = ledger(config);
      const queued = runtime.enqueueHostJob(
        {
          descriptor: {
            id: 'test-queued',
            envelope: { cpuCores: 1, memoryGib: 1, tmpDiskGib: 0, exclusive: [] },
            containers: 'none',
            enforcement: 'observe',
          },
          label: 'lane:earlier',
          waitSeconds: 0,
        },
        process.pid,
      );
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      expect(runtime.pollHostJob(queued.ticket, () => undefined).kind).toBe('admitted');
      rmSync(HostJobRunRecords.pathOf(root));
      const refused = await refusal(
        runHostJob(request(config, 'test-queued', ['true']), runDependencies(checkout, [])),
      );
      expect(refused.exitCode).toBe(70);
      expect(refused.message).toBe(
        `ops job run: host job run records ${root}/.dash/host-job-runs.sqlite are missing beside a ledger that has host jobs; restore them from backup`,
      );
      expect(existsSync(HostJobRunRecords.pathOf(root))).toBe(false);
    });
  });

  describe('the host pool commands (task 3.1, slice 2 A13)', () => {
    test('ops pool init prints the pool; a second init is refused 70; inspect prints it', async () => {
      const { config, checkout, root, trees, initialized } = pool();
      expect(JSON.parse(initialized)).toEqual({
        initialized: true,
        root,
        enrollmentId: 'enrollment-one',
        mode: 'observe',
        allocatable: { cpuCores: 4, memoryGib: 3, diskUnits: 16, workspaceSlots: 16 },
        units: [{ exclusiveId: 'gate_tree', path: trees[0], heldBy: null }],
        runRecords: `${root}/.dash/host-job-runs.sqlite`,
      });
      const stderr: string[] = [];
      expect(
        await runOps(
          { command: 'ops', words: 'pool init', config },
          opsDependencies(checkout, [], stderr),
        ),
      ).toBe(70);
      expect(stderr).toEqual([
        `error: host pool ${config} not initialized: resource initialization requires an empty root\n`,
      ]);
      const stdout: string[] = [];
      expect(
        await runOps(
          { command: 'ops', words: 'pool inspect', config },
          opsDependencies(checkout, stdout, []),
        ),
      ).toBe(0);
      expect(JSON.parse(stdout.join(''))).toMatchObject({ mode: 'observe', jobs: [], waiters: [] });
    });
  });
  for (const seam of [fake, real])
    describe(`a host job runs measured over the ${seam.name} (task 3.1, J7)${seam.skip}`, () => {
      const measured = test.skipIf(!seam.available);
      const run = (
        config: string,
        checkout: string,
        type: string,
        argv: string[],
        report: string[] = [],
        overrides: Partial<JobRunDependencies> = {},
      ) =>
        runHostJob(request(config, type, argv), runDependencies(checkout, report, overrides, seam));

      measured('a gate is measured', async () => {
        const { config, checkout, base, root, trees } = pool();
        const seen = join(base, 'seen');
        const payload = payloadScript(
          join(base, 'gate.sh'),
          [
            // Before any redirection of its own: neither gate pipe reached the payload.
            `readlink /proc/$$/fd/3 /proc/$$/fd/4 > ${seen}.pipes 2>/dev/null`,
            `{`,
            `  printf 'TMPDIR=%s\\n' "$TMPDIR"`,
            `  printf 'DASH_JOB_ID=%s\\n' "$DASH_JOB_ID"`,
            `  printf 'DASH_JOB_TYPE=%s\\n' "$DASH_JOB_TYPE"`,
            `  printf 'DASH_JOB_UNIT_GATE_TREE=%s\\n' "$DASH_JOB_UNIT_GATE_TREE"`,
            `  printf 'HEAVY_LOCK_LABEL=%s\\n' "$HEAVY_LOCK_LABEL"`,
            `  cgroup=$(sed -n 's/^0:://p' /proc/self/cgroup)`,
            `  printf 'cgroup=%s\\n' "$cgroup"`,
            `  printf 'memory.high=%s\\n' "$(cat /sys/fs/cgroup$cgroup/memory.high 2>/dev/null)"`,
            `  printf 'memory.max=%s\\n' "$(cat /sys/fs/cgroup$cgroup/memory.max 2>/dev/null)"`,
            `} > ${seen}`,
            `head -c 1048576 /dev/zero > "$TMPDIR/scratch"`,
          ].join('\n'),
        );
        const report: string[] = [];
        const code = await runHostJob(
          request(config, 'gate', [payload], 'gate:0a518a42'),
          runDependencies(checkout, report, {}, seam),
        );
        expect(code).toBe(0);
        const lines = readFileSync(seen, 'utf8').trim().split('\n');
        const value = (key: string): string =>
          lines.find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1) ?? '';
        const jobId = value('DASH_JOB_ID');
        expect(value('TMPDIR')).toBe(join(root, jobId));
        expect(value('DASH_JOB_TYPE')).toBe('gate');
        expect(value('DASH_JOB_UNIT_GATE_TREE')).toBe(trees[0] ?? '');
        expect(value('HEAVY_LOCK_LABEL')).toBe('gate:0a518a42');
        expect(readFileSync(`${seen}.pipes`, 'utf8')).toBe('');
        if (seam === real) {
          expect(value('cgroup')).toEndWith(`/dash-job-${jobId}.scope`);
          expect(value('memory.high')).toBe(String(1024 ** 3));
          expect(value('memory.max')).toBe('max');
        }
        const record = runRecord(root, jobId);
        expect(record).toMatchObject({
          type: 'gate',
          label: 'gate:0a518a42',
          launcherSha: readFileSync(
            join(checkout, '.git', 'refs', 'heads', 'master'),
            'utf8',
          ).trim(),
          cataloguePath: `${checkout}/infra/jobs/catalogue.json`,
          argumentProfile: '',
          hostClass: `linux-${arch()}-64c-256g`,
          unit: `dash-job-${jobId}`,
          cgroup: seam === fake ? `/fake/dash-job-${jobId}.scope` : record.cgroup,
          units: [{ exclusiveId: 'gate_tree', path: trees[0] }],
          exitCode: 0,
          telemetryFailure: null,
          ledgerFailure: null,
          attributionIncomplete: false,
        });
        expect(record.descriptorDigest).toMatch(/^[0-9a-f]{64}$/);
        expect(record.samples.map((sample) => sample.kind)).toEqual(['gate', 'exit']);
        expect(record.peakMemoryBytes).toBeGreaterThan(0);
        expect(record.peakTmpBytes).toBeGreaterThanOrEqual(1048576);
        expect(record.wallMs).toBeGreaterThanOrEqual(0);
        const job = ledger(config).inspectHostJob(jobId);
        expect(job.exitCode).toBe(0);
        expect(job.state).toBe('released');
        expect(report).toEqual([
          `ops job: ${jobId} compute released: owned process group terminal and declared containers gone`,
          `ops job: ${jobId} tmp released: tmp directory removed and holds verified`,
          `ops job: ${jobId} unit gate_tree ${trees[0] ?? ''} released: tree clean at its resting commit`,
        ]);
      });

      measured('a one-second job is still measured', async () => {
        const { config, checkout, root } = pool();
        expect(await run(config, checkout, 'test-queued', ['true'])).toBe(0);
        const record = runRecord(root, onlyJob(config).id);
        expect(
          record.samples.map((sample) => [sample.kind, sample.counters !== null, sample.failure]),
        ).toEqual([
          ['gate', true, null],
          ['exit', true, null],
        ]);
        expect(record.telemetryFailure).toBeNull();
      });

      measured("a job's failure passes through", async () => {
        const { config, checkout, base, root } = pool();
        const payload = payloadScript(join(base, 'fail.sh'), 'exit 65');
        expect(await run(config, checkout, 'test-queued', [payload])).toBe(65);
        const job = onlyJob(config);
        expect(job.exitCode).toBe(65);
        expect(runRecord(root, job.id).exitCode).toBe(65);
      });

      measured('a signalled payload returns 128 + signal', async () => {
        const { config, checkout, base, root } = pool();
        const payload = payloadScript(join(base, 'killed.sh'), 'kill -TERM $$\nsleep 5');
        expect(await run(config, checkout, 'test-queued', [payload])).toBe(143);
        expect(runRecord(root, onlyJob(config).id)).toMatchObject({
          exitCode: 143,
          signal: 'SIGTERM',
        });
      });

      measured('samples every interval while the payload runs', async () => {
        const { config, checkout, base, root } = pool();
        const payload = payloadScript(join(base, 'slow.sh'), 'sleep 1');
        expect(
          await run(config, checkout, 'test-queued', [payload], [], { sampleIntervalMs: 150 }),
        ).toBe(0);
        const kinds = runRecord(root, onlyJob(config).id).samples.map((sample) => sample.kind);
        expect(kinds.at(0)).toBe('gate');
        expect(kinds.at(-1)).toBe('exit');
        expect(kinds.filter((kind) => kind === 'interval').length).toBeGreaterThanOrEqual(3);
      });

      measured(
        'refuses 70 when memory.peak is unreadable at the gate, the payload never runs',
        async () => {
          const { config, checkout, base } = pool();
          const marker = join(base, 'payload-ran');
          const payload = payloadScript(join(base, 'payload.sh'), `touch ${marker}`);
          // The scope's own counter file is made unreadable before the production read.
          const breaking: ScopeTelemetry = {
            cgroupOf: (pid) => seam.telemetry.cgroupOf(pid),
            members: (cgroup) => seam.telemetry.members(cgroup),
            read: (cgroup) => {
              chmodSync(seam.telemetry.counterPath(cgroup, 'memory.peak'), 0o000);
              return seam.telemetry.read(cgroup);
            },
          };
          const refused = await refusal(
            run(config, checkout, 'test-queued', [payload], [], { telemetry: breaking }),
          );
          expect(refused.exitCode).toBe(70);
          expect(refused.message).toMatch(
            /^ops job run: scope counters unreadable at the gate: scope counter .*\/dash-job-[0-9a-f-]+\.scope\/memory\.peak unreadable: EACCES.*; the payload did not run$/,
          );
          expect(existsSync(marker)).toBe(false);
          const job = onlyJob(config);
          expect(job.exitCode).toBeNull();
          expect(job.launchFailure).toStartWith('payload did not run: scope counters unreadable');
          expect(job.state).toBe('released');
        },
      );

      measured(
        'a scope torn down early is a recorded telemetry failure; the status is still the payload s',
        async () => {
          const { config, checkout, base, root } = pool();
          const payload = payloadScript(join(base, 'teardown.sh'), 'exit 3');
          // After the payload reported its 3 and before the exit sample (the only reading that
          // asks for members), every process left in the scope is killed and the scope empties.
          const tearing: ScopeTelemetry = {
            cgroupOf: (pid) => seam.telemetry.cgroupOf(pid),
            read: (cgroup) => seam.telemetry.read(cgroup),
            members: (cgroup) => {
              for (const member of seam.telemetry.members(cgroup)) process.kill(member, 'SIGKILL');
              for (let attempt = 0; seam.telemetry.members(cgroup).length > 0; attempt++) {
                if (attempt > 5000) throw new Error('scope did not empty');
                Bun.sleepSync(1);
              }
              return seam.telemetry.members(cgroup);
            },
          };
          const report: string[] = [];
          const code = await run(config, checkout, 'test-queued', [payload], report, {
            telemetry: tearing,
          });
          const record = runRecord(root, onlyJob(config).id);
          expect(code).toBe(3);
          expect(record.exitCode).toBe(3);
          expect(record.telemetryFailure).toContain('torn down before the exit sample');
          expect(record.samples.at(-1)).toMatchObject({ kind: 'exit', counters: null });
          expect(report.some((line) => line.includes('telemetry failure recorded'))).toBe(true);
        },
      );

      measured(
        "a ledger write failure is recorded apart; the status is still the payload's",
        async () => {
          const { config, checkout, base, root } = pool();
          // The payload opens the managed root to others: every later ledger transaction refuses
          // the root, so recording the exit fails on the production path.
          const payload = payloadScript(join(base, 'opens-root.sh'), `chmod 755 ${root}\nexit 4`);
          const report: string[] = [];
          const code = await run(config, checkout, 'test-queued', [payload], report);
          chmodSync(root, 0o700);
          expect(code).toBe(4);
          const job = onlyJob(config);
          const record = runRecord(root, job.id);
          expect(record.exitCode).toBe(4);
          expect(record.ledgerFailure).toBe(
            'exit unrecorded in the resource ledger: resource root must be owner-only',
          );
          expect(record.telemetryFailure).toBeNull();
          expect(job.exitCode).toBeNull();
          expect(report).toContain(
            `ops job: ${job.id} exit unrecorded in the resource ledger: resource root must be owner-only`,
          );
        },
      );
    });

  describe('launch faults over the fake seam (review F2, F4, F9, F10, F13)', () => {
    test('refuses 70 when the scope never starts, the payload never runs', async () => {
      const { config, checkout, base } = pool();
      const marker = join(base, 'payload-ran');
      const payload = payloadScript(join(base, 'payload.sh'), `touch ${marker}`);
      const refused = await refusal(
        runHostJob(
          request(config, 'test-queued', [payload]),
          runDependencies(checkout, [], {
            environment: {
              ...process.env,
              PATH: `${fakeBin('exits')}:${process.env['PATH'] ?? ''}`,
            },
          }),
        ),
      );
      expect(refused.exitCode).toBe(70);
      expect(refused.message).toMatch(
        /^ops job run: systemd-run did not start scope dash-job-[0-9a-f-]+; the payload did not run$/,
      );
      expect(existsSync(marker)).toBe(false);
      const job = onlyJob(config);
      expect(job.exitCode).toBeNull();
      expect(job.launchFailure).toStartWith('payload did not run: systemd-run did not start scope');
      expect(job.state).toBe('released');
    });

    test('refuses 70 when systemd-run vanishes before the launch', async () => {
      const { config, checkout } = pool();
      const refused = await refusal(
        runHostJob(
          request(config, 'test-queued', ['true']),
          runDependencies(checkout, [], {
            environment: {
              ...process.env,
              PATH: `${fakeBin('vanishes')}:${process.env['PATH'] ?? ''}`,
            },
          }),
        ),
      );
      expect(refused.exitCode).toBe(70);
      expect(refused.message).toEndWith(
        'did not start; the payload did not run, and the job stays charged until its launch grace passes',
      );
      expect(onlyJob(config).process).toBeNull();
    });

    test('refuses 70 when the launch identity cannot be recorded', async () => {
      const { config, checkout, root } = pool();
      // Read once the job's tmp directory exists, which is after preparation and before the
      // spawn: the managed root is opened to others, so recording the launch is refused.
      const environment: Record<string, string | undefined> = { ...fake.environment };
      Object.defineProperty(environment, 'DASH_TEST_TRIGGER', {
        enumerable: true,
        get: () => {
          if (readdirSync(root).some((entry) => entry !== '.dash')) chmodSync(root, 0o755);
          return 'set';
        },
      });
      const refused = await refusal(
        runHostJob(
          request(config, 'test-queued', ['true']),
          runDependencies(checkout, [], { environment }),
        ),
      );
      chmodSync(root, 0o700);
      expect(refused.exitCode).toBe(70);
      expect(refused.message).toMatch(
        /^ops job run: launch identity of dash-job-[0-9a-f-]+ unrecorded \(resource root must be owner-only\); the payload did not run, and the job stays charged until its launch grace passes$/,
      );
      expect(onlyJob(config).process).toBeNull();
    });

    test('refuses 70 when the run record cannot be written at the gate', async () => {
      const { config, checkout, base, root } = pool();
      const marker = join(base, 'payload-ran');
      const payload = payloadScript(join(base, 'payload.sh'), `touch ${marker}`);
      // Another writer holds the run records' write lock from the gate sample on.
      const blocker = new Database(HostJobRunRecords.pathOf(root));
      cleanups.unshift(() => {
        blocker.close();
      });
      const holding: ScopeTelemetry = {
        cgroupOf: (pid) => fake.telemetry.cgroupOf(pid),
        members: (cgroup) => fake.telemetry.members(cgroup),
        read: (cgroup) => {
          if (!blocker.inTransaction) blocker.run('BEGIN EXCLUSIVE');
          return fake.telemetry.read(cgroup);
        },
      };
      const refused = await refusal(
        runHostJob(
          request(config, 'test-queued', [payload]),
          runDependencies(checkout, [], { telemetry: holding }),
        ),
      );
      expect(refused.exitCode).toBe(70);
      expect(refused.message).toMatch(
        /^ops job run: run record unwritable at the gate: .*locked.*; the payload did not run$/,
      );
      expect(existsSync(marker)).toBe(false);
      expect(onlyJob(config).state).toBe('released');
    }, 60000);

    test('refuses 64 when the checkout moved while waiting', async () => {
      const { config, checkout, base } = pool();
      const marker = join(base, 'payload-ran');
      const payload = payloadScript(join(base, 'payload.sh'), `touch ${marker}`);
      const moving: ScopeTelemetry = {
        cgroupOf: (pid) => fake.telemetry.cgroupOf(pid),
        members: (cgroup) => fake.telemetry.members(cgroup),
        read: (cgroup) => {
          fixtureGit(checkout, 'commit', '--quiet', '--allow-empty', '-m', 'moved on');
          return fake.telemetry.read(cgroup);
        },
      };
      const admittedAt = fixtureGit(checkout, 'rev-parse', 'HEAD');
      const refused = await refusal(
        runHostJob(
          request(config, 'test-queued', [payload]),
          runDependencies(checkout, [], { telemetry: moving }),
        ),
      );
      expect(refused.exitCode).toBe(64);
      expect(refused.message).toBe(
        `ops job run: ${checkout} moved from ${admittedAt} to ${fixtureGit(checkout, 'rev-parse', 'HEAD')} while the job waited; rerun from the new commit; the payload did not run`,
      );
      expect(existsSync(marker)).toBe(false);
      expect(onlyJob(config).state).toBe('released');
    });

    test('a SIGINT while the scope starts refuses 130, the payload never runs', async () => {
      const { config, checkout, base } = pool();
      const marker = join(base, 'payload-ran');
      const payload = payloadScript(join(base, 'payload.sh'), `touch ${marker}`);
      const bin = fakeBin('sleeps');
      const launcher = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, 'launcher.test.fixture.ts'),
          config,
          checkout,
          'test-queued',
          fakeRoot,
          `${bin}:${process.env['PATH'] ?? ''}`,
          '10000',
          '--',
          payload,
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      );
      for (let attempt = 0; !existsSync(join(bin, 'launched')); attempt++) {
        if (attempt > 3000) throw new Error('the launch never reached systemd-run');
        await Bun.sleep(10);
      }
      launcher.kill('SIGINT');
      const code = await launcher.exited;
      const stderr = await new Response(launcher.stderr).text();
      expect(stderr).toContain(
        'refused 130 ops job run: interrupted by SIGINT before the gate opened; the payload did not run',
      );
      expect(code).toBe(130);
      expect(existsSync(marker)).toBe(false);
      const job = onlyJob(config);
      expect(job.launchFailure).toBe(
        'payload did not run: interrupted by SIGINT before the gate opened',
      );
      expect(job.state).toBe('released');
    }, 60000);

    test('a SIGINT during the synchronous gate work refuses 130', async () => {
      const { config, checkout, base } = pool();
      const marker = join(base, 'payload-ran');
      const payload = payloadScript(join(base, 'payload.sh'), `touch ${marker}`);
      // The reviewer's probe: the signal lands inside the synchronous stretch before the gate.
      const interrupting: ScopeTelemetry = {
        cgroupOf: (pid) => fake.telemetry.cgroupOf(pid),
        members: (cgroup) => fake.telemetry.members(cgroup),
        read: (cgroup) => {
          process.kill(process.pid, 'SIGINT');
          Bun.sleepSync(300);
          return fake.telemetry.read(cgroup);
        },
      };
      const refused = await refusal(
        runHostJob(
          request(config, 'test-queued', [payload]),
          runDependencies(checkout, [], { telemetry: interrupting }),
        ),
      );
      expect(refused.exitCode).toBe(130);
      expect(refused.message).toBe(
        'ops job run: interrupted by SIGINT before the gate opened; the payload did not run',
      );
      expect(existsSync(marker)).toBe(false);
      const job = onlyJob(config);
      expect(job.exitCode).toBeNull();
      expect(job.launchFailure).toBe(
        'payload did not run: interrupted by SIGINT before the gate opened',
      );
    });

    test('the launcher process ends with its job', async () => {
      const { config, checkout } = pool();
      const started = monotonic.now();
      const launcher = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, 'launcher.test.fixture.ts'),
          config,
          checkout,
          'test-queued',
          fakeRoot,
          fake.environment['PATH'] ?? '',
          '10000',
          '--',
          'true',
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      );
      expect(await launcher.exited).toBe(0);
      // The process ends with the job, not one ten-second sample interval later.
      expect(monotonic.now() - started).toBeLessThan(9500);
    }, 60000);

    test('killing a session already gone is not an error', async () => {
      const gone = spawn('true', [], { detached: true, stdio: 'ignore' });
      await once(gone, 'exit');
      if (gone.pid === undefined) throw new Error('no pid');
      expect(() => {
        killSession(gone.pid ?? 0, 'SIGKILL');
      }).not.toThrow();
    });
  });

  describe(`real-scope only (task 3.1, J7)${scopeSkip}`, () => {
    test.skipIf(!scopes.available)('cap enforcement sets MemoryMax beside MemoryHigh', async () => {
      const { config, checkout, base } = pool();
      const seen = join(base, 'seen');
      const payload = payloadScript(
        join(base, 'cap.sh'),
        `cgroup=$(sed -n 's/^0:://p' /proc/self/cgroup); cat /sys/fs/cgroup$cgroup/memory.high /sys/fs/cgroup$cgroup/memory.max > ${seen}`,
      );
      expect(
        await runHostJob(
          request(config, 'capped', [payload]),
          runDependencies(checkout, [], {}, real),
        ),
      ).toBe(0);
      expect(readFileSync(seen, 'utf8')).toBe(`${String(1024 ** 3)}\n${String(1024 ** 3)}\n`);
    });

    test.skipIf(!scopes.available)(
      'the installed entrypoint runs a job and passes its status',
      () => {
        const { config, checkout, base } = pool();
        const payload = payloadScript(join(base, 'fail.sh'), 'echo payload-out; exit 65');
        const execution = Bun.spawnSync(
          [
            process.execPath,
            join(import.meta.dir, '..', 'entrypoint.ts'),
            'ops',
            'job',
            'run',
            '--config',
            config,
            '--type',
            'test-queued',
            '--label',
            'lane:entry',
            '--',
            payload,
          ],
          { cwd: checkout, stdout: 'pipe', stderr: 'pipe', timeout: 60000 },
        );
        expect(execution.stdout.toString()).toBe('payload-out\n');
        expect(execution.exitCode).toBe(65);
        expect(execution.stderr.toString()).toContain(' compute released: ');
      },
      60000,
    );
  });

  describe(`declared container bounds over the fake seam (task 3.2, J16)${dockerSkip}`, () => {
    const ready = docker.available;
    const runBoxed = async (script: string) => {
      const { config, checkout, base, root } = pool();
      const payload = payloadScript(join(base, 'containers.sh'), script);
      const report: string[] = [];
      const code = await runHostJob(
        request(config, 'boxed', [payload]),
        runDependencies(checkout, report),
      );
      const job = onlyJob(config);
      return {
        code,
        record: runRecord(root, job.id),
        job: ledger(config).inspectHostJob(job.id),
        report,
      };
    };

    test.skipIf(!ready)(
      'a bounded labelled container is attributed and settles',
      async () => {
        const { code, record, job } = await runBoxed(
          `docker run --rm --label puni.job="$DASH_JOB_ID" --memory 256m --cpus 1 ${CONTAINER_IMAGE} sleep 2`,
        );
        expect(code).toBe(0);
        const mine = record.containers.filter((verdict) => verdict.verdict !== 'unlabelled');
        expect(mine.map((verdict) => verdict.verdict)).toEqual(['bounded']);
        // Other agents on the host may start unlabelled containers in the same window.
        expect(record.attributionIncomplete).toBe(
          record.containers.some((verdict) => verdict.verdict !== 'bounded'),
        );
        expect(job.compute.state).toBe('released');
      },
      90000,
    );

    test.skipIf(!ready)(
      "an unbounded container makes the run's attribution incomplete",
      async () => {
        const { code, record, report } = await runBoxed(
          `docker run --rm --label puni.job="$DASH_JOB_ID" ${CONTAINER_IMAGE} sleep 1`,
        );
        expect(code).toBe(0);
        expect(record.attributionIncomplete).toBe(true);
        expect(
          record.containers
            .filter((verdict) => verdict.verdict === 'unbounded')
            .map((verdict) => verdict.reason.includes('memory limit none')),
        ).toEqual([true]);
        expect(report.some((line) => line.includes('attribution incomplete'))).toBe(true);
      },
      90000,
    );

    test.skipIf(!ready)(
      'an unlabelled container makes the attribution incomplete',
      async () => {
        const { record } = await runBoxed(`docker run --rm ${CONTAINER_IMAGE} true`);
        expect(record.attributionIncomplete).toBe(true);
        expect(record.containers.some((verdict) => verdict.verdict === 'unlabelled')).toBe(true);
      },
      90000,
    );

    test.skipIf(!ready)(
      'a labelled container still running keeps the compute charged',
      async () => {
        const { config, checkout, base, root } = pool();
        const name = `dash-ops-test-${String(process.pid)}`;
        cleanups.push(() => {
          Bun.spawnSync(['docker', 'rm', '--force', name], { stdout: 'ignore', stderr: 'ignore' });
        });
        const payload = payloadScript(
          join(base, 'detached.sh'),
          `docker run --detach --name ${name} --label puni.job="$DASH_JOB_ID" --memory 256m --cpus 1 ${CONTAINER_IMAGE} sleep 60 >/dev/null`,
        );
        const code = await runHostJob(
          request(config, 'boxed', [payload]),
          runDependencies(checkout, [], { settleBudgetMs: 1000 }),
        );
        expect(code).toBe(0);
        const job = onlyJob(config);
        expect(job.compute).toEqual({
          state: 'held',
          reason: 'declared containers not verified gone',
        });
        expect(
          runRecord(root, job.id).containers.some((verdict) => verdict.verdict === 'bounded'),
        ).toBe(true);
      },
      90000,
    );
  });
}
