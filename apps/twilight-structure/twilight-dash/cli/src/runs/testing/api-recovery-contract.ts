import assert from 'node:assert/strict';

import {
  acceptWorkflowBinding,
  canonicalJson,
  checkWorkflowBinding,
  decodeWorkflowBinding,
  selectWorkflowActivity,
} from '@twilight-burokrat/contracts';
import { createProviderRegistry, simulateReadableStream } from 'ai';
import { MockLanguageModelV4, MockProviderV4 } from 'ai/test';
import { describe, expect, test } from 'bun:test';

import type { ActivityExecutor, ResumeReply, SessionLookup } from '../../agents/activity-executor';
import { createApiModelExecutor } from '../../agents/api-model-adapter';
import { acceptClaimReceipt, stageClaimRequest } from '../claim-history';
import { prepareActivity } from '../prepare-activity';
import { reconcileApiActivity } from '../reconcile-api-activity';
import { AgentRunIdCodec, attemptId, executionCommandId, ownerId } from '../record-codecs';
import { recordPreparation } from '../record-preparation';
import type { RunStore } from '../run-store';
import { stageWriteRequest } from '../write-history';
import { closeFixtures } from './close-fixtures';
import { prepareSession } from './fixtures';
import { admitExecution, type OutcomeFixture, retainClaimReceipt, unwrapReply } from './fixtures';
import { createRecoveryResolveCall } from './recovery-contract';
import { createWriteFixture } from './write-fixture';

export interface RecoveryFixture extends OutcomeFixture {
  reopen(): Promise<void>;
}

