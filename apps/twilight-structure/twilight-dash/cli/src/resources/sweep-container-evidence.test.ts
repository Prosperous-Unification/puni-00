import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { parseDashRequest } from '../cli-parser';
import { fakeCredential } from '../compute/testing/credential';
import { WbsUnreachable } from '../mcp/wbs-tools';
import { runResources } from './command';
import { ampleHost, build, hostPoolFixture } from './host-pool.test.fixture';
import { type HostJob, loadResourceConfiguration, ResourceRuntime } from './runtime';

/**
 * `sweep` settles a host job whose launcher is gone with the container evidence the caller
 * injected (J2'). Before 2026-11-17 it read `declaredContainersOnly`, so a job of a type with a
 * containers bound stayed charged forever once its launcher died: h4claw job 22ce2369 kept
 * 4 cores, 6 GiB and a gate tree reserved after a cgroup-wide SIGKILL had ended every process.
 * Here the launcher is this test process, alive, so the pre-fix state reads `held` rather than the
 * incident's `unknown`; the code path is the same.
 */
describe('sweep container evidence', () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const clock = { read: () => 1800000000000 };
  const bounded = { ...build, containers: { memoryGib: 1, cpuCores: 1 } };

  /** A pool and one admitted job of a type with a containers bound, its payload exited. */
  async function finishedJob(): Promise<{
    runtime: ResourceRuntime;
    job: HostJob;
    config: string;
    base: string;
  }> {
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
      { descriptor: bounded, label: 'sweep', waitSeconds: 0 },
      process.pid,
    );
    if (queued.kind !== 'queued') throw new Error(queued.reason);
    const admitted = runtime.pollHostJob(queued.ticket, () => undefined);
    if (admitted.kind !== 'admitted') throw new Error(`not admitted: ${admitted.kind}`);
    const job = runtime.prepareHostJob(admitted.job.id);
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
    return {
      runtime,
      job: runtime.inspectHostJob(job.id),
      config: fixture.config,
      base: fixture.base,
    };
  }

  function swept(runtime: ResourceRuntime, job: HostJob): HostJob {
    let current = runtime.inspectHostJob(job.id);
    for (let attempt = 0; attempt < 20 && current.state !== 'released'; attempt++) {
      runtime.sweep();
      current = runtime.inspectHostJob(job.id);
    }
    return current;
  }

  test('without a reading, sweep keeps a declared containers bound charged', async () => {
    const { runtime, job } = await finishedJob();
    const current = swept(runtime, job);
    expect(current.compute.state).not.toBe('released');
    expect(current.compute.reason).toBe('declared containers not verified gone');
  });

  test('sweep settles a job with a declared containers bound once the reading says its containers are gone', async () => {
    const { runtime, job } = await finishedJob();
    expect(swept(runtime, job).compute.state).not.toBe('released');
    runtime.useContainerEvidence({ containersGone: () => true });
    const current = swept(runtime, job);
    expect(current.compute.state).toBe('released');
    expect(current.state).toBe('released');
  });

  test('a reading that still sees containers, or cannot read, keeps the charge', async () => {
    const { runtime, job } = await finishedJob();
    runtime.useContainerEvidence({ containersGone: () => false });
    expect(swept(runtime, job).compute.reason).toBe('declared containers not verified gone');
    runtime.useContainerEvidence({
      containersGone: () => {
        throw new Error('docker ps answered exit 1: daemon down');
      },
    });
    const current = swept(runtime, job);
    expect(current.compute.state).not.toBe('released');
    expect(current.compute.reason).toBe(
      'container evidence unavailable: docker ps answered exit 1: daemon down',
    );
  });

  test('resources sweep settles a job with a declared containers bound through a docker on PATH', async () => {
    const { runtime, job, config, base } = await finishedJob();
    expect(swept(runtime, job).compute.state).not.toBe('released');
    runtime.close();
    // A stub docker whose `ps` lists nothing: every container of every job is gone.
    const stubs = join(base, 'stub-bin');
    mkdirSync(stubs);
    writeFileSync(join(stubs, 'docker'), '#!/bin/sh\ncase "$1" in ps) exit 0;; *) exit 1;; esac\n');
    chmodSync(join(stubs, 'docker'), 0o755);
    const library = join(import.meta.dir, '../../../../../../bin/heavy-lock-lib.sh');
    if (!existsSync(library)) throw new Error(`heavy lock library not found at ${library}`);
    const savedPath = process.env['PATH'];
    process.env['PATH'] = `${stubs}:${savedPath ?? ''}`;
    const out: string[] = [];
    try {
      expect(
        await runResources(
          parseDashRequest('resources', ['resources', 'sweep', '--config', config]),
          clock,
          (text) => out.push(text),
          () => ({
            call: () => Promise.reject(new WbsUnreachable('fixture', {})),
            close: () => Promise.resolve(),
          }),
          () => ({ library, lockPath: join(base, 'heavy.lock') }),
        ),
      ).toBe(0);
    } finally {
      process.env['PATH'] = savedPath;
    }
    const reopened = ResourceRuntime.open(loadResourceConfiguration(config), clock);
    cleanups.unshift(() => {
      reopened.close();
    });
    expect(reopened.inspectHostJob(job.id).state).toBe('released');
  });
});
