import { rejects } from 'node:assert/strict';

import { describe, expect, test } from 'bun:test';

import { attemptId, decodeClaimAuthority, operationKey, ownerId } from '../record-codecs';
import type { ExecutionFact } from '../records';
import { createExecutionCommand, createRunGuard } from './fixtures';
import { type OutcomeFixture, prepareAttempt, unwrapReply } from './fixtures';

export function executionContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    test('execution requires exact claim authority and matching operation', async () => {
      const stores = await create();
      try {
        expect(typeof stores.runs.recordExecution).toBe('function');
        const setup = await prepareAttempt(stores);
        const locator = {
          version: 1 as const,
          workerId: 'worker',
          sessionId: 'session',
          operationKey: operationKey('operation'),
        };
        const before = await stores.runs.readRun(setup.run.runId);
        expect(
          await stores.runs.recordExecution(
            setup.guard,
            createExecutionCommand({
              kind: 'launch_recorded',
              claim: setup.claim,
              locator,
            }),
          ),
        ).toEqual({ kind: 'refused', reason: 'state_conflict' });
        for (const field of [
          'runId',
          'attemptId',
          'projectId',
          'workItemId',
          'occurrenceId',
        ] as const) {
          const claim = decodeClaimAuthority({ ...setup.claim, [field]: 'wrong' });
          expect(
            await stores.runs.recordExecution(
              setup.guard,
              createExecutionCommand({ kind: 'claim_acquired', claim }, 'claim-command'),
            ),
          ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        }
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
        const claimed = unwrapReply(
          await stores.runs.recordExecution(
            setup.guard,
            createExecutionCommand(
              {
                kind: 'claim_acquired',
                claim: setup.claim,
              },
              'claim-command',
            ),
          ),
        );
        expect(claimed.revision).toBe(1);
        expect(claimed.state).toEqual({ kind: 'queued', claim: setup.claim });
        expect(
          await stores.runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand({
              kind: 'launch_recorded',
              claim: {
                ...setup.claim,
                claimId: decodeClaimAuthority({ ...setup.claim, claimId: 'wrong' }).claimId,
              },
              locator,
            }),
          ),
        ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        expect(
          await stores.runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand({
              kind: 'launch_recorded',
              claim: setup.claim,
              locator: { ...locator, operationKey: operationKey('wrong') },
            }),
          ),
        ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        const launched = unwrapReply(
          await stores.runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand({
              kind: 'launch_recorded',
              claim: setup.claim,
              locator,
            }),
          ),
        );
        expect(launched.state.kind).toBe('running');
        expect(launched.holdsCapacity).toBe(true);
        const snapshot = await stores.runs.readRun(setup.run.runId);
        expect(snapshot.run.revision).toBe(3);
        expect(
          await stores.runs.recordExecution(
            setup.guard,
            createExecutionCommand(
              {
                kind: 'claim_acquired',
                claim: setup.claim,
              },
              'claim-command',
            ),
          ),
        ).toMatchObject({ kind: 'duplicate' });
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(snapshot);
        expect(
          await stores.runs.recordExecution(
            setup.guard,
            createExecutionCommand({
              kind: 'recovery_required',
              reason: 'lost response',
            }),
          ),
        ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
      } finally {
        stores.close();
      }
    });

    test('unknown effects and takeover retain capacity until determinate quiescence', async () => {
      const stores = await create();
      try {
        const setup = await prepareAttempt(stores);
        unwrapReply(
          await stores.runs.recordExecution(
            setup.guard,
            createExecutionCommand(
              {
                kind: 'claim_acquired',
                claim: setup.claim,
              },
              'claim-command',
            ),
          ),
        );
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
          claim: setup.claim,
          locator: null,
          evidence: setup.quiescence.evidence,
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
          unwrapReply(
            await stores.runs.admitAttempt(
              { ...createRunGuard(successor), expectedRevision: snapshot.run.revision },
              retry,
            ),
          ),
        ).toMatchObject({ ordinal: 2, holdsCapacity: true });
      } finally {
        stores.close();
      }
    });

    test('waiting requires exact claim unique choices and determinate quiescence', async () => {
      const stores = await create();
      try {
        const setup = await prepareAttempt(stores);
        const wait = {
          version: 1 as const,
          correlationKey: 'question',
          prompt: setup.quiescence.evidence,
          choices: ['yes', 'no'],
        };
        const fact = { kind: 'waiting', claim: setup.claim, wait, quiescence: setup.quiescence };
        expect(
          await stores.runs.recordExecution(
            setup.guard,
            createExecutionCommand(fact as ExecutionFact),
          ),
        ).toEqual({
          kind: 'refused',
          reason: 'state_conflict',
        });
        unwrapReply(
          await stores.runs.recordExecution(
            setup.guard,
            createExecutionCommand(
              {
                kind: 'claim_acquired',
                claim: setup.claim,
              },
              'claim-command',
            ),
          ),
        );
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
        stores.close();
      }
    });
  });
}
