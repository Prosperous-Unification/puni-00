import { parseOrThrow } from '@shared/validation';
import { describe, expect, test } from 'bun:test';

import { ExecutorLocatorCodec } from '../../agents/execution-codecs';
import type { TurnReply } from '../../agents/execution-records';
import { acceptClaimReceipt, stageClaimRequest } from '../claim-history';
import { attemptId, operationKey, ownerId, runId } from '../record-codecs';
import { executionCommandId } from '../record-codecs';
import { recordPreparation } from '../record-preparation';
import type { OutcomeFixture } from './fixtures';
import { createExecutionCommand, prepareSession, prepareTurn } from './fixtures';
import { admitExecution, retainClaimReceipt, unwrapReply } from './fixtures';
import { prepareAttempt } from './fixtures';

export function executionHistoryContract(
  name: string,
  create: () => Promise<OutcomeFixture>,
): void {
  describe(name, () => {
    claimGuardContract(create);
    reviewGuardContract(create);
    preparationGuardContract(create);
    coupledProviderContract(create);
    coupledDecoderContract(create);
    test('complete prepared claim and turn history advances exact revisions and refuses missing predecessors', async () => {
      const stores = await create();
      try {
        const setup = await admitExecution(stores);
        const owner = { ownerId: setup.ownership.ownerId, epoch: setup.ownership.epoch };
        const opened = {
          version: 2 as const,
          kind: 'execution' as const,
          commandId: executionCommandId('opened'),
          fact: { kind: 'session_prepared' as const, locator: setup.locator, owner },
        };
        expect(await stores.runs.recordExecution(await setup.currentGuard(), opened)).toEqual({
          kind: 'refused',
          reason: 'state_conflict',
        });
        const preparedIntent = unwrapReply(
          await recordPreparation(
            stores.runs,
            stores.artifacts,
            await setup.currentGuard(),
            setup.preparationInput,
          ),
        );
        expect(preparedIntent).toMatchObject({ revision: 1, state: { kind: 'preparing' } });
        const prepared = unwrapReply(
          await stores.runs.recordExecution(await setup.currentGuard(), opened),
        );
        expect(prepared).toMatchObject({ revision: 2, state: { kind: 'prepared' } });
        const staged = unwrapReply(
          await stageClaimRequest(stores.runs, stores.artifacts, await setup.scopedGuard(), {
            commandId: executionCommandId('stage-claim'),
            canonicalRequest: setup.canonicalRequest,
            stateEvidence: setup.preparationInput.stateEvidence,
          }),
        );
        expect(staged.attempt).toMatchObject({ revision: 3, state: { kind: 'claiming' } });
        const evidence = await retainClaimReceipt(stores, staged.intent);
        const accepted = unwrapReply(
          await acceptClaimReceipt(stores.runs, stores.artifacts, await setup.scopedGuard(), {
            commandId: executionCommandId('accept-claim'),
            intent: staged.intent,
            evidence,
          }),
        );
        expect(accepted.attempt).toMatchObject({
          revision: 4,
          state: { kind: 'ready', cause: { kind: 'initial' } },
        });
        const turn = unwrapReply(
          await stores.runs.stageTurn(await setup.scopedGuard(), {
            version: 2,
            kind: 'stage_turn',
            commandId: executionCommandId('stage-turn'),
            request: {
              version: 1,
              turnKey: 'turn',
              owner,
              cause: { kind: 'initial' },
              input: 'work',
            },
          }),
        );
        expect(turn.attempt).toMatchObject({ revision: 5, state: { kind: 'turn_pending' } });
        const returned = unwrapReply(
          await stores.runs.recordExecution(await setup.currentGuard(), {
            version: 2,
            kind: 'execution',
            commandId: executionCommandId('observe-turn'),
            fact: {
              kind: 'turn_observed',
              reply: {
                kind: 'completed',
                identity: { locator: setup.locator, turnKey: 'turn', owner },
                outcome: {
                  text: '',
                  usage: { kind: 'measured', inputTokens: 0, outputTokens: 0 },
                  finish: 'end_turn',
                },
              },
            },
          }),
        );
        expect(returned).toMatchObject({
          revision: 6,
          state: { kind: 'turn_returned' },
          holdsCapacity: true,
        });
        const history = await stores.runs.readExecutionHistory(
          setup.run.runId,
          setup.attempt.attemptId,
        );
        expect(history.executions.map((entry) => entry.reply.attempt.revision)).toEqual([
          1, 2, 3, 4, 5, 6,
        ]);
        expect(history.executions.map((entry) => entry.context)).toEqual([
          null,
          null,
          { version: 1, scopeRevision: 2 },
          { version: 1, scopeRevision: 3 },
          { version: 1, scopeRevision: 4 },
          null,
        ]);
        expect((await stores.runs.readRun(setup.run.runId)).run.revision).toBe(7);
      } finally {
        stores.close();
      }
    });
    test('admission starts one version2 queued checkpoint at revision zero', async () => {
      const stores = await create();
      try {
        const setup = await prepareAttempt(stores);
        const snapshot = await stores.runs.readRun(setup.run.runId);
        expect(snapshot.attempts[0]).toMatchObject({
          version: 2,
          revision: 0,
          state: { kind: 'queued' },
          holdsCapacity: true,
        });
        expect(snapshot.attempts[0]?.state).toEqual({ kind: 'queued' });
        expect(snapshot.version).toBe(2);
        expect(snapshot.run.revision).toBe(1);
      } finally {
        stores.close();
      }
    });

    test('valid complete locator must match retained preparation from the actual preparing predecessor', async () => {
      const stores = await create();
      try {
        const setup = await admitExecution(stores);
        unwrapReply(
          await recordPreparation(
            stores.runs,
            stores.artifacts,
            await setup.currentGuard(),
            setup.preparationInput,
          ),
        );
        const before = await stores.runs.readExecutionHistory(
          setup.run.runId,
          setup.admission.attemptId,
        );
        const locator = setup.locator;
        const candidates = [
          {
            ...locator,
            preparation: {
              ...locator.preparation,
              identity: {
                ...locator.preparation.identity,
                operationKey: operationKey('coherently-other'),
              },
            },
            session: { ...locator.session, operationKey: operationKey('coherently-other') },
          },
          {
            ...locator,
            preparation: {
              ...locator.preparation,
              identity: { ...locator.preparation.identity, runId: runId('other') },
            },
          },
          { ...locator, preparation: { ...locator.preparation, attemptId: attemptId('other') } },
          { ...locator, preparation: { ...locator.preparation, creationKey: 'other' } },
          { ...locator, selection: { ...locator.selection, requestedType: 'other' } },
          { ...locator, selection: { ...locator.selection, bindingDigest: 'a'.repeat(64) } },
          { ...locator, executorVersion: 'other' },
          { ...locator, executor: 'tool' },
        ];
        for (const candidate of candidates) {
          const checked = parseOrThrow(ExecutorLocatorCodec, candidate);
          expect(
            await stores.runs.recordExecution(
              await setup.currentGuard(),
              createExecutionCommand({
                kind: 'session_prepared',
                locator: checked,
                owner: { ownerId: setup.ownership.ownerId, epoch: setup.ownership.epoch },
              }),
            ),
          ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
          expect(
            await stores.runs.readExecutionHistory(setup.run.runId, setup.admission.attemptId),
          ).toEqual(before);
        }
        expect(
          await stores.runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand({
              kind: 'session_prepared',
              locator,
              owner: { ownerId: ownerId('other'), epoch: setup.ownership.epoch },
            }),
          ),
        ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        expect((await stores.runs.readRun(setup.run.runId)).capacity.reserved).toBe(1);
      } finally {
        stores.close();
      }
    });

    for (const wrapper of ['direct', 'reconciling', 'unresolved'] as const)
      for (const late of [false, true])
        test(
          'opened observation resolves ' +
            wrapper +
            ' preparing with original owner late=' +
            String(late),
          async () => {
            const stores = await create();
            try {
              const setup = await admitExecution(stores);
              unwrapReply(
                await recordPreparation(
                  stores.runs,
                  stores.artifacts,
                  await setup.currentGuard(),
                  setup.preparationInput,
                ),
              );
              if (wrapper !== 'direct')
                unwrapReply(
                  await stores.runs.recordExecution(
                    await setup.currentGuard(),
                    createExecutionCommand(
                      wrapper === 'reconciling'
                        ? { kind: 'recovery_required', reason: 'opening uncertain' }
                        : {
                            kind: 'unresolved',
                            reason: 'opening uncertain',
                            evidence: setup.preparationInput.stateEvidence,
                          },
                    ),
                  ),
                );
              const originalOwner = {
                ownerId: setup.ownership.ownerId,
                epoch: setup.ownership.epoch,
              };
              let ownership = setup.ownership;
              if (late) {
                stores.clock.advance(101);
                ownership = unwrapReply(
                  await stores.runs.acquireOwnership(ownerId('replacement'), ownership.epoch),
                );
              }
              const command = createExecutionCommand(
                { kind: 'session_prepared', locator: setup.locator, owner: originalOwner },
                'late-opened',
              );
              const guard = { ...(await setup.currentGuard()), ownership };
              const prepared = unwrapReply(await stores.runs.recordExecution(guard, command));
              expect(prepared.state).toMatchObject({
                kind: 'prepared',
                session: {
                  locator: setup.locator,
                  attachment: { version: 1, kind: 'opened', owner: originalOwner },
                },
              });
              expect(prepared.holdsCapacity).toBe(true);
              expect(await stores.runs.recordExecution(guard, command)).toEqual({
                kind: 'duplicate',
                value: prepared,
              });
              if (late)
                expect(
                  await stores.runs.recordExecution(
                    { ...guard, ownership: setup.ownership },
                    command,
                  ),
                ).toEqual({ kind: 'refused', reason: 'owner_stale' });
            } finally {
              stores.close();
            }
          },
        );

    for (const wrapper of ['direct', 'reconciling', 'unresolved'] as const)
      for (const late of [false, true])
        test(
          'exact claim acceptance resolves ' +
            wrapper +
            ' claiming without reattaching late=' +
            String(late),
          async () => {
            const stores = await create();
            try {
              const setup = await prepareSession(stores);
              const staged = unwrapReply(
                await stageClaimRequest(stores.runs, stores.artifacts, await setup.scopedGuard(), {
                  commandId: executionCommandId('stage-claim'),
                  canonicalRequest: setup.canonicalRequest,
                  stateEvidence: setup.preparationInput.stateEvidence,
                }),
              );
              if (wrapper !== 'direct')
                unwrapReply(
                  await stores.runs.recordExecution(
                    await setup.currentGuard(),
                    createExecutionCommand(
                      wrapper === 'reconciling'
                        ? { kind: 'recovery_required', reason: 'claim uncertain' }
                        : {
                            kind: 'unresolved',
                            reason: 'claim uncertain',
                            evidence: setup.preparationInput.stateEvidence,
                          },
                    ),
                  ),
                );
              const beforeScope = await stores.runs.readRuntimeScope(setup.scope);
              if (beforeScope.kind !== 'pinned') throw new Error('missing fixture scope');
              expect(beforeScope.pendingCommandId).toBe(staged.intent.commandId);
              let ownership = setup.ownership;
              if (late) {
                stores.clock.advance(101);
                ownership = unwrapReply(
                  await stores.runs.acquireOwnership(ownerId('replacement'), ownership.epoch),
                );
              }
              const evidence = await retainClaimReceipt(stores, staged.intent);
              const guard = { ...(await setup.scopedGuard()), ownership };
              const accepted = unwrapReply(
                await acceptClaimReceipt(stores.runs, stores.artifacts, guard, {
                  commandId: executionCommandId('accepted'),
                  intent: staged.intent,
                  evidence,
                }),
              );
              expect(accepted.attempt.state).toMatchObject({
                kind: 'ready',
                execution: {
                  session:
                    setup.prepared.state.kind === 'prepared'
                      ? setup.prepared.state.session
                      : undefined,
                  binding: { intent: staged.intent },
                },
                cause: { kind: 'initial' },
              });
              const afterScope = await stores.runs.readRuntimeScope(setup.scope);
              expect(afterScope).toMatchObject({
                revision: beforeScope.revision + 1,
                pendingCommandId: null,
              });
              expect(accepted.attempt.holdsCapacity).toBe(true);
              if (late)
                expect(
                  await stores.runs.stageTurn(
                    { ...(await setup.scopedGuard()), ownership },
                    {
                      version: 2,
                      kind: 'stage_turn',
                      commandId: executionCommandId('new-turn'),
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
            } finally {
              stores.close();
            }
          },
        );

    for (const wrapper of ['direct', 'reconciling', 'unresolved'] as const)
      for (const kind of ['completed', 'not_started', 'unresolved'] as const)
        test(
          'exact ' + kind + ' turn reply resolves only its pending identity from ' + wrapper,
          async () => {
            const stores = await create();
            try {
              const setup = await prepareTurn(stores);
              if (wrapper !== 'direct')
                unwrapReply(
                  await stores.runs.recordExecution(
                    await setup.currentGuard(),
                    createExecutionCommand(
                      wrapper === 'reconciling'
                        ? { kind: 'recovery_required', reason: 'turn uncertain' }
                        : {
                            kind: 'unresolved',
                            reason: 'turn uncertain',
                            evidence: setup.quiescence.evidence,
                          },
                    ),
                  ),
                );
              const reattached = unwrapReply(
                await stores.runs.recordExecution(
                  await setup.currentGuard(),
                  createExecutionCommand({
                    kind: 'session_reattached',
                    locator: setup.locator,
                    owner: setup.owner,
                    evidence: setup.quiescence.evidence,
                  }),
                ),
              );
              expect(reattached.state.kind).toBe(
                wrapper === 'unresolved' ? 'unresolved' : 'turn_pending',
              );
              const identity = { locator: setup.locator, turnKey: 'turn', owner: setup.owner };
              const reply: TurnReply =
                kind === 'completed'
                  ? {
                      kind,
                      identity,
                      outcome: {
                        text: 'retained output',
                        usage: { kind: 'unknown', reason: 'human' },
                        finish: 'end_turn',
                      },
                    }
                  : kind === 'not_started'
                    ? { kind, identity, reason: 'session_busy' }
                    : {
                        kind,
                        identity,
                        reason: 'transport_lost',
                        text: 'partial output',
                        usage: { kind: 'measured', inputTokens: 7, outputTokens: 2 },
                      };
              const before = await stores.runs.readExecutionHistory(
                setup.run.runId,
                setup.admission.attemptId,
              );
              for (const changed of [
                { ...identity, turnKey: 'wrong' },
                { ...identity, owner: { ...setup.owner, epoch: setup.owner.epoch + 1 } },
                {
                  ...identity,
                  locator: {
                    ...setup.locator,
                    session: { ...setup.locator.session, sessionId: 'wrong' },
                  },
                },
              ]) {
                expect(
                  await stores.runs.recordExecution(
                    await setup.currentGuard(),
                    createExecutionCommand({
                      kind: 'turn_observed',
                      reply: { ...reply, identity: changed },
                    }),
                  ),
                ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
                expect(
                  await stores.runs.readExecutionHistory(
                    setup.run.runId,
                    setup.admission.attemptId,
                  ),
                ).toEqual(before);
              }
              const command = createExecutionCommand({ kind: 'turn_observed', reply });
              const observed = unwrapReply(
                await stores.runs.recordExecution(await setup.currentGuard(), command),
              );
              expect(observed.state.kind).toBe(
                kind === 'completed'
                  ? 'turn_returned'
                  : kind === 'not_started'
                    ? 'ready'
                    : 'unresolved',
              );
              expect(observed.holdsCapacity).toBe(true);
              if (kind === 'not_started') {
                const guard = await setup.scopedGuard();
                expect(
                  await stores.runs.stageTurn(guard, {
                    version: 2,
                    kind: 'stage_turn',
                    commandId: executionCommandId('retry-turn'),
                    request: { ...setup.turn.intent.request, input: 'different payload' },
                  }),
                ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
                const resumed = unwrapReply(
                  await stores.runs.stageTurn(guard, {
                    version: 2,
                    kind: 'stage_turn',
                    commandId: executionCommandId('retry-turn'),
                    request: setup.turn.intent.request,
                  }),
                );
                expect(resumed.intent).toEqual(setup.turn.intent);
              } else
                unwrapReply(
                  await stores.runs.recordExecution(
                    await setup.currentGuard(),
                    createExecutionCommand({
                      kind: 'recovery_required',
                      reason: 'later observation',
                    }),
                  ),
                );
              const history = await stores.runs.readExecutionHistory(
                setup.run.runId,
                setup.admission.attemptId,
              );
              expect(
                history.executions.find((entry) => entry.command.commandId === command.commandId)
                  ?.command,
              ).toEqual(command);
              expect(
                await stores.runs.recordExecution(await setup.currentGuard(), command),
              ).toEqual({ kind: 'duplicate', value: observed });
            } finally {
              stores.close();
            }
          },
        );
  });
}

import { decodeClaimStageCommand } from '../execution-codecs';
import type { ClaimStageCommand } from '../execution-records';
import { decisionId as decisionIdForGuards } from '../record-codecs';
import { readRuntimeRequest } from '../runtime-codecs';
import { prepareClaimed as prepareClaimedForGuards } from './fixtures';
import { authorityRequest as authorityRequestForGuards } from './runtime-history-contract';
function preparedStage(setup: Awaited<ReturnType<typeof prepareSession>>): ClaimStageCommand {
  if (setup.prepared.state.kind !== 'prepared') throw new Error('fixture expected prepared');
  return {
    version: 2,
    kind: 'stage_claim',
    commandId: executionCommandId('guard-stage'),
    canonicalRequest: setup.canonicalRequest,
    observation: setup.prepared.state.session.preparation.target.observation,
  };
}
function claimGuardContract(create: () => Promise<OutcomeFixture>): void {
  test('turn stage requires current submitting owner even when old grant and attachment agree', async () => {
    const stores = await create();
    try {
      const setup = await prepareClaimedForGuards(stores);
      stores.clock.advance(101);
      const ownership = unwrapReply(
        await stores.runs.acquireOwnership(ownerId('replacement'), setup.ownership.epoch),
      );
      const history = await stores.runs.readExecutionHistory(
          setup.run.runId,
          setup.attempt.attemptId,
        ),
        scope = await stores.runs.readRuntimeScope(setup.scope);
      expect(
        await stores.runs.stageTurn(
          { ...(await setup.scopedGuard()), ownership },
          {
            version: 2,
            kind: 'stage_turn',
            commandId: executionCommandId('old-owner-turn'),
            request: {
              version: 1,
              turnKey: 'old-owner-turn',
              owner: setup.owner,
              cause: { kind: 'initial' },
              input: 'work',
            },
          },
        ),
      ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
      expect(
        await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
      ).toEqual(history);
      expect(await stores.runs.readRuntimeScope(setup.scope)).toEqual(scope);
    } finally {
      stores.close();
    }
  });
  test('claim acceptance replay remains original after later turn and refuses a second local association or scope', async () => {
    const stores = await create();
    try {
      const setup = await prepareTurn(stores),
        history = await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId);
      const recorded = history.executions.find((entry) => entry.command.kind === 'accept_claim');
      if (recorded?.command.kind !== 'accept_claim' || recorded.reply.kind !== 'claim_accepted')
        throw new Error('fixture acceptance missing');
      const command = recorded.command,
        original = structuredClone(recorded.reply),
        guard = await setup.scopedGuard();
      expect(await stores.runs.recordClaimAcceptance(guard, command)).toEqual({
        kind: 'duplicate',
        value: original,
      });
      expect(
        await stores.runs.recordClaimAcceptance(guard, {
          ...command,
          commandId: executionCommandId('second-association'),
        }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(
        await stores.runs.recordClaimAcceptance(
          { ...guard, scope: { ...guard.scope, personId: 'other' } },
          command,
        ),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(
        await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
      ).toEqual(history);
    } finally {
      stores.close();
    }
  });

  for (const fault of [
    'scope',
    'ledger',
    'basis',
    'work',
    'step',
    'parent',
    'store',
    'run',
    'attempt',
    'session',
    'observation work',
    'observation step',
    'observation code',
    'observation ledger',
    'observation scope',
    'authority generation',
    'authority owner',
  ] as const)
    test(
      'claim stage refuses coherent ' + fault + ' mismatch without either history mutation',
      async () => {
        const stores = await create();
        try {
          const setup = await prepareSession(stores),
            command = structuredClone(preparedStage(setup));
          const wire = JSON.parse(command.canonicalRequest) as MutableClaimWire;
          if (fault === 'scope') wire.scope.personId = 'other';
          if (fault === 'ledger') wire.expectedLedgerId = 'other';
          if (fault === 'basis') wire.operation.expectedBasis = 'rb1:' + 'c'.repeat(64);
          if (fault === 'work') wire.operation.action.workItemId = 'other';
          if (fault === 'step') wire.operation.action.stepId = 'other';
          if (fault === 'parent') wire.operation.action.parentClaimId = 'other';
          if (fault === 'store') wire.operation.action.execution.storeId = 'other';
          if (fault === 'run') wire.operation.action.execution.runId = 'other';
          if (fault === 'attempt') wire.operation.action.execution.attemptId = 'other';
          if (fault === 'session') wire.operation.action.execution.sessionId = 'other';
          if (fault === 'authority generation') wire.operation.authority.generation = 2;
          if (fault === 'authority owner') wire.operation.authority.ownerId = 'other';
          if (fault === 'observation work')
            Object.assign(command.observation, { workItemId: 'other' });
          if (fault === 'observation step') Object.assign(command.observation, { stepId: 'other' });
          if (fault === 'observation code')
            Object.assign(command.observation, { stepCode: 'other' });
          if (fault === 'observation ledger')
            Object.assign(command.observation, { ledgerId: 'other' });
          if (fault === 'observation scope')
            Object.assign(command.observation.scope, { personId: 'other' });
          const canonicalRequest = JSON.stringify(wire);
          readRuntimeRequest(canonicalRequest);
          const candidate = decodeClaimStageCommand({ ...command, canonicalRequest });
          const history = await stores.runs.readExecutionHistory(
              setup.run.runId,
              setup.attempt.attemptId,
            ),
            scope = await stores.runs.readRuntimeScope(setup.scope);
          expect(await stores.runs.stageClaim(await setup.scopedGuard(), candidate)).toEqual({
            kind: 'refused',
            reason: 'authority_conflict',
          });
          expect(
            await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
          ).toEqual(history);
          expect(await stores.runs.readRuntimeScope(setup.scope)).toEqual(scope);
          expect((await stores.runs.readRun(setup.run.runId)).capacity.reserved).toBe(1);
        } finally {
          stores.close();
        }
      },
    );
  for (const state of ['pending authority', 'reconciling prepared', 'unresolved prepared'] as const)
    test('claim stage refuses ' + state + ' with valid exact request', async () => {
      const stores = await create();
      try {
        const setup = await prepareSession(stores),
          command = preparedStage(setup);
        if (state === 'pending authority')
          unwrapReply(
            await stores.runs.stageRuntimeRequest(
              { ownership: setup.ownership, scope: setup.scope, expectedRevision: 2 },
              authorityRequestForGuards('pending', 1, setup.scope),
            ),
          );
        else
          unwrapReply(
            await stores.runs.recordExecution(
              await setup.currentGuard(),
              createExecutionCommand(
                state === 'reconciling prepared'
                  ? { kind: 'recovery_required', reason: 'uncertain' }
                  : {
                      kind: 'unresolved',
                      reason: 'uncertain',
                      evidence: setup.preparationInput.stateEvidence,
                    },
              ),
            ),
          );
        const history = await stores.runs.readExecutionHistory(
            setup.run.runId,
            setup.attempt.attemptId,
          ),
          scope = await stores.runs.readRuntimeScope(setup.scope);
        expect(await stores.runs.stageClaim(await setup.scopedGuard(), command)).toEqual({
          kind: 'refused',
          reason: 'state_conflict',
        });
        expect(
          await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
        ).toEqual(history);
        expect(await stores.runs.readRuntimeScope(setup.scope)).toEqual(scope);
      } finally {
        stores.close();
      }
    });
  for (const field of [
    'expectedRevision',
    'expectedAttemptRevision',
    'expectedScopeRevision',
  ] as const)
    test('claim stage refuses stale ' + field + ' before publishing either half', async () => {
      const stores = await create();
      try {
        const setup = await prepareSession(stores),
          guard = await setup.scopedGuard();
        const history = await stores.runs.readExecutionHistory(
            setup.run.runId,
            setup.attempt.attemptId,
          ),
          scope = await stores.runs.readRuntimeScope(setup.scope);
        expect(
          await stores.runs.stageClaim(
            { ...guard, [field]: guard[field] - 1 },
            preparedStage(setup),
          ),
        ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
        expect(
          await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
        ).toEqual(history);
        expect(await stores.runs.readRuntimeScope(setup.scope)).toEqual(scope);
      } finally {
        stores.close();
      }
    });
  test('claim wire identity is unbounded and local replay retains its immutable detached acknowledgement', async () => {
    const stores = await create();
    try {
      const setup = await prepareSession(stores),
        command = preparedStage(setup),
        wire = JSON.parse(command.canonicalRequest) as MutableClaimWire;
      wire.commandId = 'wire-' + 'x'.repeat(4096);
      const candidate = { ...command, canonicalRequest: JSON.stringify(wire) };
      const staged = unwrapReply(
          await stores.runs.stageClaim(await setup.scopedGuard(), candidate),
        ),
        original = structuredClone(staged);
      expect(staged.intent.commandId).toBe(wire.commandId);
      Object.assign(staged.intent, { commandId: 'mutated' });
      Object.assign(staged.attempt, { revision: 999 });
      expect(await stores.runs.stageClaim(await setup.scopedGuard(), candidate)).toEqual({
        kind: 'duplicate',
        value: original,
      });
      expect(
        await stores.runs.stageClaim(await setup.scopedGuard(), {
          ...candidate,
          commandId: executionCommandId('other-local'),
        }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      const changed = JSON.parse(candidate.canonicalRequest) as MutableClaimWire;
      changed.commandId = 'other-wire';
      expect(
        await stores.runs.stageClaim(await setup.scopedGuard(), {
          ...candidate,
          canonicalRequest: JSON.stringify(changed),
        }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(
        await stores.runs.stageTurn(await setup.scopedGuard(), {
          version: 2,
          kind: 'stage_turn',
          commandId: candidate.commandId,
          request: {
            version: 1,
            turnKey: 'turn',
            owner: setup.owner,
            cause: { kind: 'initial' },
            input: 'work',
          },
        }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(
        (
          await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)
        ).executions.at(-1)?.reply,
      ).toEqual(original);
    } finally {
      stores.close();
    }
  });
  for (const fault of [
    'cause',
    'owner',
    'pending authority',
    'reconciling ready',
    'unresolved ready',
  ] as const)
    test('turn stage refuses ' + fault + ' while preserving claim and reservation', async () => {
      const stores = await create();
      try {
        const setup = await prepareClaimedForGuards(stores);
        if (fault === 'pending authority')
          unwrapReply(
            await stores.runs.stageRuntimeRequest(
              { ownership: setup.ownership, scope: setup.scope, expectedRevision: 4 },
              authorityRequestForGuards('pending', 1, setup.scope),
            ),
          );
        if (fault === 'reconciling ready' || fault === 'unresolved ready')
          unwrapReply(
            await stores.runs.recordExecution(
              await setup.currentGuard(),
              createExecutionCommand(
                fault === 'reconciling ready'
                  ? { kind: 'recovery_required', reason: 'uncertain' }
                  : {
                      kind: 'unresolved',
                      reason: 'uncertain',
                      evidence: setup.quiescence.evidence,
                    },
              ),
            ),
          );
        const history = await stores.runs.readExecutionHistory(
            setup.run.runId,
            setup.attempt.attemptId,
          ),
          scope = await stores.runs.readRuntimeScope(setup.scope);
        const reply = await stores.runs.stageTurn(await setup.scopedGuard(), {
          version: 2,
          kind: 'stage_turn',
          commandId: executionCommandId('guard-turn'),
          request: {
            version: 1,
            turnKey: 'turn',
            owner: fault === 'owner' ? { ...setup.owner, ownerId: ownerId('other') } : setup.owner,
            cause:
              fault === 'cause'
                ? { kind: 'decision', decisionId: decisionIdForGuards('other') }
                : { kind: 'initial' },
            input: 'work',
          },
        });
        expect(reply).toEqual({
          kind: 'refused',
          reason:
            fault === 'cause'
              ? 'identity_conflict'
              : fault === 'owner'
                ? 'authority_conflict'
                : 'state_conflict',
        });
        expect(
          await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
        ).toEqual(history);
        expect(await stores.runs.readRuntimeScope(setup.scope)).toEqual(scope);
        expect((await stores.runs.readRun(setup.run.runId)).capacity.reserved).toBe(1);
      } finally {
        stores.close();
      }
    });
}

import { decodeExecutionCommand as decodePreparationCommand } from '../record-codecs';
function preparationGuardContract(create: () => Promise<OutcomeFixture>): void {
  test('fresh preparation refuses a second local command after leaving queued', async () => {
    const stores = await create();
    try {
      const setup = await prepareSession(stores),
        history = await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId);
      const command = history.executions.at(0)?.command;
      if (command?.kind !== 'execution') throw new Error('fixture preparation missing');
      expect(
        await stores.runs.recordExecution(await setup.currentGuard(), {
          ...command,
          commandId: executionCommandId('prepare-again'),
        }),
      ).toEqual({ kind: 'refused', reason: 'state_conflict' });
      expect(
        await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
      ).toEqual(history);
    } finally {
      stores.close();
    }
  });
  for (const field of [
    'manifest',
    'executor kind',
    'executor version',
    'attempt',
    'run',
    'work',
    'project',
    'organization',
    'step',
    'owner',
  ] as const)
    test('raw preparation refuses coherent ' + field + ' mismatch from queued', async () => {
      const original = await create(),
        stores = await create();
      try {
        const prepared = await prepareSession(original),
          setup = await admitExecution(stores);
        const history = await original.runs.readExecutionHistory(
          prepared.run.runId,
          prepared.attempt.attemptId,
        );
        const retained = history.executions.at(0)?.command;
        if (retained?.kind !== 'execution' || retained.fact.kind !== 'preparation_intended')
          throw new Error('fixture preparation missing');
        const intent = structuredClone(retained.fact.intent),
          command = { ...retained, fact: { ...retained.fact, intent } };
        if (field === 'manifest') Object.assign(intent, { manifestDigest: 'b'.repeat(64) });
        if (field === 'executor kind') Object.assign(intent.executor, { kind: 'tool' });
        if (field === 'executor version') Object.assign(intent.executor, { version: 'other' });
        if (field === 'attempt') Object.assign(intent.preparation, { attemptId: 'other' });
        if (field === 'run') Object.assign(intent.preparation.identity, { runId: 'other' });
        if (field === 'work') Object.assign(intent.target.observation, { workItemId: 'other' });
        if (field === 'project')
          Object.assign(intent.target.observation.scope, { projectId: 'other' });
        if (field === 'organization')
          Object.assign(intent.target.observation.scope, { organizationId: 'other' });
        if (field === 'step') Object.assign(intent.target.observation, { stepCode: 'other' });
        if (field === 'owner') Object.assign(intent.owner, { ownerId: 'other' });
        const candidate = decodePreparationCommand(command),
          before = await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId);
        expect(await stores.runs.recordExecution(await setup.currentGuard(), candidate)).toEqual({
          kind: 'refused',
          reason: 'authority_conflict',
        });
        expect(
          await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
        ).toEqual(before);
        expect((await stores.runs.readRun(setup.run.runId)).capacity.reserved).toBe(1);
      } finally {
        original.close();
        stores.close();
      }
    });
  test('preparation creation key cannot be reused by another independent attempt for the same executor', async () => {
    const stores = await create();
    try {
      const first = await prepareSession(stores),
        second = await admitExecution(stores, { ownership: first.ownership, suffix: 'second' });
      const before = await stores.runs.readExecutionHistory(
        second.run.runId,
        second.attempt.attemptId,
      );
      expect(
        await recordPreparation(stores.runs, stores.artifacts, await second.currentGuard(), {
          ...second.preparationInput,
          preparation: {
            ...second.preparationInput.preparation,
            creationKey: first.preparationInput.preparation.creationKey,
          },
        }),
      ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
      expect(
        await stores.runs.readExecutionHistory(second.run.runId, second.attempt.attemptId),
      ).toEqual(before);
      expect((await stores.runs.readRun(second.run.runId)).capacity.reserved).toBe(2);
    } finally {
      stores.close();
    }
  });
  test('claim wire association is globally unique across independent prepared attempts', async () => {
    const stores = await create();
    try {
      const first = await prepareClaimedForGuards(stores),
        second = await prepareSession(stores, { ownership: first.ownership, suffix: 'second' }),
        command = preparedStage(second);
      const wire = JSON.parse(command.canonicalRequest) as MutableClaimWire;
      wire.commandId = first.staged.intent.commandId;
      const candidate = decodeClaimStageCommand({
          ...command,
          canonicalRequest: JSON.stringify(wire),
        }),
        before = await stores.runs.readExecutionHistory(second.run.runId, second.attempt.attemptId),
        scope = await stores.runs.readRuntimeScope(second.scope);
      expect(await stores.runs.stageClaim(await second.scopedGuard(), candidate)).toEqual({
        kind: 'refused',
        reason: 'identity_conflict',
      });
      expect(
        await stores.runs.readExecutionHistory(second.run.runId, second.attempt.attemptId),
      ).toEqual(before);
      expect(await stores.runs.readRuntimeScope(second.scope)).toEqual(scope);
    } finally {
      stores.close();
    }
  });
  test('claim acceptance cannot reopen a settled interrupted claiming checkpoint', async () => {
    const stores = await create();
    try {
      const setup = await prepareSession(stores),
        staged = unwrapReply(
          await stores.runs.stageClaim(await setup.scopedGuard(), preparedStage(setup)),
        );
      const evidence = await retainClaimReceipt(stores, staged.intent);
      unwrapReply(
        await stores.runs.recordExecution(
          await setup.currentGuard(),
          createExecutionCommand({
            kind: 'interrupted',
            quiescence: {
              version: 1,
              operationKey: setup.admission.identity.operationKey,
              observedAt: 1000,
              evidence,
              effect: 'absent',
            },
          }),
        ),
      );
      const before = await stores.runs.readExecutionHistory(
          setup.run.runId,
          setup.attempt.attemptId,
        ),
        scope = await stores.runs.readRuntimeScope(setup.scope);
      expect(
        await acceptClaimReceipt(stores.runs, stores.artifacts, await setup.scopedGuard(), {
          commandId: executionCommandId('late-acceptance'),
          intent: staged.intent,
          evidence,
        }),
      ).toEqual({ kind: 'refused', reason: 'state_conflict' });
      expect(
        await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
      ).toEqual(before);
      expect(await stores.runs.readRuntimeScope(setup.scope)).toEqual(scope);
      expect((await stores.runs.readRun(setup.run.runId)).capacity.reserved).toBe(0);
    } finally {
      stores.close();
    }
  });
}

import type { ClaimAcceptCommand, TurnStageCommand } from '../execution-records';
import type { RunStore, ScopedAttemptGuard } from '../run-store';
export type CoupledProviderCommand = ClaimStageCommand | ClaimAcceptCommand | TurnStageCommand;
/** Produces a valid fresh command at its actual coupled predecessor, with verified claim bytes. */
export async function prepareCoupledProvider(
  stores: OutcomeFixture,
  kind: CoupledProviderCommand['kind'],
  identities = {
    stage: executionCommandId('guard-stage'),
    accept: executionCommandId('provider-accept'),
    turn: executionCommandId('provider-turn'),
    turnKey: 'provider-turn',
  },
) {
  const setup = await prepareSession(stores);
  const stage = { ...preparedStage(setup), commandId: identities.stage };
  if (kind === 'stage_claim')
    return { setup, command: stage as CoupledProviderCommand, guard: await setup.scopedGuard() };
  const staged = unwrapReply(await stores.runs.stageClaim(await setup.scopedGuard(), stage));
  const evidence = await retainClaimReceipt(stores, staged.intent);
  const accepted: ClaimAcceptCommand = {
    version: 2,
    kind: 'accept_claim',
    commandId: identities.accept,
    intent: staged.intent,
    evidence,
    projection: {
      version: 1,
      claimId: 'claim',
      actorId: 'account',
      basisAfter: 'rb1:' + 'b'.repeat(64),
    },
  };
  if (kind === 'accept_claim')
    return { setup, command: accepted as CoupledProviderCommand, guard: await setup.scopedGuard() };
  unwrapReply(
    await acceptClaimReceipt(stores.runs, stores.artifacts, await setup.scopedGuard(), {
      commandId: accepted.commandId,
      intent: staged.intent,
      evidence,
    }),
  );
  const turn: TurnStageCommand = {
    version: 2,
    kind: 'stage_turn',
    commandId: identities.turn,
    request: {
      version: 1,
      turnKey: identities.turnKey,
      owner: setup.owner,
      cause: { kind: 'initial' },
      input: 'work',
    },
  };
  return { setup, command: turn as CoupledProviderCommand, guard: await setup.scopedGuard() };
}
export function invokeCoupledProvider(
  runs: RunStore,
  guard: ScopedAttemptGuard,
  command: CoupledProviderCommand,
) {
  switch (command.kind) {
    case 'stage_claim':
      return runs.stageClaim(guard, command);
    case 'accept_claim':
      return runs.recordClaimAcceptance(guard, command);
    case 'stage_turn':
      return runs.stageTurn(guard, command);
  }
}
function coupledProviderContract(create: () => Promise<OutcomeFixture>): void {
  for (const kind of ['stage_claim', 'accept_claim', 'stage_turn'] as const)
    test(
      'coupled provider ' + kind + ' fences expired owner before fresh publication',
      async () => {
        const stores = await create();
        try {
          const { setup, command, guard } = await prepareCoupledProvider(stores, kind);
          const history = await stores.runs.readExecutionHistory(
              setup.run.runId,
              setup.attempt.attemptId,
            ),
            scope = await stores.runs.readRuntimeScope(setup.scope);
          stores.clock.advance(101);
          expect(await invokeCoupledProvider(stores.runs, guard, command)).toEqual({
            kind: 'refused',
            reason: 'owner_stale',
          });
          expect(
            await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
          ).toEqual(history);
          if (scope.kind !== 'pinned') throw new Error('fixture scope missing');
          expect(await stores.runs.readRuntimeScope(setup.scope)).toMatchObject({
            revision: scope.revision,
          });
        } finally {
          stores.close();
        }
      },
    );
}

function coupledDecoderContract(create: () => Promise<OutcomeFixture>): void {
  for (const kind of ['stage_claim', 'accept_claim', 'stage_turn'] as const) {
    for (const field of ['guard', 'command'] as const) {
      test(
        'coupled decoder ' + kind + ' rejects unknown ' + field + ' before publication',
        async () => {
          const stores = await create();
          try {
            const { setup, command, guard } = await prepareCoupledProvider(stores, kind);
            const history = await stores.runs.readExecutionHistory(
              setup.run.runId,
              setup.attempt.attemptId,
            );
            const scope = await stores.runs.readRuntimeScope(setup.scope);
            const run = await stores.runs.readRun(setup.run.runId);
            const suppliedGuard = field === 'guard' ? { ...guard, unexpected: true } : guard;
            const suppliedCommand =
              field === 'command' ? { ...command, unexpected: true } : command;
            // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
            await expect(
              invokeCoupledProvider(stores.runs, suppliedGuard, suppliedCommand),
            ).rejects.toThrow();
            expect(
              await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
            ).toEqual(history);
            expect(await stores.runs.readRuntimeScope(setup.scope)).toEqual(scope);
            expect(await stores.runs.readRun(setup.run.runId)).toEqual(run);
            expect((await invokeCoupledProvider(stores.runs, guard, command)).kind).toBe('applied');
          } finally {
            stores.close();
          }
        },
      );
    }
  }
}

/** Mutable shape of the valid retained claim fixture; tests deliberately alter single wire fields. */
interface MutableClaimWire {
  commandId: string;
  scope: { personId: string };
  expectedLedgerId: string;
  operation: {
    expectedBasis: string;
    authority: { generation: number; ownerId: string };
    action: {
      workItemId: string;
      stepId: string;
      parentClaimId: string;
      execution: { storeId: string; runId: string; attemptId: string; sessionId: string };
    };
  };
}

import { decodeClaimAcceptCommand } from '../execution-codecs';
import { reconstructRuntimeScope } from '../plan-runtime';
import { decodeRuntimeIntent, digestRuntimeRequest } from '../runtime-codecs';
function reviewGuardContract(create: () => Promise<OutcomeFixture>): void {
  for (const phase of ['fresh', 'replay'] as const)
    test('review guard authority stage refuses coupled claim ' + phase, async () => {
      const stores = await create();
      try {
        const { setup } = await prepareCoupledProvider(
          stores,
          phase === 'fresh' ? 'stage_claim' : 'accept_claim',
        );
        const history = await stores.runs.readExecutionHistory(
          setup.run.runId,
          setup.attempt.attemptId,
        );
        const scope = await stores.runs.readRuntimeScope(setup.scope);
        if (scope.kind !== 'pinned') throw new Error('fixture scope missing');
        expect(
          await stores.runs.stageRuntimeRequest(
            { ownership: setup.ownership, scope: setup.scope, expectedRevision: scope.revision },
            setup.canonicalRequest,
          ),
        ).toEqual({ kind: 'refused', reason: 'state_conflict' });
        expect(await stores.runs.readRuntimeScope(setup.scope)).toEqual(scope);
        expect(
          await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
        ).toEqual(history);
      } finally {
        stores.close();
      }
    });
  test('review guard authority acceptance refuses coupled claim replay', async () => {
    const stores = await create();
    try {
      const { setup } = await prepareCoupledProvider(stores, 'stage_turn');
      const history = await stores.runs.readExecutionHistory(
        setup.run.runId,
        setup.attempt.attemptId,
      );
      const scope = await stores.runs.readRuntimeScope(setup.scope);
      if (scope.kind !== 'pinned') throw new Error('fixture scope missing');
      const intent = scope.intents.find(
        (candidate) => candidate.canonicalRequest === setup.canonicalRequest,
      );
      const acceptance = scope.acceptances.find(
        (candidate) => candidate.commandId === intent?.commandId,
      );
      if (intent === undefined || acceptance === undefined)
        throw new Error('fixture claim acceptance missing');
      expect(
        await stores.runs.recordRuntimeAcceptance(
          { ownership: setup.ownership, scope: setup.scope, expectedRevision: scope.revision },
          { intent, evidence: acceptance.evidence },
        ),
      ).toEqual({ kind: 'refused', reason: 'state_conflict' });
      expect(await stores.runs.readRuntimeScope(setup.scope)).toEqual(scope);
      expect(
        await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
      ).toEqual(history);
    } finally {
      stores.close();
    }
  });
  test('review guard claim acceptance rejects different submitted intent', async () => {
    const stores = await create();
    try {
      const { setup, command, guard } = await prepareCoupledProvider(stores, 'accept_claim');
      if (command.kind !== 'accept_claim') throw new Error('fixture acceptance command missing');
      const history = await stores.runs.readExecutionHistory(
        setup.run.runId,
        setup.attempt.attemptId,
      );
      const scope = await stores.runs.readRuntimeScope(setup.scope);
      const supplied = decodeClaimAcceptCommand({
        ...command,
        intent: {
          ...command.intent,
          localOwner: {
            ...command.intent.localOwner,
            ownerId: ownerId('different-submitted-owner'),
          },
        },
      });
      expect(await stores.runs.recordClaimAcceptance(guard, supplied)).toEqual({
        kind: 'refused',
        reason: 'identity_conflict',
      });
      expect(
        await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
      ).toEqual(history);
      expect(await stores.runs.readRuntimeScope(setup.scope)).toEqual(scope);
    } finally {
      stores.close();
    }
  });
  test('review guard claim acceptance refuses reconciling prepared checkpoint', async () => {
    const stores = await create();
    try {
      const setup = await prepareSession(stores);
      unwrapReply(
        await stores.runs.recordExecution(
          await setup.currentGuard(),
          createExecutionCommand({
            kind: 'recovery_required',
            reason: 'prepared observation uncertain',
          }),
        ),
      );
      const history = await stores.runs.readExecutionHistory(
        setup.run.runId,
        setup.attempt.attemptId,
      );
      const scope = await stores.runs.readRuntimeScope(setup.scope);
      if (scope.kind !== 'pinned') throw new Error('fixture scope missing');
      const intent = scope.intents.at(0),
        acceptance = scope.acceptances.at(0);
      if (intent === undefined || acceptance === undefined)
        throw new Error('fixture authority missing');
      const commandId = 'unretained-prepared-authority';
      const canonicalRequest = intent.canonicalRequest.replace(
        '"commandId":"' + intent.commandId + '"',
        '"commandId":"' + commandId + '"',
      );
      if (canonicalRequest === intent.canonicalRequest)
        throw new Error('fixture authority command anchor missing');
      readRuntimeRequest(canonicalRequest);
      const supplied = decodeRuntimeIntent({
        ...intent,
        commandId,
        canonicalRequest,
        requestDigest: digestRuntimeRequest(canonicalRequest),
      });
      const command = decodeClaimAcceptCommand({
        version: 2,
        kind: 'accept_claim',
        commandId: executionCommandId('prepared-acceptance'),
        intent: supplied,
        evidence: acceptance.evidence,
        projection: {
          version: 1,
          claimId: 'claim',
          actorId: 'account',
          basisAfter: 'rb1:' + 'b'.repeat(64),
        },
      });
      expect(await stores.runs.recordClaimAcceptance(await setup.scopedGuard(), command)).toEqual({
        kind: 'refused',
        reason: 'state_conflict',
      });
      expect(
        await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
      ).toEqual(history);
      expect(await stores.runs.readRuntimeScope(setup.scope)).toEqual(scope);
    } finally {
      stores.close();
    }
  });
  for (const fault of [
    'missing acquisition',
    'different local owner',
    'different wire authority',
  ] as const)
    test('review guard runtime claim reconstruction rejects ' + fault, async () => {
      const stores = await create();
      try {
        const { setup, command } = await prepareCoupledProvider(stores, 'accept_claim');
        if (command.kind !== 'accept_claim') throw new Error('fixture acceptance command missing');
        stores.clock.advance(101);
        const owner = unwrapReply(
          await stores.runs.acquireOwnership(ownerId('later-owner'), setup.ownership.epoch),
        );
        const scope = await stores.runs.readRuntimeScope(setup.scope);
        if (scope.kind !== 'pinned') throw new Error('fixture scope missing');
        const ownership = {
          storeId: owner.storeId,
          organizationId: owner.organizationId,
          epoch: owner.epoch,
          owner,
        };
        const retained = { pin: scope.pin, revision: scope.revision };
        expect(
          reconstructRuntimeScope(retained, scope.intents, scope.acceptances, ownership)
            .pendingCommandId,
        ).toBe(command.intent.commandId);
        let intents = [...scope.intents],
          acceptances = [...scope.acceptances],
          revision = scope.revision;
        if (fault === 'missing acquisition') {
          intents = [decodeRuntimeIntent({ ...command.intent, stagedRevision: 1 })];
          acceptances = [];
          revision = 1;
        } else {
          const canonicalRequest =
            fault === 'different wire authority'
              ? command.intent.canonicalRequest.replace('"generation":1', '"generation":2')
              : command.intent.canonicalRequest;
          if (
            fault === 'different wire authority' &&
            canonicalRequest === command.intent.canonicalRequest
          )
            throw new Error('fixture authority anchor missing');
          readRuntimeRequest(canonicalRequest);
          const changed = decodeRuntimeIntent({
            ...command.intent,
            canonicalRequest,
            requestDigest: digestRuntimeRequest(canonicalRequest),
            localOwner:
              fault === 'different local owner'
                ? { ownerId: owner.ownerId, epoch: owner.epoch }
                : command.intent.localOwner,
          });
          intents = intents.map((intent) =>
            intent.commandId === changed.commandId ? changed : intent,
          );
        }
        expect(() =>
          reconstructRuntimeScope({ ...retained, revision }, intents, acceptances, ownership),
        ).toThrow('corrupt runtime claim authority');
      } finally {
        stores.close();
      }
    });
}
