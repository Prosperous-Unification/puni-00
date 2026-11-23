import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { expect, test } from 'bun:test';

import { createCurrentPlanFixture } from './current-plan-fixture';
import { workItemRow } from './work-item-fixture';

const stamp = { at: 100, by: 'current-fixture-author' };
const organizationId = 'current-fixture-org',
  projectId = 'current-fixture-project',
  workPackageId = 'current-fixture-package';
const definition = {
  id: 'current-fixture-step',
  code: 'current-fixture-step',
  name: 'Current estimate',
  position: 10,
  defaultEstimateUnit: 'minutes' as const,
  defaultAllowancePercent: 12.5,
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

const binding = {
  bindingId: 'current-fixture-binding',
  scopeKind: 'project' as const,
  scopeId: projectId,
  workItemTypeId: null,
  position: 10,
};

test('actual current harness refuses an owned unbound estimate without announcing or journaling success', async () => {
  const plan = await createCurrentPlanFixture({
    organizationId,
    projectId,
    workPackage: workPackageRow({ id: workPackageId, projectId }),
    stamp,
    types: [],
    boundSteps: [{ definition, binding }],
    creatorGrant: { id: 'current-fixture-grant', auditId: 'current-fixture-audit' },
  });
  const execution = await attempt(async () => {
    const estimate = {
      workItemId: 'current-fixture-leaf',
      stepId: definition.id,
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
    };
    await plan.source.stores.workItems.insert(
      workItemRow({ id: estimate.workItemId, workPackageId, name: 'Current leaf' }),
      [],
      stamp,
    );
    expect(await plan.source.stores.estimates.set(estimate, stamp)).toBe('written');
    expect(plan.fixture.stepCatalogueEvidence().estimates).toEqual([estimate]);
    await plan.source.stores.estimates.remove(estimate.workItemId, estimate.stepId, stamp);
    expect(
      await plan.source.stores.stepCatalogue.unbindStep(
        organizationId,
        binding.bindingId,
        { dryRun: false },
        stamp,
      ),
    ).toEqual({ kind: 'unbound', workPackageIds: [workPackageId], projectIds: [projectId] });
    const before = plan.fixture.stepCatalogueEvidence();
    const stack = { workPackageId, userId: stamp.by, personId: null };
    const journal = await plan.source.stores.journal.entriesFor(stack);
    expect(journal).toEqual([]);
    expect(plan.broadcast.published).toEqual([]);
    expect(
      await plan.service.setEstimate(estimate.workItemId, stamp.by, estimate.stepId, {
        optimistic: 1,
        realistic: 2,
        pessimistic: 3,
      }),
    ).toEqual({ ok: false, reason: 'step_not_resolved' });
    expect(plan.broadcast.published).toEqual([]);
    expect(await plan.source.stores.journal.entriesFor(stack)).toEqual(journal);
    expect(plan.fixture.stepCatalogueEvidence()).toEqual(before);
  });
  const closing = await attempt(plan.close);
  if (!execution.ok && !closing.ok)
    throw new AggregateError(
      [execution.cause, closing.cause],
      'current service test and source close failed',
      { cause: closing.cause },
    );
  if (!execution.ok) throw execution.cause;
  if (!closing.ok) throw closing.cause;
}, 30000);
