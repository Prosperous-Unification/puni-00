import { parseOrThrow } from '@shared/validation';
import { describe, expect, test } from 'bun:test';

import { CommandReceiptCodec, decodeAdmission, runId } from '../record-codecs';
import type { CommandReceipt } from '../records';
import {
  createCompletion,
  createExecutionCommand,
  type OutcomeFixture,
  prepareAttempt,
  unwrapReply,
} from './fixtures';

export async function prepareReceipt(stores: OutcomeFixture) {
  const setup = await prepareAttempt(stores);
  unwrapReply(
    await stores.runs.recordExecution(
      setup.guard,
      createExecutionCommand({ kind: 'claim_acquired', claim: setup.claim }),
    ),
  );
  const initial = createCompletion(setup.claim, setup.quiescence);
  const outcome = { ...initial.outcome, kind: 'failed' as const };
  const completion = createCompletion(setup.claim, setup.quiescence, {
    outcome,
    intent: { ...initial.intent, outcome },
    quiescence: setup.quiescence,
  });
  unwrapReply(await stores.runs.commitOutcome(await setup.currentGuard(), completion));
  const receipt: CommandReceipt = parseOrThrow(CommandReceiptCodec, {
    version: 1,
    commandId: completion.intent.commandId,
    commandDigest: completion.intent.commandDigest,
    authority: setup.claim,
    acceptedWbsRevision: 'wbs-2',
    evidence: setup.quiescence.evidence,
  });
  return { ...setup, completion, receipt };
}
export function receiptsContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    test('receipt reconciliation exists as a semantic method', async () => {
      const stores = await create();
      try {
        expect(typeof stores.runs.reconcileReceipt).toBe('function');
      } finally {
        stores.close();
      }
    });
    test('only exact command authority can remove outbox and become terminal', async () => {
      const stores = await create();
      try {
        const setup = await prepareReceipt(stores);
        const { runs, receipt } = setup;
        const guard = await setup.currentGuard();
        const before = await runs.readRun(setup.run.runId);
        for (const changed of [
          parseOrThrow(CommandReceiptCodec, { ...receipt, commandId: 'wrong-command' }),
          {
            ...receipt,
            commandDigest: parseOrThrow(CommandReceiptCodec, {
              ...receipt,
              commandDigest: 'a'.repeat(64),
            }).commandDigest,
          },
          ...[
            'claimId',
            'personId',
            'agentRunId',
            'runId',
            'attemptId',
            'projectId',
            'workItemId',
            'occurrenceId',
          ].map((field) =>
            parseOrThrow(CommandReceiptCodec, {
              ...receipt,
              authority: { ...receipt.authority, [field]: 'wrong' },
            }),
          ),
        ])
          expect(await runs.reconcileReceipt(guard, changed)).toEqual({
            kind: 'refused',
            reason: 'authority_conflict',
          });
        expect(await runs.readRun(setup.run.runId)).toEqual(before);
        expect(await runs.reconcileReceipt({ ...guard, expectedRevision: 0 }, receipt)).toEqual({
          kind: 'refused',
          reason: 'revision_conflict',
        });
        const terminal = unwrapReply(await runs.reconcileReceipt(guard, receipt));
        expect(terminal).toMatchObject({
          revision: 3,
          state: { kind: 'terminal', receipt, outcome: { kind: 'failed' } },
          holdsCapacity: false,
        });
        const after = await runs.readRun(setup.run.runId);
        expect(after.pendingIntents).toEqual([]);
        expect(after.receipts).toEqual([receipt]);
        expect(await runs.reconcileReceipt(guard, receipt)).toEqual({
          kind: 'duplicate',
          value: terminal,
        });
        expect(
          await runs.reconcileReceipt(guard, { ...receipt, acceptedWbsRevision: 'different' }),
        ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        expect(await runs.reconcileReceipt({ ...guard, runId: runId('wrong') }, receipt)).toEqual({
          kind: 'refused',
          reason: 'authority_conflict',
        });
        expect(await runs.readRun(setup.run.runId)).toEqual(after);
      } finally {
        stores.close();
      }
    });
    test('failed accepted predecessors admit bounded retries while historical receipts retain original replies', async () => {
      const stores = await create();
      try {
        const setup = await prepareReceipt(stores);
        const { runs, receipt } = setup;
        const guard = await setup.currentGuard();
        const terminal = unwrapReply(await runs.reconcileReceipt(guard, receipt));
        const next = decodeAdmission({ ...setup.admission, attemptId: 'next-attempt', ordinal: 2 });
        unwrapReply(
          await runs.admitAttempt(
            { ownership: guard.ownership, runId: guard.runId, expectedRevision: 4 },
            next,
          ),
        );
        const before = await runs.readRun(setup.run.runId);
        expect(await runs.reconcileReceipt(guard, receipt)).toEqual({
          kind: 'duplicate',
          value: terminal,
        });
        expect(
          await runs.reconcileReceipt({ ...guard, attemptId: next.attemptId }, receipt),
        ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        expect(await runs.readRun(setup.run.runId)).toEqual(before);
        const claim = {
          ...setup.claim,
          attemptId: next.attemptId,
          personId: parseOrThrow(CommandReceiptCodec, {
            ...receipt,
            authority: { ...receipt.authority, personId: 'next-person' },
          }).authority.personId,
        };
        unwrapReply(
          await runs.recordExecution(
            {
              ...guard,
              expectedRevision: 5,
              attemptId: next.attemptId,
              expectedAttemptRevision: 0,
            },
            createExecutionCommand({ kind: 'claim_acquired', claim }),
          ),
        );
        const initial = createCompletion(claim, setup.quiescence);
        const completion = createCompletion(claim, setup.quiescence, {
          intent: {
            ...initial.intent,
            commandId: parseOrThrow(CommandReceiptCodec, {
              ...receipt,
              commandId: 'second-command',
            }).commandId,
          },
        });
        unwrapReply(
          await runs.commitOutcome(
            {
              ...guard,
              expectedRevision: 6,
              attemptId: next.attemptId,
              expectedAttemptRevision: 1,
            },
            completion,
          ),
        );
        const nextReceipt = {
          ...receipt,
          commandId: completion.intent.commandId,
          commandDigest: completion.intent.commandDigest,
          authority: claim,
        };
        unwrapReply(
          await runs.reconcileReceipt(
            {
              ...guard,
              expectedRevision: 7,
              attemptId: next.attemptId,
              expectedAttemptRevision: 2,
            },
            nextReceipt,
          ),
        );
        expect((await runs.readRun(setup.run.runId)).receipts).toHaveLength(2);
        expect(await runs.reconcileReceipt(guard, receipt)).toEqual({
          kind: 'duplicate',
          value: terminal,
        });
      } finally {
        stores.close();
      }
    });
  });
}
