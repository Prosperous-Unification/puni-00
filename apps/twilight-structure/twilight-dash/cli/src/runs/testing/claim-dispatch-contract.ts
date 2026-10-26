import { rejects } from 'node:assert/strict';

import { afterEach, describe, expect, test } from 'bun:test';

import { createRuntimeClient, type RuntimeClient } from '../../bridge/runtime-client';
import type { ArtifactStore } from '../artifact-store';
import { buildClaimRequest } from '../build-claim-request';
import { claimActivity } from '../claim-activity';
import { readExecutionHistory, stageClaimRequest } from '../claim-history';
import { dispatchAuthority } from '../dispatch-authority';
import { artifactDigest, executionCommandId, ownerId } from '../record-codecs';
import type { RunStore } from '../run-store';
import { readRuntimeRequest } from '../runtime-codecs';
import { RuntimeDispatchError } from '../runtime-dispatch-error';
import type { RuntimeIntent } from '../runtime-records';
import {
  createExecutionCommand,
  type OutcomeFixture,
  prepareSession,
  retainClaimReceipt,
  unwrapReply,
} from './fixtures';
import { authorityReceipt, authorityRequest } from './runtime-history-contract';

type Prepared = Awaited<ReturnType<typeof prepareSession>>;
type Setup = Prepared & {
  input: Parameters<typeof claimActivity>[4];
  guard: Parameters<typeof claimActivity>[3];
};
function held<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
const signal = () => new AbortController().signal;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
export async function claimDispatchFixture(stores: OutcomeFixture) {
  const prepared = await prepareSession(stores);
  const guard = await prepared.scopedGuard();
  const built = await buildClaimRequest(stores.runs, stores.artifacts, guard, {
    commandId: 'receiver-claim',
    stateEvidence: prepared.preparationInput.stateEvidence,
  });
  if (built.kind !== 'built') throw new Error('fixture claim build refused');
  return {
    ...prepared,
    guard,
    input: {
      ...built.request,
      commandId: executionCommandId('local-stage'),
      acceptanceCommandId: executionCommandId('local-accept'),
    },
  };
}
export async function claimDispatchIntent(setup: Prepared) {
  const history = await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId);
  const staged = history.executions.find((entry) => entry.command.kind === 'stage_claim');
  if (staged?.reply.kind !== 'claim_staged') throw new Error('fixture claim stage missing');
  return staged.reply.intent;
}
export async function claimDispatchBytes(setup: Prepared, extra = 'original') {
  const reference = await retainClaimReceipt(setup, await claimDispatchIntent(setup));
  const receipt: unknown = JSON.parse(
    new TextDecoder().decode(await setup.artifacts.readArtifact(reference)),
  );
  return JSON.stringify({ ...(receipt as object), futureCompatible: extra }, null, 2) + '\n';
}
function receiver(setup: Prepared, respond?: (shape: string) => Promise<Response>) {
  const sent: { shape: string; input: Parameters<Parameters<typeof createRuntimeClient>[0]>[1] }[] =
    [];
  const client = createRuntimeClient(async (shape, input) => {
    sent.push({ shape: shape.operationId, input });
    return respond === undefined
      ? new Response(await claimDispatchBytes(setup))
      : await respond(shape.operationId);
  });
  return { client, sent };
}
function dispatch(
  setup: Setup,
  client: RuntimeClient,
  runs: RunStore = setup.runs,
  artifacts = setup.artifacts,
  cancellation = signal(),
  guard = setup.guard,
  input = setup.input,
) {
  return claimActivity(runs, artifacts, client, guard, input, cancellation);
}
async function expectPending(setup: Prepared) {
  const history = await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId);
  expect(history.attempt.holdsCapacity).toBe(true);
  expect(history.attempt.state).toMatchObject({ kind: 'claiming' });
  expect(history.executions.filter((entry) => entry.command.kind === 'accept_claim')).toEqual([]);
  expect(history.completion).toBeNull();
}
async function correlated(pending: Promise<unknown>, setup: Prepared, message?: string) {
  const observation = await pending.then(
    (value) => ({ kind: 'returned' as const, value }),
    (cause: unknown) => ({ kind: 'threw' as const, cause }),
  );
  expect(observation.kind).toBe('threw');
  if (observation.kind !== 'threw' || !(observation.cause instanceof RuntimeDispatchError))
    throw new Error('missing fixed dispatch error');
  expect(observation.cause.message).toBe('Runtime dispatch failed');
  expect(observation.cause.intent).toEqual(await claimDispatchIntent(setup));
  expect(Object.isFrozen(observation.cause.intent)).toBe(true);
  if (message !== undefined) {
    expect(observation.cause.cause).toBeInstanceOf(Error);
    expect((observation.cause.cause as Error).message).toBe(message);
  }
  return observation.cause;
}

