import type { StepCatalogue, StepUsageSnapshot } from '@wbs/core';
import { projectReadableStepUsage } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

export const CATALOGUE_USAGE_READ_CASES = [
  'snapshot',
  'ordinary',
  'repair',
  'source-closed',
  'staged-rollback',
] as const;
export type CatalogueUsageReadCase = (typeof CATALOGUE_USAGE_READ_CASES)[number];

async function readUsage(port: StepCatalogue, fixture: StepCatalogueFixture) {
  const captured = await port.readUsage(fixture.seed.organizationId);
  if (captured === null) throw Error('actual usage owner disappeared');
  return captured;
}
function projectUsage(captured: StepUsageSnapshot, fixture: StepCatalogueFixture) {
  return projectReadableStepUsage(
    captured.packages,
    captured.bindings,
    captured.facts,
    fixture.seed.projectId,
    'read-life-step',
    new Set([fixture.seed.workPackageId]),
  );
}
async function expectClosed(call: () => Promise<unknown>) {
  let failure: unknown;
  try {
    await call();
  } catch (cause: unknown) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw Error('expired usage capability resolved');
  expect(failure.message).toContain('closed');
}
async function prepareUsage(fixture: StepCatalogueFixture) {
  const { port, seed } = fixture;
  expect(
    (
      await port.defineAndBindStep(
        seed.organizationId,
        {
          id: 'read-life-step',
          code: 'read-life-step',
          name: 'Read usage',
          position: 0,
          defaultEstimateUnit: 'minutes',
          defaultAllowancePercent: 0,
        },
        {
          bindingId: 'read-life-binding',
          scopeKind: 'project',
          scopeId: seed.projectId,
          workItemTypeId: null,
          position: 10,
        },
        seed.stamp,
      )
    ).ok,
  ).toBe(true);
}
async function insertUsage(
  port: StepCatalogueFixture['source']['stores'],
  fixture: StepCatalogueFixture,
) {
  const { seed } = fixture;
  await port.workItems.insert(
    workItemRow({
      id: 'read-life-leaf',
      name: 'Usage leaf',
      workPackageId: seed.workPackageId,
      position: 0,
    }),
    [],
    seed.stamp,
  );
  expect(
    await port.estimates.set(
      {
        workItemId: 'read-life-leaf',
        stepId: 'read-life-step',
        optimistic: 1,
        realistic: 2,
        pessimistic: 3,
      },
      seed.stamp,
    ),
  ).toBe('written');
}
async function exercise(fixture: StepCatalogueFixture, selected: CatalogueUsageReadCase) {
  const { source, port, seed } = fixture;
  await prepareUsage(fixture);
  const empty = { count: 0, pairs: [] };
  expect(projectUsage(await readUsage(port, fixture), fixture)).toEqual(empty);
  if (selected === 'staged-rollback') {
    const before = fixture.readEvidence();
    await source.uow.run(async ({ stores }) => {
      await insertUsage(stores, fixture);
      expect(projectUsage(await readUsage(stores.stepCatalogue, fixture), fixture)).toEqual({
        count: 1,
        pairs: [
          {
            id: 'read-life-leaf',
            name: 'Usage leaf',
            workPackageId: seed.workPackageId,
            stepId: 'read-life-step',
            facts: ['estimate'],
          },
        ],
      });
      expect(projectUsage(await readUsage(port, fixture), fixture)).toEqual(empty);
      return { commit: false, value: undefined };
    });
    expect(projectUsage(await readUsage(port, fixture), fixture)).toEqual(empty);
    expect(fixture.readEvidence()).toEqual(before);
    return;
  }
  if (selected === 'source-closed') {
    const detached = await readUsage(port, fixture);
    await fixture.close();
    await expectClosed(() => port.readUsage(seed.organizationId));
    expect(projectUsage(detached, fixture)).toEqual(empty);
    return;
  }
  if (selected === 'snapshot') {
    await insertUsage(source.stores, fixture);
    const before = fixture.readEvidence(),
      captured = await readUsage(port, fixture),
      original = structuredClone(captured);
    expect(captured.packages.map((workPackage) => workPackage.chain.workPackageId).sort()).toEqual(
      [seed.workPackageId, seed.siblingWorkPackageId].sort(),
    );
    expect(projectUsage(captured, fixture)).toEqual({
      count: 1,
      pairs: [
        {
          id: 'read-life-leaf',
          name: 'Usage leaf',
          workPackageId: seed.workPackageId,
          stepId: 'read-life-step',
          facts: ['estimate'],
        },
      ],
    });
    expect(await port.readUsage('absent-usage-org')).toBeNull();
    const workPackage = captured.packages.find(
        (workPackage) => workPackage.chain.workPackageId === seed.workPackageId,
      ),
      fact = captured.facts.at(0),
      binding = captured.bindings.at(0);
    if (workPackage === undefined || fact === undefined || binding === undefined)
      throw Error('actual mutable reply specimen absent');
    Reflect.set(workPackage.chain, 'projectId', 'caller-project');
    Reflect.set(fact.endpoint, 'workItemId', 'caller-leaf');
    Reflect.set(binding.step, 'name', 'Caller step');
    expect(await readUsage(port, fixture)).toEqual(original);
    expect(fixture.readEvidence()).toEqual(before);
    return;
  }
  const retained: { port: StepCatalogue | undefined } = { port: undefined };
  const useLoan = async (stores: StepCatalogueFixture['source']['stores']) => {
    retained.port = stores.stepCatalogue;
    expect(projectUsage(await readUsage(stores.stepCatalogue, fixture), fixture)).toEqual(empty);
  };
  if (selected === 'ordinary')
    await source.uow.run(async ({ stores }) => {
      await useLoan(stores);
      return { commit: false, value: undefined };
    });
  else
    await source.uow.run<undefined>(() =>
      Promise.resolve({
        commit: false,
        value: undefined,
        afterRollback: async ({ stores }) => {
          await useLoan(stores);
        },
      }),
    );
  const expired = retained.port;
  if (expired === undefined) throw Error('actual usage loan was not retained');
  const before = fixture.readEvidence();
  await expectClosed(() => expired.readUsage(seed.organizationId));
  await source.uow.run(async ({ stores }) => {
    expect(projectUsage(await readUsage(stores.stepCatalogue, fixture), fixture)).toEqual(empty);
    await expectClosed(() => expired.readUsage(seed.organizationId));
    return { commit: false, value: undefined };
  });
  expect(fixture.readEvidence()).toEqual(before);
}

/** Owns the genuine fixture until its usage observations and cleanup settle. */
export async function runCatalogueUsageReadCase(
  fixture: StepCatalogueFixture,
  selected: CatalogueUsageReadCase,
) {
  let primary: { cause: unknown } | undefined;
  try {
    await exercise(fixture, selected);
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await fixture.close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError([primary.cause, cleanup], 'usage read and fixture close failed', {
        cause: cleanup,
      });
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}
