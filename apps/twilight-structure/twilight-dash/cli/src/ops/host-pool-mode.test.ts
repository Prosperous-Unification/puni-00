import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { monotonicClock, wallClock } from '../clock';
import { fakeCredential } from '../compute/testing/credential';
import {
  ampleHost,
  fixtureGit,
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
  loadResourceConfiguration,
  ResourceRuntime,
} from '../resources/runtime';
import { SingletonGuard } from '../resources/singleton-guard';
import { type OpsDependencies, opsHandlers, runOps } from './commands';
import { type JobRunDependencies, runHostJob } from './job-run';
import {
  catalogueCheckout,
  fakeScopeTelemetry,
  fakeSystemdRun,
  insideOpsNamespace,
  payloadScript,
} from './ops.test.fixture';
import { OpsRefusal } from './refusal';
import { linuxScopeTelemetry } from './scope';
import { switchHoldFile } from './switch-mode';

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
    options: { seconds: number; waitSeconds: number; report?: string[] },
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
      settleBudgetMs: 20_000,
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
        argv: [fixture.payload],
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
    flags: { waitSeconds?: number; releaseGuard?: boolean; allowEmpty?: boolean } = {},
  ) {
    const stdout: string[] = [];
    const stderr: string[] = [];
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
      opsDependencies(fixture.checkout, stdout, stderr),
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

    test('stops intake, queued waiters included, and refuses a second switch while the first drains', async () => {
      const fixture = pool();
      const legacy = startLegacyCaller(fixture.lock, 'legacy', fixture.log, {
        waitSeconds: 0,
        seconds: 3,
      });
      await eventually('the legacy holder', () => intervalsOf(fixture.log).has('legacy'));
      const first = switchMode(fixture, 'concurrent');
      const runtime = runtimeOf(fixture);
      await eventually('the fence', () => runtime.hostPoolTransition().switching !== null);
      const second = await switchMode(fixture, 'concurrent');
      expect(second.code).toBe(75);
      expect(second.stderr).toContain('switch-mode concurrent by dany');
      const refused = await refusalOf(
        run(fixture, 'eligible', 'blocked', { seconds: 0, waitSeconds: 30 }),
      );
      expect(refused.exitCode).toBe(75);
      expect(refused.message).toContain('intake stopped while ops pool switch-mode concurrent');
      expect((await first).code).toBe(0);
      expect(await legacy.exited).toBe(0);
      const spans = intervalsOf(fixture.log);
      expect(spans.has('blocked')).toBe(false);
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

  describe('resources watch (J12)', () => {
    test('resources watch holds the guard for a queued job and lets go when the pool empties', async () => {
      const fixture = await concurrentPool();
      const script = join(fixture.base, `watch-${randomUUID()}.ts`);
      writeFileSync(
        script,
        [
          `import { runResources } from ${JSON.stringify(join(import.meta.dir, '..', 'resources', 'command'))};`,
          `import { WbsUnreachable } from ${JSON.stringify(join(import.meta.dir, '..', 'mcp', 'wbs-tools'))};`,
          `const lock = ${JSON.stringify(fixture.lock)};`,
          'const tools = { call: async () => { throw new WbsUnreachable("fixture WBS is down"); }, close: async () => undefined };',
          `process.exitCode = await runResources(['watch', '--config', ${JSON.stringify(fixture.config)}], { read: () => Date.now() }, () => undefined, () => tools, () => lock);`,
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
}
