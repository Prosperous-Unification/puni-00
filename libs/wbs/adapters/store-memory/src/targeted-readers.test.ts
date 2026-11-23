import type { TransactionalStores, WriteStamp } from '@wbs/core';
import { seedLegacyPackageParent } from '@wbs/core/testing/legacy-package-source-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { afterEach, describe, expect, it } from 'bun:test';

import type { MemorySourceFixture } from './source';
import { openMemorySourceFixture } from './source';
import { workPackageRow } from './work-package-fixture';

const OWNER = 'targeted-memory-owner';
const ORGANIZATION = 'fixture-legacy-org';
const WORK_PACKAGE_A = 'targeted-memory-a';
const WORK_PACKAGE_B = 'targeted-memory-b';
const STEP_A = 'targeted-memory-step-a';
const STEP_B = 'targeted-memory-step-b';
const ROW_A = 'targeted-memory-row-a';
const ROW_B = 'targeted-memory-row-b';
const STAMP: WriteStamp = { at: 1, by: OWNER };
const FIELD_KINDS = ['estimate_field', 'actual_field', 'progress_field', 'measure_field'] as const;
let fixture: MemorySourceFixture | undefined;

afterEach(async () => {
  await fixture?.source.close();
  fixture = undefined;
});

async function openSeededStores() {
  const opened = openMemorySourceFixture();
  fixture = opened;
  const stores = opened.source.stores;
  await stores.users.create({ id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 }, STAMP);
  seedLegacyPackageParent(opened, {
    organizationId: ORGANIZATION,
    projectId: 'project-a',
    creator: OWNER,
  });
  opened.seedPackageParent({
    id: 'project-b',
    organizationId: ORGANIZATION,
    name: 'Project B',
    createdBy: OWNER,
    createdAt: 1,
    updatedAt: null,
    revision: 0,
    spaceId: null,
    spacePosition: null,
  });
  for (const [stepId, projectId, workPackageId, rowId, code] of [
    [STEP_A, 'project-a', WORK_PACKAGE_A, ROW_A, 'a'],
    [STEP_B, 'project-b', WORK_PACKAGE_B, ROW_B, 'b'],
  ]) {
    const defined = await stores.stepCatalogue.defineAndBindStep(
      ORGANIZATION,
      {
        id: stepId,
        code,
        name: code.toUpperCase(),
        position: 10,
        defaultEstimateUnit: 'workdays',
        defaultAllowancePercent: 0,
      },
      {
        bindingId: 'binding-' + code,
        scopeKind: 'project',
        scopeId: projectId,
        workItemTypeId: null,
        position: 10,
      },
      STAMP,
    );
    if (!defined.ok)
      throw new Error('targeted reader definition refused: ' + JSON.stringify(defined));
    const born = await stores.workPackages.createWithSteps(
      workPackageRow({ id: workPackageId, projectId }),
      STAMP,
      { kind: 'legacy' },
    );
    if (typeof born === 'string') throw new Error('targeted reader package refused: ' + born);
    await stores.workItems.insert(workItemRow({ id: rowId, workPackageId }), [], STAMP);
  }
  return { stores, fixture: opened };
}

async function seedAll(
  stores: TransactionalStores,
  workItemId: string,
  stepId: string,
): Promise<void> {
  expect(
    await stores.estimates.set(
      { workItemId, stepId, optimistic: 1, realistic: 2, pessimistic: 3 },
      STAMP,
    ),
  ).toBe('written');
  expect(await stores.actuals.set({ workItemId, stepId, days: 1, recordedAt: 1 }, STAMP)).toBe(
    'written',
  );
  expect(
    await stores.progress.set({ workItemId, stepId, state: 'in_progress', statedAt: 1 }, STAMP),
  ).toBe('written');
  expect(
    await stores.measures.set(
      { workItemId, stepId, metric: 'token_estimate', value: 1, recordedAt: 1 },
      STAMP,
    ),
  ).toBe('written');
}

