import { rejects } from 'node:assert/strict';

import { canonicalRuntimeRequest, parseCanonicalRuntimeRequest } from '@wbs/contracts';
import { describe, expect, test } from 'bun:test';

import { stageClaimRequest } from '../claim-history';
import { attemptId, executionCommandId, operationKey, ownerId } from '../record-codecs';
import { readTargetObservation } from '../record-preparation';
import type { ExecutionFact } from '../records';
import { createExecutionCommand, createRunGuard } from './fixtures';
import {
  type OutcomeFixture,
  prepareClaimed,
  prepareSession,
  prepareTurn,
  stageFixtureTurn,
  unwrapReply,
} from './fixtures';

export function executionContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    test('execution requires exact claim target and matching prepared operation', async () => {
      const stores = await create();
      try {
        expect(typeof stores.runs.recordExecution).toBe('function');
        const setup = await prepareSession(stores);
        const { scope, operation } = parseCanonicalRuntimeRequest(setup.canonicalRequest);
        if ('kind' in operation || operation.action.kind !== 'claim')
          throw new Error('claim fixture required');
        const action = operation.action;
        const before = await stores.runs.readRun(setup.run.runId);
        for (const changed of [
          { ...action, workItemId: 'wrong' },
          { ...action, stepId: 'wrong' },
          { ...action, parentClaimId: 'wrong' },
          ...['runId', 'attemptId', 'storeId', 'sessionId'].map((field) => ({
            ...action,
            execution: { ...action.execution, [field]: 'wrong' },
          })),
        ]) {
          expect(
            await stageClaimRequest(stores.runs, stores.artifacts, await setup.scopedGuard(), {
              commandId: executionCommandId('stage-claim'),
              canonicalRequest: canonicalRuntimeRequest(scope, { ...operation, action: changed }),
              stateEvidence: setup.preparationInput.stateEvidence,
            }),
          ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        }
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
        const command = {
          version: 2 as const,
          kind: 'stage_claim' as const,
          commandId: executionCommandId('stage-claim'),
          canonicalRequest: setup.canonicalRequest,
          observation: await readTargetObservation(
            stores.artifacts,
            setup.preparationInput.stateEvidence,
            { scope, workItemId: setup.run.workItemId, stepId: 'step', stepCode: 'plan' },
          ),
        };
        const guard = await setup.scopedGuard();
        const staged = unwrapReply(await stores.runs.stageClaim(guard, command));
        if (setup.prepared.state.kind !== 'prepared') throw new Error('prepared fixture required');
        expect(staged.attempt).toMatchObject({
          revision: 3,
          state: { kind: 'claiming', session: setup.prepared.state.session },
          holdsCapacity: true,
        });
        const snapshot = await stores.runs.readRun(setup.run.runId);
        expect(snapshot.run.revision).toBe(4);
        expect(await stores.runs.stageClaim(guard, command)).toEqual({
          kind: 'duplicate',
          value: staged,
        });
        await rejects(
          stores.runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand({
              kind: 'session_prepared',
              locator: {
                ...setup.locator,
                session: { ...setup.locator.session, operationKey: operationKey('wrong') },
              },
              owner: setup.owner,
            }),
          ),
        );
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(snapshot);
        expect(
          await stores.runs.recordExecution(
            setup.guard,
            createExecutionCommand({ kind: 'recovery_required', reason: 'lost response' }),
          ),
        ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
      } finally {
        await stores.close();
      }
    });

    test('unknown effects and takeover retain capacity until determinate quiescence', async () => {
      const stores = await create();
      try {
        const setup = await prepareTurn(stores);

        unwrapReply(
          await stores.runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand({
              kind: 'recovery_required',
              reason: 'launch response lost',
            }),
          ),
        );
        const unknown = unwrapReply(
          await stores.runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand({
              kind: 'interrupted',
              quiescence: { ...setup.quiescence, effect: 'unknown' },
            }),
          ),
        );
        expect(unknown.state).toMatchObject({
          kind: 'unresolved',
          checkpoint: { kind: 'turn_pending', execution: setup.execution, turn: setup.turn.intent },
          observation: { kind: 'artifact', evidence: setup.quiescence.evidence },
        });
        expect(unknown.holdsCapacity).toBe(true);
        expect((await stores.runs.readRun(setup.run.runId)).capacity.reserved).toBe(1);
        const retry = { ...setup.admission, attemptId: attemptId('retry'), ordinal: 2 };
        expect(
          await stores.runs.admitAttempt(createRunGuard(await setup.currentGuard()), retry),
        ).toEqual({ kind: 'refused', reason: 'attempt_active' });
        const before = await stores.runs.readRun(setup.run.runId);
        stores.clock.advance(101);
        const owner = unwrapReply(
          await stores.runs.acquireOwnership(ownerId('successor'), setup.ownership.epoch),
        );
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
        expect(
          await stores.runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand(
              {
                kind: 'interrupted',
                quiescence: setup.quiescence,
              },
              'interrupt-command',
            ),
          ),
        ).toEqual({ kind: 'refused', reason: 'owner_stale' });
        const successor = { ...(await setup.currentGuard()), ownership: owner };
        expect(
          await stores.runs.recordExecution(
            successor,
            createExecutionCommand({
              kind: 'interrupted',
              quiescence: { ...setup.quiescence, operationKey: operationKey('wrong') },
            }),
          ),
        ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        const interrupted = unwrapReply(
          await stores.runs.recordExecution(
            successor,
            createExecutionCommand(
              {
                kind: 'interrupted',
                quiescence: setup.quiescence,
              },
              'interrupt-command',
            ),
          ),
        );
        expect(interrupted.state.kind).toBe('interrupted');
        expect(interrupted.holdsCapacity).toBe(false);
        const snapshot = await stores.runs.readRun(setup.run.runId);
        expect(snapshot.capacity.reserved).toBe(0);
        expect(
          await stores.runs.recordExecution(
            successor,
            createExecutionCommand(
              {
                kind: 'interrupted',
                quiescence: setup.quiescence,
              },
              'interrupt-command',
            ),
          ),
        ).toMatchObject({ kind: 'duplicate' });
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(snapshot);
        expect(
          await stores.runs.admitAttempt(
            { ...createRunGuard(successor), expectedRevision: snapshot.run.revision },
            { ...retry, identity: { ...retry.identity, operationKey: operationKey('different') } },
          ),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        expect(
          await stores.runs.admitAttempt(
            { ...createRunGuard(successor), expectedRevision: snapshot.run.revision },
            retry,
          ),
        ).toEqual({ kind: 'refused', reason: 'attempt_active' });
      } finally {
        await stores.close();
      }
    });

    test('waiting requires exact claim unique choices and determinate quiescence', async () => {
      const stores = await create();
      try {
        const setup = await prepareClaimed(stores);
        const wait = {
          version: 1 as const,
          correlationKey: 'question',
          prompt: setup.quiescence.evidence,
          choices: ['yes', 'no'],
        };
        const fact = { kind: 'waiting', wait, quiescence: setup.quiescence };
        expect(
          await stores.runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand(fact as ExecutionFact),
          ),
        ).toEqual({
          kind: 'refused',
          reason: 'state_conflict',
        });
        await stageFixtureTurn(setup);
        const guard = await setup.currentGuard();
        for (const choices of [[], ['yes', 'yes'], ['']])
          await rejects(
            stores.runs.recordExecution(
              guard,
              createExecutionCommand({
                ...fact,
                wait: { ...wait, choices },
              } as ExecutionFact),
            ),
          );
        expect(
          await stores.runs.recordExecution(
            guard,
            createExecutionCommand({
              ...fact,
              quiescence: { ...setup.quiescence, effect: 'unknown' },
            } as ExecutionFact),
          ),
        ).toEqual({ kind: 'refused', reason: 'state_conflict' });
        expect(
          unwrapReply(
            await stores.runs.recordExecution(guard, createExecutionCommand(fact as ExecutionFact)),
          ),
        ).toMatchObject({ state: { kind: 'waiting_for_person' }, holdsCapacity: false });
        expect((await stores.runs.readRun(setup.run.runId)).capacity.reserved).toBe(0);
        expect(
          await stores.runs.admitAttempt(createRunGuard(await setup.currentGuard()), {
            ...setup.admission,
            attemptId: attemptId('retry'),
            ordinal: 2,
          }),
        ).toEqual({ kind: 'refused', reason: 'attempt_active' });
      } finally {
        await stores.close();
      }
    });
  });
}
