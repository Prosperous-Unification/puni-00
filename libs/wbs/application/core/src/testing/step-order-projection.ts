import { expect } from 'bun:test';

import type { Source } from '../ports/source';
import type { WorkItemStepProjection, WorkItemStore } from '../ports/work-item-store';
import {
  CLAIM_DEV,
  CLAIM_QA,
  expectClaimFailure,
  seedCurrentClaimObservation,
} from './current-claim-observation';
import type { StepCatalogueSeed } from './step-catalogue-seed';

export const STEP_ORDER_PROJECTION_CASES = [
  'current',
  'parent',
  'fresh',
  'untyped',
  'retype',
  'absent-type',
  'repeated-type',
  'foreign-type',
  'repeated-row',
  'foreign-owner',
  'foreign-stored-id',
  'orphan',
  'cycle',
  'extra-type-entry',
  'repeated-type-entry',
  'unknown-package',
] as const;

/** Actual Sources must resolve proposed leaf topology without mutating stored rows or borrowing display metadata. */
export async function assertStepOrderProjection(
  source: Source,
  seed: StepCatalogueSeed,
  purpose: (typeof STEP_ORDER_PROJECTION_CASES)[number],
): Promise<void> {
  await seedCurrentClaimObservation(source, seed);
  expect(typeof Reflect.get(source.stores.workItems, 'resolveStepOrders')).toBe('function');
  const stored = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
  const rows = stored.map(({ id, workPackageId, parentId }) => ({ id, workPackageId, parentId }));
  const directTypes: { workItemId: string; typeIds: string[] }[] = [];
  const projection = { rows, directTypes };
  let workPackageId = seed.workPackageId;
  const expected = new Map([
    ['claim-first', [CLAIM_DEV, CLAIM_QA]],
    ['claim-second', [CLAIM_QA, CLAIM_DEV]],
    ['claim-empty', []],
  ]);
  let refusal: string | undefined;
  if (purpose === 'parent') {
    expect(
      (
        await source.stores.workItems.patch(
          'claim-parent',
          { typeIds: [seed.secondTypeId] },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
    projection.rows = rows.filter((row) => row.id !== 'claim-first' && row.id !== 'claim-second');
    expected.delete('claim-first');
    expected.delete('claim-second');
    expected.set('claim-parent', [CLAIM_QA, CLAIM_DEV]);
  }
  if (purpose === 'fresh' || purpose === 'untyped' || purpose === 'absent-type') {
    rows.push({ id: 'proposed-child', workPackageId, parentId: 'claim-parent' });
    if (purpose !== 'absent-type')
      directTypes.push({
        workItemId: 'proposed-child',
        typeIds: purpose === 'untyped' ? [] : [seed.typeId],
      });
    expected.set('proposed-child', purpose === 'untyped' ? [] : [CLAIM_DEV, CLAIM_QA]);
    if (purpose === 'absent-type') refusal = 'fresh step projection lacks direct types';
  }
  if (purpose === 'retype') {
    directTypes.push({ workItemId: 'claim-first', typeIds: [seed.secondTypeId] });
    expected.set('claim-first', [CLAIM_QA, CLAIM_DEV]);
  }
  if (purpose === 'repeated-type' || purpose === 'foreign-type') {
    directTypes.push({
      workItemId: 'claim-first',
      typeIds: purpose === 'repeated-type' ? [seed.typeId, seed.typeId] : [seed.foreignTypeId],
    });
    refusal =
      purpose === 'repeated-type' ? 'duplicate type membership' : 'type ownership is inconsistent';
  }
  if (purpose === 'repeated-row') {
    rows.push({ ...rows[0] });
    refusal = 'duplicate step projection row';
  }
  if (purpose === 'foreign-owner') {
    rows[0] = { ...rows[0], workPackageId: seed.foreignWorkPackageId };
    refusal = 'step projection row has another work package';
  }
  if (purpose === 'foreign-stored-id') {
    const foreign = stored.at(0);
    if (foreign === undefined) throw new Error('Projection fixture has no source row');
    await source.stores.workItems.insert(
      {
        ...foreign,
        id: 'foreign-existing',
        workPackageId: seed.foreignWorkPackageId,
        parentId: null,
      },
      [],
      seed.stamp,
    );
    rows.push({ id: 'foreign-existing', workPackageId, parentId: null });
    directTypes.push({ workItemId: 'foreign-existing', typeIds: [] });
    refusal = 'step projection reuses a foreign row';
  }
  if (purpose === 'orphan') {
    rows[0] = { ...rows[0], parentId: 'absent-parent' };
    refusal = 'parent';
  }
  if (purpose === 'cycle') {
    projection.rows = rows.map((row) =>
      row.id === 'claim-parent' ? { ...row, parentId: 'claim-first' } : row,
    );
    refusal = 'parent_cycle';
  }
  if (purpose === 'extra-type-entry') {
    directTypes.push({ workItemId: 'absent-row', typeIds: [] });
    refusal = 'step projection type owner is absent';
  }
  if (purpose === 'repeated-type-entry') {
    directTypes.push(
      { workItemId: 'claim-first', typeIds: [] },
      { workItemId: 'claim-first', typeIds: [seed.typeId] },
    );
    refusal = 'duplicate step projection type owner';
  }
  if (purpose === 'unknown-package') {
    workPackageId = 'absent-package';
    refusal = 'step projection work package is absent';
  }
  const before = await source.stores.workItems.listByWorkPackage(seed.workPackageId);
  const pending = source.stores.workItems.resolveStepOrders(workPackageId, projection);
  if (refusal !== undefined) {
    const observed = await pending.then(
      () => ({ kind: 'returned' as const }),
      (cause: unknown) => ({ kind: 'threw' as const, cause }),
    );
    expect(observed.kind).toBe('threw');
    if (observed.kind !== 'threw' || !(observed.cause instanceof Error))
      throw new Error('Malformed projection was accepted');
    expect(observed.cause.message).toContain(refusal);
  } else {
    const orders = await pending;
    expect(new Map(orders.map((leaf) => [leaf.workItemId, leaf.stepIds]))).toEqual(expected);
  }
  expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual(before);
}

/** Candidate metadata is borrowed for the same ordinary or repair turn as its owning rows. */
export async function assertStepOrderLoanExpiry(
  source: Source,
  seed: StepCatalogueSeed,
  settlement: 'commit' | 'rollback' | 'repair',
): Promise<void> {
  await seedCurrentClaimObservation(source, seed);
  const projection: WorkItemStepProjection = {
    rows: await source.stores.workItems.listByWorkPackage(seed.workPackageId),
    directTypes: [],
  };
  let retained: WorkItemStore | undefined;
  const capture = async (store: WorkItemStore) => {
    retained = store;
    expect((await store.resolveStepOrders(seed.workPackageId, projection)).length).toBe(3);
  };
  await source.uow.run(async ({ stores }) => {
    if (settlement !== 'repair') await capture(stores.workItems);
    return settlement === 'commit'
      ? { commit: true, value: undefined }
      : {
          commit: false,
          value: undefined,
          ...(settlement === 'repair'
            ? { afterRollback: async ({ stores: repair }) => capture(repair.workItems) }
            : {}),
        };
  });
  if (retained === undefined) throw new Error('candidate order loan was not captured');
  const escaped = retained.resolveStepOrders.bind(retained);
  for (const id of [seed.workPackageId, 'missing-candidate-owner'])
    await expectClaimFailure(() => escaped(id, projection), 'closed');
  await source.uow.run(async ({ stores }) => {
    expect((await stores.workItems.resolveStepOrders(seed.workPackageId, projection)).length).toBe(
      3,
    );
    await expectClaimFailure(() => escaped(seed.workPackageId, projection), 'closed');
    return { commit: true, value: undefined };
  });
}
