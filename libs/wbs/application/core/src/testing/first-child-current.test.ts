import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { expect, test } from 'bun:test';

import { servicesOver } from '../compose';
import { createPlanCommandRunner } from '../module/plan-commands/composition';
import { LEGACY_EDIT_ADMISSION } from '../ports/edit-admission';
import { createLocalDependencyContext } from '../service/dependency-context';
import { testClock } from './clock-fixture';
import { createCurrentPlanFixture } from './current-plan-fixture';
import { localCommandAccess } from './organization-access-fixture';
import { fastScheduler } from './scheduler-fixture';
import { workItemRow } from './work-item-fixture';

const organizationId = 'first-child-current-org';
const projectId = 'first-child-current-project';
const workPackageId = 'first-child-current-package';
const parentId = 'first-child-current-parent';
const stepId = 'first-child-current-step';
const typeId = 'first-child-current-type';
const stamp = { at: 100, by: 'first-child-current-author' };

type Attempt<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly cause: unknown };

async function capture<Value>(operation: () => Promise<Value>): Promise<Attempt<Value>> {
  try {
    return { ok: true, value: await operation() };
  } catch (cause: unknown) {
    return { ok: false, cause };
  }
}

function createPlan(typed: boolean) {
  return createCurrentPlanFixture({
    organizationId,
    projectId,
    workPackage: workPackageRow({ id: workPackageId, projectId }),
    stamp,
    types: typed ? [{ id: typeId, name: 'First-child direct type' }] : [],
    creatorGrant: { id: 'first-child-current-grant', auditId: 'first-child-current-audit' },
    boundSteps: [
      {
        definition: {
          id: stepId,
          code: stepId,
          name: 'First-child current step',
          position: 10,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
        },
        binding: {
          bindingId: 'first-child-current-binding',
          scopeKind: 'project',
          scopeId: projectId,
          workItemTypeId: typed ? typeId : null,
          position: 10,
        },
      },
    ],
  });
}

type CurrentPlan = Awaited<ReturnType<typeof createPlan>>;

/** Real command/UoW/working-plan composition; local admission is an explicit fixture dependency. */
function commandRunner(plan: CurrentPlan) {
  const publicGraph = servicesOver(plan.source.stores, {
    admission: LEGACY_EDIT_ADMISSION,
    dependencyContext: createLocalDependencyContext(plan.source.stores),
    clock: testClock,
    broadcast: plan.broadcast,
    scheduler: fastScheduler,
  });
  return createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: plan.source.uow,
    announcements: plan.broadcast,
    publicServices: publicGraph,
    batchServices: (scope, broadcast, admission, dependencyContext) =>
      servicesOver(scope.stores, {
        admission,
        dependencyContext: { kind: 'bound', context: dependencyContext },
        clock: testClock,
        broadcast,
        scheduler: fastScheduler,
      }),
  });
}

async function withinPlan(
  typed: boolean,
  act: (plan: CurrentPlan) => Promise<void>,
): Promise<void> {
  const plan = await createPlan(typed);
  const execution = await capture(() => act(plan));
  const closing = await capture(plan.close);
  if (!execution.ok && !closing.ok)
    throw new AggregateError(
      [execution.cause, closing.cause],
      'first-child owner and Source close failed',
      { cause: closing.cause },
    );
  if (!execution.ok) throw execution.cause;
  if (!closing.ok) throw closing.cause;
}

async function prepareParent(plan: CurrentPlan, typed: boolean) {
  await plan.source.stores.workItems.insert(
    workItemRow({
      id: parentId,
      workPackageId,
      name: 'Protected current parent',
      position: 10,
    }),
    [],
    stamp,
  );
  if (typed) {
    expect(
      await plan.source.stores.workItems.patch(parentId, { typeIds: [typeId] }, stamp),
    ).toMatchObject({ ok: true });
  }
  expect(
    (await plan.source.stores.workItems.listByWorkPackage(workPackageId)).find(
      ({ id }) => id === parentId,
    )?.typeIds,
  ).toEqual(typed ? [typeId] : []);
  expect(await plan.source.stores.estimates.readTarget(parentId, stepId)).toMatchObject({
    kind: 'resolved',
    step: { stepId },
  });
  const runner = commandRunner(plan);
  // A real normal command precedes the structural case; neither an absent API
  // nor a synthetic command graph can satisfy this prerequisite.
  expect(
    await runner.run(workPackageId, stamp.by, [
      {
        kind: 'patchWorkItem',
        workItemId: parentId,
        patch: { notes: 'healthy command prerequisite' },
      },
    ]),
  ).toMatchObject({ ok: true });
  expect((await plan.source.stores.workItems.findById(parentId))?.notes).toBe(
    'healthy command prerequisite',
  );
  expect(plan.broadcast.published.length).toBeGreaterThan(0);
  return runner;
}

