import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

const STEP = 'retirement-current-step',
  BINDING = 'retirement-current-binding';
const definition = {
  id: STEP,
  code: 'retirement-current',
  name: 'Retirement current',
  position: 10,
  defaultEstimateUnit: 'workdays',
  defaultAllowancePercent: 7,
} as const;

/** Actual Source fixtures provide physical definition rows; catalogue visibility is a separate assertion. */
export interface RetirementFixture {
  readonly current: StepCatalogueFixture;
  readDefinitions(): unknown;
}

async function prepare(fixture: RetirementFixture) {
  const { source, seed, port } = fixture.current;
  const binding = {
    bindingId: BINDING,
    scopeKind: 'organization',
    scopeId: seed.organizationId,
    workItemTypeId: null,
    position: 10,
  } as const;
  expect(
    await port.defineAndBindStep(seed.organizationId, definition, binding, seed.stamp),
  ).toMatchObject({ ok: true, definition: { id: STEP, organizationId: seed.organizationId } });
  expect((await port.readCatalogue(seed.organizationId))?.definitions).toHaveLength(1);
  expect((await port.readPackage(seed.organizationId, seed.workPackageId))?.steps).toHaveLength(1);
  expect(
    (await port.readPackage(seed.organizationId, seed.siblingWorkPackageId))?.steps,
  ).toHaveLength(1);
  expect(
    await source.stores.workPackages.setStepUnit(seed.workPackageId, STEP, 'minutes', seed.stamp),
  ).toMatchObject({ ok: true, step: { estimateUnit: 'minutes' } });
  expect(
    await source.stores.workPackages.setStepAllowance(seed.workPackageId, STEP, 12.34, seed.stamp),
  ).toMatchObject({ ok: true, previousPercent: 7, revision: 1 });
  expect(
    await source.stores.workPackages.setStepAllowance(
      seed.siblingWorkPackageId,
      STEP,
      56.78,
      seed.stamp,
    ),
  ).toMatchObject({ ok: true, previousPercent: 7, revision: 1 });
  const values = fixture.current.readEvidence().packageValues;
  expect(values.filter((row) => row.stepId === STEP)).toHaveLength(2);
  expect(
    values.find((row) => row.stepId === STEP && row.workPackageId === seed.workPackageId),
  ).toMatchObject({ estimateUnit: 'minutes', allowanceBps: 1234, allowanceRevision: 1 });
  expect(
    values.find((row) => row.stepId === STEP && row.workPackageId === seed.siblingWorkPackageId),
  ).toMatchObject({ estimateUnit: 'workdays', allowanceBps: 5678, allowanceRevision: 1 });
  expect((await port.readCatalogue(seed.organizationId))?.definitions).toEqual([
    expect.objectContaining(definition),
  ]);
  // Missing required operation is an explicit initial scaffolding failure, not retirement/guard proof.
  expect(typeof port.retireStepDefinition).toBe('function');
  return binding;
}

