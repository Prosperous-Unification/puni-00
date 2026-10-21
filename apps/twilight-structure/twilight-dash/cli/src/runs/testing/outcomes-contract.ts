import { rejects } from 'node:assert/strict';

import { parseOrThrow } from '@shared/validation';
import { describe, expect, test } from 'bun:test';

import {
  artifactDigest,
  attemptId,
  ClaimAuthorityCodec,
  operationKey,
  ownerId,
  runId,
} from '../record-codecs';
import { recordOutcome } from '../record-outcome';
import type { Completion, ExecutionFact } from '../records';
import type { AttemptGuard } from '../run-store';
import { createExecutionCommand } from './fixtures';
import { createCompletion, type OutcomeFixture, prepareAttempt, unwrapReply } from './fixtures';

const decodeClaimAuthority = (value: unknown) => parseOrThrow(ClaimAuthorityCodec, value);

function runGuard(guard: AttemptGuard) {
  return {
    ownership: guard.ownership,
    runId: guard.runId,
    expectedRevision: guard.expectedRevision,
  };
}

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
        expect(await stores.runs.admitAttempt(runGuard(await setup.currentGuard()), retry)).toEqual(
          { kind: 'refused', reason: 'attempt_active' },
        );
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
            { ...runGuard(successor), expectedRevision: snapshot.run.revision },
            { ...retry, identity: { ...retry.identity, operationKey: operationKey('different') } },
          ),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        expect(
          unwrapReply(
            await stores.runs.admitAttempt(
              { ...runGuard(successor), expectedRevision: snapshot.run.revision },
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
          await stores.runs.admitAttempt(runGuard(await setup.currentGuard()), {
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

export function outcomeContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    test('completion commits one immutable pending intent with outcome and releases capacity exactly once', async () => {
      const stores = await create();
      try {
        expect(typeof stores.runs.commitOutcome).toBe('function');
        const setup = await prepareAttempt(stores);
        const completion = createCompletion(setup.claim, setup.quiescence);
        expect(await recordOutcome(stores.runs, stores.artifacts, setup.guard, completion)).toEqual(
          { kind: 'refused', reason: 'state_conflict' },
        );
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
        const pending = unwrapReply(
          await recordOutcome(stores.runs, stores.artifacts, guard, completion),
        );
        expect(pending).toMatchObject({
          revision: 2,
          holdsCapacity: false,
          state: {
            kind: 'outcome_pending_progress',
            outcome: completion.outcome,
            commandId: 'command',
          },
        });
        const snapshot = await stores.runs.readRun(setup.run.runId);
        expect(snapshot.run.revision).toBe(3);
        expect(snapshot.pendingIntents).toEqual([completion.intent]);
        expect(snapshot.capacity.reserved).toBe(0);
        expect(await recordOutcome(stores.runs, stores.artifacts, guard, completion)).toMatchObject(
          { kind: 'duplicate' },
        );
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(snapshot);
        expect(
          await stores.runs.admitAttempt(runGuard(await setup.currentGuard()), {
            ...setup.admission,
            attemptId: attemptId('retry'),
            ordinal: 2,
          }),
        ).toEqual({ kind: 'refused', reason: 'attempt_active' });
        const altered = createCompletion(setup.claim, setup.quiescence, {
          outcome: { ...completion.outcome, summary: 'changed' },
          intent: { ...completion.intent, outcome: { ...completion.outcome, summary: 'changed' } },
        });
        expect(await recordOutcome(stores.runs, stores.artifacts, guard, altered)).toEqual({
          kind: 'refused',
          reason: 'identity_conflict',
        });
        expect(
          await stores.runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand({
              kind: 'recovery_required',
              reason: 'too late',
            }),
          ),
        ).toEqual({ kind: 'refused', reason: 'state_conflict' });
      } finally {
        stores.close();
      }
    });
    test('completion refuses stale revisions wrong authority outcome mismatch and unsettled effects without mutations', async () => {
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
        const guard = await setup.currentGuard();
        const completion = createCompletion(setup.claim, setup.quiescence);
        const before = await stores.runs.readRun(setup.run.runId);
        expect(
          await recordOutcome(
            stores.runs,
            stores.artifacts,
            { ...guard, expectedRevision: 0 },
            completion,
          ),
        ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
        expect(await recordOutcome(stores.runs, stores.artifacts, setup.guard, completion)).toEqual(
          { kind: 'refused', reason: 'revision_conflict' },
        );
        expect(
          await recordOutcome(
            stores.runs,
            stores.artifacts,
            { ...guard, expectedAttemptRevision: 99 },
            completion,
          ),
        ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
        const wrong = createCompletion(
          decodeClaimAuthority({ ...setup.claim, personId: 'intruder' }),
          setup.quiescence,
        );
        expect(await recordOutcome(stores.runs, stores.artifacts, guard, wrong)).toEqual({
          kind: 'refused',
          reason: 'authority_conflict',
        });
        const mismatch = createCompletion(setup.claim, setup.quiescence, {
          outcome: { ...completion.outcome, summary: 'different' },
        });
        expect(await recordOutcome(stores.runs, stores.artifacts, guard, mismatch)).toEqual({
          kind: 'refused',
          reason: 'identity_conflict',
        });
        for (const effect of ['unknown', 'failed', 'absent'] as const)
          expect(
            await recordOutcome(stores.runs, stores.artifacts, guard, {
              ...completion,
              quiescence: { ...completion.quiescence, effect },
            }),
          ).toEqual({ kind: 'refused', reason: 'state_conflict' });
        expect(
          await recordOutcome(stores.runs, stores.artifacts, guard, {
            ...completion,
            quiescence: { ...completion.quiescence, operationKey: operationKey('wrong') },
          }),
        ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        await rejects(
          recordOutcome(stores.runs, stores.artifacts, guard, {
            ...completion,
            intent: { ...completion.intent, commandDigest: artifactDigest('0'.repeat(64)) },
          }),
        );
        await rejects(
          recordOutcome(stores.runs, stores.artifacts, guard, {
            outcome: 'end of turn',
          } as unknown as Completion),
        );
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
      } finally {
        stores.close();
      }
    });
  });
}

export function executionEdgeContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    test('retry preserves the operation and stops at the immutable maximum even after repeated proven interruption', async () => {
      const stores = await create();
      try {
        const setup = await prepareAttempt(stores);
        for (const ordinal of [1, 2, 3]) {
          const identity =
            ordinal === 1 ? setup.admission.attemptId : attemptId(`attempt-${String(ordinal)}`);
          const snapshot = await stores.runs.readRun(setup.run.runId);
          const current = snapshot.attempts.find((attempt) => attempt.attemptId === identity);
          if (current === undefined) throw new Error('fixture attempt missing');
          const guard = {
            ...setup.guard,
            attemptId: identity,
            expectedRevision: snapshot.run.revision,
            expectedAttemptRevision: current.revision,
          };
          unwrapReply(
            await stores.runs.recordExecution(
              guard,
              createExecutionCommand({
                kind: 'interrupted',
                quiescence: setup.quiescence,
              }),
            ),
          );
          const after = await stores.runs.readRun(setup.run.runId);
          const admission = {
            ...setup.admission,
            attemptId: attemptId(`attempt-${String(ordinal + 1)}`),
            ordinal: ordinal + 1,
          };
          const reply = await stores.runs.admitAttempt(
            {
              ownership: setup.ownership,
              runId: setup.run.runId,
              expectedRevision: after.run.revision,
            },
            admission,
          );
          if (ordinal === 3) expect(reply).toEqual({ kind: 'refused', reason: 'retry_exhausted' });
          else
            expect(unwrapReply(reply)).toMatchObject({
              ordinal: ordinal + 1,
              identity: { operationKey: 'operation' },
              holdsCapacity: true,
            });
        }
        expect((await stores.runs.readRun(setup.run.runId)).capacity.reserved).toBe(0);
      } finally {
        stores.close();
      }
    });
    test('successful effects cannot retry and missing attempts throw without mutations', async () => {
      const stores = await create();
      try {
        const setup = await prepareAttempt(stores);
        await rejects(
          stores.runs.recordExecution(
            { ...setup.guard, attemptId: attemptId('absent') },
            createExecutionCommand({ kind: 'recovery_required', reason: 'lost' }),
          ),
          /attempt does not exist/,
        );
        await rejects(
          stores.runs.commitOutcome(
            { ...setup.guard, attemptId: attemptId('absent') },
            createCompletion(setup.claim, setup.quiescence),
          ),
          /attempt does not exist/,
        );
        unwrapReply(
          await stores.runs.recordExecution(
            setup.guard,
            createExecutionCommand({
              kind: 'interrupted',
              quiescence: { ...setup.quiescence, effect: 'succeeded' },
            }),
          ),
        );
        const snapshot = await stores.runs.readRun(setup.run.runId);
        expect(
          await stores.runs.admitAttempt(
            {
              ownership: setup.ownership,
              runId: setup.run.runId,
              expectedRevision: snapshot.run.revision,
            },
            { ...setup.admission, attemptId: attemptId('retry'), ordinal: 2 },
          ),
        ).toEqual({ kind: 'refused', reason: 'attempt_active' });
        expect(
          await stores.runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand({
              kind: 'recovery_required',
              reason: 'too late',
            }),
          ),
        ).toEqual({ kind: 'refused', reason: 'state_conflict' });
      } finally {
        stores.close();
      }
    });
    test('unresolved and recovery preserve the exact running locator and held reservation', async () => {
      const stores = await create();
      try {
        const setup = await prepareAttempt(stores);
        const locator = {
          version: 1 as const,
          operationKey: setup.admission.identity.operationKey,
          workerId: 'worker',
          sessionId: 'session',
        };
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
              kind: 'launch_recorded',
              claim: setup.claim,
              locator,
            }),
          ),
        );
        for (const fact of [
          { kind: 'recovery_required', reason: 'lost' },
          { kind: 'unresolved', reason: 'unknown effect', evidence: setup.quiescence.evidence },
        ] as const) {
          expect(
            unwrapReply(
              await stores.runs.recordExecution(
                await setup.currentGuard(),
                createExecutionCommand(fact),
              ),
            ),
          ).toMatchObject({ holdsCapacity: true, state: { claim: setup.claim, locator } });
        }
        const before = await stores.runs.readRun(setup.run.runId);
        stores.clock.advance(101);
        const owner = unwrapReply(
          await stores.runs.acquireOwnership(ownerId('successor'), setup.ownership.epoch),
        );
        const completion = createCompletion(setup.claim, setup.quiescence);
        expect(await stores.runs.commitOutcome(await setup.currentGuard(), completion)).toEqual({
          kind: 'refused',
          reason: 'owner_stale',
        });
        expect(
          await stores.runs.recordExecution(
            { ...setup.guard, runId: runId('absent') },
            createExecutionCommand({ kind: 'recovery_required', reason: 'lost' }),
          ),
        ).toEqual({ kind: 'refused', reason: 'owner_stale' });
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
        expect(
          (
            await recordOutcome(
              stores.runs,
              stores.artifacts,
              { ...(await setup.currentGuard()), ownership: owner },
              completion,
            )
          ).kind,
        ).toBe('applied');
      } finally {
        stores.close();
      }
    });
    for (const kind of ['failed', 'cancelled'] as const)
      test(`${kind} completion refuses unknown effect and permits settled failure`, async () => {
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
          const initial = createCompletion(setup.claim, setup.quiescence);
          const outcome = { ...initial.outcome, kind };
          const completion = createCompletion(setup.claim, setup.quiescence, {
            outcome,
            intent: { ...initial.intent, outcome },
            quiescence: setup.quiescence,
          });
          expect(
            await recordOutcome(stores.runs, stores.artifacts, await setup.currentGuard(), {
              ...completion,
              quiescence: { ...completion.quiescence, effect: 'unknown' },
            }),
          ).toEqual({ kind: 'refused', reason: 'state_conflict' });
          expect(
            (
              await recordOutcome(
                stores.runs,
                stores.artifacts,
                await setup.currentGuard(),
                completion,
              )
            ).kind,
          ).toBe('applied');
          expect((await stores.runs.readRun(setup.run.runId)).capacity.reserved).toBe(0);
        } finally {
          stores.close();
        }
      });
  });
}

