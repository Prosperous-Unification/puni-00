import type { Claim, ResourceUseActor } from '@wbs/core';
import { resourceUseActorOf } from '@wbs/core/http/resource-use.routes';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { CONTRIBUTOR_CAP } from '@wbs/domain';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { SqliteResourceUses } from '../resource-use';
import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

type Fixture = Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;
const parentId = 'location-current-parent',
  childId = 'location-current-child',
  stepId = 'location-current-dev',
  personId = 'location-current-person',
  runId = 'location-current-run',
  resourceId = 'location-current-disk';

async function withinFixture(act: (fixture: Fixture) => Promise<void>): Promise<void> {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  let failure: { cause: unknown } | undefined;
  try {
    await act(fixture);
  } catch (cause: unknown) {
    failure = { cause };
  }
  try {
    await fixture.close();
  } catch (cleanup: unknown) {
    if (failure !== undefined)
      throw new AggregateError(
        [failure.cause, cleanup],
        'resource lifecycle owner and Source close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (failure !== undefined) throw failure.cause;
}

async function prepare(fixture: Fixture) {
  const { source, seed, port } = fixture;
  expect(
    (
      await port.defineAndBindStep(
        seed.organizationId,
        {
          id: stepId,
          code: stepId,
          name: stepId,
          position: 0,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
        },
        {
          bindingId: stepId + ':binding',
          scopeKind: 'organization',
          scopeId: seed.organizationId,
          position: 0,
          workItemTypeId: null,
        },
        seed.stamp,
      )
    ).ok,
  ).toBe(true);
  await source.stores.workItems.insert(
    workItemRow({
      id: parentId,
      workPackageId: seed.workPackageId,
      name: 'Immutable original parent',
      position: 0,
    }),
    [],
    seed.stamp,
  );
  source.db.run(
    sql`INSERT INTO person(id,name,account_id,created_at,created_by) VALUES(${personId},'Current lifecycle holder',${seed.stamp.by},100,${seed.stamp.by})`,
  );
  source.db.run(
    sql`INSERT INTO person_organization(resource_id,organization_id,name) VALUES(${personId},${seed.organizationId},'Current lifecycle holder')`,
  );
  source.db.run(
    sql`INSERT INTO resource(id,name,kind,unit_label,created_at,created_by) VALUES(${resourceId},'Current lifecycle disk','divisible','GB',100,${seed.stamp.by})`,
  );
  source.db.run(
    sql`INSERT INTO resource_organization(resource_id,organization_id,name) VALUES(${resourceId},${seed.organizationId},'Current lifecycle disk')`,
  );
  // Fixture-supplied account evidence; the real ResourceUses store still reads
  // current membership, package.write grant, scope and activation on its owner.
  // This does not certify request authentication or forwarded MCP credentials.
  const principal = { id: seed.stamp.by };
  const actor: ResourceUseActor = resourceUseActorOf(principal, {
    kind: 'scoped',
    scope: { organizationId: seed.organizationId, userId: seed.stamp.by, cap: CONTRIBUTOR_CAP },
    principal,
  });
  const uses = new SqliteResourceUses(source.db, source.gate);
  const point: Claim = {
    id: 'location-point-claim',
    workItemId: parentId,
    stepId,
    personId,
    runId,
    parentClaimId: null,
    accountId: seed.stamp.by,
  };
  expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  return { uses, actor, point };
}

async function registerBroad(fixture: Fixture, prepared: Awaited<ReturnType<typeof prepare>>) {
  const registered = await prepared.uses.register(
    fixture.seed.workPackageId,
    prepared.actor,
    {
      requestId: 'location-broad-request',
      resourceId,
      workItemId: parentId,
      agentRun: runId,
      responsiblePersonId: personId,
      locator: '/fixture/current-location',
      units: 3,
    },
    101,
  );
  expect(registered.ok).toBe(true);
  if (!registered.ok) throw new Error('healthy current broad registration was refused');
  expect(registered.value).toMatchObject({
    source: 'reported',
    workItemId: parentId,
    stepId: null,
    attemptNumber: null,
    state: 'active',
    revision: 1,
  });
  const listed = await prepared.uses.list(fixture.seed.workPackageId, prepared.actor, {
    limit: 50,
  });
  expect(listed.ok).toBe(true);
  if (!listed.ok) throw new Error('healthy current resource list was refused');
  expect(listed.value.uses).toEqual([registered.value]);
  return registered.value;
}

async function moveClaim(fixture: Fixture, point: Claim) {
  const { source, seed } = fixture;
  expect(await source.stores.claims.add([point], [], seed.stamp, [])).toBe('written');
  expect(
    source.db.all(sql`SELECT id,work_item_id,step_id FROM claim WHERE id=${point.id}`),
  ).toEqual([{ id: point.id, work_item_id: parentId, step_id: stepId }]);
  await source.uow.run(async (scope) => {
    await scope.stores.workItems.insert(
      workItemRow({
        id: childId,
        workPackageId: seed.workPackageId,
        parentId,
        name: 'Current lifecycle child',
        position: 0,
      }),
      [],
      seed.stamp,
    );
    await scope.stores.claims.moveAll(parentId, childId, { ...seed.stamp, at: 102 });
    return { commit: true, value: undefined };
  });
  expect(
    source.db.all(sql`SELECT id,work_item_id,step_id FROM claim WHERE id=${point.id}`),
  ).toEqual([{ id: point.id, work_item_id: childId, step_id: stepId }]);
  expect(await source.stores.estimates.readTarget(childId, stepId)).toMatchObject({
    kind: 'resolved',
    step: { stepId },
  });
  expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  return { ...point, workItemId: childId };
}

async function readUse(fixture: Fixture, prepared: Awaited<ReturnType<typeof prepare>>) {
  const listed = await prepared.uses.list(fixture.seed.workPackageId, prepared.actor, {
    limit: 50,
    workItemId: parentId,
  });
  expect(listed.ok).toBe(true);
  if (!listed.ok) throw new Error('current resource list was refused');
  expect(listed.value.uses).toHaveLength(1);
  const visible = listed.value.uses.at(0);
  if (visible === undefined) throw new Error('original resource address disappeared');
  return visible;
}

/** Existing real Source ports; no future first-child method or location-schema premise can mask the cleanup oracle. */
test('resource lifecycle follows an in-place moved claim while immutable public address stays original', async () => {
  await withinFixture(async (fixture) => {
    const prepared = await prepare(fixture),
      registered = await registerBroad(fixture, prepared);
    const response = fixture.source.db.all(
      sql`SELECT work_item_id,registration_response FROM resource_use WHERE id=${registered.id}`,
    );
    const originalEvent = fixture.source.db.all(
      sql`SELECT * FROM resource_use_event WHERE use_id=${registered.id} ORDER BY revision`,
    );
    expect(originalEvent).toHaveLength(1);
    const moved = await moveClaim(fixture, prepared.point);
    await fixture.source.stores.claims.remove([moved], [], { ...fixture.seed.stamp, at: 103 });
    expect(fixture.source.db.all(sql`SELECT id FROM claim WHERE id=${moved.id}`)).toEqual([]);
    const visible = await readUse(fixture, prepared);
    // First intended current-source RED: old immutable-address lookup misses
    // the moved claim. Every native/registration/move/remove premise is above.
    expect(visible.state).toBe('cleanup_pending');
    expect(visible.workItemId).toBe(parentId);
    expect(visible.revision).toBe(2);
    expect(
      fixture.source.db.all(
        sql`SELECT work_item_id,registration_response FROM resource_use WHERE id=${registered.id}`,
      ),
    ).toEqual(response);
    expect(
      fixture.source.db.all(
        sql`SELECT * FROM resource_use_event WHERE use_id=${registered.id} AND revision=1`,
      ),
    ).toEqual(originalEvent);
    expect(
      fixture.source.db.all<{ kind: unknown }>(
        sql`SELECT json_extract(snapshot,'$.kind') AS kind FROM resource_use_event WHERE use_id=${registered.id} ORDER BY revision`,
      ),
    ).toEqual([{ kind: 'registered' }, { kind: 'cleanup_requested' }]);
  });
}, 30000);

test('resource lifecycle enrolls a later whole-parent claim before the last matching claim is removed', async () => {
  await withinFixture(async (fixture) => {
    const prepared = await prepare(fixture),
      registered = await registerBroad(fixture, prepared);
    const moved = await moveClaim(fixture, prepared.point);
    const reservation: Claim = {
      ...prepared.point,
      id: 'location-parent-reservation',
      stepId: null,
    };
    expect(
      await fixture.source.stores.claims.add(
        [reservation],
        [],
        { ...fixture.seed.stamp, at: 103 },
        [],
      ),
    ).toBe('written');
    expect(
      fixture.source.db.all(sql`SELECT id,work_item_id,step_id FROM claim ORDER BY id`),
    ).toEqual([
      { id: reservation.id, work_item_id: parentId, step_id: null },
      { id: moved.id, work_item_id: childId, step_id: stepId },
    ]);
    const before = await readUse(fixture, prepared);
    expect(before.state).toBe('active');
    await fixture.source.stores.claims.remove([moved], [], { ...fixture.seed.stamp, at: 104 });
    expect(await readUse(fixture, prepared)).toEqual(before);
    expect(
      fixture.source.db.all(
        sql`SELECT revision FROM resource_use_event WHERE use_id=${registered.id} ORDER BY revision`,
      ),
    ).toEqual([{ revision: 1 }]);
    await fixture.source.stores.claims.remove([reservation], [], {
      ...fixture.seed.stamp,
      at: 105,
    });
    expect((await readUse(fixture, prepared)).state).toBe('cleanup_pending');
    expect(
      fixture.source.db.all(
        sql`SELECT revision FROM resource_use_event WHERE use_id=${registered.id} ORDER BY revision`,
      ),
    ).toEqual([{ revision: 1 }, { revision: 2 }]);
    expect(
      fixture.source.db.all(sql`SELECT id FROM claim WHERE id IN (${moved.id},${reservation.id})`),
    ).toEqual([]);
  });
}, 30000);

test('resource lifecycle registers an attempted current catalogue node without a removed legacy table', async () => {
  await withinFixture(async (fixture) => {
    const prepared = await prepare(fixture),
      { source, seed } = fixture;
    await source.stores.attempts.restore(
      {
        workItemId: parentId,
        stepId,
        attemptNumber: 7,
        startedAt: 10,
        endedAt: null,
        outcome: null,
        executorPersonId: personId,
        reference: 'current-attempt',
        note: null,
      },
      seed.stamp,
    );
    expect(await source.stores.attempts.listIssued(seed.workPackageId, [parentId])).toEqual([
      { workItemId: parentId, stepId, issued: 7 },
    ]);
    expect(await source.stores.estimates.readTarget(parentId, stepId)).toMatchObject({
      kind: 'resolved',
      step: { stepId },
    });
    expect(
      source.db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='step'`),
    ).toEqual([]);
    const registered = await prepared.uses.register(
      seed.workPackageId,
      prepared.actor,
      {
        requestId: 'location-attempt-request',
        resourceId,
        workItemId: parentId,
        stepId,
        attemptNumber: 7,
        agentRun: runId,
        responsiblePersonId: personId,
        locator: '/fixture/current-attempt',
        units: 3,
      },
      101,
    );
    expect(registered.ok).toBe(true);
    if (!registered.ok) throw new Error('current attempted registration refused');
    expect(registered.value).toMatchObject({
      workItemId: parentId,
      stepId,
      attemptNumber: 7,
      state: 'active',
    });
  });
}, 30000);

test('fresh reported resource use keeps explicit unassociated state despite an unrelated same-run claim', async () => {
  await withinFixture(async (fixture) => {
    const prepared = await prepare(fixture),
      { source, seed } = fixture;
    const unrelatedId = 'location-unrelated-leaf';
    await source.stores.workItems.insert(
      workItemRow({
        id: unrelatedId,
        workPackageId: seed.workPackageId,
        name: 'Unrelated claimed work',
        position: 20,
      }),
      [],
      seed.stamp,
    );
    const unrelated: Claim = {
      ...prepared.point,
      id: 'location-unrelated-claim',
      workItemId: unrelatedId,
    };
    expect(await source.stores.claims.add([unrelated], [], seed.stamp, [])).toBe('written');
    expect(source.db.all(sql`SELECT id,work_item_id,step_id,person_id,run_id FROM claim`)).toEqual([
      {
        id: unrelated.id,
        work_item_id: unrelatedId,
        step_id: stepId,
        person_id: personId,
        run_id: runId,
      },
    ]);
    const claimBefore = source.db.all(sql`SELECT * FROM claim`);
    const registered = await registerBroad(fixture, prepared);
    expect(source.db.all(sql`SELECT * FROM claim`)).toEqual(claimBefore);
    expect(
      source.db.all(
        sql`SELECT use_id,kind,work_package_id,work_item_id FROM resource_use_location WHERE use_id=${registered.id}`,
      ),
    ).toEqual([
      {
        use_id: registered.id,
        kind: 'unassociated',
        work_package_id: seed.workPackageId,
        work_item_id: null,
      },
    ]);
    const eventsBefore = source.db.all(
      sql`SELECT * FROM resource_use_event WHERE use_id=${registered.id} ORDER BY revision`,
    );
    const immutableBefore = source.db.all(
      sql`SELECT work_item_id,snapshot,registration_response FROM resource_use WHERE id=${registered.id}`,
    );
    await source.stores.claims.remove([unrelated], [], { ...seed.stamp, at: 102 });
    expect(source.db.all(sql`SELECT id FROM claim`)).toEqual([]);
    expect(await readUse(fixture, prepared)).toEqual(registered);
    expect(
      source.db.all(
        sql`SELECT * FROM resource_use_event WHERE use_id=${registered.id} ORDER BY revision`,
      ),
    ).toEqual(eventsBefore);
    expect(
      source.db.all(
        sql`SELECT work_item_id,snapshot,registration_response FROM resource_use WHERE id=${registered.id}`,
      ),
    ).toEqual(immutableBefore);
    expect(
      source.db.all(
        sql`SELECT use_id,kind,work_package_id,work_item_id FROM resource_use_location WHERE use_id=${registered.id}`,
      ),
    ).toEqual([
      {
        use_id: registered.id,
        kind: 'unassociated',
        work_package_id: seed.workPackageId,
        work_item_id: null,
      },
    ]);
    expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  });
}, 30000);
