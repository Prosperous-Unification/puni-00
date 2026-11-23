import type { AuthenticatedUser } from '@wbs/contracts';
import { parseDependencyReceipt } from '@wbs/contracts/dependency-runtime';
import type { StoredTypedDependency } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { clockOf } from '@wbs/core/ports/clock';
import type { CommittedWorkPackageEvent } from '@wbs/core/ports/committed-fanout';
import { LEGACY_EDIT_ADMISSION } from '@wbs/core/ports/edit-admission';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { SqliteCommandAccess } from '../command-access';
import { inspectDependencyActivation } from '../cross-work-package-dependency-activation';
import { MachineCredentialRepository } from '../machine-credential';
import { SqliteOrganizationAccess } from '../organization-access';
import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

type Fixture = Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;

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
        'external first-child owner and Source close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}

/** Actual inspector validates the complete local fixture marker, receipt, ledger and native guards; this is not host activation authority. */
async function activateFixture(fixture: Fixture): Promise<void> {
  const { source, seed } = fixture;
  expect(inspectDependencyActivation(source.db)).toEqual({ state: 'DISABLED', receipt: null });
  const receipt = parseDependencyReceipt({
    protocol: 'wbs-dependency-activation',
    version: 1,
    activationId: 'first-child-external',
    databaseIdentity: fixture.fixtureId,
    candidateImage: 'wbs@sha256:' + 'a'.repeat(64),
    rollbackImage: 'wbs@sha256:' + 'b'.repeat(64),
    participantProofSha256: 'c'.repeat(64),
    migrationCaptureSha256: 'd'.repeat(64),
    activatedAt: seed.stamp.at,
  });
  await source.uow.run(() => {
    source.db.run(
      sql`INSERT INTO cross_work_package_dependency_activation_receipt(id,receipt) VALUES(1,${JSON.stringify(receipt)})`,
    );
    source.db.run(
      sql`UPDATE cross_work_package_dependency_activation SET state='ENABLED' WHERE id=1`,
    );
    return Promise.resolve({ commit: true, value: undefined });
  });
  expect(inspectDependencyActivation(source.db)).toEqual({ state: 'ENABLED', receipt });
}

async function revisionOf(fixture: Fixture, id: string): Promise<number> {
  const row = await fixture.source.stores.workItems.findById(id);
  if (row === null) throw new Error('required external endpoint is absent: ' + id);
  return row.revision;
}

/** The selected organization is request evidence. Actual membership, activation, credential rules, creator grants and current in-writer authority remain production reads. */
async function commandRunner(fixture: Fixture) {
  const { source, seed } = fixture;
  const principal: AuthenticatedUser = {
    id: seed.stamp.by,
    username: 'catalogue-author',
    scopes: ['read', 'write'],
    authentication: { kind: 'first_party', issuedAt: seed.stamp.at },
    organizationOperation: {
      kind: 'mutation',
      expected: { kind: 'present', organizationId: seed.organizationId },
    },
  };
  const organizations = new SqliteOrganizationAccess(
    source.db,
    () => Promise.resolve(seed.organizationId),
    () => seed.stamp.at,
  );
  const resolution = await organizations.resolve(principal);
  expect(resolution).toMatchObject({
    ok: true,
    access: {
      kind: 'scoped',
      scope: { organizationId: seed.organizationId, userId: seed.stamp.by },
    },
  });
  if (!resolution.ok || resolution.access.kind !== 'scoped')
    throw new Error('actual scoped first-child authority is unavailable');
  const commandAccess = new SqliteCommandAccess(
    source.db,
    organizations,
    new MachineCredentialRepository(source.db, source.gate),
  );
  expect(
    await commandAccess.resolve({ kind: 'human', principal, expectedAccess: resolution.access }),
  ).toEqual(resolution);
  const bound = source.bindLivePlans({ schedulerOf: () => fastScheduler });
  const announcements = recordingBroadcaster();
  const delivered: CommittedWorkPackageEvent[] = [];
  const deliveryReads: number[] = [];
  let next = 0;
  const clock = clockOf({
    now: () => seed.stamp.at,
    newId: () => 'first-child-external-generated-' + String(++next),
  });
  const publicGraph = servicesOver(bound.stores, {
    admission: LEGACY_EDIT_ADMISSION,
    dependencyContext: createLocalDependencyContext(bound.stores),
    clock,
    broadcast: announcements,
    scheduler: fastScheduler,
  });
  const runner = createPlanCommandRunner({
    commandAccess,
    uow: bound.uow,
    announcements,
    publicServices: publicGraph,
    batchServices: (scope, broadcast, admission, dependencyContext) =>
      servicesOver(scope.stores, {
        admission,
        dependencyContext: { kind: 'bound', context: dependencyContext },
        clock,
        broadcast,
        scheduler: fastScheduler,
        schedulerMode: 'capture',
      }),
    committedFanout: {
      now: () => seed.stamp.at,
      deliverCommitted: async (events) => {
        // Reacquiring the actual Source proves delivery runs after its writer turn.
        await bound.uow.run(async (scope) => {
          deliveryReads.push((await scope.stores.workPackages.list()).length);
          return { commit: true, value: undefined };
        });
        delivered.push(...events);
      },
    },
  });
  return { runner, principal, access: resolution.access, announcements, delivered, deliveryReads };
}

