import { rejects } from 'node:assert/strict';

import { describe, expect, test } from 'bun:test';

import type { ActivityExecutor, OpenReply } from '../../agents/activity-executor';
import type { ArtifactStore } from '../artifact-store';
import { PreparationDispatchError, prepareActivity } from '../prepare-activity';
import { artifactDigest, executionCommandId, ownerId } from '../record-codecs';
import type { RunStore } from '../run-store';
import { admitExecution, type OutcomeFixture, unwrapReply } from './fixtures';

async function scenario(
  create: () => Promise<OutcomeFixture>,
  check: (context: Awaited<ReturnType<typeof dispatchFixture>>) => Promise<void>,
) {
  const stores = await create();
  try {
    await check(await dispatchFixture(stores));
  } finally {
    stores.close();
  }
}
async function dispatchFixture(stores: OutcomeFixture) {
  const setup = await admitExecution(stores);
  const guard = await setup.currentGuard();
  const input = {
    preparation: structuredClone(setup.preparationInput),
    openedCommandId: executionCommandId('opened'),
  };
  const controller = new AbortController();
  const opaque = { locator: structuredClone(setup.locator), secret: Symbol('adapter identity') };
  let opens = 0;
  const executor = controlledExecutor(() => {
    opens += 1;
    return Promise.resolve({ kind: 'opened', session: opaque });
  });
  const dispatch = (runs = stores.runs, adapter = executor, artifacts = stores.artifacts) =>
    prepareActivity(runs, artifacts, adapter, guard, input, controller.signal);
  return {
    stores,
    setup,
    guard,
    input,
    controller,
    opaque,
    executor,
    dispatch,
    opens: () => opens,
  };
}

async function pendingCheckpoint(
  context: Awaited<ReturnType<typeof dispatchFixture>>,
  kind = 'preparing',
) {
  const snapshot = await context.stores.runs.readRun(context.setup.run.runId);
  expect(snapshot.capacity.reserved).toBe(1);
  expect(snapshot.attempts[0]).toMatchObject({ state: { kind }, holdsCapacity: true });
  return snapshot;
}

/** Controlled external boundary; every unsupported operation throws to catch accidental recovery or cleanup. */
export function controlledExecutor(open: ActivityExecutor['open']): ActivityExecutor {
  const unexpected = () => {
    throw new Error('unexpected executor operation');
  };
  return {
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
    open,
    turn: unexpected,
    lookupSession: unexpected,
    resumeSession: unexpected,
    inspectEffect: unexpected,
    cancel: unexpected,
    observeQuiescence: unexpected,
    close: unexpected,
  };
}

