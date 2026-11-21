import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { expect, test } from 'bun:test';

import type { EstimateStore } from '../ports/estimate-store';
import { createCurrentPlanFixture } from './current-plan-fixture';
import { createTestServices } from './harness';
import { workItemRow } from './work-item-fixture';

const stamp = { at: 100, by: 'service-boundary-author' };
const organizationId = 'service-boundary-org',
  projectId = 'service-boundary-project',
  workPackageId = 'service-boundary-package';
const definition = {
  id: 'service-boundary-step',
  code: 'service-boundary-step',
  name: 'Boundary estimate',
  position: 10,
  defaultEstimateUnit: 'minutes' as const,
  defaultAllowancePercent: 0,
};
const binding = {
  bindingId: 'service-boundary-binding',
  scopeKind: 'project' as const,
  scopeId: projectId,
  workItemTypeId: null,
  position: 10,
};
type Attempt<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly cause: unknown };
async function attempt<Value>(operation: () => Promise<Value>): Promise<Attempt<Value>> {
  try {
    return { ok: true, value: await operation() };
  } catch (cause: unknown) {
    return { ok: false, cause };
  }
}

/** The real graph/service must succeed before any last-boundary dependency change. */
test('actual current service recaptures estimate applicability after structural admission without false success', async () => {
  const plan = await createCurrentPlanFixture({
    organizationId,
    projectId,
    workPackage: workPackageRow({ id: workPackageId, projectId }),
    stamp,
    types: [],
    boundSteps: [{ definition, binding }],
    creatorGrant: { id: 'service-boundary-grant', auditId: 'service-boundary-audit' },
  });
  const execution = await attempt(async () => {
    const estimate = {
      workItemId: 'service-boundary-leaf',
      stepId: definition.id,
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
    };
    await plan.source.stores.workItems.insert(
      workItemRow({ id: estimate.workItemId, workPackageId, name: 'Boundary leaf' }),
      [],
      stamp,
    );
    const days = { optimistic: 1, realistic: 2, pessimistic: 3 };
    expect(
      await plan.service.setEstimate(estimate.workItemId, stamp.by, estimate.stepId, days),
    ).toEqual({ ok: true, value: null });
    expect(plan.fixture.stepCatalogueEvidence().estimates).toEqual([estimate]);
    const stack = { workPackageId, userId: stamp.by, personId: null };
    expect(await plan.source.stores.journal.entriesFor(stack)).toHaveLength(1);
    expect(plan.broadcast.published.length).toBeGreaterThan(0);
    await plan.source.stores.estimates.remove(estimate.workItemId, estimate.stepId, stamp);
    expect(plan.fixture.stepCatalogueEvidence().estimates).toEqual([]);
    const stored = plan.source.stores.estimates;
    let calls = 0,
      before: ReturnType<typeof plan.fixture.stepCatalogueEvidence> | undefined;
    // The exact real set dependency is reached only AFTER successful structural
    // graph admission. Every other read/write delegates to the same real Source.
    const estimates: EstimateStore = {
      readTarget: (...args) => stored.readTarget(...args),
      listByWorkPackage: (...args) => stored.listByWorkPackage(...args),
      listByWorkItems: (...args) => stored.listByWorkItems(...args),
      listPlacements: (...args) => stored.listPlacements(...args),
      remove: (...args) => stored.remove(...args),
      moveAll: (...args) => stored.moveAll(...args),
      set: async (value, writeStamp) => {
        calls += 1;
        expect(
          await plan.source.stores.stepCatalogue.unbindStep(
            organizationId,
            binding.bindingId,
            { dryRun: false },
            stamp,
          ),
        ).toEqual({ kind: 'unbound', workPackageIds: [workPackageId], projectIds: [projectId] });
        before = plan.fixture.stepCatalogueEvidence();
        return await stored.set(value, writeStamp);
      },
    };
    const service = createTestServices(plan.source, {
      estimates,
      broadcast: plan.broadcast,
    }).service;
    const published = structuredClone(plan.broadcast.published),
      journal = await plan.source.stores.journal.entriesFor(stack);
    expect(await service.setEstimate(estimate.workItemId, stamp.by, estimate.stepId, days)).toEqual(
      { ok: false, reason: 'step_not_resolved' },
    );
    expect(calls).toBe(1);
    if (before === undefined) throw new Error('actual set boundary was not reached');
    expect(plan.fixture.stepCatalogueEvidence()).toEqual(before);
    expect(plan.fixture.stepCatalogueEvidence().estimates).toEqual([]);
    expect(plan.broadcast.published).toEqual(published);
    expect(await plan.source.stores.journal.entriesFor(stack)).toEqual(journal);
  });
  const closing = await attempt(plan.close);
  if (!execution.ok && !closing.ok)
    throw new AggregateError(
      [execution.cause, closing.cause],
      'current service boundary test and source close failed',
      { cause: closing.cause },
    );
  if (!execution.ok) throw execution.cause;
  if (!closing.ok) throw closing.cause;
}, 30000);
