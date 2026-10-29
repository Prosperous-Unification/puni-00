import { rejects, throws } from 'node:assert/strict';

import { afterEach, describe, expect, test } from 'bun:test';

import type { ActivityExecutor } from '../../agents/activity-executor';
import { createClaimClient } from '../../bridge/claim-client';
import { createRuntimeClient } from '../../bridge/runtime-client';
import { claimActivity } from '../claim-activity';
import { dispatchTurn } from '../dispatch-turn';
import { executionCommandId, ownerId } from '../record-codecs';
import type { StoreRefusal } from '../run-store';
import { TurnDispatchError } from '../turn-dispatch-error';
import { claimDispatchBytes, claimDispatchFixture } from './claim-dispatch-contract';
import { closeFixtures } from './close-fixtures';
import { createExecutionCommand, unwrapReply } from './fixtures';
import { type OutcomeFixture } from './fixtures';
export async function turnDispatchFixture(stores: OutcomeFixture) {
  const setup = await claimDispatchFixture(stores);
  const accepted = await claimActivity(
    setup.runs,
    setup.artifacts,
    createRuntimeClient(async () => new Response(await claimDispatchBytes(setup))),
    setup.guard,
    setup.input,
    new AbortController().signal,
  );
  if (accepted.kind !== 'accepted' || accepted.ack.attempt.state.kind !== 'ready')
    throw new Error('fixture claim missing');
  const binding = {
    claimId: 'claim',
    workItemId: 'work',
    stepId: 'step',
    parentClaimId: null,
    execution: {
      storeId: setup.ownership.storeId,
      runId: setup.run.runId,
      attemptId: setup.attempt.attemptId,
      sessionId: setup.locator.session.sessionId,
    },
  };
  const state = {
    ...setup.state,
    claims: [
      {
        kind: 'runtime' as const,
        claim: {
          id: 'claim',
          workItemId: 'work',
          stepId: 'step',
          personId: 'person',
          runId: setup.locator.session.sessionId,
          parentClaimId: null,
          accountId: 'account',
        },
        binding,
      },
    ],
  };
  const lease = {
    readAt: 1000,
    claims: [
      {
        claimId: 'claim',
        workItemId: 'work',
        number: '1',
        numberIsFrozen: false,
        name: 'work',
        stepId: 'step',
        holder: { personId: 'person', name: 'person' },
        runId: setup.locator.session.sessionId,
        parentClaimId: null,
        claimedAt: 900,
        leaseExpiresAt: 1100 as number | null,
        leaseRevokedAt: null as number | null,
      },
    ],
  };
  const session = { locator: structuredClone(setup.locator) };
  const calls: unknown[] = [];
  const executor: ActivityExecutor = {
    kind: 'human',
    version: 'human-1',
    capabilities: {
      locateSession: 'unsupported',
      resumeSession: 'unsupported',
      deduplicatePreparation: 'unsupported',
      deduplicateTurn: 'unsupported',
      inspectEffect: 'unsupported',
      cancelPhysicalWork: 'unsupported',
      observeQuiescence: 'unsupported',
    },
    open() {
      return Promise.reject(new Error('forbidden open'));
    },
    lookupSession() {
      return Promise.reject(new Error('forbidden lookup'));
    },
    resumeSession() {
      return Promise.reject(new Error('forbidden resume'));
    },
    inspectEffect() {
      return Promise.reject(new Error('forbidden effect'));
    },
    cancel() {
      return Promise.reject(new Error('forbidden cancel'));
    },
    observeQuiescence() {
      return Promise.reject(new Error('forbidden quiescence'));
    },
    close() {
      return Promise.reject(new Error('forbidden close'));
    },
    turn(live, request, control) {
      calls.push({ live, request, control });
      return Promise.resolve({
        kind: 'completed',
        identity: { locator: live.locator, turnKey: request.turnKey, owner: request.owner },
        outcome: {
          text: 'full text\nkept',
          usage: { kind: 'measured', inputTokens: 0, outputTokens: 0 },
          finish: 'end_turn',
        },
      });
    },
  };
  const input = {
    stageCommandId: executionCommandId('turn-stage'),
    observedCommandId: executionCommandId('turn-observed'),
    request: {
      version: 1 as const,
      turnKey: 'turn',
      owner: setup.owner,
      cause: { kind: 'initial' as const },
      input: 'work',
    },
  };
  const control = { signal: new AbortController().signal, onPart: () => undefined };
  const runtimeCalls: unknown[] = [];
  const claimCalls: unknown[] = [];
  const runtime = createRuntimeClient((_shape, input) => {
    runtimeCalls.push(input);
    return Promise.resolve(Response.json(state));
  });
  const claims = createClaimClient((_shape, input) => {
    claimCalls.push(input);
    return Promise.resolve(Response.json(lease));
  });
  return {
    ...setup,
    accepted,
    state,
    lease,
    session,
    executor,
    calls,
    input,
    control,
    runtime,
    claims,
    runtimeCalls,
    claimCalls,
    guard: structuredClone(await setup.scopedGuard()),
  };
}
function held<T = void>() {
  let resolve: (value: T) => void = () => {
    throw new Error('uninitialized resolver');
  };
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
export function turnDispatchContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    const opened: OutcomeFixture[] = [];
    afterEach(async () => {
      await closeFixtures(opened.splice(0));
    });
    async function fixture() {
      const stores = await create();
      opened.push(stores);
      return await turnDispatchFixture(stores);
    }
    function dispatch(setup: Awaited<ReturnType<typeof fixture>>, runs = setup.runs) {
      return dispatchTurn(
        runs,
        setup.artifacts,
        setup.runtime,
        setup.claims,
        setup.executor,
        setup.session,
        setup.guard,
        setup.input,
        setup.control,
      );
    }
    test('fresh turn stores complete returned observation and retains capacity', async () => {
      const setup = await fixture();
      expect(await dispatch(setup)).toMatchObject({
        kind: 'observed',
        attempt: {
          state: {
            kind: 'turn_returned',
            reply: {
              outcome: {
                text: 'full text\nkept',
                usage: { kind: 'measured', inputTokens: 0, outputTokens: 0 },
                finish: 'end_turn',
              },
            },
          },
          holdsCapacity: true,
        },
      });
      expect(setup.calls).toHaveLength(1);
      expect((setup.calls[0] as { live: unknown }).live).toBe(setup.session);
      const history = await setup.runs.readExecutionHistory(
        setup.run.runId,
        setup.attempt.attemptId,
      );
      expect(history.completion).toBeNull();
      expect(history.receipt).toBeNull();
    });
    for (const fault of [
      'expired',
      'equal',
      'revoked',
      'id',
      'missing',
      'ambiguous',
      'holder',
      'run',
      'work',
      'step',
      'parent',
      'ordinary',
      'binding',
      'authority',
      'ledger',
      'scope',
    ] as const)
      test('refuses fresh live ' + fault + ' before stage', async () => {
        const setup = await fixture();
        const lease = setup.lease.claims[0];
        const inventory = setup.state.claims[0];
        switch (fault) {
          case 'id':
            lease.claimId = 'other';
            break;
          case 'expired':
            lease.leaseExpiresAt = 999;
            break;
          case 'equal':
            lease.leaseExpiresAt = 1000;
            break;
          case 'revoked':
            lease.leaseRevokedAt = 999;
            break;
          case 'missing':
            setup.lease.claims = [];
            break;
          case 'ambiguous':
            setup.lease.claims.push(structuredClone(lease));
            break;
          case 'holder':
            lease.holder.personId = 'other';
            break;
          case 'run':
            lease.runId = 'run';
            break;
          case 'work':
            lease.workItemId = 'other';
            break;
          case 'step':
            lease.stepId = 'other';
            break;
          case 'parent':
            lease.parentClaimId = 'other' as never;
            break;
          case 'ordinary':
            Object.assign(inventory, { kind: 'ordinary' });
            break;
          case 'binding':
            inventory.binding.execution.attemptId = 'other' as never;
            break;
          case 'authority':
            setup.state.authority = { kind: 'held', ownerId: 'other', generation: 1 };
            break;
          case 'ledger':
            setup.state.ledgerId = 'other';
            break;
          case 'scope':
            setup.state.scope = { ...setup.scope, personId: 'other' };
            break;
        }
        expect(await dispatch(setup)).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        expect(setup.calls).toHaveLength(0);
        expect(
          (await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)).attempt
            .state.kind,
        ).toBe('ready');
      });
    test('duplicate historical staging replays after returned state without observations or second turn', async () => {
      const setup = await fixture();
      await dispatch(setup);
      const history = await setup.runs.readExecutionHistory(
        setup.run.runId,
        setup.attempt.attemptId,
      );
      const stage = history.executions.find((e) => e.command.kind === 'stage_turn');
      if (stage?.reply.kind !== 'turn_staged') throw new Error('historical stage missing');
      expect(await dispatch(setup)).toEqual({
        kind: 'pending',
        intent: stage.reply.intent,
        ack: stage.reply,
        observation: { kind: 'duplicate' },
      });
      expect(setup.calls).toHaveLength(1);
      expect(setup.runtimeCalls).toHaveLength(1);
      expect(setup.claimCalls).toHaveLength(1);
    });
    test('changed same-stage payload refuses without live reads', async () => {
      const setup = await fixture();
      await dispatch(setup);
      setup.input.request.input = 'changed';
      expect(await dispatch(setup)).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(setup.runtimeCalls).toHaveLength(1);
    });
    test('distinct local IDs reject before history', async () => {
      const setup = await fixture();
      setup.input.observedCommandId = setup.input.stageCommandId;
      let reads = 0;
      await rejects(
        dispatch(setup, {
          ...setup.runs,
          async readExecutionHistory(...args) {
            reads++;
            return await setup.runs.readExecutionHistory(...args);
          },
        }),
      );
      expect(reads).toBe(0);
    });
    for (const finish of [
      'end_turn',
      'max_steps',
      'output_truncated',
      'refused',
      'cancelled',
    ] as const)
      test('retains completed finish ' + finish, async () => {
        const setup = await fixture();
        setup.executor.turn = (live, request) =>
          Promise.resolve({
            kind: 'completed',
            identity: { locator: live.locator, turnKey: request.turnKey, owner: request.owner },
            outcome: {
              text: 'complete\ntext',
              usage: { kind: 'measured', inputTokens: 0, outputTokens: 0 },
              finish,
            },
          });
        expect(await dispatch(setup)).toMatchObject({
          kind: 'observed',
          attempt: {
            state: {
              kind: 'turn_returned',
              reply: { outcome: { text: 'complete\ntext', finish } },
            },
          },
        });
      });
    for (const reason of [
      'provider-usage-unavailable',
      'interrupted-before-usage',
      'acp-v1-no-usage',
      'harness-usage-unavailable',
      'tool',
      'human',
    ] as const)
      test('retains unknown usage ' + reason, async () => {
        const setup = await fixture();
        setup.executor.turn = (live, request) =>
          Promise.resolve({
            kind: 'completed',
            identity: { locator: live.locator, turnKey: request.turnKey, owner: request.owner },
            outcome: { text: '', usage: { kind: 'unknown', reason }, finish: 'end_turn' },
          });
        expect(await dispatch(setup)).toMatchObject({
          kind: 'observed',
          attempt: {
            state: { reply: { outcome: { text: '', usage: { kind: 'unknown', reason } } } },
          },
        });
      });
    for (const kind of ['unresolved', 'not_started'] as const)
      test('retains exact ' + kind + ' semantics without business completion', async () => {
        const setup = await fixture();
        setup.executor.turn = (live, request) => {
          const identity = {
            locator: live.locator,
            turnKey: request.turnKey,
            owner: request.owner,
          };
          return Promise.resolve(
            kind === 'unresolved'
              ? {
                  kind,
                  identity,
                  reason: 'transport_lost',
                  text: 'partial\ntext',
                  usage: { kind: 'unknown', reason: 'interrupted-before-usage' },
                }
              : { kind, identity, reason: 'session_busy' },
          );
        };
        expect(await dispatch(setup)).toMatchObject({
          kind: 'observed',
          attempt: {
            state: { kind: kind === 'unresolved' ? 'unresolved' : 'ready' },
            holdsCapacity: true,
          },
        });
        const history = await setup.runs.readExecutionHistory(
          setup.run.runId,
          setup.attempt.attemptId,
        );
        expect(history.executions.at(-1)).toMatchObject({
          command: { fact: { kind: 'turn_observed', reply: { kind } } },
        });
        if (kind === 'unresolved')
          expect(history.executions.at(-1)).toMatchObject({
            command: {
              fact: {
                reply: {
                  reason: 'transport_lost',
                  text: 'partial\ntext',
                  usage: { kind: 'unknown', reason: 'interrupted-before-usage' },
                },
              },
            },
          });
        expect(history.completion).toBeNull();
      });
    test('unleased null expiry is explicit live authority', async () => {
      const setup = await fixture();
      setup.lease.claims[0].leaseExpiresAt = null;
      expect((await dispatch(setup)).kind).toBe('observed');
    });
    for (const operation of ['runtime_state', 'claim_lease'] as const)
      for (const failure of [
        'refusal',
        'transport',
        'cancelled',
        'invalid',
        'unknown_status',
      ] as const)
        test('keeps ' + operation + ' ' + failure + ' observation distinct', async () => {
          const setup = await fixture();
          const controller = new AbortController();
          const transport = () => {
            if (failure === 'transport') throw new Error('wire lost');
            if (failure === 'unknown_status')
              return Promise.resolve(new Response('unexpected', { status: 418 }));
            if (failure === 'cancelled') {
              controller.abort();
              return Promise.resolve(Response.json({}));
            }
            return Promise.resolve(
              failure === 'refusal'
                ? Response.json({ error: 'not_found' }, { status: 404 })
                : Response.json({ broken: true }),
            );
          };
          const runtime =
            operation === 'runtime_state' ? createRuntimeClient(transport) : setup.runtime;
          const claims = operation === 'claim_lease' ? createClaimClient(transport) : setup.claims;
          const pending = dispatchTurn(
            setup.runs,
            setup.artifacts,
            runtime,
            claims,
            setup.executor,
            setup.session,
            setup.guard,
            setup.input,
            { ...setup.control, signal: controller.signal },
          );
          if (failure === 'invalid' || failure === 'unknown_status')
            await rejects(pending, new RegExp('Turn observation rejected exchange'));
          else
            expect(await pending).toMatchObject({
              kind: 'unconfirmed',
              operation,
              observation: { kind: failure === 'refusal' ? 'refusal' : 'failure' },
            });
          expect(setup.calls).toHaveLength(0);
          expect(
            (await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId))
              .attempt.state.kind,
          ).toBe('ready');
        });
    test('concurrent exact calls elect one executor and return full duplicate ack', async () => {
      const setup = await fixture();
      const entered = held();
      const finish = held();
      const turn = setup.executor.turn.bind(setup.executor);
      setup.executor.turn = async (...args) => {
        entered.resolve();
        await finish.promise;
        return await turn(...args);
      };
      const first = dispatch(setup);
      await entered.promise;
      const duplicate = await dispatch(setup);
      expect(duplicate).toMatchObject({
        kind: 'pending',
        ack: { kind: 'turn_staged', attempt: { state: { kind: 'turn_pending' } } },
        observation: { kind: 'duplicate' },
      });
      expect(setup.calls).toHaveLength(0);
      finish.resolve();
      expect((await first).kind).toBe('observed');
      expect(setup.calls).toHaveLength(1);
    });
    test('fresh staging race duplicate never dispatches', async () => {
      const setup = await fixture();
      const runs = {
        ...setup.runs,
        async stageTurn(
          guard: Parameters<typeof setup.runs.stageTurn>[0],
          command: Parameters<typeof setup.runs.stageTurn>[1],
        ) {
          unwrapReply(await setup.runs.stageTurn(guard, command));
          return await setup.runs.stageTurn(guard, command);
        },
      };
      expect(await dispatch(setup, runs)).toMatchObject({
        kind: 'pending',
        observation: { kind: 'duplicate' },
      });
      expect(setup.calls).toHaveLength(0);
    });
    test('awaits stage renewal and observation commits with submitted cuts', async () => {
      const setup = await fixture();
      const staging = held();
      const stage = held();
      const renewing = held();
      const renew = held();
      const recording = held();
      const record = held();
      const guards: unknown[] = [];
      let settled = false;
      const runs = {
        ...setup.runs,
        async stageTurn(
          guard: Parameters<typeof setup.runs.stageTurn>[0],
          command: Parameters<typeof setup.runs.stageTurn>[1],
        ) {
          staging.resolve();
          await stage.promise;
          return await setup.runs.stageTurn(guard, command);
        },
        async renewOwnership(owner: Parameters<typeof setup.runs.renewOwnership>[0]) {
          renewing.resolve();
          await renew.promise;
          return await setup.runs.renewOwnership(owner);
        },
        async recordExecution(
          guard: Parameters<typeof setup.runs.recordExecution>[0],
          command: Parameters<typeof setup.runs.recordExecution>[1],
        ) {
          guards.push(guard);
          recording.resolve();
          await record.promise;
          return await setup.runs.recordExecution(guard, command);
        },
      };
      const pending = dispatch(setup, runs).then((reply) => {
        settled = true;
        return reply;
      });
      await staging.promise;
      await tick();
      try {
        expect(setup.calls).toHaveLength(0);
        expect(
          (await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)).attempt
            .state.kind,
        ).toBe('ready');
      } finally {
        stage.resolve();
      }
      await renewing.promise;
      await tick();
      try {
        expect(setup.calls).toHaveLength(0);
        expect(
          (await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)).attempt
            .state.kind,
        ).toBe('turn_pending');
      } finally {
        renew.resolve();
      }
      await recording.promise;
      await tick();
      try {
        expect(settled).toBe(false);
        expect(setup.calls).toHaveLength(1);
        expect(guards).toEqual([
          {
            ownership: setup.guard.ownership,
            runId: setup.guard.runId,
            attemptId: setup.guard.attemptId,
            expectedRevision: setup.guard.expectedRevision + 1,
            expectedAttemptRevision: setup.guard.expectedAttemptRevision + 1,
          },
        ]);
      } finally {
        record.resolve();
      }
      expect((await pending).kind).toBe('observed');
    });
    for (const when of ['before', 'during'] as const)
      test('cancellation ' + when + ' renewal preserves pending', async () => {
        const setup = await fixture();
        const controller = new AbortController();
        let renewals = 0;
        const runs = {
          ...setup.runs,
          async stageTurn(...args: Parameters<typeof setup.runs.stageTurn>) {
            const staged = await setup.runs.stageTurn(...args);
            if (when === 'before') controller.abort();
            return staged;
          },
          async renewOwnership(...args: Parameters<typeof setup.runs.renewOwnership>) {
            renewals++;
            const renewed = await setup.runs.renewOwnership(...args);
            controller.abort();
            return renewed;
          },
        };
        expect(
          await dispatchTurn(
            runs,
            setup.artifacts,
            setup.runtime,
            setup.claims,
            setup.executor,
            setup.session,
            setup.guard,
            setup.input,
            { ...setup.control, signal: controller.signal },
          ),
        ).toMatchObject({ kind: 'pending', observation: { kind: 'cancelled_before_dispatch' } });
        expect(renewals).toBe(when === 'before' ? 0 : 1);
        expect(setup.calls).toHaveLength(0);
      });
    test('snapshot caller guard IDs request and controls before history await', async () => {
      const setup = await fixture();
      const reading = held();
      const read = held();
      const originalGuard = structuredClone(setup.guard);
      const originalRequest = structuredClone(setup.input.request);
      const originalSignal = setup.control.signal;
      const originalOnPart = setup.control.onPart;
      const runs = {
        ...setup.runs,
        async readExecutionHistory(...args: Parameters<typeof setup.runs.readExecutionHistory>) {
          reading.resolve();
          await read.promise;
          return await setup.runs.readExecutionHistory(...args);
        },
      };
      const pending = dispatch(setup, runs);
      await reading.promise;
      Object.assign(setup.guard.ownership, { epoch: 99 });
      Object.assign(setup.guard.scope, { personId: 'edited' });
      setup.input.stageCommandId = executionCommandId('edited-stage');
      setup.input.observedCommandId = executionCommandId('edited-observe');
      setup.input.request.input = 'edited';
      Object.assign(setup.input.request.owner, { epoch: 99 });
      Object.assign(setup.control, {
        signal: new AbortController().signal,
        onPart: () => {
          throw new Error('edited callback');
        },
      });
      read.resolve();
      expect((await pending).kind).toBe('observed');
      expect(setup.calls).toEqual([
        {
          live: setup.session,
          request: originalRequest,
          control: { signal: originalSignal, onPart: originalOnPart },
        },
      ]);
      const history = await setup.runs.readExecutionHistory(
        originalGuard.runId,
        originalGuard.attemptId,
      );
      expect(history.executions.at(-1)?.command.commandId).toBe(
        executionCommandId('turn-observed'),
      );
    });
    for (const mutation of ['locator', 'executor'] as const)
      test(
        'final full ' + mutation + ' recheck after renewal blocks changed live identity',
        async () => {
          const setup = await fixture();
          const runs = {
            ...setup.runs,
            async renewOwnership(...args: Parameters<typeof setup.runs.renewOwnership>) {
              const renewed = await setup.runs.renewOwnership(...args);
              if (mutation === 'locator')
                Object.assign(setup.session.locator.selection, { className: 'edited' });
              else Object.assign(setup.executor, { version: 'edited' });
              return renewed;
            },
          };
          await rejects(dispatch(setup, runs), TurnDispatchError);
          expect(setup.calls).toHaveLength(0);
          expect(
            (await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId))
              .attempt.state.kind,
          ).toBe('turn_pending');
        },
      );
    for (const fault of [
      'wrong_reply',
      'throw_turn',
      'refused_save',
      'throw_save',
      'recovery',
      'expiry',
    ] as const)
      test('poststage ' + fault + ' keeps exact provenance without replacement', async () => {
        const setup = await fixture();
        const turn = setup.executor.turn.bind(setup.executor);
        let turns = 0;
        let saves = 0;
        const privateCause = new Error('private');
        setup.executor.turn = async (...args) => {
          turns++;
          if (fault === 'throw_turn') throw privateCause;
          if (fault === 'recovery')
            unwrapReply(
              await setup.runs.recordExecution(
                await setup.currentGuard(),
                createExecutionCommand(
                  { kind: 'recovery_required', reason: 'during turn' },
                  'intervening',
                ),
              ),
            );
          if (fault === 'expiry') setup.clock.advance(101);
          const reply = await turn(...args);
          if (fault === 'wrong_reply') Object.assign(reply.identity, { turnKey: 'other' });
          return reply;
        };
        const runs = {
          ...setup.runs,
          async recordExecution(...args: Parameters<typeof setup.runs.recordExecution>) {
            saves++;
            if (fault === 'throw_save') throw privateCause;
            if (fault === 'refused_save')
              return { kind: 'refused' as const, reason: 'revision_conflict' as const };
            return await setup.runs.recordExecution(...args);
          },
        };
        if (fault === 'wrong_reply' || fault === 'throw_turn' || fault === 'throw_save') {
          const error = await dispatch(setup, runs).catch((cause: unknown) => cause);
          expect(error).toBeInstanceOf(TurnDispatchError);
          if (!(error instanceof TurnDispatchError)) throw new Error('correlation missing');
          expect(error.message).toBe('Turn dispatch failed');
          expect(Object.isFrozen(error.intent.request.owner)).toBe(true);
          if (fault !== 'wrong_reply') expect(error.cause).toBe(privateCause);
        } else
          expect(await dispatch(setup, runs)).toMatchObject({
            kind: 'pending',
            observation: { kind: 'local_refused' },
          });
        expect(turns).toBe(1);
        expect(saves).toBe(fault === 'wrong_reply' || fault === 'throw_turn' ? 0 : 1);
        const history = await setup.runs.readExecutionHistory(
          setup.run.runId,
          setup.attempt.attemptId,
        );
        expect(history.attempt.holdsCapacity).toBe(true);
        expect(history.completion).toBeNull();
        expect(history.receipt).toBeNull();
        expect(
          history.executions.filter((entry) => entry.command.kind === 'stage_turn'),
        ).toHaveLength(1);
      });

    for (const fault of [
      'run_revision',
      'attempt_revision',
      'scope_revision',
      'scope',
      'organization',
      'request_owner',
      'attachment',
      'locator',
      'executor',
      'pending_grant',
      'recovery_barrier',
      'grant_mapping',
      'uninitialized',
      'nonready',
    ] as const)
      test('preflight ' + fault + ' refuses without live reads', async () => {
        const setup = await fixture();
        let reason: StoreRefusal = 'authority_conflict';
        let runs = setup.runs;
        switch (fault) {
          case 'run_revision':
            Object.assign(setup.guard, { expectedRevision: setup.guard.expectedRevision - 1 });
            reason = 'revision_conflict';
            break;
          case 'attempt_revision':
            Object.assign(setup.guard, {
              expectedAttemptRevision: setup.guard.expectedAttemptRevision - 1,
            });
            reason = 'revision_conflict';
            break;
          case 'scope_revision':
            Object.assign(setup.guard, {
              expectedScopeRevision: setup.guard.expectedScopeRevision - 1,
            });
            reason = 'revision_conflict';
            break;
          case 'scope':
            Object.assign(setup.guard.scope, { personId: 'other' });
            break;
          case 'organization':
            Object.assign(setup.guard.ownership, { organizationId: 'other' });
            break;
          case 'request_owner':
            Object.assign(setup.input.request.owner, { ownerId: 'other' });
            break;
          case 'attachment':
            runs = {
              ...setup.runs,
              async readExecutionHistory(...args) {
                const history = await setup.runs.readExecutionHistory(...args);
                if (history.version !== 1 || history.attempt.state.kind !== 'ready')
                  throw new Error('legacy ready required');
                return {
                  ...history,
                  attempt: {
                    ...history.attempt,
                    state: {
                      ...history.attempt.state,
                      execution: {
                        ...history.attempt.state.execution,
                        session: {
                          ...history.attempt.state.execution.session,
                          attachment: {
                            ...history.attempt.state.execution.session.attachment,
                            owner: { ownerId: ownerId('old'), epoch: 1 },
                          },
                        },
                      },
                    },
                  },
                };
              },
            };
            break;
          case 'locator':
            Object.assign(setup.session.locator.session, { workerId: 'other' });
            reason = 'identity_conflict';
            break;
          case 'executor':
            Object.assign(setup.executor, { kind: 'tool' });
            reason = 'identity_conflict';
            break;
          case 'recovery_barrier':
            runs = {
              ...setup.runs,
              async readRuntimeScope(scope) {
                const history = await setup.runs.readRuntimeScope(scope);
                if (history.kind !== 'pinned') throw new Error('pin required');
                return {
                  ...history,
                  version: 2,
                  recoveries: [],
                  activeRecoveryId: null,
                  generationFloor: 2,
                };
              },
            };
            break;
          case 'pending_grant':
          case 'grant_mapping':
          case 'uninitialized':
            runs = {
              ...setup.runs,
              async readRuntimeScope(scope) {
                const history = await setup.runs.readRuntimeScope(scope);
                if (history.kind !== 'pinned') throw new Error('pin required');
                return fault === 'uninitialized'
                  ? { version: 1, kind: 'uninitialized', scope, ownerEpoch: history.ownerEpoch }
                  : {
                      ...history,
                      pendingCommandId:
                        fault === 'pending_grant' ? 'other' : history.pendingCommandId,
                      grant: fault === 'grant_mapping' ? null : history.grant,
                    };
              },
            };
            break;
          case 'nonready':
            unwrapReply(
              await setup.runs.recordExecution(
                await setup.currentGuard(),
                createExecutionCommand({ kind: 'recovery_required', reason: 'uncertain' }),
              ),
            );
            reason = 'state_conflict';
            break;
        }
        let scopeReads = 0;
        const provider = runs;
        runs = {
          ...provider,
          async readRuntimeScope(...args) {
            scopeReads++;
            return await provider.readRuntimeScope(...args);
          },
        };
        expect(await dispatch(setup, runs)).toEqual({ kind: 'refused', reason });
        expect(scopeReads).toBe(
          [
            'scope_revision',
            'pending_grant',
            'recovery_barrier',
            'grant_mapping',
            'uninitialized',
          ].includes(fault)
            ? 1
            : 0,
        );
        expect(setup.runtimeCalls).toHaveLength(0);
        expect(setup.claimCalls).toHaveLength(0);
        expect(setup.calls).toHaveLength(0);
      });
    test('verified history rejects missing retained preparation artifact before live reads', async () => {
      const setup = await fixture();
      const evidence = setup.preparationInput.stateEvidence;
      const artifacts = {
        ...setup.artifacts,
        async readArtifact(reference: typeof evidence) {
          if (reference.digest === evidence.digest) throw new Error('missing retained preparation');
          return await setup.artifacts.readArtifact(reference);
        },
      };
      let scopeReads = 0;
      const runs = {
        ...setup.runs,
        async readRuntimeScope(...args: Parameters<typeof setup.runs.readRuntimeScope>) {
          scopeReads++;
          return await setup.runs.readRuntimeScope(...args);
        },
      };
      await rejects(
        dispatchTurn(
          runs,
          artifacts,
          setup.runtime,
          setup.claims,
          setup.executor,
          setup.session,
          setup.guard,
          setup.input,
          setup.control,
        ),
        new RegExp('missing retained preparation'),
      );
      expect(scopeReads).toBe(0);
      expect(setup.runtimeCalls).toHaveLength(0);
      expect(setup.calls).toHaveLength(0);
    });
    test('renewal refusal leaves exact staged ack and no executor', async () => {
      const setup = await fixture();
      const runs = {
        ...setup.runs,
        renewOwnership() {
          return Promise.resolve({ kind: 'refused' as const, reason: 'owner_stale' as const });
        },
      };
      const reply = await dispatch(setup, runs);
      expect(reply).toMatchObject({
        kind: 'pending',
        observation: { kind: 'local_refused', reason: 'owner_stale' },
      });
      expect(setup.calls).toHaveLength(0);
    });
    test('observed reply snapshots executor-owned portable reply before save awaits', async () => {
      const setup = await fixture();
      let returned: Awaited<ReturnType<typeof setup.executor.turn>> | undefined;
      const turn = setup.executor.turn.bind(setup.executor);
      setup.executor.turn = async (...args) => {
        returned = structuredClone(await turn(...args));
        return returned;
      };
      const runs = {
        ...setup.runs,
        async recordExecution(...args: Parameters<typeof setup.runs.recordExecution>) {
          if (returned?.kind !== 'completed') throw new Error('completed reply missing');
          Object.assign(returned.outcome, { text: 'edited' });
          Object.assign(returned.identity.owner, { epoch: 99 });
          return await setup.runs.recordExecution(...args);
        },
      };
      expect(await dispatch(setup, runs)).toMatchObject({
        kind: 'observed',
        attempt: { state: { reply: { outcome: { text: 'full text\nkept' } } } },
      });
    });
    test('correlated error detaches and freezes every portable branch without freezing caller intent', async () => {
      const setup = await fixture();
      setup.executor.turn = () => {
        return Promise.reject(new Error('private session secret'));
      };
      const thrown = await dispatch(setup).catch((cause: unknown) => cause);
      if (!(thrown instanceof TurnDispatchError)) throw new Error('correlation missing');
      const intent = structuredClone(thrown.intent);
      const error = new TurnDispatchError(intent, thrown.cause);
      Object.assign(intent.claim, { commandId: 'edited' });
      Object.assign(intent.locator.selection, { className: 'edited' });
      Object.assign(intent.locator.preparation.identity, { occurrenceId: 'edited' });
      Object.assign(intent.locator.session, { workerId: 'edited' });
      Object.assign(intent.request.cause, { kind: 'edited' });
      expect(error.intent).toEqual(thrown.intent);
      for (const branch of [
        error.intent,
        error.intent.claim,
        error.intent.locator,
        error.intent.locator.selection,
        error.intent.locator.preparation,
        error.intent.locator.preparation.identity,
        error.intent.locator.session,
        error.intent.request,
        error.intent.request.owner,
        error.intent.request.cause,
      ])
        expect(Object.isFrozen(branch)).toBe(true);
      expect(error.message).toBe('Turn dispatch failed');
      expect(error.cause).toBe(thrown.cause);
    });

    for (const field of ['readAt', 'claimedAt', 'leaseExpiresAt', 'leaseRevokedAt'] as const)
      test('nonfinite successful lease ' + field + ' is trusted fault before staging', async () => {
        const setup = await fixture();
        const body = structuredClone(setup.lease);
        if (field === 'readAt') body.readAt = Infinity;
        else Object.assign(body.claims[0], { [field]: Infinity });
        const claims = {
          readClaims: () =>
            Promise.resolve({
              kind: 'success' as const,
              representation: 'json' as const,
              status: 200 as const,
              headers: new Headers(),
              body,
            }),
        };
        await rejects(
          dispatchTurn(
            setup.runs,
            setup.artifacts,
            setup.runtime,
            claims,
            setup.executor,
            setup.session,
            setup.guard,
            setup.input,
            setup.control,
          ),
          /nonfinite successful claim observation/,
        );
        expect(setup.calls).toHaveLength(0);
      });

    for (const field of ['guard', 'stage', 'observed', 'request'] as const)
      test('invalid ' + field + ' rejects before history reads', async () => {
        const setup = await fixture();
        switch (field) {
          case 'guard':
            Object.assign(setup.guard, { extra: true });
            break;
          case 'stage':
            Object.assign(setup.input, { stageCommandId: '' });
            break;
          case 'observed':
            Object.assign(setup.input, { observedCommandId: '' });
            break;
          case 'request':
            Object.assign(setup.input.request, { version: 2 });
            break;
        }
        let reads = 0;
        const runs = {
          ...setup.runs,
          async readExecutionHistory(...args: Parameters<typeof setup.runs.readExecutionHistory>) {
            reads++;
            return await setup.runs.readExecutionHistory(...args);
          },
        };
        await rejects(dispatch(setup, runs));
        expect(reads).toBe(0);
        expect(setup.runtimeCalls).toHaveLength(0);
      });
    test('existing other-family stage identity delegates refusal without live reads', async () => {
      const setup = await fixture();
      setup.input.stageCommandId = setup.opened.commandId;
      expect(await dispatch(setup)).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(setup.runtimeCalls).toHaveLength(0);
      expect(setup.calls).toHaveLength(0);
    });
    test('fresh local stage refusal returns typed reason without executor', async () => {
      const setup = await fixture();
      const runs = {
        ...setup.runs,
        stageTurn: () =>
          Promise.resolve({ kind: 'refused' as const, reason: 'owner_stale' as const }),
      };
      expect(await dispatch(setup, runs)).toEqual({ kind: 'refused', reason: 'owner_stale' });
      expect(setup.calls).toHaveLength(0);
    });
    test('historical duplicate after later recovery keeps complete original acknowledgement', async () => {
      const setup = await fixture();
      await dispatch(setup);
      const before = await setup.runs.readExecutionHistory(
        setup.run.runId,
        setup.attempt.attemptId,
      );
      const stage = before.executions.find((entry) => entry.command.kind === 'stage_turn');
      if (stage?.reply.kind !== 'turn_staged') throw new Error('stage missing');
      unwrapReply(
        await setup.runs.recordExecution(
          await setup.currentGuard(),
          createExecutionCommand({ kind: 'recovery_required', reason: 'later recovery' }),
        ),
      );
      expect(await dispatch(setup)).toEqual({
        kind: 'pending',
        intent: stage.reply.intent,
        ack: stage.reply,
        observation: { kind: 'duplicate' },
      });
      expect(setup.runtimeCalls).toHaveLength(1);
      expect(setup.calls).toHaveLength(1);
    });
    test('fresh observation identity collision refuses before current reads or turn', async () => {
      const setup = await fixture();
      setup.input.observedCommandId = setup.opened.commandId;
      expect(await dispatch(setup)).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(setup.calls).toHaveLength(0);
      expect(setup.runtimeCalls).toHaveLength(0);
      expect(
        (await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)).attempt
          .state.kind,
      ).toBe('ready');
    });
    test('retained stage acknowledgement detaches before renewal await', async () => {
      const setup = await fixture();
      let ack: Awaited<ReturnType<typeof setup.runs.stageTurn>> | undefined;
      const runs = {
        ...setup.runs,
        async stageTurn(...args: Parameters<typeof setup.runs.stageTurn>) {
          ack = await setup.runs.stageTurn(...args);
          return ack;
        },
        async renewOwnership(...args: Parameters<typeof setup.runs.renewOwnership>) {
          if (ack === undefined || ack.kind === 'refused') throw new Error('stage ack missing');
          Object.assign(ack.value.intent.request, { input: 'edited' });
          Object.assign(ack.value.attempt, { revision: 999 });
          return await setup.runs.renewOwnership(...args);
        },
      };
      expect(await dispatch(setup, runs)).toMatchObject({
        kind: 'observed',
        intent: { request: { input: 'work' } },
      });
    });

    for (const fault of [
      'id',
      'missing',
      'ambiguous',
      'holder',
      'work',
      'step',
      'parent',
      'run',
      'binding_store',
      'binding_run',
      'binding_attempt',
      'binding_session',
      'binding_work',
      'binding_step',
      'binding_parent',
      'binding_claim',
      'generation',
      'uninitialized',
    ] as const)
      test('complete runtime inventory ' + fault + ' refuses before stage', async () => {
        const setup = await fixture();
        const inventory = setup.state.claims[0];
        switch (fault) {
          case 'id':
            inventory.claim.id = 'other';
            break;
          case 'missing':
            setup.state.claims = [];
            break;
          case 'ambiguous':
            setup.state.claims.push(structuredClone(inventory));
            break;
          case 'holder':
            inventory.claim.personId = 'other';
            break;
          case 'work':
            inventory.claim.workItemId = 'other';
            break;
          case 'step':
            Object.assign(inventory.claim, { stepId: 'other' });
            break;
          case 'parent':
            Object.assign(inventory.claim, { parentClaimId: 'other' });
            break;
          case 'run':
            Object.assign(inventory.claim, { runId: 'other' });
            break;
          case 'binding_store':
            Object.assign(inventory.binding.execution, { storeId: 'other' });
            break;
          case 'binding_run':
            Object.assign(inventory.binding.execution, { runId: 'other' });
            break;
          case 'binding_attempt':
            Object.assign(inventory.binding.execution, { attemptId: 'other' });
            break;
          case 'binding_session':
            Object.assign(inventory.binding.execution, { sessionId: 'other' });
            break;
          case 'binding_work':
            inventory.binding.workItemId = 'other';
            break;
          case 'binding_step':
            inventory.binding.stepId = 'other';
            break;
          case 'binding_parent':
            Object.assign(inventory.binding, { parentClaimId: 'other' });
            break;
          case 'binding_claim':
            inventory.binding.claimId = 'other';
            break;
          case 'generation':
            setup.state.authority = { kind: 'held', ownerId: 'receiver-owner', generation: 2 };
            break;
          case 'uninitialized':
            Object.assign(setup.state.authority, { kind: 'uninitialized' });
            break;
        }
        expect(await dispatch(setup)).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        expect(setup.calls).toHaveLength(0);
        expect(setup.claimCalls).toHaveLength(0);
      });
    test('live reads use exact pinned project person ledger and captured signal', async () => {
      const setup = await fixture();
      await dispatch(setup);
      expect(setup.runtimeCalls).toEqual([
        {
          params: { id: 'project' },
          query: { personId: 'person', expectedLedgerId: 'ledger' },
          body: undefined,
          signal: setup.control.signal,
        },
      ]);
      expect(setup.claimCalls).toEqual([
        {
          params: { id: 'project' },
          query: undefined,
          body: undefined,
          signal: setup.control.signal,
        },
      ]);
    });

    test('verified runtime history requires retained authority artifact before live reads', async () => {
      const setup = await fixture();
      const scope = await setup.runs.readRuntimeScope(setup.scope);
      if (scope.kind !== 'pinned') throw new Error('pin missing');
      const acceptance = scope.acceptances.find((entry) => entry.commandId === 'authority');
      if (acceptance === undefined) throw new Error('authority missing');
      const artifacts = {
        ...setup.artifacts,
        async readArtifact(reference: typeof acceptance.evidence) {
          if (reference.digest === acceptance.evidence.digest)
            throw new Error('missing authority artifact');
          return await setup.artifacts.readArtifact(reference);
        },
      };
      await rejects(
        dispatchTurn(
          setup.runs,
          artifacts,
          setup.runtime,
          setup.claims,
          setup.executor,
          setup.session,
          setup.guard,
          setup.input,
          setup.control,
        ),
        /missing authority artifact/,
      );
      expect(setup.runtimeCalls).toHaveLength(0);
    });
    test('executor receives immutable detached request with original live session', async () => {
      const setup = await fixture();
      const turn = setup.executor.turn.bind(setup.executor);
      setup.executor.turn = async (live, request, control) => {
        expect(live).toBe(setup.session);
        expect(request).not.toBe(setup.input.request);
        for (const branch of [request, request.owner, request.cause])
          expect(Object.isFrozen(branch)).toBe(true);
        return await turn(live, request, control);
      };
      expect((await dispatch(setup)).kind).toBe('observed');
    });

    for (const fault of [
      'pin_scope',
      'pin_ledger',
      'grant_epoch',
      'grant_command',
      'grant_authority',
      'latest_owner',
      'missing_acquisition',
    ] as const)
      test('runtime prefix ' + fault + ' refuses before current reads', async () => {
        const setup = await fixture();
        const runs = {
          ...setup.runs,
          async readRuntimeScope(...args: Parameters<typeof setup.runs.readRuntimeScope>) {
            const prefix = structuredClone(await setup.runs.readRuntimeScope(...args));
            if (prefix.kind !== 'pinned' || prefix.grant === null) throw new Error('grant missing');
            switch (fault) {
              case 'pin_scope':
                Object.assign(prefix.pin.scope, { personId: 'other' });
                break;
              case 'pin_ledger':
                Object.assign(prefix.pin, { ledgerId: 'other' });
                break;
              case 'grant_epoch':
                Object.assign(prefix.grant, { localEpoch: 99 });
                break;
              case 'grant_command':
                Object.assign(prefix.grant, { commandId: 'other' });
                break;
              case 'grant_authority':
                Object.assign(prefix.grant.authority, { generation: 99 });
                break;
              case 'latest_owner': {
                const authority = prefix.intents.find((entry) => entry.commandId === 'authority');
                if (authority === undefined) throw new Error('authority missing');
                Object.assign(authority.localOwner, { ownerId: 'other' });
                break;
              }
              case 'missing_acquisition':
                return {
                  ...prefix,
                  acceptances: prefix.acceptances.filter(
                    (entry) => entry.commandId !== 'authority',
                  ),
                };
            }
            return prefix;
          },
        };
        expect(await dispatch(setup, runs)).toEqual({
          kind: 'refused',
          reason: 'authority_conflict',
        });
        expect(setup.runtimeCalls).toHaveLength(0);
        expect(setup.calls).toHaveLength(0);
      });
    test('historical provider applied replay is trusted fault without current reads', async () => {
      const setup = await fixture();
      await dispatch(setup);
      const runs = {
        ...setup.runs,
        async stageTurn(...args: Parameters<typeof setup.runs.stageTurn>) {
          const reply = await setup.runs.stageTurn(...args);
          if (reply.kind !== 'duplicate') throw new Error('duplicate required');
          return { kind: 'applied' as const, value: reply.value };
        },
      };
      await rejects(dispatch(setup, runs), /historical turn stage was applied again/);
      expect(setup.runtimeCalls).toHaveLength(1);
      expect(setup.calls).toHaveLength(1);
    });
    for (const mutation of ['version', 'claim', 'request'] as const)
      test('error intent codec rejects malformed ' + mutation, async () => {
        const setup = await fixture();
        setup.executor.turn = () => Promise.reject(new Error('private'));
        const thrown = await dispatch(setup).catch((cause: unknown) => cause);
        if (!(thrown instanceof TurnDispatchError)) throw new Error('correlation missing');
        const intent = structuredClone(thrown.intent);
        if (mutation === 'version') Object.assign(intent, { version: 2 });
        else if (mutation === 'claim') Object.assign(intent.claim, { runId: '' });
        else Object.assign(intent.request, { input: null });
        throws(() => new TurnDispatchError(intent, 'private'));
      });
    test('preflight executor version refuses before live reads', async () => {
      const setup = await fixture();
      Object.assign(setup.executor, { version: 'other' });
      expect(await dispatch(setup)).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(setup.runtimeCalls).toHaveLength(0);
    });
    test('final executor kind recheck prevents dispatch after awaited renewal', async () => {
      const setup = await fixture();
      const runs = {
        ...setup.runs,
        async renewOwnership(...args: Parameters<typeof setup.runs.renewOwnership>) {
          const renewed = await setup.runs.renewOwnership(...args);
          Object.assign(setup.executor, { kind: 'tool' });
          return renewed;
        },
      };
      await rejects(dispatch(setup, runs), TurnDispatchError);
      expect(setup.calls).toHaveLength(0);
    });

    test('preflight project correspondence refuses before live reads', async () => {
      const setup = await fixture();
      const runs = {
        ...setup.runs,
        async readExecutionHistory(...args: Parameters<typeof setup.runs.readExecutionHistory>) {
          const history = await setup.runs.readExecutionHistory(...args);
          const run = structuredClone(history.run);
          Object.assign(run, { projectId: 'other' });
          return { ...history, run };
        },
      };
      expect(await dispatch(setup, runs)).toEqual({
        kind: 'refused',
        reason: 'authority_conflict',
      });
      expect(setup.runtimeCalls).toHaveLength(0);
    });

    for (const reason of ['cancelled_before_dispatch', 'session_busy'] as const)
      test('not_started ' + reason + ' retains exact reason and ready cause', async () => {
        const setup = await fixture();
        setup.executor.turn = (live, request) =>
          Promise.resolve({
            kind: 'not_started',
            identity: { locator: live.locator, turnKey: request.turnKey, owner: request.owner },
            reason,
          });
        expect(await dispatch(setup)).toMatchObject({
          kind: 'observed',
          attempt: { state: { kind: 'ready', cause: { kind: 'initial' } }, holdsCapacity: true },
        });
        const history = await setup.runs.readExecutionHistory(
          setup.run.runId,
          setup.attempt.attemptId,
        );
        expect(history.executions.at(-1)).toMatchObject({
          command: { fact: { kind: 'turn_observed', reply: { kind: 'not_started', reason } } },
        });
      });

    test('new stage after not_started requires fresh observation identity without another turn', async () => {
      const setup = await fixture();
      let turns = 0;
      setup.executor.turn = (live, request) => {
        turns++;
        return Promise.resolve({
          kind: 'not_started',
          identity: { locator: live.locator, turnKey: request.turnKey, owner: request.owner },
          reason: 'session_busy',
        });
      };
      expect((await dispatch(setup)).kind).toBe('observed');
      setup.input.stageCommandId = executionCommandId('retry-stage');
      setup.guard = await setup.scopedGuard();
      expect(await dispatch(setup)).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(turns).toBe(1);
      expect(setup.runtimeCalls).toHaveLength(1);
      expect(
        (await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)).attempt
          .state.kind,
      ).toBe('ready');
    });
    test('same-stage concurrent observation winner returns exact valid duplicate acknowledgement', async () => {
      const setup = await fixture();
      const kinds: string[] = [];
      const runs = {
        ...setup.runs,
        async recordExecution(...args: Parameters<typeof setup.runs.recordExecution>) {
          const winner = await setup.runs.recordExecution(...args);
          kinds.push(winner.kind);
          const duplicate = await setup.runs.recordExecution(...args);
          kinds.push(duplicate.kind);
          return duplicate;
        },
      };
      expect(await dispatch(setup, runs)).toMatchObject({
        kind: 'observed',
        attempt: {
          revision: setup.guard.expectedAttemptRevision + 2,
          state: { kind: 'turn_returned' },
        },
      });
      expect(kinds).toEqual(['applied', 'duplicate']);
      expect(setup.calls).toHaveLength(1);
    });
    for (const fault of ['revision', 'attempt', 'run'] as const)
      test('observation acknowledgement ' + fault + ' must name current staged cut', async () => {
        const setup = await fixture();
        const before = await setup.runs.readExecutionHistory(
          setup.run.runId,
          setup.attempt.attemptId,
        );
        const stale = structuredClone(before.attempt);
        if (fault === 'attempt')
          Object.assign(stale, {
            attemptId: 'other',
            revision: setup.guard.expectedAttemptRevision + 2,
          });
        else if (fault === 'run') {
          Object.assign(stale.identity, { runId: 'other' });
          Object.assign(stale, { revision: setup.guard.expectedAttemptRevision + 2 });
        }
        const reply = { kind: 'duplicate' as const, value: stale };
        const runs = { ...setup.runs, recordExecution: () => Promise.resolve(reply) };
        const error = await dispatch(setup, runs).catch((cause: unknown) => cause);
        if (!(error instanceof TurnDispatchError))
          throw new Error('missing correlated acknowledgement failure');
        expect(error.message).toBe('Turn dispatch failed');
        if (!(error.cause instanceof Error)) throw new Error('diagnostic cause missing');
        expect(error.cause.message).toBe('turn observation acknowledgement differs');
        expect(error.cause.cause).toEqual(reply);
        expect(setup.calls).toHaveLength(1);
        expect(
          (await setup.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)).attempt
            .state.kind,
        ).toBe('turn_pending');
      });
  });
}
