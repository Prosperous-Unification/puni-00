import { rejects } from 'node:assert/strict';

import { canonicalRuntimeRequest } from '@wbs/contracts';
import { describe, expect, test } from 'bun:test';

import { createRuntimeClient } from '../../bridge/runtime-client';
import { claimActivity } from '../claim-activity';
import { dispatchAuthority } from '../dispatch-authority';
import { dispatchRecovery } from '../dispatch-recovery';
import { ownerId } from '../record-codecs';
import { RecoveryDispatchError } from '../recovery-dispatch-error';
import { readRecoveryExchange } from '../recovery-evidence';
import type { RecoveryFence } from '../recovery-records';
import { readRuntimeRequest } from '../runtime-codecs';
import { acceptRuntimeReceipt } from '../runtime-history';
import type { OutcomeFixture } from './fixtures';
import { unwrapReply } from './fixtures';
import {
  acquireReceiverAuthority,
  closeRecoveryResources,
  createRecoveryReceiver,
  readReceiverState,
  type RecoveryReceiverFixture,
  waitForReceiver,
} from './recovery-receiver';

export async function beginAuthority(
  stores: OutcomeFixture,
  receiver: RecoveryReceiverFixture,
  expectedGeneration: number | null,
) {
  const ownership = unwrapReply(
    await stores.runs.acquireOwnership(ownerId('resolver'), stores.ownership.epoch),
  );
  const scope = receiver.scope;
  unwrapReply(
    await stores.runs.pinRuntimeScope(ownership, {
      version: 1,
      scope,
      ledgerId: receiver.ledgerId,
    }),
  );
  const original = unwrapReply(
    await stores.runs.stageRuntimeRequest(
      { ownership, scope, expectedRevision: 0 },
      canonicalRuntimeRequest(scope, {
        schemaVersion: 1,
        kind: 'authority',
        commandId: 'original',
        expectedLedgerId: receiver.ledgerId,
        expectedGeneration,
        ownerId: 'original-owner',
      }),
    ),
  );
  const guard = { ownership, scope, expectedRevision: 1, expectedRecoveryRevision: 0 };
  const call = { kind: 'authority' as const, guard, recoveryId: 'recover-original' };
  unwrapReply(
    await stores.runs.beginRecovery({
      kind: 'authority',
      guard,
      intent: {
        version: 1,
        recoveryId: call.recoveryId,
        target: { kind: 'authority', original },
        begunScopeRevision: 1,
        resolver: { ownerId: ownership.ownerId, epoch: ownership.epoch },
      },
    }),
  );
  return { call, original };
}

