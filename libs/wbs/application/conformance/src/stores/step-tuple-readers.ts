import type {
  IssuedAttemptNumber,
  StoredAttempt,
  StoredMeasure,
  StoredMeasureEstimate,
} from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';

async function prepareTupleScope(fixture: StepCatalogueFixture) {
  const { source, port, seed } = fixture;
  const firstId = 'z-tuple-organization',
    secondId = 'a-tuple-project';
  for (const authored of [
    { id: firstId, scopeKind: 'organization' as const, scopeId: seed.organizationId, position: 50 },
    { id: secondId, scopeKind: 'project' as const, scopeId: seed.projectId, position: 5 },
  ]) {
    expect(
      (
        await port.defineAndBindStep(
          seed.organizationId,
          {
            id: authored.id,
            code: authored.id,
            name: authored.id,
            position: authored.position,
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: 12.5,
          },
          {
            bindingId: authored.id + ':binding',
            scopeKind: authored.scopeKind,
            scopeId: authored.scopeId,
            workItemTypeId: null,
            position: authored.position,
          },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
  }
  expect(
    (await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(
      ({ stepId }) => stepId,
    ),
  ).toEqual([firstId, secondId]);
  const firstLeaf = 'tuple-first-leaf',
    otherLeaf = 'tuple-other-leaf',
    siblingLeaf = 'tuple-sibling-leaf';
  for (const [id, workPackageId, position] of [
    [firstLeaf, seed.workPackageId, 10],
    [otherLeaf, seed.workPackageId, 20],
    [siblingLeaf, seed.siblingWorkPackageId, 10],
  ] as const) {
    await source.stores.workItems.insert(
      workItemRow({ id, workPackageId, name: id, position }),
      [],
      seed.stamp,
    );
  }
  return { firstId, secondId, firstLeaf, otherLeaf, siblingLeaf };
}

async function prepareMeasures(fixture: StepCatalogueFixture) {
  const scope = await prepareTupleScope(fixture),
    { source, seed } = fixture;
  const basis = { currency: 'USD', rateCardDigest: 'tuple-measure-card' };
  const first: StoredMeasure = {
    workItemId: scope.firstLeaf,
    stepId: scope.firstId,
    metric: 'cost',
    value: 1250,
    recordedAt: 101,
    basis,
  };
  const second: StoredMeasure = {
    workItemId: scope.firstLeaf,
    stepId: scope.firstId,
    metric: 'hours_actual',
    value: 1.25,
    recordedAt: 102,
  };
  const third: StoredMeasure = {
    workItemId: scope.firstLeaf,
    stepId: scope.firstId,
    metric: 'token_actual',
    value: 3,
    recordedAt: 103,
  };
  const later: StoredMeasure = {
    workItemId: scope.firstLeaf,
    stepId: scope.secondId,
    metric: 'hours_actual',
    value: 2.5,
    recordedAt: 104,
  };
  const other: StoredMeasure = {
    workItemId: scope.otherLeaf,
    stepId: scope.firstId,
    metric: 'hours_actual',
    value: 3.75,
    recordedAt: 105,
  };
  const sibling: StoredMeasure = {
    workItemId: scope.siblingLeaf,
    stepId: scope.firstId,
    metric: 'hours_actual',
    value: 4.5,
    recordedAt: 106,
  };
  const expected = [first, second, third, later, other];
  for (const fact of [later, third, other, sibling, second, first])
    expect(await source.stores.measures.set(fact, seed.stamp)).toBe('written');
  const raw = [later, first, second, third, other, sibling].map(({ basis: priced, ...row }) => ({
    ...row,
    currency: priced?.currency ?? null,
    rateCardDigest: priced?.rateCardDigest ?? null,
  }));
  expect(fixture.readEvidence().tuples.measures).toEqual(raw);
  return { ...scope, expected, targeted: [first, second, third, later] };
}

async function prepareTrios(fixture: StepCatalogueFixture) {
  const scope = await prepareTupleScope(fixture),
    { source, seed } = fixture;
  const basis = { currency: 'USD', rateCardDigest: 'tuple-trio-card' };
  const first: StoredMeasureEstimate = {
    workItemId: scope.firstLeaf,
    stepId: scope.firstId,
    key: 'cost',
    optimistic: 100,
    realistic: 200,
    pessimistic: 300,
    singlePoint: false,
    basis,
  };
  const second: StoredMeasureEstimate = {
    workItemId: scope.firstLeaf,
    stepId: scope.firstId,
    key: 'tokens',
    optimistic: 1,
    realistic: 2,
    pessimistic: 3,
    singlePoint: false,
  };
  const later: StoredMeasureEstimate = {
    workItemId: scope.firstLeaf,
    stepId: scope.secondId,
    key: 'tokens',
    optimistic: 4,
    realistic: 5,
    pessimistic: 6,
    singlePoint: false,
  };
  const other: StoredMeasureEstimate = {
    workItemId: scope.otherLeaf,
    stepId: scope.firstId,
    key: 'tokens',
    optimistic: 7,
    realistic: 8,
    pessimistic: 9,
    singlePoint: false,
  };
  const sibling: StoredMeasureEstimate = {
    workItemId: scope.siblingLeaf,
    stepId: scope.firstId,
    key: 'tokens',
    optimistic: 10,
    realistic: 11,
    pessimistic: 12,
    singlePoint: false,
  };
  for (const fact of [later, second, other, sibling, first])
    expect(await source.stores.measureEstimates.set(fact, seed.stamp)).toBe('written');
  expect(fixture.readEvidence().tuples.measureEstimates).toEqual(
    [later, first, second, other, sibling].map(({ basis: priced, ...row }) => ({
      ...row,
      currency: priced?.currency ?? null,
      rateCardDigest: priced?.rateCardDigest ?? null,
    })),
  );
  return { ...scope, expected: [first, second, later, other] };
}

async function prepareAttempts(fixture: StepCatalogueFixture) {
  const scope = await prepareTupleScope(fixture),
    { source, seed } = fixture;
  const first: StoredAttempt = {
    workItemId: scope.firstLeaf,
    stepId: scope.firstId,
    attemptNumber: 2,
    startedAt: 10,
    endedAt: 20,
    outcome: 'failed',
    executorPersonId: null,
    reference: 'first-reference',
    note: 'first-note',
  };
  const second: StoredAttempt = {
    workItemId: scope.firstLeaf,
    stepId: scope.firstId,
    attemptNumber: 7,
    startedAt: 30,
    endedAt: null,
    outcome: null,
    executorPersonId: null,
    reference: 'running-reference',
    note: null,
  };
  const later: StoredAttempt = {
    workItemId: scope.firstLeaf,
    stepId: scope.secondId,
    attemptNumber: 1,
    startedAt: 5,
    endedAt: 8,
    outcome: 'succeeded',
    executorPersonId: null,
    reference: null,
    note: 'other-step',
  };
  const other: StoredAttempt = {
    workItemId: scope.otherLeaf,
    stepId: scope.firstId,
    attemptNumber: 3,
    startedAt: 40,
    endedAt: 50,
    outcome: 'cancelled',
    executorPersonId: null,
    reference: null,
    note: null,
  };
  const sibling: StoredAttempt = {
    workItemId: scope.siblingLeaf,
    stepId: scope.firstId,
    attemptNumber: 4,
    startedAt: 60,
    endedAt: 70,
    outcome: 'succeeded',
    executorPersonId: null,
    reference: null,
    note: null,
  };
  for (const fact of [second, later, other, sibling, first])
    await source.stores.attempts.restore(fact, seed.stamp);
  // A counter-only pair is independently retained even though it has no attempt row.
  await source.stores.attempts.raiseIssued([
    { workItemId: scope.otherLeaf, stepId: scope.secondId, issued: 19 },
  ]);
  const rawIssued: readonly IssuedAttemptNumber[] = [
    { workItemId: scope.firstLeaf, stepId: scope.secondId, issued: 1 },
    { workItemId: scope.firstLeaf, stepId: scope.firstId, issued: 7 },
    { workItemId: scope.otherLeaf, stepId: scope.secondId, issued: 19 },
    { workItemId: scope.otherLeaf, stepId: scope.firstId, issued: 3 },
    { workItemId: scope.siblingLeaf, stepId: scope.firstId, issued: 4 },
  ];
  const raw = fixture.readEvidence().tuples;
  expect(raw.attempts).toEqual([later, first, second, other, sibling]);
  expect(raw.issued).toEqual(rawIssued);
  return {
    ...scope,
    first,
    second,
    later,
    expected: [first, second, later, other],
    targeted: [first, second, later],
    issued: rawIssued.slice(0, 4),
  };
}

/** Full tuple identity is metric/key/attempt number, while visible step order comes from actual SC18 resolution. */
export const STEP_TUPLE_READER_ASSERTIONS = [
  {
    caseId: 'stepCatalogue.factRead:measures-current-tuples',
    async assert(fixture: StepCatalogueFixture) {
      const prepared = await prepareMeasures(fixture),
        before = fixture.readEvidence();
      expect(
        await fixture.source.stores.measures.listByWorkPackage(fixture.seed.workPackageId),
      ).toEqual(prepared.expected);
      expect(fixture.readEvidence()).toEqual(before);
    },
  },
  {
    caseId: 'stepCatalogue.factRead:measures-targeted-tuples',
    async assert(fixture: StepCatalogueFixture) {
      const prepared = await prepareMeasures(fixture),
        before = fixture.readEvidence(),
        { source, seed } = fixture;
      expect(
        await source.stores.measures.listByWorkItems(seed.workPackageId, [
          prepared.firstLeaf,
          prepared.firstLeaf,
          prepared.siblingLeaf,
          'absent-tuple-leaf',
        ]),
      ).toEqual(prepared.targeted);
      expect(
        await source.stores.measures.listByWorkItems(seed.siblingWorkPackageId, [
          prepared.firstLeaf,
        ]),
      ).toEqual([]);
      expect(await source.stores.measures.listByWorkItems(seed.workPackageId, [])).toEqual([]);
      expect(
        await source.stores.measures.listPlacements(seed.workPackageId, [
          prepared.otherLeaf,
          prepared.otherLeaf,
          prepared.siblingLeaf,
        ]),
      ).toEqual([{ id: prepared.otherLeaf, afterId: prepared.firstLeaf }]);
      expect(fixture.readEvidence()).toEqual(before);
    },
  },
  {
    caseId: 'stepCatalogue.factRead:measure-estimates-current-tuples',
    async assert(fixture: StepCatalogueFixture) {
      const prepared = await prepareTrios(fixture),
        before = fixture.readEvidence();
      expect(
        await fixture.source.stores.measureEstimates.listByWorkPackage(fixture.seed.workPackageId),
      ).toEqual(prepared.expected);
      expect(
        await fixture.source.stores.measureEstimates.listByWorkPackage(
          fixture.seed.foreignWorkPackageId,
        ),
      ).toEqual([]);
      expect(fixture.readEvidence()).toEqual(before);
    },
  },
  {
    caseId: 'stepCatalogue.factRead:attempts-current-tuples',
    async assert(fixture: StepCatalogueFixture) {
      const prepared = await prepareAttempts(fixture),
        before = fixture.readEvidence();
      expect(
        await fixture.source.stores.attempts.listByWorkPackage(fixture.seed.workPackageId),
      ).toEqual(prepared.expected);
      expect(fixture.readEvidence()).toEqual(before);
    },
  },
  {
    caseId: 'stepCatalogue.factRead:attempts-targeted-tuples',
    async assert(fixture: StepCatalogueFixture) {
      const prepared = await prepareAttempts(fixture),
        before = fixture.readEvidence(),
        { source, seed } = fixture;
      expect(
        await source.stores.attempts.listByWorkItems(seed.workPackageId, [
          prepared.firstLeaf,
          prepared.firstLeaf,
          prepared.siblingLeaf,
          'absent-tuple-leaf',
        ]),
      ).toEqual(prepared.targeted);
      expect(
        await source.stores.attempts.listByWorkItems(seed.siblingWorkPackageId, [
          prepared.firstLeaf,
        ]),
      ).toEqual([]);
      expect(await source.stores.attempts.listByWorkItems(seed.workPackageId, [])).toEqual([]);
      const byStep = await source.stores.attempts.listOfWorkItem(prepared.firstLeaf);
      expect(byStep.size).toBe(2);
      expect(byStep.get(prepared.firstId)).toEqual([prepared.first, prepared.second]);
      expect(byStep.get(prepared.secondId)).toEqual([prepared.later]);
      expect(byStep.get('absent-tuple-step')).toBeUndefined();
      expect(fixture.readEvidence()).toEqual(before);
    },
  },
  {
    caseId: 'stepCatalogue.factRead:issued-counter-selection',
    async assert(fixture: StepCatalogueFixture) {
      const prepared = await prepareAttempts(fixture),
        before = fixture.readEvidence(),
        { source, seed } = fixture;
      // This counter port explicitly promises step-ID order, rather than visible step ordinal order.
      expect(
        await source.stores.attempts.listIssued(seed.workPackageId, [
          prepared.otherLeaf,
          prepared.firstLeaf,
          prepared.firstLeaf,
          prepared.siblingLeaf,
          'absent-tuple-leaf',
        ]),
      ).toEqual(prepared.issued);
      expect(
        await source.stores.attempts.listIssued(seed.siblingWorkPackageId, [prepared.firstLeaf]),
      ).toEqual([]);
      expect(await source.stores.attempts.listIssued(seed.workPackageId, [])).toEqual([]);
      expect(fixture.readEvidence()).toEqual(before);
    },
  },
] as const;
