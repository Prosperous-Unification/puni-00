import type { Claim, FirstChildRecord, FirstChildWrite, ResourceUseActor } from '@wbs/core';
import { resourceUseActorOf } from '@wbs/core/http/resource-use.routes';
import { parseRuntimeClaim } from '@wbs/core/ports/runtime-command-records';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { CONTRIBUTOR_CAP } from '@wbs/domain';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { endLeasesOfUncredentialed } from '../claim';
import { SqliteResourceUses } from '../resource-use';
import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

type Fixture = Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;
const ancestorId = 'resource-first-ancestor',
  parentId = 'resource-first-parent',
  childId = 'resource-first-child';
const stepId = 'resource-first-dev',
  personId = 'resource-first-person',
  runId = 'resource-first-run',
  resourceId = 'resource-first-disk';

async function withinFixture(act: (fixture: Fixture) => Promise<void>): Promise<void> {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  let primary: { cause: unknown } | undefined;
  try {
    await act(fixture);
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await fixture.close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup],
        'first-child resource owner and Source close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
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
      id: ancestorId,
      workPackageId: seed.workPackageId,
      name: 'Stable delegation ancestor',
      position: 0,
    }),
    [],
    seed.stamp,
  );
  await source.stores.workItems.insert(
    workItemRow({
      id: parentId,
      workPackageId: seed.workPackageId,
      parentId: ancestorId,
      name: 'Original resource parent',
      position: 0,
    }),
    [],
    seed.stamp,
  );
  // Native fixture entities retain their FK/organization checks. Real Source
  // claim and ResourceUses operations still perform their current admission.
  source.db.run(
    sql`INSERT INTO person(id,name,account_id,created_at,created_by) VALUES(${personId},'First-child resource holder',${seed.stamp.by},100,${seed.stamp.by})`,
  );
  source.db.run(
    sql`INSERT INTO person_organization(resource_id,organization_id,name) VALUES(${personId},${seed.organizationId},'First-child resource holder')`,
  );
  source.db.run(
    sql`INSERT INTO resource(id,name,kind,unit_label,created_at,created_by) VALUES(${resourceId},'First-child resource disk','divisible','GB',100,${seed.stamp.by})`,
  );
  source.db.run(
    sql`INSERT INTO resource_organization(resource_id,organization_id,name) VALUES(${resourceId},${seed.organizationId},'First-child resource disk')`,
  );
  const principal = { id: seed.stamp.by };
  const actor: ResourceUseActor = resourceUseActorOf(principal, {
    kind: 'scoped',
    scope: { organizationId: seed.organizationId, userId: seed.stamp.by, cap: CONTRIBUTOR_CAP },
    principal,
  });
  const uses = new SqliteResourceUses(source.db, source.gate);
  expect(await source.stores.estimates.readTarget(parentId, stepId)).toMatchObject({
    kind: 'resolved',
    step: { stepId },
  });
  expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
  return { actor, uses };
}

function readImmutable(fixture: Fixture) {
  const { db } = fixture.source;
  return {
    uses: db.all(
      sql`SELECT id,work_item_id,step_id,attempt_number,request_id,request_fingerprint,registration_response FROM resource_use ORDER BY id`,
    ),
    bindings: db.all(sql`SELECT * FROM runtime_claim_binding ORDER BY claim_id`),
    runtimeLedger: db.all(sql`SELECT * FROM runtime_ledger`),
  };
}
function readClaims(fixture: Fixture) {
  return fixture.source.db.all<Record<string, unknown>>(
    sql`SELECT * FROM claim ORDER BY id COLLATE BINARY`,
  );
}
function readLocations(fixture: Fixture, useId: string) {
  return fixture.source.db.all(
    sql`SELECT kind,work_item_id FROM resource_use_location WHERE use_id=${useId} ORDER BY kind COLLATE BINARY,work_item_id COLLATE BINARY`,
  );
}
async function readVisible(fixture: Fixture, prepared: Awaited<ReturnType<typeof prepare>>) {
  const listed = await prepared.uses.list(fixture.seed.workPackageId, prepared.actor, {
    limit: 50,
    workItemId: parentId,
  });
  expect(listed.ok).toBe(true);
  if (!listed.ok) throw new Error('first-child resource list was refused');
  expect(listed.value.uses).toHaveLength(1);
  const visible = listed.value.uses.at(0);
  if (visible === undefined) throw new Error('original reported resource address disappeared');
  return visible;
}
async function transition(
  fixture: Fixture,
  write: FirstChildWrite,
  at: number,
): Promise<FirstChildRecord> {
  const written = await fixture.source.uow.run(async (scope) => ({
    commit: true,
    value: await scope.stores.subtrees.writeFirstChild(write, { ...fixture.seed.stamp, at }),
  }));
  expect(written.kind).toBe('written');
  if (written.kind !== 'written')
    throw new Error('lawful first-child resource transition refused: ' + written.kind);
  return written.record;
}
function freshChild(fixture: Fixture) {
  return {
    ...workItemRow({
      id: childId,
      workPackageId: fixture.seed.workPackageId,
      parentId,
      name: 'Current resource child',
      position: 0,
    }),
    parentId,
  };
}
function replay(record: FirstChildRecord, direction: 'down' | 'up'): FirstChildWrite {
  return {
    kind: 'replay',
    direction,
    record,
    respaced: [],
    localDependencies: [],
    detachedIncidents: [],
  };
}

