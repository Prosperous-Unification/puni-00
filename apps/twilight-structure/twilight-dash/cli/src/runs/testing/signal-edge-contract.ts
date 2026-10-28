import { doesNotReject, rejects } from 'node:assert/strict';

import { parseOrThrow } from '@shared/validation';
import { describe, expect, test } from 'bun:test';

import {
  attemptId,
  CommandReceiptCodec,
  DecisionCodec,
  decisionId,
  decodeAdmission,
  runId,
} from '../record-codecs';
import {
  createCompletion,
  createRun,
  type OutcomeFixture,
  stageFixtureTurn,
  unwrapReply,
} from './fixtures';
import { prepareReceipt } from './receipts-contract';
import { prepareWait } from './signals-contract';

export function signalEdgeContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    test('new inbox identities require current wait and legal correlation choice', async () => {
      const stores = await create();
      try {
        const setup = await prepareWait(stores);
        const before = await stores.runs.readRun(setup.run.runId);
        for (const decision of [
          parseOrThrow(DecisionCodec, { ...setup.decision, correlationKey: 'wrong' }),
          { ...setup.decision, choice: 'wrong' },
        ]) {
          const pending = stores.runs.receiveDecision(setup.ownership, decision);
          await doesNotReject(pending);
          expect(await pending).toEqual({ kind: 'refused', reason: 'decision_conflict' });
        }
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
        unwrapReply(await stores.runs.receiveDecision(setup.ownership, setup.decision));
        const guard = await setup.currentGuard();
        expect(
          await stores.runs.consumeDecision(
            { ...guard, expectedRevision: 0 },
            setup.decision.decisionId,
          ),
        ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
        await rejects(
          stores.runs.consumeDecision(guard, decisionId('missing')),
          /decision does not exist/,
        );
        const original = unwrapReply(
          await stores.runs.consumeDecision(guard, setup.decision.decisionId),
        );
        expect(
          await stores.runs.consumeDecision(
            { ...guard, attemptId: attemptId('other') },
            setup.decision.decisionId,
          ),
        ).toEqual({ kind: 'refused', reason: 'decision_conflict' });
        expect(
          await stores.runs.receiveDecision(setup.ownership, {
            ...setup.decision,
            decisionId: decisionId('fresh'),
          }),
        ).toEqual({ kind: 'refused', reason: 'decision_conflict' });
        expect(await stores.runs.consumeDecision(guard, setup.decision.decisionId)).toEqual({
          kind: 'duplicate',
          value: original,
        });
        stores.clock.advance(101);
        expect(await stores.runs.receiveDecision(setup.ownership, setup.decision)).toEqual({
          kind: 'refused',
          reason: 'owner_stale',
        });
      } finally {
        await stores.close();
      }
    });
    test('missing named attempts throw before inbox or receipt mutation', async () => {
      const stores = await create();
      try {
        const setup = await prepareReceipt(stores);
        const guard = await setup.currentGuard();
        const before = await stores.runs.readRun(setup.run.runId);
        const decision = parseOrThrow(DecisionCodec, {
          version: 1,
          decisionId: 'missing-target',
          attemptId: 'missing-attempt',
          correlationKey: 'missing',
          choice: 'yes',
          actorId: 'actor',
          authorizationEvidence: setup.quiescence.evidence,
        });
        await rejects(
          stores.runs.receiveDecision(setup.ownership, decision),
          /attempt does not exist/,
        );
        await rejects(
          stores.runs.reconcileReceipt(
            { ...guard, attemptId: attemptId('missing-attempt') },
            setup.receipt,
          ),
          /attempt does not exist/,
        );
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
      } finally {
        await stores.close();
      }
    });
    test('cross run and cross attempt consumption refuse before any reservation', async () => {
      const stores = await create();
      try {
        const setup = await prepareWait(stores);
        unwrapReply(await stores.runs.receiveDecision(setup.ownership, setup.decision));
        const second = createRun({
          runId: runId('second'),
          manifestDigest: setup.run.manifestDigest,
        });
        unwrapReply(await stores.runs.createRun(setup.ownership, second));
        const guard = await setup.currentGuard();
        const before = await stores.runs.readRun(setup.run.runId);
        expect(
          await stores.runs.consumeDecision(
            { ...guard, runId: second.runId },
            setup.decision.decisionId,
          ),
        ).toEqual({ kind: 'refused', reason: 'decision_conflict' });
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
      } finally {
        await stores.close();
      }
    });
    test('receipt state target revisions and expired owner cannot mutate a wait', async () => {
      const stores = await create();
      try {
        const setup = await prepareWait(stores);
        const completion = createCompletion(setup.claim, setup.quiescence);
        const receipt = parseOrThrow(CommandReceiptCodec, {
          version: 2,
          commandId: completion.intent.commandId,
          commandDigest: completion.intent.commandDigest,
          claim: setup.claim,
          acceptedWbsRevision: 'wbs-2',
          evidence: setup.quiescence.evidence,
        });
        const guard = await setup.currentGuard();
        const before = await stores.runs.readRun(setup.run.runId);
        const pending = stores.runs.reconcileReceipt(guard, receipt);
        await doesNotReject(pending);
        expect(await pending).toEqual({ kind: 'refused', reason: 'state_conflict' });
        expect(
          await stores.runs.reconcileReceipt({ ...guard, expectedAttemptRevision: 0 }, receipt),
        ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
        expect(
          await stores.runs.reconcileReceipt(guard, {
            ...receipt,
            claim: { ...setup.claim, attemptId: attemptId('other') },
          }),
        ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        stores.clock.advance(101);
        expect(await stores.runs.reconcileReceipt(guard, receipt)).toEqual({
          kind: 'refused',
          reason: 'owner_stale',
        });
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
      } finally {
        await stores.close();
      }
    });
    for (const scenario of [
      { kind: 'failed', effect: 'absent', reason: 'attempt_active' },
      { kind: 'failed', effect: 'failed', reason: 'attempt_active' },
      { kind: 'failed', effect: 'succeeded', reason: 'attempt_active' },
      { kind: 'cancelled', effect: 'failed', reason: 'attempt_active' },
      { kind: 'succeeded', effect: 'succeeded', reason: 'attempt_active' },
    ] as const)
      test(`accepted ${scenario.kind} with ${scenario.effect} effect retry policy`, async () => {
        const stores = await create();
        try {
          const setup = await prepareWait(stores);
          unwrapReply(await stores.runs.receiveDecision(setup.ownership, setup.decision));
          unwrapReply(
            await stores.runs.consumeDecision(
              await setup.currentGuard(),
              setup.decision.decisionId,
            ),
          );
          await stageFixtureTurn(
            setup,
            { kind: 'decision', decisionId: setup.decision.decisionId },
            'continuation',
          );
          const initial = createCompletion(setup.claim, setup.quiescence);
          const outcome = { ...initial.outcome, kind: scenario.kind };
          const completion = createCompletion(setup.claim, setup.quiescence, {
            outcome,
            intent: { ...initial.intent, outcome },
            quiescence: { ...setup.quiescence, effect: scenario.effect },
          });
          unwrapReply(await stores.runs.commitOutcome(await setup.currentGuard(), completion));
          const admission = decodeAdmission({ ...setup.admission, attemptId: 'retry', ordinal: 2 });
          const pending = await stores.runs.readRun(setup.run.runId);
          expect(
            await stores.runs.admitAttempt(
              {
                ownership: setup.ownership,
                runId: setup.run.runId,
                expectedRevision: pending.run.revision,
              },
              admission,
            ),
          ).toEqual({ kind: 'refused', reason: 'attempt_active' });
          const receipt = parseOrThrow(CommandReceiptCodec, {
            version: 2,
            commandId: completion.intent.commandId,
            commandDigest: completion.intent.commandDigest,
            claim: setup.claim,
            acceptedWbsRevision: 'wbs-2',
            evidence: setup.quiescence.evidence,
          });
          unwrapReply(await stores.runs.reconcileReceipt(await setup.currentGuard(), receipt));
          const before = await stores.runs.readRun(setup.run.runId);
          const reply = await stores.runs.admitAttempt(
            {
              ownership: setup.ownership,
              runId: setup.run.runId,
              expectedRevision: before.run.revision,
            },
            admission,
          );
          expect(reply).toEqual({ kind: 'refused', reason: scenario.reason });
          expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
        } finally {
          await stores.close();
        }
      });
    test('receipt cross run guard cannot retarget a pending command', async () => {
      const stores = await create();
      try {
        const setup = await prepareReceipt(stores);
        const second = createRun({
          runId: runId('second'),
          manifestDigest: setup.run.manifestDigest,
        });
        unwrapReply(await stores.runs.createRun(setup.ownership, second));
        const guard = await setup.currentGuard();
        const before = await stores.runs.readRun(setup.run.runId);
        const pending = stores.runs.reconcileReceipt(
          { ...guard, runId: second.runId, expectedRevision: 0 },
          setup.receipt,
        );
        await doesNotReject(pending);
        expect(await pending).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
      } finally {
        await stores.close();
      }
    });
    test('historical receipt retries refuse changed evidence or authority and expired owner', async () => {
      const stores = await create();
      try {
        const setup = await prepareReceipt(stores);
        const guard = await setup.currentGuard();
        unwrapReply(await stores.runs.reconcileReceipt(guard, setup.receipt));
        const before = await stores.runs.readRun(setup.run.runId);
        for (const receipt of [
          { ...setup.receipt, evidence: { ...setup.receipt.evidence, mediaType: 'other' } },
          {
            ...setup.receipt,
            claim: { ...setup.claim, commandId: 'other' },
          },
        ])
          expect(await stores.runs.reconcileReceipt(guard, receipt)).toEqual({
            kind: 'refused',
            reason: 'authority_conflict',
          });
        stores.clock.advance(101);
        expect(await stores.runs.reconcileReceipt(guard, setup.receipt)).toEqual({
          kind: 'refused',
          reason: 'owner_stale',
        });
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
      } finally {
        await stores.close();
      }
    });
  });
}
