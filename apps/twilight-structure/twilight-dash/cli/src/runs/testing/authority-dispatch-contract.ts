import { afterEach, describe, expect, test } from 'bun:test';

import { createRuntimeClient, type RuntimeClient } from '../../bridge/runtime-client';
import type { ArtifactStore } from '../artifact-store';
import { dispatchAuthority } from '../dispatch-authority';
import { equalRecords, ownerId } from '../record-codecs';
import type { RunStore } from '../run-store';
import { RuntimeDispatchError } from '../runtime-dispatch-error';
import { readRuntimeHistory } from '../runtime-history';
import type { RuntimeGuard, RuntimeIntent } from '../runtime-records';
import { unwrapReply } from './fixtures';
import type { StoreFixture } from './run-store-contract';
import {
  authorityReceipt,
  authorityRequest,
  dependentReceiptFixture,
  runtimePin,
  runtimeScope,
} from './runtime-history-contract';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
async function tick() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
const activeSignal = () => new AbortController().signal;
type TransportInput = Parameters<Parameters<typeof createRuntimeClient>[0]>[1];
type AuthorityFixture = StoreFixture & { artifacts: ArtifactStore; guard: RuntimeGuard };
async function retainedIntent(stores: AuthorityFixture) {
  const history = await stores.runs.readRuntimeScope(runtimeScope);
  if (history.kind !== 'pinned') throw new Error('fixture pin missing');
  const intent = history.intents.at(0);
  if (intent === undefined) throw new Error('fixture intent missing');
  return intent;
}
async function receiptBytes(stores: AuthorityFixture, extra = 'original') {
  return (
    JSON.stringify(
      { ...authorityReceipt(await retainedIntent(stores)), futureCompatible: extra },
      null,
      2,
    ) + '\n'
  );
}
function receiver(
  stores: AuthorityFixture,
  respond?: (shape: string, input: TransportInput) => Promise<Response>,
) {
  const sent: { shape: string; input: TransportInput }[] = [];
  const client = createRuntimeClient(async (shape, input) => {
    sent.push({ shape: shape.operationId, input });
    return respond === undefined
      ? new Response(await receiptBytes(stores))
      : await respond(shape.operationId, input);
  });
  return { client, sent };
}
async function expectPending(stores: AuthorityFixture, commandId = 'acquire') {
  expect(await readRuntimeHistory(stores.runs, stores.artifacts, runtimeScope)).toMatchObject({
    pendingCommandId: commandId,
    acceptances: [],
    grant: null,
  });
}
async function expectCorrelated(
  pending: Promise<unknown>,
  intent: RuntimeIntent | Promise<RuntimeIntent>,
  cause?: unknown,
) {
  const observed = pending.then(
    (value) => ({ kind: 'returned' as const, value }),
    (cause: unknown) => ({ kind: 'threw' as const, cause }),
  );
  const snapshot = await intent;
  const observation = await observed;
  expect(observation.kind).toBe('threw');
  if (observation.kind !== 'threw') throw new Error('unexpected dispatch acknowledgement');
  const failure: unknown = observation.cause;
  {
    expect(failure).toBeInstanceOf(RuntimeDispatchError);
    if (!(failure instanceof RuntimeDispatchError)) throw new Error('missing dispatch correlation');
    expect(failure.message).toBe('Runtime dispatch failed');
    expect(failure.intent).toEqual(snapshot);
    expect(Object.isFrozen(failure.intent)).toBe(true);
    expect(Object.isFrozen(failure.intent.localOwner)).toBe(true);
    if (cause !== undefined) expect(failure.cause).toBe(cause);
    return failure;
  }
}

