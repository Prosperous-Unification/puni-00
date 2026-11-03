import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { decodeAdmission, ownerId } from '../runs/record-codecs';
import { organizationId } from '../runs/record-codecs';
import { openSqliteStores } from '../runs/sqlite/open-stores';
import { bootstrapSqliteStores } from '../runs/sqlite/open-stores';
import { createManifest, createRun, unwrapReply } from '../runs/testing/fixtures';
import { FixtureClock } from '../runs/testing/fixtures';
import { runCoordinatorContract } from '../runs/testing/run-coordinator-contract';
import { createRunCoordinator } from './run-coordinator';
import { materializeOrderedSteps, prepareCoordination } from './topology';

runCoordinatorContract('sqlite coordination', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ctt-coordination-'));
  const clock = new FixtureClock();
  const stores = await bootstrapSqliteStores({
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock,
    maxBusyAttempts: 10,
    busyDelayMilliseconds: 1,
  });
  return {
    ...stores,
    clock,
    async close() {
      await stores.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
});

test('SQLite reopen retains unfinished work and discards the previous coordinator tickets', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ctt-coordination-reopen-'));
  const clock = new FixtureClock();
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock,
    maxBusyAttempts: 10,
    busyDelayMilliseconds: 1,
  };
  const stores = await bootstrapSqliteStores(options);
  try {
    const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('owner'), 0));
    unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
    const run = unwrapReply(await stores.runs.createRun(ownership, createRun()));
    const steps = [
      { id: 'first', position: 0 },
      { id: 'second', position: 1 },
    ];
    const facts = {
      projectId: 'project',
      workItemId: 'work',
      steps,
      progress: [{ stepId: 'first', state: 'done' as const }],
      eligibleStepIds: ['second'],
    };
    const dag = prepareCoordination(materializeOrderedSteps('work', steps));
    const coordinator = await createRunCoordinator({
      dag,
      runs: stores.runs,
      runId: run.runId,
      readWbs: () => Promise.resolve(facts),
    });
    const [ticket] = await coordinator.ready();
    expect(ticket.vertexId).toBe('sn1.work.second');
    const admission = decodeAdmission({
      attemptId: 'second',
      identity: {
        version: 1,
        runId: run.runId,
        occurrenceId: 'sn1.work.second',
        operationKey: 'original',
      },
      ordinal: 1,
    });
    unwrapReply(
      await coordinator.admit(
        ticket,
        { ownership, runId: run.runId, expectedRevision: 0 },
        admission,
      ),
    );
    const before = await stores.runs.readRun(run.runId);
    await stores.close();
    const reopened = await openSqliteStores(options);
    try {
      const reconstructed = await createRunCoordinator({
        dag,
        runs: reopened.runs,
        runId: run.runId,
        readWbs: () => Promise.resolve(facts),
      });
      expect(await reconstructed.ready()).toEqual([]);
      expect(reconstructed.summary().completedWorkIds).toEqual(['sn1.work.first']);
      const rejected = await reconstructed.complete(ticket).then(
        () => false,
        () => true,
      );
      expect(reconstructed.summary().completedWorkIds).toEqual(['sn1.work.first']);
      expect(rejected).toBe(true);
      expect(await reopened.runs.readRun(run.runId)).toEqual(before);
      expect(before.capacity.reserved).toBe(1);
    } finally {
      await reopened.close();
    }
  } finally {
    await stores.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
