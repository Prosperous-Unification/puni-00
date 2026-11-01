import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmodSync, linkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';

import { fakeCredential } from '../compute/testing/credential';
import { admitFixture } from './admission.test.fixture';
import {
  ampleHost,
  build,
  fixtureGit,
  gate,
  gateTree,
  hostPoolFixture,
  insideLinuxNamespace,
  jobType,
  type PoolShape,
} from './host-pool.test.fixture';
import {
  type HostJob,
  type HostJobRequest,
  linuxHostFacts,
  loadResourceConfiguration,
  ResourceRuntime,
} from './runtime';

/**
 * `dash-host-jobs` tasks 2.1 to 2.3 against the real ledger, real processes and real Git
 * trees: the host-pool configuration and its init refusals, one reservation vector shared with
 * worktree uses, host-local admission, the admission scenarios of the `host-jobs` delta spec,
 * and settlement on terminal evidence. The race model lives in host-jobs.model.test.ts.
 */
if (insideLinuxNamespace(import.meta.path)) {
  const fixtures: { remove: () => void }[] = [];
  const payloads: ChildProcess[] = [];
  afterEach(async () => {
    for (const payload of payloads.splice(0)) {
      if (payload.exitCode === null && payload.signalCode === null) {
        payload.kill('SIGKILL');
        await once(payload, 'exit');
      }
    }
    for (const fixture of fixtures.splice(0)) fixture.remove();
  });
  let now = 1800000000000;
  const clock = { read: () => now };
  const silent = (): void => undefined;
  const scenarioPool: PoolShape = {
    cpuCores: 8,
    memoryGib: 15,
    headroom: { cpuCores: 0, memoryGib: 2 },
    gateTrees: 2,
    credential: fakeCredential(),
  };

  function pool(shape: PoolShape, overrides: Record<string, unknown> = {}) {
    const fixture = hostPoolFixture(shape, overrides);
    fixtures.push(fixture);
    const runtime = ResourceRuntime.initialize(
      loadResourceConfiguration(fixture.config),
      clock,
      ampleHost,
    );
    return { ...fixture, runtime };
  }
  function queue(runtime: ResourceRuntime, request: HostJobRequest, pid = process.pid): string {
    const queued = runtime.enqueueHostJob(request, pid);
    if (queued.kind !== 'queued') throw new Error(queued.reason);
    return queued.ticket;
  }
  function admitted(runtime: ResourceRuntime, ticket: string): HostJob {
    const outcome = runtime.pollHostJob(ticket, silent);
    if (outcome.kind !== 'admitted') throw new Error(`expected admission, got ${outcome.kind}`);
    return outcome.job;
  }
  /** Launch a payload that holds until `release()`: the identity is persisted first. */
  function launch(runtime: ResourceRuntime, job: HostJob, script = 'read gate') {
    runtime.prepareHostJob(job.id);
    const payload = spawn('/bin/sh', ['-c', script], {
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

  describe('the host pool configuration (task 2.1)', () => {
    test('refuses schema 2, naming the host pool fields', () => {
      const fixture = hostPoolFixture(scenarioPool, { schemaVersion: 2 });
      fixtures.push(fixture);
      expect(() => loadResourceConfiguration(fixture.config)).toThrow(
        'resource configuration malformed: schemaVersion 2 has no host pool; write schemaVersion 3 adding cpuCores, memoryGib, headroom {cpuCores, memoryGib}, exclusiveUnits and enrollmentId',
      );
    });

    test('init refuses an existing ledger', () => {
      const { config } = pool(scenarioPool);
      expect(() =>
        ResourceRuntime.initialize(loadResourceConfiguration(config), clock, ampleHost),
      ).toThrow('resource initialization requires an empty root');
    });

    test('init refuses a configuration readable by others', () => {
      const fixture = hostPoolFixture(scenarioPool);
      fixtures.push(fixture);
      chmodSync(fixture.config, 0o644);
      expect(() => loadResourceConfiguration(fixture.config)).toThrow(
        'resource configuration must be an owner-only regular file',
      );
    });

    test('init refuses a budget above MemTotal and nproc, read from this host', () => {
      const memory = hostPoolFixture({ ...scenarioPool, memoryGib: 1048576 });
      const cores = hostPoolFixture({ ...scenarioPool, cpuCores: 1048576 });
      fixtures.push(memory, cores);
      expect(() =>
        ResourceRuntime.initialize(loadResourceConfiguration(memory.config), clock, linuxHostFacts),
      ).toThrow(/host pool memoryGib 1048576 exceeds this host's MemTotal \d+\.\d GiB/);
      expect(() =>
        ResourceRuntime.initialize(loadResourceConfiguration(cores.config), clock, linuxHostFacts),
      ).toThrow(/host pool cpuCores 1048576 exceeds this host's \d+/);
    });

    test('init refuses duplicate unit paths, by name and by alias', () => {
      const duplicate = hostPoolFixture({ ...scenarioPool, gateTrees: 1 });
      fixtures.push(duplicate);
      const [tree] = duplicate.trees;
      const twice = hostPoolFixture(
        { ...scenarioPool, gateTrees: 0 },
        { exclusiveUnits: { gate_tree: [tree, tree] } },
      );
      fixtures.push(twice);
      expect(() => loadResourceConfiguration(twice.config)).toThrow(
        `host pool unit ${tree} is named twice`,
      );
      const alias = join(duplicate.base, 'alias');
      symlinkSync(tree, alias);
      const aliased = hostPoolFixture(
        { ...scenarioPool, gateTrees: 0 },
        { exclusiveUnits: { gate_tree: [tree, alias] } },
      );
      fixtures.push(aliased);
      expect(() =>
        ResourceRuntime.initialize(loadResourceConfiguration(aliased.config), clock, ampleHost),
      ).toThrow(`host pool unit ${alias} is not canonical`);
    });

    test('init refuses a unit that is not the top of a Git work tree', () => {
      const fixture = hostPoolFixture({ ...scenarioPool, gateTrees: 0 });
      fixtures.push(fixture);
      const plain = join(fixture.base, 'plain');
      gateTree(join(fixture.base, 'outer'));
      const nested = join(fixture.base, 'outer', 'nested');
      Bun.spawnSync(['mkdir', '-p', nested, plain]);
      for (const unit of [nested, plain]) {
        const config = hostPoolFixture(
          { ...scenarioPool, gateTrees: 0 },
          { exclusiveUnits: { gate_tree: [unit] } },
        );
        fixtures.push(config);
        expect(() =>
          ResourceRuntime.initialize(loadResourceConfiguration(config.config), clock, ampleHost),
        ).toThrow(`host pool unit ${unit} is not the top of a Git work tree`);
      }
    });

    test('refuses a ledger version it does not know', () => {
      const { root, config, runtime } = pool(scenarioPool);
      runtime.close();
      const db = new Database(join(root, '.dash', 'resources.sqlite'));
      db.run('PRAGMA user_version=9');
      db.close();
      expect(() => ResourceRuntime.open(loadResourceConfiguration(config), clock)).toThrow(
        'resource ledger version 9 is unknown to this Dash; refusing to guess its schema',
      );
    });

    test('migrates a version-0 ledger forward, only under its own binding', () => {
      const { root, config, runtime } = pool(scenarioPool);
      runtime.close();
      const ledger = join(root, '.dash', 'resources.sqlite');
      // Reduce the fresh ledger to exactly what `dash-resource-cleanup` wrote.
      const db = new Database(ledger);
      const binding = db.query<{ identity: string }, []>('SELECT identity FROM binding').get();
      const legacy = (JSON.parse(binding?.identity ?? '[]') as string[]).slice(0, 11);
      db.run(
        'DROP TABLE host_jobs; DROP TABLE host_job_tickets; DROP TABLE host_job_events; DROP TABLE host_pool; PRAGMA user_version=0',
      );
      db.query('UPDATE binding SET identity=?').run(
        JSON.stringify(legacy.map((field) => (field === 'runtime-one' ? 'runtime-two' : field))),
      );
      db.close();
      expect(() => ResourceRuntime.open(loadResourceConfiguration(config), clock)).toThrow(
        'resource authority binding mismatch',
      );
      const restore = new Database(ledger);
      expect(
        restore.query<{ user_version: number }, []>('PRAGMA user_version').get()?.user_version,
      ).toBe(0);
      restore.query('UPDATE binding SET identity=?').run(JSON.stringify(legacy));
      restore.close();
      const migrated = ResourceRuntime.open(loadResourceConfiguration(config), clock);
      try {
        expect(migrated.hostPoolStatus().mode).toBe('observe');
        expect(migrated.hostPoolStatus().allocatable).toEqual({
          cpuCores: 8,
          memoryGib: 13,
          diskUnits: 16,
          workspaceSlots: 16,
        });
      } finally {
        migrated.close();
      }
      const reopened = ResourceRuntime.open(loadResourceConfiguration(config), clock);
      reopened.close();
    });

    test('an existing worktree use and a host job reserve from one vector', async () => {
      const { runtime, base } = pool({ ...scenarioPool, workspaceSlots: 2 });
      const source = gateTree(join(base, 'source'));
      const worktree = await runtime.create(
        {
          projectId: 'project-one',
          resourceId: 'disk-one',
          workItemId: 'work-one',
          agentRun: 'run-one',
          responsiblePersonId: 'developer',
          units: 1,
          diskUnits: 1,
          kind: 'git_worktree',
          source,
        },
        admitFixture,
      );
      expect(worktree.state).toBe('active');
      const job = admitted(
        runtime,
        queue(runtime, {
          descriptor: jobType('test-queued', 1, 1, [], 2),
          label: 'q',
          waitSeconds: 0,
        }),
      );
      expect(runtime.hostPoolStatus().reserved).toEqual({
        cpuCores: 1,
        memoryGib: 1,
        diskUnits: 3,
        workspaceSlots: 2,
      });
      // The two slots are taken: one by the worktree, one by the host job's tmp directory.
      const refusal = await runtime
        .create(
          {
            projectId: 'project-one',
            resourceId: 'disk-one',
            workItemId: 'work-one',
            agentRun: 'run-two',
            responsiblePersonId: 'developer',
            units: 1,
            diskUnits: 1,
            kind: 'temporary_directory',
          },
          admitFixture,
        )
        .then(
          () => 'created',
          (cause: unknown) => (cause instanceof Error ? cause.message : 'not an Error'),
        );
      expect(refusal).toBe('resource capacity unavailable');
      const blocked = runtime.pollHostJob(
        queue(runtime, { descriptor: build, label: 'b', waitSeconds: 0 }),
        silent,
      );
      expect(blocked.kind).toBe('refused');
      expect(job.state).toBe('starting');
      runtime.close();
    });

    test('admits a host job with no WBS call while WBS refuses everything', async () => {
      const calls: string[] = [];
      const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: (request) => {
          calls.push(new URL(request.url).pathname);
          return new Response('refused', { status: 503 });
        },
      });
      try {
        const { runtime } = pool(scenarioPool, {
          mcpResource: `http://127.0.0.1:${String(server.port)}/mcp`,
        });
        const outcome = await runtime.admitHostJob(
          { descriptor: gate, label: 'gate:wbs-down', waitSeconds: 1 },
          { pollMs: 5, signal: new AbortController().signal, report: silent },
        );
        expect(outcome.kind).toBe('admitted');
        expect(calls).toEqual([]);
        runtime.close();
      } finally {
        await server.stop(true);
      }
    });
  });

  describe('admission (task 2.2)', () => {
    test('two gates and a build fit', async () => {
      const { runtime } = pool(scenarioPool);
      const first = queue(runtime, { descriptor: gate, label: 'gate:one', waitSeconds: 600 });
      const second = queue(runtime, { descriptor: gate, label: 'gate:two', waitSeconds: 600 });
      const website = queue(runtime, { descriptor: build, label: 'build', waitSeconds: 600 });
      const one = admitted(runtime, first);
      const two = admitted(runtime, second);
      expect(one.units[0]?.path).not.toBe(two.units[0]?.path);
      expect(runtime.pollHostJob(website, silent).kind).toBe('waiting');
      const payload = launch(runtime, one);
      runtime.sweep();
      expect(runtime.pollHostJob(website, silent).kind).toBe('waiting');
      await payload.release();
      runtime.sweep();
      expect(runtime.inspectHostJob(one.id).compute.state).toBe('released');
      expect(admitted(runtime, website).descriptor.id).toBe('website-dev-build');
      runtime.close();
    });

    test('a third gate is overtaken, then barred', async () => {
      const { runtime } = pool({ ...scenarioPool, cpuCores: 16, memoryGib: 34 });
      const one = admitted(
        runtime,
        queue(runtime, { descriptor: gate, label: 'gate:one', waitSeconds: 600 }),
      );
      admitted(runtime, queue(runtime, { descriptor: gate, label: 'gate:two', waitSeconds: 600 }));
      const third = queue(runtime, { descriptor: gate, label: 'gate:three', waitSeconds: 600 });
      expect(runtime.pollHostJob(third, silent).kind).toBe('waiting');
      for (const label of ['build:1', 'build:2', 'build:3'])
        admitted(runtime, queue(runtime, { descriptor: build, label, waitSeconds: 600 }));
      expect(runtime.hostPoolStatus().waiters.map((waiter) => waiter.overtakes)).toEqual([3]);
      const fourth = queue(runtime, { descriptor: build, label: 'build:4', waitSeconds: 600 });
      expect(runtime.pollHostJob(fourth, silent).kind).toBe('waiting');
      const payload = launch(runtime, one);
      await payload.release();
      runtime.sweep();
      expect(runtime.pollHostJob(fourth, silent).kind).toBe('waiting');
      expect(admitted(runtime, third).label).toBe('gate:three');
      expect(admitted(runtime, fourth).label).toBe('build:4');
      runtime.close();
    });

    test('refuses an envelope larger than the host, exit 73 without a ticket', () => {
      const { runtime } = pool(scenarioPool);
      const outcome = runtime.enqueueHostJob(
        { descriptor: jobType('gate', 4, 14, ['gate_tree']), label: 'gate:big', waitSeconds: 600 },
        process.pid,
      );
      expect(outcome).toEqual({
        kind: 'refused',
        exitCode: 73,
        reason: 'host job gate refused: memoryGib 14 exceeds allocatable 13',
      });
      expect(runtime.hostPoolStatus().waiters).toEqual([]);
      runtime.close();
    });

    test('refuses an exclusive id the pool lacks, exit 73 without a ticket', () => {
      const { runtime } = pool({ ...scenarioPool, gateTrees: 0 });
      expect(
        runtime.enqueueHostJob({ descriptor: gate, label: 'g', waitSeconds: 600 }, process.pid),
      ).toEqual({
        kind: 'refused',
        exitCode: 73,
        reason: 'host job gate refused: exclusive gate_tree has 0 units in this pool',
      });
      expect(runtime.hostPoolStatus().waiters).toEqual([]);
      runtime.close();
    });

    test('a waiter past its budget is refused 75 naming who is ahead, and leaves at once', () => {
      const { runtime } = pool({ ...scenarioPool, gateTrees: 1 });
      admitted(runtime, queue(runtime, { descriptor: gate, label: 'gate:one', waitSeconds: 0 }));
      const second = queue(runtime, { descriptor: gate, label: 'gate:two', waitSeconds: 5 });
      const third = queue(runtime, { descriptor: gate, label: 'gate:three', waitSeconds: 600 });
      expect(runtime.pollHostJob(second, silent).kind).toBe('waiting');
      now += 6000;
      const refused = runtime.pollHostJob(second, silent);
      expect(refused).toEqual({
        kind: 'refused',
        exitCode: 75,
        reason:
          'host job gate gate:two refused: wait budget of 5s spent; ahead: gate:one (starting)',
      });
      const waiting = runtime.pollHostJob(third, silent);
      expect(waiting).toEqual({ kind: 'waiting', ahead: [] });
      runtime.close();
    });

    test('a wait-zero caller is refused 75 while a live ticket is ahead, even with room', () => {
      const { runtime } = pool(scenarioPool);
      admitted(runtime, queue(runtime, { descriptor: build, label: 'build', waitSeconds: 0 }));
      const big = queue(runtime, {
        descriptor: jobType('calibration', 8, 13),
        label: 'calibrate',
        waitSeconds: 600,
      });
      expect(runtime.pollHostJob(big, silent).kind).toBe('waiting');
      const outcome = runtime.pollHostJob(
        queue(runtime, { descriptor: build, label: 'build:now', waitSeconds: 0 }),
        silent,
      );
      expect(outcome).toEqual({
        kind: 'refused',
        exitCode: 75,
        reason: expect.stringContaining(
          'wait budget 0 with live tickets ahead: calibrate (pid',
        ) as string,
      });
      runtime.close();
    });

    test('dead tickets are reclaimed by whoever sees them, named on stderr', async () => {
      const { runtime } = pool({ ...scenarioPool, gateTrees: 1 });
      admitted(runtime, queue(runtime, { descriptor: gate, label: 'gate:one', waitSeconds: 0 }));
      const waiter = spawn('sleep', ['600'], { stdio: 'ignore' });
      payloads.push(waiter);
      if (waiter.pid === undefined) throw new Error('waiter did not start');
      const crashed = queue(
        runtime,
        { descriptor: gate, label: 'gate:crashed', waitSeconds: 600 },
        waiter.pid,
      );
      const expired = queue(runtime, { descriptor: gate, label: 'gate:expired', waitSeconds: 1 });
      const mine = queue(runtime, { descriptor: build, label: 'build', waitSeconds: 600 });
      waiter.kill('SIGKILL');
      await once(waiter, 'exit');
      now += 62000;
      const lines: string[] = [];
      runtime.pollHostJob(mine, (line) => lines.push(line));
      expect(lines).toEqual([
        `host pool: removing ticket gate:crashed (pid ${String(waiter.pid)}): its process is gone`,
        `host pool: removing ticket gate:expired (pid ${String(process.pid)}): its wait budget ended over a minute ago`,
      ]);
      expect(runtime.pollHostJob(crashed, silent).kind).toBe('refused');
      expect(runtime.pollHostJob(expired, silent).kind).toBe('refused');
      runtime.close();
    });

    test('cancellation withdraws the ticket and leaves scheduling', async () => {
      const { runtime } = pool({ ...scenarioPool, gateTrees: 1 });
      admitted(runtime, queue(runtime, { descriptor: gate, label: 'gate:one', waitSeconds: 0 }));
      const cancellation = new AbortController();
      const waiting = runtime.admitHostJob(
        { descriptor: gate, label: 'gate:two', waitSeconds: 600 },
        { pollMs: 5, signal: cancellation.signal, report: silent },
      );
      await Bun.sleep(30);
      expect(runtime.hostPoolStatus().waiters.map((waiter) => waiter.label)).toEqual(['gate:two']);
      cancellation.abort();
      expect(await waiting).toEqual({ kind: 'cancelled' });
      expect(runtime.hostPoolStatus().waiters).toEqual([]);
      runtime.close();
    });
  });

  describe('settlement (task 2.3)', () => {
    test('surviving children keep the charge', async () => {
      const { runtime, config, base } = pool(scenarioPool);
      const ready = join(base, 'child-pid');
      const launcher = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, 'host-job-launcher.test.fixture.ts'),
          'surviving',
          config,
          JSON.stringify(gate),
          ready,
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      );
      const reader = launcher.stdout.getReader();
      const line = new TextDecoder().decode((await reader.read()).value);
      const [, jobId, childPid] = /^ready (\S+) (\d+)/.exec(line) ?? [];
      if (!jobId || !childPid)
        throw new Error(
          `launcher not ready: ${line} ${await new Response(launcher.stderr).text()}`,
        );
      expect(runtime.inspectHostJob(jobId).exitCode).toBe(0);
      launcher.kill('SIGKILL');
      await launcher.exited;
      runtime.sweep();
      // 13 allocatable minus the surviving gate's 6 cannot hold 10.
      const large = runtime.pollHostJob(
        queue(runtime, { descriptor: jobType('large', 1, 10), label: 'large', waitSeconds: 0 }),
        silent,
      );
      expect(large.kind).toBe('refused');
      const job = runtime.inspectHostJob(jobId);
      expect(job.state).toBe('unknown');
      expect(job.compute.state).toBe('unknown');
      expect(runtime.hostPoolStatus().jobs[0]?.compute.reason).toContain(childPid);
      expect(runtime.hostPoolStatus().reserved.memoryGib).toBe(6);
      process.kill(Number(childPid), 'SIGKILL');
      for (let attempt = 0; attempt < 200; attempt++) {
        runtime.sweep();
        if (runtime.inspectHostJob(jobId).state === 'released') break;
        await Bun.sleep(10);
      }
      expect(runtime.inspectHostJob(jobId).state).toBe('released');
      admitted(
        runtime,
        queue(runtime, { descriptor: jobType('large', 1, 10), label: 'large', waitSeconds: 0 }),
      );
      runtime.close();
    }, 60000);

    test('a dirty tree is not returned', async () => {
      const { runtime, trees } = pool({ ...scenarioPool, gateTrees: 1 });
      const [tree] = trees;
      const job = admitted(
        runtime,
        queue(runtime, { descriptor: gate, label: 'gate:dirty', waitSeconds: 0 }),
      );
      const payload = launch(runtime, job, `read gate; touch ${tree}/stray.txt`);
      await payload.release();
      runtime.recordHostJobExit(job.id, 0);
      runtime.sweep();
      const settled = runtime.inspectHostJob(job.id);
      expect(settled.compute.state).toBe('released');
      expect(settled.tmpDisk.state).toBe('released');
      expect(settled.units[0]?.state).toBe('blocked');
      expect(settled.units[0]?.reason).toContain('stray.txt');
      expect(settled.state).toBe('blocked');
      expect(runtime.hostPoolStatus().reserved).toEqual({
        cpuCores: 0,
        memoryGib: 0,
        diskUnits: 0,
        workspaceSlots: 0,
      });
      const next = queue(runtime, { descriptor: gate, label: 'gate:next', waitSeconds: 0 });
      expect(runtime.pollHostJob(next, silent).kind).toBe('refused');
      rmSync(join(tree, 'stray.txt'));
      fixtureGit(tree, 'commit', '--quiet', '--allow-empty', '-m', 'moved');
      runtime.sweep();
      expect(runtime.inspectHostJob(job.id).units[0]?.reason).toContain('not its resting commit');
      fixtureGit(tree, 'reset', '--quiet', '--hard', 'HEAD~1');
      runtime.sweep();
      expect(runtime.inspectHostJob(job.id).state).toBe('released');
      admitted(runtime, queue(runtime, { descriptor: gate, label: 'gate:after', waitSeconds: 0 }));
      runtime.close();
    });

    test('a crash between reservation and launch keeps the charge through the launch grace', async () => {
      const { runtime } = pool(scenarioPool);
      const launcher = spawn('sleep', ['600'], { stdio: 'ignore' });
      payloads.push(launcher);
      if (launcher.pid === undefined) throw new Error('launcher did not start');
      const job = admitted(
        runtime,
        queue(runtime, { descriptor: gate, label: 'gate:crash', waitSeconds: 0 }, launcher.pid),
      );
      launcher.kill('SIGKILL');
      await once(launcher, 'exit');
      runtime.sweep();
      expect(runtime.inspectHostJob(job.id).state).toBe('unknown');
      expect(runtime.hostPoolStatus().reserved.cpuCores).toBe(4);
      now += 61000;
      runtime.sweep();
      const settled = runtime.inspectHostJob(job.id);
      expect(settled.state).toBe('released');
      expect(settled.compute.reason).toBe('never launched: launcher gone and launch grace passed');
      expect(settled.tmpDisk.reason).toBe('tmp directory never created');
      runtime.close();
    });

    test('a failed cleanup leaves the tmp reservation charged', async () => {
      const { runtime, base } = pool(scenarioPool);
      const job = admitted(
        runtime,
        queue(runtime, {
          descriptor: jobType('test-queued', 1, 1, [], 1),
          label: 'q',
          waitSeconds: 0,
        }),
      );
      const payload = launch(runtime, job);
      writeFileSync(join(job.locator, 'shared'), 'bytes');
      linkSync(join(job.locator, 'shared'), join(base, 'outside-link'));
      await payload.release();
      runtime.sweep();
      const settled = runtime.inspectHostJob(job.id);
      expect(settled.compute.state).toBe('released');
      expect(settled.tmpDisk.state).toBe('blocked');
      expect(settled.state).toBe('blocked');
      expect(runtime.hostPoolStatus().reserved).toEqual({
        cpuCores: 0,
        memoryGib: 0,
        diskUnits: 1,
        workspaceSlots: 1,
      });
      runtime.close();
    });
  });
}