/** Exercises commit election and receipt reconciliation through the actual semantic providers and validated Response transport. */
export function authorityDispatchContract(
  name: string,
  create: () => Promise<StoreFixture & { artifacts: ArtifactStore }>,
): void {
  describe(name, () => {
    const opened: StoreFixture[] = [];
    afterEach(() => {
      for (const stores of opened.splice(0)) stores.close();
    });
    async function fixture(): Promise<AuthorityFixture> {
      const stores = await create();
      opened.push(stores);
      const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
      unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
      return {
        ...stores,
        guard: { ownership, scope: structuredClone(runtimeScope), expectedRevision: 0 },
      };
    }
    function dispatch(
      stores: AuthorityFixture,
      client: RuntimeClient,
      runs: RunStore = stores.runs,
      artifacts: ArtifactStore = stores.artifacts,
      signal = activeSignal(),
      guard = stores.guard,
    ) {
      return dispatchAuthority(runs, artifacts, client, guard, authorityRequest(), signal);
    }

    test('stage await prevents precommit HTTP', async () => {
      const stores = await fixture();
      const entered = deferred<undefined>();
      const gate = deferred<undefined>();
      const runs: RunStore = {
        ...stores.runs,
        async stageRuntimeRequest(guard, canonical) {
          entered.resolve(undefined);
          await gate.promise;
          return await stores.runs.stageRuntimeRequest(guard, canonical);
        },
      };
      const remote = receiver(stores);
      const observed = dispatch(stores, remote.client, runs).then(
        (reply) => ({ reply }),
        (cause: unknown) => ({ cause }),
      );
      await entered.promise;
      await tick();
      try {
        expect(remote.sent).toHaveLength(0);
      } finally {
        gate.resolve(undefined);
        await observed;
      }
    });

    test('renew await prevents send while renewal remains uncommitted', async () => {
      const stores = await fixture();
      const entered = deferred<undefined>();
      const gate = deferred<undefined>();
      const runs: RunStore = {
        ...stores.runs,
        async renewOwnership(ownership) {
          entered.resolve(undefined);
          await gate.promise;
          return await stores.runs.renewOwnership(ownership);
        },
      };
      const remote = receiver(stores);
      const observed = dispatch(stores, remote.client, runs).then(
        (reply) => ({ reply }),
        (cause: unknown) => ({ cause }),
      );
      await entered.promise;
      await tick();
      try {
        expect(remote.sent).toHaveLength(0);
      } finally {
        gate.resolve(undefined);
        await observed;
      }
    });

    test('fresh commit and renewal barriers precede exact one POST and literal receipt acceptance', async () => {
      const stores = await fixture();
      const commit = deferred<undefined>();
      const renew = deferred<undefined>();
      const staged = deferred<undefined>();
      const renewing = deferred<undefined>();
      const remote = receiver(stores);
      const runs: RunStore = {
        ...stores.runs,
        async stageRuntimeRequest(guard, canonical) {
          staged.resolve(undefined);
          await commit.promise;
          return await stores.runs.stageRuntimeRequest(guard, canonical);
        },
        async renewOwnership(ownership) {
          renewing.resolve(undefined);
          await renew.promise;
          return await stores.runs.renewOwnership(ownership);
        },
      };
      const signal = activeSignal();
      const pending = dispatch(stores, remote.client, runs, stores.artifacts, signal);
      await staged.promise;
      await tick();
      try {
        expect(remote.sent).toHaveLength(0);
        expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({ intents: [] });
      } finally {
        commit.resolve(undefined);
      }
      await renewing.promise;
      await tick();
      try {
        expect(remote.sent).toHaveLength(0);
        await expectPending(stores);
      } finally {
        renew.resolve(undefined);
      }
      const reply = await pending;
      expect(reply.kind).toBe('accepted');
      if (reply.kind !== 'accepted') throw new Error('acceptance missing');
      expect(remote.sent).toEqual([
        {
          shape: 'acquireRuntimeAuthority',
          input: {
            params: { id: 'project' },
            query: undefined,
            body: {
              schemaVersion: 1,
              commandId: 'acquire',
              personId: 'person',
              expectedLedgerId: 'ledger',
              ownerId: 'receiver-owner',
              expectedGeneration: null,
            },
            signal,
          },
        },
      ]);
      expect(
        new TextDecoder().decode(await stores.artifacts.readArtifact(reply.acceptance.evidence)),
      ).toBe(await receiptBytes(stores));
      expect(await readRuntimeHistory(stores.runs, stores.artifacts, runtimeScope)).toMatchObject({
        pendingCommandId: null,
        acceptances: [reply.acceptance],
        intents: [reply.intent],
      });
    });

    test('concurrent exact staging elects one POST and lookup404 leaves original delayed POST viable', async () => {
      const stores = await fixture();
      const posted = deferred<undefined>();
      const response = deferred<Response>();
      let postCount = 0;
      const remote = receiver(stores, async (shape) => {
        if (shape === 'acquireRuntimeAuthority') {
          if (++postCount > 1)
            return Response.json({ error: 'runtime_authority_stale' }, { status: 409 });
          posted.resolve(undefined);
          return await response.promise;
        }
        return Response.json({ error: 'runtime_receipt_not_found' }, { status: 404 });
      });
      const first = dispatch(stores, remote.client);
      await posted.promise;
      const duplicate = await dispatch(stores, remote.client);
      expect(duplicate).toMatchObject({
        kind: 'pending',
        observation: {
          kind: 'receiver_refused',
          reply: { kind: 'refusal', status: 404, body: { error: 'runtime_receipt_not_found' } },
        },
      });
      await expectPending(stores);
      response.resolve(new Response(await receiptBytes(stores)));
      expect((await first).kind).toBe('accepted');
      expect(remote.sent.map((sent) => sent.shape)).toEqual([
        'acquireRuntimeAuthority',
        'lookupRuntimeReceipt',
      ]);
      expect(remote.sent[1]?.input).toMatchObject({
        params: { id: 'project', commandId: 'acquire' },
        query: { personId: 'person', expectedLedgerId: 'ledger' },
      });
    });

    test('changed canonical same ID is refused without HTTP or rebase', async () => {
      const stores = await fixture();
      unwrapReply(await stores.runs.stageRuntimeRequest(stores.guard, authorityRequest()));
      const before = await stores.runs.readRuntimeScope(runtimeScope);
      const remote = receiver(stores);
      expect(
        await dispatchAuthority(
          stores.runs,
          stores.artifacts,
          remote.client,
          stores.guard,
          authorityRequest('acquire', 4),
          activeSignal(),
        ),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(remote.sent).toHaveLength(0);
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
    });

    test.each(['before renewal', 'during renewal'] as const)(
      'cancelled %s retains pending without send',
      async (when) => {
        const stores = await fixture();
        const controller = new AbortController();
        const gate = deferred<undefined>();
        const entered = deferred<undefined>();
        let renewals = 0;
        const runs: RunStore = {
          ...stores.runs,
          async renewOwnership(ownership) {
            renewals++;
            entered.resolve(undefined);
            await gate.promise;
            return await stores.runs.renewOwnership(ownership);
          },
        };
        if (when === 'before renewal') controller.abort();
        const remote = receiver(stores);
        const pending = dispatch(stores, remote.client, runs, stores.artifacts, controller.signal);
        if (when === 'during renewal') {
          await entered.promise;
          controller.abort();
        }
        gate.resolve(undefined);
        expect(await pending).toMatchObject({
          kind: 'pending',
          observation: { kind: 'cancelled_before_dispatch' },
        });
        expect(renewals).toBe(when === 'before renewal' ? 0 : 1);
        expect(remote.sent).toHaveLength(0);
        await expectPending(stores);
      },
    );

    test('takeover during renewal retains pending and refuses old guard without send', async () => {
      const stores = await fixture();
      const entered = deferred<undefined>();
      const gate = deferred<undefined>();
      const runs: RunStore = {
        ...stores.runs,
        async renewOwnership(ownership) {
          entered.resolve(undefined);
          await gate.promise;
          return await stores.runs.renewOwnership(ownership);
        },
      };
      const remote = receiver(stores);
      const pending = dispatch(stores, remote.client, runs);
      await entered.promise;
      stores.clock.advance(100);
      unwrapReply(await stores.runs.acquireOwnership(ownerId('local-B'), 1));
      gate.resolve(undefined);
      expect(await pending).toMatchObject({
        kind: 'pending',
        observation: { kind: 'local_refused', reason: 'owner_stale' },
      });
      expect(await dispatch(stores, remote.client)).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      expect(remote.sent).toHaveLength(0);
      await expectPending(stores);
    });

    test('guard snapshot before stage await preserves retained scope and owner', async () => {
      const stores = await fixture();
      const entered = deferred<undefined>();
      const gate = deferred<undefined>();
      const guard = structuredClone(stores.guard);
      const runs: RunStore = {
        ...stores.runs,
        async stageRuntimeRequest(input, canonical) {
          entered.resolve(undefined);
          await gate.promise;
          return await stores.runs.stageRuntimeRequest(input, canonical);
        },
      };
      const remote = receiver(stores);
      const pending = dispatch(
        stores,
        remote.client,
        runs,
        stores.artifacts,
        activeSignal(),
        guard,
      );
      await entered.promise;
      Object.assign(guard.scope, { projectId: 'changed', personId: 'changed' });
      Object.assign(guard.ownership, { ownerId: 'changed', epoch: 77 });
      gate.resolve(undefined);
      const reply = await pending;
      expect(reply.kind).toBe('accepted');
      if (reply.kind !== 'accepted') throw new Error('acceptance missing');
      expect(reply.intent.localOwner).toEqual({ ownerId: ownerId('local-A'), epoch: 1 });
      expect(remote.sent[0]?.input).toMatchObject({
        params: { id: 'project' },
        body: { personId: 'person', ownerId: 'receiver-owner', expectedGeneration: null },
      });
    });

    test('retained intent snapshots before renewal await', async () => {
      const stores = await fixture();
      const entered = deferred<undefined>();
      const gate = deferred<undefined>();
      let staged: RuntimeIntent | undefined;
      const runs: RunStore = {
        ...stores.runs,
        async stageRuntimeRequest(guard, canonical) {
          const reply = await stores.runs.stageRuntimeRequest(guard, canonical);
          if (reply.kind !== 'refused') staged = reply.value;
          return reply;
        },
        async renewOwnership(ownership) {
          entered.resolve(undefined);
          await gate.promise;
          return await stores.runs.renewOwnership(ownership);
        },
      };
      const remote = receiver(stores);
      const pending = dispatch(stores, remote.client, runs);
      await entered.promise;
      if (staged === undefined) throw new Error('stage missing');
      Object.assign(staged, { canonicalRequest: authorityRequest('acquire', 5) });
      Object.assign(staged.localOwner, { epoch: 77 });
      gate.resolve(undefined);
      const reply = await pending;
      expect(reply.kind).toBe('accepted');
      if (reply.kind !== 'accepted') throw new Error('acceptance missing');
      expect(reply.intent.canonicalRequest).toBe(authorityRequest());
      expect(reply.intent.localOwner.epoch).toBe(1);
      expect(remote.sent[0]?.input.body).toMatchObject({ expectedGeneration: null });
    });

    test('duplicate missing pin is a correlated trusted-state diagnostic', async () => {
      const stores = await fixture();
      unwrapReply(await stores.runs.stageRuntimeRequest(stores.guard, authorityRequest()));
      const remote = receiver(stores);
      const runs: RunStore = {
        ...stores.runs,
        async readRuntimeScope(scope) {
          return await Promise.resolve({ version: 1, kind: 'uninitialized', scope, ownerEpoch: 1 });
        },
      };
      const failure = await expectCorrelated(
        dispatch(stores, remote.client, runs),
        retainedIntent(stores),
      );
      expect(failure.cause).toBeInstanceOf(Error);
      if (!(failure.cause instanceof Error)) throw new Error('missing cause');
      expect(failure.cause.message).toBe('retained runtime scope is not pinned');
      expect(remote.sent).toHaveLength(0);
      await expectPending(stores);
    });

    test('artifact and local acceptance barriers precede acknowledgement', async () => {
      const stores = await fixture();
      const retaining = deferred<undefined>();
      const retained = deferred<undefined>();
      const saving = deferred<undefined>();
      const saved = deferred<undefined>();
      let settled = false;
      const artifacts: ArtifactStore = {
        ...stores.artifacts,
        async retainArtifact(content, type) {
          retaining.resolve(undefined);
          await retained.promise;
          return await stores.artifacts.retainArtifact(content, type);
        },
      };
      const runs: RunStore = {
        ...stores.runs,
        async recordRuntimeAcceptance(guard, input) {
          saving.resolve(undefined);
          await saved.promise;
          return await stores.runs.recordRuntimeAcceptance(guard, input);
        },
      };
      const remote = receiver(stores);
      const pending = dispatch(stores, remote.client, runs, artifacts).then((reply) => {
        settled = true;
        return reply;
      });
      await retaining.promise;
      await tick();
      try {
        expect(settled).toBe(false);
        await expectPending(stores);
      } finally {
        retained.resolve(undefined);
      }
      await saving.promise;
      await tick();
      try {
        expect(settled).toBe(false);
        await expectPending(stores);
      } finally {
        saved.resolve(undefined);
      }
      expect((await pending).kind).toBe('accepted');
    });

    test('lost response after simulated receiver commit reconciles by lookup only', async () => {
      const stores = await fixture();
      let committed: string | undefined;
      const fault = new Error('response lost');
      const remote = receiver(stores, async (shape) => {
        if (shape === 'acquireRuntimeAuthority') {
          committed = await receiptBytes(stores);
          throw fault;
        }
        if (committed === undefined) throw new Error('receiver receipt absent');
        return new Response(committed);
      });
      expect(await dispatch(stores, remote.client)).toMatchObject({
        kind: 'pending',
        observation: { kind: 'unconfirmed', failure: { code: 'transport', cause: fault } },
      });
      await expectPending(stores);
      const reply = await dispatch(stores, remote.client);
      expect(reply.kind).toBe('accepted');
      expect(remote.sent.map((sent) => sent.shape)).toEqual([
        'acquireRuntimeAuthority',
        'lookupRuntimeReceipt',
      ]);
    });

    test.each([
      [409, 'runtime_authority_stale'],
      [409, 'runtime_ledger_mismatch'],
      [403, 'person_not_bound'],
    ] as const)('validated receiver refusal %s %s stays pending', async (status, error) => {
      const stores = await fixture();
      const remote = receiver(stores, () => Promise.resolve(Response.json({ error }, { status })));
      expect(await dispatch(stores, remote.client)).toMatchObject({
        kind: 'pending',
        observation: {
          kind: 'receiver_refused',
          reply: { kind: 'refusal', status, body: { error } },
        },
      });
      await expectPending(stores);
      expect(remote.sent).toHaveLength(1);
    });

    test('cancelled transport remains unconfirmed and duplicate only looks up', async () => {
      const stores = await fixture();
      const controller = new AbortController();
      const remote = receiver(stores, async () => {
        controller.abort();
        return new Response(await receiptBytes(stores));
      });
      expect(
        await dispatch(stores, remote.client, stores.runs, stores.artifacts, controller.signal),
      ).toMatchObject({
        kind: 'pending',
        observation: { kind: 'unconfirmed', failure: { code: 'cancelled' } },
      });
      await expectPending(stores);
      expect(
        await dispatch(stores, remote.client, stores.runs, stores.artifacts, controller.signal),
      ).toMatchObject({
        kind: 'pending',
        observation: { kind: 'unconfirmed', failure: { code: 'cancelled' } },
      });
      expect(remote.sent).toHaveLength(1);
    });

    test.each([
      [200, '{broken'],
      [200, '{"schemaVersion":2}'],
      [409, '{"error":"future_refusal"}'],
      [418, 'unknown'],
    ] as const)(
      'invalid reply status %s bytes %s throws correlated and keeps pending',
      async (status, bytes) => {
        const stores = await fixture();
        const remote = receiver(stores, () => Promise.resolve(new Response(bytes, { status })));
        const pending = dispatch(stores, remote.client);
        await expectCorrelated(pending, retainedIntent(stores));
        await expectPending(stores);
        expect(remote.sent).toHaveLength(1);
      },
    );

    test('valid schema with wrong correspondence throws correlated', async () => {
      const stores = await fixture();
      const remote = receiver(stores, async () =>
        Response.json({ ...authorityReceipt(await retainedIntent(stores)), commandId: 'another' }),
      );
      const pending = dispatch(stores, remote.client);
      await expectCorrelated(pending, retainedIntent(stores));
      await expectPending(stores);
    });

    test.each(['absent', 'status'] as const)(
      'success with %s actual capture throws correlated',
      async (fault) => {
        const stores = await fixture();
        const remote = receiver(stores);
        const client: RuntimeClient = {
          ...remote.client,
          async acquireAuthority(input) {
            const exchange = await remote.client.acquireAuthority(input);
            return {
              ...exchange,
              response:
                fault === 'absent'
                  ? null
                  : { status: 201, bytes: exchange.response?.bytes ?? new Uint8Array() },
            };
          },
        };
        const pending = dispatch(stores, client);
        const failure = await expectCorrelated(pending, retainedIntent(stores));
        expect(failure.cause).toBeInstanceOf(Error);
        if (!(failure.cause instanceof Error)) throw new Error('missing cause');
        expect(failure.cause.message).toBe('runtime receipt capture differs');
        await expectPending(stores);
      },
    );

    test.each(['throw', 'metadata', 'unreadable', 'corrupt'] as const)(
      'artifact %s fault throws correlated without acknowledgement',
      async (boundary) => {
        const stores = await fixture();
        const fault = new Error('private artifact fault');
        const artifacts: ArtifactStore = {
          async retainArtifact(content, type) {
            if (boundary === 'throw') throw fault;
            if (boundary === 'metadata') return { kind: 'refused', reason: 'metadata_conflict' };
            return await stores.artifacts.retainArtifact(content, type);
          },
          async readArtifact(ref) {
            if (boundary === 'unreadable') throw fault;
            const content = await stores.artifacts.readArtifact(ref);
            if (boundary === 'corrupt') content[0] = 0;
            return content;
          },
        };
        const remote = receiver(stores);
        const pending = dispatch(stores, remote.client, stores.runs, artifacts);
        const failure = await expectCorrelated(
          pending,
          retainedIntent(stores),
          boundary === 'throw' || boundary === 'unreadable' ? fault : undefined,
        );
        if (boundary === 'metadata') {
          expect(failure.cause).toBeInstanceOf(Error);
          if (!(failure.cause instanceof Error)) throw new Error('missing cause');
          expect(failure.cause.message).toBe('runtime receipt artifact metadata differs');
        }
        await expectPending(stores);
        expect(remote.sent).toHaveLength(1);
      },
    );

    test('duplicate accepted returns original evidence without HTTP or replacement', async () => {
      const stores = await fixture();
      const remote = receiver(stores);
      const first = await dispatch(stores, remote.client);
      expect(first.kind).toBe('accepted');
      const before = await stores.runs.readRuntimeScope(runtimeScope);
      const artifacts: ArtifactStore = {
        ...stores.artifacts,
        retainArtifact() {
          throw new Error('must not replace original artifact');
        },
      };
      expect(await dispatch(stores, remote.client, stores.runs, artifacts)).toEqual(first);
      expect(remote.sent).toHaveLength(1);
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toEqual(before);
    });

    test('historical acceptance under new local epoch maps no grant', async () => {
      const stores = await fixture();
      const intent = unwrapReply(
        await stores.runs.stageRuntimeRequest(stores.guard, authorityRequest()),
      );
      stores.clock.advance(100);
      const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-B'), 1));
      const remote = receiver(stores);
      const reply = await dispatch(
        stores,
        remote.client,
        stores.runs,
        stores.artifacts,
        activeSignal(),
        { ...stores.guard, ownership, expectedRevision: 1 },
      );
      expect(reply).toMatchObject({ kind: 'accepted', intent });
      expect(remote.sent.map((sent) => sent.shape)).toEqual(['lookupRuntimeReceipt']);
      expect(await readRuntimeHistory(stores.runs, stores.artifacts, runtimeScope)).toMatchObject({
        ownerEpoch: 2,
        grant: null,
        pendingCommandId: null,
      });
    });

    test('compatible representations racing acceptance return first persisted artifact', async () => {
      const stores = await fixture();
      const posted = deferred<undefined>();
      const post = deferred<Response>();
      const remote = receiver(stores, async (shape) => {
        if (shape === 'acquireRuntimeAuthority') {
          posted.resolve(undefined);
          return await post.promise;
        }
        return new Response(await receiptBytes(stores, 'lookup winner'));
      });
      const first = dispatch(stores, remote.client);
      await posted.promise;
      const winner = await dispatch(stores, remote.client);
      expect(winner.kind).toBe('accepted');
      post.resolve(new Response(await receiptBytes(stores, 'different delayed post')));
      const loser = await first;
      expect(loser).toEqual(winner);
      expect(loser.kind).toBe('accepted');
      if (loser.kind !== 'accepted') throw new Error('missing accepted');
      expect(
        new TextDecoder().decode(await stores.artifacts.readArtifact(loser.acceptance.evidence)),
      ).toBe(await receiptBytes(stores, 'lookup winner'));
      expect(remote.sent).toHaveLength(2);
    });

    test('unrelated revision conflict stays pending with exact stagedRevision', async () => {
      const stores = await fixture();
      const remote = receiver(stores);
      let revision: number | undefined;
      const runs: RunStore = {
        ...stores.runs,
        async recordRuntimeAcceptance(guard) {
          revision = guard.expectedRevision;
          return await Promise.resolve({ kind: 'refused', reason: 'revision_conflict' });
        },
      };
      expect(await dispatch(stores, remote.client, runs)).toMatchObject({
        kind: 'pending',
        observation: { kind: 'local_refused', reason: 'revision_conflict' },
      });
      expect(revision).toBe(1);
      await expectPending(stores);
      expect(remote.sent).toHaveLength(1);
    });

    test('capture bytes detach before artifact retention await', async () => {
      const stores = await fixture();
      const retaining = deferred<undefined>();
      const gate = deferred<undefined>();
      let captured: Uint8Array | undefined;
      const remote = receiver(stores);
      const client: RuntimeClient = {
        ...remote.client,
        async acquireAuthority(input) {
          const exchange = await remote.client.acquireAuthority(input);
          captured = exchange.response?.bytes;
          return exchange;
        },
      };
      const artifacts: ArtifactStore = {
        ...stores.artifacts,
        async retainArtifact(content, type) {
          retaining.resolve(undefined);
          await gate.promise;
          return await stores.artifacts.retainArtifact(content, type);
        },
      };
      const pending = dispatch(stores, client, stores.runs, artifacts);
      await retaining.promise;
      if (captured === undefined) throw new Error('capture missing');
      captured.fill(0);
      gate.resolve(undefined);
      const reply = await pending;
      expect(reply.kind).toBe('accepted');
      if (reply.kind !== 'accepted') throw new Error('acceptance missing');
      expect(
        new TextDecoder().decode(await stores.artifacts.readArtifact(reply.acceptance.evidence)),
      ).toBe(await receiptBytes(stores));
    });

    test('duplicate accepted evidence is verified before acknowledgement', async () => {
      const stores = await fixture();
      const remote = receiver(stores);
      const accepted = await dispatch(stores, remote.client);
      expect(accepted.kind).toBe('accepted');
      if (accepted.kind !== 'accepted') throw new Error('missing historical acceptance');
      const fault = new Error('historical artifact unreadable');
      const artifacts: ArtifactStore = {
        ...stores.artifacts,
        readArtifact() {
          throw fault;
        },
      };
      await expectCorrelated(
        dispatch(stores, remote.client, stores.runs, artifacts),
        retainedIntent(stores),
        fault,
      );
      expect(remote.sent).toHaveLength(1);
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        pendingCommandId: null,
        acceptances: [accepted.acceptance],
      });
    });

    test.each(['renew', 'lookup', 'save'] as const)(
      'unexpected %s dependency fault preserves pending correlation',
      async (boundary) => {
        const stores = await fixture();
        const fault = new Error('private dependency secret');
        if (boundary === 'lookup')
          unwrapReply(await stores.runs.stageRuntimeRequest(stores.guard, authorityRequest()));
        const remote = receiver(stores);
        const client: RuntimeClient = {
          ...remote.client,
          lookupReceipt: async (input) => {
            if (boundary === 'lookup') throw fault;
            return await remote.client.lookupReceipt(input);
          },
        };
        const runs: RunStore = {
          ...stores.runs,
          renewOwnership: async (ownership) => {
            if (boundary === 'renew') throw fault;
            return await stores.runs.renewOwnership(ownership);
          },
          recordRuntimeAcceptance: async (guard, input) => {
            if (boundary === 'save') throw fault;
            return await stores.runs.recordRuntimeAcceptance(guard, input);
          },
        };
        await expectCorrelated(dispatch(stores, client, runs), retainedIntent(stores), fault);
        await expectPending(stores);
        expect(remote.sent).toHaveLength(boundary === 'save' ? 1 : 0);
      },
    );

    test('non-conflict local save refusal stays pending without winner reread', async () => {
      const stores = await fixture();
      const remote = receiver(stores);
      let reads = 0;
      const runs: RunStore = {
        ...stores.runs,
        async recordRuntimeAcceptance() {
          return await Promise.resolve({ kind: 'refused', reason: 'owner_stale' });
        },
        async readRuntimeScope(scope) {
          reads++;
          return await stores.runs.readRuntimeScope(scope);
        },
      };
      expect(await dispatch(stores, remote.client, runs)).toMatchObject({
        kind: 'pending',
        observation: { kind: 'local_refused', reason: 'owner_stale' },
      });
      expect(reads).toBe(0);
      await expectPending(stores);
    });

    test('winner reread requires the complete original intent', async () => {
      const stores = await fixture();
      const posted = deferred<undefined>();
      const post = deferred<Response>();
      let misdirect = false;
      const remote = receiver(stores, async (shape) => {
        if (shape === 'acquireRuntimeAuthority') {
          posted.resolve(undefined);
          return await post.promise;
        }
        return new Response(await receiptBytes(stores, 'winner'));
      });
      const runs: RunStore = {
        ...stores.runs,
        async readRuntimeScope(scope) {
          const history = await stores.runs.readRuntimeScope(scope);
          if (misdirect && history.kind === 'pinned')
            return {
              ...history,
              intents: history.intents.map((intent) => ({
                ...intent,
                localOwner: { ...intent.localOwner, epoch: 77 },
              })),
            };
          return history;
        },
      };
      const pending = dispatch(stores, remote.client, runs);
      await posted.promise;
      const winner = await dispatch(stores, remote.client);
      if (winner.kind !== 'accepted') throw new Error('missing winner acceptance');
      misdirect = true;
      post.resolve(new Response(await receiptBytes(stores, 'losing response')));
      expect(await pending).toMatchObject({
        kind: 'pending',
        observation: { kind: 'local_refused', reason: 'identity_conflict' },
      });
      expect(await readRuntimeHistory(stores.runs, stores.artifacts, runtimeScope)).toMatchObject({
        pendingCommandId: null,
        acceptances: [winner.acceptance],
      });
      expect(remote.sent).toHaveLength(2);
    });

    test('error correlation detaches and freezes every intent field', async () => {
      const stores = await fixture();
      const submitted = unwrapReply(
        await stores.runs.stageRuntimeRequest(stores.guard, authorityRequest()),
      );
      const before = structuredClone(submitted);
      const fault = new Error('private cause');
      const failure = new RuntimeDispatchError(submitted, fault);
      Object.assign(submitted.localOwner, { epoch: 88 });
      Object.assign(submitted, { commandId: 'changed' });
      expect(failure.intent).toEqual(before);
      expect(failure.cause).toBe(fault);
      expect(failure.message).toBe('Runtime dispatch failed');
      expect(Object.isFrozen(failure.intent)).toBe(true);
      expect(Object.isFrozen(failure.intent.localOwner)).toBe(true);
    });

    test('stage owns scope ledger and non-authority refusals without HTTP', async () => {
      const stores = await fixture();
      const remote = receiver(stores);
      const command = dependentReceiptFixture().intent.canonicalRequest;
      for (const [canonical, reason] of [
        [
          authorityRequest('acquire', null, { ...runtimeScope, personId: 'other' }),
          'authority_conflict',
        ],
        [
          authorityRequest().replace('"expectedLedgerId":"ledger"', '"expectedLedgerId":"other"'),
          'authority_conflict',
        ],
        [command, 'state_conflict'],
      ] as const) {
        expect(
          await dispatchAuthority(
            stores.runs,
            stores.artifacts,
            remote.client,
            stores.guard,
            canonical,
            activeSignal(),
          ),
        ).toEqual({ kind: 'refused', reason });
      }
      expect(remote.sent).toHaveLength(0);
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        intents: [],
        acceptances: [],
      });
    });

    test('retained non-authority correspondence fault throws before HTTP', async () => {
      const stores = await fixture();
      const remote = receiver(stores);
      const command = dependentReceiptFixture().intent.canonicalRequest;
      let retained: RuntimeIntent | undefined;
      const runs: RunStore = {
        ...stores.runs,
        async stageRuntimeRequest(guard, canonical) {
          const reply = await stores.runs.stageRuntimeRequest(guard, canonical);
          if (reply.kind === 'refused') return reply;
          retained = { ...reply.value, canonicalRequest: command };
          return { ...reply, value: retained };
        },
      };
      const observation = await dispatch(stores, remote.client, runs).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(observation).toBeInstanceOf(RuntimeDispatchError);
      if (!(observation instanceof RuntimeDispatchError)) throw new Error('missing correlation');
      if (retained === undefined) throw new Error('retained intent missing');
      expect(observation.intent).toEqual(retained);
      expect(observation.cause).toBeInstanceOf(Error);
      if (!(observation.cause instanceof Error)) throw new Error('missing cause');
      expect(observation.cause.message).toBe('retained runtime intent is not authority');
      expect(remote.sent).toHaveLength(0);
      await expectPending(stores);
    });

    test('shared client invalid request after staging throws correlated without HTTP', async () => {
      const stores = await fixture();
      const remote = receiver(stores);
      const scope = { ...runtimeScope, projectId: '..' };
      unwrapReply(
        await stores.runs.pinRuntimeScope(stores.guard.ownership, { ...runtimePin, scope }),
      );
      const guard = { ...stores.guard, scope };
      const canonical = authorityRequest('acquire', null, scope);
      const observed = dispatchAuthority(
        stores.runs,
        stores.artifacts,
        remote.client,
        guard,
        canonical,
        activeSignal(),
      ).then(
        () => null,
        (cause: unknown) => cause,
      );
      const failure = await observed;
      expect(failure).toBeInstanceOf(RuntimeDispatchError);
      expect(remote.sent).toHaveLength(0);
      expect(await stores.runs.readRuntimeScope(scope)).toMatchObject({
        pendingCommandId: 'acquire',
        acceptances: [],
        grant: null,
      });
    });

    test('malformed and unpinned trusted input throws before HTTP', async () => {
      const stores = await fixture();
      const remote = receiver(stores);
      for (const canonical of ['{broken', authorityRequest() + ' ']) {
        const observation = await dispatchAuthority(
          stores.runs,
          stores.artifacts,
          remote.client,
          stores.guard,
          canonical,
          activeSignal(),
        ).then(
          () => null,
          (cause: unknown) => cause,
        );
        expect(observation).toBeInstanceOf(Error);
        expect(observation).not.toBeInstanceOf(RuntimeDispatchError);
      }
      const unpinned = { ...stores.guard, scope: { ...runtimeScope, personId: 'not-pinned' } };
      const observation = await dispatchAuthority(
        stores.runs,
        stores.artifacts,
        remote.client,
        unpinned,
        authorityRequest('acquire', null, unpinned.scope),
        activeSignal(),
      ).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(observation).toBeInstanceOf(Error);
      expect(observation).not.toBeInstanceOf(RuntimeDispatchError);
      expect(remote.sent).toHaveLength(0);
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        intents: [],
        acceptances: [],
      });
    });

    test('unexpected persistence exception preserves original cause and detached correlation', async () => {
      const stores = await fixture();
      const remote = receiver(stores);
      const fault = new Error('private persistence secret');
      let submitted: RuntimeIntent | undefined;
      const runs: RunStore = {
        ...stores.runs,
        async recordRuntimeAcceptance(_guard, input) {
          submitted = input.intent;
          return await Promise.reject(fault);
        },
      };
      const pending = dispatch(stores, remote.client, runs);
      await expectCorrelated(pending, retainedIntent(stores), fault);
      if (submitted === undefined) throw new Error('save never called');
      expect(equalRecords(submitted, await retainedIntent(stores))).toBe(true);
      await expectPending(stores);
    });
  });
}
