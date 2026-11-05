import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';

import { parseDashRequest } from '../cli-parser';
import { monotonicClock, wallClock } from '../clock';
import { fakeCredential } from '../compute/testing/credential';
import { WbsUnreachable } from '../mcp/wbs-tools';
import { runResources } from '../resources/command';

/** `resources <argv>` as the parser hands it to `runResources`. */
const resourcesCommand = (argv: readonly string[]) =>
  parseDashRequest('resources', ['resources', ...argv]);
import {
  ampleHost,
  fixtureGit,
  gateTree,
  hostPoolFixture,
  jobType,
} from '../resources/host-pool.test.fixture';
import {
  guardHoldFile,
  holdLegacyLock,
  jobHoldFile,
  readLegacyQueue,
} from '../resources/legacy-lock';
import {
  eventually,
  intervalsOf,
  overlaps,
  privateLegacyLock,
  startLegacyCaller,
} from '../resources/legacy-lock.test.fixture';
import {
  GUARD_LABEL,
  type HostJobAdmission,
  HostPoolModeRefusal,
  loadResourceConfiguration,
  ResourceRuntime,
} from '../resources/runtime';
import { SingletonGuard } from '../resources/singleton-guard';
import { type OpsDependencies, opsHandlers, runOps } from './commands';
import { endLegacyHold, type JobRunDependencies, runHostJob } from './job-run';
import {
  catalogueCheckout,
  fakeScopeTelemetry,
  fakeSystemdRun,
  insideOpsNamespace,
  payloadScript,
} from './ops.test.fixture';
import { OpsRefusal } from './refusal';
import { linuxScopeTelemetry } from './scope';
import { switchHoldFile, verifyEligibleTypes } from './switch-mode';

/**
 * `dash-host-jobs` J12 and J13, slice 6b: observe mode runs every host job under the real shell
 * lock's queue; `ops pool switch-mode` is a fenced change; concurrent mode admits only under the
 * `watch` singleton's guard and overlaps only eligible types. Every job here is a real
 * `ops job run` over the fake scope seam against the repository's own `bin/heavy-lock-lib.sh`
 * on a private lock path, and every legacy caller is a real `with_heavy_lock`.
 */