export function outcomeCollisionContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    test('completion command collisions across attempts refuse without releasing the other reservation', async () => {
      const stores = await create();
      try {
        const setup = await prepareAttempt(stores);
        unwrapReply(
          await stores.runs.recordExecution(
            setup.guard,
            createExecutionCommand({ kind: 'claim_acquired', claim: setup.claim }),
          ),
        );
        unwrapReply(
          await recordOutcome(
            stores.runs,
            stores.artifacts,
            await setup.currentGuard(),
            createCompletion(setup.claim, setup.quiescence),
          ),
        );
        const second = (await import('./fixtures')).createRun({ runId: runId('second') });
        unwrapReply(await stores.runs.createRun(setup.ownership, second));
        const admission = {
          ...setup.admission,
          attemptId: attemptId('second-attempt'),
          identity: { ...setup.admission.identity, runId: second.runId },
        };
        unwrapReply(
          await stores.runs.admitAttempt(
            { ownership: setup.ownership, runId: second.runId, expectedRevision: 0 },
            admission,
          ),
        );
        const claim = decodeClaimAuthority({
          ...setup.claim,
          runId: second.runId,
          attemptId: admission.attemptId,
        });
        const guard = {
          ownership: setup.ownership,
          runId: second.runId,
          expectedRevision: 1,
          attemptId: admission.attemptId,
          expectedAttemptRevision: 0,
        };
        unwrapReply(
          await stores.runs.recordExecution(
            guard,
            createExecutionCommand({ kind: 'claim_acquired', claim }),
          ),
        );
        const before = await stores.runs.readRun(second.runId);
        expect(
          await recordOutcome(
            stores.runs,
            stores.artifacts,
            { ...guard, expectedRevision: 2, expectedAttemptRevision: 1 },
            createCompletion(setup.claim, setup.quiescence),
          ),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        expect(
          await recordOutcome(
            stores.runs,
            stores.artifacts,
            { ...guard, expectedRevision: 2, expectedAttemptRevision: 1 },
            createCompletion(claim, setup.quiescence),
          ),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        expect(await stores.runs.readRun(second.runId)).toEqual(before);
      } finally {
        stores.close();
      }
    });
  });
}
