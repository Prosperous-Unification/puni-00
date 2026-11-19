import type { TransactionalStores, WriteStamp } from '@wbs/core';
import { seedLegacyPackageParent } from '@wbs/core/testing/legacy-package-source-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { afterEach, describe, expect, it } from 'bun:test';

import type { openMemorySource } from './source';
import { openMemorySourceFixture } from './source';
import { workPackageRow } from './work-package-fixture';

const OWNER = 'targeted-memory-owner';
const WORK_PACKAGE_A = 'targeted-memory-a';
const WORK_PACKAGE_B = 'targeted-memory-b';
const STEP_A = 'targeted-memory-step-a';
const STEP_B = 'targeted-memory-step-b';
const ROW_A = 'targeted-memory-row-a';
const ROW_B = 'targeted-memory-row-b';
const STAMP: WriteStamp = { at: 1, by: OWNER };

let source: ReturnType<typeof openMemorySource> | undefined;

afterEach(async () => {
  await source?.close();
  source = undefined;
});

async function openSeededStores(): Promise<TransactionalStores> {
  const fixture = openMemorySourceFixture();
  source = fixture.source;
  const stores = source.stores;
  await stores.users.create({ id: OWNER, username: OWNER, passwordHash: 'x', createdAt: 1 }, STAMP);
  seedLegacyPackageParent(fixture, {
    organizationId: 'fixture-legacy-org',
    projectId: 'fixture-project',
    creator: OWNER,
  });
  await stores.workPackages.create(
    workPackageRow({ id: WORK_PACKAGE_A, projectId: 'fixture-project' }),
    [
      {
        id: STEP_A,
        workPackageId: WORK_PACKAGE_A,
        name: 'A',
        position: 10,
        code: 'a',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
    ],
    STAMP,
  );
  await stores.workPackages.create(
    workPackageRow({ id: WORK_PACKAGE_B, projectId: 'fixture-project' }),
    [
      {
        id: STEP_B,
        workPackageId: WORK_PACKAGE_B,
        name: 'B',
        position: 10,
        code: 'b',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
    ],
    STAMP,
  );
  await stores.steps.add(
    {
      id: STEP_A,
      workPackageId: WORK_PACKAGE_A,
      name: 'A',
      allowancePercent: 0,
      estimateUnit: 'workdays' as const,
    },
    STAMP,
  );
  await stores.steps.add(
    {
      id: STEP_B,
      workPackageId: WORK_PACKAGE_B,
      name: 'B',
      allowancePercent: 0,
      estimateUnit: 'workdays' as const,
    },
    STAMP,
  );
  await stores.workItems.insert(
    workItemRow({ id: ROW_A, workPackageId: WORK_PACKAGE_A }),
    [],
    STAMP,
  );
  await stores.workItems.insert(
    workItemRow({ id: ROW_B, workPackageId: WORK_PACKAGE_B }),
    [],
    STAMP,
  );
  return stores;
}

async function seedAll(
  stores: TransactionalStores,
  workItemId: string,
  stepId: string,
): Promise<void> {
  await stores.estimates.set(
    { workItemId, stepId, optimistic: 1, realistic: 2, pessimistic: 3 },
    STAMP,
  );
  await stores.actuals.set({ workItemId, stepId, days: 1, recordedAt: 1 }, STAMP);
  await stores.progress.set({ workItemId, stepId, state: 'in_progress', statedAt: 1 }, STAMP);
  await stores.measures.set(
    { workItemId, stepId, metric: 'token_estimate', value: 1, recordedAt: 1 },
    STAMP,
  );
}

function expectReferenceRejections(
  stores: TransactionalStores,
  workPackageId: string,
  workItemId: string,
  pattern: RegExp,
): void {
  expect(stores.estimates.listByWorkItems(workPackageId, [workItemId])).rejects.toThrow(pattern);
  expect(stores.actuals.listByWorkItems(workPackageId, [workItemId])).rejects.toThrow(pattern);
  expect(stores.progress.listByWorkItems(workPackageId, [workItemId])).rejects.toThrow(pattern);
  expect(stores.measures.listByWorkItems(workPackageId, [workItemId])).rejects.toThrow(pattern);
}

describe('targeted memory readers reject malformed trusted state', () => {
  it('names a missing work-item reference in all four satellite families', async () => {
    const stores = await openSeededStores();
    await seedAll(stores, 'missing-work-item', STEP_A);

    // Proof: joining through listByIds filtered every malformed row to an empty answer.
    expectReferenceRejections(
      stores,
      WORK_PACKAGE_A,
      'missing-work-item',
      /invalid work-item reference/,
    );
  });

  it('filters a valid cross-work-package work-item in all four satellite families', async () => {
    const stores = await openSeededStores();
    await seedAll(stores, ROW_B, STEP_B);

    // Proof: validating ownership before filtering threw for each valid work-package-B row.
    expect(await stores.estimates.listByWorkItems(WORK_PACKAGE_A, [ROW_B])).toEqual([]);
    expect(await stores.actuals.listByWorkItems(WORK_PACKAGE_A, [ROW_B])).toEqual([]);
    expect(await stores.progress.listByWorkItems(WORK_PACKAGE_A, [ROW_B])).toEqual([]);
    expect(await stores.measures.listByWorkItems(WORK_PACKAGE_A, [ROW_B])).toEqual([]);
  });

  it('names a cross-work-package step in all four satellite families', async () => {
    const stores = await openSeededStores();
    await seedAll(stores, ROW_A, STEP_B);

    // Proof: the ordering fallback treated an absent work package step as position zero.
    expectReferenceRejections(stores, WORK_PACKAGE_A, ROW_A, /invalid step reference/);
  });

  it('names a missing step in all four satellite families', async () => {
    const stores = await openSeededStores();
    await seedAll(stores, ROW_A, 'missing-step');

    // Proof: the ordering fallback treated a missing stored step as position zero.
    expectReferenceRejections(stores, WORK_PACKAGE_A, ROW_A, /invalid step reference/);
  });

  it('rejects invalid values and timestamps in each satellite shape', async () => {
    const stores = await openSeededStores();
    await stores.estimates.set(
      { workItemId: ROW_A, stepId: STEP_A, optimistic: Number.NaN, realistic: 2, pessimistic: 3 },
      STAMP,
    );
    await stores.actuals.set(
      { workItemId: ROW_A, stepId: STEP_A, days: Number.NaN, recordedAt: 1 },
      STAMP,
    );
    await stores.progress.set(
      // This test crosses the trusted-state boundary with a deliberately malformed stored value.
      { workItemId: ROW_A, stepId: STEP_A, state: 'broken', statedAt: 1 } as never,
      STAMP,
    );
    // A metric no organization defines no longer reaches the table: since
    // `wbs-measure-budgets` slice 2 the write refuses it, as SQLite's does.
    expect(
      stores.measures.set(
        { workItemId: ROW_A, stepId: STEP_A, metric: 'broken', value: 1, recordedAt: 1 },
        STAMP,
      ),
    ).rejects.toThrow(/is not defined by the organization/);

    // Proof: without the three family validators these malformed stored values all resolved.
    expect(stores.estimates.listByWorkItems(WORK_PACKAGE_A, [ROW_A])).rejects.toThrow(
      /invalid day value/,
    );
    expect(stores.actuals.listByWorkItems(WORK_PACKAGE_A, [ROW_A])).rejects.toThrow(
      /invalid day value/,
    );
    expect(stores.progress.listByWorkItems(WORK_PACKAGE_A, [ROW_A])).rejects.toThrow(
      /invalid state/,
    );

    await stores.actuals.set(
      { workItemId: ROW_A, stepId: STEP_A, days: 1, recordedAt: Number.POSITIVE_INFINITY },
      STAMP,
    );
    await stores.progress.set(
      { workItemId: ROW_A, stepId: STEP_A, state: 'done', statedAt: Number.NEGATIVE_INFINITY },
      STAMP,
    );
    await stores.measures.set(
      {
        workItemId: ROW_A,
        stepId: STEP_A,
        metric: 'token_actual',
        value: Number.NaN,
        recordedAt: 1,
      },
      STAMP,
    );
    // Proof: without finite-time/value validation these three targeted reads all resolved.
    expect(stores.actuals.listByWorkItems(WORK_PACKAGE_A, [ROW_A])).rejects.toThrow(
      /invalid recorded time/,
    );
    expect(stores.progress.listByWorkItems(WORK_PACKAGE_A, [ROW_A])).rejects.toThrow(
      /invalid stated time/,
    );
    expect(stores.measures.listByWorkItems(WORK_PACKAGE_A, [ROW_A])).rejects.toThrow(
      /invalid value/,
    );

    await stores.measures.set(
      {
        workItemId: ROW_A,
        stepId: STEP_A,
        metric: 'token_actual',
        value: 1,
        recordedAt: Number.POSITIVE_INFINITY,
      },
      STAMP,
    );
    // Proof: without the measure timestamp check this non-finite stored time resolved.
    expect(stores.measures.listByWorkItems(WORK_PACKAGE_A, [ROW_A])).rejects.toThrow(
      /invalid recorded time/,
    );
  });
});