test('actual scoped first-child command preserves external incoming and outgoing identity through undo and redo', async () => {
  await withinFixture(async (fixture) => {
    const { source, seed, port } = fixture;
    const stepId = 'first-child-external-step',
      parentId = 'external-parent',
      predecessorId = 'external-predecessor',
      successorId = 'external-successor';
    const unrelatedPredecessorId = 'external-unrelated-predecessor',
      unrelatedSuccessorId = 'external-unrelated-successor';
    expect(
      (
        await port.defineAndBindStep(
          seed.organizationId,
          {
            id: stepId,
            code: stepId,
            name: 'External first-child step',
            position: 10,
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: 0,
          },
          {
            bindingId: 'first-child-external-binding',
            scopeKind: 'organization',
            scopeId: seed.organizationId,
            workItemTypeId: null,
            position: 10,
          },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
    for (const [id, workPackageId, position] of [
      [parentId, seed.workPackageId, 10],
      [predecessorId, seed.siblingWorkPackageId, 10],
      [successorId, seed.siblingWorkPackageId, 20],
      [unrelatedPredecessorId, seed.siblingWorkPackageId, 30],
      [unrelatedSuccessorId, seed.siblingWorkPackageId, 40],
    ] as const) {
      await source.stores.workItems.insert(
        workItemRow({ id, workPackageId, name: id, position }),
        [],
        seed.stamp,
      );
      expect(await source.stores.estimates.readTarget(id, stepId)).toMatchObject({
        kind: 'resolved',
        step: { stepId },
      });
    }
    await activateFixture(fixture);
    const node = (
      workPackageId: string,
      workItemId: string,
    ): StoredTypedDependency['predecessor'] => ({
      workPackageId,
      workItemId,
      scope: 'node',
      stepId,
    });
    const relationships = (ownerId: string): StoredTypedDependency[] => [
      {
        id: 'a-external-incoming',
        workPackageId: seed.workPackageId,
        type: 'SS',
        predecessor: node(seed.siblingWorkPackageId, predecessorId),
        successor: node(seed.workPackageId, ownerId),
      },
      {
        id: 'b-external-outgoing',
        workPackageId: seed.siblingWorkPackageId,
        type: 'FF',
        predecessor: node(seed.workPackageId, ownerId),
        successor: node(seed.siblingWorkPackageId, successorId),
      },
      {
        id: 'c-external-unrelated',
        workPackageId: seed.siblingWorkPackageId,
        type: 'FS',
        predecessor: node(seed.siblingWorkPackageId, unrelatedPredecessorId),
        successor: node(seed.siblingWorkPackageId, unrelatedSuccessorId),
      },
    ];
    for (const relationship of relationships(parentId))
      await source.stores.typedDependencies.add(relationship, seed.stamp);
    expect(
      await source.stores.typedDependencies.listIncident([
        seed.workPackageId,
        seed.siblingWorkPackageId,
      ]),
    ).toEqual(relationships(parentId));
    expect(source.db.all(sql`SELECT id FROM external_dependency ORDER BY id`)).toEqual([
      { id: 'a-external-incoming' },
      { id: 'b-external-outgoing' },
    ]);
    expect(source.db.all(sql`SELECT id FROM typed_dependency ORDER BY id`)).toEqual([
      { id: 'c-external-unrelated' },
    ]);
    for (const relationship of relationships(parentId))
      expect(await source.stores.typedDependencies.incidents.capture(relationship.id)).toEqual({
        dependency: relationship,
        createdAt: seed.stamp.at,
        createdBy: seed.stamp.by,
      });
    expect(await source.stores.estimates.listByWorkPackage(seed.workPackageId)).toEqual([]);
    expect(await source.stores.actuals.listByWorkPackage(seed.workPackageId)).toEqual([]);
    expect(await source.stores.progress.listByWorkPackage(seed.workPackageId)).toEqual([]);
    const command = await commandRunner(fixture);
    expect(
      await command.runner.runWithin(
        seed.workPackageId,
        command.principal,
        [
          {
            kind: 'patchWorkItem',
            workItemId: parentId,
            patch: { notes: 'healthy external scoped command' },
          },
        ],
        command.access,
      ),
    ).toMatchObject({ ok: true });
    expect((await source.stores.workItems.findById(parentId))?.notes).toBe(
      'healthy external scoped command',
    );
    expect(
      await source.stores.typedDependencies.listIncident([
        seed.workPackageId,
        seed.siblingWorkPackageId,
      ]),
    ).toEqual(relationships(parentId));
    const predecessorRevision = await revisionOf(fixture, predecessorId),
      successorRevision = await revisionOf(fixture, successorId);
    const unrelated = await source.stores.workItems.listByIds(seed.siblingWorkPackageId, [
      unrelatedPredecessorId,
      unrelatedSuccessorId,
    ]);
    expect(unrelated).toHaveLength(2);
    const catalogue = await port.readCatalogue(seed.organizationId),
      packageValues = fixture.readEvidence().packageValues;
    const beforeDelivered = command.delivered.length;
    const created = await command.runner.runWithin(
      seed.workPackageId,
      command.principal,
      [
        {
          kind: 'createWorkItem',
          ref: 'child',
          parentId,
          afterId: null,
          name: 'External first child',
        },
        {
          kind: 'patchWorkItem',
          workItemRef: 'child',
          patch: { notes: 'external incident settled' },
        },
      ],
      command.access,
    );
    expect(created).toMatchObject({ ok: true });
    if (!created.ok) throw new Error('lawful external first-child command was refused');
    const child = created.results.at(0);
    if (child?.kind !== 'createWorkItem')
      throw new Error('external first-child response is absent');
    const assertRelationships = async (ownerId: string, transitions: number) => {
      const expected = relationships(ownerId);
      expect(
        await source.stores.typedDependencies.listIncident([
          seed.workPackageId,
          seed.siblingWorkPackageId,
        ]),
      ).toEqual(expected);
      expect(await source.stores.typedDependencies.listByWorkPackage(seed.workPackageId)).toEqual([
        expected[0],
      ]);
      expect(
        await source.stores.typedDependencies.listByWorkPackage(seed.siblingWorkPackageId),
      ).toEqual(expected.slice(1));
      for (const relationship of expected)
        expect(await source.stores.typedDependencies.incidents.capture(relationship.id)).toEqual({
          dependency: relationship,
          createdAt: seed.stamp.at,
          createdBy: seed.stamp.by,
        });
      expect(await revisionOf(fixture, predecessorId)).toBe(predecessorRevision + transitions);
      expect(await revisionOf(fixture, successorId)).toBe(successorRevision + transitions);
      expect(
        await source.stores.workItems.listByIds(seed.siblingWorkPackageId, [
          unrelatedPredecessorId,
          unrelatedSuccessorId,
        ]),
      ).toEqual(unrelated);
      expect(await port.readCatalogue(seed.organizationId)).toEqual(catalogue);
      expect(fixture.readEvidence().packageValues).toEqual(packageValues);
      expect(await source.stores.estimates.listByWorkPackage(seed.workPackageId)).toEqual([]);
      expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    };
    await assertRelationships(child.id, 1);
    expect(await source.stores.workItems.findById(child.id)).toMatchObject({
      parentId,
      notes: 'external incident settled',
    });
    expect(command.delivered.length).toBeGreaterThan(beforeDelivered);
    expect(command.deliveryReads.length).toBeGreaterThan(0);
    expect(command.deliveryReads.every((count) => count === 3)).toBe(true);
    expect(
      await command.runner.undoWithin(seed.workPackageId, command.principal, command.access),
    ).toMatchObject({ ok: true });
    expect(await source.stores.workItems.findById(child.id)).toBeNull();
    await assertRelationships(parentId, 2);
    expect(
      await command.runner.redoWithin(seed.workPackageId, command.principal, command.access),
    ).toMatchObject({ ok: true });
    expect(await source.stores.workItems.findById(child.id)).toMatchObject({
      parentId,
      notes: 'external incident settled',
    });
    await assertRelationships(child.id, 3);
  });
}, 30000);