test('actual first-child command transfers combined point facts through undo and redo', async () => {
  await withinPlan(false, async (plan) => {
    const runner = await prepareParent(plan, false);
    const { source } = plan;
    const estimate = { workItemId: parentId, stepId, optimistic: 1, realistic: 2, pessimistic: 3 };
    const actual = { workItemId: parentId, stepId, days: 1.25, recordedAt: 101 };
    const progress = { workItemId: parentId, stepId, state: 'in_progress' as const, statedAt: 102 };
    expect(await source.stores.estimates.set(estimate, stamp)).toBe('written');
    expect(await source.stores.actuals.set(actual, stamp)).toBe('written');
    expect(await source.stores.progress.set(progress, stamp)).toBe('written');
    expect(await source.stores.estimates.listByWorkPackage(workPackageId)).toEqual([estimate]);
    expect(await source.stores.actuals.listByWorkPackage(workPackageId)).toEqual([actual]);
    expect(await source.stores.progress.listByWorkPackage(workPackageId)).toEqual([progress]);
    const before = plan.fixture.stepCatalogueEvidence();
    expect(before.estimates).toEqual([estimate]);
    expect(before.actuals).toEqual([actual]);
    expect(before.progress).toEqual([progress]);
    const catalogue = await source.stores.stepCatalogue.readCatalogue(organizationId);
    const stack = { workPackageId, userId: stamp.by, personId: null };
    const journal = await source.stores.journal.entriesFor(stack);
    expect(journal).toHaveLength(1);
    const announcementCount = plan.broadcast.published.length;

    const created = await runner.run(workPackageId, stamp.by, [
      {
        kind: 'createWorkItem',
        ref: 'child',
        parentId,
        afterId: null,
        name: 'Lawful current child',
      },
      // This next command consumes the actual retained working plan after the
      // structural operation, with all three point families still present.
      { kind: 'patchWorkItem', workItemRef: 'child', patch: { notes: 'after complete transfer' } },
    ]);
    expect(created).toMatchObject({ ok: true });
    if (!created.ok) throw new Error('lawful first-child command was refused');
    const child = created.results.at(0);
    if (child?.kind !== 'createWorkItem') throw new Error('first-child result is absent');
    const childId = child.id;
    expect(
      (await source.stores.workItems.listByWorkPackage(workPackageId)).find(
        ({ id }) => id === childId,
      ),
    ).toMatchObject({
      parentId,
      typeIds: [],
      name: 'Lawful current child',
      notes: 'after complete transfer',
    });

    const assertFacts = async (ownerId: string) => {
      const estimates = [{ ...estimate, workItemId: ownerId }];
      const actuals = [{ ...actual, workItemId: ownerId }];
      const statements = [{ ...progress, workItemId: ownerId }];
      expect(await source.stores.estimates.listByWorkPackage(workPackageId)).toEqual(estimates);
      expect(await source.stores.actuals.listByWorkPackage(workPackageId)).toEqual(actuals);
      expect(await source.stores.progress.listByWorkPackage(workPackageId)).toEqual(statements);
      expect(await source.stores.estimates.listByWorkItems(workPackageId, [ownerId])).toEqual(
        estimates,
      );
      expect(await source.stores.actuals.listByWorkItems(workPackageId, [ownerId])).toEqual(
        actuals,
      );
      expect(await source.stores.progress.listByWorkItems(workPackageId, [ownerId])).toEqual(
        statements,
      );
      const evidence = plan.fixture.stepCatalogueEvidence();
      expect(evidence.estimates).toEqual(estimates);
      expect(evidence.actuals).toEqual(actuals);
      expect(evidence.progress).toEqual(statements);
      expect(evidence.packageValues).toEqual(before.packageValues);
      expect(await source.stores.stepCatalogue.readCatalogue(organizationId)).toEqual(catalogue);
    };

    await assertFacts(childId);
    expect(await source.stores.estimates.listByWorkItems(workPackageId, [parentId])).toEqual([]);
    expect(await source.stores.actuals.listByWorkItems(workPackageId, [parentId])).toEqual([]);
    expect(await source.stores.progress.listByWorkItems(workPackageId, [parentId])).toEqual([]);
    expect(await source.stores.journal.entriesFor(stack)).toHaveLength(journal.length + 1);
    expect(plan.broadcast.published.length).toBeGreaterThan(announcementCount);
    expect(await runner.undo(workPackageId, stamp.by)).toMatchObject({ ok: true });
    expect(await source.stores.workItems.findById(childId)).toBeNull();
    await assertFacts(parentId);
    expect(await runner.redo(workPackageId, stamp.by)).toMatchObject({ ok: true });
    expect(await source.stores.workItems.findById(childId)).toMatchObject({
      parentId,
      notes: 'after complete transfer',
    });
    await assertFacts(childId);
  });
}, 30000);

