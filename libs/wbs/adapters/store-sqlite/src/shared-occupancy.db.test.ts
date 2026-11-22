import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  AuditedAct,
  CredentialPin,
  PlanCommand,
  Scope,
  Source,
  TransactionalStores,
} from '@wbs/core';
import { clockOf, LEGACY_EDIT_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { ClaimLeaseSweep } from '@wbs/core/module/plan-commands/claim-lease-sweep';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import type { ScopedUndoOutcome } from '@wbs/core/module/plan-commands/plan-commands.feature';
import { prepareWorkPackageBirth } from '@wbs/core/module/work-package/work-package-birth';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { expectCreated } from '@wbs/core/testing/expect-created';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { CLAIM_LEASE_MS } from '@wbs/domain';
import { MemoryState, openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it, spyOn } from 'bun:test';

import { openDatabase } from './db';
import { openSqliteSource } from './source';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { seedPackageParent } from './testing/legacy-package-parent';
import { activateTestStepBlockages } from './testing/step-blockage-activation';

/**
 * `wbs-shared-occupancy` slice 3 on both stores: two work packages A and B of one
 * organization share a resource's directory capacity, through the command
 * runner and its journal (tasks 3.1, 3.4).
 */
const F = 'account-f';
const ORG = 'org-shared';
const FOREIGN = 'org-foreign';
const RAM = 'resource-host-ram';
const STAGING = 'resource-staging';
const LEAVES = 4;
const T = 1_000_000;

function inventoryGrant(roleId: 'org-admin' | 'org-viewer') {
  return {
    id: 'inventory-role',
    organizationId: ORG,
    scope: { kind: 'organization' },
    subject: { kind: 'user', userId: F },
    roleId,
    origin: 'route',
    createdAt: T,
    createdBy: F,
  } as const;
}

function staleDetail(outcome: ScopedUndoOutcome): string | null {
  if (outcome.ok || !('reason' in outcome) || outcome.reason !== 'stale_undo')
    throw new Error(`expected stale_undo: ${JSON.stringify(outcome)}`);
  return outcome.detail;
}

interface Opened {
  readonly source: Source<TransactionalStores>;
  readonly seedParent: (organizationId: string, projectId: string) => void;
  readonly removePackageOrganization: (id: string) => void;
  /** Owns resources beside the work packages already created in {@link ORG}. */
  readonly own: (workPackageIds: readonly string[], resourceIds: readonly string[]) => void;
  readonly isMemory: boolean;
  readonly observation?: Source<TransactionalStores>;
  readonly activateInventory?: (personIds: readonly string[]) => Promise<void>;
  readonly useViewer?: (enabled: boolean) => void;
  readonly setClaimStamp?: (
    claimId: string,
    field: 'write' | 'expiry',
    value: number | string,
  ) => void;
  /**
   * SQLite only: makes `accountId` an admin of {@link ORG}, `personIds` its
   * persons, and activates the deployment, so a test can read and claim under
   * scoped access. Absent on the memory twin, which admits no scoped batch.
   */
  readonly activate?: (accountId: string, personIds: readonly string[]) => void;
  readonly dispose: () => void;
}

const STORES: readonly { readonly name: string; readonly open: () => Opened }[] = [
  {
    name: 'memory',
    open: () => {
      const fixture = openMemorySourceFixture();
      return {
        source: fixture.source,
        seedParent: () => {
          fixture.addOrganization(ORG, { legacy: false });
          fixture.setPackageCreationMembers(ORG, [F]);
          fixture.seedPackageParent({
            spaceId: null,
            spacePosition: null,
            id: 'fixture-project',
            organizationId: ORG,
            name: 'Fixture project',
            createdBy: F,
            revision: 0,
            createdAt: 1,
            updatedAt: null,
          });
        },
        removePackageOrganization: (id) => {
          fixture.removeWorkPackageOrganization(id);
        },
        own: (_workPackageIds, resourceIds) => {
          for (const id of resourceIds) fixture.ownResourceInOrganization(id, ORG);
        },
        isMemory: true,
        activateInventory: async (personIds) => {
          for (const personId of personIds) fixture.ownPersonInOrganization(personId, ORG, [F]);
          fixture.seedPackageExportGrant(inventoryGrant('org-admin'));
          await fixture.activateOrganizationIsolation();
        },
        useViewer: (enabled) => {
          fixture.removePackageExportGrant('inventory-role');
          fixture.seedPackageExportGrant(inventoryGrant(enabled ? 'org-viewer' : 'org-admin'));
        },
        dispose: () => undefined,
      };
    },
  },
  {
    name: 'sqlite',
    open: () => {
      const folder = mkdtempSync(join(tmpdir(), 'shared-occupancy-'));
      const dbPath = join(folder, 'plan.db');
      const custody = { hasUnknownOwner: false };
      try {
        migrateEmptyCatalogueFixture({ path: dbPath, directory: folder, reportedAt: 1 }, custody);
      } catch (cause: unknown) {
        // Proof: omitting this guard deleted the owned namespace after native close
        // returned then threw; the unchanged retention assertion failed in
        // mixed-occupancy-close-root-v258, then exact restoration passed.
        if (custody.hasUnknownOwner)
          throw new Error('shared-occupancy fixture custody is unknown; retained ' + folder, {
            cause,
          });
        rmSync(folder, { recursive: true, force: true });
        throw cause;
      }
      activateTestStepBlockages(dbPath);
      // Caps far above the fixture: a scoped claim counts them, never reaches them.
      const source = openSqliteSource({
        dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
        dbPath,
        organizationDefaultLimits: {
          maxAgentPersons: 1_000,
          maxConcurrentClaims: 1_000,
          maxCapacityUnitsPerResource: 1_000,
        },
      });
      return {
        // Caps far above the fixture: a scoped claim counts them, never reaches them.
        source,
        seedParent: (organizationId, projectId) => {
          const sqlite = openDatabase(dbPath);
          try {
            sqlite.run('INSERT INTO organization(id,name,created_at) VALUES(?,?,1)', [
              organizationId,
              organizationId,
            ]);
            sqlite.run(
              "INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES(?,?,'member',1)",
              [organizationId, F],
            );
          } finally {
            sqlite.close();
          }
          seedPackageParent(dbPath, organizationId, projectId);
        },
        removePackageOrganization: (id) => {
          const sqlite = openDatabase(dbPath);
          try {
            const trigger = sqlite
              .query<{ sql: string | null }, []>(
                "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='work_package_organization_frozen_delete'",
              )
              .get();
            if (trigger === null || typeof trigger.sql !== 'string' || trigger.sql === '')
              throw new Error('required fixture ownership trigger is absent or malformed');
            let failed = false;
            let failure: unknown;
            try {
              sqlite.run('DROP TRIGGER work_package_organization_frozen_delete');
              sqlite.run('DELETE FROM work_package_organization WHERE resource_id=?', [id]);
            } catch (cause: unknown) {
              failed = true;
              failure = cause;
            }
            let restorationFailure: { cause: unknown } | undefined;
            try {
              sqlite.run(trigger.sql);
            } catch (cause: unknown) {
              restorationFailure = { cause };
            }
            if (restorationFailure !== undefined)
              throw new AggregateError(
                failed ? [failure, restorationFailure.cause] : [restorationFailure.cause],
                'fixture ownership trigger restoration failed',
                { cause: failed ? failure : restorationFailure.cause },
              );
            if (failed) throw failure;
            const restored = sqlite
              .query<{ sql: string | null }, []>(
                "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='work_package_organization_frozen_delete'",
              )
              .get();
            expect(restored?.sql).toBe(trigger.sql);
          } finally {
            sqlite.close();
          }
        },
        observation: source.bindLivePlans({ schedulerOf: () => fastScheduler }),
        isMemory: false,
        setClaimStamp: (claimId, field, value) => {
          const sqlite = openDatabase(dbPath);
          try {
            const update =
              field === 'write'
                ? 'UPDATE claim SET created_at = ? WHERE id = ?'
                : 'UPDATE claim SET lease_expires_at = ? WHERE id = ?';
            sqlite.run(update, [value, claimId]);
          } finally {
            sqlite.close();
          }
        },
        activate: (accountId, personIds) => {
          const sqlite = openDatabase(dbPath);
          try {
            sqlite.run(
              "UPDATE organization_membership SET role='admin' WHERE organization_id=? AND user_id=?",
              [ORG, accountId],
            );
            sqlite.run(
              "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('occupancy-authority',?,'organization',?,'user',?,'org-admin','route',1)",
              [ORG, ORG, accountId],
            );
            for (const id of personIds)
              sqlite.run(
                'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
                [id, ORG, id],
              );
            sqlite.run(
              "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
            );
          } finally {
            sqlite.close();
          }
        },
        own: (_workPackageIds, resourceIds) => {
          const sqlite = openDatabase(dbPath);
          try {
            for (const id of resourceIds)
              sqlite.run(
                'INSERT INTO resource_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
                [id, ORG, id],
              );
          } finally {
            sqlite.close();
          }
        },
        dispose: () => {
          rmSync(folder, { recursive: true, force: true });
        },
      };
    },
  },
];

/**
 * Work packages A and B, each with leaves `L0`…`L3`, agents `a0`…`a3` and `b0`…`b3`
 * bound to account F, `host ram` (GB, divisible) and the exclusive `staging`,
 * all of one organization. Capacities, demands and directory capacities are
 * each case's own. The clock is `now`, moved by the lease case.
 */
async function seeded(
  store: (typeof STORES)[number],
  ownership: 'same' | 'foreign-first' = 'same',
) {
  const opened = store.open();
  const { source } = opened;
  let now = T;
  let minted = 0;
  const clock = clockOf({
    now: () => now,
    newId: () => {
      minted += 1;
      return `id-${String(minted).padStart(6, '0')}`;
    },
  });
  const options = {
    admission: LEGACY_EDIT_ADMISSION,
    clock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
    dependencyContext: createLocalDependencyContext(source.stores),
  };
  const graph = servicesOver(source.stores, {
    ...options,
    ...(source.resourceOccupancy === undefined
      ? {}
      : { resourceOccupancy: source.resourceOccupancy }),
    ...(source.workPackageReportSnapshot === undefined
      ? {}
      : { workPackageReportSnapshot: source.workPackageReportSnapshot }),
  });
  const observation =
    opened.observation === undefined
      ? graph.workItems
      : servicesOver(opened.observation.stores, options).workItems;
  await source.stores.users.create(
    { id: F, username: F, passwordHash: 'x', createdAt: 1 },
    { at: 1, by: F },
  );
  const bindParent = async (organizationId: string, projectId: string) => {
    opened.seedParent(organizationId, projectId);
    for (const [code, name, position] of [
      ['dev', 'Dev', 10],
      ['qa', 'QA', 20],
    ] as const) {
      const id = projectId + ':' + code;
      const defined = await source.stores.stepCatalogue.defineAndBindStep(
        organizationId,
        {
          id,
          code,
          name,
          position,
          defaultAllowancePercent: 0,
          defaultEstimateUnit: 'workdays',
        },
        {
          bindingId: id + ':binding',
          scopeKind: 'project',
          scopeId: projectId,
          workItemTypeId: null,
          position,
        },
        { at: 1, by: F },
      );
      if (!defined.ok) throw new Error('fixture definition refused: ' + defined.reason);
    }
  };
  await bindParent(ORG, 'fixture-project');
  if (ownership === 'foreign-first') await bindParent(FOREIGN, 'foreign-parent');
  const createPackage = async (name: string, organizationId = ORG) => {
    const stamp = clock.stampFor(F);
    const projectId = organizationId === ORG ? 'fixture-project' : 'foreign-parent';
    const { workPackage } = prepareWorkPackageBirth(name, projectId, stamp, () => clock.newId());
    const creatorGrant = { id: clock.newId(), auditId: clock.newId() };
    return await source.uow.run(async ({ stores }) => {
      const created = await stores.workPackages.createInOrganization(
        workPackage,
        [],
        stamp,
        organizationId,
        creatorGrant,
      );
      if (typeof created === 'string') throw new Error('fixture package birth refused: ' + created);
      const steps = await stores.workPackages.stepsOf(created.id);
      return { commit: true, value: { workPackage: created, steps } };
    });
  };
  const workPackages: string[] = [];
  const firstStepByWorkPackage = new Map<string, string>();
  for (const name of ['A', 'B']) {
    const created = expectCreated(
      await createPackage(name, ownership === 'foreign-first' && name === 'A' ? FOREIGN : ORG),
    );
    workPackages.push(created.workPackage.id);
    const firstStep = created.steps.at(0);
    if (firstStep === undefined) throw new Error(`work package ${name} has no first workflow step`);
    firstStepByWorkPackage.set(created.workPackage.id, firstStep.id);
  }
  const people = ['a', 'b'].flatMap((prefix) =>
    Array.from({ length: LEAVES }, (_, index) => `${prefix}${String(index)}`),
  );
  for (const id of people) {
    await source.stores.directory.addPerson({ id, name: `agent ${id}`, kind: 'agent' }, [], {
      at: 1,
      by: F,
    });
    const bound = await source.stores.directory.patchPerson(id, { accountId: F }, { at: 1, by: F });
    if (!bound.ok) throw new Error(`binding ${id} was refused: ${bound.reason}`);
  }
  for (const resource of [
    { id: RAM, name: 'host ram', kind: 'divisible' as const, unitLabel: 'GB' },
    { id: STAGING, name: 'staging', kind: 'exclusive' as const, unitLabel: 'env' },
  ]) {
    const added = await source.stores.directory.addResource(resource, { at: 1, by: F });
    if (!added.ok) throw new Error(`resource ${resource.id} was refused`);
  }
  opened.own(workPackages, [RAM, STAGING]);
  const runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    uow: source.uow,
    announcements: options.broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(scope.stores, {
        ...options,
        broadcast: announcements,
        dependencyContext: createLocalDependencyContext(scope.stores),
      }),
  });
  const leaves: string[][] = [];
  for (const workPackageId of workPackages) {
    const tree = await runner.run(
      workPackageId,
      F,
      Array.from({ length: LEAVES }, (_, index): PlanCommand => ({
        kind: 'createWorkItem',
        ref: `L${String(index)}`,
        name: `Leaf ${String(index)}`,
        parentId: null,
        afterId: null,
      })),
    );
    if (!tree.ok) throw new Error(`the tree was refused: ${JSON.stringify(tree)}`);
    leaves.push(tree.results.map(({ id }) => id ?? ''));
  }
  const [a, b] = workPackages as [string, string];
  const firstStepOf = (workPackageId: string): string => {
    const stepId = firstStepByWorkPackage.get(workPackageId);
    if (stepId === undefined)
      throw new Error(`work package ${workPackageId} has no first workflow step`);
    return stepId;
  };
  const leaf = (workPackage: 0 | 1, index: number): string => {
    const id = leaves.at(workPackage)?.at(index);
    if (id === undefined)
      throw new Error(`no leaf ${String(index)} in work package ${String(workPackage)}`);
    return id;
  };
  const run = (
    workPackage: 0 | 1,
    commands: PlanCommand[],
    credential: CredentialPin | null = null,
    claimSteps = true,
  ) => {
    const workPackageId = workPackage === 0 ? a : b;
    return runner.runWithin(
      workPackageId,
      {
        id: F,
        username: F,
        scopes: ['write'],
        ...(credential === null
          ? {}
          : {
              authentication: {
                kind: 'machine' as const,
                credentialId: 'fixture-credential',
                personId: credential.personId,
                ...(credential.runId === undefined ? {} : { runId: credential.runId }),
              },
            }),
      },
      commands.map((command) =>
        command.kind === 'claimWorkItem' && command.steps === undefined && claimSteps
          ? { ...command, steps: [firstStepOf(workPackageId)] }
          : command,
      ),
      { kind: 'legacy' },
    );
  };
  const claim = (workPackage: 0 | 1, index: number, personId: string): PlanCommand => ({
    kind: 'claimWorkItem',
    workItemId: leaf(workPackage, index),
    personId,
  });
  const release = (workPackage: 0 | 1, index: number, personId: string): PlanCommand => ({
    kind: 'releaseWorkItem',
    workItemId: leaf(workPackage, index),
    personId,
  });
  /** The units of `resourceId` held in the whole organization. */
  const held = async (resourceId: string): Promise<number> =>
    (await source.stores.claims.organizationOccupancyOf([resourceId])).reduce(
      (sum, row, index, rows) =>
        // A leaf's units are its largest copy; one row per leaf here.
        rows.findIndex((each) => each.workItemId === row.workItemId) === index
          ? sum + row.units
          : sum,
      0,
    );
  const state = async (resourceId: string, units: number | null) => {
    const act: AuditedAct = { stamp: { at: now, by: F }, actor: F, auditId: clock.newId() };
    const written = await source.stores.directory.setDirectoryCapacity(resourceId, units, act);
    if (!written.ok) throw new Error(`the directory capacity was refused: ${written.reason}`);
  };
  const close = async () => {
    await source.close();
    opened.dispose();
  };
  return {
    source,
    graph,
    createPackage,
    observation,
    opened,
    clock,
    people,
    runner,
    workPackages: { a, b },
    firstStepOf,
    leaf,
    run,
    claim,
    release,
    held,
    state,
    moveTo: (at: number) => {
      now = at;
    },
    now: () => now,
    close,
  };
}