async function retainedValues(fixture: RetirementFixture) {
  const binding = await prepare(fixture),
    { current } = fixture,
    { port, seed, source } = current;
  const bound = current.readEvidence();
  expect(await port.retireStepDefinition(seed.organizationId, STEP, seed.stamp)).toEqual({
    ok: false,
    reason: 'step_bound',
  });
  expect(current.readEvidence()).toEqual(bound);
  expect(await port.retireStepDefinition(seed.foreignOrganizationId, STEP, seed.stamp)).toEqual({
    ok: false,
    reason: 'not_found',
  });
  expect(current.readEvidence()).toEqual(bound);
  expect(
    await port.unbindStep(seed.organizationId, BINDING, { dryRun: false }, seed.stamp),
  ).toMatchObject({ kind: 'unbound' });
  const before = current.readEvidence(),
    physicalDefinitions = fixture.readDefinitions();
  const packages = await Promise.all([
    source.stores.workPackages.findById(seed.workPackageId),
    source.stores.workPackages.findById(seed.siblingWorkPackageId),
  ]);
  expect(before.packageValues).toEqual(bound.packageValues);
  expect(await port.retireStepDefinition(seed.organizationId, STEP, seed.stamp)).toEqual({
    ok: true,
  });
  expect(await port.readCatalogue(seed.organizationId)).toEqual({ definitions: [], bindings: [] });
  expect((await port.readPackage(seed.organizationId, seed.workPackageId))?.steps).toEqual([]);
  expect((await port.readPackage(seed.organizationId, seed.siblingWorkPackageId))?.steps).toEqual(
    [],
  );
  expect(current.readEvidence().packageValues).toEqual(before.packageValues);
  expect(fixture.readDefinitions()).toEqual(physicalDefinitions);
  expect(
    await Promise.all([
      source.stores.workPackages.findById(seed.workPackageId),
      source.stores.workPackages.findById(seed.siblingWorkPackageId),
    ]),
  ).toEqual(packages);
  const retired = current.readEvidence();
  expect(await port.retireStepDefinition(seed.organizationId, STEP, seed.stamp)).toEqual({
    ok: false,
    reason: 'not_found',
  });
  expect(current.readEvidence()).toEqual(retired);
  expect(
    await port.bindStep(
      seed.organizationId,
      { ...binding, bindingId: 'retirement-rebind', stepId: STEP },
      seed.stamp,
    ),
  ).toEqual({ ok: false, reason: 'not_found' });
  expect(current.readEvidence()).toEqual(retired);
  expect(
    await port.defineAndBindStep(
      seed.organizationId,
      { ...definition, id: 'retirement-reused-code', name: 'Different name' },
      binding,
      seed.stamp,
    ),
  ).toEqual({ ok: false, reason: 'code_taken' });
  expect(current.readEvidence()).toEqual(retired);
  expect(
    await port.defineAndBindStep(
      seed.organizationId,
      { ...definition, id: 'retirement-reused-name', code: 'different-code' },
      binding,
      seed.stamp,
    ),
  ).toEqual({ ok: false, reason: 'name_taken' });
  expect(current.readEvidence()).toEqual(retired);
}

async function rollbackRetirement(fixture: RetirementFixture) {
  await prepare(fixture);
  const { source, seed, port } = fixture.current;
  expect(
    await port.unbindStep(seed.organizationId, BINDING, { dryRun: false }, seed.stamp),
  ).toMatchObject({ kind: 'unbound' });
  const before = fixture.current.readEvidence(),
    catalogue = await port.readCatalogue(seed.organizationId);
  expect(
    await source.uow.run(async ({ stores }) => {
      expect(
        await stores.stepCatalogue.retireStepDefinition(seed.organizationId, STEP, seed.stamp),
      ).toEqual({ ok: true });
      expect(await stores.stepCatalogue.readCatalogue(seed.organizationId)).toEqual({
        definitions: [],
        bindings: [],
      });
      return { commit: false, value: 'retirement rolled back' };
    }),
  ).toBe('retirement rolled back');
  expect(fixture.current.readEvidence()).toEqual(before);
  expect(await port.readCatalogue(seed.organizationId)).toEqual(catalogue);
}

export const CURRENT_RETIREMENT_ASSERTIONS = [
  { caseId: 'current-retirement:retained-values-and-reserved-identity', assert: retainedValues },
  { caseId: 'current-retirement:actual-uow-rollback', assert: rollbackRetirement },
] as const;

/** Always settle the actual fixture owner and preserve independent exercise/close failures. */
export async function runCurrentRetirementCase(
  fixture: RetirementFixture,
  assert: (fixture: RetirementFixture) => Promise<void>,
): Promise<void> {
  let primary: { cause: unknown } | undefined;
  try {
    await assert(fixture);
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await fixture.current.close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup],
        'current retirement and Source close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}