export function preparationDispatchContract(
  name: string,
  create: () => Promise<OutcomeFixture>,
): void {
  describe(name, () => {
    test('rejects malformed guard before persistence and open', () =>
      scenario(create, async (context) => {
        Object.assign(context.guard, { expectedRevision: -1 });
        const before = await context.stores.runs.readRun(context.setup.run.runId);
        await rejects(context.dispatch());
        expect(context.opens()).toBe(0);
        expect(await context.stores.runs.readRun(context.setup.run.runId)).toEqual(before);
      }));
    test('rejects reused opened command identity before retaining preparation', () =>
      scenario(create, async (context) => {
        context.input.openedCommandId = context.input.preparation.commandId;
        const before = await context.stores.runs.readRun(context.setup.run.runId);
        await rejects(context.dispatch(), /command identity/);
        expect(context.opens()).toBe(0);
        expect(await context.stores.runs.readRun(context.setup.run.runId)).toEqual(before);
      }));

    test('rejects malformed opened command identity before retaining preparation', () =>
      scenario(create, async (context) => {
        Object.assign(context.input, { openedCommandId: '' });
        const before = await context.stores.runs.readRun(context.setup.run.runId);
        await rejects(context.dispatch());
        expect(context.opens()).toBe(0);
        expect(await context.stores.runs.readRun(context.setup.run.runId)).toEqual(before);
      }));

    for (const pin of [{ kind: 'tool' as const }, { version: 'other' }])
      test('rejects actual adapter pin ' + JSON.stringify(pin) + ' before intent', () =>
        scenario(create, async (context) => {
          const before = await context.stores.runs.readRun(context.setup.run.runId);
          await rejects(
            context.dispatch(context.stores.runs, { ...context.executor, ...pin }),
            /adapter pin/,
          );
          expect(context.opens()).toBe(0);
          expect(await context.stores.runs.readRun(context.setup.run.runId)).toEqual(before);
        }),
      );

    test('elects one concurrent same-command opener and returns historical duplicate attempt', () =>
      scenario(create, async (context) => {
        const replies = await Promise.all([context.dispatch(), context.dispatch()]);
        expect(replies.map((reply) => reply.kind).sort()).toEqual(['pending', 'prepared']);
        const replay = replies.find((reply) => reply.kind === 'pending');
        if (replay === undefined) throw new Error('duplicate acknowledgement missing');
        expect(replay).toMatchObject({
          reason: 'preparation_already_recorded',
          attempt: { revision: 1, state: { kind: 'preparing' } },
        });
        expect(context.opens()).toBe(1);
        expect(await context.dispatch()).toEqual(replay);
        expect(context.opens()).toBe(1);
        await pendingCheckpoint(context, 'prepared');
      }));

    test('different preparation commands cannot elect a second opener', () =>
      scenario(create, async (context) => {
        const second = {
          ...context.input,
          preparation: {
            ...context.input.preparation,
            commandId: executionCommandId('other-intent'),
          },
        };
        const replies = await Promise.all([
          context.dispatch(),
          prepareActivity(
            context.stores.runs,
            context.stores.artifacts,
            context.executor,
            context.guard,
            second,
            context.controller.signal,
          ),
        ]);
        expect(replies.map((reply) => reply.kind).sort()).toEqual(['prepared', 'refused']);
        expect(context.opens()).toBe(1);
        expect(
          (
            await context.stores.runs.readExecutionHistory(
              context.setup.run.runId,
              context.setup.attempt.attemptId,
            )
          ).executions,
        ).toHaveLength(2);
      }));

    test('changed preparation payload refuses same command replay', () =>
      scenario(create, async (context) => {
        expect((await context.dispatch()).kind).toBe('prepared');
        Object.assign(context.input.preparation.preparation, { creationKey: 'changed' });
        expect(await context.dispatch()).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        expect(context.opens()).toBe(1);
        await pendingCheckpoint(context, 'prepared');
      }));

    for (const fault of ['missing', 'unreadable', 'malformed'] as const)
      test('trusted state ' + fault + ' throws before intent and open', () =>
        scenario(create, async (context) => {
          const before = await context.stores.runs.readRun(context.setup.run.runId);
          const cause = new Error('state read denied');
          let artifacts: ArtifactStore = context.stores.artifacts;
          if (fault === 'missing')
            Object.assign(context.input.preparation.stateEvidence, {
              digest: artifactDigest('f'.repeat(64)),
            });
          if (fault === 'unreadable')
            artifacts = {
              ...artifacts,
              async readArtifact(reference) {
                if (reference.digest === context.input.preparation.stateEvidence.digest)
                  throw cause;
                return await context.stores.artifacts.readArtifact(reference);
              },
            };
          if (fault === 'malformed') {
            const retained = await artifacts.retainArtifact(
              new TextEncoder().encode('{"broken":true}'),
              'application/json',
            );
            if (retained.kind !== 'retained') throw new Error('state fixture refused');
            context.input.preparation.stateEvidence = retained.reference;
          }
          const pending = context.dispatch(context.stores.runs, context.executor, artifacts);
          if (fault === 'unreadable') await rejects(pending, (failure) => failure === cause);
          else await rejects(pending);
          expect(context.opens()).toBe(0);
          expect(await context.stores.runs.readRun(context.setup.run.runId)).toEqual(before);
        }),
      );

    test('preparation store refusal prevents open', () =>
      scenario(create, async (context) => {
        Object.assign(context.guard, { expectedRevision: 0 });
        expect(await context.dispatch()).toEqual({ kind: 'refused', reason: 'revision_conflict' });
        expect(context.opens()).toBe(0);
        await pendingCheckpoint(context, 'queued');
      }));

    test('cancellation before renewal retains preparing without open', () =>
      scenario(create, async (context) => {
        context.stores.clock.advance(50);
        context.controller.abort();
        expect(await context.dispatch()).toMatchObject({
          kind: 'pending',
          reason: 'cancelled_before_dispatch',
        });
        expect(context.opens()).toBe(0);
        await pendingCheckpoint(context);
        context.stores.clock.advance(51);
        expect(
          (
            await context.stores.runs.acquireOwnership(
              ownerId('replacement'),
              context.setup.ownership.epoch,
            )
          ).kind,
        ).toBe('applied');
      }));

    for (const fault of ['cancel', 'takeover'] as const)
      test('held ownership renewal ' + fault + ' prevents open', () =>
        scenario(create, async (context) => {
          const entered = Promise.withResolvers<undefined>();
          const release = Promise.withResolvers<undefined>();
          const runs: RunStore = {
            ...context.stores.runs,
            async renewOwnership(ownership) {
              entered.resolve(undefined);
              await release.promise;
              return await context.stores.runs.renewOwnership(ownership);
            },
          };
          const pending = context.dispatch(runs);
          await entered.promise;
          if (fault === 'cancel') context.controller.abort();
          else {
            context.stores.clock.advance(101);
            unwrapReply(
              await context.stores.runs.acquireOwnership(
                ownerId('replacement'),
                context.setup.ownership.epoch,
              ),
            );
          }
          release.resolve(undefined);
          const reply = await pending;
          expect(reply).toMatchObject(
            fault === 'cancel'
              ? { kind: 'pending', reason: 'cancelled_before_dispatch' }
              : { kind: 'refused', reason: 'owner_stale' },
          );
          expect(context.opens()).toBe(0);
          await pendingCheckpoint(context);
        }),
      );

    for (const kind of ['not_started', 'unresolved'] as const)
      test('executor ' + kind + ' retains preparing and never authorizes retry', () =>
        scenario(create, async (context) => {
          const executor = controlledExecutor(() =>
            Promise.resolve(
              kind === 'not_started'
                ? { kind, reason: 'cancelled_before_dispatch' }
                : {
                    kind,
                    preparation: context.setup.preparationInput.preparation,
                    reason: 'unsupported',
                  },
            ),
          );
          expect(await context.dispatch(context.stores.runs, executor)).toMatchObject({
            kind: 'pending',
            reason: kind === 'not_started' ? 'cancelled_before_dispatch' : 'executor_unresolved',
            attempt: { revision: 1 },
          });
          expect(await context.dispatch()).toMatchObject({
            kind: 'pending',
            reason: 'preparation_already_recorded',
          });
          expect(context.opens()).toBe(0);
          await pendingCheckpoint(context);
        }),
      );

    test('mismatching unresolved preparation throws correlated failure', () =>
      scenario(create, async (context) => {
        const executor = controlledExecutor(() =>
          Promise.resolve({
            kind: 'unresolved',
            reason: 'unsupported',
            preparation: { ...context.setup.preparationInput.preparation, creationKey: 'foreign' },
          }),
        );
        await rejects(context.dispatch(context.stores.runs, executor), (failure) => {
          expect(failure).toBeInstanceOf(PreparationDispatchError);
          if (!(failure instanceof PreparationDispatchError)) return false;
          expect(failure.preparation).toEqual(context.setup.preparationInput.preparation);
          expect(failure.locator).toBeNull();
          expect(failure.cause).toBeInstanceOf(Error);
          return true;
        });
        await pendingCheckpoint(context);
      }));

    test('throwing open keeps original cause and detached immutable preparation', () =>
      scenario(create, async (context) => {
        const cause = new Error('private provider content');
        const executor = controlledExecutor(() => Promise.reject(cause));
        await rejects(context.dispatch(context.stores.runs, executor), (failure) => {
          if (!(failure instanceof PreparationDispatchError)) return false;
          expect(failure.cause).toBe(cause);
          expect(failure.message).not.toContain(cause.message);
          const original = structuredClone(context.input.preparation.preparation);
          Object.assign(context.input.preparation.preparation.identity, {
            occurrenceId: 'mutated',
          });
          expect(failure.preparation).toEqual(original);
          expect(Object.isFrozen(failure.preparation)).toBe(true);
          expect(Object.isFrozen(failure.preparation.identity)).toBe(true);
          expect(failure.locator).toBeNull();
          return true;
        });
        await pendingCheckpoint(context);
      }));

    for (const fault of ['malformed', 'mismatch'] as const)
      test('opened locator ' + fault + ' never exposes session', () =>
        scenario(create, async (context) => {
          if (fault === 'malformed')
            Object.assign(context.opaque.locator.session, { sessionId: '' });
          else Object.assign(context.opaque.locator.preparation, { creationKey: 'foreign' });
          await rejects(context.dispatch(), (failure) => {
            if (!(failure instanceof PreparationDispatchError)) return false;
            expect(failure.locator).toEqual(fault === 'malformed' ? null : context.opaque.locator);
            expect(failure.cause).toBeInstanceOf(Error);
            return true;
          });
          expect(context.opens()).toBe(1);
          await pendingCheckpoint(context);
        }),
      );

    for (const fault of ['refused', 'throw'] as const)
      test(
        'locator persistence ' + fault + ' throws known locator and preserves original cause',
        () =>
          scenario(create, async (context) => {
            const cause = new Error('private persistence failure');
            const runs: RunStore = {
              ...context.stores.runs,
              async recordExecution(guard, command) {
                if (command.fact.kind === 'session_prepared') {
                  if (fault === 'throw') throw cause;
                  return { kind: 'refused', reason: 'revision_conflict' };
                }
                return await context.stores.runs.recordExecution(guard, command);
              },
            };
            await rejects(context.dispatch(runs), (failure) => {
              if (!(failure instanceof PreparationDispatchError)) return false;
              expect(failure.locator).toEqual(context.setup.locator);
              expect(failure.preparation).toEqual(context.setup.preparationInput.preparation);
              if (fault === 'throw') expect(failure.cause).toBe(cause);
              else expect(String(failure.cause)).toContain('revision_conflict');
              const original = structuredClone(context.opaque.locator);
              Object.assign(context.opaque.locator.session, { sessionId: 'mutated' });
              expect(failure.locator).toEqual(original);
              expect(Object.isFrozen(failure.locator?.session)).toBe(true);
              return true;
            });
            expect(context.opens()).toBe(1);
            await pendingCheckpoint(context);
          }),
      );

    for (const fault of ['takeover', 'intervening'] as const)
      test(
        'held open ' + fault + ' refuses locator save using original owner and exact revisions',
        () =>
          scenario(create, async (context) => {
            const entered = Promise.withResolvers<undefined>();
            const release = Promise.withResolvers<undefined>();
            const executor = controlledExecutor(async () => {
              entered.resolve(undefined);
              await release.promise;
              return { kind: 'opened', session: context.opaque };
            });
            const pending = context.dispatch(context.stores.runs, executor);
            const rejected = rejects(pending, (failure) => {
              if (!(failure instanceof PreparationDispatchError)) return false;
              expect(failure.locator).toEqual(context.setup.locator);
              expect(String(failure.cause)).toContain(
                fault === 'takeover' ? 'owner_stale' : 'revision_conflict',
              );
              return true;
            });
            await entered.promise;
            if (fault === 'takeover') {
              context.stores.clock.advance(101);
              unwrapReply(
                await context.stores.runs.acquireOwnership(
                  ownerId('replacement'),
                  context.setup.ownership.epoch,
                ),
              );
            } else
              unwrapReply(
                await context.stores.runs.recordExecution(await context.setup.currentGuard(), {
                  version: 2,
                  kind: 'execution',
                  commandId: executionCommandId('reconcile'),
                  fact: { kind: 'recovery_required', reason: 'observation pending' },
                }),
              );
            release.resolve(undefined);
            await rejected;
            await pendingCheckpoint(context, fault === 'takeover' ? 'preparing' : 'reconciling');
          }),
      );

    for (const fault of ['checkpoint', 'preparation', 'capacity'] as const)
      test('rejects corrupt applied ' + fault + ' before open', () =>
        scenario(create, async (context) => {
          const runs: RunStore = {
            ...context.stores.runs,
            async recordExecution(guard, command) {
              const reply = await context.stores.runs.recordExecution(guard, command);
              if (command.fact.kind !== 'preparation_intended' || reply.kind !== 'applied')
                return reply;
              if (fault === 'capacity')
                return { ...reply, value: { ...reply.value, holdsCapacity: false } };
              if (fault === 'checkpoint')
                return { ...reply, value: { ...reply.value, state: { kind: 'queued' } } };
              if (reply.value.state.kind !== 'preparing')
                throw new Error('fixture checkpoint differs');
              return {
                ...reply,
                value: {
                  ...reply.value,
                  state: {
                    ...reply.value.state,
                    preparation: {
                      ...reply.value.state.preparation,
                      preparation: {
                        ...reply.value.state.preparation.preparation,
                        creationKey: 'foreign',
                      },
                    },
                  },
                },
              };
            },
          };
          await rejects(
            context.dispatch(runs),
            fault === 'checkpoint'
              ? /checkpoint differs/
              : fault === 'capacity'
                ? /capacity/
                : /retained preparation differs/,
          );
          expect(context.opens()).toBe(0);
          await pendingCheckpoint(context);
        }),
      );

    for (const branch of ['preparation', 'guard'] as const)
      test('snapshots submitted ' + branch + ' before awaited validation', () =>
        scenario(create, async (context) => {
          const entered = Promise.withResolvers<undefined>();
          const release = Promise.withResolvers<undefined>();
          const runs: RunStore = {
            ...context.stores.runs,
            async readRun(identity) {
              entered.resolve(undefined);
              await release.promise;
              return await context.stores.runs.readRun(identity);
            },
          };
          const pending = context.dispatch(runs);
          await entered.promise;
          if (branch === 'preparation')
            Object.assign(context.input.preparation.preparation, { creationKey: 'mutated' });
          else
            Object.assign(context.guard, { expectedRevision: 999, expectedAttemptRevision: 999 });
          release.resolve(undefined);
          expect((await pending).kind).toBe('prepared');
          const history = await context.stores.runs.readExecutionHistory(
            context.setup.run.runId,
            context.setup.attempt.attemptId,
          );
          expect(history.attempt.state).toMatchObject({
            kind: 'prepared',
            session: { locator: context.setup.locator },
          });
        }),
      );

    test('snapshots serializable caller input before awaits and locator before persistence awaits', () =>
      scenario(create, async (context) => {
        const entered = Promise.withResolvers<undefined>();
        const release = Promise.withResolvers<undefined>();
        const saving = Promise.withResolvers<undefined>();
        const saved = Promise.withResolvers<undefined>();
        const original = structuredClone(context.input);
        const runs: RunStore = {
          ...context.stores.runs,
          async readRun(identity) {
            entered.resolve(undefined);
            await release.promise;
            return await context.stores.runs.readRun(identity);
          },
          async recordExecution(guard, command) {
            if (command.fact.kind === 'session_prepared') {
              saving.resolve(undefined);
              await saved.promise;
            }
            return await context.stores.runs.recordExecution(guard, command);
          },
        };
        const pending = context.dispatch(runs);
        await entered.promise;
        Object.assign(context.input.preparation.preparation, { creationKey: 'mutated' });
        Object.assign(context.input.preparation.executor, { version: 'mutated' });
        Object.assign(context.input, { openedCommandId: 'mutated' });
        Object.assign(context.guard, { expectedRevision: 999, expectedAttemptRevision: 999 });
        release.resolve(undefined);
        await saving.promise;
        Object.assign(context.opaque.locator.session, { sessionId: 'mutated' });
        saved.resolve(undefined);
        const reply = await pending;
        expect(reply.kind).toBe('prepared');
        const history = await context.stores.runs.readExecutionHistory(
          context.setup.run.runId,
          context.setup.attempt.attemptId,
        );
        expect(history.executions.map((entry) => entry.command.commandId)).toEqual([
          original.preparation.commandId,
          original.openedCommandId,
        ]);
        expect(history.attempt.state).toMatchObject({
          kind: 'prepared',
          session: { locator: context.setup.locator },
        });
        if (reply.kind !== 'prepared') throw new Error('session not published');
        expect(reply.session).toBe(context.opaque);
      }));

    test('retains preparing before open and publishes original opaque session only after locator commit', async () => {
      const stores = await create();
      try {
        const setup = await admitExecution(stores);
        const opened = Promise.withResolvers<OpenReply>();
        const entered = Promise.withResolvers<undefined>();
        const saving = Promise.withResolvers<undefined>();
        const saved = Promise.withResolvers<undefined>();
        const opaque = { locator: setup.locator, secret: Symbol('adapter identity') };
        const executor = controlledExecutor(async (preparation, signal) => {
          expect(preparation).toEqual(setup.preparationInput.preparation);
          expect(signal).toBe(controller.signal);
          const history = await stores.runs.readExecutionHistory(
            setup.run.runId,
            setup.attempt.attemptId,
          );
          expect(history.executions).toHaveLength(1);
          expect(history.attempt).toMatchObject({
            state: { kind: 'preparing' },
            holdsCapacity: true,
          });
          expect((await stores.runs.readRun(setup.run.runId)).capacity.reserved).toBe(1);
          entered.resolve(undefined);
          return await opened.promise;
        });
        const runs: RunStore = {
          ...stores.runs,
          async recordExecution(guard, command) {
            if (command.fact.kind === 'session_prepared') {
              saving.resolve(undefined);
              await saved.promise;
            }
            return await stores.runs.recordExecution(guard, command);
          },
        };
        const controller = new AbortController();
        let published = false;
        const pending = prepareActivity(
          runs,
          stores.artifacts,
          executor,
          await setup.currentGuard(),
          {
            preparation: setup.preparationInput,
            openedCommandId: executionCommandId('opened'),
          },
          controller.signal,
        ).then((reply) => {
          published = true;
          return reply;
        });
        await entered.promise;
        expect(published).toBe(false);
        opened.resolve({ kind: 'opened', session: opaque });
        await saving.promise;
        await Promise.resolve();
        expect(published).toBe(false);
        expect((await stores.runs.readRun(setup.run.runId)).attempts[0]?.state.kind).toBe(
          'preparing',
        );
        saved.resolve(undefined);
        const reply = await pending;
        if (reply.kind !== 'prepared') throw new Error('session was not prepared');
        expect(reply.session).toBe(opaque);
        expect(reply.attempt).toMatchObject({
          revision: 2,
          holdsCapacity: true,
          state: { kind: 'prepared' },
        });
        expect(
          (await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId))
            .executions,
        ).toHaveLength(2);
      } finally {
        stores.close();
      }
    });
  });
}
