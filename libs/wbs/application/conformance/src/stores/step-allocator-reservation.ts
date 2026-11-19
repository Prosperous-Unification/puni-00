import type { StepInUsePair } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

/** Existing raw Source ports establish A42's retained allocator; no public first-child permission is inferred. */
async function retainParentAllocator(
  fixture: StepCatalogueFixture,
  workPackageId: string,
  stepId: string,
  prefix: string,
) {
  const { source, seed } = fixture;
  const parentId = `${prefix}-parent`;
  const markedId = `${prefix}-marked-child`;
  const siblingId = `${prefix}-unmarked-child`;
  await source.stores.workItems.insert(workItemRow({ id: parentId, workPackageId, name: 'Reserved parent', position: 10 }), [], seed.stamp);
  const parent = { workItemId: parentId, stepId, issued: 11 };
  await source.stores.attempts.raiseIssued([parent]);
  expect(await source.stores.attempts.listIssued(workPackageId, [parentId])).toEqual([parent]);
  await source.uow.run(async ({ stores }) => {
    await stores.workItems.insert(workItemRow({ id: markedId, workPackageId, parentId, name: 'Marked child', position: 10 }), [], seed.stamp);
    await stores.attempts.moveAll(parentId, markedId, seed.stamp);
    return { commit: true, value: undefined };
  });
  const marked = { workItemId: markedId, stepId, issued: 11 };
  expect(await source.stores.attempts.listIssued(workPackageId, [parentId, markedId])).toEqual([marked, parent]);
  await source.stores.workItems.insert(workItemRow({ id: siblingId, workPackageId, parentId, name: 'Unmarked child', position: 20 }), [], seed.stamp);
  await source.stores.workItems.remove([markedId], [], seed.stamp);
  expect(await source.stores.workItems.findById(markedId)).toBeNull();
  expect((await source.stores.workItems.findById(siblingId))?.parentId).toBe(parentId);
  expect(await source.stores.attempts.listIssued(workPackageId, [parentId, markedId, siblingId])).toEqual([parent]);
  return { parentId, siblingId, parent };
}

