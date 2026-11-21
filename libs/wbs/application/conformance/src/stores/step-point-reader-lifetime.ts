import type {
  StoredActual,
  StoredProgress,
  TransactionalStores,
  ValueGroupPlacement,
} from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';
import type { StepCatalogueCaseId } from './step-catalogue';

type Family = 'actual' | 'progress';
type Point = StoredActual | StoredProgress;
interface PointReads {
  listByWorkPackage(workPackageId: string): Promise<readonly Point[]>;
  listByWorkItems(workPackageId: string, ids: readonly string[]): Promise<readonly Point[]>;
  listPlacements(
    workPackageId: string,
    ids: readonly string[],
  ): Promise<readonly ValueGroupPlacement[]>;
}
type Attempt<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly cause: unknown };

async function capture<Value>(read: () => Promise<Value>): Promise<Attempt<Value>> {
  try {
    return { ok: true, value: await read() };
  } catch (cause: unknown) {
    return { ok: false, cause };
  }
}

function pointReads(stores: TransactionalStores, family: Family): PointReads {
  return family === 'actual' ? stores.actuals : stores.progress;
}

/** Settle all three real calls before the first refusal oracle, including an unexpected success. */
async function captureReads(
  port: PointReads,
  workPackageId: string,
  first: string,
  second: string,
) {
  const full = await capture(() => port.listByWorkPackage(workPackageId));
  const targeted = await capture(() => port.listByWorkItems(workPackageId, [first]));
  const placements = await capture(() => port.listPlacements(workPackageId, [second]));
  return { full, targeted, placements };
}

function expectClosed(attempt: Attempt<unknown>): void {
  expect(attempt.ok).toBe(false);
  if (attempt.ok) throw new Error('expired point reader unexpectedly resolved');
  expect(attempt.cause).toBeInstanceOf(Error);
  if (!(attempt.cause instanceof Error)) throw attempt.cause;
  expect(attempt.cause.message).toContain('closed');
}

