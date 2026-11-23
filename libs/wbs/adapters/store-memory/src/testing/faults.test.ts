import { defineFault, recordFaultProof } from '@wbs/conformance';
import type { NewJournalEntry, PlanEvent, SavedPlanWrite, SubtreeCopy } from '@wbs/core';
import { seedLegacyPackageParent } from '@wbs/core/testing/legacy-package-source-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { describe, expect, it } from 'bun:test';

import { workPackageRow } from '../work-package-fixture';
import {
  memoryLateWriteControl,
  openMemoryFixtureWithFault,
  openMemorySourceWithFault,
} from './faults';

const entry = (id: string): NewJournalEntry => ({
  id,
  workPackageId: 'p1',
  userId: 'owner',
  personId: null,
  kind: 'estimate',
  payload: {},
  inverse: {},
  preconditions: {},
  createdAt: 1,
});
const event = (id: string): PlanEvent => ({
  id: `event-${id}`,
  workPackageId: 'p1',
  userId: 'owner',
  kind: 'estimate',
  label: id,
  workItemId: null,
  stepId: null,
  before: null,
  after: null,
  createdAt: 1,
});
const savedPlan = (id: string): SavedPlanWrite => ({
  id,
  workPackageId: 'p1',
  name: id,
  createdBy: 'Owner',
  createdById: null,
  createdAt: 1,
  input: { schemaVersion: 1, bytes: 'input', sha256: 'input-hash' },
  schedule: {
    present: true,
    body: { schemaVersion: 1, bytes: 'schedule', sha256: 'schedule-hash' },
    inputSha256: 'input-hash',
    algorithmId: 'test',
  },
});
const subtree = (id: string): SubtreeCopy => ({
  rows: [workItemRow({ id, workPackageId: 'p1' })],
  respaced: [],
  reparented: [],
  estimates: [{ workItemId: id, stepId: 'step-1', optimistic: 1, realistic: 2, pessimistic: 3 }],
  actuals: [],
  progress: [],
  measures: [],
  demands: [],
  assignments: [],
  dependencies: [],
  removedEstimates: [],
  removedActuals: [],
  removedProgress: [],
  removedMeasures: [],
});

async function openSubtreeSource(control: ReturnType<typeof memoryLateWriteControl>) {
  const fixture = openMemoryFixtureWithFault(control),
    source = fixture.source,
    stamp = { at: 1, by: 'owner' };
  try {
    await source.stores.users.create(
      { id: 'owner', username: 'Owner', passwordHash: null, createdAt: 1 },
      stamp,
    );
    seedLegacyPackageParent(fixture, {
      organizationId: 'subtree-org',
      projectId: 'subtree-project',
      creator: 'owner',
    });
    const defined = await source.stores.stepCatalogue.defineAndBindStep(
      'subtree-org',
      {
        id: 'step-1',
        code: 'dev',
        name: 'Dev',
        position: 10,
        defaultEstimateUnit: 'workdays',
        defaultAllowancePercent: 0,
      },
      {
        bindingId: 'subtree-dev',
        scopeKind: 'project',
        scopeId: 'subtree-project',
        workItemTypeId: null,
        position: 10,
      },
      stamp,
    );
    if (!defined.ok)
      throw new Error('subtree fixture definition refused: ' + JSON.stringify(defined));
    const born = await source.stores.workPackages.createWithSteps(
      workPackageRow({ id: 'p1', projectId: 'subtree-project' }),
      stamp,
      { kind: 'legacy' },
    );
    if (typeof born === 'string') throw new Error('subtree fixture birth refused: ' + born);
    return source;
  } catch (primary: unknown) {
    try {
      await source.close();
    } catch (cleanup: unknown) {
      throw new AggregateError([primary, cleanup], 'subtree fixture setup and close failed', {
        cause: cleanup,
      });
    }
    throw primary;
  }
}

