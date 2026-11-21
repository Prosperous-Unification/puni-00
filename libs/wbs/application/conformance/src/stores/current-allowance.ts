import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { clockOf } from '@wbs/core/ports/clock';
import { LEGACY_EDIT_ADMISSION } from '@wbs/core/ports/edit-admission';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

const SHARED = 'current-allowance-shared';
const FOREIGN = 'current-allowance-foreign';
const LEAF = 'current-allowance-leaf';

/** Actual current catalogue fixtures contain no legacy step DTO seed. */
async function prepare(fixture: StepCatalogueFixture) {
  const { source, seed, port } = fixture;
  for (const [organizationId, id, allowance] of [
    [seed.organizationId, SHARED, 7],
    [seed.foreignOrganizationId, FOREIGN, 11],
  ] as const) {
    expect(
      (
        await port.defineAndBindStep(
          organizationId,
          {
            id,
            code: id,
            name: id,
            position: 90,
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: allowance,
          },
          {
            bindingId: id + ':binding',
            scopeKind: 'organization',
            scopeId: organizationId,
            workItemTypeId: null,
            position: 10,
          },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
  }
  await source.stores.workItems.insert(
    workItemRow({
      id: LEAF,
      workPackageId: seed.workPackageId,
      name: 'Allowance leaf',
      position: 10,
    }),
    [],
    seed.stamp,
  );
  expect(await source.stores.estimates.readTarget(LEAF, SHARED)).toMatchObject({
    kind: 'resolved',
    step: { stepId: SHARED },
  });
  const estimate = {
    workItemId: LEAF,
    stepId: SHARED,
    optimistic: 2,
    realistic: 3,
    pessimistic: 4,
  };
  const estimates = [estimate];
  expect(await source.stores.estimates.set(estimate, seed.stamp)).toBe('written');
  expect(await source.stores.estimates.listByWorkPackage(seed.workPackageId)).toEqual(estimates);
  await assertValues(fixture, 7, 0, 7, 0);
  const own = await port.readCatalogue(seed.organizationId);
  const foreign = await port.readCatalogue(seed.foreignOrganizationId);
  expect(own?.definitions).toHaveLength(1);
  expect(own?.definitions[0]?.defaultAllowancePercent).toBe(7);
  expect(foreign?.definitions).toHaveLength(1);
  expect(foreign?.definitions[0]?.defaultAllowancePercent).toBe(11);
  const foreignPackage = await source.stores.workPackages.findById(seed.foreignWorkPackageId);
  if (foreignPackage === null) throw new Error('required foreign package is absent');
  return { own, foreign, foreignPackage, estimates };
}

async function assertValues(
  fixture: StepCatalogueFixture,
  ownPercent: number,
  ownRevision: number,
  siblingPercent: number,
  siblingRevision: number,
) {
  const { seed, port } = fixture;
  const values = fixture.readEvidence().packageValues;
  expect(values).toHaveLength(3);
  for (const [workPackageId, stepId, allowanceBps, allowanceRevision, organizationId] of [
    [seed.workPackageId, SHARED, ownPercent * 100, ownRevision, seed.organizationId],
    [seed.siblingWorkPackageId, SHARED, siblingPercent * 100, siblingRevision, seed.organizationId],
    [seed.foreignWorkPackageId, FOREIGN, 1100, 0, seed.foreignOrganizationId],
  ] as const) {
    expect(
      values.find((row) => row.workPackageId === workPackageId && row.stepId === stepId),
    ).toEqual({
      workPackageId,
      stepId,
      estimateUnit: 'workdays',
      allowanceBps,
      allowanceRevision,
    });
    const projected = await port.readPackage(organizationId, workPackageId);
    expect(projected?.steps).toHaveLength(1);
    expect(projected?.steps[0]).toMatchObject({
      stepId,
      estimateUnit: 'workdays',
      allowancePercent: allowanceBps / 100,
      allowanceRevision,
    });
  }
}

async function assertRetained(
  fixture: StepCatalogueFixture,
  before: Awaited<ReturnType<typeof prepare>>,
) {
  const { source, seed, port } = fixture;
  expect(await port.readCatalogue(seed.organizationId)).toEqual(before.own);
  expect(await port.readCatalogue(seed.foreignOrganizationId)).toEqual(before.foreign);
  expect(await source.stores.workPackages.findById(seed.foreignWorkPackageId)).toEqual(
    before.foreignPackage,
  );
  expect(fixture.readEvidence().estimates).toEqual(before.estimates);
  expect(await source.stores.estimates.listByWorkPackage(seed.workPackageId)).toEqual(
    before.estimates,
  );
}

async function packageRevision(fixture: StepCatalogueFixture, id: string) {
  const workPackage = await fixture.source.stores.workPackages.findById(id);
  if (workPackage === null) throw new Error('required allowance package is absent: ' + id);
  return workPackage.revision;
}

/** Real Source UoW/runner and bound dependency context; local fixture admission is not scoped permission proof. */
function commands(fixture: StepCatalogueFixture) {
  const { source, seed } = fixture;
  const broadcast = recordingBroadcaster();
  let next = 0;
  const clock = clockOf({
    now: () => seed.stamp.at + 1,
    newId: () => 'current-allowance-command-' + String(++next),
  });
  const publicServices = servicesOver(source.stores, {
    admission: LEGACY_EDIT_ADMISSION,
    dependencyContext: createLocalDependencyContext(source.stores),
    clock,
    broadcast,
    scheduler: fastScheduler,
  });
  const runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: source.uow,
    announcements: broadcast,
    publicServices,
    batchServices: (scope, announcements, admission, dependencyContext) =>
      servicesOver(scope.stores, {
        admission,
        dependencyContext: { kind: 'bound', context: dependencyContext },
        clock,
        broadcast: announcements,
        scheduler: fastScheduler,
      }),
  });
  return {
    runner,
    broadcast,
    stack: { workPackageId: seed.workPackageId, userId: seed.stamp.by, personId: null },
  };
}

async function directValues(fixture: StepCatalogueFixture) {
  const before = await prepare(fixture),
    { source, seed } = fixture;
  const revision = await packageRevision(fixture, seed.workPackageId);
  const siblingBefore = await source.stores.workPackages.findById(seed.siblingWorkPackageId);
  const written = await source.stores.workPackages.setStepAllowance(
    seed.workPackageId,
    SHARED,
    30,
    seed.stamp,
  );
  expect(written).toMatchObject({
    ok: true,
    previousPercent: 7,
    revision: 1,
    step: { id: SHARED, workPackageId: seed.workPackageId, allowancePercent: 30 },
  });
  await assertValues(fixture, 30, 1, 7, 0);
  expect(await packageRevision(fixture, seed.workPackageId)).toBe(revision + 1);
  expect(await source.stores.workPackages.findById(seed.siblingWorkPackageId)).toEqual(
    siblingBefore,
  );
  expect(
    await source.stores.workPackages.setStepAllowance(
      seed.siblingWorkPackageId,
      SHARED,
      75,
      seed.stamp,
    ),
  ).toMatchObject({ ok: true, previousPercent: 7, revision: 1 });
  const distinctSibling = await source.stores.workPackages.findById(seed.siblingWorkPackageId);
  await assertValues(fixture, 30, 1, 75, 1);
  expect(
    await source.stores.workPackages.setStepAllowance(seed.workPackageId, SHARED, 40, seed.stamp),
  ).toMatchObject({ ok: true, previousPercent: 30, revision: 2 });
  expect(
    await source.stores.workPackages.setStepAllowance(seed.workPackageId, SHARED, 40, seed.stamp),
  ).toMatchObject({ ok: true, previousPercent: 40, revision: 3 });
  await assertValues(fixture, 40, 3, 75, 1);
  expect([
    ...(await source.stores.workPackages.stepAllowanceRevisions(seed.workPackageId)),
  ]).toEqual([[SHARED, 3]]);
  expect([
    ...(await source.stores.workPackages.stepAllowanceRevisions(seed.siblingWorkPackageId)),
  ]).toEqual([[SHARED, 1]]);
  expect(await packageRevision(fixture, seed.workPackageId)).toBe(revision + 3);
  expect(await source.stores.workPackages.findById(seed.siblingWorkPackageId)).toEqual(
    distinctSibling,
  );
  await assertRetained(fixture, before);
}

async function revisions(fixture: StepCatalogueFixture) {
  const before = await prepare(fixture),
    { source, seed } = fixture;
  const snapshot = fixture.readEvidence().snapshot;
  expect([
    ...(await source.stores.workPackages.stepAllowanceRevisions(seed.workPackageId)),
  ]).toEqual([[SHARED, 0]]);
  expect([
    ...(await source.stores.workPackages.stepAllowanceRevisions(seed.siblingWorkPackageId)),
  ]).toEqual([[SHARED, 0]]);
  expect([
    ...(await source.stores.workPackages.stepAllowanceRevisions(seed.foreignWorkPackageId)),
  ]).toEqual([[FOREIGN, 0]]);
  expect(fixture.readEvidence().snapshot).toEqual(snapshot);
  await assertRetained(fixture, before);
}

async function notesReplay(fixture: StepCatalogueFixture) {
  const before = await prepare(fixture),
    { source, seed } = fixture;
  const { runner, stack } = commands(fixture);
  const ownRevision = await packageRevision(fixture, seed.workPackageId);
  const sibling = await source.stores.workPackages.findById(seed.siblingWorkPackageId);
  expect(
    await runner.run(seed.workPackageId, seed.stamp.by, [
      { kind: 'patchWorkItem', workItemId: LEAF, patch: { notes: 'current catalogue note' } },
    ]),
  ).toMatchObject({ ok: true });
  expect((await source.stores.workItems.findById(LEAF))?.notes).toBe('current catalogue note');
  expect(await source.stores.journal.entriesFor(stack)).toHaveLength(1);
  expect(await runner.undo(seed.workPackageId, seed.stamp.by)).toMatchObject({ ok: true });
  expect((await source.stores.workItems.findById(LEAF))?.notes).toBe('');
  expect(await runner.redo(seed.workPackageId, seed.stamp.by)).toMatchObject({ ok: true });
  expect((await source.stores.workItems.findById(LEAF))?.notes).toBe('current catalogue note');
  await assertValues(fixture, 7, 0, 7, 0);
  expect(await packageRevision(fixture, seed.workPackageId)).toBe(ownRevision);
  expect(await source.stores.workPackages.findById(seed.siblingWorkPackageId)).toEqual(sibling);
  await assertRetained(fixture, before);
}

async function allowanceReplay(fixture: StepCatalogueFixture) {
  const before = await prepare(fixture),
    { source, seed } = fixture;
  const { runner, broadcast, stack } = commands(fixture);
  const revision = await packageRevision(fixture, seed.workPackageId);
  expect(
    await runner.run(seed.workPackageId, seed.stamp.by, [
      { kind: 'setStepAllowance', stepId: SHARED, allowancePercent: 30 },
    ]),
  ).toMatchObject({ ok: true });
  await assertValues(fixture, 30, 1, 7, 0);
  expect(await source.stores.journal.entriesFor(stack)).toHaveLength(1);
  expect(
    broadcast.published.some(
      ({ workPackageId, event }) =>
        workPackageId === seed.workPackageId && event.type === 'step_updated',
    ),
  ).toBe(true);
  expect(
    await source.stores.workPackages.setStepAllowance(
      seed.siblingWorkPackageId,
      SHARED,
      75,
      seed.stamp,
    ),
  ).toMatchObject({ ok: true, revision: 1 });
  const sibling = await source.stores.workPackages.findById(seed.siblingWorkPackageId);
  expect(await runner.undo(seed.workPackageId, seed.stamp.by)).toMatchObject({ ok: true });
  await assertValues(fixture, 7, 2, 75, 1);
  expect(await runner.redo(seed.workPackageId, seed.stamp.by)).toMatchObject({ ok: true });
  await assertValues(fixture, 30, 3, 75, 1);
  expect(await packageRevision(fixture, seed.workPackageId)).toBe(revision + 3);
  expect(await source.stores.workPackages.findById(seed.siblingWorkPackageId)).toEqual(sibling);
  await assertRetained(fixture, before);
}

async function allowanceABA(fixture: StepCatalogueFixture) {
  const before = await prepare(fixture),
    { source, seed } = fixture;
  const { runner, broadcast, stack } = commands(fixture);
  expect(
    await runner.run(seed.workPackageId, seed.stamp.by, [
      { kind: 'setStepAllowance', stepId: SHARED, allowancePercent: 30 },
    ]),
  ).toMatchObject({ ok: true });
  expect(await source.stores.journal.entriesFor(stack)).toHaveLength(1);
  // Independent committed Source writes return the value but advance the actual pair revision.
  expect(
    await source.stores.workPackages.setStepAllowance(seed.workPackageId, SHARED, 50, seed.stamp),
  ).toMatchObject({ ok: true, revision: 2 });
  expect(
    await source.stores.workPackages.setStepAllowance(seed.workPackageId, SHARED, 30, seed.stamp),
  ).toMatchObject({ ok: true, revision: 3 });
  await assertValues(fixture, 30, 3, 7, 0);
  const packageBefore = await source.stores.workPackages.findById(seed.workPackageId);
  const rowsBefore = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
  const announced = broadcast.published.length;
  expect(await runner.undo(seed.workPackageId, seed.stamp.by)).toMatchObject({
    ok: false,
    reason: 'stale_undo',
  });
  await assertValues(fixture, 30, 3, 7, 0);
  expect(await source.stores.workPackages.findById(seed.workPackageId)).toEqual(packageBefore);
  expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual(rowsBefore);
  expect(broadcast.published).toHaveLength(announced);
  expect(await source.stores.journal.entriesFor(stack)).toEqual([]);
  await assertRetained(fixture, before);
}

/** Package-pair values and journal revisions use actual Source/command paths on both adapters. */
export const CURRENT_ALLOWANCE_ASSERTIONS = [
  { caseId: 'stepCatalogue.allowance:package-values', assert: directValues },
  { caseId: 'stepCatalogue.allowance:current-revisions', assert: revisions },
  { caseId: 'stepCatalogue.allowance:notes-undo-redo', assert: notesReplay },
  { caseId: 'stepCatalogue.allowance:allowance-undo-redo', assert: allowanceReplay },
  { caseId: 'stepCatalogue.allowance:allowance-aba', assert: allowanceABA },
] as const;

/** The opener owns setup failure; each successful actual Source is closed once with both failure causes retained. */
export async function runCurrentAllowanceCase(
  fixture: StepCatalogueFixture,
  assert: (fixture: StepCatalogueFixture) => Promise<void>,
): Promise<void> {
  let primary: { cause: unknown } | undefined;
  try {
    await assert(fixture);
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await fixture.close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup],
        'current allowance owner and Source close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}