async function prepareLifetime(fixture: StepCatalogueFixture, family: Family) {
  const { source, port, seed } = fixture;
  const stepId = family + '-lifetime-step';
  const firstId = family + '-lifetime-a';
  const secondId = family + '-lifetime-b';
  expect(
    (
      await port.defineAndBindStep(
        seed.organizationId,
        {
          id: stepId,
          code: stepId,
          name: stepId,
          position: 10,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 12.5,
        },
        {
          bindingId: family + '-lifetime-binding',
          scopeKind: 'project',
          scopeId: seed.projectId,
          workItemTypeId: null,
          position: 10,
        },
        seed.stamp,
      )
    ).ok,
  ).toBe(true);
  expect(
    (await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(
      ({ stepId: id }) => id,
    ),
  ).toEqual([stepId]);
  for (const [id, position] of [
    [secondId, 20],
    [firstId, 10],
  ] as const) {
    await source.stores.workItems.insert(
      workItemRow({
        id,
        workPackageId: seed.workPackageId,
        name: id,
        position,
      }),
      [],
      seed.stamp,
    );
  }
  const actuals: readonly StoredActual[] = [
    { workItemId: firstId, stepId, days: 1.25, recordedAt: 101 },
    { workItemId: secondId, stepId, days: 2.5, recordedAt: 102 },
  ];
  const progress: readonly StoredProgress[] = [
    { workItemId: firstId, stepId, state: 'in_progress', statedAt: 201 },
    { workItemId: secondId, stepId, state: 'done', statedAt: 202 },
  ];
  if (family === 'actual') {
    for (const fact of [...actuals].reverse())
      expect(await source.stores.actuals.set(fact, seed.stamp)).toBe('written');
  } else {
    for (const fact of [...progress].reverse())
      expect(await source.stores.progress.set(fact, seed.stamp)).toBe('written');
  }
  const expected: readonly Point[] = family === 'actual' ? actuals : progress;
  const first = expected.at(0);
  if (first === undefined) throw new Error('point lifetime fixture is empty');
  const expectedTargeted: readonly Point[] = [first];
  const expectedPlacements: readonly ValueGroupPlacement[] = [{ id: secondId, afterId: firstId }];
  const before = fixture.readEvidence();
  const captured: unknown = family === 'actual' ? before.actuals : before.progress;
  expect(captured).toEqual(expected);
  const reader = pointReads(source.stores, family);
  const full = await reader.listByWorkPackage(seed.workPackageId);
  const targeted = await reader.listByWorkItems(seed.workPackageId, [firstId]);
  const placements = await reader.listPlacements(seed.workPackageId, [secondId]);
  expect(full).toEqual(expected);
  expect(targeted).toEqual(expectedTargeted);
  expect(placements).toEqual(expectedPlacements);
  expect(fixture.readEvidence()).toEqual(before);
  return {
    firstId,
    secondId,
    expected,
    expectedTargeted,
    expectedPlacements,
    full,
    targeted,
    placements,
  };
}

interface LifetimeCase {
  readonly caseId: StepCatalogueCaseId;
  assert(fixture: StepCatalogueFixture): Promise<void>;
}

/** Actual current catalogue/facts precede Source ownership checks; repair and held post-await cases remain separate owners. */
export const STEP_POINT_READER_LIFETIME_ASSERTIONS: readonly LifetimeCase[] = lifetimeCases();

function lifetimeCases(): readonly LifetimeCase[] {
  const families: readonly Family[] = ['actual', 'progress'];
  return families.flatMap<LifetimeCase>((family) => [
    {
      caseId:
        family === 'actual'
          ? 'stepCatalogue.factRead:actual-borrowed-expiry'
          : 'stepCatalogue.factRead:progress-borrowed-expiry',
      async assert(fixture) {
        const { source, seed } = fixture;
        const prepared = await prepareLifetime(fixture, family);
        const committedId = family + '-lifetime-committed';
        const retained = await source.uow.run(async ({ stores }) => {
          const reader = pointReads(stores, family);
          expect(await reader.listByWorkPackage(seed.workPackageId)).toEqual(prepared.expected);
          expect(await reader.listByWorkItems(seed.workPackageId, [prepared.firstId])).toEqual(
            prepared.expectedTargeted,
          );
          expect(await reader.listPlacements(seed.workPackageId, [prepared.secondId])).toEqual(
            prepared.expectedPlacements,
          );
          await stores.workItems.insert(
            workItemRow({
              id: committedId,
              workPackageId: seed.workPackageId,
              name: 'Independent committed row',
              position: 30,
            }),
            [],
            seed.stamp,
          );
          return { commit: true, value: reader };
        });
        expect(
          (await source.stores.workItems.listByWorkPackage(seed.workPackageId))
            .map(({ id }) => id)
            .sort(),
        ).toEqual([prepared.firstId, prepared.secondId, committedId]);
        const committed = fixture.readEvidence();
        const expired = await captureReads(
          retained,
          seed.workPackageId,
          prepared.firstId,
          prepared.secondId,
        );
        expectClosed(expired.full);
        expectClosed(expired.targeted);
        expectClosed(expired.placements);
        expect(fixture.readEvidence()).toEqual(committed);
        await source.uow.run(async ({ stores }) => {
          const current = pointReads(stores, family);
          expect(await current.listByWorkPackage(seed.workPackageId)).toEqual(prepared.expected);
          expect(await current.listByWorkItems(seed.workPackageId, [prepared.firstId])).toEqual(
            prepared.expectedTargeted,
          );
          expect(await current.listPlacements(seed.workPackageId, [prepared.secondId])).toEqual(
            prepared.expectedPlacements,
          );
          const stillExpired = await captureReads(
            retained,
            seed.workPackageId,
            prepared.firstId,
            prepared.secondId,
          );
          expectClosed(stillExpired.full);
          expectClosed(stillExpired.targeted);
          expectClosed(stillExpired.placements);
          return { commit: true, value: undefined };
        });
        expect(fixture.readEvidence()).toEqual(committed);
      },
    },
    {
      caseId:
        family === 'actual'
          ? 'stepCatalogue.factRead:actual-public-source-close'
          : 'stepCatalogue.factRead:progress-public-source-close',
      async assert(fixture) {
        const { source, seed } = fixture;
        const prepared = await prepareLifetime(fixture, family);
        const retained = pointReads(source.stores, family);
        const beforeClose = fixture.readEvidence();
        const beforePoints: unknown =
          family === 'actual' ? beforeClose.actuals : beforeClose.progress;
        expect(beforePoints).toEqual(prepared.expected);
        await fixture.close();
        const closed = await captureReads(
          retained,
          seed.workPackageId,
          prepared.firstId,
          prepared.secondId,
        );
        expectClosed(closed.full);
        expectClosed(closed.targeted);
        expectClosed(closed.placements);
        expect(prepared.full).toEqual(prepared.expected);
        expect(prepared.targeted).toEqual(prepared.expectedTargeted);
        expect(prepared.placements).toEqual(prepared.expectedPlacements);
        const retainedPoints: unknown =
          family === 'actual' ? beforeClose.actuals : beforeClose.progress;
        expect(retainedPoints).toEqual(prepared.expected);
      },
    },
  ]);
}