describe('memory conformance fault controls', () => {
  it('arms a named staged-state write point per run', () => {
    const control = memoryLateWriteControl('subtree-final-satellite');

    // Proof: removing the arm guard failed here on `Expected: false; Received: true`.
    expect(control.reachStagedWrite('subtree-final-satellite')).toBe(false);
    control.arm();

    expect(control.reachStagedWrite('subtree-final-satellite')).toBe(true);
    expect(control.reached()).toBe(true);
    // Proof: removing the one-shot guard let this second arm return undefined.
    expect(() => {
      control.arm();
    }).toThrow('already armed');
  });

  it('does not accept a different staged-state phase', () => {
    const control = memoryLateWriteControl<'subtree-final-satellite' | 'journal-history-insert'>(
      'subtree-final-satellite',
    );
    control.arm();

    // Proof: ignoring phase identity returned true for journal-history-insert.
    expect(control.reachStagedWrite('journal-history-insert')).toBe(false);
    expect(control.reached()).toBe(false);
  });

  it('reports a different staged-state phase through the proof recorder', async () => {
    const fault = defineFault({
      id: 'break:journal.append:history-atomic:journal-late-outside',
      caseId: 'journal.append:history-atomic',
      createControl: () =>
        memoryLateWriteControl<'journal-history-insert' | 'saved-plan-schedule-body'>(
          'journal-history-insert',
        ),
      mutate: (subject: object) => subject,
    });
    const proof = await recordFaultProof(fault, {
      assertion: 'journal and history remain atomic',
      setup: (run) => Promise.resolve(run),
      exercise: (run) => {
        run.control.reachStagedWrite('saved-plan-schedule-body');
        return Promise.resolve();
      },
      assert: () => Promise.reject(new Error('unrelated saved-plan assertion')),
    });

    // Proof: ignoring phase identity returned `observed` from the unrelated
    // saved-plan assertion through the production proof recorder.
    expect(proof.kind).toBe('phase-failed');
  });

  it('reaches a journal late write inside the real staged source', async () => {
    const control = memoryLateWriteControl('journal-history-insert');
    const source = openMemorySourceWithFault(control);
    await source.uow.run(async ({ stores }) => {
      await stores.journal.append(entry('sentinel'), event('sentinel'));
      return { commit: true, value: undefined };
    });
    // Proof: disconnecting this reader from the journal history table returned [] here.
    expect((await source.journalHistoryFor('p1')).map(({ id }) => id)).toEqual(['event-sentinel']);
    control.arm();

    const write = source.uow.run(async ({ stores }) => {
      await stores.journal.append(entry('faulted'), event('faulted'));
      return { commit: true, value: undefined };
    });
    // Proof: disconnecting this staged seam resolved the write instead of rejecting.
    expect(write).rejects.toThrow('injected memory fault at journal-history-insert');
    await write.catch(() => undefined);

    expect(control.reached()).toBe(true);
    // Proof: moving the barrier before the history push returned [] here.
    expect(control.observedJournalEventIds()).toEqual(['event-faulted']);
    // Proof: committing the staged state from the rejection path added `faulted` here.
    expect(
      (
        await source.stores.journal.entriesFor({
          workPackageId: 'p1',
          userId: 'owner',
          personId: null,
        })
      ).map(({ id }) => id),
    ).toEqual(['sentinel']);
    expect((await source.journalHistoryFor('p1')).map(({ id }) => id)).toEqual(['event-sentinel']);
    const restored = openMemorySourceWithFault(memoryLateWriteControl('journal-history-insert'));
    await restored.uow.run(async ({ stores }) => {
      await stores.journal.append(entry('restored'), event('restored'));
      return { commit: true, value: undefined };
    });
    expect(
      (
        await restored.stores.journal.entriesFor({
          workPackageId: 'p1',
          userId: 'owner',
          personId: null,
        })
      ).map(({ id }) => id),
    ).toEqual(['restored']);
    expect((await restored.journalHistoryFor('p1')).map(({ id }) => id)).toEqual([
      'event-restored',
    ]);
  });

  it('reaches the final subtree write inside the real staged source', async () => {
    const control = memoryLateWriteControl('subtree-final-satellite');
    const source = await openSubtreeSource(control);
    const acquired = [source];
    try {
      const stamp = { at: 1, by: 'owner' };
      await source.uow.run(async ({ stores }) => {
        await stores.subtrees.insertSubtree(subtree('sentinel'), stamp);
        return { commit: true, value: undefined };
      });
      expect(await source.stores.estimates.listByWorkPackage('p1')).toEqual([
        ...subtree('sentinel').estimates,
      ]);
      control.arm();

      const write = source.uow.run(async ({ stores }) => {
        await stores.subtrees.insertSubtree(subtree('faulted'), stamp);
        return { commit: true, value: undefined };
      });
      // Proof: disconnecting this staged seam resolved the write instead of rejecting.
      expect(write).rejects.toThrow('injected memory fault at subtree-final-satellite');
      await write.catch(() => undefined);

      expect(control.reached()).toBe(true);
      // Proof: moving the barrier before the estimate write returned [] here.
      expect(control.observedSatelliteKeys()).toEqual(['faulted:step-1']);
      // Proof: committing the staged state from the rejection path added `faulted` here.
      expect((await source.stores.workItems.listByWorkPackage('p1')).map(({ id }) => id)).toEqual([
        'sentinel',
      ]);
      expect(await source.stores.estimates.listByWorkPackage('p1')).toEqual([
        ...subtree('sentinel').estimates,
      ]);
      const restored = await openSubtreeSource(memoryLateWriteControl('subtree-final-satellite'));
      acquired.push(restored);
      await restored.uow.run(async ({ stores }) => {
        await stores.subtrees.insertSubtree(subtree('restored'), stamp);
        return { commit: true, value: undefined };
      });
      expect((await restored.stores.workItems.listByWorkPackage('p1')).map(({ id }) => id)).toEqual(
        ['restored'],
      );
      expect(await restored.stores.estimates.listByWorkPackage('p1')).toEqual([
        ...subtree('restored').estimates,
      ]);
    } finally {
      await Promise.all(acquired.map((opened) => opened.close()));
    }
  });

  it('reaches the schedule body inside the real saved-plan write', async () => {
    const control = memoryLateWriteControl('saved-plan-schedule-body');
    const source = openMemorySourceWithFault(control);
    await source.history.savedPlans.write(savedPlan('sentinel'), () => Promise.resolve(null));
    control.arm();

    const write = source.history.savedPlans.write(savedPlan('faulted'), () =>
      Promise.resolve(null),
    );
    // Proof: disconnecting this saved-plan seam resolved the write instead of rejecting.
    expect(write).rejects.toThrow('injected memory fault at saved-plan-schedule-body');
    await write.catch(() => undefined);

    expect(control.reached()).toBe(true);
    // Proof: publishing before the late barrier added `faulted` to this list.
    expect((await source.history.savedPlans.listOf('p1')).map(({ id }) => id)).toEqual([
      'sentinel',
    ]);
    const restored = openMemorySourceWithFault(memoryLateWriteControl('saved-plan-schedule-body'));
    await restored.history.savedPlans.write(savedPlan('restored'), () => Promise.resolve(null));
    expect((await restored.history.savedPlans.listOf('p1')).map(({ id }) => id)).toEqual([
      'restored',
    ]);
  });
});
