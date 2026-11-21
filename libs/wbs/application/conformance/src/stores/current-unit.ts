import { rejects } from 'node:assert/strict';
import { inspect } from 'node:util';

import type { StepUnitWritten } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

const SHARED = 'current-unit-shared',
  FOREIGN = 'current-unit-foreign';
const LEAF = 'current-unit-own-leaf',
  SIBLING = 'current-unit-sibling-leaf';

async function prepare(fixture: StepCatalogueFixture) {
  const { source, seed, port } = fixture;
  for (const [organizationId, id] of [
    [seed.organizationId, SHARED],
    [seed.foreignOrganizationId, FOREIGN],
  ] as const)
    expect(
      (
        await port.defineAndBindStep(
          organizationId,
          {
            id,
            code: id,
            name: id,
            position: 10,
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: 7,
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
  for (const [id, workPackageId] of [
    [LEAF, seed.workPackageId],
    [SIBLING, seed.siblingWorkPackageId],
  ] as const)
    await source.stores.workItems.insert(
      workItemRow({ id, workPackageId, name: id, position: 10 }),
      [],
      seed.stamp,
    );
  expect(await source.stores.estimates.readTarget(LEAF, SHARED)).toMatchObject({
    kind: 'resolved',
    step: { stepId: SHARED },
    values: { estimateUnit: 'workdays' },
  });
  expect(await source.stores.estimates.readTarget(SIBLING, SHARED)).toMatchObject({
    kind: 'resolved',
    step: { stepId: SHARED },
  });
  expect((await port.readPackage(seed.organizationId, seed.workPackageId))?.steps).toHaveLength(1);
  expect(
    (await port.readPackage(seed.organizationId, seed.siblingWorkPackageId))?.steps,
  ).toHaveLength(1);
  expect(typeof source.stores.workPackages.setStepUnit).toBe('function');
}
async function revision(fixture: StepCatalogueFixture, id: string) {
  const held = await fixture.source.stores.workPackages.findById(id);
  if (held === null) throw new Error('required current unit package is absent');
  return held.revision;
}

async function directValues(fixture: StepCatalogueFixture) {
  await prepare(fixture);
  const { source, seed, port } = fixture;
  const catalogue = await port.readCatalogue(seed.organizationId),
    sibling = await source.stores.workPackages.findById(seed.siblingWorkPackageId);
  const beforeRevision = await revision(fixture, seed.workPackageId);
  expect(
    await source.stores.workPackages.setStepUnit(seed.workPackageId, SHARED, 'minutes', seed.stamp),
  ).toMatchObject({
    ok: true,
    step: { id: SHARED, workPackageId: seed.workPackageId, estimateUnit: 'minutes' },
  });
  const values = fixture.readEvidence().packageValues;
  expect(
    values.find((row) => row.workPackageId === seed.workPackageId && row.stepId === SHARED),
  ).toMatchObject({ estimateUnit: 'minutes', allowanceBps: 700, allowanceRevision: 0 });
  expect(
    values.find((row) => row.workPackageId === seed.siblingWorkPackageId && row.stepId === SHARED),
  ).toMatchObject({ estimateUnit: 'workdays', allowanceBps: 700, allowanceRevision: 0 });
  expect(await port.readCatalogue(seed.organizationId)).toEqual(catalogue);
  expect(await source.stores.workPackages.findById(seed.siblingWorkPackageId)).toEqual(sibling);
  expect(await revision(fixture, seed.workPackageId)).toBe(beforeRevision + 1);
  const written = fixture.readEvidence();
  expect(
    await source.stores.workPackages.setStepUnit(seed.workPackageId, SHARED, 'minutes', seed.stamp),
  ).toMatchObject({ ok: true, step: { estimateUnit: 'minutes' } });
  expect(fixture.readEvidence()).toEqual(written);
}

async function estimateCount(fixture: StepCatalogueFixture) {
  await prepare(fixture);
  const { source, seed } = fixture;
  const siblingEstimate = {
    workItemId: SIBLING,
    stepId: SHARED,
    optimistic: 1,
    realistic: 2,
    pessimistic: 3,
  };
  expect(await source.stores.estimates.set(siblingEstimate, seed.stamp)).toBe('written');
  expect(
    await source.stores.workPackages.setStepUnit(seed.workPackageId, SHARED, 'minutes', seed.stamp),
  ).toMatchObject({ ok: true, step: { estimateUnit: 'minutes' } });
  expect(await source.stores.estimates.listByWorkPackage(seed.siblingWorkPackageId)).toEqual([
    siblingEstimate,
  ]);
  const ownEstimate = {
    workItemId: LEAF,
    stepId: SHARED,
    optimistic: 1,
    realistic: 2,
    pessimistic: 3,
  };
  expect(await source.stores.estimates.set(ownEstimate, seed.stamp)).toBe('written');
  const before = fixture.readEvidence();
  expect(
    await source.stores.workPackages.setStepUnit(seed.workPackageId, SHARED, 'minutes', seed.stamp),
  ).toMatchObject({ ok: true, step: { estimateUnit: 'minutes' } });
  expect(fixture.readEvidence()).toEqual(before);
  expect(
    await source.stores.workPackages.setStepUnit(
      seed.workPackageId,
      SHARED,
      'workdays',
      seed.stamp,
    ),
  ).toEqual({ ok: false, reason: 'estimates_present', count: 1 });
  expect(fixture.readEvidence()).toEqual(before);
}

async function rollbackValues(fixture: StepCatalogueFixture) {
  await prepare(fixture);
  const { source, seed } = fixture,
    before = fixture.readEvidence();
  expect(
    await source.uow.run(async ({ stores }) => {
      expect(
        await stores.workPackages.setStepUnit(seed.workPackageId, SHARED, 'minutes', seed.stamp),
      ).toMatchObject({ ok: true, step: { estimateUnit: 'minutes' } });
      expect(
        await stores.workPackages.setStepAllowance(seed.workPackageId, SHARED, 25, seed.stamp),
      ).toMatchObject({ ok: true, previousPercent: 7, revision: 1 });
      expect(
        (await stores.workPackages.stepsOf(seed.workPackageId)).find((row) => row.id === SHARED),
      ).toMatchObject({ estimateUnit: 'minutes', allowancePercent: 25 });
      return { commit: false, value: 'actual unit and allowance rolled back' };
    }),
  ).toBe('actual unit and allowance rolled back');
  expect(fixture.readEvidence()).toEqual(before);
}

async function currentMembership(fixture: StepCatalogueFixture) {
  await prepare(fixture);
  const { source, seed, port } = fixture;
  expect(
    await source.stores.workPackages.setStepUnit(
      seed.workPackageId,
      SHARED,
      'workdays',
      seed.stamp,
    ),
  ).toMatchObject({ ok: true });
  const before = fixture.readEvidence();
  expect(
    await source.stores.workPackages.setStepUnit(
      seed.workPackageId,
      FOREIGN,
      'minutes',
      seed.stamp,
    ),
  ).toEqual({ ok: false, reason: 'not_found' });
  expect(fixture.readEvidence()).toEqual(before);
  expect(
    await port.unbindStep(seed.organizationId, SHARED + ':binding', { dryRun: false }, seed.stamp),
  ).toMatchObject({ kind: 'unbound' });
  expect(
    fixture
      .readEvidence()
      .packageValues.some(
        (row) => row.workPackageId === seed.workPackageId && row.stepId === SHARED,
      ),
  ).toBe(true);
  const unbound = fixture.readEvidence();
  expect(
    await source.stores.workPackages.setStepUnit(seed.workPackageId, SHARED, 'minutes', seed.stamp),
  ).toEqual({ ok: false, reason: 'not_found' });
  expect(fixture.readEvidence()).toEqual(unbound);
}

async function sourceClosed(fixture: StepCatalogueFixture) {
  await prepare(fixture);
  const { source, seed } = fixture;
  expect(
    await source.stores.workPackages.setStepUnit(
      seed.workPackageId,
      SHARED,
      'workdays',
      seed.stamp,
    ),
  ).toMatchObject({ ok: true });
  await fixture.close();
  await rejects(
    source.stores.workPackages.setStepUnit(seed.workPackageId, SHARED, 'minutes', seed.stamp),
    /closed/,
  );
}

async function ordinaryExpiry(fixture: StepCatalogueFixture) {
  await prepare(fixture);
  const { source, seed } = fixture;
  const retained = await source.uow.run(async ({ stores }) => {
    expect(
      await stores.workPackages.setStepUnit(seed.workPackageId, SHARED, 'workdays', seed.stamp),
    ).toMatchObject({ ok: true });
    return { commit: true, value: stores.workPackages };
  });
  const before = fixture.readEvidence();
  await rejects(retained.setStepUnit(seed.workPackageId, SHARED, 'minutes', seed.stamp), /closed/);
  expect(fixture.readEvidence()).toEqual(before);
  await source.uow.run(async ({ stores }) => {
    expect(
      await stores.workPackages.setStepUnit(seed.workPackageId, SHARED, 'workdays', seed.stamp),
    ).toMatchObject({ ok: true });
    await rejects(
      retained.setStepUnit(seed.workPackageId, SHARED, 'minutes', seed.stamp),
      /closed/,
    );
    return { commit: false, value: undefined };
  });
  expect(fixture.readEvidence()).toEqual(before);
}

async function repairExpiry(fixture: StepCatalogueFixture) {
  await prepare(fixture);
  const { source, seed } = fixture;
  const retained: { store: StepCatalogueFixture['source']['stores']['workPackages'] | undefined } =
    { store: undefined };
  await source.uow.run<undefined>(() =>
    Promise.resolve({
      commit: false,
      value: undefined,
      afterRollback: async ({ stores }) => {
        expect(
          await stores.workPackages.setStepUnit(seed.workPackageId, SHARED, 'workdays', seed.stamp),
        ).toMatchObject({ ok: true });
        retained.store = stores.workPackages;
      },
    }),
  );
  const expired = retained.store;
  if (expired === undefined) throw new Error('actual unit repair loan was not captured');
  const before = fixture.readEvidence();
  await rejects(expired.setStepUnit(seed.workPackageId, SHARED, 'minutes', seed.stamp), /closed/);
  expect(fixture.readEvidence()).toEqual(before);
  await source.uow.run<undefined>(() =>
    Promise.resolve({
      commit: false,
      value: undefined,
      afterRollback: async ({ stores }) => {
        expect(
          await stores.workPackages.setStepUnit(seed.workPackageId, SHARED, 'workdays', seed.stamp),
        ).toMatchObject({ ok: true });
        await rejects(
          expired.setStepUnit(seed.workPackageId, SHARED, 'minutes', seed.stamp),
          /closed/,
        );
      },
    }),
  );
  expect(fixture.readEvidence()).toEqual(before);
}

async function queuedClose(fixture: StepCatalogueFixture) {
  await prepare(fixture);
  const { source, seed } = fixture;
  expect(
    await source.stores.workPackages.setStepUnit(
      seed.workPackageId,
      SHARED,
      'workdays',
      seed.stamp,
    ),
  ).toMatchObject({ ok: true });
  const entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  const writer = source.uow
    .run(async () => {
      entered.resolve(undefined);
      await release.promise;
      return { commit: false, value: 'held unit writer rolled back' };
    })
    .then(
      (value) => ({ ok: true as const, value }),
      (cause: unknown) => {
        entered.reject(cause);
        return { ok: false as const, cause };
      },
    );
  let primary: { cause: unknown } | undefined;
  const owned: {
    queued:
      | Promise<{ kind: 'resolved'; value: StepUnitWritten } | { kind: 'rejected'; cause: unknown }>
      | undefined;
    closing: Promise<{ ok: true } | { ok: false; cause: unknown }> | undefined;
  } = { queued: undefined, closing: undefined };
  try {
    await entered.promise;
    owned.queued = source.stores.workPackages
      .setStepUnit(seed.workPackageId, SHARED, 'minutes', seed.stamp)
      .then(
        (value) => ({ kind: 'resolved' as const, value }),
        (cause: unknown) => ({ kind: 'rejected' as const, cause }),
      );
    owned.closing = fixture.close().then(
      () => ({ ok: true as const }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
  } catch (cause: unknown) {
    primary = { cause };
  }
  release.resolve(undefined);
  const settled = await writer;
  const queued = owned.queued === undefined ? { kind: 'absent' as const } : await owned.queued;
  const closing = owned.closing === undefined ? { ok: true as const } : await owned.closing;
  if (!closing.ok) {
    const causes: unknown[] = primary === undefined ? [] : [primary.cause];
    if (!settled.ok) causes.push(settled.cause);
    if (queued.kind === 'rejected') causes.push(queued.cause);
    causes.push(closing.cause);
    throw new AggregateError(causes, 'queued unit operations and Source close failed', {
      cause: closing.cause,
    });
  }
  if (primary !== undefined) {
    const causes = [primary.cause];
    if (!settled.ok) causes.push(settled.cause);
    if (queued.kind === 'rejected') causes.push(queued.cause);
    throw new AggregateError(causes, 'queued unit setup and all acquired operations settled');
  }
  // Source close may permit the already-owned rollback or refuse it by name;
  // the queued new write must be refused before its own mutation turn.
  if (!settled.ok) {
    try {
      expect(String(settled.cause)).toMatch(/closed/);
    } catch (assertion: unknown) {
      const detail = inspect(
        { writer: settled, queued, closing },
        { depth: 6, customInspect: false, getters: false, maxArrayLength: 8, maxStringLength: 500 },
      ).slice(0, 6000);
      throw new AggregateError(
        [assertion, settled.cause],
        'queued unit owner unexpected settlement: ' + detail,
        { cause: assertion },
      );
    }
  } else expect(settled.value).toBe('held unit writer rolled back');
  expect(queued.kind).toBe('rejected');
  if (queued.kind !== 'rejected') throw new Error('queued unit was not refused after Source close');
  expect(String(queued.cause)).toMatch(/closed/);
}

/** Current unit and unchanged allowance primitives are observed through actual Source/public and admitted stores. */
export const CURRENT_UNIT_ASSERTIONS = [
  { caseId: 'current-unit:explicit-package-values', assert: directValues },
  { caseId: 'current-unit:own-estimate-count-and-same-unit', assert: estimateCount },
  { caseId: 'current-unit:actual-uow-rollback', assert: rollbackValues },
  { caseId: 'current-unit:current-member-only', assert: currentMembership },
  { caseId: 'current-unit:source-closed', assert: sourceClosed },
  { caseId: 'current-unit:ordinary-expiry', assert: ordinaryExpiry },
  { caseId: 'current-unit:repair-expiry', assert: repairExpiry },
  { caseId: 'current-unit:queued-close', assert: queuedClose },
] as const;

/** Actual opened sources are closed once, retaining independent exercise/close causes. */
export async function runCurrentUnitCase(
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
        'current unit exercise and Source close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}
