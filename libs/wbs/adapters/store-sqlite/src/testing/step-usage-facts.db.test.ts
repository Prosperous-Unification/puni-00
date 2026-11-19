import {projectReadableStepUsage} from '@wbs/core';
import { parseDependencyReceipt } from '@wbs/contracts/dependency-runtime';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { readStepBlockageActivation } from '../step-blockage-activation';
import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

type UsageFixture = Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;

async function withUsageFixture(
  assertUsage: (fixture: UsageFixture) => Promise<void>,
): Promise<void> {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  let primary: { readonly cause: unknown } | undefined;
  try {
    const { seed, source, port } = fixture;
    expect(
      (
        await port.defineAndBindStep(
          seed.organizationId,
          {
            id: 'usage-dev',
            code: 'usage-dev',
            name: 'Usage development',
            position: 0,
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: 0,
          },
          {
            bindingId: 'usage-binding',
            scopeKind: 'organization',
            scopeId: seed.organizationId,
            workItemTypeId: null,
            position: 0,
          },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
    for (const placement of [
      { id: 'usage-parent', workPackageId: seed.workPackageId, parentId: null, position: 0 },
      {
        id: 'usage-leaf',
        workPackageId: seed.workPackageId,
        parentId: 'usage-parent',
        position: 0,
      },
      {
        id: 'usage-second',
        workPackageId: seed.workPackageId,
        parentId: 'usage-parent',
        position: 1,
      },
      { id: 'usage-peer', workPackageId: seed.workPackageId, parentId: null, position: 1 },
      {
        id: 'usage-foreign-end',
        workPackageId: seed.siblingWorkPackageId,
        parentId: null,
        position: 0,
      },
    ])
      await source.stores.workItems.insert(
        workItemRow({ ...placement, name: placement.id }),
        [],
        seed.stamp,
      );
    source.db.run(
      sql`INSERT INTO person(id,name,account_id,created_at,created_by) VALUES('usage-person','Usage person',${seed.stamp.by},100,${seed.stamp.by})`,
    );
    source.db.run(
      sql`INSERT INTO person_organization(resource_id,organization_id,name) VALUES('usage-person',${seed.organizationId},'Usage person')`,
    );
    expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    await assertUsage(fixture);
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await fixture.close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup],
        'usage assertion and fixture close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
}

const POINT_FACTS = [
  { kind: 'estimate', table: 'estimate' },
  { kind: 'actual', table: 'actual' },
  { kind: 'progress', table: 'step_progress' },
  { kind: 'measure', table: 'step_measure' },
  { kind: 'measure_estimate', table: 'measure_estimate' },
  { kind: 'attempt', table: 'step_node_attempt' },
  { kind: 'attempt_issued', table: 'step_node_attempt_issued' },
  { kind: 'assignment', table: 'assignment' },
  { kind: 'claim', table: 'claim' },
  { kind: 'blockage', table: 'step_blockage' },
  { kind: 'parallel', table: 'step_parallel' },
] as const;

async function seedExternalStorage(fixture: UsageFixture): Promise<void> {
  const { source } = fixture;
  // Complete fixture-only persisted state, following the existing activation repository fixtures.
  // This does not exercise activateDependencies or prove participant/host authorization.
  const receipt = parseDependencyReceipt({
    protocol: 'wbs-dependency-activation',
    version: 1,
    activationId: 'usage-fixture',
    databaseIdentity: fixture.fixtureId,
    candidateImage: 'wbs@sha256:' + 'a'.repeat(64),
    rollbackImage: 'wbs@sha256:' + 'b'.repeat(64),
    participantProofSha256: 'c'.repeat(64),
    migrationCaptureSha256: 'd'.repeat(64),
    activatedAt: 100,
  });
  const triggers = source.db.all<{ name: string; sql: string }>(
    sql`SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name IN ('external_dependency_admit_insert','external_dependency_admit_update','external_dependency_admit_delete') ORDER BY name`,
  );
  expect(triggers.map(({ name }) => name)).toEqual([
    'external_dependency_admit_delete',
    'external_dependency_admit_insert',
    'external_dependency_admit_update',
  ]);
  for (const trigger of triggers) expect(trigger.sql).toContain('external_dependencies_inactive');
  await source.uow.run(() => {
    source.db.run(
      sql`INSERT INTO cross_work_package_dependency_activation_receipt(id,receipt) VALUES(1,${JSON.stringify(receipt)})`,
    );
    source.db.run(
      sql`UPDATE cross_work_package_dependency_activation SET state='ENABLED' WHERE id=1`,
    );
    return Promise.resolve({ commit: true, value: undefined });
  });
  expect(source.db.all(sql`SELECT id,state FROM cross_work_package_dependency_activation`)).toEqual(
    [{ id: 1, state: 'ENABLED' }],
  );
  expect(
    source.db.all(sql`SELECT id,receipt FROM cross_work_package_dependency_activation_receipt`),
  ).toEqual([{ id: 1, receipt: JSON.stringify(receipt) }]);
  expect(
    source.db.all(
      sql`SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name IN ('external_dependency_admit_insert','external_dependency_admit_update','external_dependency_admit_delete') ORDER BY name`,
    ),
  ).toEqual(triggers);
  expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
}

for (const selected of POINT_FACTS) {
  test('sqlite unbind protects isolated persisted ' + selected.kind, async () => {
    await withUsageFixture(async (fixture) => {
      const { source, port, seed } = fixture;
      const writes = {
        estimate: sql`INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic,created_at,created_by) VALUES('usage-leaf','usage-dev',1,2,3,100,${seed.stamp.by})`,
        actual: sql`INSERT INTO actual(work_item_id,step_id,days,recorded_at,created_at,created_by) VALUES('usage-leaf','usage-dev',2,100,100,${seed.stamp.by})`,
        progress: sql`INSERT INTO step_progress(work_item_id,step_id,state,stated_at,created_at,created_by) VALUES('usage-leaf','usage-dev','done',100,100,${seed.stamp.by})`,
        measure: sql`INSERT INTO step_measure(work_item_id,step_id,metric,value,recorded_at,created_at,created_by) VALUES('usage-leaf','usage-dev','hours_actual',2,100,100,${seed.stamp.by})`,
        measure_estimate: sql`INSERT INTO measure_estimate(work_item_id,step_id,measure_key,optimistic,realistic,pessimistic,single_point,created_at,created_by) VALUES('usage-leaf','usage-dev','tokens',1,2,3,0,100,${seed.stamp.by})`,
        attempt: sql`INSERT INTO step_node_attempt(work_item_id,step_id,attempt_number,started_at,ended_at,outcome,created_at,created_by) VALUES('usage-leaf','usage-dev',1,100,101,'succeeded',100,${seed.stamp.by})`,
        attempt_issued: sql`INSERT INTO step_node_attempt_issued(work_item_id,step_id,issued) VALUES('usage-leaf','usage-dev',7)`,
        assignment: sql`INSERT INTO assignment(work_item_id,step_id,person_id,created_at,created_by) VALUES('usage-leaf','usage-dev','usage-person',100,${seed.stamp.by})`,
        claim: sql`INSERT INTO claim(id,work_item_id,step_id,person_id,lease_expires_at,lease_revoked_at,created_at,created_by) VALUES('usage-claim','usage-leaf','usage-dev','usage-person',100,101,100,${seed.stamp.by})`,
        blockage: sql`INSERT INTO step_blockage(work_item_id,step_id,blocked_at,created_at,created_by) VALUES('usage-leaf','usage-dev',100,100,${seed.stamp.by})`,
        parallel: sql`INSERT INTO step_parallel(work_item_id,step_id,max_parallel,created_at,created_by) VALUES('usage-leaf','usage-dev',2,100,${seed.stamp.by})`,
      };
      if (selected.kind === 'blockage') {
        expect(readStepBlockageActivation(source.db)).toBe('DISABLED');
        await source.uow.run(() => {
          source.db.run(sql`UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1`);
          return Promise.resolve({ commit: true, value: undefined });
        });
        expect(readStepBlockageActivation(source.db)).toBe('ENABLED');
      }
      source.db.run(writes[selected.kind]);
      for (const entry of POINT_FACTS)
        expect(
          source.db.all(sql.raw('SELECT work_item_id FROM "' + entry.table + '"')),
        ).toHaveLength(entry.kind === selected.kind ? 1 : 0);
      expect(source.db.all(sql`SELECT id FROM typed_dependency`)).toEqual([]);
      expect(source.db.all(sql`SELECT id FROM external_dependency`)).toEqual([]);
      expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
      const before = fixture.readEvidence();
      expect(Object.hasOwn(port, 'unbindStep')).toBe(true);
      const pairs = [
        {
          id: 'usage-leaf',
          name: 'usage-leaf',
          workPackageId: seed.workPackageId,
          stepId: 'usage-dev',
          facts: [selected.kind],
        },
      ];
      const captured = await port.readUsage(seed.organizationId);
      if (captured === null) throw Error('actual usage organization absent');
      expect(projectReadableStepUsage(captured.packages, captured.bindings, captured.facts, seed.projectId, 'usage-dev', new Set([seed.workPackageId]))).toEqual({count: 1, pairs});
      expect(fixture.readEvidence()).toEqual(before);
      expect(
        await port.unbindStep(seed.organizationId, 'usage-binding', { dryRun: false }, seed.stamp),
      ).toEqual({ kind: 'step_nodes_in_use', count: 1, pairs });
      expect(fixture.readEvidence()).toEqual(before);
      expect(
        await port.unbindStep(seed.organizationId, 'usage-binding', { dryRun: true }, seed.stamp),
      ).toEqual({ kind: 'preview', wouldRefuse: 'step_nodes_in_use', count: 1, pairs });
      expect(fixture.readEvidence()).toEqual(before);
    });
  });
}

for (const family of ['typed_dependency', 'external_dependency'] as const) {
  for (const side of ['predecessor', 'successor'] as const) {
    for (const scope of ['node', 'descendant-step'] as const) {
      test('sqlite unbind protects isolated ' + family + ' ' + side + ' ' + scope, async () => {
        await withUsageFixture(async (fixture) => {
          const { source, port, seed } = fixture;
          const addressed = scope === 'node' ? 'usage-leaf' : 'usage-parent';
          const peer = family === 'typed_dependency' ? 'usage-peer' : 'usage-foreign-end';
          const predecessor = side === 'predecessor' ? addressed : peer;
          const successor = side === 'successor' ? addressed : peer;
          const predecessorPackage =
            side === 'predecessor' || family === 'typed_dependency'
              ? seed.workPackageId
              : seed.siblingWorkPackageId;
          const successorPackage =
            side === 'successor' || family === 'typed_dependency'
              ? seed.workPackageId
              : seed.siblingWorkPackageId;
          const predecessorScope = side === 'predecessor' ? scope : 'whole';
          const successorScope = side === 'successor' ? scope : 'whole';
          const predecessorStep = side === 'predecessor' ? 'usage-dev' : null;
          const successorStep = side === 'successor' ? 'usage-dev' : null;
          if (family === 'external_dependency') await seedExternalStorage(fixture);
          if (family === 'typed_dependency')
            source.db.run(
              sql`INSERT INTO typed_dependency(id,work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,successor_step_id,type,created_at,created_by) VALUES('usage-edge',${seed.workPackageId},${predecessor},${predecessorScope},${predecessorStep},${successor},${successorScope},${successorStep},'FS',100,${seed.stamp.by})`,
            );
          else
            source.db.run(
              sql`INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,successor_step_id,type,created_at,created_by) VALUES('usage-edge',${seed.organizationId},${predecessorPackage},${successorPackage},${predecessor},${predecessorScope},${predecessorStep},${successor},${successorScope},${successorStep},'FS',100,${seed.stamp.by})`,
            );
          for (const entry of POINT_FACTS)
            expect(
              source.db.all(sql.raw('SELECT work_item_id FROM "' + entry.table + '"')),
            ).toEqual([]);
          expect(source.db.all(sql`SELECT id FROM typed_dependency`)).toHaveLength(
            family === 'typed_dependency' ? 1 : 0,
          );
          expect(source.db.all(sql`SELECT id FROM external_dependency`)).toHaveLength(
            family === 'external_dependency' ? 1 : 0,
          );
          expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
          const before = fixture.readEvidence();
          expect(Object.hasOwn(port, 'unbindStep')).toBe(true);
          const leaves = scope === 'node' ? ['usage-leaf'] : ['usage-leaf', 'usage-second'];
          const pairs = leaves.map((id) => ({
            id,
            name: id,
            workPackageId: seed.workPackageId,
            stepId: 'usage-dev',
            facts: [family],
          }));
          const captured = await port.readUsage(seed.organizationId);
          if (captured === null) throw Error('actual relationship usage organization absent');
          expect(projectReadableStepUsage(captured.packages, captured.bindings, captured.facts, seed.projectId, 'usage-dev', new Set([seed.workPackageId]))).toEqual({count: leaves.length, pairs});
          expect(fixture.readEvidence()).toEqual(before);
          expect(
            await port.unbindStep(
              seed.organizationId,
              'usage-binding',
              { dryRun: false },
              seed.stamp,
            ),
          ).toEqual({ kind: 'step_nodes_in_use', count: leaves.length, pairs });
          expect(fixture.readEvidence()).toEqual(before);
          expect(
            await port.unbindStep(
              seed.organizationId,
              'usage-binding',
              { dryRun: true },
              seed.stamp,
            ),
          ).toEqual({
            kind: 'preview',
            wouldRefuse: 'step_nodes_in_use',
            count: leaves.length,
            pairs,
          });
          expect(fixture.readEvidence()).toEqual(before);
        });
      });
    }
  }
}

test('sqlite unbind preserves a standalone null subtree reservation through preview and apply', async () => {
  await withUsageFixture(async (fixture) => {
    const { source, port, seed } = fixture;
    source.db.run(
      sql`INSERT INTO claim(id,work_item_id,step_id,person_id,created_at,created_by) VALUES('usage-reservation','usage-parent',NULL,'usage-person',100,${seed.stamp.by})`,
    );
    const reservations = source.db.all(sql`SELECT * FROM claim`);
    expect(reservations).toHaveLength(1);
    expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    const before = fixture.readEvidence();
    expect(Object.hasOwn(port, 'unbindStep')).toBe(true);
    expect(
      await port.unbindStep(seed.organizationId, 'usage-binding', { dryRun: true }, seed.stamp),
    ).toEqual({ kind: 'preview', wouldRefuse: null });
    expect(fixture.readEvidence()).toEqual(before);
    expect(
      await port.unbindStep(seed.organizationId, 'usage-binding', { dryRun: false }, seed.stamp),
    ).toEqual({ kind: 'unbound', workPackageIds: [seed.workPackageId, seed.siblingWorkPackageId],projectIds:[seed.projectId,seed.siblingProjectId].sort() });
    expect(source.db.all(sql`SELECT * FROM claim`)).toEqual(reservations);
    expect(fixture.readEvidence().packageValues).toEqual(before.packageValues);
  });
});

test('sqlite unbind protects a valid work item with an empty display name', async () => {
  await withUsageFixture(async (fixture) => {
    const { source, seed, port } = fixture;
    await source.stores.workItems.insert(
      workItemRow({ id: 'usage-blank', name: '', workPackageId: seed.workPackageId, position: 20 }),
      [],
      seed.stamp,
    );
    expect(
      await source.stores.estimates.set(
        {
          workItemId: 'usage-blank',
          stepId: 'usage-dev',
          optimistic: 1,
          realistic: 2,
          pessimistic: 3,
        },
        seed.stamp,
      ),
    ).toBe('written');
    expect(
      (await source.stores.workItems.listByWorkPackage(seed.workPackageId)).find(
        ({ id }) => id === 'usage-blank',
      )?.name,
    ).toBe('');
    const before = fixture.readEvidence();
    expect(Object.hasOwn(port, 'unbindStep')).toBe(true);
    expect(
      await port.unbindStep(seed.organizationId, 'usage-binding', { dryRun: false }, seed.stamp),
    ).toEqual({
      kind: 'step_nodes_in_use',
      count: 1,
      pairs: [
        {
          id: 'usage-blank',
          name: '',
          workPackageId: seed.workPackageId,
          stepId: 'usage-dev',
          facts: ['estimate'],
        },
      ],
    });
    expect(fixture.readEvidence()).toEqual(before);
  });
});