async function expectRejected(pending: Promise<unknown>, pattern: RegExp): Promise<void> {
  let observed: { kind: 'resolved' } | { kind: 'rejected'; cause: unknown };
  try {
    await pending;
    observed = { kind: 'resolved' };
  } catch (cause: unknown) {
    observed = { kind: 'rejected', cause };
  }
  if (observed.kind === 'resolved')
    throw new Error('Expected the actual targeted operation to reject');
  expect(() => {
    throw observed.cause;
  }).toThrow(pattern);
}

/** Proof: independent ordinary/tuple owner omissions made the actual targeted reads resolve (memory-current-faults-v1); restoring each returned the same tests to rejection. */
async function expectReferenceRejections(
  stores: TransactionalStores,
  workItemId: string,
  pattern: RegExp,
): Promise<void> {
  await Promise.all([
    expectRejected(stores.estimates.listByWorkItems(WORK_PACKAGE_A, [workItemId]), pattern),
    expectRejected(stores.actuals.listByWorkItems(WORK_PACKAGE_A, [workItemId]), pattern),
    expectRejected(stores.progress.listByWorkItems(WORK_PACKAGE_A, [workItemId]), pattern),
    expectRejected(stores.measures.listByWorkItems(WORK_PACKAGE_A, [workItemId]), pattern),
  ]);
}

async function corruptReferences(
  opened: MemorySourceFixture,
  column: 'workItemId' | 'stepId',
  value: string,
  assert: () => Promise<void>,
): Promise<void> {
  const restores = FIELD_KINDS.map((kind) =>
    opened.corruptStepFact({ kind, column, value, workItemId: ROW_A, stepId: STEP_A }),
  );
  try {
    await assert();
  } finally {
    for (const restore of restores.reverse()) restore();
  }
}

