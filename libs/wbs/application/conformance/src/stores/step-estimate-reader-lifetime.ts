import type { EstimateStore, StoredEstimate } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

type ReadAttempt<Value> =
  | { readonly ok: true; readonly rows: Value }
  | { readonly ok: false; readonly cause: unknown };

/** All three actual methods settle before any refusal oracle; an unexpected success remains observable. */
async function captureRead<Value>(read: () => Promise<Value>): Promise<ReadAttempt<Value>> {
  try {
    return { ok: true, rows: await read() };
  } catch (cause: unknown) {
    return { ok: false, cause };
  }
}

function expectClosed(attempt: ReadAttempt<unknown>): void {
  expect(attempt.ok).toBe(false);
  if (attempt.ok) throw new Error('expired estimate reader unexpectedly resolved');
  expect(attempt.cause).toBeInstanceOf(Error);
  if (!(attempt.cause instanceof Error)) throw attempt.cause;
  expect(attempt.cause.message).toContain('closed');
}

async function captureReaders(port: EstimateStore, workPackageId: string, workItemId: string, placedWorkItemId: string) {
  const full = await captureRead(() => port.listByWorkPackage(workPackageId));
  const targeted = await captureRead(() => port.listByWorkItems(workPackageId, [workItemId]));
  const placements = await captureRead(() => port.listPlacements(workPackageId, [placedWorkItemId]));
  return { full, targeted, placements };
}

/** Actual current definitions, explicit package values and facts precede every lifetime assertion. */
async function prepareReaderLifetime(fixture: StepCatalogueFixture) {
  const { source, port, seed } = fixture;
  const stepId = 'reader-lifetime-step';
  expect((await port.defineAndBindStep(seed.organizationId, {
    id: stepId, code: stepId, name: 'Reader lifetime', position: 10,
    defaultEstimateUnit: 'minutes', defaultAllowancePercent: 12.5,
  }, {
    bindingId: 'reader-lifetime-binding', scopeKind: 'project', scopeId: seed.projectId,
    workItemTypeId: null, position: 10,
  }, seed.stamp)).ok).toBe(true);
  expect((await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(({ stepId: id }) => id)).toEqual([stepId]);
  const first: StoredEstimate = {
    workItemId: 'reader-lifetime-a', stepId, optimistic: 1, realistic: 2, pessimistic: 3,
  };
  const second: StoredEstimate = {
    workItemId: 'reader-lifetime-b', stepId, optimistic: 4, realistic: 5, pessimistic: 6,
  };
  for (const estimate of [second, first]) {
    await source.stores.workItems.insert(workItemRow({
      id: estimate.workItemId, workPackageId: seed.workPackageId,
      name: estimate.workItemId, position: estimate === first ? 10 : 20,
    }), [], seed.stamp);
    expect(await source.stores.estimates.set(estimate, seed.stamp)).toBe('written');
  }
  const expected = [first, second];
  expect(fixture.readEvidence().estimates).toEqual(expected);
  const before = fixture.readEvidence();
  const full = await source.stores.estimates.listByWorkPackage(seed.workPackageId);
  const targeted = await source.stores.estimates.listByWorkItems(seed.workPackageId, [first.workItemId]);
  expect(full).toEqual(expected);
  expect(targeted).toEqual([first]);
  const placementIds = [second.workItemId];
  const expectedPlacements = [{ id: second.workItemId, afterId: first.workItemId }];
  const placements = await source.stores.estimates.listPlacements(seed.workPackageId, placementIds);
  expect(placements).toEqual([{ id: 'reader-lifetime-b', afterId: 'reader-lifetime-a' }]);
  expect(fixture.readEvidence()).toEqual(before);
  return { first, second, expected, full, targeted, placements, expectedPlacements };
}

export const STEP_ESTIMATE_READER_LIFETIME_ASSERTIONS = [
  {
    caseId: 'stepCatalogue.factRead:estimate-borrowed-expiry',
    async assert(fixture: StepCatalogueFixture) {
      const { source, seed } = fixture;
      const { first, second, expected, expectedPlacements } = await prepareReaderLifetime(fixture);
      const retained = await source.uow.run(async ({ stores }) => {
        expect(await stores.estimates.listByWorkPackage(seed.workPackageId)).toEqual(expected);
        expect(await stores.estimates.listByWorkItems(seed.workPackageId, [first.workItemId])).toEqual([first]);
        expect(await stores.estimates.listPlacements(seed.workPackageId, [second.workItemId])).toEqual(expectedPlacements);
        await stores.workItems.insert(workItemRow({
          id: 'reader-lifetime-committed', workPackageId: seed.workPackageId,
          name: 'Committed independently', position: 30,
        }), [], seed.stamp);
        return { commit: true, value: stores.estimates };
      });
      expect((await source.stores.workItems.listByWorkPackage(seed.workPackageId)).map(({ id }) => id).sort()).toEqual([
        'reader-lifetime-a', 'reader-lifetime-b', 'reader-lifetime-committed',
      ]);
      const committed = fixture.readEvidence();
      const expired = await captureReaders(retained, seed.workPackageId, first.workItemId, second.workItemId);
      expectClosed(expired.full);
      expectClosed(expired.targeted);
      expectClosed(expired.placements);
      expect(fixture.readEvidence()).toEqual(committed);
      await source.uow.run(async ({ stores }) => {
        expect(await stores.estimates.listByWorkPackage(seed.workPackageId)).toEqual(expected);
        expect(await stores.estimates.listByWorkItems(seed.workPackageId, [first.workItemId])).toEqual([first]);
        expect(await stores.estimates.listPlacements(seed.workPackageId, [second.workItemId])).toEqual(expectedPlacements);
        const stillExpired = await captureReaders(retained, seed.workPackageId, first.workItemId, second.workItemId);
        expectClosed(stillExpired.full);
        expectClosed(stillExpired.targeted);
        expectClosed(stillExpired.placements);
        return { commit: true, value: undefined };
      });
      expect(fixture.readEvidence()).toEqual(committed);
      expect(await source.stores.estimates.listByWorkPackage(seed.workPackageId)).toEqual(expected);
    },
  },
  {
    caseId: 'stepCatalogue.factRead:estimate-public-source-close',
    async assert(fixture: StepCatalogueFixture) {
      const { source, seed } = fixture;
      const { first, second, expected, full, targeted, placements, expectedPlacements } = await prepareReaderLifetime(fixture);
      const retained = source.stores.estimates;
      const beforeClose = fixture.readEvidence();
      expect(beforeClose.estimates).toEqual(expected);
      await fixture.close();
      const closed = await captureReaders(retained, seed.workPackageId, first.workItemId, second.workItemId);
      expectClosed(closed.full);
      expectClosed(closed.targeted);
      expectClosed(closed.placements);
      expect(full).toEqual(expected);
      expect(targeted).toEqual([first]);
      expect(placements).toEqual(expectedPlacements);
      expect(beforeClose.estimates).toEqual(expected);
    },
  },
] as const;