async function expectReadFailure(read: Promise<unknown>, expected: string): Promise<void> {
  const message = await read.then(
    () => undefined,
    (failure: unknown) => {
      if (!(failure instanceof Error)) throw failure;
      return failure.message;
    },
  );
  expect(message).toContain(expected);
}

for (const store of STORES) {
  describe(`shared occupancy on the ${store.name} store`, () => {
    it('inventories distinct stamped claims from one admitted store observation', async () => {
      const {
        source,
        graph,
        observation,
        opened,
        workPackages,
        firstStepOf,
        leaf,
        people,
        state,
        close,
      } = await seeded(store);
      const access = {
        kind: 'scoped',
        scope: { organizationId: ORG, userId: F, cap: null },
        principal: { id: F },
      } as const;
      const read = () => observation.readResourceOccupancyWithin(RAM, access);
      try {
        if (opened.activate !== undefined) {
          expect(() => graph.workItems.readResourceOccupancyWithin(RAM, access)).toThrow(
            'observation is unavailable',
          );
          expect(await read()).toEqual({ ok: false, refusal: 'no_active_organization' });
        }
        opened.activate?.(F, people);
        await opened.activateInventory?.(people);
        await expectReadFailure(
          observation.readResourceOccupancyWithin(RAM, {
            ...access,
            principal: { id: 'other-actor' },
          }),
          'actor differs',
        );
        const workItemId = leaf(0, 0);
        const secondLeaf = leaf(0, 1);
        const steps = await source.stores.workPackages.stepsOf(workPackages.a);
        const secondStep = steps.at(1);
        if (secondStep === undefined) throw new Error('fixture needs two workflow steps');
        const holder = {
          workItemId,
          personId: 'a0',
          runId: 'bound-run',
          parentClaimId: null,
          accountId: F,
        };
        const rows = [
          { ...holder, id: 'occupancy-b', stepId: secondStep.id },
          { ...holder, id: 'occupancy-a', stepId: firstStepOf(workPackages.a) },
          {
            ...holder,
            id: 'occupancy-c',
            workItemId: secondLeaf,
            runId: null,
            stepId: firstStepOf(workPackages.a),
          },
        ];
        const legacy = 'resource-unowned';
        const orphaned = await source.stores.directory.addResource(
          { id: legacy, name: 'Legacy RAM', kind: 'divisible', unitLabel: 'GB' },
          { at: T, by: F },
        );
        expect(orphaned.ok).toBe(true);
        await state(RAM, 16);
        expect(
          await source.stores.claims.add(
            rows,
            [],
            { at: T, by: F },
            [
              { claimId: 'occupancy-a', resourceId: RAM, units: 16 },
              { claimId: 'occupancy-b', resourceId: RAM, units: 12 },
              { claimId: 'occupancy-c', resourceId: RAM, units: 4 },
              { claimId: 'occupancy-a', resourceId: STAGING, units: 1 },
              { claimId: 'occupancy-a', resourceId: legacy, units: 50 },
            ],
            [{ claimId: 'occupancy-b', expiresAt: T + CLAIM_LEASE_MS }],
          ),
        ).toBe('written');

        const aggregate = await source.stores.claims.organizationUnitsOf([STAGING, legacy, RAM]);
        expect(aggregate.sort((a, b) => a.resourceId.localeCompare(b.resourceId))).toEqual([
          { resourceId: RAM, units: 20 },
          { resourceId: STAGING, units: 1 },
        ]);
        const stored = await read();
        expect(stored).toEqual({
          ok: true,
          value: {
            resourceId: RAM,
            directoryCapacity: 16,
            occupied: 20,
            free: -4,
            workPackages: [
              {
                workPackageId: workPackages.a,
                name: 'A',
                restricted: false,
                units: 20,
                claims: [
                  {
                    claimId: 'occupancy-a',
                    personId: 'a0',
                    personName: opened.isMemory ? 'agent a0' : 'a0',
                    runId: 'bound-run',
                    workItemId,
                    claimedAt: T,
                    leaseExpiresAt: null,
                    releasableBy: 'claimant_or_admin',
                  },
                  {
                    claimId: 'occupancy-b',
                    personId: 'a0',
                    personName: opened.isMemory ? 'agent a0' : 'a0',
                    runId: 'bound-run',
                    workItemId,
                    claimedAt: T,
                    leaseExpiresAt: T + CLAIM_LEASE_MS,
                    releasableBy: 'claimant_or_admin',
                  },
                  {
                    claimId: 'occupancy-c',
                    personId: 'a0',
                    personName: opened.isMemory ? 'agent a0' : 'a0',
                    runId: null,
                    workItemId: secondLeaf,
                    claimedAt: T,
                    leaseExpiresAt: null,
                    releasableBy: 'claimant_or_admin',
                  },
                ],
              },
            ],
          },
        });
        if (opened.setClaimStamp !== undefined) {
          opened.setClaimStamp('occupancy-a', 'write', 'invalid write instant');
          await expectReadFailure(read(), 'holding claim occupancy-a has no matching stamp');
          opened.setClaimStamp('occupancy-a', 'write', T);
          opened.setClaimStamp('occupancy-b', 'expiry', 'invalid lease instant');
          await expectReadFailure(read(), 'holding claim occupancy-b has no matching stamp');
        }
        if (opened.useViewer !== undefined) {
          opened.useViewer(true);
          const clone = spyOn(MemoryState.prototype, 'clone');
          try {
            expect(await observation.readResourceOccupancyWithin(RAM, access)).toEqual({
              ok: false,
              reason: 'forbidden',
              permission: 'organization.manage_directory',
            });
            expect(clone).not.toHaveBeenCalled();
          } finally {
            clone.mockRestore();
            opened.useViewer(false);
          }
          const earlier = read();
          const rename = source.stores.directory.patchPerson(
            'a0',
            { name: 'Next Alias' },
            { at: T + 1, by: F },
          );
          expect(await rename).toMatchObject({ ok: true });
          expect(await earlier).toEqual(stored);
          expect(await read()).toMatchObject({
            ok: true,
            value: { workPackages: [{ claims: rows.map(() => ({ personName: 'Next Alias' })) }] },
          });
        }
      } finally {
        await close();
      }
    });

    // `wbs-shared-occupancy` S6, the fit half of task 5.1.
    it('agrees with the claim across work packages', async () => {
      const { observation, workPackages, run, claim, release, leaf, state, close } =
        await seeded(store);
      try {
        await state(RAM, 16);
        for (const workPackage of [0, 1] as const)
          await run(workPackage, [
            { kind: 'setDemand', workItemId: leaf(workPackage, 0), resourceId: RAM, units: 16 },
          ]);
        expect(await run(0, [claim(0, 0, 'a0')])).toMatchObject({ ok: true });
        const observed = await observation.readStartableWithin(
          workPackages.b,
          F,
          { kind: 'legacy' },
          null,
        );
        if (observed.kind !== 'ready') throw new Error('the read was refused');
        const startable = observed.value;
        expect(startable.leaves.map(({ workItemId }) => workItemId)).not.toContain(leaf(1, 0));
        const unfit = startable.doesNotFit.find((each) => each.workItemId === leaf(1, 0));
        expect(unfit?.exhausted).toMatchObject({
          resourceId: RAM,
          asked: 16,
          free: 0,
          scope: 'organization',
          holders: [
            {
              personId: 'a0',
              name: 'agent a0',
              runId: null,
              workPackageId: workPackages.a,
              workItemId: leaf(0, 0),
            },
          ],
          hiddenHolders: { units: 0 },
        });
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: false });
        await run(0, [release(0, 0, 'a0')]);
        const freed = await observation.readStartableWithin(
          workPackages.b,
          F,
          { kind: 'legacy' },
          null,
        );
        if (freed.kind !== 'ready') throw new Error('the read was refused');
        expect(freed.value.leaves.map(({ workItemId }) => workItemId)).toContain(leaf(1, 0));
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: true });
      } finally {
        await close();
      }
    });

    it('reports shared resources for leaf demands and work package statements', async () => {
      const { observation, workPackages, run, claim, leaf, state, close } = await seeded(store);
      try {
        await state(RAM, 16);
        await state(STAGING, 1);
        expect(
          await run(0, [{ kind: 'setDemand', workItemId: leaf(0, 0), resourceId: RAM, units: 16 }]),
        ).toMatchObject({ ok: true });
        expect(await run(0, [claim(0, 0, 'a0')])).toMatchObject({ ok: true });
        expect(
          await run(1, [{ kind: 'setDemand', workItemId: leaf(1, 0), resourceId: RAM, units: 16 }]),
        ).toMatchObject({ ok: true });
        const read = async () => {
          const observed = await observation.readStartableWithin(
            workPackages.b,
            F,
            { kind: 'legacy' },
            null,
          );
          if (observed.kind !== 'ready') throw new Error('the read was refused');
          return observed.value;
        };
        const before = await read();
        expect(before.resources).toEqual([
          {
            resourceId: RAM,
            name: 'host ram',
            kind: 'divisible',
            unitLabel: 'GB',
            capacity: 16,
            occupied: 0,
            free: 0,
            occupancyScope: 'organization',
            directory: { capacity: 16, occupied: 16, free: 0 },
          },
        ]);
        expect(before.occupancyScope).toBe('work_package');
        const tooLarge = before.doesNotFit.find(({ workItemId }) => workItemId === leaf(1, 0));
        expect(tooLarge?.exhausted).toMatchObject({
          resourceId: RAM,
          scope: 'organization',
          shortfall: 16,
        });
        expect(
          await run(1, [{ kind: 'setResourceCapacity', resourceId: STAGING, units: 0 }]),
        ).toMatchObject({ ok: true });
        expect((await read()).resources).toEqual([
          ...before.resources,
          {
            resourceId: STAGING,
            name: 'staging',
            kind: 'exclusive',
            unitLabel: 'env',
            capacity: 0,
            occupied: 0,
            free: 0,
            occupancyScope: 'organization',
            directory: { capacity: 1, occupied: 0, free: 1 },
          },
        ]);
      } finally {
        await close();
      }
    });

    it('keeps local units distinct from directory totals across work package ceilings and lowering', async () => {
      const { source, observation, workPackages, run, claim, firstStepOf, leaf, state, close } =
        await seeded(store);
      try {
        await state(RAM, 16);
        expect(
          await run(0, [
            { kind: 'setDemand', workItemId: leaf(0, 0), resourceId: RAM, units: 8 },
            claim(0, 0, 'a0'),
          ]),
        ).toMatchObject({ ok: true });
        expect(
          await run(1, [
            { kind: 'setDemand', workItemId: leaf(1, 0), resourceId: RAM, units: 4 },
            { kind: 'setDemand', workItemId: leaf(1, 1), resourceId: RAM, units: 8 },
            claim(1, 0, 'b0'),
          ]),
        ).toMatchObject({ ok: true });

        const steps = await source.stores.workPackages.stepsOf(workPackages.b);
        const otherStep = steps.find(({ id }) => id !== firstStepOf(workPackages.b));
        if (otherStep === undefined) throw new Error('expected a second workflow step');
        expect(
          await source.stores.claims.add(
            [
              {
                id: 'overlapping-claim',
                workItemId: leaf(1, 0),
                stepId: otherStep.id,
                personId: 'b0',
                runId: 'second-copy',
                parentClaimId: null,
                accountId: F,
              },
            ],
            [],
            { at: T, by: F },
            [{ claimId: 'overlapping-claim', resourceId: RAM, units: 2 }],
          ),
        ).toBe('written');

        const read = async () => {
          const answer = await observation.readStartableWithin(
            workPackages.b,
            F,
            { kind: 'legacy' },
            null,
          );
          if (answer.kind !== 'ready') throw new Error('the read was refused');
          const shortage = answer.value.doesNotFit.find(
            ({ workItemId }) => workItemId === leaf(1, 1),
          );
          expect(answer.value.leaves.map(({ workItemId }) => workItemId)).not.toContain(leaf(1, 1));
          return { resources: answer.value.resources, shortage: shortage?.exhausted };
        };
        const shared = {
          resourceId: RAM,
          name: 'host ram',
          kind: 'divisible',
          unitLabel: 'GB',
          occupied: 4,
          occupancyScope: 'organization',
          directory: { capacity: 16, occupied: 12, free: 4 },
        } as const;
        const unbounded = await read();
        expect(unbounded.resources).toEqual([{ ...shared, capacity: 16, free: 4 }]);
        expect(unbounded.shortage).toMatchObject({ scope: 'organization', shortfall: 4 });
        for (const [capacity, free, scope, shortfall] of [
          [10, 4, 'organization', 4],
          [8, 4, 'organization', 4],
          [7, 3, 'work_package', 5],
        ] as const) {
          expect(
            await run(1, [{ kind: 'setResourceCapacity', resourceId: RAM, units: capacity }]),
          ).toMatchObject({ ok: true });
          const reported = await read();
          expect(reported.resources).toEqual([{ ...shared, capacity, free }]);
          expect(reported.shortage).toMatchObject({ scope, shortfall });
        }
        await state(RAM, 10);
        expect((await read()).resources).toEqual([
          {
            ...shared,
            capacity: 7,
            free: -2,
            directory: { capacity: 10, occupied: 12, free: -2 },
          },
        ]);
        await state(RAM, 0);
        expect((await read()).resources).toEqual([
          {
            ...shared,
            capacity: 7,
            free: -12,
            directory: { capacity: 0, occupied: 12, free: -12 },
          },
        ]);
        await state(RAM, null);
        const cleared = await read();
        expect(cleared.resources).toEqual([
          {
            ...shared,
            capacity: 7,
            free: 3,
            occupancyScope: 'work_package',
            directory: null,
          },
        ]);
        expect(cleared.shortage).toEqual({
          resourceId: RAM,
          name: 'host ram',
          unitLabel: 'GB',
          asked: 8,
          free: 3,
          shortfall: 5,
        });
      } finally {
        await close();
      }
    });

    it('uses every work package leaf and omits shared resources used only by a parent or a holder', async () => {
      const { source, observation, workPackages, run, leaf, state, close } = await seeded(store);
      const stamp = { at: T, by: F };
      try {
        await state(RAM, 16);
        await state(STAGING, 1);
        const team = 'report-team';
        await source.stores.directory.addTeam({ id: team, name: 'Report team' }, stamp);
        expect(
          await run(1, [
            { kind: 'setDemand', workItemId: leaf(1, 0), resourceId: RAM, units: 8 },
            { kind: 'setStatus', workItemId: leaf(1, 0), status: 'blocked' },
            { kind: 'moveWorkItem', workItemId: leaf(1, 2), parentId: leaf(1, 3), afterId: null },
          ]),
        ).toMatchObject({ ok: true });
        const expectOnlyRam = async () => {
          const observed = await observation.readStartableWithin(
            workPackages.b,
            F,
            { kind: 'legacy' },
            team,
          );
          if (observed.kind !== 'ready') throw new Error('the read was refused');
          expect(observed.value.leaves).toEqual([]);
          expect(observed.value.doesNotFit).toEqual([]);
          expect(observed.value.resources).toEqual([
            {
              resourceId: RAM,
              name: 'host ram',
              kind: 'divisible',
              unitLabel: 'GB',
              capacity: 16,
              occupied: 0,
              free: 16,
              occupancyScope: 'organization',
              directory: { capacity: 16, occupied: 0, free: 16 },
            },
          ]);
        };
        expect(await source.stores.demands.set(leaf(1, 3), STAGING, 1, stamp)).toBe('written');
        await expectOnlyRam();
        expect(await source.stores.demands.set(leaf(1, 3), STAGING, null, stamp)).toBe('written');
        expect(
          await run(1, [
            {
              kind: 'claimWorkItem',
              workItemId: leaf(1, 2),
              personId: 'b2',
              resources: [{ resourceId: STAGING, units: 1 }],
            },
          ]),
        ).toMatchObject({ ok: true });
        expect(await source.stores.claims.organizationUnitsOf([STAGING])).toEqual([
          { resourceId: STAGING, units: 1 },
        ]);
        await expectOnlyRam();
      } finally {
        await close();
      }
    });

    // Review S3-5 (second pass): a holder's work package is named only when it is
    // another work package's, as `OccupancyHolder.workPackageId` says.
    it('names a holder’s work package only when it is another work package', async () => {
      const { run, claim, leaf, workPackages, state, close } = await seeded(store);
      try {
        await state(RAM, 16);
        await run(0, [
          { kind: 'setDemand', workItemId: leaf(0, 0), resourceId: RAM, units: 10 },
          { kind: 'setDemand', workItemId: leaf(0, 1), resourceId: RAM, units: 4 },
        ]);
        await run(1, [{ kind: 'setDemand', workItemId: leaf(1, 0), resourceId: RAM, units: 6 }]);
        expect(await run(0, [claim(0, 0, 'a0')])).toMatchObject({ ok: true });
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: true });
        const refused = await run(0, [claim(0, 1, 'a1')]);
        if (refused.ok || !('reason' in refused) || refused.reason !== 'resources_exhausted')
          throw new Error(`expected resources_exhausted: ${JSON.stringify(refused)}`);
        const { holders } = refused.detail;
        // Ordered by work item: A's leaves were minted before B's.
        expect(holders.map(({ personId, workPackageId }) => ({ personId, workPackageId }))).toEqual(
          [
            { personId: 'a0', workPackageId: undefined },
            { personId: 'b0', workPackageId: workPackages.b },
          ],
        );
      } finally {
        await close();
      }
    });

    // Proof: with `findStartableWork` given empty organization inputs, this
    // failed beside its legacy twin (26 pass, 3 fail); watched 2026-10-25.
    if (store.name === 'sqlite')
      it('agrees with the claim across work packages under scoped access', async () => {
        const {
          opened,
          observation,
          runner,
          people,
          workPackages,
          run,
          firstStepOf,
          leaf,
          state,
          close,
        } = await seeded(store);
        try {
          if (opened.activate === undefined) throw new Error('only SQLite activates');
          await state(RAM, 16);
          for (const workPackage of [0, 1] as const)
            await run(workPackage, [
              { kind: 'setDemand', workItemId: leaf(workPackage, 0), resourceId: RAM, units: 16 },
            ]);
          opened.activate(F, people);
          const admin = {
            principal: { id: F },
            kind: 'scoped',
            scope: { cap: null, organizationId: ORG, userId: F },
          } as const;
          const claimIn = (workPackageId: string, workItemId: string, personId: string) =>
            runner.runWithin(
              workPackageId,
              { id: F, username: F, scopes: ['write'] },
              [
                {
                  kind: 'claimWorkItem',
                  workItemId,
                  personId,
                  steps: [firstStepOf(workPackageId)],
                },
              ],
              admin,
            );
          expect(await claimIn(workPackages.a, leaf(0, 0), 'a0')).toMatchObject({ ok: true });
          const observed = await observation.readStartableWithin(workPackages.b, F, admin, null);
          if (observed.kind !== 'ready') throw new Error('the read was refused');
          const startable = observed.value;
          expect(startable.leaves.map(({ workItemId }) => workItemId)).not.toContain(leaf(1, 0));
          const unfit = startable.doesNotFit.find((each) => each.workItemId === leaf(1, 0));
          expect(unfit?.exhausted).toMatchObject({ free: 0, scope: 'organization' });
          expect(await claimIn(workPackages.b, leaf(1, 0), 'b0')).toMatchObject({
            ok: false,
            reason: 'resources_exhausted',
          });
        } finally {
          await close();
        }
      });

    // Review S3-8: after activation every work package has its organization row,
    // so an owned resource held in a work package of none is corrupt, not skipped.
    it('throws on a holder in a work package of no organization', async () => {
      const { source, opened, createPackage, runner, run, claim, leaf, state, close } =
        await seeded(store);
      try {
        await state(RAM, 16);
        expect(
          await run(0, [{ kind: 'setDemand', workItemId: leaf(0, 0), resourceId: RAM, units: 4 }]),
        ).toMatchObject({ ok: true });
        expect(await run(0, [claim(0, 0, 'a0')])).toMatchObject({ ok: true });
        const { workPackage, steps } = expectCreated(await createPackage('Orphan'));
        const step = steps.at(0);
        if (step === undefined) throw new Error('the orphan work package has no step');
        const created = await runner.run(workPackage.id, F, [
          { kind: 'createWorkItem', name: 'Leaf', parentId: null, afterId: null },
        ]);
        const workItemId = created.ok ? created.results.at(0)?.id : undefined;
        if (workItemId === undefined) throw new Error('the orphan leaf was refused');
        const written = await source.stores.claims.add(
          [
            {
              id: 'orphan-claim',
              workItemId,
              stepId: step.id,
              personId: 'a0',
              runId: null,
              parentClaimId: null,
              accountId: F,
            },
          ],
          [],
          { at: 1, by: F },
          [{ claimId: 'orphan-claim', resourceId: RAM, units: 4 }],
        );
        expect(written).toBe('written');
        opened.removePackageOrganization(workPackage.id);
        if (store.name === 'memory')
          expect(() => {
            opened.removePackageOrganization(workPackage.id);
          }).toThrow('memory package organization mapping is absent');
        expect(
          await source.stores.claims.organizationUnitsOf([RAM]).then(
            () => 'answered',
            (error: unknown) => String(error),
          ),
        ).toContain('held in a work package of no organization');
        // The holder read refuses alike: a refusal never names a corrupt row.
        expect(
          await source.stores.claims.organizationOccupancyOf([RAM]).then(
            () => 'answered',
            (error: unknown) => String(error),
          ),
        ).toContain('held in a work package of no organization');
      } finally {
        await close();
      }
    });

    if (store.name === 'sqlite')
      it('excludes a resource holder in a foreign-owned work package from claim admission', async () => {
        const { source, workPackages, run, claim, leaf, state, close } = await seeded(
          store,
          'foreign-first',
        );
        try {
          await state(RAM, 4);
          for (const workPackage of [0, 1] as const)
            expect(
              await run(workPackage, [
                { kind: 'setDemand', workItemId: leaf(workPackage, 0), resourceId: RAM, units: 4 },
              ]),
            ).toMatchObject({ ok: true });
          expect(await run(0, [claim(0, 0, 'a0')])).toMatchObject({ ok: true });
          expect(await source.stores.claims.occupancyOf(workPackages.a)).toMatchObject([
            { workItemId: leaf(0, 0), personId: 'a0', resourceId: RAM, units: 4 },
          ]);
          expect(await source.stores.claims.organizationUnitsOf([RAM])).toEqual([]);
          expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: true });
          expect(await source.stores.claims.organizationUnitsOf([RAM])).toEqual([
            { resourceId: RAM, units: 4 },
          ]);
        } finally {
          await close();
        }
      });

    it('refuses B’s 16 GB while A holds the directory’s 16, naming the organization', async () => {
      const { run, claim, leaf, held, state, workPackages, close } = await seeded(store);
      try {
        await state(RAM, 16);
        for (const workPackage of [0, 1] as const)
          await run(workPackage, [
            { kind: 'setResourceCapacity', resourceId: RAM, units: 16 },
            { kind: 'setDemand', workItemId: leaf(workPackage, 0), resourceId: RAM, units: 16 },
          ]);
        expect(await run(0, [claim(0, 0, 'a0')])).toMatchObject({ ok: true });
        const refused = await run(1, [claim(1, 0, 'b0')]);
        expect(refused).toMatchObject({
          ok: false,
          reason: 'resources_exhausted',
          detail: {
            resourceId: RAM,
            asked: 16,
            free: 0,
            scope: 'organization',
            // Another work package's holder names its work package (S5).
            holders: [{ personId: 'a0', workItemId: leaf(0, 0), workPackageId: workPackages.a }],
            hiddenHolders: { units: 0 },
            resources: [{ resourceId: RAM, hiddenHolders: { units: 0 } }],
          },
        });
        expect(await held(RAM)).toBe(16);
      } finally {
        await close();
      }
    });

    it('holds one staging across work packages, and B claims it once A releases it', async () => {
      const { run, claim, release, leaf, state, close } = await seeded(store);
      try {
        await state(STAGING, 1);
        for (const workPackage of [0, 1] as const)
          await run(workPackage, [
            { kind: 'setDemand', workItemId: leaf(workPackage, 0), resourceId: STAGING, units: 1 },
          ]);
        expect(await run(0, [claim(0, 0, 'a0')])).toMatchObject({ ok: true });
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({
          ok: false,
          reason: 'resources_exhausted',
          detail: { scope: 'organization' },
        });
        expect(await run(0, [release(0, 0, 'a0')])).toMatchObject({ ok: true });
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: true });
      } finally {
        await close();
      }
    });

    it('keeps the work package ceiling binding while the organization has units free', async () => {
      const { run, claim, leaf, state, close } = await seeded(store);
      try {
        await state(RAM, 16);
        await run(0, [
          { kind: 'setResourceCapacity', resourceId: RAM, units: 8 },
          { kind: 'setDemand', workItemId: leaf(0, 0), resourceId: RAM, units: 8 },
          { kind: 'setDemand', workItemId: leaf(0, 1), resourceId: RAM, units: 4 },
        ]);
        expect(await run(0, [claim(0, 0, 'a0')])).toMatchObject({ ok: true });
        expect(await run(0, [claim(0, 1, 'a1')])).toMatchObject({
          ok: false,
          detail: { free: 0, scope: 'work_package' },
        });
      } finally {
        await close();
      }
    });

    // Proof: a separate committed reader admitted both claims. Forcing commit
    // after refusal left the first claim durable on SQLite. Watched 2026-11-21.
    it('refuses the second of two leaves one batch claims past the directory capacity, writing nothing', async () => {
      const { source, workPackages, run, claim, leaf, held, state, close } = await seeded(store);
      try {
        await state(RAM, 16);
        await run(0, [
          { kind: 'setDemand', workItemId: leaf(0, 0), resourceId: RAM, units: 10 },
          { kind: 'setDemand', workItemId: leaf(0, 1), resourceId: RAM, units: 10 },
        ]);
        const journalScope = { workPackageId: workPackages.a, userId: F, personId: null };
        const journal = await source.stores.journal.entriesFor(journalScope);
        expect(await run(0, [claim(0, 0, 'a0'), claim(0, 1, 'a1')])).toMatchObject({
          ok: false,
          at: 1,
          reason: 'resources_exhausted',
          detail: { asked: 10, free: 6, scope: 'organization' },
        });
        expect(await source.stores.claims.listByWorkPackage(workPackages.a)).toEqual([]);
        expect(await source.stores.journal.entriesFor(journalScope)).toEqual(journal);
        expect(await held(RAM)).toBe(0);
      } finally {
        await close();
      }
    });

    it('decides as before when no directory capacity is stated', async () => {
      const { run, claim, leaf, held, close } = await seeded(store);
      try {
        for (const workPackage of [0, 1] as const)
          await run(workPackage, [
            { kind: 'setResourceCapacity', resourceId: RAM, units: 16 },
            { kind: 'setDemand', workItemId: leaf(workPackage, 0), resourceId: RAM, units: 16 },
          ]);
        expect(await run(0, [claim(0, 0, 'a0')])).toMatchObject({ ok: true });
        // Per work package only, as `wbs-resources` R3 counted it: 32 of an unstated directory.
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: true });
        expect(await held(RAM)).toBe(32);
      } finally {
        await close();
      }
    });

    it('refuses an undo of a release in A once B took the directory’s 16', async () => {
      const { runner, workPackages, run, claim, release, leaf, held, state, close } =
        await seeded(store);
      try {
        await state(RAM, 16);
        for (const workPackage of [0, 1] as const)
          await run(workPackage, [
            { kind: 'setDemand', workItemId: leaf(workPackage, 0), resourceId: RAM, units: 16 },
          ]);
        await run(0, [claim(0, 0, 'a0')]);
        await run(0, [release(0, 0, 'a0')]);
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: true });
        const undone = await runner.undo(workPackages.a, F);
        expect(undone).toMatchObject({ ok: false, reason: 'stale_undo' });
        expect(staleDetail(undone)).toBe(
          'resources_exhausted: that needs 16 GB of “host ram” and 0 are free now across the organization.',
        );
        expect(await held(RAM)).toBe(16);
      } finally {
        await close();
      }
    });

    it('refuses a redo of a claim in A once B took the units', async () => {
      const { runner, workPackages, run, claim, leaf, held, state, close } = await seeded(store);
      try {
        await state(RAM, 16);
        for (const workPackage of [0, 1] as const)
          await run(workPackage, [
            { kind: 'setDemand', workItemId: leaf(workPackage, 0), resourceId: RAM, units: 12 },
          ]);
        await run(0, [claim(0, 0, 'a0')]);
        expect(await runner.undo(workPackages.a, F)).toMatchObject({ ok: true });
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: true });
        const redone = await runner.redo(workPackages.a, F);
        expect(redone).toMatchObject({ ok: false, reason: 'stale_undo' });
        expect(staleDetail(redone)).toStartWith('resources_exhausted:');
        expect(await held(RAM)).toBe(12);
      } finally {
        await close();
      }
    });

    // A refused undo leaves the stack (`stale_undo`), so each world is its own store.
    for (const [taken, expected] of [
      [12, 'refused'],
      [8, 'applied'],
    ] as const)
      it(`undoes a delete restoring A’s 8 GB while B holds ${String(taken)} of 16: ${expected}`, async () => {
        const { source, runner, workPackages, run, claim, leaf, held, state, close } =
          await seeded(store);
        try {
          await state(RAM, 16);
          await run(0, [{ kind: 'setDemand', workItemId: leaf(0, 0), resourceId: RAM, units: 8 }]);
          await run(1, [
            { kind: 'setDemand', workItemId: leaf(1, 0), resourceId: RAM, units: taken },
          ]);
          await run(0, [claim(0, 0, 'a0')]);
          expect(await run(0, [{ kind: 'deleteWorkItem', workItemId: leaf(0, 0) }])).toMatchObject({
            ok: true,
          });
          expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: true });
          const undone = await runner.undo(workPackages.a, F);
          if (expected === 'refused') {
            expect(undone).toMatchObject({ ok: false, reason: 'stale_undo' });
            expect(staleDetail(undone)).toStartWith('resources_exhausted:');
            expect(await source.stores.claims.listByWorkPackage(workPackages.a)).toEqual([]);
            expect(await held(RAM)).toBe(taken);
          } else {
            expect(undone).toMatchObject({ ok: true });
            expect(await source.stores.claims.listByWorkPackage(workPackages.a)).not.toEqual([]);
            expect(await held(RAM)).toBe(16);
          }
        } finally {
          await close();
        }
      });

    it('refuses an undo of a cascading release leaf by leaf across work packages', async () => {
      const { source, runner, workPackages, run, claim, leaf, held, state, close } =
        await seeded(store);
      try {
        await state(RAM, 16);
        const tree = await run(0, [
          { kind: 'createWorkItem', ref: 'P', name: 'P', parentId: null, afterId: null },
          {
            kind: 'createWorkItem',
            ref: 'X',
            name: 'X',
            parentId: null,
            parentRef: 'P',
            afterId: null,
          },
          {
            kind: 'createWorkItem',
            ref: 'Y',
            name: 'Y',
            parentId: null,
            parentRef: 'P',
            afterId: null,
          },
          { kind: 'setDemand', workItemRef: 'X', resourceId: RAM, units: 4 },
          { kind: 'setDemand', workItemRef: 'Y', resourceId: RAM, units: 4 },
        ]);
        if (!tree.ok) throw new Error(`the tree was refused: ${JSON.stringify(tree)}`);
        const [parent, x, y] = tree.results.map(({ id }) => id ?? '');
        await run(1, [{ kind: 'setDemand', workItemId: leaf(1, 0), resourceId: RAM, units: 10 }]);
        const subtree = await run(
          0,
          [{ kind: 'claimWorkItem', workItemId: parent, personId: 'a0' }],
          null,
          false,
        );
        if (!subtree.ok)
          throw new Error(`the subtree claim was refused: ${JSON.stringify(subtree)}`);
        const applied = subtree.results[0];
        const parentClaim = applied.kind === 'claimWorkItem' ? applied.claimIds.at(0) : undefined;
        if (parentClaim === undefined) throw new Error('the subtree claim wrote no claim');
        for (const [workItemId, personId] of [
          [x, 'a1'],
          [y, 'a2'],
        ] as const)
          expect(
            await run(0, [{ kind: 'claimWorkItem', workItemId, personId, parentClaim }]),
          ).toMatchObject({ ok: true });
        expect(await held(RAM)).toBe(8);
        expect(
          await run(0, [{ kind: 'releaseWorkItem', workItemId: parent, personId: 'a0' }]),
        ).toMatchObject({ ok: true });
        // B takes 10 of 16: the first 4 GB leaf would fit again, the second not.
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: true });
        const undone = await runner.undo(workPackages.a, F);
        expect(undone).toMatchObject({ ok: false, reason: 'stale_undo' });
        expect(staleDetail(undone)).toStartWith('resources_exhausted:');
        expect(await source.stores.claims.listByWorkPackage(workPackages.a)).toEqual([]);
        expect(await held(RAM)).toBe(10);
      } finally {
        await close();
      }
    });

    it('frees A’s units for B when A’s lease runs out and the sweep releases it', async () => {
      const { source, runner, run, claim, leaf, held, state, moveTo, now, close } =
        await seeded(store);
      try {
        await state(RAM, 16);
        for (const workPackage of [0, 1] as const)
          await run(workPackage, [
            { kind: 'setDemand', workItemId: leaf(workPackage, 0), resourceId: RAM, units: 16 },
          ]);
        // An agent's claim for itself is leased (`wbs-claim-leases` L1).
        expect(await run(0, [claim(0, 0, 'a0')], { personId: 'a0' })).toMatchObject({ ok: true });
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: false });
        moveTo(now() + CLAIM_LEASE_MS + 1);
        const ticks: (() => void)[] = [];
        const sweep = new ClaimLeaseSweep({
          runner,
          workPackagesWithExpiredLeases: (at, limit) =>
            source.stores.claims.workPackagesWithExpiredLeases(at, limit),
          now,
          intervals: {
            every: (_ms, callback) => {
              ticks.push(callback);
              return () => undefined;
            },
          },
          intervalMs: 30_000,
          workPackagesPerTick: 50,
          onError: (error) => {
            throw error;
          },
        });
        sweep.start();
        await sweep.settled();
        await sweep.stop();
        expect(await held(RAM)).toBe(0);
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: true });
      } finally {
        await close();
      }
    });
  });
}