/** Real reported use and validated binding; this does not certify ResourceRuntime grant admission. */
test('sqlite first child preserves live delegated revoked leases and reported resource association through down up down', async () => {
  await withinFixture(async (fixture) => {
    const prepared = await prepare(fixture),
      { source, seed } = fixture;
    const root: Claim = {
      id: 'resource-first-root-reservation',
      workItemId: ancestorId,
      stepId: null,
      personId,
      runId,
      parentClaimId: null,
      accountId: seed.stamp.by,
    };
    const point: Claim = {
      ...root,
      id: 'resource-first-point-claim',
      workItemId: parentId,
      stepId,
      parentClaimId: root.id,
    };
    expect(
      await source.stores.claims.add(
        [root, point],
        [],
        seed.stamp,
        [{ claimId: point.id, resourceId, units: 2 }],
        [
          { claimId: root.id, expiresAt: 900 },
          { claimId: point.id, expiresAt: 900 },
        ],
      ),
    ).toBe('written');
    const runtimeScope = {
      organizationId: seed.organizationId,
      workPackageId: seed.workPackageId,
      personId,
    };
    const binding = parseRuntimeClaim({
      claimId: point.id,
      workItemId: parentId,
      stepId,
      parentClaimId: root.id,
      execution: {
        storeId: 'resource-first-store',
        runId,
        attemptId: 'resource-first-runtime-attempt',
        sessionId: 'resource-first-session',
      },
    });
    await source.uow.run(async (scope) => {
      await scope.stores.runtimeCommands.insertBinding(runtimeScope, binding);
      return { commit: true, value: undefined };
    });
    expect(await source.stores.runtimeCommands.readBinding(runtimeScope, point.id)).toEqual(
      binding,
    );
    const registered = await prepared.uses.register(
      seed.workPackageId,
      prepared.actor,
      {
        requestId: 'resource-first-broad',
        resourceId,
        workItemId: parentId,
        agentRun: runId,
        responsiblePersonId: personId,
        locator: '/fixture/first-child-broad',
        units: 3,
      },
      101,
    );
    expect(registered.ok).toBe(true);
    if (!registered.ok) throw new Error('healthy broad first-child resource registration refused');
    expect(registered.value).toMatchObject({
      workItemId: parentId,
      stepId: null,
      state: 'active',
      revision: 1,
    });
    expect(
      source.db.all(
        sql`SELECT id FROM machine_credential WHERE person_id=${personId} AND revoked_at IS NULL`,
      ),
    ).toEqual([]);
    const revoked = await source.uow.run(() =>
      Promise.resolve({ commit: true, value: endLeasesOfUncredentialed(source.db, personId, 150) }),
    );
    expect(revoked).toBe(2);
    const before = readClaims(fixture),
      rootBefore = before.find((row) => row['id'] === root.id),
      pointBefore = before.find((row) => row['id'] === point.id);
    if (rootBefore === undefined || pointBefore === undefined)
      throw new Error('actual first-child claims are absent');
    expect(pointBefore).toMatchObject({
      parent_claim_id: root.id,
      lease_expires_at: 150,
      lease_revoked_at: 150,
    });
    const occupancy = source.db.all(
      sql`SELECT * FROM claim_occupancy ORDER BY claim_id,resource_id`,
    );
    expect(occupancy).toHaveLength(1);
    const immutable = readImmutable(fixture),
      events = source.db.all(
        sql`SELECT * FROM resource_use_event WHERE use_id=${registered.value.id} ORDER BY revision`,
      );
    const readStage = async (ownerId: string, at: number) => {
      expect(readClaims(fixture)).toEqual(
        before.map((row) =>
          row['id'] === point.id ? { ...row, work_item_id: ownerId, updated_at: at } : row,
        ),
      );
      expect(
        source.db.all(sql`SELECT * FROM claim_occupancy ORDER BY claim_id,resource_id`),
      ).toEqual(occupancy);
      expect(readImmutable(fixture)).toEqual(immutable);
      expect(
        source.db.all(
          sql`SELECT * FROM resource_use_event WHERE use_id=${registered.value.id} ORDER BY revision`,
        ),
      ).toEqual(events);
      expect(await readVisible(fixture, prepared)).toEqual(registered.value);
      expect(readLocations(fixture, registered.value.id)).toEqual([
        { kind: 'claim', work_item_id: ancestorId },
        { kind: 'claim', work_item_id: ownerId },
      ]);
      expect(await source.stores.runtimeCommands.readBinding(runtimeScope, point.id)).toEqual(
        binding,
      );
      expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    };
    const record = await transition(
      fixture,
      {
        kind: 'fresh',
        child: freshChild(fixture),
        respaced: [],
        localDependencies: [],
        detachedIncidents: [],
      },
      201,
    );
    await readStage(childId, 201);
    // A null reservation on the transition parent is lawful only while it is a
    // parent. It stays there, and up must refuse until actual removal.
    const parentReservation: Claim = {
      ...root,
      id: 'resource-first-parent-reservation',
      workItemId: parentId,
    };
    expect(
      await source.stores.claims.add([parentReservation], [], { ...seed.stamp, at: 202 }, []),
    ).toBe('written');
    const reserved = fixture.readEvidence();
    const refused = await source.uow.run(async (scope) => ({
      commit: true,
      value: await scope.stores.subtrees.writeFirstChild(replay(record, 'up'), {
        ...seed.stamp,
        at: 203,
      }),
    }));
    expect(refused).toEqual({ kind: 'stale_transition' });
    expect(fixture.readEvidence()).toEqual(reserved);
    expect(
      source.db.all(sql`SELECT work_item_id,step_id FROM claim WHERE id=${parentReservation.id}`),
    ).toEqual([{ work_item_id: parentId, step_id: null }]);
    await source.stores.claims.remove([parentReservation], [], { ...seed.stamp, at: 204 });
    expect(await readVisible(fixture, prepared)).toEqual(registered.value);
    await transition(fixture, replay(record, 'up'), 205);
    await readStage(parentId, 205);
    expect(await source.stores.workItems.findById(childId)).toBeNull();
    await transition(fixture, replay(record, 'down'), 206);
    await readStage(childId, 206);
    await source.stores.claims.remove([{ ...point, workItemId: childId }], [], {
      ...seed.stamp,
      at: 207,
    });
    expect(await readVisible(fixture, prepared)).toEqual(registered.value);
    expect(source.db.all(sql`SELECT * FROM claim_occupancy`)).toEqual([]);
    await source.stores.claims.remove([root], [], { ...seed.stamp, at: 208 });
    expect(source.db.all(sql`SELECT id FROM claim`)).toEqual([]);
    expect(await readVisible(fixture, prepared)).toMatchObject({
      state: 'cleanup_pending',
      workItemId: parentId,
      revision: 2,
    });
    expect(readImmutable(fixture)).toEqual(immutable);
    expect(
      source.db.all(
        sql`SELECT * FROM resource_use_event WHERE use_id=${registered.value.id} AND revision=1`,
      ),
    ).toEqual(events);
    expect(
      source.db.all(
        sql`SELECT json_extract(snapshot,'$.kind') AS kind FROM resource_use_event WHERE use_id=${registered.value.id} ORDER BY revision`,
      ),
    ).toEqual([{ kind: 'registered' }, { kind: 'cleanup_requested' }]);
  });
}, 30000);