/** Tests current configuration reservation semantics independently from the still-owed atomic first-child command. */
export const STEP_ALLOCATOR_RESERVATION_ASSERTIONS = [
  {
    caseId: 'stepCatalogue.unbindStep:parent-allocator-delete-unbind-revival',
    async assert(fixture: StepCatalogueFixture) {
      const { source, port, seed } = fixture;
      const stepId = 'allocator-dev', bindingId = 'allocator-binding';
      expect((await port.defineAndBindStep(seed.organizationId, {
        id: stepId, code: stepId, name: 'Allocator step', position: 10,
        defaultEstimateUnit: 'workdays', defaultAllowancePercent: 0,
      }, { bindingId, scopeKind: 'project', scopeId: seed.projectId, workItemTypeId: null, position: 10 }, seed.stamp)).ok).toBe(true);
      expect((await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(({ stepId: id }) => id)).toEqual([stepId]);
      // A counter-only current leaf remains protected before introducing the parent reservation.
      const leafId = 'allocator-control-leaf';
      await source.stores.workItems.insert(workItemRow({ id: leafId, workPackageId: seed.workPackageId, name: 'Counter leaf', position: 30 }), [], seed.stamp);
      await source.stores.attempts.raiseIssued([{ workItemId: leafId, stepId, issued: 4 }]);
      const leafBefore = fixture.readEvidence();
      const leafPairs: readonly StepInUsePair[] = [{ id: leafId, name: 'Counter leaf', stepId, workPackageId: seed.workPackageId, facts: ['attempt_issued'] }];
      expect(await port.unbindStep(seed.organizationId, bindingId, { dryRun: true }, seed.stamp)).toEqual({ kind: 'preview', wouldRefuse: 'step_nodes_in_use', count: 1, pairs: leafPairs });
      expect(fixture.readEvidence()).toEqual(leafBefore);
      await source.stores.workItems.remove([leafId], [], seed.stamp);
      const retained = await retainParentAllocator(fixture, seed.workPackageId, stepId, 'allocator');
      const before = fixture.readEvidence();
      expect<unknown>(before.tuples.issued).toEqual([retained.parent]);
      expect(before.tuples.attempts).toEqual([]);
      const pairs: readonly StepInUsePair[] = [{ id: retained.parentId, name: 'Reserved parent', stepId, workPackageId: seed.workPackageId, facts: ['attempt_issued'] }];
      // First new oracle: configuration protects the retained parent address, not its unmarked child.
      expect(await port.unbindStep(seed.organizationId, bindingId, { dryRun: true }, seed.stamp)).toEqual({ kind: 'preview', wouldRefuse: 'step_nodes_in_use', count: 1, pairs });
      expect(fixture.readEvidence()).toEqual(before);
      expect(await port.unbindStep(seed.organizationId, bindingId, { dryRun: false }, seed.stamp)).toEqual({ kind: 'step_nodes_in_use', count: 1, pairs });
      expect(fixture.readEvidence()).toEqual(before);
      await source.stores.workItems.remove([retained.siblingId], [], seed.stamp);
      expect((await source.stores.workItems.listByWorkPackage(seed.workPackageId)).map(({ id }) => id)).toEqual([retained.parentId]);
      expect((await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(({ stepId: id }) => id)).toEqual([stepId]);
      expect(await source.stores.attempts.start({ workItemId: retained.parentId, stepId, startedAt: 500, executorPersonId: null, reference: null, note: null }, seed.stamp)).toEqual({ ok: true, attempt: { workItemId: retained.parentId, stepId, attemptNumber: 12, startedAt: 500, endedAt: null, outcome: null, executorPersonId: null, reference: null, note: null } });
      expect(await source.stores.attempts.listIssued(seed.workPackageId, [retained.parentId])).toEqual([{ ...retained.parent, issued: 12 }]);
    },
  },
  ...(['sibling', 'foreign'] as const).map((scope) => ({
    caseId: `stepCatalogue.unbindStep:${scope}-parent-allocator-not-global-veto` as const,
    async assert(fixture: StepCatalogueFixture) {
      const { port, seed, source } = fixture;
      const organizationId = scope === 'foreign' ? seed.foreignOrganizationId : seed.organizationId;
      const projectId = scope === 'foreign' ? seed.foreignProjectId : seed.siblingProjectId;
      const workPackageId = scope === 'foreign' ? seed.foreignWorkPackageId : seed.siblingWorkPackageId;
      const reservedStepId = `${scope}-reserved-step`;
      expect((await port.defineAndBindStep(organizationId, { id: reservedStepId, code: reservedStepId, name: 'Separate allocator', position: 10, defaultEstimateUnit: 'workdays', defaultAllowancePercent: 0 }, { bindingId: `${scope}-reserved-binding`, scopeKind: 'project', scopeId: projectId, workItemTypeId: null, position: 10 }, seed.stamp)).ok).toBe(true);
      const retained = await retainParentAllocator(fixture, workPackageId, reservedStepId, scope);
      expect((await port.defineAndBindStep(seed.organizationId, { id: 'unrelated-step', code: 'unrelated-step', name: 'Unrelated empty step', position: 20, defaultEstimateUnit: 'minutes', defaultAllowancePercent: 0 }, { bindingId: 'unrelated-binding', scopeKind: 'project', scopeId: seed.projectId, workItemTypeId: null, position: 20 }, seed.stamp)).ok).toBe(true);
      expect((await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(({ stepId }) => stepId)).toEqual(['unrelated-step']);
      const before = fixture.readEvidence();
      expect(await port.unbindStep(seed.organizationId, 'unrelated-binding', { dryRun: true }, seed.stamp)).toEqual({ kind: 'preview', wouldRefuse: null });
      expect(fixture.readEvidence()).toEqual(before);
      expect(await port.unbindStep(seed.organizationId, 'unrelated-binding', { dryRun: false }, seed.stamp)).toEqual({ kind: 'unbound', workPackageIds: [seed.workPackageId],projectIds:[seed.projectId] });
      expect((await port.readPackage(seed.organizationId, seed.workPackageId))?.steps).toEqual([]);
      expect((await port.readPackage(organizationId, workPackageId))?.steps.map(({ stepId }) => stepId)).toEqual([reservedStepId]);
      expect(await source.stores.attempts.listIssued(workPackageId, [retained.parentId, retained.siblingId])).toEqual([retained.parent]);
      const after = fixture.readEvidence();
      expect(after.tuples).toEqual(before.tuples);
      expect(after.packageValues).toEqual(before.packageValues);
    },
  })),
] as const;
