import { doesNotReject } from 'node:assert/strict';

import { describe, expect, test } from 'bun:test';

import { ownerId, runId } from '../record-codecs';
import type { ExecutionCommand } from '../records';
import {
  createExecutionCommand,
  createRun,
  type OutcomeFixture,
  prepareTurn,
  unwrapReply,
} from './fixtures';

export function executionCommandContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    test('execution command identities distinguish reattachment from original redelivery', async () => {
      const stores = await create();
      try {
        const setup = await prepareTurn(stores);
        const history = await stores.runs.readExecutionHistory(
          setup.run.runId,
          setup.admission.attemptId,
        );
        const first = history.executions.at(0);
        if (first?.command.kind !== 'execution') throw new Error('expected original preparation');
        const claimed = first.command;
        const original = setup.preparedIntent;
        expect(
          await stores.runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand(claimed.fact, 'another-preparation'),
          ),
        ).toEqual({ kind: 'refused', reason: 'state_conflict' });
        const locator = setup.locator;
        const launch = setup.opened;
        const launchGuard = setup.guard;
        const launched = setup.prepared;
        unwrapReply(
          await stores.runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand(
              { kind: 'recovery_required', reason: 'coordinator restarted' },
              'recovery-command',
            ),
          ),
        );
        const recovery = await stores.runs.readRun(setup.run.runId);
        const reattachGuard = await setup.currentGuard();
        expect(
          await stores.runs.recordExecution(reattachGuard, {
            ...launch,
            commandId: 'reattach-command',
            fact: {
              kind: 'session_reattached',
              locator: { ...locator, session: { ...locator.session, sessionId: 'wrong-session' } },
              owner: setup.owner,
              evidence: setup.quiescence.evidence,
            },
          } as ExecutionCommand),
        ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        const reattached = unwrapReply(
          await stores.runs.recordExecution(reattachGuard, {
            ...launch,
            commandId: 'reattach-command',
            fact: {
              kind: 'session_reattached',
              locator,
              owner: setup.owner,
              evidence: setup.quiescence.evidence,
            },
          } as ExecutionCommand),
        );
        expect(reattached.state).toEqual({
          kind: 'turn_pending',
          execution: {
            ...setup.execution,
            session: {
              ...setup.execution.session,
              attachment: {
                version: 1,
                kind: 'reattached',
                owner: setup.owner,
                evidence: setup.quiescence.evidence,
              },
            },
          },
          turn: setup.turn.intent,
        });
        expect(reattached.revision).toBe(7);
        const current = await stores.runs.readRun(setup.run.runId);
        expect(current.run.revision).toBe(recovery.run.revision + 1);
        expect(await stores.runs.recordExecution(launchGuard, launch)).toEqual({
          kind: 'duplicate',
          value: launched,
        });
        expect(await stores.runs.recordExecution(setup.guard, claimed)).toEqual({
          kind: 'duplicate',
          value: original,
        });
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(current);
        expect(
          await stores.runs.recordExecution(reattachGuard, {
            version: 2,
            kind: 'execution',
            commandId: 'opened',
            fact: { kind: 'recovery_required', reason: 'changed' },
          } as ExecutionCommand),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        expect(
          await stores.runs.recordExecution(launchGuard, {
            ...launch,
            commandId: 'fresh-command',
          } as ExecutionCommand),
        ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
        expect(
          await stores.runs.recordExecution(
            { ...setup.guard, attemptId: 'absent' } as typeof setup.guard,
            claimed,
          ),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        expect(await stores.runs.readRun(setup.run.runId)).toEqual(current);
        const second = createRun({
          runId: runId('second'),
          manifestDigest: setup.run.manifestDigest,
        });
        unwrapReply(await stores.runs.createRun(setup.ownership, second));
        expect(
          await stores.runs.recordExecution({ ...setup.guard, runId: second.runId }, claimed),
        ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        const crossExecution = stores.runs.recordExecution(
          { ...(await setup.currentGuard()), runId: second.runId },
          createExecutionCommand({ kind: 'recovery_required', reason: 'cross-run' }),
        );
        await doesNotReject(crossExecution);
        expect(await crossExecution).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        const crossCompletion = stores.runs.commitOutcome(
          { ...(await setup.currentGuard()), runId: second.runId },
          (await import('./fixtures')).createCompletion(setup.claim, setup.quiescence),
        );
        await doesNotReject(crossCompletion);
        expect(await crossCompletion).toEqual({ kind: 'refused', reason: 'identity_conflict' });
        stores.clock.advance(101);
        unwrapReply(
          await stores.runs.acquireOwnership(ownerId('successor'), setup.ownership.epoch),
        );
        expect(await stores.runs.recordExecution(setup.guard, claimed)).toEqual({
          kind: 'refused',
          reason: 'owner_stale',
        });
      } finally {
        stores.close();
      }
    });
  });
}
