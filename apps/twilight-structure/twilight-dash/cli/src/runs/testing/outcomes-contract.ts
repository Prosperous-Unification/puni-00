import { rejects } from 'node:assert/strict';

import { describe, expect, test } from 'bun:test';

import { artifactDigest, attemptId, operationKey } from '../record-codecs';
import { recordOutcome } from '../record-outcome';
import type { Completion } from '../records';
import { createExecutionCommand, createRunGuard } from './fixtures';
import {
  createCompletion,
  type OutcomeFixture,
  prepareClaimed,
  prepareTurn,
  stageFixtureTurn,
  unwrapReply,
} from './fixtures';

export function outcomeContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    test('completion commits one immutable pending intent with outcome and releases capacity exactly once', async () => {
      const stores = await create();
      try {
        expect(typeof stores.runs.commitOutcome).toBe('function');
        const setup = await prepareClaimed(stores);
        const completion = createCompletion(setup.claim, setup.quiescence);
        expect(
          await recordOutcome(
            stores.runs,
            stores.artifacts,
            await setup.currentGuard(),
            completion,
          ),
        ).toEqual({ kind: 'refused', reason: 'state_conflict' });
        await stageFixtureTurn(setup);
        const guard = await setup.currentGuard();
        const pending = unwrapReply(
          await recordOutcome(stores.runs, stores.artifacts, guard, completion),
        );
        expect(pending).toMatchObject({
          revision: 6,
          holdsCapacity: false,
          state: {
            kind: 'outcome_pending_progress',
            outcome: completion.outcome,
            commandId: 'command',
          },
        });
        const snapshot = await stores.runs.readRun(setup.run.runId);
        expect(snapshot.run.revision).toBe(7);
        expect(snapshot.pendingIntents).toEqual([completion.intent]);
        expect(snapshot.capacity.reserved).toBe(0);
        expect(await recordOutcome(stores.runs, stores.artifacts, guard, completion)).toMatchObject(
          { kind: 'duplicate' },
        );
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(snapshot);
        expect(
          await stores.runs.admitAttempt(createRunGuard(await setup.currentGuard()), {
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
        await stores.close();
      }
    });
    test('completion refuses stale revisions wrong claim outcome mismatch and unsettled effects without mutations', async () => {
      const stores = await create();
      try {
        const setup = await prepareTurn(stores);

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
        const wrong = createCompletion({ ...setup.claim, commandId: 'intruder' }, setup.quiescence);
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
        await stores.close();
      }
    });
  });
}
