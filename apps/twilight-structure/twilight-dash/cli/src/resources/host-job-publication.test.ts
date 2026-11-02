import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';

import { resourceRuntimeEvent } from '@wbs/contracts';
import { afterEach, describe, expect, test } from 'bun:test';

import { fakeCredential } from '../compute/testing/credential';
import { scriptedTools, type ToolCall } from '../mcp/testing/scripted-tools';
import { type ToolAnswer, WbsUnreachable } from '../mcp/wbs-tools';
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
    return ResourceRuntime.initialize(loadResourceConfiguration(fixture.config), clock, ampleHost);
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
    runtime.prepareHostJob(outcome.job.id);
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
      expect(returned.evidence?.digest).toMatch(/^[0-9a-f]{64}$/);
      expect(returned.evidence?.locator).toMatch(
        new RegExp(`^dash-host-job://runtime-one/${job.id}/\\d+$`),
      );
      expect(returned.evidence?.disposition).toBe('returned');
      expect(returned.evidence?.reclaimedBytes).toBeNull();
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
    const outcomeOf = (run: Promise<void>) =>
      run.then(
        () => 'synchronized',
        (cause: unknown) => cause,
      );

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
