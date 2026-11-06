import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { type } from '@shared/validation';
import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';

import { parseDashCommand } from '../cli-parser';
import { monotonicClock } from '../clock';
import { fakeCredential } from '../compute/testing/credential';
import { scriptedTools, type ToolCall } from '../mcp/testing/scripted-tools';
import { type ToolAnswer, type WbsTools, WbsUnreachable } from '../mcp/wbs-tools';
import { ampleHost, build, hostPoolFixture } from '../resources/host-pool.test.fixture';
import { privateLegacyLock } from '../resources/legacy-lock.test.fixture';
import {
  loadResourceConfiguration,
  ResourceRuntime,
  ResourceWbsUnavailable,
} from '../resources/runtime';
import { type OpsDependencies, runOps } from './commands';
import { insideOpsNamespace } from './ops.test.fixture';
import { HostJobRunRecords } from './run-records';
import { linuxScopeTelemetry } from './scope';

const EVENT_TOOL = 'putApiResourceAuthoritiesByAuthorityIdEvents';
const REQUESTS_TOOL = 'getApiResourceAuthoritiesByAuthorityIdCleanupRequests';
/** The fields of a published event these tests read; the runtime asserts the whole contract. */
const SentEvent = type({
  eventId: 'string',
  sequence: 'number.integer > 0',
  useId: 'string',
  revision: 'number.integer > 0',
  kind: 'string',
});

/**
 * `dash-host-jobs` task 6.8a (S6F-A4): `ops outbox drop` removes the one host-job event WBS
 * refuses `400` for good from the head of the authority outbox, journals it, and lets the next
 * event publish in the authority's one sequence. Task 6.8b: it first re-sends the event and
 * drops it only on a fresh `400`.
 */
