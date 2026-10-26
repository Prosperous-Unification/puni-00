import { rejects } from 'node:assert/strict';

import { describe, expect, test } from 'bun:test';

import { artifactDigest, attemptId, ownerId, runId } from '../record-codecs';
import { recordOutcome } from '../record-outcome';
import { createExecutionCommand } from './fixtures';
import {
  createCompletion,
  type OutcomeFixture,
  prepareAttempt,
  prepareTurn,
  unwrapReply,
} from './fixtures';

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
                quiescence: { ...setup.quiescence, effect: 'absent' },
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
            createCompletion(
              {
                version: 1,
                commandId: 'missing-claim',
                requestDigest: artifactDigest('a'.repeat(64)),
                runId: setup.run.runId,
                attemptId: setup.admission.attemptId,
              },
              setup.quiescence,
            ),
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
        const setup = await prepareTurn(stores);
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
          ).toMatchObject({
            holdsCapacity: true,
            state: {
              checkpoint: {
                kind: 'turn_pending',
                execution: setup.execution,
                turn: setup.turn.intent,
              },
            },
          });
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
          const setup = await prepareTurn(stores);
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