export function recoveryDispatchContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name + ' real recovery dispatch', () => {
    test('weak fence control admits delayed original at generation3; production refuses state1 below expected2', async () => {
      const stores = await create();
      const receiver = await createRecoveryReceiver();
      try {
        expect((await acquireReceiverAuthority(receiver, 'first', null)).reply.kind).toBe(
          'success',
        );
        const { call, original } = await beginAuthority(stores, receiver, 2);
        const held = receiver.pause('original');
        const delayed = receiver.client.acquireAuthority({
          params: { id: receiver.scope.projectId },
          body: {
            schemaVersion: 1,
            commandId: 'original',
            expectedLedgerId: receiver.ledgerId,
            personId: receiver.scope.personId,
            expectedGeneration: 2,
            ownerId: 'original-owner',
          },
        });
        await waitForReceiver(held.entered);
        try {
          expect(
            await dispatchRecovery(
              stores.runs,
              stores.artifacts,
              receiver.client,
              call,
              new AbortController().signal,
            ),
          ).toMatchObject({
            kind: 'pending',
            reason: 'below_threshold',
            observation: {
              kind: 'below_threshold',
              state: { body: { value: { authority: { generation: 1 } } } },
            },
          });
          expect((await acquireReceiverAuthority(receiver, 'weak-fence', 1)).reply).toMatchObject({
            kind: 'success',
            body: { acceptance: { authority: { generation: 2 } } },
          });
        } finally {
          held.release();
        }
        expect((await delayed).reply).toMatchObject({
          kind: 'success',
          body: { commandId: original.commandId, acceptance: { authority: { generation: 3 } } },
        });
        expect((await readReceiverState(receiver)).authority).toMatchObject({ generation: 3 });
        const closed = await dispatchRecovery(
          stores.runs,
          stores.artifacts,
          receiver.client,
          call,
          new AbortController().signal,
        );
        expect(closed).toMatchObject({
          kind: 'resolved',
          closure: {
            decision: { kind: 'accepted' },
            fence: {
              observation: {
                reply: { body: { value: { acceptance: { authority: { generation: 4 } } } } },
              },
            },
          },
        });
        expect((await readReceiverState(receiver)).authority).toMatchObject({ generation: 4 });
        expect(await stores.runs.readRuntimeScope(receiver.scope)).toMatchObject({
          pendingCommandId: null,
          activeRecoveryId: null,
          generationFloor: 4,
        });
      } finally {
        await closeRecoveryResources([receiver, stores]);
      }
    });

    test('stage acknowledgement precedes POST and observation acknowledgement precedes original lookup', async () => {
      const stores = await create();
      const receiver = await createRecoveryReceiver();
      const releaseStage = Promise.withResolvers<undefined>();
      const enteredStage = Promise.withResolvers<undefined>();
      const releaseObservation = Promise.withResolvers<undefined>();
      const enteredObservation = Promise.withResolvers<undefined>();
      const trace: string[] = [];
      try {
        const { call } = await beginAuthority(stores, receiver, null);
        receiver.observeRequests((request) => {
          if (request.operationId === 'acquireRuntimeAuthority') trace.push('fence-post');
          if (request.operationId === 'lookupRuntimeReceipt') trace.push('original-lookup');
        });
        const dispatch = dispatchRecovery(
          {
            ...stores.runs,
            async stageRecoveryFence(input) {
              const ack = await stores.runs.stageRecoveryFence(input);
              enteredStage.resolve(undefined);
              await releaseStage.promise;
              trace.push('fence-stage-acknowledgement-released');
              return ack;
            },
            async recordRecoveryFence(input) {
              const ack = await stores.runs.recordRecoveryFence(input);
              enteredObservation.resolve(undefined);
              await releaseObservation.promise;
              trace.push('observation-acknowledgement-released');
              return ack;
            },
          },
          stores.artifacts,
          receiver.client,
          call,
          new AbortController().signal,
        );
        let assertionFailure: Error | undefined;
        try {
          await waitForReceiver(enteredStage.promise);
          await readReceiverState(receiver);
          expect(trace).not.toContain('fence-post');
          releaseStage.resolve(undefined);
          await waitForReceiver(enteredObservation.promise);
          await readReceiverState(receiver);
          expect(trace).toContain('fence-stage-acknowledgement-released');
          expect(trace.indexOf('fence-post')).toBeGreaterThan(
            trace.indexOf('fence-stage-acknowledgement-released'),
          );
          expect(trace).not.toContain('original-lookup');
        } catch (cause) {
          if (!(cause instanceof Error))
            throw new Error('non-error chronology assertion', { cause });
          assertionFailure = cause;
        } finally {
          releaseStage.resolve(undefined);
          releaseObservation.resolve(undefined);
        }
        const delivered = await dispatch;
        if (assertionFailure !== undefined) throw assertionFailure;
        expect(delivered).toMatchObject({
          kind: 'resolved',
          closure: { decision: { kind: 'fenced_nonaccepted' } },
        });
        expect(trace.indexOf('original-lookup')).toBeGreaterThan(
          trace.indexOf('observation-acknowledgement-released'),
        );
        const before = receiver.requests.length;
        expect(
          await dispatchRecovery(
            stores.runs,
            stores.artifacts,
            receiver.client,
            call,
            new AbortController().signal,
          ),
        ).toMatchObject({ kind: 'resolved' });
        expect(receiver.requests.length).toBe(before);
      } finally {
        releaseStage.resolve(undefined);
        releaseObservation.resolve(undefined);
        await closeRecoveryResources([receiver, stores]);
      }
    });

    for (const accepted of [false, true])
      test(
        'claim actual returned binding and delayed-request domination accepted=' + String(accepted),
        async () => {
          const stores = await create();
          const receiver = await createRecoveryReceiver();
          try {
            const setup = await beginClaim(stores, receiver);
            const pause = receiver.pause(setup.request.commandId);
            const deliver = receiver.client.applyCommands({
              params: { id: receiver.scope.projectId },
              body: { ...setup.request, personId: receiver.scope.personId },
            });
            await waitForReceiver(pause.entered);
            if (accepted) pause.release();
            let receipt: Awaited<typeof deliver> | undefined;
            if (accepted) receipt = await deliver;
            try {
              if (receipt !== undefined) expect(receipt.reply.kind).toBe('success');
              const closed = await dispatchRecovery(
                stores.runs,
                stores.artifacts,
                receiver.client,
                setup.call,
                new AbortController().signal,
              );
              expect(closed).toMatchObject({
                kind: 'resolved',
                closure: {
                  attemptReply: {
                    version: 3,
                    holdsCapacity: true,
                    state: {
                      kind: 'recovery_hold',
                      cause: accepted ? 'claim_accepted_fenced' : 'claim_nonaccepted',
                    },
                  },
                },
              });
              if (closed.kind !== 'resolved') throw new Error('claim closure missing');
              if (
                accepted &&
                receipt?.reply.kind === 'success' &&
                receipt.reply.body.acceptance.kind === 'claim'
              ) {
                expect(closed.closure.originalReply).toMatchObject({
                  kind: 'claim',
                  command: {
                    projection: {
                      claimId: receipt.reply.body.acceptance.claim.claimId,
                      actorId: receiver.actorId,
                      basisAfter: receipt.reply.body.acceptance.basisAfter,
                    },
                  },
                  ack: { attempt: { version: 2, state: { kind: 'ready' } } },
                });
                expect((await readReceiverState(receiver)).claims).toHaveLength(1);
              }
              expect((await readReceiverState(receiver)).authority).toMatchObject({
                generation: 2,
              });
              expect(await stores.runs.readRun(setup.run.runId)).toMatchObject({
                attempts: [{ version: 3, holdsCapacity: true }],
              });
            } finally {
              pause.release();
            }
            if (!accepted) {
              expect((await deliver).reply).toMatchObject({
                kind: 'refusal',
                body: { error: 'runtime_authority_stale' },
              });
              expect((await readReceiverState(receiver)).claims).toEqual([]);
            }
          } finally {
            await closeRecoveryResources([receiver, stores]);
          }
        },
      );
    for (const cut of ['before-send', 'lost-reply'] as const)
      test('resumes exact retained fence after ' + cut, async () => {
        const stores = await create();
        const receiver = await createRecoveryReceiver();
        try {
          const { call } = await beginAuthority(stores, receiver, null);
          const failure = new Error('injected ' + cut);
          const client = {
            ...receiver.client,
            async acquireAuthority(input: Parameters<typeof receiver.client.acquireAuthority>[0]) {
              if (cut === 'before-send') throw failure;
              await receiver.client.acquireAuthority(input);
              return {
                reply: {
                  kind: 'failure' as const,
                  failure: { code: 'transport' as const, cause: failure },
                },
                response: null,
              };
            },
          };
          if (cut === 'before-send')
            await rejects(
              dispatchRecovery(
                stores.runs,
                stores.artifacts,
                client,
                call,
                new AbortController().signal,
              ),
              (cause: unknown) => {
                expect(cause).toMatchObject({
                  code: 'unexpected',
                  recoveryId: call.recoveryId,
                  cause: failure,
                });
                return true;
              },
            );
          else
            expect(
              await dispatchRecovery(
                stores.runs,
                stores.artifacts,
                client,
                call,
                new AbortController().signal,
              ),
            ).toMatchObject({
              kind: 'pending',
              reason: 'transport',
              observation: { kind: 'failure', failure: { cause: failure } },
            });
          const history = await stores.runs.readRuntimeScope(receiver.scope);
          if (history.version !== 2 || history.kind !== 'pinned')
            throw new Error('history missing');
          const journal = history.recoveries[0];
          const fence = journal.fences[0];
          expect(journal.fences).toHaveLength(1);
          expect(journal.observations).toHaveLength(0);
          expect(
            await dispatchRecovery(
              stores.runs,
              stores.artifacts,
              receiver.client,
              { ...call, guard: { ...call.guard, expectedRecoveryRevision: journal.revision } },
              new AbortController().signal,
            ),
          ).toMatchObject({ kind: 'resolved' });
          expect(await stores.runs.readRuntimeScope(receiver.scope)).toMatchObject({
            recoveries: [{ fences: [fence] }],
          });
          expect(
            receiver.requests
              .filter((entry) => entry.operationId === 'acquireRuntimeAuthority')
              .map((entry) => entry.commandId),
          ).toEqual(
            cut === 'before-send'
              ? ['recover-original:fence:1']
              : ['recover-original:fence:1', 'recover-original:fence:1'],
          );
        } finally {
          await closeRecoveryResources([receiver, stores]);
        }
      });

    for (const when of ['before', 'stage', 'renew'] as const)
      test('live cancellation remains unresolved at ' + when, async () => {
        const stores = await create();
        const receiver = await createRecoveryReceiver();
        try {
          const { call } = await beginAuthority(stores, receiver, null);
          const controller = new AbortController();
          if (when === 'before') controller.abort();
          const reply = await dispatchRecovery(
            {
              ...stores.runs,
              async stageRecoveryFence(input) {
                const ack = await stores.runs.stageRecoveryFence(input);
                if (when === 'stage') controller.abort();
                return ack;
              },
              async renewOwnership(owner) {
                const ack = await stores.runs.renewOwnership(owner);
                if (when === 'renew') controller.abort();
                return ack;
              },
            },
            stores.artifacts,
            receiver.client,
            call,
            controller.signal,
          );
          expect(reply).toMatchObject({
            kind: 'pending',
            reason: 'cancelled',
            observation: { kind: 'cancelled_before_dispatch' },
          });
          expect(
            receiver.requests.filter((entry) => entry.operationId === 'acquireRuntimeAuthority'),
          ).toEqual([]);
          expect(await stores.runs.readRuntimeScope(receiver.scope)).toMatchObject({
            activeRecoveryId: call.recoveryId,
            pendingCommandId: 'original',
          });
        } finally {
          await closeRecoveryResources([receiver, stores]);
        }
      });

    test('owner takeover refuses before POST and explicit new resolver keeps old fence provenance', async () => {
      const stores = await create();
      const receiver = await createRecoveryReceiver();
      try {
        const { call } = await beginAuthority(stores, receiver, null);
        let replacement: typeof call.guard.ownership | undefined;
        const refused = await dispatchRecovery(
          {
            ...stores.runs,
            async renewOwnership(owner) {
              stores.clock.advance(101);
              replacement = unwrapReply(
                await stores.runs.acquireOwnership(ownerId('replacement'), owner.epoch),
              );
              return stores.runs.renewOwnership(owner);
            },
          },
          stores.artifacts,
          receiver.client,
          call,
          new AbortController().signal,
        );
        expect(refused).toMatchObject({ kind: 'refused' });
        expect(
          receiver.requests.filter((entry) => entry.operationId === 'acquireRuntimeAuthority'),
        ).toEqual([]);
        if (replacement === undefined) throw new Error('takeover absent');
        const scope = await stores.runs.readRuntimeScope(receiver.scope);
        if (scope.kind !== 'pinned' || scope.version !== 2) throw new Error('scope missing');
        const fence = scope.recoveries[0].fences[0];
        expect(
          await dispatchRecovery(
            stores.runs,
            stores.artifacts,
            receiver.client,
            {
              ...call,
              guard: { ...call.guard, ownership: replacement, expectedRecoveryRevision: 1 },
            },
            new AbortController().signal,
          ),
        ).toMatchObject({
          kind: 'resolved',
          closure: {
            resolver: { ownerId: 'replacement', epoch: 2 },
            fence: { fence: { owner: { ownerId: 'resolver', epoch: 1 } } },
          },
        });
        expect(await stores.runs.readRuntimeScope(receiver.scope)).toMatchObject({
          recoveries: [{ fences: [fence] }],
        });
      } finally {
        await closeRecoveryResources([receiver, stores]);
      }
    });

    for (const fault of [
      'transport',
      'ledger',
      'project',
      'forbidden',
      'invalid-response',
      'capture',
    ] as const)
      test('original lookup preserves precise failure ' + fault, async () => {
        const stores = await create();
        const receiver = await createRecoveryReceiver();
        try {
          const { call } = await beginAuthority(stores, receiver, null);
          const failure = new Error('lookup unavailable');
          const client = {
            ...receiver.client,
            async lookupReceipt(input: Parameters<typeof receiver.client.lookupReceipt>[0]) {
              if (fault === 'transport')
                return {
                  reply: {
                    kind: 'failure' as const,
                    failure: { code: 'transport' as const, cause: failure },
                  },
                  response: null,
                };
              if (fault === 'invalid-response')
                return {
                  reply: {
                    kind: 'failure' as const,
                    failure: {
                      code: 'invalid_response' as const,
                      reason: 'json' as const,
                      status: 200,
                      headers: new Headers(),
                    },
                  },
                  response: null,
                };
              if (fault === 'forbidden') receiver.revokeAccess();
              const actual = await receiver.client.lookupReceipt(
                fault === 'ledger'
                  ? { ...input, query: { ...input.query, expectedLedgerId: 'wrong' } }
                  : fault === 'project'
                    ? { ...input, params: { ...input.params, id: 'wrong' } }
                    : input,
              );
              return fault === 'capture' ? { ...actual, response: null } : actual;
            },
          };
          const dispatch = dispatchRecovery(
            stores.runs,
            stores.artifacts,
            client,
            call,
            new AbortController().signal,
          );
          if (fault === 'invalid-response' || fault === 'capture')
            await rejects(dispatch, (cause: unknown) => {
              expect(cause).toMatchObject({
                code: 'unexpected',
                recoveryId: call.recoveryId,
              });
              return true;
            });
          else
            expect(await dispatch).toMatchObject({
              kind: 'pending',
              reason: fault === 'transport' ? 'transport' : 'receiver_refused',
              observation: { kind: fault === 'transport' ? 'failure' : 'refusal' },
            });
          expect(await stores.runs.readRuntimeScope(receiver.scope)).toMatchObject({
            activeRecoveryId: call.recoveryId,
            recoveries: [{ closure: null, observations: [{ kind: 'accepted' }] }],
          });
        } finally {
          await closeRecoveryResources([receiver, stores]);
        }
      });

    test('caller guards are snapshotted before first scope await', async () => {
      const stores = await create();
      const receiver = await createRecoveryReceiver();
      try {
        const { call } = await beginAuthority(stores, receiver, null);
        let first = true;
        const dispatch = dispatchRecovery(
          {
            ...stores.runs,
            async readRuntimeScope(scope) {
              const snapshot = await stores.runs.readRuntimeScope(scope);
              if (first) {
                first = false;
                Object.assign(call.guard, { expectedRevision: 999, expectedRecoveryRevision: 999 });
                Object.assign(call.guard.ownership, { epoch: 999 });
                Object.assign(call.guard.scope, { personId: 'changed' });
              }
              return snapshot;
            },
          },
          stores.artifacts,
          receiver.client,
          call,
          new AbortController().signal,
        );
        expect(await dispatch).toMatchObject({ kind: 'resolved' });
      } finally {
        await closeRecoveryResources([receiver, stores]);
      }
    });

    for (const fault of ['missing', 'unreadable', 'corrupt'] as const)
      test('claim verifies complete manifest artifacts before POST ' + fault, async () => {
        const stores = await create();
        const receiver = await createRecoveryReceiver();
        try {
          const setup = await beginClaim(stores, receiver);
          const manifest = await stores.runs.readManifest(setup.run.manifestDigest);
          const prompt = manifest.prompts[0];
          const before = receiver.requests.length;
          await rejects(
            dispatchRecovery(
              stores.runs,
              {
                ...stores.artifacts,
                readArtifact(reference) {
                  if (reference.digest === prompt.digest) {
                    if (fault === 'corrupt')
                      return Promise.resolve(new TextEncoder().encode('corrupt'));
                    throw new Error(fault + ' artifact');
                  }
                  return stores.artifacts.readArtifact(reference);
                },
              },
              receiver.client,
              setup.call,
              new AbortController().signal,
            ),
            (cause: unknown) => {
              expect(cause).toMatchObject({
                code: 'unexpected',
                recoveryId: setup.call.recoveryId,
              });
              return true;
            },
          );
          expect(receiver.requests.length).toBe(before);
        } finally {
          await closeRecoveryResources([receiver, stores]);
        }
      });
    for (const lostThird of [false, true])
      test(
        'three canonical identities and three POSTs bound contention; retained third resumes lost=' +
          String(lostThird),
        async () => {
          const stores = await create();
          const receiver = await createRecoveryReceiver();
          try {
            const setup = await beginClaim(stores, receiver);
            let posts = 0;
            const trace: string[] = [];
            const transportFailure = new Error('third accepted reply lost');
            const client = {
              ...receiver.client,
              async readState(input: Parameters<typeof receiver.client.readState>[0]) {
                trace.push('state');
                return receiver.client.readState(input);
              },
              async lookupReceipt(input: Parameters<typeof receiver.client.lookupReceipt>[0]) {
                trace.push('lookup:' + input.params.commandId);
                return receiver.client.lookupReceipt(input);
              },
              async acquireAuthority(
                input: Parameters<typeof receiver.client.acquireAuthority>[0],
              ) {
                posts += 1;
                trace.push('post:' + String(posts));
                if (posts < 3 || !lostThird) {
                  const current = await readReceiverState(receiver);
                  if (current.authority.kind !== 'held')
                    throw new Error('contention authority absent');
                  expect(
                    (
                      await acquireReceiverAuthority(
                        receiver,
                        'competitor-' + String(posts),
                        current.authority.generation,
                      )
                    ).reply.kind,
                  ).toBe('success');
                }
                const answer = await receiver.client.acquireAuthority(input);
                if (posts === 3 && lostThird) {
                  expect(answer.reply.kind).toBe('success');
                  return {
                    reply: {
                      kind: 'failure' as const,
                      failure: { code: 'transport' as const, cause: transportFailure },
                    },
                    response: null,
                  };
                }
                if (posts > 3) throw new Error('fourth POST observed');
                return answer;
              },
            };
            let exhaustion: unknown;
            try {
              await dispatchRecovery(
                stores.runs,
                stores.artifacts,
                client,
                setup.call,
                new AbortController().signal,
              );
            } catch (cause) {
              exhaustion = cause;
            }
            expect(
              receiver.requests
                .filter(
                  (entry) =>
                    entry.operationId === 'acquireRuntimeAuthority' &&
                    entry.commandId?.startsWith('recover-claim:fence:'),
                )
                .map((entry) => entry.commandId),
            ).toEqual(['recover-claim:fence:1', 'recover-claim:fence:2', 'recover-claim:fence:3']);
            expect(posts).toBe(3);
            expect(exhaustion).toMatchObject({
              code: 'exhausted',
              recoveryId: setup.call.recoveryId,
              ...(lostThird ? { cause: transportFailure } : {}),
            });
            const snapshot = await stores.runs.readRuntimeScope(receiver.scope);
            if (snapshot.version !== 2 || snapshot.kind !== 'pinned')
              throw new Error('scope missing');
            const journal = snapshot.recoveries[0];
            expect(
              journal.fences.map(
                (fence) => readRuntimeRequest(fence.canonicalRequest).operation.commandId,
              ),
            ).toEqual(['recover-claim:fence:1', 'recover-claim:fence:2', 'recover-claim:fence:3']);
            expect(journal.closure).toBeNull();
            expect(snapshot.activeRecoveryId).toBe(setup.call.recoveryId);
            expect(await stores.runs.readRun(setup.run.runId)).toMatchObject({
              capacity: { reserved: 1 },
              attempts: [{ holdsCapacity: true, state: { kind: 'claiming' } }],
            });
            expect(trace.slice(0, 7)).toEqual([
              'state',
              'post:1',
              'state',
              'lookup:recover-claim:fence:1',
              'post:2',
              'state',
              'lookup:recover-claim:fence:2',
            ]);
            const resume = {
              ...setup.call,
              guard: { ...setup.call.guard, expectedRecoveryRevision: journal.revision },
            };
            const before = receiver.requests.length;
            if (lostThird) {
              expect(
                await dispatchRecovery(
                  stores.runs,
                  stores.artifacts,
                  receiver.client,
                  resume,
                  new AbortController().signal,
                ),
              ).toMatchObject({ kind: 'resolved' });
              expect(
                receiver.requests
                  .slice(before)
                  .filter((entry) => entry.operationId === 'acquireRuntimeAuthority')
                  .map((entry) => entry.commandId),
              ).toEqual(['recover-claim:fence:3']);
            } else
              await rejects(
                dispatchRecovery(
                  stores.runs,
                  stores.artifacts,
                  receiver.client,
                  resume,
                  new AbortController().signal,
                ),
                (cause: unknown) => {
                  expect(cause).toMatchObject({ code: 'exhausted' });
                  return true;
                },
              );
            expect(await stores.runs.readRuntimeScope(receiver.scope)).toMatchObject({
              recoveries: [{ fences: journal.fences }],
            });
          } finally {
            await closeRecoveryResources([receiver, stores]);
          }
        },
      );

    test('discovery failures retain recovery identity and cause without inventing original intent', async () => {
      const stores = await create();
      const receiver = await createRecoveryReceiver();
      try {
        const { call } = await beginAuthority(stores, receiver, null);
        const failure = new Error('scope storage unreadable');
        await rejects(
          dispatchRecovery(
            {
              ...stores.runs,
              readRuntimeScope: () => {
                throw failure;
              },
            },
            stores.artifacts,
            receiver.client,
            call,
            new AbortController().signal,
          ),
          (cause: unknown) => {
            expect(cause).toMatchObject({
              message: expect.stringContaining(call.recoveryId) as unknown,
              cause: failure,
            });
            return true;
          },
        );
        await rejects(
          dispatchRecovery(
            stores.runs,
            stores.artifacts,
            receiver.client,
            { ...call, recoveryId: 'missing-journal' },
            new AbortController().signal,
          ),
          (cause: unknown) => {
            expect(cause).toMatchObject({
              message: expect.stringContaining('missing-journal') as unknown,
            });
            return true;
          },
        );
        expect(
          receiver.requests.filter((entry) => entry.operationId === 'acquireRuntimeAuthority'),
        ).toEqual([]);
      } finally {
        await closeRecoveryResources([receiver, stores]);
      }
    });
    test('safe uncertainty evidence during original lookup refuses captured run and attempt revisions', async () => {
      const stores = await create();
      const receiver = await createRecoveryReceiver();
      try {
        const setup = await beginClaim(stores, receiver);
        const pending = await dispatchRecovery(
          stores.runs,
          stores.artifacts,
          {
            ...receiver.client,
            async lookupReceipt(input) {
              const {
                scope: _scope,
                expectedScopeRevision: _revision,
                ...guard
              } = await setup.guard();
              unwrapReply(
                await stores.runs.recordExecution(
                  guard,
                  createExecutionCommand(
                    { kind: 'recovery_required', reason: 'claim remains uncertain' },
                    'uncertain',
                  ),
                ),
              );
              return receiver.client.lookupReceipt(input);
            },
          },
          setup.call,
          new AbortController().signal,
        );
        expect(pending).toEqual({ kind: 'refused', reason: 'revision_conflict' });
        const current = await stores.runs.readRuntimeScope(receiver.scope);
        if (current.kind !== 'pinned' || current.version !== 2) throw new Error('scope missing');
        expect(current).toMatchObject({
          activeRecoveryId: setup.call.recoveryId,
          recoveries: [{ closure: null }],
        });
        expect((await stores.runs.readRun(setup.run.runId)).capacity.reserved).toBe(1);
        expect(
          await dispatchRecovery(
            stores.runs,
            stores.artifacts,
            receiver.client,
            {
              ...setup.call,
              guard: {
                ...(await setup.guard()),
                expectedRecoveryRevision: current.recoveries[0].revision,
              },
            },
            new AbortController().signal,
          ),
        ).toMatchObject({ kind: 'resolved' });
      } finally {
        await closeRecoveryResources([receiver, stores]);
      }
    });

    test('captured fence body retains exact actual response bytes', async () => {
      const stores = await create();
      const receiver = await createRecoveryReceiver();
      try {
        const { call } = await beginAuthority(stores, receiver, null);
        let bytes: Uint8Array | undefined;
        const closed = await dispatchRecovery(
          stores.runs,
          stores.artifacts,
          {
            ...receiver.client,
            async acquireAuthority(input) {
              const actual = await receiver.client.acquireAuthority(input);
              if (actual.response === null) throw new Error('actual fence response missing');
              bytes = new Uint8Array(actual.response.bytes);
              return actual;
            },
          },
          call,
          new AbortController().signal,
        );
        if (closed.kind !== 'resolved' || bytes === undefined)
          throw new Error('actual closure missing');
        expect(
          await stores.artifacts.readArtifact(closed.closure.fence.observation.reply.body.artifact),
        ).toEqual(bytes);
        expect(closed.closure.fence.observation.reply.body.value.actorId).toBe(receiver.actorId);
      } finally {
        await closeRecoveryResources([receiver, stores]);
      }
    });

    test('retained journal snapshot cannot alias a provider reply through artifact await', async () => {
      const stores = await create();
      const receiver = await createRecoveryReceiver();
      try {
        const setup = await beginClaim(stores, receiver);
        let retained: Awaited<ReturnType<typeof stores.runs.readRuntimeScope>> | undefined;
        const reply = await dispatchRecovery(
          {
            ...stores.runs,
            async readRuntimeScope(scope) {
              retained = await stores.runs.readRuntimeScope(scope);
              return retained;
            },
          },
          {
            ...stores.artifacts,
            async readArtifact(reference) {
              if (retained?.version === 2)
                Object.assign(retained.recoveries[0].intent.target.original, {
                  commandId: 'changed',
                });
              return stores.artifacts.readArtifact(reference);
            },
          },
          receiver.client,
          setup.call,
          new AbortController().signal,
        );
        expect(reply).toMatchObject({
          kind: 'resolved',
          closure: { original: { commandId: 'claim-original' } },
        });
      } finally {
        await closeRecoveryResources([receiver, stores]);
      }
    });
    test('state dependency overflow throws before staging or POST', async () => {
      const stores = await create();
      const receiver = await createRecoveryReceiver();
      try {
        const { call } = await beginAuthority(stores, receiver, null);
        const overflow = createRuntimeClient(async () => {
          const state = await readReceiverState(receiver);
          return new Response(
            JSON.stringify({
              ...state,
              authority: {
                kind: 'held',
                ownerId: 'overflow-source',
                generation: Number.MAX_SAFE_INTEGER,
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        });
        await rejects(
          dispatchRecovery(
            stores.runs,
            stores.artifacts,
            overflow,
            call,
            new AbortController().signal,
          ),
          (cause: unknown) => {
            expect(cause).toMatchObject({ code: 'unexpected' });
            return true;
          },
        );
        expect(await stores.runs.readRuntimeScope(receiver.scope)).toMatchObject({
          recoveries: [{ fences: [] }],
        });
        expect(
          receiver.requests.filter((entry) => entry.operationId === 'acquireRuntimeAuthority'),
        ).toEqual([]);
      } finally {
        await closeRecoveryResources([receiver, stores]);
      }
    });

    test('stale pre-fence404 context is rejected as association, not authenticated chronology', async () => {
      const stores = await create();
      const receiver = await createRecoveryReceiver();
      try {
        const { call } = await beginAuthority(stores, receiver, null);
        const earlier = await receiver.client.lookupReceipt({
          params: { id: receiver.scope.projectId, commandId: 'original' },
          query: { personId: receiver.scope.personId, expectedLedgerId: receiver.ledgerId },
        });
        expect(earlier.reply).toMatchObject({
          kind: 'refusal',
          body: { error: 'runtime_receipt_not_found' },
        });
        const body = await retainActual(stores, earlier);
        const closed = await dispatchRecovery(
          {
            ...stores.runs,
            async resolveRecovery(input) {
              if (input.decision.kind !== 'fenced_nonaccepted')
                throw new Error('fixture expected absent original');
              const envelope = input.decision.lookup.envelope.value;
              if (envelope.context.kind !== 'original_lookup') throw new Error('context missing');
              const changed = {
                ...envelope,
                body,
                context: { ...envelope.context, observationRevision: 1 },
              };
              const retained = await stores.artifacts.retainArtifact(
                new TextEncoder().encode(JSON.stringify(changed)),
                'application/json',
              );
              if (retained.kind !== 'retained') throw new Error('retention refused');
              const verified = await readRecoveryExchange(stores.artifacts, retained.reference, {
                kind: 'absent',
              });
              if (verified.kind !== 'absent') throw new Error('absence missing');
              return stores.runs.resolveRecovery({
                ...input,
                decision: { kind: 'fenced_nonaccepted', lookup: verified.exchange },
              });
            },
          },
          stores.artifacts,
          receiver.client,
          call,
          new AbortController().signal,
        );
        expect(closed).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        expect(await stores.runs.readRuntimeScope(receiver.scope)).toMatchObject({
          activeRecoveryId: call.recoveryId,
          recoveries: [{ closure: null }],
        });
      } finally {
        await closeRecoveryResources([receiver, stores]);
      }
    });

    test('unexpected error correlation is detached and recursively frozen', async () => {
      const stores = await create();
      const receiver = await createRecoveryReceiver();
      try {
        const { call, original } = await beginAuthority(stores, receiver, null);
        const failure = new Error('actual sender failure');
        let staged: RecoveryFence | undefined;
        await rejects(
          dispatchRecovery(
            {
              ...stores.runs,
              async stageRecoveryFence(input) {
                const ack = await stores.runs.stageRecoveryFence(input);
                if (ack.kind !== 'refused') staged = ack.value;
                return ack;
              },
            },
            stores.artifacts,
            {
              ...receiver.client,
              acquireAuthority: () => {
                throw failure;
              },
            },
            call,
            new AbortController().signal,
          ),
          (cause: unknown) => {
            expect(cause).toBeInstanceOf(RecoveryDispatchError);
            if (
              !(cause instanceof RecoveryDispatchError) ||
              cause.fence === null ||
              staged === undefined
            )
              throw new Error('missing correlation');
            expect(cause.cause).toBe(failure);
            expect(cause.original).toEqual(original);
            expect(cause.fence).toEqual(staged);
            const direct = new RecoveryDispatchError(
              call.recoveryId,
              original,
              staged,
              'unexpected',
              failure,
            );
            expect(Object.isFrozen(original.localOwner)).toBe(false);
            expect(Object.isFrozen(staged.owner)).toBe(false);
            expect(Object.isFrozen(direct.original.localOwner)).toBe(true);
            expect(Object.isFrozen(cause)).toBe(true);
            expect(Object.isFrozen(cause.original.localOwner)).toBe(true);
            expect(Object.isFrozen(cause.fence.basis.state.envelope.value.context)).toBe(true);
            Object.assign(staged.owner, { epoch: 999 });
            Object.assign(original.localOwner, { epoch: 999 });
            expect(cause.original.localOwner.epoch).toBe(1);
            expect(cause.fence.owner.epoch).toBe(1);
            return true;
          },
        );
      } finally {
        await closeRecoveryResources([receiver, stores]);
      }
    });

    for (const fault of ['clone', 'arrayBuffer'] as const)
      test('inherited RuntimeClient capture fault remains precise transport ' + fault, async () => {
        const stores = await create();
        const receiver = await createRecoveryReceiver();
        // eslint-disable-next-line @typescript-eslint/unbound-method -- Native receiver is supplied with call and the exact method is restored in finally.
        const clone = Response.prototype.clone;
        const failure = new Error('injected client capture ' + fault);
        try {
          const { call } = await beginAuthority(stores, receiver, null);
          Response.prototype.clone = function () {
            if (fault === 'clone') throw failure;
            const copied = clone.call(this);
            copied.arrayBuffer = () => Promise.reject(failure);
            return copied;
          };
          expect(
            await dispatchRecovery(
              stores.runs,
              stores.artifacts,
              receiver.client,
              call,
              new AbortController().signal,
            ),
          ).toMatchObject({
            kind: 'pending',
            reason: 'transport',
            observation: { kind: 'failure', failure: { code: 'transport', cause: failure } },
          });
          expect(await stores.runs.readRuntimeScope(receiver.scope)).toMatchObject({
            activeRecoveryId: call.recoveryId,
            recoveries: [{ fences: [], observations: [], closure: null }],
          });
        } finally {
          Response.prototype.clone = clone;
          await closeRecoveryResources([receiver, stores]);
        }
      });

    for (const fault of [
      'body-retain',
      'envelope-retain',
      'read',
      'unavailable',
      'wrong-digest',
    ] as const)
      test('helper capture dependency failures throw correlated errors ' + fault, async () => {
        const stores = await create();
        const receiver = await createRecoveryReceiver();
        try {
          const { call } = await beginAuthority(stores, receiver, null);
          const failure = new Error('helper capture dependency ' + fault);
          let retained = 0;
          const artifacts = {
            ...stores.artifacts,
            retainArtifact(bytes: Uint8Array, mediaType: string) {
              retained += 1;
              if (
                (fault === 'body-retain' && retained === 1) ||
                (fault === 'envelope-retain' && retained === 2)
              )
                throw failure;
              return stores.artifacts.retainArtifact(bytes, mediaType);
            },
            readArtifact(reference: Parameters<typeof stores.artifacts.readArtifact>[0]) {
              if (fault === 'read' || fault === 'unavailable') throw failure;
              if (fault === 'wrong-digest') return Promise.resolve(new TextEncoder().encode('{}'));
              return stores.artifacts.readArtifact(reference);
            },
          };
          await rejects(
            dispatchRecovery(
              stores.runs,
              artifacts,
              receiver.client,
              call,
              new AbortController().signal,
            ),
            (cause: unknown) => {
              expect(cause).toMatchObject({
                code: 'unexpected',
                recoveryId: call.recoveryId,
                ...(fault === 'wrong-digest' ? {} : { cause: failure }),
              });
              return true;
            },
          );
          expect(
            receiver.requests.filter((entry) => entry.operationId === 'acquireRuntimeAuthority'),
          ).toEqual([]);
          expect(await stores.runs.readRuntimeScope(receiver.scope)).toMatchObject({
            activeRecoveryId: call.recoveryId,
            recoveries: [{ fences: [], observations: [], closure: null }],
          });
        } finally {
          await closeRecoveryResources([receiver, stores]);
        }
      });

    test('closed journal still independently verifies retained scope artifacts', async () => {
      const stores = await create();
      const receiver = await createRecoveryReceiver();
      try {
        const { call } = await beginAuthority(stores, receiver, null);
        expect(
          await dispatchRecovery(
            stores.runs,
            stores.artifacts,
            receiver.client,
            call,
            new AbortController().signal,
          ),
        ).toMatchObject({ kind: 'resolved' });
        const failure = new Error('closed evidence unavailable');
        await rejects(
          dispatchRecovery(
            stores.runs,
            {
              ...stores.artifacts,
              readArtifact: () => {
                throw failure;
              },
            },
            receiver.client,
            call,
            new AbortController().signal,
          ),
          (cause: unknown) => {
            expect(cause).toMatchObject({ code: 'unexpected', cause: failure });
            return true;
          },
        );
      } finally {
        await closeRecoveryResources([receiver, stores]);
      }
    });
    test('late original acceptance wins the first CAS and is dominated by the second recovery fence', async () => {
      const stores = await create();
      const receiver = await createRecoveryReceiver();
      try {
        expect((await acquireReceiverAuthority(receiver, 'first', null)).reply.kind).toBe(
          'success',
        );
        expect((await acquireReceiverAuthority(receiver, 'advance', 1)).reply.kind).toBe('success');
        const { call } = await beginAuthority(stores, receiver, 2);
        const gate = receiver.pause('original');
        const delayed = receiver.client.acquireAuthority({
          params: { id: receiver.scope.projectId },
          body: {
            schemaVersion: 1,
            commandId: 'original',
            expectedLedgerId: receiver.ledgerId,
            personId: receiver.scope.personId,
            expectedGeneration: 2,
            ownerId: 'original-owner',
          },
        });
        await waitForReceiver(gate.entered);
        let first = true;
        try {
          const closed = await dispatchRecovery(
            stores.runs,
            stores.artifacts,
            {
              ...receiver.client,
              async acquireAuthority(input) {
                if (first) {
                  first = false;
                  gate.release();
                  expect((await delayed).reply).toMatchObject({
                    kind: 'success',
                    body: { acceptance: { authority: { generation: 3 } } },
                  });
                }
                return receiver.client.acquireAuthority(input);
              },
            },
            call,
            new AbortController().signal,
          );
          expect(closed).toMatchObject({
            kind: 'resolved',
            closure: {
              decision: { kind: 'accepted' },
              fence: {
                fence: { ordinal: 2 },
                observation: {
                  reply: { body: { value: { acceptance: { authority: { generation: 4 } } } } },
                },
              },
            },
          });
          expect((await readReceiverState(receiver)).authority).toMatchObject({ generation: 4 });
        } finally {
          gate.release();
          await delayed;
        }
      } finally {
        await closeRecoveryResources([receiver, stores]);
      }
    });

    for (const kind of ['authority', 'claim'] as const)
      test('ordinary duplicates stay lookup-only during active real recovery ' + kind, async () => {
        const stores = await create();
        const receiver = await createRecoveryReceiver();
        try {
          if (kind === 'authority') {
            const { call, original } = await beginAuthority(stores, receiver, null);
            const before = receiver.requests.length;
            const { expectedRecoveryRevision: _revision, ...guard } = call.guard;
            expect(
              await dispatchAuthority(
                stores.runs,
                stores.artifacts,
                receiver.client,
                guard,
                original.canonicalRequest,
                new AbortController().signal,
              ),
            ).toMatchObject({ kind: 'pending' });
            expect(receiver.requests.slice(before).map((entry) => entry.operationId)).toEqual([
              'lookupRuntimeReceipt',
            ]);
          } else {
            const setup = await beginClaim(stores, receiver);
            const before = receiver.requests.length;
            expect(
              await claimActivity(
                stores.runs,
                stores.artifacts,
                receiver.client,
                await setup.guard(),
                {
                  commandId: executionCommandId('stage-claim'),
                  acceptanceCommandId: executionCommandId('accept-claim'),
                  canonicalRequest: setup.stage.intent.canonicalRequest,
                  stateEvidence: setup.evidence,
                },
                new AbortController().signal,
              ),
            ).toMatchObject({ kind: 'pending' });
            expect(receiver.requests.slice(before).map((entry) => entry.operationId)).toEqual([
              'lookupRuntimeReceipt',
            ]);
          }
        } finally {
          await closeRecoveryResources([receiver, stores]);
        }
      });
  });
}

import {
  acceptWorkflowBinding,
  canonicalJson,
  checkWorkflowBinding,
  decodeWorkflowBinding,
  selectWorkflowActivity,
} from '@twilight-burokrat/contracts';

import type { RuntimeExchange } from '../../bridge/runtime-client';
import { stageClaimRequest } from '../claim-history';
import { decodeAdmission, executionCommandId, projectId, workItemId } from '../record-codecs';
import { recordPreparation } from '../record-preparation';
import type { ScopedAttemptGuard } from '../records';
import { createExecutionCommand, createManifest, createRun } from './fixtures';

async function retainActual(stores: OutcomeFixture, exchange: RuntimeExchange<unknown>) {
  if (exchange.response === null) throw new Error('fixture response absent');
  const retained = await stores.artifacts.retainArtifact(
    exchange.response.bytes,
    'application/json',
  );
  if (retained.kind !== 'retained') throw new Error('fixture response retention refused');
  return retained.reference;
}

async function beginClaim(stores: OutcomeFixture, receiver: RecoveryReceiverFixture) {
  const ownership = unwrapReply(
    await stores.runs.acquireOwnership(ownerId('resolver'), stores.ownership.epoch),
  );
  const scope = receiver.scope;
  const prompt = new TextEncoder().encode('Prepare the selected activity.');
  const promptArtifact = await stores.artifacts.retainArtifact(prompt, 'text/plain');
  if (promptArtifact.kind !== 'retained') throw new Error('fixture prompt refused');
  const binding = acceptWorkflowBinding(
    checkWorkflowBinding(
      decodeWorkflowBinding({
        version: 1,
        types: { default: { plan: { class: 'planner' } } },
        classes: { planner: { executor: 'human', prompt: 'plan.md' } },
      }),
      ['plan'],
    ),
    [{ path: 'plan.md', bytes: prompt }],
  );
  const manifest = createManifest({
    canonicalBinding: canonicalJson(binding.snapshot),
    prompts: [promptArtifact.reference],
    executorVersions: { human: 'human-1' },
  });
  unwrapReply(await stores.runs.retainManifest(ownership, manifest));
  const run = unwrapReply(
    await stores.runs.createRun(
      ownership,
      createRun({
        projectId: projectId(scope.projectId),
        workItemId: workItemId(receiver.workItemId),
        manifestDigest: manifest.digest,
      }),
    ),
  );
  const admission = decodeAdmission({
    attemptId: 'attempt',
    identity: {
      version: 1,
      runId: run.runId,
      occurrenceId: 'occurrence',
      operationKey: 'operation',
    },
    ordinal: 1,
  });
  unwrapReply(
    await stores.runs.admitAttempt({ ownership, runId: run.runId, expectedRevision: 0 }, admission),
  );
  unwrapReply(
    await stores.runs.pinRuntimeScope(ownership, {
      version: 1,
      scope,
      ledgerId: receiver.ledgerId,
    }),
  );
  const authority = unwrapReply(
    await stores.runs.stageRuntimeRequest(
      { ownership, scope, expectedRevision: 0 },
      canonicalRuntimeRequest(scope, {
        schemaVersion: 1,
        kind: 'authority',
        commandId: 'grant',
        expectedLedgerId: receiver.ledgerId,
        ownerId: 'receiver-owner',
        expectedGeneration: null,
      }),
    ),
  );
  const granted = await acquireReceiverAuthority(receiver, 'grant', null);
  if (granted.reply.kind !== 'success') throw new Error('fixture grant refused');
  unwrapReply(
    await acceptRuntimeReceipt(
      stores.runs,
      stores.artifacts,
      { ownership, scope, expectedRevision: 1 },
      authority,
      await retainActual(stores, granted),
    ),
  );
  const state = await receiver.client.readState({
    params: { id: scope.projectId },
    query: { personId: scope.personId, expectedLedgerId: receiver.ledgerId },
  });
  if (state.reply.kind !== 'success') throw new Error('fixture state refused');
  const evidence = await retainActual(stores, state);
  const preparation = {
    version: 1 as const,
    identity: admission.identity,
    attemptId: admission.attemptId,
    creationKey: 'creation',
  };
  const selected = selectWorkflowActivity(binding, 'feature', 'plan');
  const locator = {
    version: 1 as const,
    executor: 'human' as const,
    executorVersion: 'human-1',
    preparation,
    selection: {
      bindingDigest: selected.bindingDigest,
      requestedType: selected.requestedType,
      matchedType: selected.matchedType,
      stepCode: selected.stepCode,
      className: selected.className,
    },
    session: {
      version: 1 as const,
      workerId: 'worker',
      sessionId: 'session',
      operationKey: admission.identity.operationKey,
    },
  };
  async function guard(): Promise<ScopedAttemptGuard> {
    const current = await stores.runs.readRun(run.runId);
    const attempt = current.attempts.find(
      (candidate) => candidate.attemptId === admission.attemptId,
    );
    const runtime = await stores.runs.readRuntimeScope(scope);
    if (attempt === undefined || runtime.kind !== 'pinned') throw new Error('fixture guard absent');
    return {
      ownership,
      scope,
      runId: run.runId,
      attemptId: attempt.attemptId,
      expectedRevision: current.run.revision,
      expectedAttemptRevision: attempt.revision,
      expectedScopeRevision: runtime.revision,
    };
  }
  const { scope: _scope, expectedScopeRevision: _scopeRevision, ...attemptGuard } = await guard();
  unwrapReply(
    await recordPreparation(stores.runs, stores.artifacts, attemptGuard, {
      commandId: executionCommandId('prepare'),
      preparation,
      requestedType: 'feature',
      stepCode: 'plan',
      stepId: receiver.stepId,
      scope,
      parentClaimId: null,
      stateEvidence: evidence,
      executor: { kind: 'human', version: 'human-1' },
    }),
  );
  const {
    scope: _secondScope,
    expectedScopeRevision: _secondRevision,
    ...preparedGuard
  } = await guard();
  unwrapReply(
    await stores.runs.recordExecution(
      preparedGuard,
      createExecutionCommand(
        {
          kind: 'session_prepared',
          locator,
          owner: { ownerId: ownership.ownerId, epoch: ownership.epoch },
        },
        'opened',
      ),
    ),
  );
  const request = {
    schemaVersion: 1 as const,
    commandId: 'claim-original',
    expectedLedgerId: receiver.ledgerId,
    authority: granted.reply.body.acceptance.authority,
    expectedBasis: state.reply.body.basis,
    action: {
      kind: 'claim' as const,
      workItemId: receiver.workItemId,
      stepId: receiver.stepId,
      parentClaimId: null,
      execution: {
        storeId: ownership.storeId,
        runId: run.runId,
        attemptId: admission.attemptId,
        sessionId: locator.session.sessionId,
      },
    },
  };
  const stage = unwrapReply(
    await stageClaimRequest(stores.runs, stores.artifacts, await guard(), {
      commandId: executionCommandId('stage-claim'),
      canonicalRequest: canonicalRuntimeRequest(scope, request),
      stateEvidence: evidence,
    }),
  );
  const call = {
    kind: 'claim' as const,
    guard: { ...(await guard()), expectedRecoveryRevision: 0 },
    recoveryId: 'recover-claim',
  };
  unwrapReply(
    await stores.runs.beginRecovery({
      kind: 'claim',
      guard: call.guard,
      intent: {
        version: 1,
        recoveryId: call.recoveryId,
        target: {
          kind: 'claim',
          original: stage.intent,
          runId: run.runId,
          attemptId: admission.attemptId,
          stageCommandId: 'stage-claim',
          acceptanceCommandId: 'accept-claim',
        },
        begunScopeRevision: stage.intent.stagedRevision,
        resolver: { ownerId: ownership.ownerId, epoch: ownership.epoch },
      },
    }),
  );
  return { call, request, stage, guard, run, admission, evidence };
}
