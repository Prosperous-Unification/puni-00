import { parseOrThrow } from '@shared/validation';
import { describe, expect, test } from 'bun:test';

import { CommandReceiptCodec, decodeAdmission, runId } from '../record-codecs';
import type { CommandReceipt } from '../records';
import { createCompletion, type OutcomeFixture, prepareTurn, unwrapReply } from './fixtures';

export async function prepareReceipt(stores: OutcomeFixture) {
  const setup = await prepareTurn(stores);
  const initial = createCompletion(setup.claim, setup.quiescence);
  const outcome = { ...initial.outcome, kind: 'failed' as const };
  const completion = createCompletion(setup.claim, setup.quiescence, {
    outcome,
    intent: { ...initial.intent, outcome },
    quiescence: setup.quiescence,
  });
  unwrapReply(await stores.runs.commitOutcome(await setup.currentGuard(), completion));
  const receipt: CommandReceipt = parseOrThrow(CommandReceiptCodec, {
    version: 2,
    commandId: completion.intent.commandId,
    commandDigest: completion.intent.commandDigest,
    claim: setup.claim,
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
        await stores.close();
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
          ...['commandId', 'requestDigest', 'runId', 'attemptId'].map((field) =>
            parseOrThrow(CommandReceiptCodec, {
              ...receipt,
              claim: {
                ...receipt.claim,
                [field]: field === 'requestDigest' ? 'a'.repeat(64) : 'wrong',
              },
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
          revision: 7,
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
        await stores.close();
      }
    });
    test('claimed failed predecessors refuse retry while historical receipts retain original replies', async () => {
      const stores = await create();
      try {
        const setup = await prepareReceipt(stores);
        const { runs, receipt } = setup;
        const guard = await setup.currentGuard();
        const terminal = unwrapReply(await runs.reconcileReceipt(guard, receipt));
        const next = decodeAdmission({ ...setup.admission, attemptId: 'next-attempt', ordinal: 2 });
        const before = await runs.readRun(setup.run.runId);
        expect(
          await runs.admitAttempt(
            {
              ownership: guard.ownership,
              runId: guard.runId,
              expectedRevision: before.run.revision,
            },
            next,
          ),
        ).toEqual({ kind: 'refused', reason: 'attempt_active' });
        expect(await runs.reconcileReceipt(guard, receipt)).toEqual({
          kind: 'duplicate',
          value: terminal,
        });
        expect(
          await runs.reconcileReceipt({ ...guard, attemptId: next.attemptId }, receipt),
        ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        expect(await runs.commitOutcome(guard, setup.completion)).toEqual({
          kind: 'duplicate',
          value: terminal,
        });
        const history = await runs.readExecutionHistory(setup.run.runId, setup.admission.attemptId);
        expect(history.completion?.reply.state.kind).toBe('outcome_pending_progress');
        expect(history.receipt?.reply).toEqual(terminal);
        expect(await runs.readRun(setup.run.runId)).toEqual(before);
      } finally {
        await stores.close();
      }
    });
  });
}