describe('targeted memory readers reject malformed trusted state', () => {
  it('names a missing work-item reference in all four satellite families', async () => {
    const { stores, fixture: opened } = await openSeededStores();
    await seedAll(stores, ROW_A, STEP_A);
    await corruptReferences(opened, 'workItemId', 'missing-work-item', () =>
      expectReferenceRejections(stores, 'missing-work-item', /work item is absent/),
    );
    expect(await stores.estimates.listByWorkItems(WORK_PACKAGE_A, [ROW_A])).toHaveLength(1);
  });

  it('filters a valid cross-work-package work-item in all four satellite families', async () => {
    const { stores } = await openSeededStores();
    await seedAll(stores, ROW_B, STEP_B);
    expect(await stores.estimates.listByWorkItems(WORK_PACKAGE_A, [ROW_B])).toEqual([]);
    expect(await stores.actuals.listByWorkItems(WORK_PACKAGE_A, [ROW_B])).toEqual([]);
    expect(await stores.progress.listByWorkItems(WORK_PACKAGE_A, [ROW_B])).toEqual([]);
    expect(await stores.measures.listByWorkItems(WORK_PACKAGE_A, [ROW_B])).toEqual([]);
  });

  it('names an existing global step unresolved in the addressed package in all four satellite families', async () => {
    const { stores, fixture: opened } = await openSeededStores();
    await seedAll(stores, ROW_A, STEP_A);
    await corruptReferences(opened, 'stepId', STEP_B, () =>
      expectReferenceRejections(stores, ROW_A, /not leaf-resolved/),
    );
    expect(await stores.estimates.listByWorkItems(WORK_PACKAGE_A, [ROW_A])).toHaveLength(1);
  });

  it('names a missing step in all four satellite families', async () => {
    const { stores, fixture: opened } = await openSeededStores();
    await seedAll(stores, ROW_A, STEP_A);
    await corruptReferences(opened, 'stepId', 'missing-step', () =>
      expectReferenceRejections(stores, ROW_A, /not leaf-resolved: unknown_step/),
    );
    expect(await stores.estimates.listByWorkItems(WORK_PACKAGE_A, [ROW_A])).toHaveLength(1);
  });

  it('rejects invalid values and timestamps in each satellite shape', async () => {
    const { stores, fixture: opened } = await openSeededStores();
    await seedAll(stores, ROW_A, STEP_A);
    await expectRejected(
      stores.measures.set(
        { workItemId: ROW_A, stepId: STEP_A, metric: 'broken', value: 1, recordedAt: 1 },
        STAMP,
      ),
      /is not defined by the organization/,
    );
    // Proof: seven independent scalar/time/state validator omissions made these actual reads resolve; all original bytes restored (memory-current-faults-v1).
    const controls: readonly {
      corruption: Parameters<MemorySourceFixture['corruptStepFact']>[0];
      read: () => Promise<unknown>;
      diagnostic: RegExp;
    }[] = [
      {
        corruption: {
          kind: 'estimate_field',
          column: 'optimistic',
          value: Number.NaN,
          workItemId: ROW_A,
          stepId: STEP_A,
        },
        read: () => stores.estimates.listByWorkItems(WORK_PACKAGE_A, [ROW_A]),
        diagnostic: /malformed day value/,
      },
      {
        corruption: {
          kind: 'actual_field',
          column: 'days',
          value: Number.NaN,
          workItemId: ROW_A,
          stepId: STEP_A,
        },
        read: () => stores.actuals.listByWorkItems(WORK_PACKAGE_A, [ROW_A]),
        diagnostic: /malformed day value/,
      },
      {
        corruption: {
          kind: 'progress_field',
          column: 'state',
          value: 'broken',
          workItemId: ROW_A,
          stepId: STEP_A,
        },
        read: () => stores.progress.listByWorkItems(WORK_PACKAGE_A, [ROW_A]),
        diagnostic: /malformed state/,
      },
      {
        corruption: {
          kind: 'actual_field',
          column: 'recordedAt',
          value: Number.POSITIVE_INFINITY,
          workItemId: ROW_A,
          stepId: STEP_A,
        },
        read: () => stores.actuals.listByWorkItems(WORK_PACKAGE_A, [ROW_A]),
        diagnostic: /malformed recorded time/,
      },
      {
        corruption: {
          kind: 'progress_field',
          column: 'statedAt',
          value: Number.NEGATIVE_INFINITY,
          workItemId: ROW_A,
          stepId: STEP_A,
        },
        read: () => stores.progress.listByWorkItems(WORK_PACKAGE_A, [ROW_A]),
        diagnostic: /malformed stated time/,
      },
      {
        corruption: {
          kind: 'measure_field',
          column: 'value',
          value: Number.NaN,
          workItemId: ROW_A,
          stepId: STEP_A,
        },
        read: () => stores.measures.listByWorkItems(WORK_PACKAGE_A, [ROW_A]),
        diagnostic: /invalid value/,
      },
      {
        corruption: {
          kind: 'measure_field',
          column: 'recordedAt',
          value: Number.POSITIVE_INFINITY,
          workItemId: ROW_A,
          stepId: STEP_A,
        },
        read: () => stores.measures.listByWorkItems(WORK_PACKAGE_A, [ROW_A]),
        diagnostic: /invalid recorded time/,
      },
    ];
    for (const control of controls) {
      const restore = opened.corruptStepFact(control.corruption);
      try {
        await expectRejected(control.read(), control.diagnostic);
      } finally {
        restore();
      }
      expect(await control.read()).toHaveLength(1);
    }
  });

  it('refuses a missing physical corruption target in each family', async () => {
    const { fixture: opened } = await openSeededStores();
    for (const kind of FIELD_KINDS)
      expect(() =>
        opened.corruptStepFact({
          kind,
          column: 'stepId',
          value: STEP_B,
          workItemId: 'absent',
          stepId: STEP_A,
        }),
      ).toThrow('point corruption target is absent');
  });
});
