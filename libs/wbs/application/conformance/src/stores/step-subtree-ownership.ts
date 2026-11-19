import type { SubtreeCopy, SubtreeStore } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

type Attempt<Value> = { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly cause: unknown };
async function capture<Value>(operation: () => Promise<Value>): Promise<Attempt<Value>> {
  try { return { ok: true, value: await operation() }; }
  catch (cause: unknown) { return { ok: false, cause }; }
}

function leafCopy(fixture: StepCatalogueFixture, id: string, stepId: string) {
  const row = { ...workItemRow({ id, workPackageId: fixture.seed.workPackageId, name: id, position: 10 }) };
  const estimate = { workItemId: id, stepId, optimistic: 1, realistic: 2, pessimistic: 3 };
  const copy: SubtreeCopy = {
    rows: [row], estimates: [estimate], respaced: [], reparented: [],
    actuals: [], progress: [], measures: [], assignments: [], demands: [], dependencies: [],
    removedEstimates: [], removedActuals: [], removedProgress: [], removedMeasures: [],
  };
  return { copy, row, estimate };
}

async function prepareSubtree(fixture: StepCatalogueFixture) {
  const { source, port, seed } = fixture;
  const stepId = 'subtree-ownership-step';
  expect((await port.defineAndBindStep(seed.organizationId, {
    id: stepId, code: stepId, name: 'Subtree ownership', position: 10,
    defaultEstimateUnit: 'workdays', defaultAllowancePercent: 12.5,
  }, {
    bindingId: 'subtree-ownership-binding', scopeKind: 'project', scopeId: seed.projectId,
    workItemTypeId: null, position: 10,
  }, seed.stamp)).ok).toBe(true);
  expect((await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(({ stepId: id }) => id)).toEqual([stepId]);
  const healthy = leafCopy(fixture, 'subtree-ownership-healthy', stepId);
  await source.stores.subtrees.insertSubtree(healthy.copy, seed.stamp);
  expect(fixture.readEvidence().estimates).toEqual([healthy.estimate]);
  const healthyRows=await source.stores.workItems.listByWorkPackage(seed.workPackageId);
  expect(healthyRows.map(({ id }) => id)).toEqual([healthy.row.id]);
  const healthyRow=healthyRows.at(0);
  if(healthyRow===undefined)throw new Error('healthy subtree row is absent');
  await source.stores.workItems.remove([healthy.row.id], [], seed.stamp);
  expect(fixture.readEvidence().estimates).toEqual([]);
  expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual([]);
  return {stepId,healthyRow};
}

function expectClosed(attempt: Attempt<unknown>): void {
  expect(attempt.ok).toBe(false);
  if (attempt.ok) throw new Error('expired subtree write unexpectedly resolved');
  expect(attempt.cause).toBeInstanceOf(Error);
  if (!(attempt.cause instanceof Error)) throw attempt.cause;
  expect(attempt.cause.message).toContain('closed');
}

/** Real Source write queue and loans; no held-inflight cancellation or cleanup-fault claim. */
export const STEP_SUBTREE_OWNERSHIP_ASSERTIONS = [
  {
    caseId: 'stepCatalogue.factWrite:subtree-queued-payload-retention',
    async assert(fixture: StepCatalogueFixture) {
      const { source, port, seed } = fixture;
      const {stepId,healthyRow} = await prepareSubtree(fixture);
      const request = leafCopy(fixture, 'subtree-queued-original', stepId);
      const originalRow = {...structuredClone(healthyRow),id:request.row.id,name:request.row.name}, originalEstimate = structuredClone(request.estimate);
      const before = fixture.readEvidence();
      const catalogue = await port.readCatalogue(seed.organizationId);
      const dispatch: { pending?: Promise<Attempt<unknown>> } = {};
      const held = await capture(() => source.uow.run(() => {
        // capture invokes the actual public method synchronously while this real loan owns the queue.
        dispatch.pending = capture(() => source.stores.subtrees.insertSubtree(request.copy, seed.stamp));
        request.row.id = 'subtree-queued-mutated';
        request.row.name = 'Later caller name';
        request.estimate.workItemId = request.row.id;
        request.estimate.optimistic = 7;
        request.estimate.realistic = 8;
        request.estimate.pessimistic = 9;
        return Promise.resolve({ commit: false, value: 'holding loan released' });
      }));
      const pending = dispatch.pending;
      if (pending === undefined) {
        if (!held.ok) throw held.cause;
        throw new Error('actual public subtree was not dispatched');
      }
      const written = await pending;
      if (!held.ok && !written.ok) throw new AggregateError([held.cause, written.cause], 'holding loan and queued subtree failed', { cause: written.cause });
      if (!held.ok) throw held.cause;
      if (!written.ok) throw written.cause;
      expect(held.value).toBe('holding loan released');
      expect(request.row.id).toBe('subtree-queued-mutated');
      expect(fixture.readEvidence().estimates).toEqual([originalEstimate]);
      expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual([originalRow]);
      expect(await source.stores.workItems.findById(request.row.id)).toBeNull();
      expect(fixture.readEvidence().packageValues).toEqual(before.packageValues);
      expect(await port.readCatalogue(seed.organizationId)).toEqual(catalogue);
    },
  },
  {
    caseId: 'stepCatalogue.factWrite:subtree-borrowed-expiry',
    async assert(fixture: StepCatalogueFixture) {
      const { source, seed } = fixture;
      const { stepId } = await prepareSubtree(fixture);
      const request = leafCopy(fixture, 'subtree-expired-copy', stepId);
      const survivor = workItemRow({ id: 'subtree-expiry-committed', workPackageId: seed.workPackageId, name: 'Actual committed row', position: 20 });
      const retained = await source.uow.run(async ({ stores }) => {
        const healthy = leafCopy(fixture, 'subtree-borrowed-healthy', stepId);
        await stores.subtrees.insertSubtree(healthy.copy, seed.stamp);
        expect(await stores.estimates.listByWorkPackage(seed.workPackageId)).toEqual([healthy.estimate]);
        await stores.workItems.remove([healthy.row.id], [], seed.stamp);
        await stores.workItems.insert(survivor, [], seed.stamp);
        return { commit: true, value: stores.subtrees };
      });
      expect((await source.stores.workItems.listByWorkPackage(seed.workPackageId)).map(({ id }) => id)).toEqual([survivor.id]);
      const committed = fixture.readEvidence();
      expectClosed(await capture(() => retained.insertSubtree(request.copy, seed.stamp)));
      expect(fixture.readEvidence()).toEqual(committed);
      await source.uow.run(async ({ stores }) => {
        expect((await stores.workItems.listByWorkPackage(seed.workPackageId)).map(({ id }) => id)).toEqual([survivor.id]);
        expectClosed(await capture(() => retained.insertSubtree(request.copy, seed.stamp)));
        return { commit: true, value: undefined };
      });
      expect(fixture.readEvidence()).toEqual(committed);
    },
  },
  {
    caseId: 'stepCatalogue.factWrite:subtree-public-source-close',
    async assert(fixture: StepCatalogueFixture) {
      const { source, seed } = fixture;
      const { stepId } = await prepareSubtree(fixture);
      const request = leafCopy(fixture, 'subtree-after-close', stepId);
      const before = fixture.readEvidence();
      const retained: SubtreeStore = source.stores.subtrees;
      await fixture.close();
      expectClosed(await capture(() => retained.insertSubtree(request.copy, seed.stamp)));
      // Only detached pre-close evidence is inspected after the actual memoized close.
      expect(before.estimates).toEqual([]);
      expect(before.packageValues).toEqual([{
        workPackageId: seed.workPackageId, stepId, estimateUnit: 'workdays', allowanceBps: 1250, allowanceRevision: 0,
      }]);
    },
  },
] as const;
