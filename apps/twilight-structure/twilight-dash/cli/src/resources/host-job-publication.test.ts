import { type ChildProcess, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { rmSync } from 'node:fs';

import { resourceRuntimeEvent } from '@wbs/contracts';
import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';

import { fakeCredential } from '../compute/testing/credential';
import { scriptedTools, type ToolCall } from '../mcp/testing/scripted-tools';
import { type ToolAnswer, WbsUnreachable } from '../mcp/wbs-tools';
import { HostJobRunRecords } from '../ops/run-records';
import {
  ampleHost,
  build,
  gate,
  hostPoolFixture,
  insideLinuxNamespace,
} from './host-pool.test.fixture';
import {
  HOST_JOB_REFUSAL_RETRY_MS,
  type HostJob,
  type HostJobRequest,
  loadResourceConfiguration,
  ResourceRuntime,
  ResourceWbsRefusal,
  ResourceWbsUnavailable,
} from './runtime';

const EVENT_TOOL = 'putApiResourceAuthoritiesByAuthorityIdEvents';
const REQUESTS_TOOL = 'getApiResourceAuthoritiesByAuthorityIdCleanupRequests';

/**
 * `dash-host-jobs` task 5.2 against the real ledger and real processes: a host job's changes
 * leave the host pool's local outbox for the authority outbox as `resourceRuntimeUse` v2 and
 * reach WBS through the events tool in order, whatever WBS answered while the job ran.
 */
if (insideLinuxNamespace(import.meta.path)) {
  const fixtures: { remove: () => void }[] = [];
  const roots = new Map<ResourceRuntime, string>();
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

  function pool(overrides: Record<string, unknown> = {}) {
    const fixture = hostPoolFixture(
      {
        cpuCores: 8,
        memoryGib: 15,
        headroom: { cpuCores: 0, memoryGib: 2 },
        gateTrees: 2,
        credential: fakeCredential(),
      },
      overrides,
    );
    fixtures.push(fixture);
    const runtime = ResourceRuntime.initialize(
      loadResourceConfiguration(fixture.config),
      clock,
      ampleHost,
    );
    roots.set(runtime, fixture.root);
    return runtime;
  }

  /**
   * Writes the gate entry of `job`'s run record as `ops job run` does before the gate opens,
   * creating the run records beside the ledger on first use.
   */
  function recordGate(runtime: ResourceRuntime, job: HostJob): void {
    const root = roots.get(runtime);
    if (root === undefined) throw new Error('runtime not opened by pool()');
    const records = HostJobRunRecords.open(root, false);
    records.begin(
      {
        jobId: job.id,
        type: job.descriptor.id,
        label: job.label,
        descriptor: job.descriptor,
        descriptorDigest: 'd'.repeat(64),
        cataloguePath: '/srv/checkout/infra/jobs/catalogue.json',
        launcherSha: 'a'.repeat(40),
        argumentProfile: 'none',
        argv: ['true'],
        hostClass: 'linux-x64-8c-15g',
        unit: `dash-job-${job.id}.scope`,
        cgroup: `/user.slice/dash-job-${job.id}.scope`,
        tmpDirectory: job.locator,
        units: job.units.map((unit) => ({ exclusiveId: unit.exclusiveId, path: unit.path })),
        startedAt: now,
      },
      {
        kind: 'gate',
        observedAt: now,
        counters: null,
        tmpBytes: null,
        containers: null,
        failure: null,
      },
    );
    records.close();
  }

  /** The SHA-256 of `jobId`'s stored run record gate entry, read straight from the file. */
  function storedStartDigest(runtime: ResourceRuntime, jobId: string): string {
    const root = roots.get(runtime);
    if (root === undefined) throw new Error('runtime not opened by pool()');
    const db = new Database(HostJobRunRecords.pathOf(root), { readonly: true });
    const row = db
      .query<{ start: string }, [string]>('SELECT start FROM runs WHERE job_id=?')
      .get(jobId);
    db.close();
    if (row === null) throw new Error(`no run record for ${jobId}`);
    return createHash('sha256').update(row.start).digest('hex');
  }

  /** Admits a gate, runs a payload until its launch is recorded, and sweeps until it returned. */
  async function runGate(
    runtime: ResourceRuntime,
    label: string,
    request: Partial<HostJobRequest> = {},
  ): Promise<HostJob> {
    const outcome = await runtime.admitHostJob(
      { descriptor: gate, label, waitSeconds: 1, ...request },
      { pollMs: 5, signal: new AbortController().signal, report: silent },
    );
    if (outcome.kind !== 'admitted') throw new Error(`expected admission, got ${outcome.kind}`);
    const prepared = runtime.prepareHostJob(outcome.job.id);
    recordGate(runtime, prepared);
    const payload = spawn('/bin/sh', ['-c', 'read gate'], {
      detached: true,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    payloads.push(payload);
    const exited = once(payload, 'exit');
    if (payload.pid === undefined) throw new Error('payload did not start');
    runtime.recordHostJobLaunch(outcome.job.id, payload.pid);
    payload.stdin.end('go\n');
    await exited;
    for (let attempt = 0; attempt < 200; attempt++) {
      runtime.sweep();
      if (runtime.inspectHostJob(outcome.job.id).state === 'released') break;
      await Bun.sleep(10);
    }
    const job = runtime.inspectHostJob(outcome.job.id);
    expect(job.state).toBe('released');
    return job;
  }

  /** WBS behind mcp-01 as the contract states it: an empty request page, each event acknowledged. */
  function answering(call: ToolCall): ToolAnswer {
    if (call.name === REQUESTS_TOOL)
      return { kind: 'answered', body: { requests: [], nextCursor: null } };
    if (call.name !== EVENT_TOOL) throw new Error(`unexpected tool ${call.name}`);
    const { authorityId, ...body } = call.input;
    expect(authorityId).toBe('runtime-one');
    const event = resourceRuntimeEvent.assert(body);
    return {
      kind: 'answered',
      body: { acceptedSequence: event.sequence, useId: event.useId, revision: event.revision },
    };
  }

  const published = (calls: ToolCall[]) =>
    calls
      .filter((call) => call.name === EVENT_TOOL)
      .map((call) => resourceRuntimeEvent.assert({ ...call.input, authorityId: undefined }));

  describe('host job publication (task 5.2)', () => {
    const outcomeOf = (run: Promise<void>) =>
      run.then(
        () => 'synchronized',
        (cause: unknown) => cause,
      );
    test('a gate run while WBS is down publishes registered then returned, in order', async () => {
      const runtime = pool();
      const job = await runGate(runtime, 'gate:wbs-down');
      // WBS answers nothing, then refuses with a transient reason: the events wait.
      for (const refusal of [
        () =>
          Promise.reject(new WbsUnreachable(EVENT_TOOL, { cause: new TypeError('fetch failed') })),
        () => ({ kind: 'not_called', reason: 'server_error' }) as const,
      ]) {
        const down = scriptedTools(refusal);
        const refused = await runtime.synchronize(down).then(
          () => null,
          (cause: unknown) => cause,
        );
        expect(refused).toBeInstanceOf(ResourceWbsUnavailable);
        expect(runtime.outbox().map((event) => event.kind)).toEqual([
          'registered',
          'release_verified',
        ]);
      }
      const up = scriptedTools(answering);
      await runtime.synchronize(up);
      const events = published(up.calls);
      expect(events.map((event) => [event.sequence, event.kind, event.revision])).toEqual([
        [1, 'registered', 1],
        [2, 'release_verified', 2],
      ]);
      const [registered, returned] = events;
      expect(registered.use).toEqual({
        kind: 'host_job',
        type: 'gate',
        label: 'gate:wbs-down',
        host: 'enrollment-one',
        launcherSha: null,
        reservations: [
          { dimension: 'cpuCores', units: 4 },
          { dimension: 'memoryGib', units: 6 },
          { dimension: 'tmpDiskGib', units: 0 },
          { dimension: 'gate_tree', units: 1 },
        ],
      });
      expect(returned.use).toEqual(registered.use);
      expect(returned.useId).toBe(job.id);
      // The evidence names the run record and digests its gate entry (task 6.8, S6F-A1).
      expect(returned.evidence).toEqual({
        digest: storedStartDigest(runtime, job.id),
        locator: `dash-host-job-run://enrollment-one/${job.id}`,
        disposition: 'returned',
        reclaimedBytes: null,
      });
      expect(runtime.outbox()).toEqual([]);
      expect(runtime.hostJobOutbox()).toEqual([]);
      // Nothing is published twice.
      const again = scriptedTools(answering);
      await runtime.synchronize(again);
      expect(published(again.calls)).toEqual([]);
      runtime.close();
    }, 60000);

    test('a calibration projects the whole allocatable vector', async () => {
      // Two 1 GiB disk units, so the drain's whole-budget free-space check passes on any runner.
      const runtime = pool({ diskBudgetUnits: 2 });
      const job = await runGate(runtime, 'calibration', { descriptor: build, calibration: true });
      const up = scriptedTools(answering);
      await runtime.synchronize(up);
      const [registered, returned] = published(up.calls);
      // The build's own envelope is 2 cores and 2 GiB; its calibration held the whole pool.
      expect(registered.use).toEqual({
        kind: 'host_job',
        type: 'website-dev-build',
        label: 'calibration',
        host: 'enrollment-one',
        launcherSha: null,
        reservations: [
          { dimension: 'cpuCores', units: 8 },
          { dimension: 'memoryGib', units: 13 },
          { dimension: 'tmpDiskGib', units: 2 },
        ],
      });
      expect(returned.kind).toBe('release_verified');
      expect(returned.use).toEqual(registered.use);
      expect(returned.useId).toBe(job.id);
      runtime.close();
    }, 60000);

    test('a calibration of a gate declares every gate tree it holds', async () => {
      const runtime = pool({ diskBudgetUnits: 2 });
      await runGate(runtime, 'calibration', { calibration: true });
      const up = scriptedTools(answering);
      await runtime.synchronize(up);
      const [registered] = published(up.calls);
      // Proof: counting `envelope.exclusive` made this declare `gate_tree` 1 for the two trees
      // the calibration held (2026-11-02, Slice 4, S4-A18).
      const use = registered.use;
      if (use.kind !== 'host_job') throw new Error('expected a host_job use');
      expect(use.reservations.at(-1)).toEqual({ dimension: 'gate_tree', units: 2 });
    }, 60000);

    test('a job still held publishes registered alone; its return follows later', async () => {
      const runtime = pool();
      const outcome = await runtime.admitHostJob(
        { descriptor: gate, label: 'gate:held', waitSeconds: 1 },
        { pollMs: 5, signal: new AbortController().signal, report: silent },
      );
      if (outcome.kind !== 'admitted') throw new Error(outcome.kind);
      const first = scriptedTools(answering);
      await runtime.synchronize(first);
      expect(published(first.calls).map((event) => event.kind)).toEqual(['registered']);
      const second = await runGate(runtime, 'gate:after');
      const later = scriptedTools(answering);
      await runtime.synchronize(later);
      expect(published(later.calls).map((event) => [event.useId, event.kind])).toEqual([
        [second.id, 'registered'],
        [second.id, 'release_verified'],
      ]);
      runtime.close();
    }, 60000);

    test('a job withdrawn before its gate publishes not_created, naming the absent run record', async () => {
      const runtime = pool();
      const outcome = await runtime.admitHostJob(
        { descriptor: gate, label: 'gate:withdrawn', waitSeconds: 1 },
        { pollMs: 5, signal: new AbortController().signal, report: silent },
      );
      if (outcome.kind !== 'admitted') throw new Error(outcome.kind);
      // Another job's run record exists: the file is there, this job's row is not.
      await runGate(runtime, 'gate:ran');
      runtime.withdrawUnlaunchedHostJob(outcome.job.id, 'the legacy queue refused it');
      expect(runtime.inspectHostJob(outcome.job.id).state).toBe('released');
      const up = scriptedTools(answering);
      await runtime.synchronize(up);
      const returned = published(up.calls).find(
        (event) => event.useId === outcome.job.id && event.kind === 'release_verified',
      );
      const locator = `dash-host-job-run://enrollment-one/${outcome.job.id}`;
      expect(returned?.evidence).toEqual({
        digest: createHash('sha256').update(`${locator} absent`).digest('hex'),
        locator,
        disposition: 'not_created',
        reclaimedBytes: null,
      });
      runtime.close();
    }, 60000);

    test('run records missing beside a returned host job stop the move, publishing nothing', async () => {
      const runtime = pool();
      const job = await runGate(runtime, 'gate:lost-records');
      const root = roots.get(runtime);
      if (root === undefined) throw new Error('runtime not opened by pool()');
      rmSync(HostJobRunRecords.pathOf(root));
      const up = scriptedTools(answering);
      const stopped = await outcomeOf(runtime.synchronize(up));
      expect(stopped).toBeInstanceOf(Error);
      expect((stopped as Error).message).toBe(
        `host job run records ${HostJobRunRecords.pathOf(root)} are missing beside a ledger that has host jobs; restore them from backup`,
      );
      expect(published(up.calls)).toEqual([]);
      expect(runtime.outbox()).toEqual([]);
      expect(
        runtime.hostJobOutbox().map((row) => (row.event as { jobId: string }).jobId),
      ).toContain(job.id);
      runtime.close();
    }, 60000);

    /** WBS refusing the host-job variant `400` (an outgoing be-01 without v2) `refusals` times. */
    function refusingFirst(refusals: number) {
      let refused = 0;
      return scriptedTools((call) => {
        if (call.name === EVENT_TOOL && refused < refusals) {
          refused += 1;
          return { kind: 'refused', status: 400, error: 'invalid_body', body: {} };
        }
        return answering(call);
      });
    }

    // S5-A20: bounded convergence across a blue/green window.
    test('a host-job event refused 400 twice publishes in order once WBS accepts it', async () => {
      const runtime = pool();
      await runGate(runtime, 'gate:swap');
      const tools = refusingFirst(2);
      expect(await outcomeOf(runtime.synchronize(tools))).toBeInstanceOf(ResourceWbsUnavailable);
      now += 60_000;
      expect(await outcomeOf(runtime.synchronize(tools))).toBeInstanceOf(ResourceWbsUnavailable);
      now += 60_000;
      expect(await outcomeOf(runtime.synchronize(tools))).toBe('synchronized');
      expect(published(tools.calls).map((event) => [event.sequence, event.kind])).toEqual([
        [1, 'registered'],
        [1, 'registered'],
        [1, 'registered'],
        [2, 'release_verified'],
      ]);
      expect(runtime.outbox()).toEqual([]);
      runtime.close();
    }, 60000);

    test('a host-job event refused past the bound stops watch', async () => {
      const runtime = pool();
      await runGate(runtime, 'gate:old-wbs');
      const tools = refusingFirst(Number.MAX_SAFE_INTEGER);
      expect(await outcomeOf(runtime.synchronize(tools))).toBeInstanceOf(ResourceWbsUnavailable);
      now += HOST_JOB_REFUSAL_RETRY_MS - 1;
      expect(await outcomeOf(runtime.synchronize(tools))).toBeInstanceOf(ResourceWbsUnavailable);
      now += 1;
      const stopped = await outcomeOf(runtime.synchronize(tools));
      expect(stopped).toBeInstanceOf(ResourceWbsRefusal);
      expect((stopped as ResourceWbsRefusal).message).toBe(
        'resource publication HTTP 400 invalid_body',
      );
      expect(runtime.outbox().map((event) => event.kind)).toEqual([
        'registered',
        'release_verified',
      ]);
      runtime.close();
    }, 60000);
  });
}
