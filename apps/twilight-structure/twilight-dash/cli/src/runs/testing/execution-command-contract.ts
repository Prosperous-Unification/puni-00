import { doesNotReject } from 'node:assert/strict';

import { describe, expect, test } from 'bun:test';

import { operationKey, ownerId, runId } from '../record-codecs';
import type { ExecutionCommand } from '../records';
import {
  createExecutionCommand,
  createRun,
  type OutcomeFixture,
  prepareAttempt,
  unwrapReply,
} from './fixtures';

export function executionCommandContract(name: string, create: () => Promise<OutcomeFixture>) {
  describe(name, () => {
    test('execution command identities distinguish reattachment from original redelivery', async () => {
      const stores = await create();
      try {
        const setup = await prepareAttempt(stores);
        const claimed = {
          commandId: 'claim-command',
          fact: { kind: 'claim_acquired', claim: setup.claim },
        } as ExecutionCommand;
        const original = unwrapReply(await stores.runs.recordExecution(setup.guard, claimed));
        expect(
          await stores.runs.recordExecution(await setup.currentGuard(), {
            ...claimed,
            commandId: 'another-claim',
          } as ExecutionCommand),
        ).toEqual({ kind: 'refused', reason: 'state_conflict' });
        const locator = {
          version: 1 as const,
          workerId: 'worker',
          sessionId: 'session',
          operationKey: operationKey('operation'),
        };
        const launch = {
          commandId: 'launch-command',
          fact: { kind: 'launch_recorded', claim: setup.claim, locator },
        } as ExecutionCommand;
        const launchGuard = await setup.currentGuard();
        const launched = unwrapReply(await stores.runs.recordExecution(launchGuard, launch));
        unwrapReply(
          await stores.runs.recordExecution(await setup.currentGuard(), {
            commandId: 'recovery-command',
            fact: { kind: 'recovery_required', reason: 'coordinator restarted' },
          } as ExecutionCommand),
        );
        const recovery = await stores.runs.readRun(setup.run.runId);
        const reattachGuard = await setup.currentGuard();
        expect(
          await stores.runs.recordExecution(reattachGuard, {
            ...launch,
            commandId: 'reattach-command',
            fact: { ...launch.fact, locator: { ...locator, sessionId: 'wrong-session' } },
          } as ExecutionCommand),
        ).toEqual({ kind: 'refused', reason: 'authority_conflict' });
        const reattached = unwrapReply(
          await stores.runs.recordExecution(reattachGuard, {
            ...launch,
            commandId: 'reattach-command',
          } as ExecutionCommand),
        );
        expect(reattached.state).toEqual({ kind: 'running', claim: setup.claim, locator });
        expect(reattached.revision).toBe(4);
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
            commandId: 'launch-command',
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
        const second = createRun({ runId: runId('second') });
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