test('actual first-child command refuses a typed-only protected pair without persistence or announcements', async () => {
  await withinPlan(true, async (plan) => {
    const runner = await prepareParent(plan, true);
    const { source } = plan;
    // A separately real untyped leaf demonstrates that retained package values
    // and the owned definition do not confer applicability to the new child.
    const controlId = 'first-child-untyped-control';
    await source.stores.workItems.insert(
      workItemRow({ id: controlId, workPackageId, position: 20 }),
      [],
      stamp,
    );
    expect(await source.stores.estimates.readTarget(controlId, stepId)).toEqual({
      kind: 'step_not_resolved',
    });
    await source.stores.workItems.remove([controlId], [], stamp);
    expect(await source.stores.workItems.findById(controlId)).toBeNull();
    const estimate = { workItemId: parentId, stepId, optimistic: 1, realistic: 2, pessimistic: 3 };
    expect(await source.stores.estimates.set(estimate, stamp)).toBe('written');
    expect(await source.stores.estimates.listByWorkPackage(workPackageId)).toEqual([estimate]);
    expect(
      await source.stores.stepCatalogue.readPackage(organizationId, workPackageId),
    ).toMatchObject({ steps: [{ stepId }] });
    const before = plan.fixture.stepCatalogueEvidence();
    expect(before.estimates).toEqual([estimate]);
    const rows = await source.stores.workItems.listByWorkPackage(workPackageId);
    expect(rows.map(({ id }) => id)).toEqual([parentId]);
    const stack = { workPackageId, userId: stamp.by, personId: null };
    const journal = await source.stores.journal.entriesFor(stack);
    expect(journal).toHaveLength(1);
    const announcements = structuredClone(plan.broadcast.published);

    const refusal = await runner.run(workPackageId, stamp.by, [
      {
        kind: 'createWorkItem',
        ref: 'child',
        parentId,
        afterId: null,
        name: 'Unresolved untyped child',
      },
    ]);
    // The current command ABI has not acquired this required SC17 arm yet.
    // Unknown is confined to observing the actual public return, with no cast
    // or replacement implementation supplying the prospective refusal.
    expect(refusal).toEqual({
      ok: false,
      at: 0,
      kind: 'createWorkItem',
      reason: 'step_nodes_in_use',
      detail: {
        count: 1,
        pairs: [
          {
            id: parentId,
            name: 'Protected current parent',
            stepId,
            workPackageId,
            facts: ['estimate'],
          },
        ],
      },
    });
    expect(plan.fixture.stepCatalogueEvidence()).toEqual(before);
    expect(await source.stores.workItems.listByWorkPackage(workPackageId)).toEqual(rows);
    expect(await source.stores.journal.entriesFor(stack)).toEqual(journal);
    expect(plan.broadcast.published).toEqual(announcements);
    expect(await source.stores.estimates.listByWorkPackage(workPackageId)).toEqual([estimate]);
  });
}, 30000);