/** Real provider transactions and validated Response transport exercise sender election and historical acknowledgement reconciliation. */
export function claimDispatchContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    const opened: OutcomeFixture[] = [];
    afterEach(() => {
      for (const stores of opened.splice(0)) stores.close();
    });
    async function fixture() {
      const stores = await create();
      opened.push(stores);
      return await claimDispatchFixture(stores);
    }

    test('fresh stage commits locator before exact conditional POST and paired acknowledgement', async () => {
      const setup = await fixture();
      const entered = held();
      const commit = held();
      const renewing = held();
      const renew = held();
      const runs: RunStore = {
        ...setup.runs,
        async stageClaim(guard, command) {
          entered.resolve();
          await commit.promise;
          return await setup.runs.stageClaim(guard, command);
        },
        async renewOwnership(ownership) {
          renewing.resolve();
          await renew.promise;
          return await setup.runs.renewOwnership(ownership);
        },
      };
      const remote = receiver(setup);
      const cancellation = signal();
      const pending = dispatch(setup, remote.client, runs, setup.artifacts, cancellation);
      await entered.promise;
      await tick();
      try {
        expect(remote.sent).toHaveLength(0);
        expect(
          (await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)).attempt
            .state,
        ).toMatchObject({ kind: 'prepared', session: { locator: setup.locator } });
      } finally {
        commit.resolve();
      }
      await renewing.promise;
      await tick();
      try {
        expect(remote.sent).toHaveLength(0);
        await expectPending(setup);
      } finally {
        renew.resolve();
      }
      const reply = await pending;
      expect(reply.kind).toBe('accepted');
      if (reply.kind !== 'accepted') throw new Error('acceptance missing');
      const request = readRuntimeRequest(setup.input.canonicalRequest);
      expect(remote.sent).toEqual([
        {
          shape: 'applyRuntimeCommands',
          input: {
            params: { id: 'project' },
            query: undefined,
            body: { ...request.operation, personId: 'person' },
            signal: cancellation,
          },
        },
      ]);
      expect(reply.ack.kind).toBe('claim_accepted');
      expect(reply.ack.attempt.state).toMatchObject({
        kind: 'ready',
        execution: { session: { locator: setup.locator } },
      });
      expect(
        new TextDecoder().decode(await setup.artifacts.readArtifact(reply.ack.acceptance.evidence)),
      ).toBe(await claimDispatchBytes(setup));
      const history = await readExecutionHistory(
        setup.runs,
        setup.artifacts,
        setup.run.runId,
        setup.attempt.attemptId,
      );
      expect(history.executions.at(-1)?.reply).toEqual(reply.ack);
      expect(history.attempt.holdsCapacity).toBe(true);
      expect(history.completion).toBeNull();
    });

    test('pre-stage revision refusal sends nothing', async () => {
      const setup = await fixture();
      const remote = receiver(setup);
      expect(
        await dispatch(setup, remote.client, setup.runs, setup.artifacts, signal(), {
          ...setup.guard,
          expectedRevision: setup.guard.expectedRevision - 1,
        }),
      ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
      expect(remote.sent).toEqual([]);
    });

    test('concurrent exact calls elect one POST while lookup404 leaves original viable', async () => {
      const setup = await fixture();
      const posted = held();
      const response = held<Response>();
      const remote = receiver(setup, async (shape) => {
        if (shape === 'applyRuntimeCommands') {
          posted.resolve();
          return await response.promise;
        }
        return Response.json({ error: 'runtime_receipt_not_found' }, { status: 404 });
      });
      const first = dispatch(setup, remote.client);
      await posted.promise;
      const duplicate = await dispatch(setup, remote.client);
      expect(duplicate).toMatchObject({
        kind: 'pending',
        observation: {
          kind: 'receiver_refused',
          reply: { kind: 'refusal', status: 404, body: { error: 'runtime_receipt_not_found' } },
        },
      });
      await expectPending(setup);
      response.resolve(new Response(await claimDispatchBytes(setup)));
      expect((await first).kind).toBe('accepted');
      expect(remote.sent.map((sent) => sent.shape)).toEqual([
        'applyRuntimeCommands',
        'lookupRuntimeReceipt',
      ]);
      expect(remote.sent[1]?.input).toMatchObject({
        params: { id: 'project', commandId: 'receiver-claim' },
        query: { personId: 'person', expectedLedgerId: 'ledger' },
      });
    });

    for (const when of ['before renewal', 'during renewal'] as const)
      test('cancelled ' + when + ' retains pending without send', async () => {
        const setup = await fixture();
        const controller = new AbortController();
        const entered = held();
        const gate = held();
        let renewals = 0;
        const runs: RunStore = {
          ...setup.runs,
          async renewOwnership(ownership) {
            renewals++;
            entered.resolve();
            await gate.promise;
            return await setup.runs.renewOwnership(ownership);
          },
        };
        if (when === 'before renewal') controller.abort();
        const remote = receiver(setup);
        const pending = dispatch(setup, remote.client, runs, setup.artifacts, controller.signal);
        if (when === 'during renewal') {
          await entered.promise;
          controller.abort();
        }
        gate.resolve();
        expect(await pending).toMatchObject({
          kind: 'pending',
          observation: { kind: 'cancelled_before_dispatch' },
        });
        expect(renewals).toBe(when === 'before renewal' ? 0 : 1);
        expect(remote.sent).toEqual([]);
        await expectPending(setup);
      });

    test('takeover during renewal refuses stale sender without a POST', async () => {
      const setup = await fixture();
      const entered = held();
      const gate = held();
      const runs: RunStore = {
        ...setup.runs,
        async renewOwnership(ownership) {
          entered.resolve();
          await gate.promise;
          return await setup.runs.renewOwnership(ownership);
        },
      };
      const remote = receiver(setup);
      const pending = dispatch(setup, remote.client, runs);
      await entered.promise;
      setup.clock.advance(101);
      unwrapReply(await setup.runs.acquireOwnership(ownerId('new-owner'), setup.ownership.epoch));
      gate.resolve();
      expect(await pending).toMatchObject({
        kind: 'pending',
        observation: { kind: 'local_refused', reason: 'owner_stale' },
      });
      expect(remote.sent).toEqual([]);
      await expectPending(setup);
    });

    test('snapshots caller inputs before history await and retained intent before renewal await', async () => {
      const setup = await fixture();
      const reading = held();
      const read = held();
      const renewing = held();
      const renew = held();
      const input = structuredClone(setup.input);
      const guard = structuredClone(setup.guard);
      let returned: RuntimeIntent | undefined;
      const runs: RunStore = {
        ...setup.runs,
        async readExecutionHistory(runId, attemptId) {
          reading.resolve();
          await read.promise;
          return await setup.runs.readExecutionHistory(runId, attemptId);
        },
        async stageClaim(submitted, command) {
          const reply = await setup.runs.stageClaim(submitted, command);
          if (reply.kind !== 'refused') returned = reply.value.intent;
          return reply;
        },
        async renewOwnership(ownership) {
          renewing.resolve();
          await renew.promise;
          return await setup.runs.renewOwnership(ownership);
        },
      };
      const remote = receiver(setup);
      const pending = dispatch(setup, remote.client, runs, setup.artifacts, signal(), guard, input);
      await reading.promise;
      Object.assign(guard.ownership, { epoch: 99 });
      Object.assign(guard.scope, { personId: 'edited' });
      Object.assign(input, {
        acceptanceCommandId: executionCommandId('edited'),
        canonicalRequest: 'edited',
      });
      Object.assign(input.stateEvidence, { digest: 'f'.repeat(64) });
      read.resolve();
      await renewing.promise;
      if (returned === undefined) throw new Error('returned intent missing');
      Object.assign(returned, { stagedRevision: 99 });
      Object.assign(returned.localOwner, { epoch: 99 });
      renew.resolve();
      const reply = await pending;
      expect(reply.kind).toBe('accepted');
      if (reply.kind !== 'accepted') throw new Error('acceptance missing');
      expect(reply.intent).toEqual(await claimDispatchIntent(setup));
      expect(
        (
          await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)
        ).executions.at(-1)?.command.commandId,
      ).toBe(executionCommandId('local-accept'));
    });

    test('lost response uses old duplicate guard unchanged then explicit current guard accepts lookup only', async () => {
      const setup = await fixture();
      let committed: string | undefined;
      const remote = receiver(setup, async (shape) => {
        if (shape === 'applyRuntimeCommands') {
          committed = await claimDispatchBytes(setup);
          throw new Error('response lost after receiver commit');
        }
        if (committed === undefined) throw new Error('receiver receipt missing');
        return new Response(committed);
      });
      expect(await dispatch(setup, remote.client)).toMatchObject({
        kind: 'pending',
        observation: { kind: 'unconfirmed', failure: { code: 'transport' } },
      });
      const submitted: unknown[] = [];
      const runs: RunStore = {
        ...setup.runs,
        async recordClaimAcceptance(guard, command) {
          submitted.push(structuredClone(guard));
          return await setup.runs.recordClaimAcceptance(guard, command);
        },
      };
      expect(await dispatch(setup, remote.client, runs)).toMatchObject({
        kind: 'pending',
        observation: { kind: 'local_refused', reason: 'revision_conflict' },
      });
      expect(submitted).toEqual([setup.guard]);
      await expectPending(setup);
      const current = await setup.scopedGuard();
      expect(
        (await dispatch(setup, remote.client, runs, setup.artifacts, signal(), current)).kind,
      ).toBe('accepted');
      expect(submitted).toEqual([setup.guard, current]);
      expect(remote.sent.map((sent) => sent.shape)).toEqual([
        'applyRuntimeCommands',
        'lookupRuntimeReceipt',
        'lookupRuntimeReceipt',
      ]);
    });

    test('intervening fact during lookup preserves submitted revision conflict without refresh', async () => {
      const setup = await fixture();
      const controller = new AbortController();
      controller.abort();
      await dispatch(setup, receiver(setup).client, setup.runs, setup.artifacts, controller.signal);
      const current = await setup.scopedGuard();
      const remote = receiver(setup, async () => {
        unwrapReply(
          await setup.runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand(
              { kind: 'recovery_required', reason: 'intervening fact' },
              'intervening',
            ),
          ),
        );
        return new Response(await claimDispatchBytes(setup));
      });
      expect(
        await dispatch(setup, remote.client, setup.runs, setup.artifacts, signal(), current),
      ).toMatchObject({
        kind: 'pending',
        observation: { kind: 'local_refused', reason: 'revision_conflict' },
      });
      const history = await setup.runs.readExecutionHistory(
        setup.run.runId,
        setup.attempt.attemptId,
      );
      expect(history.attempt.state.kind).toBe('reconciling');
      expect(history.attempt.holdsCapacity).toBe(true);
      expect(remote.sent.map((sent) => sent.shape)).toEqual(['lookupRuntimeReceipt']);
    });

    test('duplicate accepted returns original complete paired ack after later recovery without HTTP or replacement', async () => {
      const setup = await fixture();
      const first = await dispatch(setup, receiver(setup).client);
      if (first.kind !== 'accepted') throw new Error('first acceptance missing');
      unwrapReply(
        await setup.runs.recordExecution(
          await setup.currentGuard(),
          createExecutionCommand(
            { kind: 'recovery_required', reason: 'later uncertainty' },
            'later',
          ),
        ),
      );
      const artifacts: ArtifactStore = {
        ...setup.artifacts,
        retainArtifact() {
          throw new Error('replacement forbidden');
        },
      };
      const remote = receiver(setup);
      expect(await dispatch(setup, remote.client, setup.runs, artifacts)).toEqual(first);
      expect(remote.sent).toEqual([]);
      expect(
        (await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)).attempt
          .revision,
      ).toBeGreaterThan(first.ack.attempt.revision);
    });

    test('same-ID byte-different winner returns exact original ack after current attempt advances', async () => {
      const setup = await fixture();
      const posted = held();
      const response = held<Response>();
      const firstRemote = receiver(setup, async () => {
        posted.resolve();
        return await response.promise;
      });
      const first = dispatch(setup, firstRemote.client);
      await posted.promise;
      const secondRemote = receiver(setup);
      const winner = await dispatch(
        setup,
        secondRemote.client,
        setup.runs,
        setup.artifacts,
        signal(),
        await setup.scopedGuard(),
      );
      if (winner.kind !== 'accepted') throw new Error('winner missing');
      unwrapReply(
        await setup.runs.recordExecution(
          await setup.currentGuard(),
          createExecutionCommand(
            { kind: 'recovery_required', reason: 'after winner' },
            'after-winner',
          ),
        ),
      );
      response.resolve(new Response(await claimDispatchBytes(setup, 'byte-different')));
      expect(await first).toEqual(winner);
      expect(firstRemote.sent.map((sent) => sent.shape)).toEqual(['applyRuntimeCommands']);
      expect(secondRemote.sent.map((sent) => sent.shape)).toEqual(['lookupRuntimeReceipt']);
    });

    test('different acceptance ID preserves actual identity conflict instead of borrowing winner', async () => {
      const setup = await fixture();
      expect((await dispatch(setup, receiver(setup).client)).kind).toBe('accepted');
      const remote = receiver(setup);
      expect(
        await dispatch(
          setup,
          remote.client,
          setup.runs,
          setup.artifacts,
          signal(),
          await setup.scopedGuard(),
          { ...setup.input, acceptanceCommandId: executionCommandId('different-accept') },
        ),
      ).toMatchObject({
        kind: 'pending',
        observation: { kind: 'local_refused', reason: 'identity_conflict' },
      });
      expect(remote.sent.map((sent) => sent.shape)).toEqual(['lookupRuntimeReceipt']);
    });

    test('winner requires the complete original intent provenance', async () => {
      const setup = await fixture();
      expect((await dispatch(setup, receiver(setup).client)).kind).toBe('accepted');
      const runs: RunStore = {
        ...setup.runs,
        async readExecutionHistory(runId, attemptId) {
          const history = structuredClone(await setup.runs.readExecutionHistory(runId, attemptId));
          for (const entry of history.executions)
            if (entry.command.kind === 'accept_claim')
              Object.assign(entry.command.intent.localOwner, {
                ownerId: ownerId('different-provenance'),
              });
          return history;
        },
      };
      const remote = receiver(setup, () =>
        Promise.resolve(Response.json({ error: 'runtime_receipt_not_found' }, { status: 404 })),
      );
      expect(await dispatch(setup, remote.client, runs)).toMatchObject({
        kind: 'pending',
        observation: { kind: 'receiver_refused', reply: { status: 404 } },
      });
      expect(remote.sent.map((sent) => sent.shape)).toEqual(['lookupRuntimeReceipt']);
    });

    test('duplicate historical evidence is verified before acknowledgement', async () => {
      const setup = await fixture();
      const first = await dispatch(setup, receiver(setup).client);
      if (first.kind !== 'accepted') throw new Error('first acceptance missing');
      const artifacts: ArtifactStore = {
        ...setup.artifacts,
        readArtifact(reference) {
          if (reference.digest === first.ack.acceptance.evidence.digest)
            throw new Error('historical evidence unreadable');
          return setup.artifacts.readArtifact(reference);
        },
      };
      const remote = receiver(setup);
      await correlated(
        dispatch(setup, remote.client, setup.runs, artifacts),
        setup,
        'historical evidence unreadable',
      );
      expect(remote.sent).toEqual([]);
    });

    for (const kind of ['reconciling', 'unresolved'] as const)
      test(
        'preexisting ' + kind + ' wrapper reconciles using explicit current revisions',
        async () => {
          const setup = await fixture();
          const controller = new AbortController();
          controller.abort();
          await dispatch(
            setup,
            receiver(setup).client,
            setup.runs,
            setup.artifacts,
            controller.signal,
          );
          const fact =
            kind === 'reconciling'
              ? { kind: 'recovery_required' as const, reason: 'recover' }
              : {
                  kind: 'unresolved' as const,
                  reason: 'uncertain',
                  evidence: setup.preparationInput.stateEvidence,
                };
          unwrapReply(
            await setup.runs.recordExecution(
              await setup.currentGuard(),
              createExecutionCommand(fact, 'wrapper'),
            ),
          );
          const remote = receiver(setup);
          const reply = await dispatch(
            setup,
            remote.client,
            setup.runs,
            setup.artifacts,
            signal(),
            await setup.scopedGuard(),
          );
          expect(reply.kind).toBe('accepted');
          if (reply.kind !== 'accepted') throw new Error('acceptance missing');
          expect(reply.ack.attempt.state).toMatchObject({
            kind: 'ready',
            execution: { session: { attachment: { kind: 'opened', owner: setup.owner } } },
          });
          expect(reply.ack.attempt.holdsCapacity).toBe(true);
          expect(remote.sent.map((sent) => sent.shape)).toEqual(['lookupRuntimeReceipt']);
        },
      );

    test('new owner late lookup preserves old attachment and cannot stage a turn', async () => {
      const setup = await fixture();
      const controller = new AbortController();
      controller.abort();
      await dispatch(setup, receiver(setup).client, setup.runs, setup.artifacts, controller.signal);
      setup.clock.advance(101);
      const ownership = unwrapReply(
        await setup.runs.acquireOwnership(ownerId('new-owner'), setup.ownership.epoch),
      );
      const guard = { ...(await setup.scopedGuard()), ownership };
      const remote = receiver(setup);
      const reply = await dispatch(
        setup,
        remote.client,
        setup.runs,
        setup.artifacts,
        signal(),
        guard,
      );
      expect(reply.kind).toBe('accepted');
      if (reply.kind !== 'accepted') throw new Error('late acceptance missing');
      expect(reply.ack.attempt.state).toMatchObject({
        kind: 'ready',
        execution: { session: { attachment: { kind: 'opened', owner: setup.owner } } },
      });
      expect(
        await setup.runs.stageTurn(
          { ...(await setup.scopedGuard()), ownership },
          {
            version: 2,
            kind: 'stage_turn',
            commandId: executionCommandId('late-turn'),
            request: {
              version: 1,
              turnKey: 'turn',
              owner: { ownerId: ownership.ownerId, epoch: ownership.epoch },
              cause: { kind: 'initial' },
              input: 'work',
            },
          },
        ),
      ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
      expect(remote.sent.map((sent) => sent.shape)).toEqual(['lookupRuntimeReceipt']);
      expect(
        (
          await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)
        ).executions.filter((entry) => entry.command.kind === 'stage_turn'),
      ).toEqual([]);
    });

    for (const identity of [
      'same local IDs',
      'invalid stage',
      'invalid acceptance',
      'extra input',
      'invalid evidence',
      'invalid guard',
    ] as const)
      test('rejects ' + identity + ' before history reads or HTTP', async () => {
        const setup = await fixture();
        const input = structuredClone(setup.input);
        const guard = structuredClone(setup.guard);
        let reads = 0;
        if (identity === 'same local IDs') input.acceptanceCommandId = input.commandId;
        if (identity === 'invalid stage') Object.assign(input, { commandId: '' });
        if (identity === 'invalid acceptance') Object.assign(input, { acceptanceCommandId: '' });
        if (identity === 'extra input') Object.assign(input, { sessionId: 'replacement' });
        if (identity === 'invalid evidence') Object.assign(input.stateEvidence, { byteLength: -1 });
        if (identity === 'invalid guard') Object.assign(guard, { expectedRevision: -1 });
        const runs: RunStore = {
          ...setup.runs,
          readExecutionHistory() {
            reads++;
            throw new Error('unexpected history read');
          },
        };
        const remote = receiver(setup);
        await rejects(
          dispatch(setup, remote.client, runs, setup.artifacts, signal(), guard, input),
        );
        expect(reads).toBe(0);
        expect(remote.sent).toEqual([]);
      });

    test('equal lexical receiver and local IDs retain their separate namespaces', async () => {
      const setup = await fixture();
      const reply = await dispatch(
        setup,
        receiver(setup).client,
        setup.runs,
        setup.artifacts,
        signal(),
        setup.guard,
        { ...setup.input, commandId: executionCommandId('receiver-claim') },
      );
      expect(reply.kind).toBe('accepted');
    });

    test('reused local stage ID for different bytes refuses without HTTP', async () => {
      const setup = await fixture();
      unwrapReply(
        await stageClaimRequest(setup.runs, setup.artifacts, setup.guard, {
          commandId: setup.input.commandId,
          canonicalRequest: setup.input.canonicalRequest,
          stateEvidence: setup.input.stateEvidence,
        }),
      );
      const remote = receiver(setup);
      expect(
        await dispatch(setup, remote.client, setup.runs, setup.artifacts, signal(), setup.guard, {
          ...setup.input,
          canonicalRequest: setup.input.canonicalRequest.replace(
            'receiver-claim',
            'changed-receiver',
          ),
        }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(remote.sent).toEqual([]);
    });

    test('artifact and local acceptance barriers precede acknowledgement', async () => {
      const setup = await fixture();
      const retaining = held();
      const retain = held();
      const saving = held();
      const save = held();
      let settled = false;
      const artifacts: ArtifactStore = {
        ...setup.artifacts,
        async retainArtifact(bytes, mediaType) {
          retaining.resolve();
          await retain.promise;
          return await setup.artifacts.retainArtifact(bytes, mediaType);
        },
      };
      const runs: RunStore = {
        ...setup.runs,
        async recordClaimAcceptance(guard, command) {
          saving.resolve();
          await save.promise;
          return await setup.runs.recordClaimAcceptance(guard, command);
        },
      };
      const pending = dispatch(setup, receiver(setup).client, runs, artifacts).then((reply) => {
        settled = true;
        return reply;
      });
      await retaining.promise;
      await tick();
      try {
        expect(settled).toBe(false);
        await expectPending(setup);
      } finally {
        retain.resolve();
      }
      await saving.promise;
      await tick();
      try {
        expect(settled).toBe(false);
        await expectPending(setup);
      } finally {
        save.resolve();
      }
      expect((await pending).kind).toBe('accepted');
    });

    for (const fault of [
      'missing capture',
      'capture status',
      'metadata',
      'wrong command',
      'missing bytes',
      'corrupt bytes',
      'malformed body',
      'invalid status',
      'configuration',
      'persistence',
    ] as const)
      test('correlates ' + fault + ' without local acceptance or capacity release', async () => {
        const setup = await fixture();
        const remote = receiver(setup, async () => {
          const literal = await claimDispatchBytes(setup);
          if (fault === 'malformed body') return new Response('{');
          if (fault === 'invalid status') return new Response(literal, { status: 201 });
          return new Response(literal);
        });
        const client: RuntimeClient = {
          ...remote.client,
          async applyCommands(input) {
            if (fault === 'configuration') throw new Error('transport configuration absent');
            const exchange = await remote.client.applyCommands(input);
            if (fault === 'missing capture') return { ...exchange, response: null };
            if (exchange.response === null) return exchange;
            if (fault === 'capture status')
              return { ...exchange, response: { ...exchange.response, status: 201 } };
            if (fault === 'wrong command')
              return {
                ...exchange,
                response: {
                  ...exchange.response,
                  bytes: new TextEncoder().encode(
                    new TextDecoder()
                      .decode(exchange.response.bytes)
                      .replace('receiver-claim', 'wrong-command'),
                  ),
                },
              };
            if (fault === 'missing bytes')
              return { ...exchange, response: { ...exchange.response, bytes: new Uint8Array() } };
            if (fault === 'corrupt bytes')
              return {
                ...exchange,
                response: { ...exchange.response, bytes: new TextEncoder().encode('{') },
              };
            return exchange;
          },
        };
        const artifacts: ArtifactStore = {
          ...setup.artifacts,
          retainArtifact:
            fault === 'metadata'
              ? () => Promise.resolve({ kind: 'refused', reason: 'metadata_conflict' })
              : (bytes, mediaType) => setup.artifacts.retainArtifact(bytes, mediaType),
        };
        const runs: RunStore = {
          ...setup.runs,
          recordClaimAcceptance:
            fault === 'persistence'
              ? () => {
                  throw new Error('injected persistence fault');
                }
              : (guard, command) => setup.runs.recordClaimAcceptance(guard, command),
        };
        const expected =
          fault === 'missing capture' || fault === 'capture status'
            ? 'runtime receipt capture differs'
            : fault === 'metadata'
              ? 'runtime receipt artifact metadata differs'
              : fault === 'configuration'
                ? 'transport configuration absent'
                : fault === 'persistence'
                  ? 'injected persistence fault'
                  : undefined;
        await correlated(dispatch(setup, client, runs, artifacts), setup, expected);
        await expectPending(setup);
      });

    test('typed receiver refusal remains pending', async () => {
      const setup = await fixture();
      const remote = receiver(setup, () =>
        Promise.resolve(Response.json({ error: 'runtime_authority_stale' }, { status: 409 })),
      );
      expect(await dispatch(setup, remote.client)).toMatchObject({
        kind: 'pending',
        observation: {
          kind: 'receiver_refused',
          reply: { kind: 'refusal', status: 409, body: { error: 'runtime_authority_stale' } },
        },
      });
      await expectPending(setup);
    });

    test('cancellation after send remains unconfirmed', async () => {
      const setup = await fixture();
      const controller = new AbortController();
      const remote = receiver(setup, async () => {
        controller.abort();
        return new Response(await claimDispatchBytes(setup));
      });
      expect(
        await dispatch(setup, remote.client, setup.runs, setup.artifacts, controller.signal),
      ).toMatchObject({
        kind: 'pending',
        observation: { kind: 'unconfirmed', failure: { code: 'cancelled' } },
      });
      await expectPending(setup);
    });

    test('malformed incoming evidence cannot hide behind a same-ID winner', async () => {
      const setup = await fixture();
      const posted = held();
      const response = held<Response>();
      const remote = receiver(setup, async () => {
        posted.resolve();
        return await response.promise;
      });
      const first = dispatch(setup, remote.client);
      const observed = first.then(
        (reply) => ({ reply }),
        (cause: unknown) => ({ cause }),
      );
      await posted.promise;
      const winner = await dispatch(
        setup,
        receiver(setup).client,
        setup.runs,
        setup.artifacts,
        signal(),
        await setup.scopedGuard(),
      );
      expect(winner.kind).toBe('accepted');
      const invalid = (await claimDispatchBytes(setup)).replace('receiver-claim', 'wrong-command');
      response.resolve(new Response(invalid));
      const final = await observed;
      expect('cause' in final && final.cause instanceof RuntimeDispatchError).toBe(true);
    });

    for (const host of ['claim', 'authority'] as const)
      for (const fault of [
        'capture status',
        'capture absence',
        'metadata refusal',
        'byte detachment',
        'reference detachment',
      ] as const)
        test('shared receipt ' + fault + ' through ' + host + ' host', async () => {
          const setup = await fixture();
          let captured: Uint8Array | undefined;
          let literal: string | undefined;
          const client = createRuntimeClient(async () => {
            if (host === 'claim') literal = await claimDispatchBytes(setup, 'shared-boundary');
            else {
              const scope = await setup.runs.readRuntimeScope(setup.scope);
              if (scope.kind !== 'pinned') throw new Error('scope missing');
              const intent = scope.intents.find(
                (candidate) => candidate.commandId === 'shared-authority',
              );
              if (intent === undefined) throw new Error('authority stage missing');
              literal = JSON.stringify(authorityReceipt(intent));
            }
            return new Response(literal);
          });
          const observe: typeof client.applyCommands = async (input) => {
            const exchange = await client.applyCommands(input);
            captured = exchange.response?.bytes;
            return fault === 'capture absence'
              ? { ...exchange, response: null }
              : fault === 'capture status' && exchange.response !== null
                ? { ...exchange, response: { ...exchange.response, status: 201 } }
                : exchange;
          };
          const observeAuthority: typeof client.acquireAuthority = async (input) => {
            const exchange = await client.acquireAuthority(input);
            captured = exchange.response?.bytes;
            return fault === 'capture absence'
              ? { ...exchange, response: null }
              : fault === 'capture status' && exchange.response !== null
                ? { ...exchange, response: { ...exchange.response, status: 201 } }
                : exchange;
          };
          const artifacts: ArtifactStore = {
            ...setup.artifacts,
            async retainArtifact(bytes, mediaType) {
              expect(mediaType).toBe('application/json');
              if (fault === 'metadata refusal')
                return { kind: 'refused', reason: 'metadata_conflict' };
              if (fault === 'byte detachment') {
                if (captured === undefined) throw new Error('capture missing');
                captured.fill(0);
              }
              const retained = await setup.artifacts.retainArtifact(bytes, mediaType);
              if (fault === 'reference detachment' && retained.kind === 'retained') {
                const reference = retained.reference;
                return Object.defineProperty({ kind: 'retained' as const }, 'reference', {
                  get() {
                    queueMicrotask(() =>
                      Object.assign(reference, { digest: artifactDigest('f'.repeat(64)) }),
                    );
                    return reference;
                  },
                }) as typeof retained;
              }
              return retained;
            },
          };
          const observedClient = {
            ...client,
            applyCommands: observe,
            acquireAuthority: observeAuthority,
          };
          const pending =
            host === 'claim'
              ? dispatch(setup, observedClient, setup.runs, artifacts)
              : dispatchAuthority(
                  setup.runs,
                  artifacts,
                  observedClient,
                  {
                    ownership: setup.ownership,
                    scope: setup.scope,
                    expectedRevision: setup.guard.expectedScopeRevision,
                  },
                  authorityRequest('shared-authority', 1, setup.scope),
                  signal(),
                );
          if (
            fault === 'capture status' ||
            fault === 'capture absence' ||
            fault === 'metadata refusal'
          ) {
            const observation = await pending.then(
              (reply) => ({ reply }),
              (cause: unknown) => ({ cause }),
            );
            expect(
              'cause' in observation && observation.cause instanceof RuntimeDispatchError,
            ).toBe(true);
            if (!('cause' in observation) || !(observation.cause instanceof RuntimeDispatchError))
              throw new Error('correlation missing');
            expect((observation.cause.cause as Error).message).toBe(
              fault === 'metadata refusal'
                ? 'runtime receipt artifact metadata differs'
                : 'runtime receipt capture differs',
            );
          } else {
            const reply = await pending;
            expect(reply.kind).toBe('accepted');
            if (reply.kind !== 'accepted') throw new Error('shared retention acceptance missing');
            if (literal === undefined) throw new Error('shared receipt literal missing');
            const evidence =
              'ack' in reply ? reply.ack.acceptance.evidence : reply.acceptance.evidence;
            expect(new TextDecoder().decode(await setup.artifacts.readArtifact(evidence))).toBe(
              literal,
            );
          }
        });

    for (const fault of ['absent', 'unreadable'] as const)
      test('actual retained receipt ' + fault + ' cannot acknowledge', async () => {
        const setup = await fixture();
        let evidenceDigest: string | undefined;
        const artifacts: ArtifactStore = {
          ...setup.artifacts,
          async retainArtifact(bytes, mediaType) {
            const retained = await setup.artifacts.retainArtifact(bytes, mediaType);
            if (retained.kind === 'retained') evidenceDigest = retained.reference.digest;
            return retained;
          },
          readArtifact(reference) {
            if (reference.digest === evidenceDigest) {
              if (fault === 'unreadable') throw new Error('receipt unreadable');
              return setup.artifacts.readArtifact({
                ...reference,
                digest: artifactDigest('f'.repeat(64)),
              });
            }
            return setup.artifacts.readArtifact(reference);
          },
        };
        await correlated(
          dispatch(setup, receiver(setup).client, setup.runs, artifacts),
          setup,
          fault === 'unreadable' ? 'receipt unreadable' : undefined,
        );
        await expectPending(setup);
      });

    test('reused local acceptance ID from an execution refuses its actual identity conflict', async () => {
      const setup = await fixture();
      const remote = receiver(setup);
      expect(
        await dispatch(setup, remote.client, setup.runs, setup.artifacts, signal(), setup.guard, {
          ...setup.input,
          acceptanceCommandId: setup.opened.commandId,
        }),
      ).toMatchObject({
        kind: 'pending',
        observation: { kind: 'local_refused', reason: 'identity_conflict' },
      });
      await expectPending(setup);
      expect(remote.sent.map((sent) => sent.shape)).toEqual(['applyRuntimeCommands']);
    });
  });
}
