import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { arch, tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterAll, afterEach, describe, expect, spyOn, test } from 'bun:test';

import { monotonicClock, wallClock } from '../clock';
import { fakeCredential } from '../compute/testing/credential';
import { scriptedTools } from '../mcp/testing/scripted-tools';
import { ampleHost, fixtureGit, hostPoolFixture } from '../resources/host-pool.test.fixture';
import { privateLegacyLock } from '../resources/legacy-lock.test.fixture';
import { loadResourceConfiguration, ResourceRuntime } from '../resources/runtime';
import { type OpsDependencies, opsHandlers, runOps } from './commands';
import { type JobRunDependencies, type JobRunRequest, killSession, runHostJob } from './job-run';
import { dimensionStandings, incompleteness } from './measures';
import {
  catalogueCheckout,
  catalogueOf,
  CONTAINER_IMAGE,
  fakeScopeTelemetry,
  fakeSystemctl,
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
  const clampedProvenance = {
    kind: 'calibrated',
    hostClass: 'linux-x64-4c-4g',
    calibratedAt: '2026-11-20T04:05:14.759Z',
    recordCount: 3,
    p95: { cpuCores: 0.5, memoryGib: 2.4, tmpDiskGib: 0 },
    recordIds: ['c1', 'c2', 'c3'],
    clampedToAllocatable: ['memoryGib'],
    heuristic: { memoryGib: 3 },
  };
  const types: FixtureJobType[] = [
    { id: 'test-queued', cpuCores: 1, memoryGib: 1, tmpDiskGib: 1 },
    { id: 'gate', cpuCores: 2, memoryGib: 1, tmpDiskGib: 1, exclusive: ['gate_tree'] },
    { id: 'capped', cpuCores: 1, memoryGib: 1, enforcement: 'cap' },
    { id: 'boxed', cpuCores: 1, memoryGib: 1, containers: { memoryGib: 1, cpuCores: 1 } },
    { id: 'huge', cpuCores: 1, memoryGib: 99 },
    { id: 'pinned', cpuCores: 1, memoryGib: 1, argumentProfile: '<sha>' },
    { id: 'bounded', cpuCores: 1, memoryGib: 1, maxRuntimeMinutes: 1 },
    // Clamped from a heuristic of 3 GiB to 2 (task 6.25, S25-A6); the pool allocates 3.
    { id: 'clamped', cpuCores: 1, memoryGib: 2, provenance: clampedProvenance },
    {
      id: 'clamped-cap',
      cpuCores: 1,
      memoryGib: 2,
      enforcement: 'cap',
      provenance: clampedProvenance,
    },
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
      legacyLock: () => privateLegacyLock(join(cwd, '..')),
      connect: () => {
        throw new Error('no WBS call expected');
      },
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
      // Beside the checkout, in the pool fixture's own directory: one shell lock per pool.
      legacyLock: privateLegacyLock(join(cwd, '..')),
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
        guard: 'on',
        concurrencyEligible: [],
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
        // Observe mode (J12): the shell lock's own claim line, then settlement, then its release.
        // The claim line counts whole seconds, so a loaded host may say 1s.
        expect(report[0]).toMatch(/^heavy lock: waited \d+s behind 0 tickets$/);
        expect(report.slice(1)).toEqual([
          `ops job: ${jobId} compute released: owned process group terminal and declared containers gone`,
          `ops job: ${jobId} tmp released: tmp directory removed and holds verified`,
          `ops job: ${jobId} unit gate_tree ${trees[0] ?? ''} released: tree clean at its resting commit`,
          `ops job: ${jobId} released the shell lock`,
        ]);
      });

      // Task 6.24: the gate's frontend tests leave `node serve.cjs` in the scope after a payload
      // that exits 0; its hold on TMPDIR kept the tmp directory charged after every calibration.
      measured('a leftover in the scope is ended before tmp settlement (task 6.24)', async () => {
        const { config, checkout, base, root } = pool();
        const leftover = join(base, 'leftover');
        const payload = payloadScript(
          join(base, 'leaves-a-server.sh'),
          [
            'cd "$TMPDIR"',
            `setsid sh -c 'echo $$ > ${leftover}; exec sleep 300' &`,
            `while [ ! -s ${leftover} ]; do sleep 0.05; done`,
            'exit 0',
          ].join('\n'),
        );
        cleanups.push(() => {
          if (existsSync(leftover)) spawn('kill', ['-KILL', readFileSync(leftover, 'utf8').trim()]);
        });
        const report: string[] = [];
        expect(await run(config, checkout, 'test-queued', [payload], report)).toBe(0);
        const job = onlyJob(config);
        const scope = `dash-job-${job.id}.scope`;
        const record = runRecord(root, job.id);
        // Proof: dropping the graceful `endLeftovers` call in `runAdmitted` made this see
        // `tmp blocked: tmp directory unverified: live file hold remains charged` and the
        // scope's members still `[<sleep pid>]` (2026-11-19, task 6.24).
        // Outside a PID namespace (the real seam run from a login session) settlement also names
        // the session's non-dumpable processes (`keepassxc`, `ssh-agent`, `(sd-pam)`) as outside
        // the scope; that suffix is J19's evidence text, not a hold.
        const tmpLine = report.find((line) => line.startsWith(`ops job: ${job.id} tmp `)) ?? '';
        expect({
          tmp: tmpLine.replace(/; uninspectable_outside_scope: .*$/, ''),
          members: seam.telemetry.members(record.cgroup),
        }).toEqual({
          tmp: `ops job: ${job.id} tmp released: tmp directory removed and holds verified`,
          members: [],
        });
        expect(job.state).toBe('released');
        expect(record.leftoverProcesses).toEqual({
          count: 1,
          examples: [
            {
              pid: Number(readFileSync(leftover, 'utf8').trim()),
              comm: 'sleep',
              cmdline: 'sleep 300',
            },
          ],
          endedWith: 'SIGTERM',
        });
        expect(report).toContain(
          `ops job: ${job.id} 1 leftover processes in ${scope} after its session ended; SIGTERM`,
        );
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

      measured(
        'a mode-0 test fixture under TMPDIR is a listed tmp lower bound, not a telemetry failure (task 6.23)',
        async () => {
          const { config, checkout, base, root } = pool();
          // What `shared-people-host-restore-process.db.test.ts` does under the gate: a
          // directory closed to its own user inside a mkdtemp fixture, reopened later.
          const payload = payloadScript(
            join(base, 'fixture.sh'),
            [
              'fixture="$TMPDIR/wbs-shared-process-XYrBbJ"',
              'mkdir -p "$fixture/inaccessible/mount"',
              'head -c 1048576 /dev/zero > "$TMPDIR/scratch"',
              'chmod 0 "$fixture/inaccessible"',
              'sleep 1',
              'chmod 700 "$fixture/inaccessible"',
            ].join('\n'),
          );
          const report: string[] = [];
          const code = await run(config, checkout, 'test-queued', [payload], report, {
            sampleIntervalMs: 100,
          });
          expect(code).toBe(0);
          const record = runRecord(root, onlyJob(config).id);
          // Proof: rethrowing EACCES below the tmp directory in `directoryUsage` made this
          // test record `telemetryFailure` `interval: tmp directory … unreadable: EACCES:
          // permission denied, scandir '…/inaccessible'`, as e15a97eb did (2026-11-19).
          expect(record.telemetryFailure).toBeNull();
          expect(incompleteness(record)).toBeNull();
          const partial = record.samples.filter((sample) => sample.tmpUnreadable.length > 0);
          expect(partial.length).toBeGreaterThan(0);
          for (const sample of partial) {
            expect(sample).toMatchObject({
              kind: 'interval',
              tmpUnreadable: ['wbs-shared-process-XYrBbJ/inaccessible'],
              tmpUnreadableOmitted: 0,
              failure: null,
            });
            expect(sample.tmpBytes).toBeGreaterThanOrEqual(1048576);
          }
          expect(dimensionStandings(record).tmpDiskGib).toEqual({
            kind: 'lower-bound',
            reason: `tmp lower bound only: ${String(partial.length)} samples saw unreadable subtrees (wbs-shared-process-XYrBbJ/inaccessible)`,
          });
          expect(report.some((line) => line.includes('telemetry failure'))).toBe(false);
        },
      );

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
            children: (cgroup) => seam.telemetry.children(cgroup),
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
            children: (cgroup) => seam.telemetry.children(cgroup),
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

  describe('settlement evidence names the run record (task 6.8, S6F-A1)', () => {
    const EVENT_TOOL = 'putApiResourceAuthoritiesByAuthorityIdEvents';
    /** What `watch` publishes for the pool's host jobs, each event acknowledged. */
    async function publishedReturns(config: string) {
      const tools = scriptedTools((call) => {
        if (call.name !== EVENT_TOOL)
          return { kind: 'answered', body: { requests: [], nextCursor: null } };
        const { sequence, useId, revision } = call.input as {
          sequence: number;
          useId: string;
          revision: number;
        };
        return { kind: 'answered', body: { acceptedSequence: sequence, useId, revision } };
      });
      await ledger(config).synchronize(tools);
      return tools.calls
        .filter((call) => call.name === EVENT_TOOL && call.input['kind'] === 'release_verified')
        .map((call) => call.input['evidence']);
    }

    test("a returned gate digests its run record's gate entry under the record's locator", async () => {
      const { config, checkout, base, root } = pool();
      const payload = payloadScript(join(base, 'gate.sh'), 'true');
      expect(
        await runHostJob(request(config, 'gate', [payload]), runDependencies(checkout, [])),
      ).toBe(0);
      const job = onlyJob(config);
      expect(job.state).toBe('released');
      const db = new Database(HostJobRunRecords.pathOf(root), { readonly: true });
      const start = db
        .query<{ start: string }, [string]>('SELECT start FROM runs WHERE job_id=?')
        .get(job.id)?.start;
      db.close();
      if (start === undefined) throw new Error('no run record written');
      expect(await publishedReturns(config)).toEqual([
        {
          digest: createHash('sha256').update(start).digest('hex'),
          locator: `dash-host-job-run://enrollment-one/${job.id}`,
          disposition: 'returned',
          reclaimedBytes: null,
        },
      ]);
    });

    test('a gate refused before it opened returns not_created, naming the absent record', async () => {
      const { config, checkout, base } = pool();
      const payload = payloadScript(join(base, 'payload.sh'), 'true');
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
      const job = onlyJob(config);
      const locator = `dash-host-job-run://enrollment-one/${job.id}`;
      expect(await publishedReturns(config)).toEqual([
        {
          digest: createHash('sha256').update(`${locator} absent`).digest('hex'),
          locator,
          disposition: 'not_created',
          reclaimedBytes: null,
        },
      ]);
    });
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
        children: (cgroup) => fake.telemetry.children(cgroup),
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
        children: (cgroup) => fake.telemetry.children(cgroup),
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
        children: (cgroup) => fake.telemetry.children(cgroup),
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

  describe('leftover scope processes over the fake seam (task 6.24, A-SCOPE-LEFTOVER-1)', () => {
    /** A payload that leaves `leftover`'s process holding `TMPDIR`, `prefix` run before it. */
    function leavingPayload(base: string, prefix: string, life = 300): string {
      const leftover = join(base, 'leftover');
      cleanups.push(() => {
        if (existsSync(leftover)) spawn('kill', ['-KILL', readFileSync(leftover, 'utf8').trim()]);
      });
      return payloadScript(
        join(base, 'leaves-a-server.sh'),
        [
          'cd "$TMPDIR"',
          `setsid sh -c '${prefix}echo $$ > ${leftover}; exec sleep ${String(life)}' &`,
          `while [ ! -s ${leftover} ]; do sleep 0.05; done`,
          'exit 0',
        ].join('\n'),
      );
    }

    /** A report that remembers when each line arrived, on the wall clock the ledger reads. */
    function timedReport(): { lines: string[]; at: number[]; report: (line: string) => void } {
      const lines: string[] = [];
      const at: number[] = [];
      return {
        lines,
        at,
        report: (line) => {
          lines.push(line);
          at.push(clock.read());
        },
      };
    }

    test("a leftover's grace is not the job's wall time (review of #954 S2-1)", async () => {
      const { config, checkout, base, root } = pool();
      const payload = leavingPayload(base, 'trap "" TERM; ');
      const bin = fakeBin('exec');
      const timed = timedReport();
      const code = await runHostJob(request(config, 'test-queued', [payload]), {
        ...runDependencies(checkout, [], {
          environment: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` },
          leftoverBudget: { termGraceMs: 2000, killWaitMs: 5000 },
        }),
        report: timed.report,
      });
      expect(code).toBe(0);
      const job = onlyJob(config);
      const record = runRecord(root, job.id);
      expect(record.leftoverProcesses).toMatchObject({ count: 1, endedWith: 'SIGKILL' });
      // Proof: reading the clock for `endedAt` after the leftover ending made `wallMs` 2092 against
      // the 2 s grace; recording the ledger's exit after it put the exit 2034 ms after the
      // leftover line (2026-11-19, review of #954 S2-1).
      expect(record.wallMs ?? Infinity).toBeLessThan(2000);
      const leftoverLine = timed.lines.findIndex((line) => line.includes('leftover processes in'));
      expect(leftoverLine).toBeGreaterThan(-1);
      expect(job.endedAt).toBeLessThanOrEqual(timed.at[leftoverLine] ?? -Infinity);
    }, 60000);

    test('a failed SIGTERM is recorded as signal-failed, nothing waited for (review of #954 S3-1)', async () => {
      const { config, checkout, base, root } = pool();
      const payload = leavingPayload(base, '');
      const bin = fakeBin('exec');
      fakeSystemctl(bin, 'fails');
      const timed = timedReport();
      expect(
        await runHostJob(request(config, 'test-queued', [payload]), {
          ...runDependencies(checkout, [], {
            environment: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` },
            leftoverBudget: { termGraceMs: 2000, killWaitMs: 5000 },
            settleBudgetMs: 1000,
          }),
          report: timed.report,
        }),
      ).toBe(0);
      const job = onlyJob(config);
      const scope = `dash-job-${job.id}.scope`;
      const failure =
        'SIGTERM: systemctl kill --signal=SIGTERM ' +
        scope +
        ': Failed to connect to bus: No medium found';
      expect(runRecord(root, job.id).leftoverProcesses).toMatchObject({
        count: 1,
        endedWith: 'signal-failed',
        failure,
      });
      const started = timed.lines.findIndex((line) =>
        line.endsWith('after its session ended; SIGTERM'),
      );
      const unsignalled = timed.lines.indexOf(
        `ops job: ${job.id} 1 leftover processes in ${scope} were not signalled: ${failure}; its tmp directory stays charged`,
      );
      expect(unsignalled).toBeGreaterThan(started);
      expect((timed.at[unsignalled] ?? Infinity) - (timed.at[started] ?? 0)).toBeLessThan(1000);
      expect(job.tmpDisk.state).toBe('blocked');
      expect(readFileSync(join(bin, 'systemctl.log'), 'utf8')).toBe(
        `--user kill --signal=SIGTERM ${scope}\n`,
      );
    }, 60000);

    test('a leftover that exits on its own after a failed SIGTERM is not labelled SIGTERM', async () => {
      const { config, checkout, base, root } = pool();
      const payload = leavingPayload(base, '', 1);
      const bin = fakeBin('exec');
      fakeSystemctl(bin, 'fails');
      expect(
        await runHostJob(
          request(config, 'test-queued', [payload]),
          runDependencies(checkout, [], {
            environment: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` },
            leftoverBudget: { termGraceMs: 3000, killWaitMs: 3000 },
          }),
        ),
      ).toBe(0);
      expect(runRecord(root, onlyJob(config).id).leftoverProcesses).toMatchObject({
        endedWith: 'signal-failed',
      });
    }, 60000);

    test('members that become unreadable during the wait are unverified, never ended', async () => {
      const { config, checkout, base, root } = pool();
      const payload = leavingPayload(base, '');
      const bin = fakeBin('exec');
      const log = join(bin, 'systemctl.log');
      // Unreadable from the scope kill on, as a cgroup.procs mode change would make it.
      const unreadable: ScopeTelemetry = {
        ...fake.telemetry,
        members: (cgroup) => {
          if (existsSync(log))
            throw Object.assign(
              new Error(`EACCES: permission denied, open '${cgroup}/cgroup.procs'`),
              {
                code: 'EACCES',
              },
            );
          return fake.telemetry.members(cgroup);
        },
      };
      expect(
        await runHostJob(
          request(config, 'test-queued', [payload]),
          runDependencies(checkout, [], {
            environment: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` },
            telemetry: unreadable,
            leftoverBudget: { termGraceMs: 2000, killWaitMs: 2000 },
            settleBudgetMs: 1000,
          }),
        ),
      ).toBe(0);
      const leftovers = runRecord(root, onlyJob(config).id).leftoverProcesses;
      expect(leftovers).toMatchObject({ count: 1, endedWith: 'unverified' });
      expect(leftovers !== undefined && 'failure' in leftovers ? leftovers.failure : '').toContain(
        'EACCES',
      );
    }, 60000);

    test('a leftover that ignores SIGTERM is SIGKILLed after the grace, recorded', async () => {
      const { config, checkout, base, root } = pool();
      const leftover = join(base, 'leftover');
      // An ignored signal stays ignored across `exec`, so `sleep` itself ignores SIGTERM.
      const payload = payloadScript(
        join(base, 'leaves-a-stubborn-server.sh'),
        [
          'cd "$TMPDIR"',
          `setsid sh -c 'trap "" TERM; echo $$ > ${leftover}; exec sleep 300' &`,
          `while [ ! -s ${leftover} ]; do sleep 0.05; done`,
          'exit 0',
        ].join('\n'),
      );
      cleanups.push(() => {
        if (existsSync(leftover)) spawn('kill', ['-KILL', readFileSync(leftover, 'utf8').trim()]);
      });
      const bin = fakeBin('exec');
      const report: string[] = [];
      const code = await runHostJob(
        request(config, 'test-queued', [payload]),
        runDependencies(checkout, report, {
          environment: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` },
          leftoverBudget: { termGraceMs: 500, killWaitMs: 5000 },
        }),
      );
      expect(code).toBe(0);
      const job = onlyJob(config);
      const scope = `dash-job-${job.id}.scope`;
      // Proof: dropping the SIGKILL after the grace in `endLeftovers` made this record
      // `endedWith: 'timeout'` against `SIGKILL` (2026-11-19, task 6.24).
      expect(runRecord(root, job.id).leftoverProcesses).toMatchObject({
        count: 1,
        endedWith: 'SIGKILL',
      });
      expect(job.state).toBe('released');
      expect(fake.telemetry.members(`/fake/${scope}`)).toEqual([]);
      expect(report).toContain(
        `ops job: ${job.id} leftovers in ${scope} outlived SIGTERM by 500 ms; SIGKILL`,
      );
      expect(readFileSync(join(bin, 'systemctl.log'), 'utf8')).toBe(
        `--user kill --signal=SIGTERM ${scope}\n--user kill --signal=SIGKILL ${scope}\n`,
      );
    }, 60000);

    test('a leftover that survives SIGKILL is a recorded timeout; tmp stays blocked', async () => {
      const { config, checkout, base, root } = pool();
      const leftover = join(base, 'leftover');
      const payload = payloadScript(
        join(base, 'leaves-a-server.sh'),
        [
          'cd "$TMPDIR"',
          `setsid sh -c 'echo $$ > ${leftover}; exec sleep 300' &`,
          `while [ ! -s ${leftover} ]; do sleep 0.05; done`,
          'exit 0',
        ].join('\n'),
      );
      cleanups.push(() => {
        if (existsSync(leftover)) spawn('kill', ['-KILL', readFileSync(leftover, 'utf8').trim()]);
      });
      // A user manager whose kill reaches nothing: every call is logged and answers 0.
      const bin = fakeBin('exec');
      payloadScript(
        join(bin, 'systemctl'),
        `printf '%s\\n' "$*" >> ${join(bin, 'systemctl.log')}\nexit 0`,
      );
      const report: string[] = [];
      const code = await runHostJob(
        request(config, 'test-queued', [payload]),
        runDependencies(checkout, report, {
          environment: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` },
          leftoverBudget: { termGraceMs: 200, killWaitMs: 300 },
          settleBudgetMs: 1000,
        }),
      );
      expect(code).toBe(0);
      const job = onlyJob(config);
      const scope = `dash-job-${job.id}.scope`;
      expect(runRecord(root, job.id).leftoverProcesses).toMatchObject({
        count: 1,
        endedWith: 'timeout',
      });
      expect(job.tmpDisk.state).toBe('blocked');
      expect(fake.telemetry.members(`/fake/${scope}`)).toEqual([
        Number(readFileSync(leftover, 'utf8').trim()),
      ]);
      expect(report).toContain(
        `ops job: ${job.id} ${scope} still has members 300 ms after SIGKILL; its tmp directory stays charged`,
      );
    }, 60000);

    test("a member of the payload's own session is never ended as a leftover", async () => {
      const { config, checkout, base, root } = pool();
      const survived = join(base, 'survived');
      // A plain background child stays in the payload's session: it is the job's own work.
      const payload = payloadScript(
        join(base, 'background.sh'),
        `(sleep 1; touch ${survived}) &\nexit 0`,
      );
      const bin = fakeBin('exec');
      const report: string[] = [];
      const code = await runHostJob(
        request(config, 'test-queued', [payload]),
        runDependencies(checkout, report, {
          environment: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` },
          leftoverBudget: { termGraceMs: 200, killWaitMs: 300 },
        }),
      );
      expect(code).toBe(0);
      const job = onlyJob(config);
      const scope = `dash-job-${job.id}.scope`;
      // Proof: skipping the session check in `endLeftovers` ended the background child:
      // `survived` absent (2026-11-19, task 6.24).
      expect(existsSync(survived)).toBe(true);
      expect(existsSync(join(bin, 'systemctl.log'))).toBe(false);
      expect(runRecord(root, job.id)).not.toHaveProperty('leftoverProcesses');
      expect(report).toContain(
        `ops job: ${job.id} leftovers in ${scope} not ended: the payload's session still has members; watch settles it`,
      );
      expect(job.state).toBe('released');
    }, 60000);
  });

  describe('a clamped entry runs under its heuristic, reserving the clamp (task 6.25, S25-A6)', () => {
    /** The fake `systemd-run`'s launch call (the one that is not the `true` probe) for `type`. */
    async function launchCall(
      type: string,
    ): Promise<{ call: string; report: string[]; root: string; id: string }> {
      const { config, checkout, base, root } = pool();
      const bin = fakeBin('exec');
      const payload = payloadScript(join(base, 'quick.sh'), 'exit 0');
      const report: string[] = [];
      const code = await runHostJob(
        request(config, type, [payload]),
        runDependencies(checkout, report, {
          environment: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` },
          sampleIntervalMs: 100,
        }),
      );
      expect(code).toBe(0);
      const calls = readFileSync(join(bin, 'calls'), 'utf8').trim().split('\n');
      const call = calls.find((line) => !line.endsWith(' -- true'));
      if (call === undefined) throw new Error(`no launch call in ${calls.join(' | ')}`);
      return { call, report, root, id: onlyJob(config).id };
    }

    test('a clamped entry sets MemoryHigh to its heuristic; an unclamped one to its envelope', async () => {
      const clamped = await launchCall('clamped');
      // Proof: `memoryBoundOf` returning the envelope made this find `MemoryHigh=2G`
      // (2026-11-20, S25-A6).
      expect(clamped.call).toContain('-p MemoryHigh=3G');
      expect(clamped.report).toContain(
        `ops job: ${clamped.id} MemoryHigh 3 GiB (heuristic; reservation clamped to 2 GiB)`,
      );
      expect(runRecord(clamped.root, clamped.id).memoryBoundGib).toBe(3);
      const plain = await launchCall('test-queued');
      expect(plain.call).toContain('-p MemoryHigh=1G');
      expect(plain.report).not.toContainEqual(expect.stringContaining('heuristic; reservation'));
      expect(runRecord(plain.root, plain.id).memoryBoundGib).toBe(1);
    }, 60000);

    test('a cap entry with memoryGib clamped to the pool is refused 64 before admission', async () => {
      const { config, checkout, base } = pool();
      const payload = payloadScript(join(base, 'quick.sh'), 'exit 0');
      const refused = await refusal(
        runHostJob(request(config, 'clamped-cap', [payload]), runDependencies(checkout, [])),
      );
      expect(refused.exitCode).toBe(64);
      expect(refused.message).toContain(
        'job type clamped-cap enforces cap with memoryGib clamped to the pool: MemoryMax 2G is below its calibrated p95 2.4 GiB and would kill every run',
      );
      expect(ledger(config).listHostJobs()).toEqual([]);
    });
  });

  describe('the runtime bound over the fake seam (task 6.11)', () => {
    /** The monotonic clock, two minutes ahead once `marker` exists: the payload has started. */
    const aheadOnceStarted = (marker: string) => ({
      now: () => monotonic.now() + (existsSync(marker) ? 120_000 : 0),
    });

    test('a job past its maxRuntimeMinutes is ended with 124, the reason recorded', async () => {
      const { config, checkout, base, root } = pool();
      const marker = join(base, 'started');
      const payload = payloadScript(join(base, 'long.sh'), `touch ${marker}\nsleep 20\nexit 0`);
      const report: string[] = [];
      const started = monotonic.now();
      const code = await runHostJob(
        request(config, 'bounded', [payload]),
        runDependencies(checkout, report, {
          monotonic: aheadOnceStarted(marker),
          sampleIntervalMs: 100,
        }),
      );
      // Proof: dropping the bound check in `runAdmitted` made this return 0 after the payload's
      // full 20 s (2026-11-12).
      expect(code).toBe(124);
      expect(monotonic.now() - started).toBeLessThan(15_000);
      const job = onlyJob(config);
      expect(job.exitCode).toBe(124);
      expect(job.state).toBe('released');
      expect(runRecord(root, job.id)).toMatchObject({
        exitCode: 124,
        signal: 'SIGTERM',
        endedByLauncher: 'exceeded maxRuntimeMinutes 1: ended by the launcher',
        telemetryFailure: null,
      });
      expect(report).toContain(
        `ops job: ${job.id} exceeded maxRuntimeMinutes 1: ended by the launcher`,
      );
    }, 60000);

    test('a payload that ignores SIGTERM is killed after the settle budget', async () => {
      const { config, checkout, base, root } = pool();
      const marker = join(base, 'started');
      const payload = payloadScript(
        join(base, 'stubborn.sh'),
        `trap '' TERM\ntouch ${marker}\nsleep 20\nexit 0`,
      );
      const report: string[] = [];
      const started = monotonic.now();
      const code = await runHostJob(
        request(config, 'bounded', [payload]),
        runDependencies(checkout, report, {
          monotonic: aheadOnceStarted(marker),
          sampleIntervalMs: 100,
          settleBudgetMs: 1000,
        }),
      );
      // Proof: dropping the SIGKILL in `endPayload` made the elapsed check fail at 21.1 s, the
      // payload's full 20 s (2026-11-12).
      expect(code).toBe(124);
      expect(monotonic.now() - started).toBeLessThan(15_000);
      const record = runRecord(root, onlyJob(config).id);
      expect(record).toMatchObject({
        exitCode: 124,
        signal: 'SIGKILL',
        endedByLauncher: 'exceeded maxRuntimeMinutes 1: ended by the launcher',
      });
      expect(
        report.some((line) =>
          line.endsWith(
            `outlived SIGTERM by 1000 ms; SIGKILL to every process of dash-job-${record.jobId}.scope`,
          ),
        ),
      ).toBe(true);
    }, 60000);

    test("a setsid'd descendant that ignores SIGTERM ends with the scope at the bound", async () => {
      const { config, checkout, base, root } = pool();
      const marker = join(base, 'started');
      const childPid = join(base, 'child');
      // The descendant leaves the payload's session and process group, as the nx daemon does.
      const payload = payloadScript(
        join(base, 'daemonizing.sh'),
        [
          "trap '' TERM",
          `setsid sh -c 'echo $$ > ${childPid}; exec sleep 30' &`,
          `while [ ! -s ${childPid} ]; do sleep 0.05; done`,
          `touch ${marker}`,
          'sleep 20',
          'exit 0',
        ].join('\n'),
      );
      cleanups.push(() => {
        if (existsSync(childPid)) spawn('kill', ['-KILL', readFileSync(childPid, 'utf8').trim()]);
      });
      const bin = fakeBin('exec');
      const report: string[] = [];
      const code = await runHostJob(
        request(config, 'bounded', [payload]),
        runDependencies(checkout, report, {
          environment: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` },
          monotonic: aheadOnceStarted(marker),
          sampleIntervalMs: 100,
          settleBudgetMs: 1000,
        }),
      );
      const job = onlyJob(config);
      const scope = `dash-job-${job.id}.scope`;
      // Proof: restoring `killSession(pid, 'SIGKILL')` in place of the scope kill in `endPayload`
      // left the descendant alive: `members` received its one pid against `[]` (2026-11-18).
      expect(fake.telemetry.members(`/fake/${scope}`)).toEqual([]);
      expect(code).toBe(124);
      expect(runRecord(root, job.id)).toMatchObject({
        exitCode: 124,
        endedByLauncher: 'exceeded maxRuntimeMinutes 1: ended by the launcher',
      });
      // The lift comes first, so the trap and handlers run unthrottled; the scope kill last.
      expect(readFileSync(join(bin, 'systemctl.log'), 'utf8')).toBe(
        `--user set-property --runtime ${scope} MemoryHigh=infinity\n--user kill --signal=SIGKILL ${scope}\n`,
      );
    }, 60000);

    test("a setsid'd descendant outlives a payload that honours SIGTERM, not the bound", async () => {
      const { config, checkout, base, root } = pool();
      const marker = join(base, 'started');
      const childPid = join(base, 'child');
      // The payload ends on SIGTERM inside the settle budget; only its descendant ignores it.
      const payload = payloadScript(
        join(base, 'honouring.sh'),
        [
          `setsid sh -c 'trap "" TERM; echo $$ > ${childPid}; exec sleep 30' &`,
          `while [ ! -s ${childPid} ]; do sleep 0.05; done`,
          `touch ${marker}`,
          'sleep 20',
          'exit 0',
        ].join('\n'),
      );
      cleanups.push(() => {
        if (existsSync(childPid)) spawn('kill', ['-KILL', readFileSync(childPid, 'utf8').trim()]);
      });
      const bin = fakeBin('exec');
      const report: string[] = [];
      const code = await runHostJob(
        request(config, 'bounded', [payload]),
        runDependencies(checkout, report, {
          environment: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` },
          monotonic: aheadOnceStarted(marker),
          sampleIntervalMs: 100,
          settleBudgetMs: 5000,
        }),
      );
      const job = onlyJob(config);
      const scope = `dash-job-${job.id}.scope`;
      // Proof: dropping the SIGKILL after the leader's exit (`endLeftovers`, job-run.ts) left the
      // descendant alive: `members` received `[90]` against `[]` (2026-11-18, review of #942
      // S2-1; `[1797]` again on 2026-11-19, task 6.24).
      expect(fake.telemetry.members(`/fake/${scope}`)).toEqual([]);
      expect(code).toBe(124);
      expect(runRecord(root, job.id)).toMatchObject({ exitCode: 124, signal: 'SIGTERM' });
      expect(report).toContain(`ops job: 1 processes left in ${scope} after its leader; SIGKILL`);
      expect(readFileSync(join(bin, 'systemctl.log'), 'utf8')).toBe(
        `--user set-property --runtime ${scope} MemoryHigh=infinity\n--user kill --signal=SIGKILL ${scope}\n`,
      );
    }, 60000);

    test('a host without systemctl still ends the job at the bound, reported', async () => {
      const { config, checkout, base, root } = pool();
      const marker = join(base, 'started');
      const payload = payloadScript(
        join(base, 'stubborn.sh'),
        `trap '' TERM\ntouch ${marker}\nsleep 20\nexit 0`,
      );
      const bin = fakeBin('exec');
      rmSync(join(bin, 'systemctl'));
      // Every tool on this host's PATH but systemctl, each name linked once from the first PATH
      // entry that has it, as a lookup would resolve it. A name in two entries (the CI runner's
      // `now`), a dangling link or a non-executable entry is skipped, never linked twice.
      const tools = join(base, 'tools-without-systemctl');
      mkdirSync(tools);
      const linked = new Set<string>(['systemctl']);
      for (const directory of (process.env['PATH'] ?? '').split(':')) {
        if (directory === '' || !existsSync(directory)) continue;
        for (const name of readdirSync(directory)) {
          if (linked.has(name)) continue;
          const path = join(directory, name);
          try {
            if (!statSync(path).isFile()) continue;
            accessSync(path, constants.X_OK);
          } catch {
            // A dangling link or a tool this account cannot run is no tool for the payload.
            continue;
          }
          linked.add(name);
          symlinkSync(path, join(tools, name));
        }
      }
      const report: string[] = [];
      const started = monotonic.now();
      const code = await runHostJob(
        request(config, 'bounded', [payload]),
        runDependencies(checkout, report, {
          environment: { ...process.env, PATH: `${bin}:${tools}` },
          monotonic: aheadOnceStarted(marker),
          sampleIntervalMs: 100,
          settleBudgetMs: 1000,
        }),
      );
      // Proof: dropping the `not on PATH` answer in `systemctlFailure` made the lift throw before
      // the SIGTERM, and the payload ran its full 20 s: 21119 ms against `< 15000`
      // (2026-11-18, review of #942 S3-1).
      expect(monotonic.now() - started).toBeLessThan(15_000);
      expect(code).toBe(124);
      const job = onlyJob(config);
      const scope = `dash-job-${job.id}.scope`;
      expect(job.state).toBe('released');
      expect(runRecord(root, job.id)).toMatchObject({ exitCode: 124, signal: 'SIGKILL' });
      expect(report).toContain(
        `ops job: lifting MemoryHigh of ${scope} failed: systemctl is not on PATH; SIGTERM regardless`,
      );
      expect(
        report.some((line) =>
          line.startsWith(
            `ops job: SIGKILL to ${scope} failed: systemctl is not on PATH; SIGKILL to session `,
          ),
        ),
      ).toBe(true);
    }, 60000);

    test('a failed scope kill is reported and the session SIGKILLed instead', async () => {
      const { config, checkout, base, root } = pool();
      const marker = join(base, 'started');
      const payload = payloadScript(
        join(base, 'stubborn.sh'),
        `trap '' TERM\ntouch ${marker}\nsleep 20\nexit 0`,
      );
      const refusing = fakeSystemctl(join(base, 'refusing-bin'), 'fails');
      const report: string[] = [];
      const started = monotonic.now();
      const code = await runHostJob(
        request(config, 'bounded', [payload]),
        runDependencies(checkout, report, {
          environment: {
            ...fake.environment,
            PATH: `${refusing}:${fake.environment['PATH'] ?? ''}`,
          },
          monotonic: aheadOnceStarted(marker),
          sampleIntervalMs: 100,
          settleBudgetMs: 1000,
        }),
      );
      // Proof: dropping the fallback `killSession(pid, 'SIGKILL')` in `endPayload` made the payload
      // run its full 20 s: the elapsed check failed (2026-11-18).
      expect(monotonic.now() - started).toBeLessThan(15_000);
      expect(code).toBe(124);
      const job = onlyJob(config);
      const scope = `dash-job-${job.id}.scope`;
      expect(job.state).toBe('released');
      expect(runRecord(root, job.id)).toMatchObject({ exitCode: 124, signal: 'SIGKILL' });
      const diagnostic = 'Failed to connect to bus: No medium found';
      expect(report).toContain(
        `ops job: lifting MemoryHigh of ${scope} failed: systemctl set-property --runtime ${scope} MemoryHigh=infinity: ${diagnostic}; SIGTERM regardless`,
      );
      expect(
        report.some((line) =>
          line.startsWith(
            `ops job: SIGKILL to ${scope} failed: systemctl kill --signal=SIGKILL ${scope}: ${diagnostic}; SIGKILL to session `,
          ),
        ),
      ).toBe(true);
    }, 60000);

    test('a failed kill at the runtime bound still records 124 and settles', async () => {
      const { config, checkout, base, root } = pool();
      const marker = join(base, 'started');
      const payload = payloadScript(join(base, 'unkillable.sh'), `touch ${marker}\nsleep 2`);
      const kill = process.kill.bind(process);
      const refusing = spyOn(process, 'kill').mockImplementation((pid, signal) => {
        if (pid < 0 && signal === 'SIGTERM')
          throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
        return kill(pid, signal);
      });
      const report: string[] = [];
      try {
        expect(
          await runHostJob(
            request(config, 'bounded', [payload]),
            runDependencies(checkout, report, {
              monotonic: aheadOnceStarted(marker),
              sampleIntervalMs: 100,
            }),
          ),
        ).toBe(124);
      } finally {
        refusing.mockRestore();
      }
      const job = onlyJob(config);
      expect(job.exitCode).toBe(124);
      expect(job.state).toBe('released');
      expect(runRecord(root, job.id)).toMatchObject({
        exitCode: 124,
        signal: null,
        endedByLauncher: 'exceeded maxRuntimeMinutes 1: ended by the launcher',
      });
      expect(report).toContain(
        `ops job: ending dash-job-${job.id} at its runtime bound failed: kill EPERM`,
      );
    }, 60000);

    test('a type without maxRuntimeMinutes runs as long as its payload', async () => {
      const { config, checkout, base, root } = pool();
      const marker = join(base, 'started');
      const payload = payloadScript(join(base, 'short.sh'), `touch ${marker}\nsleep 0.5`);
      const code = await runHostJob(
        request(config, 'test-queued', [payload]),
        runDependencies(checkout, [], {
          monotonic: aheadOnceStarted(marker),
          sampleIntervalMs: 100,
        }),
      );
      expect(code).toBe(0);
      const record = runRecord(root, onlyJob(config).id);
      expect(record.exitCode).toBe(0);
      expect(record.endedByLauncher).toBeUndefined();
    }, 60000);
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
        // The installed entrypoint takes the production shell lock in observe mode, the host's
        // canonical path, which this test must not touch: the pool runs concurrent and unguarded.
        const runtime = ledger(config);
        runtime.beginModeSwitch('concurrent', 'test');
        runtime.completeModeSwitch('concurrent', 'test', 'puni1', []);
        runtime.releaseGuard('test', 'puni1', []);
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
          record.containers.some(
            (verdict) => verdict.verdict !== 'bounded' && verdict.verdict !== 'host-service',
          ),
        );
        expect(job.compute.state).toBe('released');
      },
      90000,
    );

    test.skipIf(!ready)(
      'a labelled, bounded host-service container beside the job keeps attribution complete (task 6.22)',
      async () => {
        const { code, record } = await runBoxed(
          [
            `docker run --rm --label puni.job="$DASH_JOB_ID" --memory 256m --cpus 1 ${CONTAINER_IMAGE} sleep 1`,
            `docker run --rm --label puni.host-service=dash-test-service --memory 64m --cpus 0.5 ${CONTAINER_IMAGE} sleep 1`,
          ].join('\n'),
        );
        expect(code).toBe(0);
        const mine = record.containers.filter((verdict) => verdict.verdict !== 'unlabelled');
        expect(mine.map((verdict) => verdict.verdict)).toEqual(['bounded', 'host-service']);
        expect(mine[1]).toMatchObject({
          hostService: { name: 'dash-test-service', memoryBytes: 64 * 1024 ** 2, cpuCores: 0.5 },
        });
        expect(record.attributionIncomplete).toBe(
          record.containers.some((verdict) => verdict.verdict === 'unlabelled'),
        );
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
