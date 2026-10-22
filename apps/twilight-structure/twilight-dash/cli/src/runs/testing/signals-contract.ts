import { parseOrThrow } from '@shared/validation';
import { describe, expect, test } from 'bun:test';

import {
  DecisionCodec,
  decodeAdmission,
  decodeExecutionFact,
  ownerId,
  runId,
} from '../record-codecs';
import type { Decision } from '../records';
import {
  createExecutionCommand,
  createManifest,
  createRun,
  type OutcomeFixture,
  prepareAttempt,
  unwrapReply,
} from './fixtures';

export async function prepareWait(stores: OutcomeFixture) {
  const setup = await prepareAttempt(stores);
  unwrapReply(
    await stores.runs.recordExecution(
      setup.guard,
      createExecutionCommand({ kind: 'claim_acquired', claim: setup.claim }),
    ),
  );
  const command = createExecutionCommand(
    decodeExecutionFact({
      kind: 'waiting',
      claim: setup.claim,
      wait: {
        version: 1,
        correlationKey: 'wait-1',
        prompt: setup.quiescence.evidence,
        choices: ['yes', 'no'],
      },
      quiescence: setup.quiescence,
    }),
    'wait-command',
  );
  const waiting = unwrapReply(
    await stores.runs.recordExecution(await setup.currentGuard(), command),
  );
  const decision: Decision = parseOrThrow(DecisionCodec, {
    version: 1,
    decisionId: 'decision',
    attemptId: setup.admission.attemptId,
    correlationKey: 'wait-1',
    choice: 'yes',
    actorId: 'actor',
    authorizationEvidence: setup.quiescence.evidence,
  });
  return { ...setup, command, waiting, decision };
}
export function signalsContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    test('decision operations exist as semantic methods', async () => {
      const stores = await create();
      try {
        expect(typeof stores.runs.receiveDecision).toBe('function');
        expect(typeof stores.runs.consumeDecision).toBe('function');
      } finally {
        stores.close();
      }
    });
    test('decisions retain complete identity and consume only the exact wait once', async () => {
      const stores = await create();
      try {
        const setup = await prepareWait(stores);
        const { runs, ownership, decision } = setup;
        expect(await runs.receiveDecision(ownership, decision)).toEqual({
          kind: 'applied',
          value: decision,
        });
        expect(await runs.receiveDecision(ownership, decision)).toEqual({
          kind: 'duplicate',
          value: decision,
        });
        const competing = {
          ...decision,
          decisionId: parseOrThrow(DecisionCodec, { ...decision, decisionId: 'competing' })
            .decisionId,
        };
        unwrapReply(await runs.receiveDecision(ownership, competing));
        const before = await runs.readRun(setup.run.runId);
        for (const changed of [
          {
            ...decision,
            actorId: parseOrThrow(DecisionCodec, { ...decision, actorId: 'other' }).actorId,
          },
          { ...decision, choice: 'no' },
        ])
          expect(await runs.receiveDecision(ownership, changed)).toEqual({
            kind: 'refused',
            reason: 'identity_conflict',
          });
        for (const changed of [
          {
            ...decision,
            decisionId: parseOrThrow(DecisionCodec, {
              ...decision,
              decisionId: 'wrong-correlation',
            }).decisionId,
            correlationKey: parseOrThrow(DecisionCodec, { ...decision, correlationKey: 'wrong' })
              .correlationKey,
          },
          {
            ...decision,
            decisionId: parseOrThrow(DecisionCodec, { ...decision, decisionId: 'wrong-choice' })
              .decisionId,
            choice: 'bad',
          },
        ])
          expect((await runs.receiveDecision(ownership, changed)).kind).toBe('refused');
        expect(await runs.readRun(setup.run.runId)).toEqual(before);
        const guard = await setup.currentGuard();
        expect(
          await runs.consumeDecision({ ...guard, expectedAttemptRevision: 0 }, decision.decisionId),
        ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
        const resumed = unwrapReply(await runs.consumeDecision(guard, decision.decisionId));
        expect(resumed).toMatchObject({
          attemptId: setup.admission.attemptId,
          ordinal: 1,
          state: { kind: 'queued', claim: setup.claim },
          holdsCapacity: true,
          revision: 3,
        });
        const after = await runs.readRun(setup.run.runId);
        expect(after.consumedDecisionIds).toEqual([decision.decisionId]);
        expect(after.pendingIntents).toEqual([]);
        expect(after.capacity.reserved).toBe(1);
        expect(await runs.consumeDecision(guard, decision.decisionId)).toEqual({
          kind: 'duplicate',
          value: resumed,
        });
        expect(await runs.receiveDecision(ownership, decision)).toEqual({
          kind: 'duplicate',
          value: decision,
        });
        expect(
          await runs.consumeDecision(await setup.currentGuard(), competing.decisionId),
        ).toEqual({ kind: 'refused', reason: 'decision_conflict' });
        expect(await runs.readRun(setup.run.runId)).toEqual(after);
      } finally {
        stores.close();
      }
    });
    test('old consumption preserves its original reply through later waits and owner takeover', async () => {
      const stores = await create();
      try {
        const setup = await prepareWait(stores);
        const { runs, decision } = setup;
        unwrapReply(await runs.receiveDecision(setup.ownership, decision));
        const guard = await setup.currentGuard();
        const original = unwrapReply(await runs.consumeDecision(guard, decision.decisionId));
        expect(
          await runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand(setup.command.fact),
          ),
        ).toEqual({ kind: 'refused', reason: 'decision_conflict' });
        const next = createExecutionCommand(
          decodeExecutionFact({
            ...setup.command.fact,
            wait: {
              version: 1,
              correlationKey: 'wait-2',
              prompt: setup.quiescence.evidence,
              choices: ['yes', 'no'],
            },
          }),
        );
        unwrapReply(await runs.recordExecution(await setup.currentGuard(), next));
        const before = await runs.readRun(setup.run.runId);
        expect(await runs.consumeDecision(guard, decision.decisionId)).toEqual({
          kind: 'duplicate',
          value: original,
        });
        expect(await runs.recordExecution(guard, setup.command)).toEqual({
          kind: 'duplicate',
          value: setup.waiting,
        });
        expect(
          await runs.consumeDecision({ ...guard, runId: runId('other-run') }, decision.decisionId),
        ).toEqual({ kind: 'refused', reason: 'decision_conflict' });
        stores.clock.advance(101);
        const owner = unwrapReply(
          await runs.acquireOwnership(ownerId('new-owner'), setup.ownership.epoch),
        );
        expect(await runs.consumeDecision(guard, decision.decisionId)).toEqual({
          kind: 'refused',
          reason: 'owner_stale',
        });
        expect(
          await runs.consumeDecision({ ...guard, ownership: owner }, decision.decisionId),
        ).toEqual({ kind: 'duplicate', value: original });
        expect(await runs.readRun(setup.run.runId)).toEqual(before);
      } finally {
        stores.close();
      }
    });
    test('capacity refusal leaves decision unconsumed until another run settles', async () => {
      const stores = await create();
      try {
        const setup = await prepareWait(stores);
        const { runs, ownership, decision } = setup;
        unwrapReply(await runs.receiveDecision(ownership, decision));
        const run = createRun({ runId: runId('other-run') });
        unwrapReply(await runs.retainManifest(ownership, createManifest()));
        unwrapReply(await runs.createRun(ownership, run));
        const admission = decodeAdmission({
          attemptId: 'other-attempt',
          identity: {
            version: 1,
            runId: run.runId,
            occurrenceId: 'other',
            operationKey: 'other-operation',
          },
          ordinal: 1,
        });
        unwrapReply(
          await runs.admitAttempt({ ownership, runId: run.runId, expectedRevision: 0 }, admission),
        );
        const guard = await setup.currentGuard();
        const before = await runs.readRun(setup.run.runId);
        expect(await runs.consumeDecision(guard, decision.decisionId)).toEqual({
          kind: 'refused',
          reason: 'capacity_full',
        });
        expect(await runs.readRun(setup.run.runId)).toEqual(before);
        unwrapReply(
          await runs.recordExecution(
            {
              ownership,
              runId: run.runId,
              expectedRevision: 1,
              attemptId: admission.attemptId,
              expectedAttemptRevision: 0,
            },
            createExecutionCommand({
              kind: 'interrupted',
              quiescence: { ...setup.quiescence, operationKey: admission.identity.operationKey },
            }),
          ),
        );
        expect((await runs.consumeDecision(guard, decision.decisionId)).kind).toBe('applied');
        expect((await runs.readRun(setup.run.runId)).capacity.reserved).toBe(1);
      } finally {
        stores.close();
      }
    });
  });
}
