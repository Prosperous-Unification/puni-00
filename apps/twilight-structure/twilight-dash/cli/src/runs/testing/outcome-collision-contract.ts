import { describe, expect, test } from 'bun:test';

import { attemptId, decodeClaimAuthority, runId } from '../record-codecs';
import { recordOutcome } from '../record-outcome';
import { createExecutionCommand } from './fixtures';
import { createCompletion, type OutcomeFixture, prepareAttempt, unwrapReply } from './fixtures';

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