/** Attempt numbers and original registration bytes survive real atomic structural transfer; end follows its current location. */
test('sqlite first child keeps attempted reported resource cleanup on its moved attempt through down up down', async () => {
  await withinFixture(async (fixture) => {
    const prepared = await prepare(fixture),
      { source, seed } = fixture;
    const started = await source.stores.attempts.start(
      {
        workItemId: parentId,
        stepId,
        startedAt: 101,
        executorPersonId: personId,
        reference: 'opaque-live-attempt-reference',
        note: 'opaque-live-attempt-note',
      },
      seed.stamp,
    );
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error('healthy resource attempt start refused');
    expect(started.attempt).toMatchObject({
      workItemId: parentId,
      stepId,
      attemptNumber: 1,
      executorPersonId: personId,
      endedAt: null,
    });
    const registered = await prepared.uses.register(
      seed.workPackageId,
      prepared.actor,
      {
        requestId: 'resource-first-attempt',
        resourceId,
        workItemId: parentId,
        stepId,
        attemptNumber: 1,
        agentRun: runId,
        responsiblePersonId: personId,
        locator: '/fixture/first-child-attempt',
        units: 3,
      },
      102,
    );
    expect(registered.ok).toBe(true);
    if (!registered.ok) throw new Error('healthy attempted resource registration refused');
    const physical = source.db.all<Record<string, unknown>>(
      sql`SELECT * FROM step_node_attempt WHERE work_item_id=${parentId}`,
    );
    expect(physical).toHaveLength(1);
    const immutable = readImmutable(fixture),
      events = source.db.all(
        sql`SELECT * FROM resource_use_event WHERE use_id=${registered.value.id} ORDER BY revision`,
      );
    const readStage = async (ownerId: string, at: number) => {
      expect(source.db.all(sql`SELECT * FROM step_node_attempt`)).toEqual(
        physical.map((row) => ({ ...row, work_item_id: ownerId, updated_at: at })),
      );
      expect(await source.stores.attempts.listByWorkPackage(seed.workPackageId)).toEqual([
        { ...started.attempt, workItemId: ownerId },
      ]);
      expect(readImmutable(fixture)).toEqual(immutable);
      expect(await readVisible(fixture, prepared)).toEqual(registered.value);
      expect(
        source.db.all(
          sql`SELECT * FROM resource_use_event WHERE use_id=${registered.value.id} ORDER BY revision`,
        ),
      ).toEqual(events);
      expect(readLocations(fixture, registered.value.id)).toEqual([
        { kind: 'attempt', work_item_id: ownerId },
        { kind: 'claim', work_item_id: ownerId },
      ]);
      expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    };
    const record = await transition(
      fixture,
      {
        kind: 'fresh',
        child: freshChild(fixture),
        respaced: [],
        localDependencies: [],
        detachedIncidents: [],
      },
      201,
    );
    await readStage(childId, 201);
    const marks = await source.stores.attempts.listIssued(seed.workPackageId, [parentId, childId]);
    expect(marks).toHaveLength(2);
    expect(marks as unknown).toEqual(
      expect.arrayContaining([
        { workItemId: parentId, stepId, issued: 1 },
        { workItemId: childId, stepId, issued: 1 },
      ]),
    );
    await transition(fixture, replay(record, 'up'), 202);
    await readStage(parentId, 202);
    expect(await source.stores.workItems.findById(childId)).toBeNull();
    await transition(fixture, replay(record, 'down'), 203);
    await readStage(childId, 203);
    const ended = await source.stores.attempts.end(
      { workItemId: childId, stepId, endedAt: 300, outcome: 'succeeded' },
      { ...seed.stamp, at: 300 },
    );
    expect(ended.ok).toBe(true);
    if (!ended.ok) throw new Error('moved resource attempt end refused');
    expect(ended.attempt).toMatchObject({
      workItemId: childId,
      attemptNumber: 1,
      endedAt: 300,
      outcome: 'succeeded',
      reference: started.attempt.reference,
      note: started.attempt.note,
    });
    expect(await readVisible(fixture, prepared)).toMatchObject({
      state: 'cleanup_pending',
      workItemId: parentId,
      stepId,
      attemptNumber: 1,
      revision: 2,
    });
    expect(readImmutable(fixture)).toEqual(immutable);
    expect(
      source.db.all(
        sql`SELECT * FROM resource_use_event WHERE use_id=${registered.value.id} AND revision=1`,
      ),
    ).toEqual(events);
    expect(
      source.db.all(
        sql`SELECT json_extract(snapshot,'$.kind') AS kind FROM resource_use_event WHERE use_id=${registered.value.id} ORDER BY revision`,
      ),
    ).toEqual([{ kind: 'registered' }, { kind: 'cleanup_requested' }]);
  });
}, 30000);
