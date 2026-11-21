import { expect } from 'bun:test';

import { findWorkPackageClaims } from '../module/work-item/work-package-claims';
import type { ClaimStore } from '../ports/claim-store';
import type { ResourceAccess } from '../ports/organization-access';
import type { Source } from '../ports/source';
import type { StepCatalogueSeed } from './step-catalogue-seed';
import { workItemRow } from './work-item-fixture';

export const CLAIM_DEV = 'claim-step-z-dev';
export const CLAIM_QA = 'claim-step-a-qa';
export const CLAIM_PERSON = 'claim-current-person';

/** Authors current catalogue and actual claims; each adapter supplies its own person ownership. */
export async function seedCurrentClaimObservation(
  source: Source,
  seed: StepCatalogueSeed,
): Promise<void> {
  const catalogue = source.stores.stepCatalogue;
  for (const [id, position] of [
    [CLAIM_DEV, 10],
    [CLAIM_QA, 20],
  ] as const) {
    expect(
      (
        await catalogue.defineAndBindStep(
          seed.organizationId,
          {
            id,
            code: id,
            name: id,
            position,
            defaultAllowancePercent: 0,
            defaultEstimateUnit: 'workdays',
          },
          {
            bindingId: id + ':first',
            scopeKind: 'project',
            scopeId: seed.projectId,
            workItemTypeId: seed.typeId,
            position,
          },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await catalogue.bindStep(
          seed.organizationId,
          {
            bindingId: id + ':second',
            stepId: id,
            scopeKind: 'project',
            scopeId: seed.projectId,
            workItemTypeId: seed.secondTypeId,
            position: 30 - position,
          },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
  }
  for (const [id, parentId, position, typeIds] of [
    ['claim-parent', null, 10, []],
    ['claim-first', 'claim-parent', 10, [seed.typeId]],
    ['claim-second', 'claim-parent', 20, [seed.secondTypeId]],
    ['claim-empty', null, 20, []],
  ] as const) {
    await source.stores.workItems.insert(
      workItemRow({
        id,
        parentId,
        position,
        name: id,
        workPackageId: seed.workPackageId,
      }),
      [],
      seed.stamp,
    );
    expect((await source.stores.workItems.patch(id, { typeIds }, seed.stamp)).ok).toBe(true);
  }
  expect(
    (
      await source.stores.directory.addPerson(
        { id: CLAIM_PERSON, name: 'Claim person' },
        [],
        seed.stamp,
      )
    ).ok,
  ).toBe(true);
}

/** Writes through the real claim store after person ownership has been installed. */
export async function writeCurrentClaims(source: Source, seed: StepCatalogueSeed): Promise<void> {
  for (const [id, workItemId, stepId] of [
    ['claim-9-first-dev', 'claim-first', CLAIM_DEV],
    ['claim-1-first-qa', 'claim-first', CLAIM_QA],
    ['claim-9-second-dev', 'claim-second', CLAIM_DEV],
    ['claim-1-second-qa', 'claim-second', CLAIM_QA],
    ['claim-subtree', 'claim-parent', null],
  ] as const)
    expect(
      await source.stores.claims.add(
        [
          {
            id,
            workItemId,
            stepId,
            personId: CLAIM_PERSON,
            runId: 'run:' + id,
            parentClaimId: null,
            accountId: seed.stamp.by,
          },
        ],
        [],
        seed.stamp,
        [],
      ),
    ).toBe('written');
}

/** Public projection consumes actual adapter evidence, with no manufactured catalogue context. */
export async function assertCurrentClaimObservation(
  source: Source,
  seed: StepCatalogueSeed,
  access: ResourceAccess,
): Promise<void> {
  const observed = await source.stores.claims.observeWorkPackage(seed.workPackageId, access);
  if (observed.kind !== 'observed')
    throw new Error('current claim observation refused: ' + observed.kind);
  expect(observed.leafSteps).toEqual(
    new Map([
      ['claim-first', [CLAIM_DEV, CLAIM_QA]],
      ['claim-second', [CLAIM_QA, CLAIM_DEV]],
      ['claim-empty', []],
    ]),
  );
  const projected = findWorkPackageClaims({ ...observed, readAt: 777_000 });
  expect(projected.claims.map(({ claimId }) => claimId)).toEqual([
    'claim-subtree',
    'claim-9-first-dev',
    'claim-1-first-qa',
    'claim-1-second-qa',
    'claim-9-second-dev',
  ]);
  expect(projected.readAt).toBe(777_000);
  expect(Object.keys(projected).sort()).toEqual(['claims', 'readAt']);
  for (const claim of projected.claims) {
    expect(Object.keys(claim).sort()).toEqual([
      'claimId',
      'claimedAt',
      'holder',
      'leaseExpiresAt',
      'leaseRevokedAt',
      'name',
      'number',
      'numberIsFrozen',
      'parentClaimId',
      'runId',
      'stepId',
      'workItemId',
    ]);
    expect(claim.claimedAt).toBe(seed.stamp.at);
    expect(claim.holder).toEqual({ personId: CLAIM_PERSON, name: 'Claim person' });
  }
  const missing = new Map(observed.leafSteps);
  missing.delete('claim-second');
  expect(() => findWorkPackageClaims({ ...observed, leafSteps: missing, readAt: 777_000 })).toThrow(
    'no resolved step order',
  );
  const empty = new Map(observed.leafSteps);
  empty.set('claim-second', []);
  expect(() => findWorkPackageClaims({ ...observed, leafSteps: empty, readAt: 777_000 })).toThrow(
    'not resolved for',
  );
  expect(await source.stores.claims.observeWorkPackage(seed.workPackageId, access)).toEqual(
    observed,
  );
}

/** Awaits the actual observation before testing its rejection, including synchronous storage failures. */
export async function expectClaimFailure(
  observe: () => Promise<unknown>,
  message: string,
): Promise<void> {
  const failure = await Promise.resolve()
    .then(observe)
    .then(
      () => ({ kind: 'answered' }) as const,
      (cause: unknown) => ({ kind: 'failed', cause }) as const,
    );
  expect(failure.kind).toBe('failed');
  if (failure.kind !== 'failed') throw new Error('claim observation unexpectedly answered');
  expect(String(failure.cause)).toContain(message);
}

/** Retained observations must expire with the actual ordinary or repair loan that lent them. */
export async function assertClaimLoanExpiry(
  source: Source,
  seed: StepCatalogueSeed,
  access: ResourceAccess,
  settlement: 'commit' | 'rollback' | 'repair',
): Promise<void> {
  let retained: ClaimStore | undefined;
  const capture = async (claims: ClaimStore): Promise<void> => {
    retained = claims;
    expect((await claims.observeWorkPackage(seed.workPackageId, access)).kind).toBe('observed');
  };
  await source.uow.run(async ({ stores }) => {
    if (settlement !== 'repair') await capture(stores.claims);
    return settlement === 'commit'
      ? { commit: true, value: undefined }
      : {
          commit: false,
          value: undefined,
          ...(settlement === 'repair'
            ? { afterRollback: async ({ stores: repair }) => capture(repair.claims) }
            : {}),
        };
  });
  if (retained === undefined) throw new Error('claim loan was not captured');
  const claims = retained;
  for (const id of [seed.workPackageId, 'claim-missing-package'])
    await expectClaimFailure(() => claims.observeWorkPackage(id, access), 'closed');
  await source.uow.run(async ({ stores }) => {
    expect((await stores.claims.observeWorkPackage(seed.workPackageId, access)).kind).toBe(
      'observed',
    );
    await expectClaimFailure(() => claims.observeWorkPackage(seed.workPackageId, access), 'closed');
    return { commit: true, value: undefined };
  });
}

/** Fixture teardown preserves the test failure if releasing the actual Source fails too. */
export async function withinClaimFixture(
  close: () => Promise<void>,
  exercise: () => Promise<void>,
): Promise<void> {
  let primary: { cause: unknown } | undefined;
  try {
    await exercise();
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError([primary.cause, cleanup], 'claim case and Source cleanup failed', {
        cause: cleanup,
      });
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}