async function prepareApi(
  stores: RecoveryFixture,
  cut: 'queued' | 'preparing' | 'prepared' | 'turn_pending',
) {
  const bytes = new TextEncoder().encode('Recover this activity.');
  const prompt = await stores.artifacts.retainArtifact(bytes, 'text/plain');
  if (prompt.kind !== 'retained') throw new Error('prompt retention refused');
  const accepted = acceptWorkflowBinding(
    checkWorkflowBinding(
      decodeWorkflowBinding({
        version: 1,
        types: { default: { plan: { class: 'api' } } },
        classes: {
          api: {
            executor: 'api-model',
            model: 'openai:fixture',
            prompt: 'plan.md',
            tools: [],
            limits: { maxSteps: 1, maxOutputTokens: 80 },
          },
        },
      }),
      ['plan'],
    ),
    [{ path: 'plan.md', bytes }],
  );
  const selection = selectWorkflowActivity(accepted, 'feature', 'plan');
  const setup = await admitExecution(stores, undefined, {
    canonicalBinding: canonicalJson(accepted.snapshot),
    prompts: [prompt.reference],
    executorVersions: { 'api-model': '1' },
  });
  const model = new MockLanguageModelV4({
    doStream: () =>
      Promise.resolve({
        stream: simulateReadableStream({
          initialDelayInMs: null,
          chunkDelayInMs: null,
          chunks: [
            { type: 'stream-start' as const, warnings: [] },
            {
              type: 'finish' as const,
              finishReason: { unified: 'stop' as const, raw: undefined },
              usage: {
                inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
            },
          ],
        }),
      }),
  });
  const providers = createProviderRegistry<Record<string, MockProviderV4>, string>({
    openai: new MockProviderV4({ languageModels: { fixture: model } }),
  });
  const createExecutor = (instanceId: string) =>
    createApiModelExecutor({
      selection,
      models: { languageModel: (id: string) => providers.languageModel<string>(id) },
      tools: {},
      instanceId,
      newSessionId: () => AgentRunIdCodec.assert('session'),
    });
  const first = createExecutor('original');
  const input = {
    ...setup.preparationInput,
    executor: { kind: 'api-model' as const, version: '1' },
  };
  const signal = new AbortController().signal;
  if (cut === 'queued') {
    expect((await setup.currentGuard()).expectedAttemptRevision).toBe(0);
  } else if (cut === 'preparing') {
    unwrapReply(
      await recordPreparation(stores.runs, stores.artifacts, await setup.currentGuard(), input),
    );
    const opened = await first.open(input.preparation, signal);
    expect(opened.kind).toBe('opened');
  } else {
    const opened = await prepareActivity(
      stores.runs,
      stores.artifacts,
      first,
      await setup.currentGuard(),
      { preparation: input, openedCommandId: executionCommandId('opened') },
      signal,
    );
    if (opened.kind !== 'prepared') throw new Error('expected actual prepared session');
    if (cut === 'turn_pending') {
      const staged = unwrapReply(
        await stageClaimRequest(stores.runs, stores.artifacts, await setup.scopedGuard(), {
          commandId: executionCommandId('claim-stage'),
          canonicalRequest: setup.canonicalRequest,
          stateEvidence: input.stateEvidence,
        }),
      );
      const evidence = await retainClaimReceipt(stores, staged.intent);
      unwrapReply(
        await acceptClaimReceipt(stores.runs, stores.artifacts, await setup.scopedGuard(), {
          commandId: executionCommandId('claim-accept'),
          intent: staged.intent,
          evidence,
        }),
      );
      const request = {
        version: 1 as const,
        turnKey: 'original-turn',
        owner: { ownerId: setup.ownership.ownerId, epoch: setup.ownership.epoch },
        cause: { kind: 'initial' as const },
        input: 'work',
      };
      unwrapReply(
        await stores.runs.stageTurn(await setup.scopedGuard(), {
          version: 2,
          kind: 'stage_turn',
          commandId: executionCommandId('turn-stage'),
          request,
        }),
      );
      const reply = await first.turn(opened.session, request, { signal, onPart: () => undefined });
      expect(reply.kind).toBe('completed');
      expect(model.doStreamCalls).toHaveLength(1);
    }
  }
  const before = await stores.runs.readRun(setup.run.runId);
  await stores.reopen();
  let queries = 0;
  const replacement = createExecutor('replacement');
  const executor: ActivityExecutor = {
    ...replacement,
    async lookupSession(preparation, control) {
      queries++;
      return await replacement.lookupSession(preparation, control);
    },
    async resumeSession(locator, control) {
      queries++;
      return await replacement.resumeSession(locator, control);
    },
  };
  const guard = await setup.currentGuard();
  const invoke = (
    overrides: {
      runs?: RunStore;
      artifacts?: typeof stores.artifacts;
      executor?: ActivityExecutor;
      guard?: typeof guard;
      signal?: AbortSignal;
      commandId?: ReturnType<typeof executionCommandId>;
      selection?: typeof selection;
    } = {},
  ) =>
    reconcileApiActivity(
      overrides.runs ?? stores.runs,
      overrides.artifacts ?? stores.artifacts,
      { executor: overrides.executor ?? executor, selection: overrides.selection ?? selection },
      overrides.guard ?? guard,
      overrides.commandId ?? executionCommandId('recover'),
      overrides.signal ?? signal,
    );
  return { setup, before, guard, executor, selection, invoke, queries: () => queries, model };
}

export function apiRecoveryContract(name: string, create: () => Promise<RecoveryFixture>): void {
  describe(name, () => {
    for (const cut of ['preparing', 'prepared', 'turn_pending'] as const)
      test('retains real unsupported ' + cut + ' checkpoint and exact retry', async () => {
        const stores = await create();
        try {
          const fixture = await prepareApi(stores, cut);
          const reply = await fixture.invoke();
          expect(reply.kind).toBe('recorded');
          if (reply.kind !== 'recorded') throw new Error('missing durable observation');
          expect(reply.acknowledgement).toBe('applied');
          expect(reply.attempt.state).toMatchObject({
            kind: 'unresolved',
            checkpoint: fixture.before.attempts[0]?.state,
            observation: { kind: 'artifact', reason: 'unsupported' },
          });
          expect(reply.attempt.holdsCapacity).toBe(true);
          const after = await stores.runs.readRun(fixture.setup.run.runId);
          expect(after.capacity.reserved).toBe(1);
          if (
            reply.attempt.state.kind !== 'unresolved' ||
            reply.attempt.state.observation.kind !== 'artifact'
          )
            throw new Error('wrong unresolved state');
          const retained: unknown = JSON.parse(
            new TextDecoder().decode(
              await stores.artifacts.readArtifact(reply.attempt.state.observation.evidence),
            ),
          );
          expect(retained).toMatchObject(
            cut === 'preparing'
              ? {
                  kind: 'unresolved',
                  reason: 'unsupported',
                  preparation: fixture.setup.preparationInput.preparation,
                }
              : {
                  kind: 'unresolved',
                  reason: 'unsupported',
                  locator: {
                    executor: 'api-model',
                    executorVersion: '1',
                    session: { workerId: 'original', sessionId: 'session' },
                  },
                },
          );
          const retry = await fixture.invoke();
          expect(retry).toEqual({ ...reply, acknowledgement: 'duplicate' });
          expect(fixture.queries()).toBe(1);
          expect(await stores.runs.readRun(fixture.setup.run.runId)).toEqual(after);
          const conflicting = { ...fixture.guard, attemptId: attemptId('foreign') };
          await assert.rejects(fixture.invoke({ guard: conflicting }));
          expect(fixture.queries()).toBe(1);
          expect(
            await stores.runs.admitAttempt(
              {
                ownership: fixture.guard.ownership,
                runId: fixture.guard.runId,
                expectedRevision: after.run.revision,
              },
              {
                attemptId: attemptId('replacement'),
                identity: fixture.setup.admission.identity,
                ordinal: 2,
              },
            ),
          ).toEqual({ kind: 'refused', reason: 'attempt_active' });
        } finally {
          await stores.close();
        }
      });

    for (const route of ['lookup', 'resume'] as const)
      test('detaches actual ' + route + ' reply across held artifact retention', async () => {
        const stores = await create();
        const exposed =
          Promise.withResolvers<Extract<SessionLookup | ResumeReply, { kind: 'unresolved' }>>();
        const retaining = Promise.withResolvers<{
          readonly text: string;
          readonly mediaType: string;
        }>();
        const release = Promise.withResolvers<undefined>();
        const retained = Promise.withResolvers<undefined>();
        const settlements: Promise<undefined>[] = [];
        let completion:
          | Promise<
              | {
                  readonly kind: 'returned';
                  readonly reply: Awaited<ReturnType<typeof reconcileApiActivity>>;
                }
              | { readonly kind: 'threw'; readonly cause: unknown }
            >
          | undefined;
        try {
          const fixture = await prepareApi(stores, route === 'lookup' ? 'preparing' : 'prepared');
          const original = fixture.before.attempts.at(0);
          if (
            original?.version !== 2 ||
            (original.state.kind !== 'preparing' && original.state.kind !== 'prepared')
          )
            throw new Error('original recovery checkpoint absent');
          const executor: ActivityExecutor = {
            ...fixture.executor,
            async lookupSession(preparation, signal) {
              const actual = structuredClone(
                await fixture.executor.lookupSession(preparation, signal),
              );
              if (actual.kind !== 'unresolved') throw new Error('actual lookup was not unresolved');
              exposed.resolve(actual);
              return actual;
            },
            async resumeSession(locator, signal) {
              const actual = structuredClone(await fixture.executor.resumeSession(locator, signal));
              if (actual.kind !== 'unresolved') throw new Error('actual resume was not unresolved');
              exposed.resolve(actual);
              return actual;
            },
          };
          const artifacts = {
            ...stores.artifacts,
            async retainArtifact(content: Uint8Array, mediaType: string) {
              settlements.push(retained.promise);
              retaining.resolve({ text: new TextDecoder().decode(content), mediaType });
              try {
                await release.promise;
                return await stores.artifacts.retainArtifact(content, mediaType);
              } finally {
                retained.resolve(undefined);
              }
            },
          };
          completion = fixture.invoke({ executor, artifacts }).then(
            (reply) => ({ kind: 'returned' as const, reply }),
            (cause: unknown) => ({ kind: 'threw' as const, cause }),
          );
          const mutable = await exposed.promise;
          const encoded = await retaining.promise;
          const expectedText = JSON.stringify(mutable);
          expect(encoded).toEqual({ text: expectedText, mediaType: 'application/json' });
          expect(mutable.reason).toBe('unsupported');
          expect(Reflect.set(mutable, 'reason', 'transport_lost')).toBe(true);
          expect(mutable.reason).toBe('transport_lost');
          release.resolve(undefined);
          const observed = await completion;
          if (observed.kind === 'threw') throw observed.cause;
          const reply = observed.reply;
          if (
            reply.kind !== 'recorded' ||
            reply.attempt.version !== 2 ||
            reply.attempt.state.kind !== 'unresolved' ||
            reply.attempt.state.observation.kind !== 'artifact'
          )
            throw new Error('recovery did not return artifact-backed uncertainty');
          const history = await stores.runs.readExecutionHistory(
            fixture.guard.runId,
            fixture.guard.attemptId,
          );
          const entry = history.executions.find(
            (candidate) => candidate.command.commandId === executionCommandId('recover'),
          );
          if (entry?.command.kind !== 'execution' || entry.command.fact.kind !== 'unresolved')
            throw new Error('published unresolved fact absent');
          const persisted = history.attempt;
          if (
            persisted.version !== 2 ||
            persisted.state.kind !== 'unresolved' ||
            persisted.state.observation.kind !== 'artifact'
          )
            throw new Error('retained unresolved state absent');
          expect(reply.attempt.attemptId).toBe(fixture.guard.attemptId);
          expect(reply.attempt.identity).toEqual(original.identity);
          expect(reply.attempt.state.checkpoint).toEqual(original.state);
          expect(persisted.state.checkpoint).toEqual(original.state);
          expect(reply.attempt.holdsCapacity).toBe(true);
          expect(persisted.holdsCapacity).toBe(true);
          expect((await stores.runs.readRun(fixture.guard.runId)).capacity.reserved).toBe(1);
          const evidence = await stores.artifacts.readArtifact(entry.command.fact.evidence);
          const retainedText = new TextDecoder().decode(evidence);
          expect(retainedText).toBe(expectedText);
          const retainedObservation: unknown = JSON.parse(retainedText);
          if (route === 'lookup')
            expect(retainedObservation).toEqual({
              kind: 'unresolved',
              preparation: fixture.setup.preparationInput.preparation,
              reason: 'unsupported',
            });
          else {
            if (original.state.kind !== 'prepared')
              throw new Error('original session checkpoint absent');
            expect(retainedObservation).toEqual({
              kind: 'unresolved',
              locator: original.state.session.locator,
              reason: 'unsupported',
            });
          }
          expect({
            published: entry.command.fact.reason,
            returned: reply.attempt.state.observation.reason,
            persisted: persisted.state.observation.reason,
          }).toEqual({
            published: 'unsupported',
            returned: 'unsupported',
            persisted: 'unsupported',
          });
          expect(fixture.queries()).toBe(1);
        } finally {
          release.resolve(undefined);
          await Promise.all(settlements);
          if (completion !== undefined) await completion;
          await stores.close();
        }
      });
    test('foreign actual lookup or resume reply cannot be retained', async () => {
      for (const cut of ['preparing', 'prepared'] as const) {
        const stores = await create();
        try {
          const fixture = await prepareApi(stores, cut);
          const executor: ActivityExecutor = {
            ...fixture.executor,
            async lookupSession(preparation, signal) {
              return await fixture.executor.lookupSession(
                { ...preparation, creationKey: 'foreign' },
                signal,
              );
            },
            async resumeSession(locator, signal) {
              return await fixture.executor.resumeSession(
                { ...locator, session: { ...locator.session, sessionId: 'foreign' } },
                signal,
              );
            },
          };
          await assert.rejects(fixture.invoke({ executor }), /recovery failed/);
          expect(await stores.runs.readRun(fixture.setup.run.runId)).toEqual(fixture.before);
        } finally {
          await stores.close();
        }
      }
    });
    test('queued and settled checkpoints refuse without a backend query', async () => {
      for (const cut of ['queued', 'prepared'] as const) {
        const stores = await create();
        try {
          const fixture = await prepareApi(stores, cut);
          if (cut === 'prepared')
            unwrapReply(
              await stores.runs.recordExecution(fixture.guard, {
                version: 2,
                kind: 'execution',
                commandId: executionCommandId('interrupt'),
                fact: {
                  kind: 'interrupted',
                  quiescence: {
                    version: 1,
                    operationKey: fixture.setup.admission.identity.operationKey,
                    observedAt: 1000,
                    evidence: fixture.setup.preparationInput.stateEvidence,
                    effect: 'failed',
                  },
                },
              }),
            );
          expect(await fixture.invoke({ guard: await fixture.setup.currentGuard() })).toEqual({
            kind: 'refused',
            reason: 'state_conflict',
          });
          expect(fixture.queries()).toBe(0);
        } finally {
          await stores.close();
        }
      }
    });
    test('rechecks actual profile after held renewal', async () => {
      const stores = await create();
      try {
        const fixture = await prepareApi(stores, 'prepared');
        const executor = { ...fixture.executor };
        const runs: RunStore = {
          ...stores.runs,
          async renewOwnership(ownership) {
            const renewed = await stores.runs.renewOwnership(ownership);
            executor.version = 'foreign';
            return renewed;
          },
        };
        expect(await fixture.invoke({ runs, executor })).toEqual({
          kind: 'refused',
          reason: 'identity_conflict',
        });
        expect(fixture.queries()).toBe(0);
      } finally {
        await stores.close();
      }
    });
    test('takeover during held retention or publication refuses without premature success', async () => {
      for (const phase of ['retention', 'publication'] as const) {
        const stores = await create();
        const entered = Promise.withResolvers<undefined>(),
          release = Promise.withResolvers<undefined>();
        try {
          const fixture = await prepareApi(stores, 'prepared');
          const artifacts = {
            ...stores.artifacts,
            async retainArtifact(bytes: Uint8Array, mediaType: string) {
              if (phase === 'retention') {
                entered.resolve(undefined);
                await release.promise;
              }
              return await stores.artifacts.retainArtifact(bytes, mediaType);
            },
          };
          const runs: RunStore = {
            ...stores.runs,
            async recordExecution(guard, command) {
              if (phase === 'publication') {
                entered.resolve(undefined);
                await release.promise;
              }
              return await stores.runs.recordExecution(guard, command);
            },
          };
          const pending = fixture.invoke({ runs, artifacts });
          await entered.promise;
          stores.clock.advance(101);
          unwrapReply(
            await stores.runs.acquireOwnership(ownerId('successor'), fixture.guard.ownership.epoch),
          );
          release.resolve(undefined);
          expect(await pending).toEqual({ kind: 'refused', reason: 'owner_stale' });
          expect(await stores.runs.readRun(fixture.setup.run.runId)).toEqual(fixture.before);
        } finally {
          release.resolve(undefined);
          await stores.close();
        }
      }
    });
    test('existing command family collision refuses and concurrent recovery converges', async () => {
      const stores = await create();
      try {
        const fixture = await prepareApi(stores, 'prepared');
        expect(await fixture.invoke({ commandId: executionCommandId('opened') })).toEqual({
          kind: 'refused',
          reason: 'identity_conflict',
        });
        expect(fixture.queries()).toBe(0);
        const replies = await Promise.all([fixture.invoke(), fixture.invoke()]);
        expect(
          replies
            .map((reply) => (reply.kind === 'recorded' ? reply.acknowledgement : reply.kind))
            .sort(),
        ).toEqual(['applied', 'duplicate']);
        const after = await stores.runs.readRun(fixture.setup.run.runId);
        expect(after.attempts[0]?.revision).toBe(3);
        const changed = { ...fixture.selection, requestedType: 'foreign' };
        expect(await fixture.invoke({ selection: changed })).toEqual({
          kind: 'refused',
          reason: 'identity_conflict',
        });
      } finally {
        await stores.close();
      }
    });
    test('real retention metadata conflict throws and leaves capacity occupied', async () => {
      const stores = await create();
      try {
        const fixture = await prepareApi(stores, 'preparing');
        const artifacts = {
          ...stores.artifacts,
          async retainArtifact(bytes: Uint8Array, mediaType: string) {
            await stores.artifacts.retainArtifact(bytes, 'text/plain');
            return await stores.artifacts.retainArtifact(bytes, mediaType);
          },
        };
        await assert.rejects(
          fixture.invoke({ artifacts }),
          (error) =>
            error instanceof Error &&
            error.cause instanceof Error &&
            error.cause.message.includes('metadata_conflict'),
        );
        expect(await stores.runs.readRun(fixture.setup.run.runId)).toEqual(fixture.before);
      } finally {
        await stores.close();
      }
    });
    test('artifact renewal and publication failures retain portable target and original cause', async () => {
      for (const phase of ['history', 'renewal', 'publication'] as const) {
        const stores = await create();
        try {
          const fixture = await prepareApi(stores, 'prepared');
          const cause = new Error('private storage boundary failure');
          const artifacts =
            phase === 'history'
              ? { ...stores.artifacts, readArtifact: () => Promise.reject(cause) }
              : stores.artifacts;
          const runs: RunStore = {
            ...stores.runs,
            renewOwnership:
              phase === 'renewal'
                ? () => Promise.reject(cause)
                : (ownership) => stores.runs.renewOwnership(ownership),
            recordExecution:
              phase === 'publication'
                ? () => Promise.reject(cause)
                : (guard, command) => stores.runs.recordExecution(guard, command),
          };
          await assert.rejects(
            fixture.invoke({ runs, artifacts }),
            (error) =>
              error instanceof Error &&
              error.name === 'ApiRecoveryError' &&
              error.cause === cause &&
              'target' in error &&
              JSON.stringify(error.target) ===
                JSON.stringify({
                  runId: fixture.guard.runId,
                  attemptId: fixture.guard.attemptId,
                }) &&
              !error.message.includes('private storage'),
          );
          expect(await stores.runs.readRun(fixture.setup.run.runId)).toEqual(fixture.before);
        } finally {
          await stores.close();
        }
      }
    });
    test('logical recovery version3 and write version4 keep their existing owners', async () => {
      for (const phase of ['logical', 'write'] as const) {
        const stores = await create();
        const detached = await create();
        try {
          const unused = await prepareApi(detached, 'queued');
          if (phase === 'logical') {
            const setup = await prepareSession(stores);
            const stageCommandId = executionCommandId('logical-stage');
            const staged = unwrapReply(
              await stageClaimRequest(stores.runs, stores.artifacts, await setup.scopedGuard(), {
                commandId: stageCommandId,
                canonicalRequest: setup.canonicalRequest,
                stateEvidence: setup.preparationInput.stateEvidence,
              }),
            );
            const begin = {
              kind: 'claim' as const,
              guard: { ...(await setup.scopedGuard()), expectedRecoveryRevision: 0 },
              intent: {
                version: 1 as const,
                recoveryId: 'logical-recovery',
                target: {
                  kind: 'claim' as const,
                  original: staged.intent,
                  runId: setup.run.runId,
                  attemptId: setup.admission.attemptId,
                  stageCommandId,
                  acceptanceCommandId: 'logical-accept',
                },
                begunScopeRevision: staged.intent.stagedRevision,
                resolver: setup.owner,
              },
            };
            unwrapReply(await stores.runs.beginRecovery(begin));
            unwrapReply(
              await stores.runs.resolveRecovery(
                await createRecoveryResolveCall(stores, begin, false),
              ),
            );
            const before = await stores.runs.readRun(setup.run.runId);
            expect(before.attempts[0]?.version).toBe(3);
            const current = await setup.currentGuard();
            expect(
              await reconcileApiActivity(
                stores.runs,
                stores.artifacts,
                { executor: unused.executor, selection: unused.selection },
                {
                  ownership: current.ownership,
                  runId: current.runId,
                  attemptId: current.attemptId,
                  expectedRevision: current.expectedRevision,
                  expectedAttemptRevision: current.expectedAttemptRevision,
                },
                executionCommandId('recover'),
                new AbortController().signal,
              ),
            ).toEqual({ kind: 'refused', reason: 'state_conflict' });
            expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
          } else {
            const setup = await createWriteFixture(stores);
            unwrapReply(
              await stageWriteRequest(stores.runs, stores.artifacts, setup.guard, {
                commandId: setup.command.commandId,
                completion: setup.completion,
                canonicalRequest: setup.canonicalRequest,
                stateEvidence: setup.stateEvidence,
              }),
            );
            const before = await stores.runs.readRun(setup.run.runId);
            expect(before.attempts[0]?.version).toBe(4);
            const current = await setup.currentGuard();
            expect(
              await reconcileApiActivity(
                stores.runs,
                stores.artifacts,
                { executor: unused.executor, selection: unused.selection },
                {
                  ownership: current.ownership,
                  runId: current.runId,
                  attemptId: current.attemptId,
                  expectedRevision: current.expectedRevision,
                  expectedAttemptRevision: current.expectedAttemptRevision,
                },
                executionCommandId('recover'),
                new AbortController().signal,
              ),
            ).toEqual({ kind: 'refused', reason: 'state_conflict' });
            expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
          }
          expect(unused.queries()).toBe(0);
        } finally {
          await closeFixtures([detached, stores]);
        }
      }
    });
    test('wrapped queued checkpoint refuses without querying', async () => {
      const stores = await create();
      try {
        const fixture = await prepareApi(stores, 'queued');
        unwrapReply(
          await stores.runs.recordExecution(fixture.guard, {
            version: 2,
            kind: 'execution',
            commandId: executionCommandId('recovery-required'),
            fact: { kind: 'recovery_required', reason: 'restart' },
          }),
        );
        expect(await fixture.invoke({ guard: await fixture.setup.currentGuard() })).toEqual({
          kind: 'refused',
          reason: 'state_conflict',
        });
        expect(fixture.queries()).toBe(0);
      } finally {
        await stores.close();
      }
    });
    test('malformed actual recovery observation rejects before publication', async () => {
      for (const cut of ['preparing', 'prepared'] as const)
        for (const fault of ['kind', 'reason', 'unknown', 'missing', 'malformed'] as const) {
          const stores = await create();
          try {
            const fixture = await prepareApi(stores, cut);
            const executor: ActivityExecutor = {
              ...fixture.executor,
              async lookupSession(preparation, signal) {
                const actual = structuredClone(
                  await fixture.executor.lookupSession(preparation, signal),
                );
                if (fault === 'kind') Reflect.set(actual, 'kind', 'absent');
                if (fault === 'reason') Reflect.set(actual, 'reason', 'transport_lost');
                if (fault === 'unknown') Reflect.set(actual, 'unexpected', true);
                if (fault === 'missing') Reflect.deleteProperty(actual, 'preparation');
                if (fault === 'malformed' && actual.kind === 'unresolved')
                  Reflect.set(actual.preparation, 'version', 99);
                return actual;
              },
              async resumeSession(locator, signal) {
                const actual = structuredClone(
                  await fixture.executor.resumeSession(locator, signal),
                );
                if (fault === 'kind') Reflect.set(actual, 'kind', 'attached');
                if (fault === 'reason') Reflect.set(actual, 'reason', 'transport_lost');
                if (fault === 'unknown') Reflect.set(actual, 'unexpected', true);
                if (fault === 'missing') Reflect.deleteProperty(actual, 'locator');
                if (fault === 'malformed' && actual.kind === 'unresolved')
                  Reflect.set(actual.locator, 'version', 99);
                return actual;
              },
            };
            await assert.rejects(fixture.invoke({ executor }));
            expect(await stores.runs.readRun(fixture.setup.run.runId)).toEqual(fixture.before);
          } finally {
            await stores.close();
          }
        }
    });
    test('selection and guard snapshot precede held verified history', async () => {
      const stores = await create();
      const entered = Promise.withResolvers<undefined>(),
        release = Promise.withResolvers<undefined>();
      try {
        const fixture = await prepareApi(stores, 'prepared');
        const submitted = structuredClone(fixture.selection);
        const runs: RunStore = {
          ...stores.runs,
          async readExecutionHistory(runId, attemptId) {
            const actual = await stores.runs.readExecutionHistory(runId, attemptId);
            entered.resolve(undefined);
            await release.promise;
            return actual;
          },
        };
        const pending = fixture.invoke({ runs, selection: submitted });
        await entered.promise;
        Reflect.set(submitted, 'className', 'foreign');
        release.resolve(undefined);
        expect((await pending).kind).toBe('recorded');
      } finally {
        release.resolve(undefined);
        await stores.close();
      }
    });
    test('intervening revision during actual query refuses and post-query cancellation still retains uncertainty', async () => {
      for (const action of ['revision', 'cancel'] as const) {
        const stores = await create();
        try {
          const fixture = await prepareApi(stores, 'preparing');
          const controller = new AbortController();
          const executor: ActivityExecutor = {
            ...fixture.executor,
            async lookupSession(preparation, signal) {
              const actual = await fixture.executor.lookupSession(preparation, signal);
              if (action === 'revision')
                unwrapReply(
                  await stores.runs.recordExecution(fixture.guard, {
                    version: 2,
                    kind: 'execution',
                    commandId: executionCommandId('intervening'),
                    fact: { kind: 'recovery_required', reason: 'intervening' },
                  }),
                );
              else controller.abort();
              return actual;
            },
          };
          const reply = await fixture.invoke({ executor, signal: controller.signal });
          if (action === 'revision')
            expect(reply).toEqual({ kind: 'refused', reason: 'revision_conflict' });
          else {
            expect(reply.kind).toBe('recorded');
            expect((await stores.runs.readRun(fixture.setup.run.runId)).capacity.reserved).toBe(1);
          }
        } finally {
          await stores.close();
        }
      }
    });
    test('corrupt existing recovery evidence cannot replay or query again', async () => {
      const stores = await create();
      try {
        const fixture = await prepareApi(stores, 'prepared');
        const original = await fixture.invoke();
        if (
          original.kind !== 'recorded' ||
          original.attempt.state.kind !== 'unresolved' ||
          original.attempt.state.observation.kind !== 'artifact'
        )
          throw new Error('recovery evidence absent');
        const reference = original.attempt.state.observation.evidence;
        const artifacts = {
          ...stores.artifacts,
          async readArtifact(requested: typeof reference) {
            if (requested.digest === reference.digest) return new TextEncoder().encode('{}');
            return await stores.artifacts.readArtifact(requested);
          },
        };
        await assert.rejects(fixture.invoke({ artifacts }));
        expect(fixture.queries()).toBe(1);
      } finally {
        await stores.close();
      }
    });
    test('replay refuses stale owner and foreign retained semantics without querying', async () => {
      for (const mode of ['stale', 'reason', 'bytes'] as const) {
        const stores = await create();
        try {
          const fixture = await prepareApi(stores, 'prepared');
          if (mode === 'stale') {
            expect((await fixture.invoke()).kind).toBe('recorded');
            stores.clock.advance(101);
            unwrapReply(
              await stores.runs.acquireOwnership(
                ownerId('successor'),
                fixture.guard.ownership.epoch,
              ),
            );
            expect(await fixture.invoke()).toEqual({ kind: 'refused', reason: 'owner_stale' });
            expect(fixture.queries()).toBe(1);
          } else {
            const history = await stores.runs.readExecutionHistory(
              fixture.guard.runId,
              fixture.guard.attemptId,
            );
            if (history.attempt.version !== 2 || history.attempt.state.kind !== 'prepared')
              throw new Error('prepared history absent');
            const actual = await fixture.executor.resumeSession(
              history.attempt.state.session.locator,
              new AbortController().signal,
            );
            const retained = await stores.artifacts.retainArtifact(
              new TextEncoder().encode(mode === 'bytes' ? '{}' : JSON.stringify(actual)),
              'application/json',
            );
            if (retained.kind !== 'retained') throw new Error('test retention refused');
            unwrapReply(
              await stores.runs.recordExecution(fixture.guard, {
                version: 2,
                kind: 'execution',
                commandId: executionCommandId('recover'),
                fact: {
                  kind: 'unresolved',
                  reason: mode === 'reason' ? 'foreign-observation' : 'unsupported',
                  evidence: retained.reference,
                },
              }),
            );
            const queries = fixture.queries();
            if (mode === 'reason')
              expect(await fixture.invoke()).toEqual({
                kind: 'refused',
                reason: 'identity_conflict',
              });
            else await assert.rejects(fixture.invoke());
            expect(fixture.queries()).toBe(queries);
          }
        } finally {
          await stores.close();
        }
      }
    });
    test('unsupported recovery keeps occupied capacity and refuses actual replacement admission', async () => {
      const stores = await create();
      try {
        const fixture = await prepareApi(stores, 'prepared');
        await fixture.invoke();
        const after = await stores.runs.readRun(fixture.setup.run.runId);
        const original = fixture.before.attempts.at(0);
        if (original === undefined) throw new Error('original attempt absent');
        const replacement = await stores.runs.admitAttempt(
          {
            ownership: fixture.guard.ownership,
            runId: fixture.guard.runId,
            expectedRevision: after.run.revision,
          },
          { attemptId: attemptId('replacement'), identity: original.identity, ordinal: 2 },
        );
        expect({ reservation: after.capacity.reserved, admission: replacement.kind }).toEqual({
          reservation: 1,
          admission: 'refused',
        });
        expect(replacement).toEqual({ kind: 'refused', reason: 'attempt_active' });
      } finally {
        await stores.close();
      }
    });
    test('current takeover owner retains original API turn provenance and capacity', async () => {
      const stores = await create();
      try {
        const fixture = await prepareApi(stores, 'turn_pending');
        stores.clock.advance(101);
        const ownership = unwrapReply(
          await stores.runs.acquireOwnership(ownerId('successor'), fixture.guard.ownership.epoch),
        );
        expect(ownership.epoch).toBe(2);
        const reply = await fixture.invoke({ guard: { ...fixture.guard, ownership } });
        if (
          reply.kind !== 'recorded' ||
          reply.attempt.version !== 2 ||
          reply.attempt.state.kind !== 'unresolved'
        )
          throw new Error('takeover recovery did not retain uncertainty');
        const original = fixture.before.attempts.at(0);
        if (original?.version !== 2 || original.state.kind !== 'turn_pending')
          throw new Error('original turn checkpoint absent');
        expect(reply.attempt.state.checkpoint).toEqual(original.state);
        expect(reply.attempt.state.checkpoint).toMatchObject({
          kind: 'turn_pending',
          turn: { request: { owner: { ownerId: 'owner', epoch: 1 }, turnKey: 'original-turn' } },
        });
        expect((await stores.runs.readRun(fixture.setup.run.runId)).capacity.reserved).toBe(1);
      } finally {
        await stores.close();
      }
    });
    test('refuses stale owner and revision without querying', async () => {
      const stores = await create();
      try {
        const fixture = await prepareApi(stores, 'prepared');
        expect(await fixture.invoke({ guard: { ...fixture.guard, expectedRevision: 0 } })).toEqual({
          kind: 'refused',
          reason: 'revision_conflict',
        });
        stores.clock.advance(101);
        expect(await fixture.invoke()).toEqual({ kind: 'refused', reason: 'owner_stale' });
        expect(fixture.queries()).toBe(0);
      } finally {
        await stores.close();
      }
    });
    test('cancels before query and during renewal', async () => {
      const stores = await create();
      try {
        const fixture = await prepareApi(stores, 'preparing');
        const controller = new AbortController();
        controller.abort();
        let renewals = 0;
        const observing: RunStore = {
          ...stores.runs,
          async renewOwnership(ownership) {
            renewals++;
            return await stores.runs.renewOwnership(ownership);
          },
        };
        expect((await fixture.invoke({ runs: observing, signal: controller.signal })).kind).toBe(
          'cancelled',
        );
        expect(renewals).toBe(0);
        const later = new AbortController();
        const runs: RunStore = {
          ...stores.runs,
          async renewOwnership(ownership) {
            const renewed = await stores.runs.renewOwnership(ownership);
            later.abort();
            return renewed;
          },
        };
        expect((await fixture.invoke({ runs, signal: later.signal })).kind).toBe('cancelled');
        expect(fixture.queries()).toBe(0);
        expect(await stores.runs.readRun(fixture.setup.run.runId)).toEqual(fixture.before);
      } finally {
        await stores.close();
      }
    });
    test('refuses mismatching selection and actual adapter pin or profile', async () => {
      const stores = await create();
      try {
        const fixture = await prepareApi(stores, 'prepared');
        for (const selection of [
          { ...fixture.selection, className: 'foreign' },
          { ...fixture.selection, bindingDigest: 'a'.repeat(64) },
        ])
          expect(await fixture.invoke({ selection })).toEqual({
            kind: 'refused',
            reason: 'identity_conflict',
          });
        for (const executor of [
          { ...fixture.executor, kind: 'human' as const },
          { ...fixture.executor, version: 'foreign' },
          {
            ...fixture.executor,
            capabilities: { ...fixture.executor.capabilities, locateSession: 'durable' as const },
          },
        ])
          expect(await fixture.invoke({ executor })).toEqual({
            kind: 'refused',
            reason: 'identity_conflict',
          });
        expect(fixture.queries()).toBe(0);
      } finally {
        await stores.close();
      }
    });
    test('missing corrupt and unreadable required evidence throws before query', async () => {
      const stores = await create();
      try {
        const fixture = await prepareApi(stores, 'prepared');
        const cause = new Error('retained artifact unreadable');
        for (const fault of ['missing', 'corrupt', 'unreadable']) {
          const artifacts = {
            ...stores.artifacts,
            async readArtifact(reference: Parameters<typeof stores.artifacts.readArtifact>[0]) {
              if (reference.digest === fixture.setup.manifest.prompts[0]?.digest) {
                if (fault === 'corrupt') return new Uint8Array([0xff]);
                throw cause;
              }
              return await stores.artifacts.readArtifact(reference);
            },
          };
          await assert.rejects(fixture.invoke({ artifacts }));
        }
        expect(fixture.queries()).toBe(0);
      } finally {
        await stores.close();
      }
    });
    test('takeover during held actual recovery fences publication and snapshots caller', async () => {
      const stores = await create();
      const entered = Promise.withResolvers<undefined>(),
        release = Promise.withResolvers<undefined>();
      try {
        const fixture = await prepareApi(stores, 'prepared');
        const submitted = structuredClone(fixture.guard);
        const executor: ActivityExecutor = {
          ...fixture.executor,
          async resumeSession(locator, signal) {
            const reply = await fixture.executor.resumeSession(locator, signal);
            entered.resolve(undefined);
            await release.promise;
            return reply;
          },
        };
        const pending = fixture.invoke({ executor, guard: submitted });
        await entered.promise;
        Reflect.set(submitted, 'runId', 'foreign');
        stores.clock.advance(101);
        unwrapReply(
          await stores.runs.acquireOwnership(ownerId('successor'), fixture.guard.ownership.epoch),
        );
        release.resolve(undefined);
        expect(await pending).toEqual({ kind: 'refused', reason: 'owner_stale' });
        expect(await stores.runs.readRun(fixture.setup.run.runId)).toEqual(fixture.before);
      } finally {
        release.resolve(undefined);
        await stores.close();
      }
    });
    test('caller mutation across held query cannot change retained target or command', async () => {
      const stores = await create();
      const entered = Promise.withResolvers<undefined>(),
        release = Promise.withResolvers<undefined>();
      try {
        const fixture = await prepareApi(stores, 'preparing');
        const submitted = structuredClone(fixture.guard);
        const executor: ActivityExecutor = {
          ...fixture.executor,
          async lookupSession(preparation, signal) {
            const reply = await fixture.executor.lookupSession(preparation, signal);
            entered.resolve(undefined);
            await release.promise;
            return reply;
          },
        };
        const pending = fixture.invoke({ executor, guard: submitted });
        await entered.promise;
        Reflect.set(submitted, 'attemptId', attemptId('foreign'));
        release.resolve(undefined);
        expect((await pending).kind).toBe('recorded');
        expect((await stores.runs.readRun(fixture.setup.run.runId)).attempts[0]?.state.kind).toBe(
          'unresolved',
        );
      } finally {
        release.resolve(undefined);
        await stores.close();
      }
    });
    test('awaits retention and publication and retains operational cause', async () => {
      const stores = await create();
      const retained = Promise.withResolvers<undefined>(),
        releaseRetention = Promise.withResolvers<undefined>(),
        publishing = Promise.withResolvers<undefined>(),
        releasePublication = Promise.withResolvers<undefined>();
      const retentionDone = Promise.withResolvers<undefined>(),
        publicationDone = Promise.withResolvers<undefined>();
      const settlements: Promise<undefined>[] = [];
      let outcome:
        | Promise<
            | { kind: 'returned'; reply: Awaited<ReturnType<typeof reconcileApiActivity>> }
            | { kind: 'threw'; cause: unknown }
          >
        | undefined;
      try {
        const fixture = await prepareApi(stores, 'prepared');
        let settlement = 'pending';
        const artifacts = {
          ...stores.artifacts,
          async retainArtifact(bytes: Uint8Array, mediaType: string) {
            settlements.push(retentionDone.promise);
            retained.resolve(undefined);
            try {
              await releaseRetention.promise;
              return await stores.artifacts.retainArtifact(bytes, mediaType);
            } finally {
              retentionDone.resolve(undefined);
            }
          },
        };
        const runs: RunStore = {
          ...stores.runs,
          async recordExecution(guard, command) {
            settlements.push(publicationDone.promise);
            publishing.resolve(undefined);
            try {
              await releasePublication.promise;
              return await stores.runs.recordExecution(guard, command);
            } finally {
              publicationDone.resolve(undefined);
            }
          },
        };
        outcome = fixture.invoke({ runs, artifacts }).then(
          (reply) => {
            settlement = 'returned';
            return { kind: 'returned' as const, reply };
          },
          (cause: unknown) => {
            settlement = 'threw';
            return { kind: 'threw' as const, cause };
          },
        );
        await retained.promise;
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(settlement).toBe('pending');
        releaseRetention.resolve(undefined);
        await publishing.promise;
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(settlement).toBe('pending');
        releasePublication.resolve(undefined);
        const observed = await outcome;
        if (observed.kind === 'threw') throw observed.cause;
        expect(observed.reply.kind).toBe('recorded');
        const cause = new Error('private backend failure');
        const executor: ActivityExecutor = {
          ...fixture.executor,
          resumeSession: () => Promise.reject(cause),
        };
        const current = await fixture.setup.currentGuard();
        await assert.rejects(
          fixture.invoke({ executor, guard: current, commandId: executionCommandId('next') }),
          (error) =>
            error instanceof Error &&
            error.cause === cause &&
            !error.message.includes('private backend'),
        );
      } finally {
        releaseRetention.resolve(undefined);
        releasePublication.resolve(undefined);
        await Promise.all(settlements);
        if (outcome !== undefined) await outcome;
        await stores.close();
      }
    });
  });
}