if (insideOpsNamespace(import.meta.path))
  describe('ops outbox drop (tasks 6.8a, 6.8b)', () => {
    const cleanups: (() => void)[] = [];
    afterEach(() => {
      for (const cleanup of cleanups.splice(0)) cleanup();
    });
    let now = 1800000000000;
    const clock = { read: () => now };

    function pool() {
      const fixture = hostPoolFixture({
        cpuCores: 8,
        memoryGib: 15,
        headroom: { cpuCores: 0, memoryGib: 2 },
        gateTrees: 0,
        credential: fakeCredential(),
      });
      cleanups.push(fixture.remove);
      const runtime = ResourceRuntime.initialize(
        loadResourceConfiguration(fixture.config),
        clock,
        ampleHost,
      );
      HostJobRunRecords.open(fixture.root, false).close();
      cleanups.unshift(() => {
        runtime.close();
      });
      return { ...fixture, runtime };
    }

    /** A host job admitted and withdrawn unlaunched: `registered`, then `not_created`. */
    function withdrawn(runtime: ResourceRuntime, label: string): string {
      const queued = runtime.enqueueHostJob(
        { descriptor: build, label, waitSeconds: 0 },
        globalThis.process.pid,
      );
      if (queued.kind !== 'queued') throw new Error(queued.reason);
      const admitted = runtime.pollHostJob(queued.ticket, () => undefined);
      if (admitted.kind !== 'admitted') throw new Error(`not admitted: ${admitted.kind}`);
      runtime.withdrawUnlaunchedHostJob(admitted.job.id, 'test withdrawal');
      return admitted.job.id;
    }

    /**
     * WBS as be-01 ingests (`libs/wbs/adapters/store-sqlite/src/resource-runtime.ts`): an event
     * id it accepted answers its first acknowledgment again for the same bytes (`409 conflict`
     * for others); a new event must be the authority's next sequence (`409 conflict`
     * otherwise); and `refuses` picks the events it refuses `400 invalid_body`. `skipTo` moves
     * its accepted sequence, as a WBS ahead of the outbox holds it.
     */
    function wbs(refuses: (event: { eventId: string; kind: string; useId: string }) => boolean) {
      let acceptedSequence = 0;
      const prior = new Map<string, { bytes: string; body: unknown }>();
      const tools = scriptedTools((call: ToolCall): ToolAnswer => {
        if (call.name === REQUESTS_TOOL)
          return { kind: 'answered', body: { requests: [], nextCursor: null } };
        if (call.name !== EVENT_TOOL) throw new Error(`unexpected tool ${call.name}`);
        const event = SentEvent.assert(call.input);
        const bytes = JSON.stringify(call.input);
        const known = prior.get(event.eventId);
        if (known !== undefined)
          return known.bytes === bytes
            ? { kind: 'answered', body: known.body }
            : { kind: 'refused', status: 409, error: 'conflict', body: {} };
        if (event.sequence !== acceptedSequence + 1)
          return { kind: 'refused', status: 409, error: 'conflict', body: {} };
        if (refuses(event))
          return { kind: 'refused', status: 400, error: 'invalid_body', body: {} };
        acceptedSequence = event.sequence;
        const body = {
          acceptedSequence: event.sequence,
          useId: event.useId,
          revision: event.revision,
        };
        prior.set(event.eventId, { bytes, body });
        return { kind: 'answered', body };
      });
      return Object.assign(tools, {
        skipTo: (sequence: number) => {
          acceptedSequence = sequence;
        },
      });
    }

    /** WBS calls nobody expects: the drop refused before its re-send. */
    const unreached = () =>
      scriptedTools((call) => {
        throw new Error(`unexpected WBS call ${call.name}`);
      });

    const accepted = (calls: ToolCall[]) =>
      calls.filter((call) => call.name === EVENT_TOOL).map((call) => SentEvent.assert(call.input));

    function deps(stdout: string[], stderr: string[], tools: WbsTools): OpsDependencies {
      return {
        clock,
        monotonic: monotonicClock(),
        environment: globalThis.process.env,
        cwd: globalThis.process.cwd(),
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
        telemetry: linuxScopeTelemetry(),
        host: ampleHost,
        user: 'puni1',
        legacyLock: () => privateLegacyLock('/nonexistent'),
        connect: () => tools,
      };
    }

    async function drop(config: string, event: string, tools: WbsTools) {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const code = await runOps(
        {
          command: 'ops',
          words: 'outbox drop',
          config,
          event,
          operator: 'dany',
          reason: 'old-shape evidence a newer be-01 refuses (S6F-A4)',
        },
        deps(stdout, stderr, tools),
      );
      return { code, stdout: stdout.join(''), stderr: stderr.join('') };
    }

    const outcomeOf = (run: Promise<void>) =>
      run.then(
        () => 'synchronized',
        (cause: unknown) => cause,
      );

    test('a refused event is dropped, journalled, and the next one publishes', async () => {
      const { runtime, config } = pool();
      const blocked = withdrawn(runtime, 'gate:old-shape');
      const following = withdrawn(runtime, 'gate:after');
      const refusing = (event: { useId: string; kind: string }) =>
        event.useId === blocked && event.kind === 'release_verified';
      const first = wbs(refusing);
      expect(await outcomeOf(runtime.synchronize(first))).toBeInstanceOf(ResourceWbsUnavailable);
      const head = runtime.outbox().at(0);
      if (head === undefined) throw new Error('the refused event left the outbox');
      expect([head.useId, head.kind, head.sequence]).toEqual([blocked, 'release_verified', 2]);
      const bytes = JSON.stringify(head);
      expect(runtime.outboxRefusals()).toEqual([
        {
          eventId: head.eventId,
          sequence: 2,
          digest: createHash('sha256').update(bytes).digest('hex'),
          status: 400,
          error: 'resource publication HTTP 400 invalid_body',
          firstRefusedAt: now,
          lastRefusedAt: now,
          refusals: 1,
        },
      ]);
      now += 60_000;
      expect(await outcomeOf(runtime.synchronize(first))).toBeInstanceOf(ResourceWbsUnavailable);
      expect(runtime.outboxRefusals()[0]?.refusals).toBe(2);
      const behind = runtime.outbox().at(1);
      if (behind === undefined) throw new Error('nothing waits behind the refused event');
      now += 1_000;
      const resent = first.calls.length;
      const dropped = await drop(config, head.eventId, first);
      expect(dropped.stderr).toBe('');
      expect(dropped.code).toBe(0);
      expect(dropped.stdout).toBe(
        `ops outbox: dropped event ${head.eventId} (sequence 2, host job ${blocked} release_verified, refused HTTP 400 again on re-send at ${new Date(now).toISOString()}); next in line: event ${behind.eventId} (sequence 2)\n`,
      );
      // The re-send is the stored bytes once, through the outbox's own tool and authority.
      expect(
        first.calls.slice(resent).map((call) => [call.name, JSON.stringify(call.input)]),
      ).toEqual([[EVENT_TOOL, JSON.stringify({ authorityId: 'runtime-one', ...head })]]);
      // The journal keeps who, when, why and the dropped bytes with their digest.
      expect(runtime.outboxDrops()).toEqual([
        {
          sequence: 1,
          at: now,
          operator: 'dany',
          account: 'puni1',
          reason: 'old-shape evidence a newer be-01 refuses (S6F-A4)',
          eventId: head.eventId,
          eventSequence: 2,
          useId: blocked,
          kind: 'release_verified',
          digest: createHash('sha256').update(bytes).digest('hex'),
          bytes,
          refusal: {
            status: 400,
            error: 'resource publication HTTP 400 invalid_body',
            firstRefusedAt: now - 61_000,
            lastRefusedAt: now,
            refusals: 3,
            confirmedAt: now,
          },
          next: { eventId: behind.eventId, sequence: 2 },
          renumbered: 2,
        },
      ]);
      expect(runtime.outboxRefusals()).toEqual([]);
      const sent = first.calls.length;
      expect(await outcomeOf(runtime.synchronize(first))).toBe('synchronized');
      expect(
        accepted(first.calls.slice(sent)).map((event) => [event.sequence, event.useId, event.kind]),
      ).toEqual([
        [2, following, 'registered'],
        [3, following, 'release_verified'],
      ]);
      expect(runtime.outbox()).toEqual([]);
    });

    test('an event WBS has not refused is not dropped', async () => {
      const { runtime, config } = pool();
      const job = withdrawn(runtime, 'gate:fine');
      // WBS takes the registration, then stops answering: the settlement waits, unrefused, at
      // the head, with nothing of its use behind it.
      let acceptedSequence = 0;
      const flaky = scriptedTools((call: ToolCall): ToolAnswer => {
        const event = SentEvent.assert(call.input);
        if (event.kind !== 'registered') return { kind: 'not_called', reason: 'server_error' };
        acceptedSequence = event.sequence;
        return {
          kind: 'answered',
          body: { acceptedSequence, useId: event.useId, revision: event.revision },
        };
      });
      expect(await outcomeOf(runtime.synchronize(flaky))).toBeInstanceOf(ResourceWbsUnavailable);
      const before = runtime.outbox();
      expect(before.map((event) => [event.useId, event.kind])).toEqual([[job, 'release_verified']]);
      const head = before.at(0);
      if (head === undefined) throw new Error('nothing in the outbox');
      expect(runtime.outboxRefusals()).toEqual([]);
      const refused = await drop(config, head.eventId, unreached());
      expect(refused).toEqual({
        code: 64,
        stdout: '',
        stderr: `error: ops outbox drop: event ${head.eventId} (sequence 2) has no recorded WBS refusal; only an event WBS refused 400 can be dropped\n`,
      });
      expect(runtime.outbox()).toEqual(before);
      expect(runtime.outboxDrops()).toEqual([]);
    });

    test('an id not in the outbox is not dropped', async () => {
      const { runtime, config } = pool();
      withdrawn(runtime, 'gate:fine');
      const missing = '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0';
      expect(await drop(config, missing, unreached())).toEqual({
        code: 64,
        stdout: '',
        stderr: `error: ops outbox drop: event ${missing} is not in the outbox of authority runtime-one\n`,
      });
      // A published event is no longer in the outbox either.
      const up = wbs(() => false);
      await runtime.synchronize(up);
      const published = accepted(up.calls).at(0);
      if (published === undefined) throw new Error('nothing published');
      expect(await drop(config, published.eventId, unreached())).toEqual({
        code: 64,
        stdout: '',
        stderr: `error: ops outbox drop: event ${published.eventId} was published (sequence 1); nothing to drop\n`,
      });
      expect(runtime.outboxDrops()).toEqual([]);
    });

    test('a refused event its own use still follows is not dropped', async () => {
      const { runtime, config } = pool();
      const job = withdrawn(runtime, 'gate:registered-refused');
      const tools = wbs((event) => event.useId === job && event.kind === 'registered');
      expect(await outcomeOf(runtime.synchronize(tools))).toBeInstanceOf(ResourceWbsUnavailable);
      const [head, settlement] = [runtime.outbox().at(0), runtime.outbox().at(1)];
      if (head === undefined || settlement === undefined) throw new Error('outbox too short');
      expect(await drop(config, head.eventId, unreached())).toEqual({
        code: 64,
        stdout: '',
        stderr: `error: ops outbox drop: event ${head.eventId} (sequence 1) is followed by event ${settlement.eventId} (sequence 2) of the same use ${job}; dropping it would strand that use's later revisions\n`,
      });
      expect(runtime.outbox()).toHaveLength(2);
    });

    test('a drop racing the publication of the same event stops the publication', async () => {
      const { runtime, config } = pool();
      const blocked = withdrawn(runtime, 'gate:race');
      withdrawn(runtime, 'gate:after');
      let refuse = true;
      const first = wbs(
        (event) => refuse && event.useId === blocked && event.kind === 'release_verified',
      );
      expect(await outcomeOf(runtime.synchronize(first))).toBeInstanceOf(ResourceWbsUnavailable);
      const head = runtime.outbox().at(0);
      if (head === undefined) throw new Error('nothing in the outbox');
      // The drop's re-send is refused again, then WBS accepts the event from watch, and the
      // drop commits while that answer is in flight.
      const raced: Promise<{ code: number }>[] = [];
      const racing = scriptedTools(async (call: ToolCall): Promise<ToolAnswer> => {
        if (
          call.name === EVENT_TOOL &&
          call.input['eventId'] === head.eventId &&
          raced.length === 0
        ) {
          const dropping = drop(config, head.eventId, first);
          raced.push(dropping);
          await dropping;
          refuse = false;
        }
        if (call.name === REQUESTS_TOOL)
          return { kind: 'answered', body: { requests: [], nextCursor: null } };
        const event = SentEvent.assert(call.input);
        return {
          kind: 'answered',
          body: { acceptedSequence: event.sequence, useId: event.useId, revision: event.revision },
        };
      });
      const stopped = await outcomeOf(runtime.synchronize(racing));
      expect(await Promise.all(raced)).toMatchObject([{ code: 0 }]);
      expect(stopped).toBeInstanceOf(Error);
      expect((stopped as Error).message).toBe(
        `resource outbox event ${head.eventId} (sequence 2) changed while it was published; another process dropped or rewrote it`,
      );
    });

    test('a refusal answered after a drop records no ghost row', async () => {
      const { runtime, config } = pool();
      const blocked = withdrawn(runtime, 'gate:ghost');
      withdrawn(runtime, 'gate:after');
      const refused = (event: { useId: string; kind: string }) =>
        event.useId === blocked && event.kind === 'release_verified';
      const first = wbs(refused);
      expect(await outcomeOf(runtime.synchronize(first))).toBeInstanceOf(ResourceWbsUnavailable);
      const head = runtime.outbox().at(0);
      if (head === undefined) throw new Error('nothing in the outbox');
      // A watch tick sends the head again; the operator drops it while WBS's 400 is in flight.
      const drops: Promise<{ code: number }>[] = [];
      const racing = scriptedTools(async (call: ToolCall): Promise<ToolAnswer> => {
        if (call.name === EVENT_TOOL && call.input['eventId'] === head.eventId) {
          const dropping = drop(config, head.eventId, first);
          drops.push(dropping);
          await dropping;
          return { kind: 'refused', status: 400, error: 'invalid_body', body: {} };
        }
        throw new Error(`unexpected call ${call.name}`);
      });
      expect(await outcomeOf(runtime.synchronize(racing))).toBeInstanceOf(ResourceWbsUnavailable);
      expect(await Promise.all(drops)).toMatchObject([{ code: 0 }]);
      expect(runtime.outboxRefusals()).toEqual([]);
      expect(runtime.outbox().at(0)?.sequence).toBe(2);
    });

    test('a drop purges refusal rows of events no longer waiting', async () => {
      const { runtime, config, root } = pool();
      const blocked = withdrawn(runtime, 'gate:purge');
      const tools = wbs((event) => event.useId === blocked && event.kind === 'release_verified');
      expect(await outcomeOf(runtime.synchronize(tools))).toBeInstanceOf(ResourceWbsUnavailable);
      const head = runtime.outbox().at(0);
      if (head === undefined) throw new Error('nothing in the outbox');
      // A row a refusal left for an event that no longer waits, as F2's race could leave one.
      const ledger = new Database(join(root, '.dash', 'resources.sqlite'));
      ledger
        .query('INSERT INTO event_refusals VALUES (?,?,?,?,?,?,?,1)')
        .run(randomUUID(), 3, 'e'.repeat(64), 400, 'stale', now, now);
      ledger.close();
      expect(runtime.outboxRefusals()).toHaveLength(2);
      expect((await drop(config, head.eventId, tools)).code).toBe(0);
      expect(runtime.outboxRefusals()).toEqual([]);
    });

    /** Two withdrawn jobs, the first's settlement refused `400` twice at the outbox head. */
    async function refusedHead() {
      const fixture = pool();
      const blocked = withdrawn(fixture.runtime, 'gate:refused');
      const following = withdrawn(fixture.runtime, 'gate:after');
      let refuse = true;
      const tools = wbs(
        (event) => refuse && event.useId === blocked && event.kind === 'release_verified',
      );
      expect(await outcomeOf(fixture.runtime.synchronize(tools))).toBeInstanceOf(
        ResourceWbsUnavailable,
      );
      now += 60_000;
      expect(await outcomeOf(fixture.runtime.synchronize(tools))).toBeInstanceOf(
        ResourceWbsUnavailable,
      );
      const head = fixture.runtime.outbox().at(0);
      if (head === undefined) throw new Error('nothing in the outbox');
      return {
        ...fixture,
        tools,
        blocked,
        following,
        head,
        accept: () => {
          refuse = false;
        },
      };
    }

    test('an event WBS accepted before a crash is published by the re-send, not dropped', async () => {
      const { runtime, config, tools, blocked, following, head, accept } = await refusedHead();
      // A watch sent the head, WBS accepted it, and the watch died before marking it published:
      // the stored row still says 400.
      accept();
      expect(await tools.call(EVENT_TOOL, { authorityId: 'runtime-one', ...head })).toMatchObject({
        kind: 'answered',
      });
      expect(runtime.outboxRefusals()).toMatchObject([{ eventId: head.eventId, status: 400 }]);
      const behind = runtime.outbox().at(1);
      if (behind === undefined) throw new Error('nothing waits behind the head');
      // Proof: with the re-send skipped (its answer taken as the stored 400), this drop exited 0
      // `dropped event …`, next in line renumbered to sequence 2, which WBS already holds
      // (2026-11-06, verify.md Slice 6h).
      expect(await drop(config, head.eventId, tools)).toEqual({
        code: 0,
        stdout: `ops outbox: WBS accepted event ${head.eventId} (sequence 2, host job ${blocked} release_verified) on re-send; marked it published, nothing was dropped; next in line: event ${behind.eventId} (sequence 3)\n`,
        stderr: '',
      });
      expect(runtime.outboxDrops()).toEqual([]);
      expect(runtime.outboxRefusals()).toEqual([]);
      expect(runtime.outbox().map((event) => event.sequence)).toEqual([3, 4]);
      const sent = tools.calls.length;
      expect(await outcomeOf(runtime.synchronize(tools))).toBe('synchronized');
      expect(
        accepted(tools.calls.slice(sent)).map((event) => [event.sequence, event.useId, event.kind]),
      ).toEqual([
        [3, following, 'registered'],
        [4, following, 'release_verified'],
      ]);
    });

    test('a re-send WBS answers 409 refuses the drop, naming the sequence state', async () => {
      const { runtime, config, tools, head } = await refusedHead();
      const before = { outbox: runtime.outbox(), refusals: runtime.outboxRefusals() };
      // WBS holds a later sequence than the outbox knows, as a restored or hand-repaired one would.
      tools.skipTo(5);
      expect(await drop(config, head.eventId, tools)).toEqual({
        code: 64,
        stdout: '',
        stderr: `error: ops outbox drop: WBS answered HTTP 409 conflict to the re-send of event ${head.eventId} (sequence 2): its accepted sequence for authority runtime-one is not 1, or it holds other bytes under this event id, so WBS is ahead of or behind the outbox; nothing was dropped. Repair by hand: read the authority's acceptedSequence (getApiOrganizationResourceAuthoritiesByAuthorityId) and reconcile the outbox with it before any drop\n`,
      });
      expect({ outbox: runtime.outbox(), refusals: runtime.outboxRefusals() }).toEqual(before);
      expect(runtime.outboxDrops()).toEqual([]);
    });

    test('a re-send WBS does not answer, or refuses but 400 or 409, refuses the drop as unconfirmed', async () => {
      const { runtime, config, head } = await refusedHead();
      const before = { outbox: runtime.outbox(), refusals: runtime.outboxRefusals() };
      const down = scriptedTools((): ToolAnswer => ({
        kind: 'not_called',
        reason: 'server_error',
      }));
      const unreachable = scriptedTools(() => {
        throw new WbsUnreachable(EVENT_TOOL, { cause: new Error('connection refused') });
      });
      const forbidden = scriptedTools((): ToolAnswer => ({
        kind: 'refused',
        status: 403,
        error: 'forbidden',
        body: {},
      }));
      for (const [tools, reason] of [
        [down, `resource publication not completed: server_error`],
        [unreachable, `resource publication: WBS unreachable`],
        [forbidden, `resource publication HTTP 403 forbidden`],
      ] as const)
        expect(await drop(config, head.eventId, tools)).toEqual({
          code: 70,
          stdout: '',
          stderr: `error: ops outbox drop: could not confirm WBS still refuses event ${head.eventId}: ${reason}; nothing was dropped\n`,
        });
      expect({ outbox: runtime.outbox(), refusals: runtime.outboxRefusals() }).toEqual(before);
      expect(runtime.outboxDrops()).toEqual([]);
    });

    test('two drops of the same event drop it once', async () => {
      const { runtime, config, tools, head, following } = await refusedHead();
      // Both re-sends are answered only once both are in flight, so each drop holds a fresh 400
      // before either commits.
      let release = (): void => undefined;
      const bothSent = new Promise<void>((resolve) => {
        release = resolve;
      });
      let inFlight = 0;
      const gated = scriptedTools(async (call: ToolCall): Promise<ToolAnswer> => {
        inFlight += 1;
        if (inFlight === 2) release();
        await bothSent;
        return tools.call(call.name, call.input);
      });
      const outcomes = await Promise.all([
        drop(config, head.eventId, gated),
        drop(config, head.eventId, gated),
      ]);
      expect(outcomes.map((outcome) => outcome.code).sort()).toEqual([0, 64]);
      expect(outcomes.map((outcome) => outcome.stderr).sort()).toEqual([
        '',
        `error: ops outbox drop: event ${head.eventId} is not in the outbox of authority runtime-one\n`,
      ]);
      expect(runtime.outboxDrops()).toHaveLength(1);
      expect(runtime.outbox().map((event) => [event.sequence, event.useId, event.kind])).toEqual([
        [2, following, 'registered'],
        [3, following, 'release_verified'],
      ]);
    });

    test('the grammar takes an event id, an operator and a reason', () => {
      const id = '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0';
      const line = ['ops', 'outbox', 'drop', '--config', '/c', '--event', id, '--operator', 'dany'];
      expect(parseDashCommand([...line, '--reason', 'refused for good'])).toMatchObject({
        words: 'outbox drop',
        event: id,
        operator: 'dany',
        reason: 'refused for good',
      });
      expect(() => parseDashCommand([...line, '--reason', '  '])).toThrow();
      expect(() =>
        parseDashCommand([...line.slice(0, 8), '  ', '--reason', 'refused for good']),
      ).toThrow();
      expect(() =>
        parseDashCommand([...line.slice(0, 6), '-'.repeat(36), ...line.slice(7), '--reason', 'r']),
      ).toThrow();
      expect(() => parseDashCommand(line)).toThrow();
      expect(() =>
        parseDashCommand([...line.slice(0, 6), 'gate', ...line.slice(7), '--reason', 'r']),
      ).toThrow();
    });
  });
