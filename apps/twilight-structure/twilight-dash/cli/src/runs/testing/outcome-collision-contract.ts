import { describe, expect, test } from 'bun:test';

import { attemptId, runId } from '../record-codecs';
import { recordOutcome } from '../record-outcome';
import { createCompletion, type OutcomeFixture, prepareTurn, unwrapReply } from './fixtures';

export function outcomeCollisionContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    test('completion command collisions across attempts refuse without releasing the other reservation', async () => {
      const stores = await create();
      try {
        const setup = await prepareTurn(stores);
        unwrapReply(
          await recordOutcome(
            stores.runs,
            stores.artifacts,
            await setup.currentGuard(),
            createCompletion(setup.claim, setup.quiescence),
          ),
        );
        const second = (await import('./fixtures')).createRun({
          runId: runId('second'),
          manifestDigest: setup.run.manifestDigest,
        });
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
        const claim = {
          ...setup.claim,
          runId: second.runId,
          attemptId: admission.attemptId,
        };
        const guard = {
          ownership: setup.ownership,
          runId: second.runId,
          expectedRevision: 1,
          attemptId: admission.attemptId,
          expectedAttemptRevision: 0,
        };
        const before = await stores.runs.readRun(second.runId);
        expect(before.capacity.reserved).toBe(1);
        expect(
          await recordOutcome(
            stores.runs,
            stores.artifacts,
            guard,
            createCompletion(setup.claim, setup.quiescence),
          ),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        expect(
          await recordOutcome(
            stores.runs,
            stores.artifacts,
            guard,
            createCompletion(claim, setup.quiescence),
          ),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        expect(await stores.runs.readRun(second.runId)).toEqual(before);
      } finally {
        await stores.close();
      }
    });
  });
}
