import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { allowancePercentOf } from '@wbs/domain';
import { expect, test } from 'bun:test';

import {
  PACKAGE_STEP_SEED,
  type PackageStepActor as Actor,
  type PackageStepFixture as Fixture,
  withinPackageSteps as withinFixture,
} from '../testing/package-step-values-fixture';
const {
  workPackageId: A,
  siblingWorkPackageId: B,
  foreignWorkPackageId: FOREIGN,
  stepId: SHARED,
  foreignStepId: FOREIGN_STEP,
} = PACKAGE_STEP_SEED;

function patch(
  fixture: Fixture,
  body: unknown,
  actor: Actor = 'manager',
  workPackageId: string = A,
  stepId: string = SHARED,
) {
  return fixture.harness.call(
    actor,
    'PATCH',
    `/api/work-packages/${workPackageId}/steps/${stepId}`,
    body,
  );
}
function row(fixture: Fixture, workPackageId: string) {
  return fixture.harness.sqlite
    .query(
      'SELECT estimate_unit,allowance_bps,allowance_revision FROM work_package_step WHERE work_package_id=? AND step_id=?',
    )
    .get(workPackageId, SHARED);
}
function catalogue(fixture: Fixture) {
  return fixture.harness.sqlite.query('SELECT * FROM step_definition ORDER BY id').all();
}
/** Every table and schema row are detached; no application projection hides a refused write. */
function snapshot(fixture: Fixture) {
  const db = fixture.harness.sqlite;
  const schema = db
    .query('SELECT type,name,tbl_name,rootpage,sql FROM sqlite_master ORDER BY type,name')
    .all();
  const tables = db
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map(({ name }) => {
      const rows = db.query('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all();
      rows.sort((left, right) =>
        Buffer.compare(Buffer.from(JSON.stringify(left)), Buffer.from(JSON.stringify(right))),
      );
      return { name, rows };
    });
  return structuredClone({ schema, tables });
}
async function healthy(fixture: Fixture): Promise<void> {
  const definitions = catalogue(fixture);
  expect(await patch(fixture, { allowanceBps: 1234 })).toMatchObject({ status: 200 });
  expect(row(fixture, A)).toEqual({
    estimate_unit: 'workdays',
    allowance_bps: 1234,
    allowance_revision: 1,
  });
  expect(row(fixture, B)).toEqual({
    estimate_unit: 'workdays',
    allowance_bps: 5678,
    allowance_revision: 1,
  });
  expect(catalogue(fixture)).toEqual(definitions);
}

for (const kind of ['replay', 'aba'] as const) {
  test(
    'current package step HTTP ' +
      kind +
      ' keeps addressed allowance precision and shared defaults',
    async () => {
      await withinFixture(async (fixture) => {
        await healthy(fixture);
        const definitions = catalogue(fixture),
          sibling = row(fixture, B);
        if (kind === 'aba') {
          await fixture.harness.publicWrites().uow.run(async ({ stores }) => {
            for (const amount of [20, 12.34]) {
              const allowance = allowancePercentOf(amount);
              if (allowance === null) throw new Error('literal allowance refused');
              expect(
                (await stores.workPackages.setStepAllowance(A, SHARED, allowance, fixture.stamp))
                  .ok,
              ).toBe(true);
            }
            return { commit: true, value: undefined };
          });
          expect(
            await fixture.harness.call('manager', 'POST', `/api/work-packages/${A}/undo`),
          ).toMatchObject({ status: 409, body: { error: 'stale_undo' } });
          expect(row(fixture, A)).toEqual({
            estimate_unit: 'workdays',
            allowance_bps: 1234,
            allowance_revision: 3,
          });
        } else {
          expect(
            (await fixture.harness.call('manager', 'POST', `/api/work-packages/${A}/undo`)).status,
          ).toBe(200);
          expect(row(fixture, A)).toEqual({
            estimate_unit: 'workdays',
            allowance_bps: 700,
            allowance_revision: 2,
          });
          expect(
            (await fixture.harness.call('manager', 'POST', `/api/work-packages/${A}/redo`)).status,
          ).toBe(200);
          expect(row(fixture, A)).toEqual({
            estimate_unit: 'workdays',
            allowance_bps: 1234,
            allowance_revision: 3,
          });
          expect(
            (await fixture.harness.call('manager', 'POST', `/api/work-packages/${A}/undo`)).status,
          ).toBe(200);
          expect(
            await fixture.harness.call('manager', 'POST', `/api/work-packages/${A}/undo`),
          ).toMatchObject({ status: 409, body: { error: 'nothing_to_undo' } });
        }
        expect(row(fixture, B)).toEqual(sibling);
        expect(catalogue(fixture)).toEqual(definitions);
      });
    },
    60000,
  );
}

test('current package step HTTP requires named settings permission and preserves concealment', async () => {
  await withinFixture(async (fixture) => {
    await healthy(fixture);
    const before = snapshot(fixture),
      announcements = [...fixture.pushes];
    for (const actor of ['contributor', 'viewer'] as const)
      for (const body of [{ allowanceBps: 2500 }, { estimateUnit: 'minutes' }])
        expect(await patch(fixture, body, actor)).toEqual({
          status: 403,
          body: { error: 'forbidden', permission: 'package.manage_settings' },
        });
    for (const [actor, workPackageId, stepId] of [
      ['hidden', A, SHARED],
      ['hidden', 'absent', SHARED],
      ['manager', FOREIGN, FOREIGN_STEP],
      ['manager', 'absent', SHARED],
      ['manager', A, FOREIGN_STEP],
      ['manager', A, 'absent'],
    ] as const)
      expect(await patch(fixture, { allowanceBps: 2500 }, actor, workPackageId, stepId)).toEqual({
        status: 404,
        body: { error: 'not_found' },
      });
    expect(await patch(fixture, { allowanceBps: 2500 }, 'nonmember')).toMatchObject({
      status: 403,
      body: { error: 'not_a_member' },
    });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
  });
}, 60000);

test('current package step HTTP closes legacy names percents and malformed values without writes', async () => {
  await withinFixture(async (fixture) => {
    await healthy(fixture);
    const before = snapshot(fixture),
      announcements = [...fixture.pushes];
    for (const body of [
      {},
      { name: 'Global rename' },
      { allowancePercent: 25 },
      { allowanceBps: 2500, name: 'Global rename' },
      { allowanceBps: 2500, extra: true },
      { allowanceBps: 1.5 },
      { allowanceBps: -1 },
      { allowanceBps: 100001 },
      { allowanceBps: '2500' },
      { estimateUnit: 'hours' },
    ])
      expect((await patch(fixture, body)).status).toBe(422);
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
  });
}, 60000);

test('current package step HTTP edits only its unit and refuses combined values atomically with estimates', async () => {
  await withinFixture(async (fixture) => {
    await healthy(fixture);
    const definitions = catalogue(fixture),
      sibling = row(fixture, B);
    await fixture.harness.publicWrites().uow.run(async ({ stores }) => {
      await stores.workItems.insert(
        workItemRow({ id: 'current-http-sibling-leaf', workPackageId: B, name: 'Sibling leaf' }),
        [],
        fixture.stamp,
      );
      expect(
        await stores.estimates.set(
          {
            workItemId: 'current-http-sibling-leaf',
            stepId: SHARED,
            optimistic: 4,
            realistic: 5,
            pessimistic: 6,
          },
          fixture.stamp,
        ),
      ).toBe('written');
      return { commit: true, value: undefined };
    });
    expect((await patch(fixture, { estimateUnit: 'minutes' })).status).toBe(200);
    expect(row(fixture, A)).toMatchObject({ estimate_unit: 'minutes', allowance_bps: 1234 });
    expect(row(fixture, B)).toEqual(sibling);
    expect(catalogue(fixture)).toEqual(definitions);
    await fixture.harness.publicWrites().uow.run(async ({ stores }) => {
      await stores.workItems.insert(
        workItemRow({ id: 'current-http-leaf', workPackageId: A, name: 'Current leaf' }),
        [],
        fixture.stamp,
      );
      expect(
        await stores.estimates.set(
          {
            workItemId: 'current-http-leaf',
            stepId: SHARED,
            optimistic: 1,
            realistic: 2,
            pessimistic: 3,
          },
          fixture.stamp,
        ),
      ).toBe('written');
      return { commit: true, value: undefined };
    });
    expect((await patch(fixture, { estimateUnit: 'minutes' })).status).toBe(200);
    const before = snapshot(fixture),
      announcements = [...fixture.pushes];
    expect(await patch(fixture, { estimateUnit: 'workdays', allowanceBps: 2500 })).toMatchObject({
      status: 409,
      body: { error: 'estimates_present', count: 1 },
    });
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
  });
}, 60000);

test('current package step HTTP retires package definition mutations and their operation identities', async () => {
  await withinFixture(async (fixture) => {
    await healthy(fixture);
    const before = snapshot(fixture),
      announcements = [...fixture.pushes];
    expect(
      (
        await fixture.harness.call('manager', 'POST', `/api/work-packages/${A}/steps`, {
          name: 'Forbidden compatibility definition',
          code: 'new',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fixture.harness.call(
          'manager',
          'DELETE',
          `/api/work-packages/${A}/steps/${SHARED}?cascade=true`,
        )
      ).status,
    ).toBe(404);
    const published = await fixture.harness.request('/api/openapi.json');
    expect(published.status).toBe(200);
    const document: unknown = await published.json();
    const text = JSON.stringify(document);
    for (const retired of [
      'postApiWorkPackagesByIdSteps',
      'patchApiWorkPackagesByIdStepsByStepId',
      'deleteApiWorkPackagesByIdStepsByStepId',
    ])
      expect(text).not.toContain('"' + retired + '"');
    expect(snapshot(fixture)).toEqual(before);
    expect(fixture.pushes).toEqual(announcements);
  });
}, 60000);