if (insideOpsNamespace(import.meta.path)) {
  const clock = wallClock();
  const monotonic = monotonicClock();
  const cleanups: (() => void)[] = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const silent = (): void => undefined;

  /**
   * A pool of 8 cores and 13 GiB, initialized, whose launcher checkout carries a catalogue of
   * `eligible` (1 core, 1 GiB), `other` (likewise, not eligible) and a fake `run_heavy_job` shim.
   */
  function pool(options: { eligible?: string[]; launcher?: boolean } = {}) {
    const fixture = hostPoolFixture({
      cpuCores: 8,
      memoryGib: 15,
      headroom: { cpuCores: 0, memoryGib: 2 },
      gateTrees: 0,
      credential: fakeCredential(),
    });
    cleanups.push(fixture.remove);
    const checkout = join(fixture.base, 'checkout');
    mkdirSync(join(checkout, 'bin'), { recursive: true });
    writeFileSync(join(checkout, 'bin', 'heavy-lock-lib.sh'), 'run_heavy_job() {\n  :\n}\n');
    catalogueCheckout(checkout, [
      { id: 'eligible', cpuCores: 1, memoryGib: 1 },
      { id: 'other', cpuCores: 1, memoryGib: 1 },
    ]);
    // Every catalogued entrypoint is `bin/payload.sh`: a launcher that enters through the shim.
    writeFileSync(join(checkout, 'bin', 'payload.sh'), '#!/bin/sh\nrun_heavy_job -- true\n');
    fixtureGit(checkout, 'commit', '--quiet', '-am', 'launcher through the shim');
    const configuration = JSON.parse(readFileSync(fixture.config, 'utf8')) as Record<
      string,
      unknown
    >;
    writeFileSync(
      fixture.config,
      JSON.stringify({
        ...configuration,
        ...(options.launcher === false ? {} : { launcherCheckouts: [checkout] }),
        concurrencyEligible: options.eligible ?? ['eligible'],
      }),
      { mode: 0o600 },
    );
    const out: string[] = [];
    const code = opsHandlers['pool init'](
      { command: 'ops', words: 'pool init', config: fixture.config },
      opsDependencies(checkout, out, out),
    );
    if (code !== 0) throw new Error(out.join(''));
    const lock = privateLegacyLock(fixture.base);
    const log = join(fixture.base, 'log');
    const bin = fakeSystemdRun(join(fixture.base, 'fake-bin'), 'exec');
    const payload = payloadScript(
      join(fixture.base, 'payload.sh'),
      'echo "start $MODE_NAME $(date +%s%3N)" >> "$MODE_LOG"; sleep "$MODE_SECONDS"; echo "end $MODE_NAME $(date +%s%3N)" >> "$MODE_LOG"',
    );
    return { ...fixture, checkout, lock, log, bin, payload };
  }
  type Pool = ReturnType<typeof pool>;

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
    };
  }

  function runtimeOf(fixture: Pool, read: () => number = () => clock.read()): ResourceRuntime {
    const runtime = ResourceRuntime.open(loadResourceConfiguration(fixture.config), { read });
    cleanups.unshift(() => {
      runtime.close();
    });
    return runtime;
  }

  /** `ops job run --type <type>` of the payload, named `name`, sleeping `seconds`. */
  function run(
    fixture: Pool,
    type: string,
    name: string,
    options: {
      seconds: number;
      waitSeconds: number;
      report?: string[];
      settleBudgetMs?: number;
      payload?: string;
    },
  ): Promise<number> {
    const deps: JobRunDependencies = {
      clock,
      monotonic,
      environment: {
        ...process.env,
        PATH: `${fixture.bin}:${process.env['PATH'] ?? ''}`,
        MODE_LOG: fixture.log,
        MODE_NAME: name,
        MODE_SECONDS: String(options.seconds),
      },
      cwd: fixture.checkout,
      report: (line) => options.report?.push(line),
      telemetry: fakeScopeTelemetry(join(fixture.base, 'cgroupfs')),
      host: ampleHost,
      sampleIntervalMs: 10_000,
      settleBudgetMs: options.settleBudgetMs ?? 20_000,
      user: 'puni1',
      legacyLock: fixture.lock,
    };
    return runHostJob(
      {
        config: fixture.config,
        type,
        label: `lane:${name}`,
        waitSeconds: options.waitSeconds,
        pollSeconds: 1,
        argv: [options.payload ?? fixture.payload],
      },
      deps,
    );
  }

  async function refusalOf(promise: Promise<unknown>): Promise<OpsRefusal> {
    try {
      await promise;
    } catch (cause) {
      if (cause instanceof OpsRefusal) return cause;
      throw cause;
    }
    throw new Error('expected a refusal');
  }

  /** `ops pool switch-mode`, its exit code and both streams. */
  async function switchMode(
    fixture: Pool,
    target: 'observe' | 'concurrent',
    flags: {
      waitSeconds?: number;
      releaseGuard?: boolean;
      allowEmpty?: boolean;
      environment?: Readonly<Record<string, string | undefined>>;
    } = {},
  ) {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const deps = opsDependencies(fixture.checkout, stdout, stderr);
    const code = await runOps(
      {
        command: 'ops',
        words: 'pool switch-mode',
        config: fixture.config,
        target,
        operator: 'dany',
        waitSeconds: flags.waitSeconds ?? 10,
        pollSeconds: 1,
        releaseGuard: flags.releaseGuard ?? false,
        allowEmpty: flags.allowEmpty ?? false,
      },
      flags.environment === undefined ? deps : { ...deps, environment: flags.environment },
    );
    return { code, stdout: stdout.join(''), stderr: stderr.join('') };
  }

  /** The `watch` singleton's guard, ticking every 200 ms until the test ends. */
  function watchGuard(fixture: Pool): void {
    const guard = new SingletonGuard(runtimeOf(fixture), () => fixture.lock, process.env, silent);
    const timer = setInterval(() => {
      guard.tick();
    }, 200);
    cleanups.unshift(() => {
      clearInterval(timer);
      guard.stop();
      // A guard still held keeps a holder alive; its hold file goes with the fixture.
    });
  }

  async function concurrentPool(options: { eligible?: string[] } = {}): Promise<Pool> {
    const fixture = pool(options);
    const switched = await switchMode(fixture, 'concurrent', { allowEmpty: true });
    if (switched.code !== 0) throw new Error(switched.stderr);
    return fixture;
  }

  /** A held `dash-singleton` hold recorded as the guard, as `watch` would leave it. */
  async function heldGuardFor(fixture: Pool, runtime: ResourceRuntime) {
    const held = await holdLegacyLock(
      fixture.lock,
      {
        holdFile: guardHoldFile(fixture.root),
        label: GUARD_LABEL,
        waitSeconds: 0,
        pollSeconds: 1,
        signal: new AbortController().signal,
        report: silent,
      },
      process.env,
    );
    if (held.kind !== 'held') throw new Error(held.kind);
    expect(runtime.recordGuardHolder(held.hold.pid, fixture.lock.lockPath)).toBe(true);
    cleanups.push(() => {
      held.hold.release();
    });
    return held.hold;
  }

  describe('observe mode: one order with the shell lock (J12)', () => {
    test('a legacy caller arriving during a Dash job queues behind it; status names the job first', async () => {
      const fixture = pool();
      const job = run(fixture, 'eligible', 'dash', { seconds: 2, waitSeconds: 30 });
      await eventually('the Dash payload', () => intervalsOf(fixture.log).has('dash'));
      const status: string[] = [];
      expect(
        await runOps(
          { command: 'ops', words: 'job status', config: fixture.config },
          opsDependencies(fixture.checkout, status, status),
        ),
      ).toBe(0);
      const lines = status.join('').split('\n');
      const holder = lines.find((line) => line.startsWith('heavy lock: holder'));
      expect(holder).toMatch(/^heavy lock: holder pid \d+ label dash-job-[0-9a-f-]+ lane:dash$/);
      const jobId = /dash-job-([0-9a-f-]+) /.exec(holder ?? '')?.[1] ?? '';
      expect(lines).toContain(
        `note: the shell lock is held for Dash through ${fixture.root}/.dash/legacy-holds/${jobId}; it ends when that file goes: the launcher removes it at settlement, resources watch once the work settles, or run resources sweep`,
      );
      expect(lines.at(1)).toStartWith('running eligible lane:dash pid ');
      const legacy = startLegacyCaller(fixture.lock, 'legacy', fixture.log, {
        waitSeconds: 30,
        seconds: 0,
      });
      expect(await job).toBe(0);
      expect(await legacy.exited).toBe(0);
      const spans = intervalsOf(fixture.log);
      const dash = spans.get('dash');
      const late = spans.get('legacy');
      if (dash === undefined || late === undefined) throw new Error('both ran');
      expect(overlaps(dash, late)).toBe(false);
      expect(late.start).toBeGreaterThanOrEqual(dash.end ?? Number.POSITIVE_INFINITY);
      expect(readLegacyQueue(fixture.lock).holder).toEqual({ kind: 'none' });
      expect(
        existsSync(jobHoldFile(fixture.root, runtimeOf(fixture).listHostJobs()[0]?.id ?? '')),
      ).toBe(false);
    });

    test('a Dash job never overlaps a legacy holder, and two Dash jobs serialise', async () => {
      const fixture = pool();
      const legacy = startLegacyCaller(fixture.lock, 'legacy', fixture.log, {
        waitSeconds: 0,
        seconds: 2,
      });
      await eventually('the legacy holder', () => intervalsOf(fixture.log).has('legacy'));
      const first = run(fixture, 'eligible', 'first', { seconds: 1, waitSeconds: 30 });
      const second = run(fixture, 'eligible', 'second', { seconds: 1, waitSeconds: 30 });
      expect(await legacy.exited).toBe(0);
      expect(await first).toBe(0);
      expect(await second).toBe(0);
      const spans = [...intervalsOf(fixture.log).values()];
      expect(spans).toHaveLength(3);
      for (const [index, left] of spans.entries())
        for (const right of spans.slice(index + 1)) expect(overlaps(left, right)).toBe(false);
    });

    test('a legacy deadline withdraws the Dash job: 75, nothing reserved, no ticket left', async () => {
      const fixture = pool();
      const legacy = startLegacyCaller(fixture.lock, 'legacy', fixture.log, {
        waitSeconds: 0,
        seconds: 4,
      });
      await eventually('the legacy holder', () => intervalsOf(fixture.log).has('legacy'));
      const refused = await refusalOf(
        run(fixture, 'eligible', 'late', { seconds: 0, waitSeconds: 1 }),
      );
      expect(refused.exitCode).toBe(75);
      expect(refused.message).toContain('the shell lock gave no turn within the 1s left');
      expect(refused.message).toContain('its reservation is withdrawn');
      const runtime = runtimeOf(fixture);
      const job = runtime.listHostJobs().at(0);
      if (job === undefined) throw new Error('no host job recorded');
      expect(job.state).toBe('released');
      expect(job.launchFailure).toContain('payload did not run');
      expect(runtime.hostPoolStatus().reserved).toEqual({
        cpuCores: 0,
        memoryGib: 0,
        diskUnits: 0,
        workspaceSlots: 0,
      });
      expect(readLegacyQueue(fixture.lock).waiters).toEqual([]);
      expect(intervalsOf(fixture.log).has('late')).toBe(false);
      await legacy.exited;
    });

    test('a surviving child keeps the shell lock until its compute settles, then watch lets go', async () => {
      const fixture = pool();
      const leaver = payloadScript(join(fixture.base, 'leaver.sh'), 'sleep 3 &\nexit 0');
      const report: string[] = [];
      expect(
        await run(fixture, 'eligible', 'leaver', {
          seconds: 0,
          waitSeconds: 0,
          report,
          settleBudgetMs: 300,
          payload: leaver,
        }),
      ).toBe(0);
      expect(
        report.some((line) =>
          line.endsWith('keeps the shell lock until its compute settles; watch releases it'),
        ),
      ).toBe(true);
      expect(readLegacyQueue(fixture.lock).holder.kind).toBe('held');
      const early = startLegacyCaller(fixture.lock, 'early', fixture.log, {
        waitSeconds: 0,
        seconds: 0,
      });
      expect(await early.exited).toBe(75);
      const runtime = runtimeOf(fixture);
      const guard = new SingletonGuard(runtime, () => fixture.lock, process.env, silent);
      const job = runtime.listHostJobs().at(0);
      if (job === undefined) throw new Error('no host job recorded');
      await eventually(
        'the surviving child to end and the job to settle',
        () => {
          runtime.settleHostJob(job.id, { containersGone: () => true });
          guard.tick();
          return readLegacyQueue(fixture.lock).holder.kind === 'none';
        },
        20_000,
      );
      expect(runtime.inspectHostJob(job.id).compute.state).toBe('released');
    });

    test('a withdrawal of a prepared job is refused', () => {
      const fixture = pool();
      const runtime = runtimeOf(fixture);
      const queued = runtime.enqueueHostJob(
        { descriptor: jobType('eligible', 1, 1), label: 'lane:x', waitSeconds: 0 },
        process.pid,
      );
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      const admitted = runtime.pollHostJob(queued.ticket, silent);
      if (admitted.kind !== 'admitted') throw new Error(admitted.kind);
      runtime.prepareHostJob(admitted.job.id);
      expect(() => runtime.withdrawUnlaunchedHostJob(admitted.job.id, 'test')).toThrow(
        'is not an unprepared admission',
      );
    });

    test('watch ends an orphaned observe-mode hold once the job settles, and a dead switch-mode hold', async () => {
      const fixture = pool();
      const runtime = runtimeOf(fixture);
      const queued = runtime.enqueueHostJob(
        { descriptor: jobType('eligible', 1, 1), label: 'lane:orphan', waitSeconds: 0 },
        process.pid,
      );
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      const admitted = runtime.pollHostJob(queued.ticket, silent);
      if (admitted.kind !== 'admitted') throw new Error(admitted.kind);
      const never = new AbortController().signal;
      const held = await holdLegacyLock(
        fixture.lock,
        {
          holdFile: jobHoldFile(fixture.root, admitted.job.id),
          label: `dash-job-${admitted.job.id}`,
          waitSeconds: 0,
          pollSeconds: 1,
          signal: never,
          report: silent,
        },
        process.env,
      );
      if (held.kind !== 'held') throw new Error(held.kind);
      const guard = new SingletonGuard(runtime, () => fixture.lock, process.env, silent);
      guard.tick();
      expect(existsSync(jobHoldFile(fixture.root, admitted.job.id))).toBe(true);
      runtime.withdrawUnlaunchedHostJob(admitted.job.id, 'test');
      guard.tick();
      expect(await held.hold.exited).toBe(0);
      const switchHold = await holdLegacyLock(
        fixture.lock,
        {
          holdFile: switchHoldFile(fixture.root),
          label: 'dash-switch-mode',
          waitSeconds: 0,
          pollSeconds: 1,
          signal: never,
          report: silent,
        },
        process.env,
      );
      if (switchHold.kind !== 'held') throw new Error(switchHold.kind);
      guard.tick();
      expect(await switchHold.hold.exited).toBe(0);
      expect(readLegacyQueue(fixture.lock).holder).toEqual({ kind: 'none' });
    });
  });

  describe('ops pool switch-mode (J12)', () => {
    test('switches to concurrent with a record, guard on, intake reopened', async () => {
      const fixture = pool();
      const switched = await switchMode(fixture, 'concurrent');
      expect(switched.code).toBe(0);
      const record = JSON.parse(switched.stdout) as Record<string, unknown>;
      expect(record).toMatchObject({
        sequence: 1,
        operator: 'dany',
        account: 'puni1',
        action: 'switch',
        from: 'observe',
        to: 'concurrent',
      });
      const evidence = record['evidence'] as string[];
      expect(evidence[0]).toMatch(
        new RegExp(`^launcher ${fixture.checkout} at [0-9a-f]{40} carries run_heavy_job$`),
      );
      expect(evidence).toContain('concurrency-eligible: eligible');
      const transition = runtimeOf(fixture).hostPoolTransition();
      expect(transition).toMatchObject({ mode: 'concurrent', guard: 'on', guardHolder: null });
      expect(transition.switching).toBeNull();
      expect(readLegacyQueue(fixture.lock).holder).toEqual({ kind: 'none' });
      expect((await switchMode(fixture, 'concurrent')).code).toBe(64);
    });

    test('switch-mode concurrent refuses while a host job is admitted, and reopens intake', async () => {
      const fixture = pool();
      const runtime = runtimeOf(fixture);
      // Admitted by the pool alone, not yet on the shell lock: the drain of the lock cannot see it.
      const queued = runtime.enqueueHostJob(
        { descriptor: jobType('eligible', 1, 1), label: 'lane:admitted', waitSeconds: 0 },
        process.pid,
      );
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      const admitted = runtime.pollHostJob(queued.ticket, silent);
      if (admitted.kind !== 'admitted') throw new Error(admitted.kind);
      const refused = await switchMode(fixture, 'concurrent', { waitSeconds: 1 });
      expect(refused.code).toBe(75);
      expect(refused.stderr).toContain(
        'did not drain of host jobs within 1s: lane:admitted (starting, compute held)',
      );
      // The flip's own check, the last line of defence under the fence (method level).
      runtime.beginModeSwitch('concurrent', 'dany');
      expect(() => runtime.completeModeSwitch('concurrent', 'dany', 'puni1', [])).toThrow(
        'is not drained of host jobs: lane:admitted (starting',
      );
      runtime.abandonModeSwitch();
      expect(runtime.hostPoolTransition()).toMatchObject({ mode: 'observe', switching: null });
      runtime.withdrawUnlaunchedHostJob(admitted.job.id, 'test');
      expect((await switchMode(fixture, 'concurrent')).code).toBe(0);
    });

    test('refuses a configuration naming no launcher checkout', async () => {
      const fixture = pool({ launcher: false, eligible: [] });
      const refused = await switchMode(fixture, 'concurrent', { allowEmpty: true });
      expect(refused.code).toBe(64);
      expect(refused.stderr).toContain('names no launcherCheckouts');
    });

    test('refuses a launcher checkout without the shim, or whose working library differs from HEAD', async () => {
      const fixture = pool();
      const library = join(fixture.checkout, 'bin', 'heavy-lock-lib.sh');
      writeFileSync(library, 'with_heavy_lock() {\n  :\n}\n');
      let refused = await switchMode(fixture, 'concurrent');
      expect(refused.code).toBe(70);
      expect(refused.stderr).toContain('changed from HEAD');
      fixtureGit(fixture.checkout, 'commit', '--quiet', '-am', 'stale launcher');
      refused = await switchMode(fixture, 'concurrent');
      expect(refused.code).toBe(70);
      expect(refused.stderr).toContain('has no run_heavy_job in bin/heavy-lock-lib.sh');
      expect(runtimeOf(fixture).hostPoolTransition().mode).toBe('observe');
    });

    test('refuses an empty eligibility list unless --allow-empty, and an eligible id no catalogue names', async () => {
      const empty = pool({ eligible: [] });
      const refused = await switchMode(empty, 'concurrent');
      expect(refused.code).toBe(64);
      expect(refused.stderr).toContain('concurrent mode would change nothing');
      expect((await switchMode(empty, 'concurrent', { allowEmpty: true })).code).toBe(0);
      const typo = pool();
      const configuration = JSON.parse(readFileSync(typo.config, 'utf8')) as Record<
        string,
        unknown
      >;
      writeFileSync(
        typo.config,
        JSON.stringify({ ...configuration, concurrencyEligible: ['eligble'] }),
        {
          mode: 0o600,
        },
      );
      const unnamed = await switchMode(typo, 'concurrent');
      expect(unnamed.code).toBe(64);
      expect(unnamed.stderr).toContain(
        "names eligble, which no launcher checkout's catalogue names",
      );
    });

    test('ops pool init refuses an eligible type no catalogue names, creating nothing', () => {
      const fixture = hostPoolFixture(
        {
          cpuCores: 8,
          memoryGib: 15,
          headroom: { cpuCores: 0, memoryGib: 2 },
          gateTrees: 0,
          credential: fakeCredential(),
        },
        { concurrencyEligible: ['gate'] },
      );
      cleanups.push(fixture.remove);
      const stderr: string[] = [];
      const code = runOps(
        { command: 'ops', words: 'pool init', config: fixture.config },
        opsDependencies(fixture.base, [], stderr),
      );
      return code.then((exit) => {
        expect(exit).toBe(64);
        expect(stderr.join('')).toContain('concurrencyEligible names gate');
        expect(existsSync(join(fixture.root, '.dash'))).toBe(false);
      });
    });

    test('switch-mode stops intake; queued waiters keep their place, and a second switch is refused', async () => {
      const fixture = pool();
      const runtime = runtimeOf(fixture);
      const legacy = startLegacyCaller(fixture.lock, 'legacy', fixture.log, {
        waitSeconds: 0,
        seconds: 3,
      });
      await eventually('the legacy holder', () => intervalsOf(fixture.log).has('legacy'));
      // Queued before the fence, with its budget: it keeps its place (S6B-A16).
      const early = runtime.enqueueHostJob(
        { descriptor: jobType('eligible', 1, 1), label: 'lane:early', waitSeconds: 60 },
        process.pid,
      );
      if (early.kind !== 'queued') throw new Error(early.reason);
      const first = switchMode(fixture, 'concurrent');
      await eventually('the fence', () => runtime.hostPoolTransition().switching !== null);
      const second = await switchMode(fixture, 'concurrent');
      expect(second.code).toBe(75);
      expect(second.stderr).toContain('switch-mode concurrent by dany');
      const status: string[] = [];
      await runOps(
        { command: 'ops', words: 'job status', config: fixture.config },
        opsDependencies(fixture.checkout, status, status),
      );
      // Proof: without the line `switch-mode stops intake; queued waiters keep their place`
      // found no switching line in status (2026-11-02, review H8).
      expect(status.join('')).toMatch(
        /\nswitching to concurrent by dany pid \d+ age \d+s; intake stopped\n/,
      );
      const refused = await refusalOf(
        run(fixture, 'eligible', 'blocked', { seconds: 0, waitSeconds: 30 }),
      );
      expect(refused.exitCode).toBe(75);
      expect(refused.message).toContain('intake stopped while ops pool switch-mode concurrent');
      const admitted = runtime.pollHostJob(early.ticket, silent);
      expect(admitted.kind).toBe('admitted');
      if (admitted.kind !== 'admitted') throw new Error(admitted.kind);
      // The switch waits for it: withdrawing it lets the drain finish.
      runtime.withdrawUnlaunchedHostJob(admitted.job.id, 'test');
      expect((await first).code).toBe(0);
      expect(await legacy.exited).toBe(0);
      expect(intervalsOf(fixture.log).has('blocked')).toBe(false);
    });

    test('a fence naming a dead switcher is void: intake proceeds', async () => {
      const fixture = pool();
      const runtime = runtimeOf(fixture);
      const gone = spawn('true');
      const pid = gone.pid;
      await new Promise((resolveExit) => gone.once('exit', resolveExit));
      const ledger = new Database(join(fixture.root, '.dash', 'resources.sqlite'));
      ledger.query('UPDATE host_pool SET switching=? WHERE id=1').run(
        JSON.stringify({
          pid,
          boot: 'gone',
          start: '1',
          target: 'concurrent',
          operator: 'ghost',
          since: 0,
        }),
      );
      ledger.close();
      expect(runtime.hostPoolTransition().switching?.live).toBe(false);
      const queued = runtime.enqueueHostJob(
        { descriptor: jobType('eligible', 1, 1), label: 'lane:after-ghost', waitSeconds: 0 },
        process.pid,
      );
      // Proof: treating any fence row as live made this enqueue refuse 75 (2026-11-02, review H3).
      expect(queued.kind).toBe('queued');
    });

    test('a switch-mode hold left behind refuses the next switch 75, naming it', async () => {
      const fixture = pool();
      const gone = spawn('true');
      const pid = gone.pid;
      await new Promise((resolveExit) => gone.once('exit', resolveExit));
      mkdirSync(join(fixture.root, '.dash', 'legacy-holds'), { recursive: true, mode: 0o700 });
      const boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
      writeFileSync(switchHoldFile(fixture.root), `${String(pid)} ${boot} 1\n`);
      const refused = await switchMode(fixture, 'concurrent');
      expect(refused.code).toBe(75);
      expect(refused.stderr).toContain(
        `hold ${switchHoldFile(fixture.root)} is still there (holder pid ${String(pid)}, dead)`,
      );
      expect(refused.stderr).toContain('run resources sweep to release it');
      // A live holder is named alive by its identity, not by its pid alone (review K5).
      const live = spawn('sleep', ['30']);
      cleanups.push(() => live.kill('SIGKILL'));
      await eventually('the live holder', () => live.pid !== undefined);
      const stat = readFileSync(`/proc/${String(live.pid)}/stat`, 'utf8');
      const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] ?? '';
      writeFileSync(switchHoldFile(fixture.root), `${String(live.pid)} ${boot} ${start}\n`);
      expect((await switchMode(fixture, 'concurrent')).stderr).toContain(
        `holder pid ${String(live.pid)}, alive`,
      );
      // The same pid with another start is a recycled pid: dead.
      writeFileSync(switchHoldFile(fixture.root), `${String(live.pid)} ${boot} 1\n`);
      expect((await switchMode(fixture, 'concurrent')).stderr).toContain(
        `holder pid ${String(live.pid)}, dead`,
      );
    });

    test('a switch-mode interrupted while it queues withdraws its ticket and reopens intake', async () => {
      const fixture = pool();
      const legacy = startLegacyCaller(fixture.lock, 'legacy', fixture.log, {
        waitSeconds: 0,
        seconds: 4,
      });
      await eventually('the legacy holder', () => intervalsOf(fixture.log).has('legacy'));
      const switching = switchMode(fixture, 'concurrent', { waitSeconds: 30 });
      await eventually(
        'the switch ticket',
        () => readLegacyQueue(fixture.lock).waiters.length === 1,
      );
      process.emit('SIGTERM', 'SIGTERM');
      const interrupted = await switching;
      expect(interrupted.code).toBe(143);
      expect(interrupted.stderr).toContain('interrupted by SIGTERM');
      expect(readLegacyQueue(fixture.lock).waiters).toEqual([]);
      expect(existsSync(switchHoldFile(fixture.root))).toBe(false);
      expect(runtimeOf(fixture).hostPoolTransition()).toMatchObject({
        mode: 'observe',
        switching: null,
      });
      await legacy.exited;
    });

    test('refuses while a legacy waiter queues behind it, and reopens intake', async () => {
      const fixture = pool();
      const holder = startLegacyCaller(fixture.lock, 'holder', fixture.log, {
        waitSeconds: 0,
        seconds: 2,
      });
      await eventually('the legacy holder', () => intervalsOf(fixture.log).has('holder'));
      const switching = switchMode(fixture, 'concurrent');
      await eventually(
        'the switch ticket',
        () => readLegacyQueue(fixture.lock).waiters.length === 1,
      );
      const behind = startLegacyCaller(fixture.lock, 'behind', fixture.log, {
        waitSeconds: 30,
        seconds: 0,
      });
      const refused = await switching;
      expect(refused.code).toBe(75);
      expect(refused.stderr).toContain('legacy waiters queued behind the switch: legacy:behind');
      expect(runtimeOf(fixture).hostPoolTransition()).toMatchObject({
        mode: 'observe',
        switching: null,
      });
      expect(await holder.exited).toBe(0);
      expect(await behind.exited).toBe(0);
      expect(await run(fixture, 'eligible', 'after', { seconds: 0, waitSeconds: 10 })).toBe(0);
    });

    test('switch-mode observe waits for the pool to drain of host jobs, then rolls back', async () => {
      const fixture = await concurrentPool();
      watchGuard(fixture);
      const job = run(fixture, 'eligible', 'running', { seconds: 3, waitSeconds: 30 });
      await eventually('the job', () => intervalsOf(fixture.log).has('running'));
      const early = await switchMode(fixture, 'observe', { waitSeconds: 1 });
      expect(early.code).toBe(75);
      expect(early.stderr).toContain('did not drain of host jobs within 1s: lane:running');
      expect(await job).toBe(0);
      const rolled = await switchMode(fixture, 'observe', { waitSeconds: 10 });
      expect(rolled.code).toBe(0);
      expect(JSON.parse(rolled.stdout)).toMatchObject({ from: 'concurrent', to: 'observe' });
      expect(
        runtimeOf(fixture)
          .modeRecords()
          .map((record) => record.to),
      ).toEqual(['concurrent', 'observe']);
    });
  });

  describe('concurrent mode under the singleton guard (J12)', () => {
    test('two eligible Dash jobs overlap while the guard holds; a legacy caller waits and runs after the pool empties', async () => {
      const fixture = await concurrentPool();
      watchGuard(fixture);
      const first = run(fixture, 'eligible', 'first', { seconds: 2, waitSeconds: 30 });
      const second = run(fixture, 'eligible', 'second', { seconds: 2, waitSeconds: 30 });
      await eventually('both payloads', () => intervalsOf(fixture.log).size === 2);
      const status = readLegacyQueue(fixture.lock);
      expect(status.lines[0]).toMatch(
        new RegExp(`^heavy lock: holder pid \\d+ label ${GUARD_LABEL}$`),
      );
      const refused = startLegacyCaller(fixture.lock, 'refused', fixture.log, {
        waitSeconds: 0,
        seconds: 0,
      });
      expect(await refused.exited).toBe(75);
      const legacy = startLegacyCaller(fixture.lock, 'legacy', fixture.log, {
        waitSeconds: 30,
        seconds: 0,
      });
      expect(await first).toBe(0);
      expect(await second).toBe(0);
      expect(await legacy.exited).toBe(0);
      const spans = intervalsOf(fixture.log);
      const [one, two, late] = ['first', 'second', 'legacy'].map((name) => spans.get(name));
      if (one === undefined || two === undefined || late === undefined) throw new Error('all ran');
      expect(overlaps(one, two)).toBe(true);
      expect(overlaps(one, late) || overlaps(two, late)).toBe(false);
      await eventually(
        'the guard to let go',
        () => runtimeOf(fixture).hostPoolTransition().guardHolder === null,
      );
    });

    test('an ineligible type beside an eligible one is serialised', async () => {
      const fixture = await concurrentPool();
      watchGuard(fixture);
      const first = run(fixture, 'eligible', 'first', { seconds: 2, waitSeconds: 30 });
      await eventually('the first payload', () => intervalsOf(fixture.log).has('first'));
      const second = run(fixture, 'other', 'second', { seconds: 1, waitSeconds: 30 });
      expect(await first).toBe(0);
      expect(await second).toBe(0);
      const spans = intervalsOf(fixture.log);
      const [one, two] = ['first', 'second'].map((name) => spans.get(name));
      if (one === undefined || two === undefined) throw new Error('both ran');
      expect(overlaps(one, two)).toBe(false);
    });

    test('without the guard a job waits, then is refused 75 naming it', () => {
      let now = clock.read();
      return concurrentPool().then((fixture) => {
        const runtime = runtimeOf(fixture, () => now);
        const queued = runtime.enqueueHostJob(
          { descriptor: jobType('eligible', 1, 1), label: 'lane:alone', waitSeconds: 0 },
          process.pid,
        );
        if (queued.kind !== 'queued') throw new Error(queued.reason);
        const waiting: HostJobAdmission = runtime.pollHostJob(queued.ticket, silent);
        expect(waiting).toMatchObject({ kind: 'waiting', awaiting: 'singleton guard' });
        now += 15_001;
        const refused = runtime.pollHostJob(queued.ticket, silent);
        expect(refused.kind).toBe('refused');
        expect(refused.kind === 'refused' && refused.reason).toContain(
          'the singleton guard is not held',
        );
      });
    });

    test('the guard record is not cleared while a ticket is queued or compute is held', async () => {
      const fixture = await concurrentPool();
      const runtime = runtimeOf(fixture);
      expect(runtime.recordGuardHolder(process.pid, fixture.lock.lockPath)).toBe(true);
      const queued = runtime.enqueueHostJob(
        { descriptor: jobType('eligible', 1, 1), label: 'lane:demand', waitSeconds: 30 },
        process.pid,
      );
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      expect(runtime.clearGuardHolder()).toBe(false);
      expect(runtime.hostPoolTransition().guardHolder?.pid).toBe(process.pid);
      runtime.withdrawHostJob(queued.ticket);
      expect(runtime.clearGuardHolder()).toBe(true);
      expect(runtime.hostPoolTransition().guardHolder).toBeNull();
    });

    test('a guard whose holder record names another pid is not held', async () => {
      const fixture = await concurrentPool();
      const runtime = runtimeOf(fixture);
      const held = await holdLegacyLock(
        fixture.lock,
        {
          holdFile: guardHoldFile(fixture.root),
          label: GUARD_LABEL,
          waitSeconds: 0,
          pollSeconds: 1,
          signal: new AbortController().signal,
          report: silent,
        },
        process.env,
      );
      if (held.kind !== 'held') throw new Error(held.kind);
      // Recorded under this test's own pid: alive, but not the shell lock's holder.
      expect(runtime.recordGuardHolder(process.pid, fixture.lock.lockPath)).toBe(true);
      const queued = runtime.enqueueHostJob(
        { descriptor: jobType('eligible', 1, 1), label: 'lane:x', waitSeconds: 0 },
        process.pid,
      );
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      expect(runtime.pollHostJob(queued.ticket, silent)).toMatchObject({
        kind: 'waiting',
        awaiting: 'singleton guard',
      });
      runtime.withdrawHostJob(queued.ticket);
      held.hold.release();
      await held.hold.exited;
    });

    test('--release-guard ends the guard: jobs run on the pool alone and status drops the shell lock', async () => {
      const fixture = await concurrentPool();
      const released = await switchMode(fixture, 'concurrent', { releaseGuard: true });
      expect(released.code).toBe(0);
      expect(JSON.parse(released.stdout)).toMatchObject({
        action: 'release-guard',
        to: 'concurrent unguarded',
      });
      expect(await run(fixture, 'eligible', 'unguarded', { seconds: 0, waitSeconds: 0 })).toBe(0);
      const status: string[] = [];
      await runOps(
        { command: 'ops', words: 'job status', config: fixture.config },
        opsDependencies(fixture.checkout, status, status),
      );
      expect(status.join('')).toContain('mode concurrent, guard released');
      expect(status.join('')).not.toContain('heavy lock:');
      expect((await switchMode(fixture, 'concurrent', { releaseGuard: true })).code).toBe(64);
    });

    test('pool inspect prints the mode, guard, eligibility and the shell lock', async () => {
      const fixture = await concurrentPool();
      const out: string[] = [];
      await runOps(
        { command: 'ops', words: 'pool inspect', config: fixture.config },
        opsDependencies(fixture.checkout, out, out),
      );
      expect(JSON.parse(out.join(''))).toMatchObject({
        mode: 'concurrent',
        guard: 'on',
        guardHolder: null,
        concurrencyEligible: ['eligible'],
        launcherCheckouts: [fixture.checkout],
        legacyLock: { holder: { kind: 'none' }, waiters: [] },
      });
    });
  });

  describe('ops outbox drop beside the guard (task 6.8a, review of #878 F1)', () => {
    test('a live singleton guard refuses the drop', async () => {
      const fixture = await concurrentPool();
      const hold = await heldGuardFor(fixture, runtimeOf(fixture));
      const stdout: string[] = [];
      const stderr: string[] = [];
      const event = randomUUID();
      const code = await runOps(
        {
          command: 'ops',
          words: 'outbox drop',
          config: fixture.config,
          event,
          operator: 'dany',
          reason: 'refused for good',
        },
        opsDependencies(fixture.checkout, stdout, stderr),
      );
      expect({ code, stdout: stdout.join(''), stderr: stderr.join('') }).toEqual({
        code: 64,
        stdout: '',
        stderr: `error: ops outbox drop: the singleton guard's holder (pid ${String(hold.pid)}) is live in concurrent mode, so resources watch may be publishing; stop dash-resources-watch.service, end that holder if it outlives watch, and retry\n`,
      });
    });
  });

  describe('resources watch (J12)', () => {
    test('resources watch holds the guard for a queued job and lets go when the pool empties', async () => {
      const fixture = await concurrentPool();
      const script = join(fixture.base, `watch-${randomUUID()}.ts`);
      writeFileSync(
        script,
        [
          `import { runResources } from ${JSON.stringify(join(import.meta.dir, '..', 'resources', 'command'))};`,
          `import { parseDashRequest } from ${JSON.stringify(join(import.meta.dir, '..', 'cli-parser'))};`,
          `import { WbsUnreachable } from ${JSON.stringify(join(import.meta.dir, '..', 'mcp', 'wbs-tools'))};`,
          `const lock = ${JSON.stringify(fixture.lock)};`,
          'const tools = { call: async () => { throw new WbsUnreachable("fixture WBS is down"); }, close: async () => undefined };',
          `process.exitCode = await runResources(parseDashRequest('resources', ['resources', 'watch', '--config', ${JSON.stringify(fixture.config)}]), { read: () => Date.now() }, () => undefined, () => tools, () => lock);`,
        ].join('\n'),
      );
      const watch = spawn(process.execPath, [script], { stdio: ['ignore', 'ignore', 'inherit'] });
      const exited = new Promise<number | null>((resolveExit) => watch.once('exit', resolveExit));
      try {
        expect(await run(fixture, 'eligible', 'watched', { seconds: 1, waitSeconds: 30 })).toBe(0);
        expect(intervalsOf(fixture.log).has('watched')).toBe(true);
        await eventually('watch to let go of the guard', () => {
          const transition = runtimeOf(fixture).hostPoolTransition();
          return (
            transition.guardHolder === null && readLegacyQueue(fixture.lock).holder.kind === 'none'
          );
        });
      } finally {
        watch.kill('SIGTERM');
        expect(await exited).toBe(0);
      }
    });
  });

  describe('review fixes (Fable, PR #818)', () => {
    /** A held `dash-singleton` hold recorded as the guard, as `watch` would leave it. */
    async function heldGuard(fixture: Pool, runtime: ResourceRuntime) {
      const held = await holdLegacyLock(
        fixture.lock,
        {
          holdFile: guardHoldFile(fixture.root),
          label: GUARD_LABEL,
          waitSeconds: 0,
          pollSeconds: 1,
          signal: new AbortController().signal,
          report: silent,
        },
        process.env,
      );
      if (held.kind !== 'held') throw new Error(held.kind);
      expect(runtime.recordGuardHolder(held.hold.pid, fixture.lock.lockPath)).toBe(true);
      cleanups.push(() => {
        held.hold.release();
      });
      return held.hold;
    }

    function admitOne(runtime: ResourceRuntime, label: string, pid = process.pid) {
      const queued = runtime.enqueueHostJob(
        { descriptor: jobType('eligible', 1, 1), label, waitSeconds: 0 },
        pid,
      );
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      const admitted = runtime.pollHostJob(queued.ticket, silent);
      if (admitted.kind !== 'admitted') throw new Error(admitted.kind);
      return admitted.job;
    }

    test('resources sweep releases the orphan hold of a settled job', async () => {
      const fixture = pool();
      const leaver = payloadScript(join(fixture.base, 'leaver.sh'), 'sleep 2 &\nexit 0');
      expect(
        await run(fixture, 'eligible', 'leaver', {
          seconds: 0,
          waitSeconds: 0,
          settleBudgetMs: 300,
          payload: leaver,
        }),
      ).toBe(0);
      expect(readLegacyQueue(fixture.lock).holder.kind).toBe('held');
      await Bun.sleep(2500);
      const out: string[] = [];
      const tools = {
        call: () => Promise.reject(new WbsUnreachable('fixture', {})),
        close: () => Promise.resolve(),
      };
      expect(
        await runResources(
          resourcesCommand(['sweep', '--config', fixture.config]),
          clock,
          (text) => out.push(text),
          () => tools,
          () => fixture.lock,
        ),
      ).toBe(0);
      expect(out.join('')).toContain('"legacyHolds":{"released":[');
      await eventually(
        'the holder to let go',
        () => readLegacyQueue(fixture.lock).holder.kind === 'none',
      );
    });

    test('a guard holder lost mid-run marks the running jobs, and audit names it', async () => {
      const fixture = await concurrentPool();
      watchGuard(fixture);
      const report: string[] = [];
      const job = run(fixture, 'eligible', 'lost', { seconds: 3, waitSeconds: 30, report });
      await eventually('the payload', () => intervalsOf(fixture.log).has('lost'));
      const holder = runtimeOf(fixture).hostPoolTransition().guardHolder;
      if (holder === null) throw new Error('no guard holder recorded');
      process.kill(-holder.pid, 'SIGKILL');
      expect(await job).toBe(0);
      const marked = runtimeOf(fixture).listHostJobs().at(0);
      expect(marked?.guardLost?.holderPid).toBe(holder.pid);
      expect(
        report.some((line) =>
          line.endsWith(`the singleton guard (pid ${String(holder.pid)}) was lost during the run`),
        ),
      ).toBe(true);
      const audit: string[] = [];
      expect(
        await runOps(
          { command: 'ops', words: 'job audit', config: fixture.config, now: undefined },
          opsDependencies(fixture.checkout, audit, audit),
        ),
      ).toBe(1);
      expect(audit.join('')).toContain(`attribution_incomplete in run ${marked?.id ?? ''}`);
      expect(audit.join('')).toContain('the singleton guard');
    });

    test('a guard lost between admission and launch refuses 75', async () => {
      const fixture = await concurrentPool();
      const runtime = runtimeOf(fixture);
      const hold = await heldGuard(fixture, runtime);
      const job = admitOne(runtime, 'lane:late-launch');
      hold.release();
      await hold.exited;
      let refusal: unknown;
      try {
        runtime.prepareHostJob(job.id);
      } catch (cause) {
        refusal = cause;
      }
      expect(refusal instanceof HostPoolModeRefusal && refusal.exitCode).toBe(75);
      expect(String(refusal)).toContain(
        'the singleton guard was lost between admission and launch',
      );
    });

    test('a stray file in the legacy hold directory stops concurrent admission', async () => {
      const fixture = await concurrentPool();
      const runtime = runtimeOf(fixture);
      const stray = join(fixture.root, '.dash', 'legacy-holds', 'stray');
      mkdirSync(join(fixture.root, '.dash', 'legacy-holds'), { recursive: true, mode: 0o700 });
      writeFileSync(stray, '');
      const lines: string[] = [];
      const guard = new SingletonGuard(
        runtime,
        () => fixture.lock,
        process.env,
        (line) => lines.push(line),
      );
      guard.tick();
      expect(runtime.hostPoolTransition().holdCorruption).toBe(stray);
      expect(lines.join('\n')).toContain(`holds ${stray}, which Dash did not write`);
      const queued = runtime.enqueueHostJob(
        { descriptor: jobType('eligible', 1, 1), label: 'lane:beside-stray', waitSeconds: 0 },
        process.pid,
      );
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      const refused = runtime.pollHostJob(queued.ticket, silent);
      expect(refused.kind === 'refused' && refused.reason).toContain(`holds ${stray}`);
      const status: string[] = [];
      await runOps(
        { command: 'ops', words: 'job status', config: fixture.config },
        opsDependencies(fixture.checkout, status, status),
      );
      expect(status.join('')).toContain(`hold corruption: ${stray}`);
      // No legacy holder was started or ended beside it.
      expect(readLegacyQueue(fixture.lock).holder).toEqual({ kind: 'none' });
      rmSync(stray);
      guard.tick();
      expect(runtime.hostPoolTransition().holdCorruption).toBeNull();
    });

    test('a typo added to concurrencyEligible after init refuses ops job run 64', async () => {
      const fixture = pool();
      const configuration = JSON.parse(readFileSync(fixture.config, 'utf8')) as Record<
        string,
        unknown
      >;
      writeFileSync(
        fixture.config,
        JSON.stringify({ ...configuration, concurrencyEligible: ['eligble'] }),
        { mode: 0o600 },
      );
      const refused = await refusalOf(
        run(fixture, 'eligible', 'typo', { seconds: 0, waitSeconds: 0 }),
      );
      expect(refused.exitCode).toBe(64);
      expect(refused.message).toContain('ops job run: concurrencyEligible names eligble');
    });

    test('refuses a launcher checkout that is missing or not a work tree', async () => {
      const missing = pool();
      const configuration = JSON.parse(readFileSync(missing.config, 'utf8')) as Record<
        string,
        unknown
      >;
      const rewrite = (fixture: Pool, launcherCheckouts: string[]): void => {
        writeFileSync(
          fixture.config,
          JSON.stringify({
            ...configuration,
            root: fixture.root,
            exclusiveUnits: {},
            launcherCheckouts,
            concurrencyEligible: [],
          }),
          { mode: 0o600 },
        );
      };
      rewrite(missing, [join(missing.base, 'no-such-checkout')]);
      let refused = await switchMode(missing, 'concurrent', { allowEmpty: true });
      expect(refused.code).toBe(70);
      expect(refused.stderr).toContain('no-such-checkout unreadable');
      rewrite(missing, [join(missing.checkout, 'bin')]);
      refused = await switchMode(missing, 'concurrent', { allowEmpty: true });
      expect(refused.code).toBe(70);
      expect(refused.stderr).toContain('is not the top of a Git work tree');
    });

    test('refuses a launcher checkout git distrusts, saying so, in any locale', async () => {
      const fixture = pool();
      const fakeBin = join(fixture.base, 'distrust-bin');
      mkdirSync(fakeBin);
      // A git that answers in German unless the C locale is asked for, as a localised git does.
      payloadScript(
        join(fakeBin, 'git'),
        `case " $* " in *" rev-parse --show-toplevel "*) if [ "$LC_ALL" = C ]; then echo "fatal: detected dubious ownership in repository at '$2'" >&2; else echo "fatal: unsicherer Besitz des Repositorys in '$2' erkannt" >&2; fi; exit 128;; esac\nexec ${Bun.which('git') ?? '/usr/bin/git'} "$@"`,
      );
      const refused = await switchMode(fixture, 'concurrent', {
        environment: {
          ...process.env,
          LC_ALL: 'de_DE.UTF-8',
          LANG: 'de_DE.UTF-8',
          PATH: `${fakeBin}:${process.env['PATH'] ?? ''}`,
        },
      });
      expect(refused.code).toBe(70);
      expect(refused.stderr).toContain('is refused by git as of dubious ownership');
    });

    test('refuses a launcher checkout whose bin/ holds an untracked launcher, or whose launcher script was reverted', async () => {
      const fixture = pool();
      writeFileSync(join(fixture.checkout, 'bin', 'extra.sh'), 'with_heavy_lock -- true\n');
      let refused = await switchMode(fixture, 'concurrent');
      expect(refused.code).toBe(70);
      expect(refused.stderr).toContain('has bin/ changed from HEAD');
      rmSync(join(fixture.checkout, 'bin', 'extra.sh'));
      writeFileSync(
        join(fixture.checkout, 'bin', 'payload.sh'),
        '#!/bin/sh\n# run_heavy_job retired here\nwith_heavy_lock "$lock" -- true\n',
      );
      fixtureGit(fixture.checkout, 'commit', '--quiet', '-am', 'revert the launcher');
      refused = await switchMode(fixture, 'concurrent');
      expect(refused.code).toBe(70);
      expect(refused.stderr).toContain(
        'bin/payload.sh (job type eligible) does not call run_heavy_job',
      );
    });

    test('the fence answers only its own switch', async () => {
      const fixture = pool();
      const runtime = runtimeOf(fixture);
      // No fence at all: a flip is refused 75.
      expect(() => runtime.completeModeSwitch('concurrent', 'dany', 'puni1', [])).toThrow(
        'this switch-mode no longer holds the intake fence',
      );
      const other = spawn('sleep', ['30']);
      cleanups.push(() => other.kill('SIGKILL'));
      await eventually('the other process', () => other.pid !== undefined);
      const stat = readFileSync(`/proc/${String(other.pid)}/stat`, 'utf8');
      const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
      const boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
      const ledger = new Database(join(fixture.root, '.dash', 'resources.sqlite'));
      ledger.query('UPDATE host_pool SET switching=? WHERE id=1').run(
        JSON.stringify({
          pid: other.pid,
          boot,
          start,
          target: 'concurrent',
          operator: 'other',
          since: 0,
        }),
      );
      ledger.close();
      // Proof: clearing any fence made `abandonModeSwitch` drop another switcher's (2026-11-02, H7).
      runtime.abandonModeSwitch();
      expect(runtime.hostPoolTransition().switching?.pid).toBe(other.pid);
      expect(() => runtime.completeModeSwitch('concurrent', 'dany', 'puni1', [])).toThrow(
        'this switch-mode no longer holds the intake fence',
      );
    });

    test('releaseGuard refuses 75 under a live fence', async () => {
      const fixture = await concurrentPool();
      const runtime = runtimeOf(fixture);
      runtime.beginModeSwitch('observe', 'dany');
      let refusal: unknown;
      try {
        runtime.releaseGuard('dany', 'puni1', []);
      } catch (cause) {
        refusal = cause;
      }
      expect(refusal instanceof HostPoolModeRefusal && refusal.exitCode).toBe(75);
      runtime.abandonModeSwitch();
    });

    test('a withdrawal for another launcher is refused', async () => {
      const fixture = pool();
      const runtime = runtimeOf(fixture);
      const other = spawn('sleep', ['30']);
      cleanups.push(() => other.kill('SIGKILL'));
      await eventually('the other process', () => other.pid !== undefined);
      const job = admitOne(runtime, 'lane:theirs', other.pid);
      expect(() => runtime.withdrawUnlaunchedHostJob(job.id, 'test')).toThrow(
        'was admitted for another launcher',
      );
    });

    test('a second watch adopts the live guard holder rather than queue another', async () => {
      const fixture = await concurrentPool();
      const runtime = runtimeOf(fixture);
      const hold = await heldGuard(fixture, runtime);
      // Observe-free paths: recording refuses while a live holder is recorded, and outside the guard.
      expect(runtime.recordGuardHolder(process.pid, fixture.lock.lockPath)).toBe(false);
      runtime.enqueueHostJob(
        { descriptor: jobType('eligible', 1, 1), label: 'lane:demand', waitSeconds: 30 },
        process.pid,
      );
      const second = new SingletonGuard(
        runtimeOf(fixture),
        () => fixture.lock,
        process.env,
        silent,
      );
      second.tick();
      await Bun.sleep(500);
      expect(readLegacyQueue(fixture.lock).waiters).toEqual([]);
      expect(runtime.hostPoolTransition().guardHolder?.pid).toBe(hold.pid);
      second.stop();
    });

    test('recording a guard holder outside concurrent mode is refused', () => {
      const fixture = pool();
      expect(runtimeOf(fixture).recordGuardHolder(process.pid, fixture.lock.lockPath)).toBe(false);
    });

    test('an unreadable guard record refuses admission rather than guess', async () => {
      const fixture = await concurrentPool();
      const runtime = runtimeOf(fixture);
      await heldGuard(fixture, runtime);
      const queued = runtime.enqueueHostJob(
        { descriptor: jobType('eligible', 1, 1), label: 'lane:hidden', waitSeconds: 0 },
        process.pid,
      );
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      chmodSync(`${fixture.lock.lockPath}.d`, 0o000);
      try {
        expect(() => runtime.pollHostJob(queued.ticket, silent)).toThrow(
          `singleton guard record ${fixture.lock.lockPath}.d/holder unreadable`,
        );
      } finally {
        chmodSync(`${fixture.lock.lockPath}.d`, 0o700);
      }
    });

    test('an unreadable compute entry keeps the shell lock', async () => {
      const report: string[] = [];
      let released = false;
      await endLegacyHold(
        {
          inspectHostJob: () => {
            throw new Error('ledger gone');
          },
        },
        'job-x',
        {
          pid: 1,
          release: () => {
            released = true;
          },
          exited: Promise.resolve(0),
        },
        { report: (line: string) => report.push(line) } as unknown as JobRunDependencies,
      );
      // Proof: releasing on the unreadable branch made this see the hold released (2026-11-02, H7).
      expect(released).toBe(false);
      expect(report).toEqual([
        'ops job: job-x keeps the shell lock: its compute entry is unreadable (ledger gone); watch releases it',
      ]);
    });
  });

  describe('second review pass (Fable, PR #818 at b9451408b)', () => {
    test('a launcher checkout parked at a pre-catalogue commit does not stop ops job run', async () => {
      const fixture = pool();
      const parked = gateTree(join(fixture.base, 'parked-tree'));
      fixtureGit(parked, 'checkout', '--quiet', '--detach');
      const configuration = JSON.parse(readFileSync(fixture.config, 'utf8')) as Record<
        string,
        unknown
      >;
      writeFileSync(
        fixture.config,
        JSON.stringify({ ...configuration, launcherCheckouts: [fixture.checkout, parked] }),
        { mode: 0o600 },
      );
      expect(await run(fixture, 'eligible', 'beside-parked', { seconds: 0, waitSeconds: 10 })).toBe(
        0,
      );
      const status: string[] = [];
      expect(
        await runOps(
          { command: 'ops', words: 'job status', config: fixture.config },
          opsDependencies(fixture.checkout, status, status),
        ),
      ).toBe(0);
      // The strict form stays for switch-mode, which names the parked checkout.
      // (its launcher checks come first: a parked tree has no shim to verify either).
      const switched = await switchMode(fixture, 'concurrent');
      expect(switched.code).toBe(70);
      expect(switched.stderr).toContain(`launcher checkout ${parked} at`);
      expect(() => {
        verifyEligibleTypes(['eligible'], [fixture.checkout, parked], 'ops pool init');
      }).toThrow(`${parked}/infra/jobs/catalogue.json does not exist at`);
      // An id named by no readable catalogue still refuses, naming the unverified checkout.
      writeFileSync(
        fixture.config,
        JSON.stringify({
          ...configuration,
          launcherCheckouts: [fixture.checkout, parked],
          concurrencyEligible: ['eligble'],
        }),
        { mode: 0o600 },
      );
      const refused = await refusalOf(
        run(fixture, 'eligible', 'typo', { seconds: 0, waitSeconds: 0 }),
      );
      expect(refused.exitCode).toBe(64);
      expect(refused.message).toContain(`${parked} unverified at`);
    });

    test('a ticket of a dead launcher holds neither the switch nor the guard', async () => {
      const fixture = pool();
      const runtime = runtimeOf(fixture);
      const launcher = spawn('sleep', ['30']);
      await eventually('the launcher', () => launcher.pid !== undefined);
      const queued = runtime.enqueueHostJob(
        { descriptor: jobType('eligible', 1, 1), label: 'lane:killed', waitSeconds: 600 },
        launcher.pid ?? 0,
      );
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      launcher.kill('SIGKILL');
      await new Promise((resolveExit) => launcher.once('exit', resolveExit));
      expect(runtime.modeDrain()).toEqual([]);
      const switched = await switchMode(fixture, 'concurrent', { waitSeconds: 5 });
      expect(switched.code).toBe(0);
      // In concurrent mode, the dead ticket leaves the guard no demand, and tick reclaims it.
      const lines: string[] = [];
      const guard = new SingletonGuard(
        runtime,
        () => fixture.lock,
        process.env,
        (line) => lines.push(line),
      );
      guard.tick();
      expect(runtime.guardObligation().demand).toBe(false);
      expect(lines).toContain(
        'host pool: removing ticket lane:killed (pid ' +
          String(launcher.pid) +
          '): its process is gone',
      );
      await Bun.sleep(300);
      expect(readLegacyQueue(fixture.lock).holder).toEqual({ kind: 'none' });
    });

    test('a guard lost mid-run with no watch is still recorded', async () => {
      const fixture = await concurrentPool();
      const runtime = runtimeOf(fixture);
      const hold = await heldGuardFor(fixture, runtime);
      const report: string[] = [];
      const job = run(fixture, 'eligible', 'unwatched', { seconds: 2, waitSeconds: 10, report });
      await eventually('the payload', () => intervalsOf(fixture.log).has('unwatched'));
      process.kill(-hold.pid, 'SIGKILL');
      expect(await job).toBe(0);
      const marked = runtimeOf(fixture).listHostJobs().at(0);
      expect(marked?.guardLost?.holderPid).toBe(hold.pid);
      expect(
        report.some((line) =>
          line.endsWith(`the singleton guard (pid ${String(hold.pid)}) was lost during the run`),
        ),
      ).toBe(true);
    });
  });
}
