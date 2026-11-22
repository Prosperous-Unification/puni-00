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
import { clockOf, CREATOR_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { ClaimLeaseSweep } from '@wbs/core/module/plan-commands/claim-lease-sweep';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import type { ScopedUndoOutcome } from '@wbs/core/module/plan-commands/plan-commands.feature';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { expectCreated } from '@wbs/core/testing/expect-created';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { CLAIM_LEASE_MS } from '@wbs/domain';
import { MemoryState, openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it, spyOn } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { openSqliteSource } from './source';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { activateTestStepBlockages } from './testing/step-blockage-activation';

/**
 * `wbs-shared-occupancy` slice 3 on both stores: two projects A and B of one
 * organization share a resource's directory capacity, through the command
 * runner and its journal (tasks 3.1, 3.4).
 */
const MIGRATIONS = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const F = 'account-f';
const ORG = 'org-shared';
const FOREIGN = 'org-foreign';
const RAM = 'resource-host-ram';
const STAGING = 'resource-staging';
const LEAVES = 4;
const T = 1_000_000;

function staleDetail(outcome: ScopedUndoOutcome): string | null {
  if (outcome.ok || !('reason' in outcome) || outcome.reason !== 'stale_undo')
    throw new Error(`expected stale_undo: ${JSON.stringify(outcome)}`);
  return outcome.detail;
}

interface Opened {
  readonly source: Source<TransactionalStores>;
  readonly isMemory: boolean;
  readonly observation?: Source<TransactionalStores>;
  readonly ownPeople?: (personIds: readonly string[]) => void;
  readonly setClaimStamp?: (
    claimId: string,
    field: 'write' | 'expiry',
    value: number | string,
  ) => void;
  /** Gives the roots their initial owners before any commands are run. */
  readonly own: (
    projectIds: readonly string[],
    resourceIds: readonly string[],
    foreignProjectId?: string,
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
        isMemory: true,
        own: (projectIds, resourceIds) => {
          fixture.addOrganization(ORG, { legacy: false });
          for (const id of projectIds) fixture.ownProjectInOrganization(id, ORG);
          for (const id of resourceIds) fixture.ownResourceInOrganization(id, ORG);
        },
        ownPeople: (personIds) => {
          for (const personId of personIds) fixture.ownPersonInOrganization(personId, ORG, [F]);
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
      runMigrations(dbPath, MIGRATIONS);
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
        source,
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
              "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES (?, ?, 'admin', 1)",
              [ORG, accountId],
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
        own: (projectIds, resourceIds, foreignProjectId) => {
          const sqlite = openDatabase(dbPath);
          try {
            sqlite.run('INSERT INTO organization (id, name, created_at) VALUES (?, ?, 1)', [
              ORG,
              ORG,
            ]);
            if (foreignProjectId !== undefined)
              sqlite.run('INSERT INTO organization (id, name, created_at) VALUES (?, ?, 1)', [
                FOREIGN,
                FOREIGN,
              ]);
            for (const id of projectIds)
              sqlite.run(
                'INSERT INTO project_organization (resource_id, organization_id) VALUES (?, ?)',
                [id, id === foreignProjectId ? FOREIGN : ORG],
              );
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
 * Projects A and B, each with leaves `L0`…`L3`, agents `a0`…`a3` and `b0`…`b3`
 * bound to account F, `host ram` (GB, divisible) and the exclusive `staging`,
 * all of one organization. Capacities, demands and directory capacities are
 * each case's own. The clock is `now`, moved by the lease case.
 */
async function seeded(
  store: (typeof STORES)[number],
  ownership: 'same' | 'foreign-first' = 'same',
) {
  const opened = store.open();
  const { source, isMemory } = opened;
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
    admission: CREATOR_ADMISSION,
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
    ...(source.projectReportSnapshot === undefined
      ? {}
      : { projectReportSnapshot: source.projectReportSnapshot }),
  });
  const observation =
    opened.observation === undefined
      ? graph.workItems
      : servicesOver(opened.observation.stores, options).workItems;
  await source.stores.users.create(
    { id: F, username: F, passwordHash: 'x', createdAt: 1 },
    { at: 1, by: F },
  );
  const projects: string[] = [];
  const firstStepByProject = new Map<string, string>();
  for (const name of ['A', 'B']) {
    const created = expectCreated(await graph.projects.create(name, F));
    projects.push(created.project.id);
    const firstStep = created.steps.at(0);
    if (firstStep === undefined) throw new Error(`project ${name} has no first workflow step`);
    firstStepByProject.set(created.project.id, firstStep.id);
    if (isMemory)
      for (const step of created.steps)
        await source.stores.steps.add(
          {
            id: step.id,
            projectId: created.project.id,
            name: step.name,
            allowancePercent: 0,
            estimateUnit: 'workdays',
          },
          { at: 1, by: F },
        );
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
  opened.own(projects, [RAM, STAGING], ownership === 'foreign-first' ? projects.at(0) : undefined);
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
  for (const projectId of projects) {
    const tree = await runner.run(
      projectId,
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
  const [a, b] = projects as [string, string];
  const firstStepOf = (projectId: string): string => {
    const stepId = firstStepByProject.get(projectId);
    if (stepId === undefined) throw new Error(`project ${projectId} has no first workflow step`);
    return stepId;
  };
  const leaf = (project: 0 | 1, index: number): string => {
    const id = leaves.at(project)?.at(index);
    if (id === undefined) throw new Error(`no leaf ${String(index)} in project ${String(project)}`);
    return id;
  };
  const run = (
    project: 0 | 1,
    commands: PlanCommand[],
    credential: CredentialPin | null = null,
    claimSteps = true,
  ) => {
    const projectId = project === 0 ? a : b;
    return runner.runWithin(
      projectId,
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
          ? { ...command, steps: [firstStepOf(projectId)] }
          : command,
      ),
      { kind: 'legacy' },
    );
  };
  const claim = (project: 0 | 1, index: number, personId: string): PlanCommand => ({
    kind: 'claimWorkItem',
    workItemId: leaf(project, index),
    personId,
  });
  const release = (project: 0 | 1, index: number, personId: string): PlanCommand => ({
    kind: 'releaseWorkItem',
    workItemId: leaf(project, index),
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
    observation,
    opened,
    people,
    runner,
    projects: { a, b },
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
        projects,
        firstStepOf,
        leaf,
        people,
        state,
        close,
      } = await seeded(store);
      const scope = { organizationId: ORG, userId: F, role: 'admin' } as const;
      const read = () => observation.readResourceOccupancyWithin(RAM, F, scope);
      try {
        if (opened.activate !== undefined) {
          expect(() => graph.workItems.readResourceOccupancyWithin(RAM, F, scope)).toThrow(
            'observation is unavailable',
          );
          expect(await read()).toEqual({ ok: false, refusal: 'no_active_organization' });
        }
        opened.activate?.(F, people);
        opened.ownPeople?.(people);
        await expectReadFailure(
          observation.readResourceOccupancyWithin(RAM, 'other-actor', scope),
          'actor differs',
        );
        const workItemId = leaf(0, 0);
        const secondLeaf = leaf(0, 1);
        const steps = await source.stores.projects.stepsOf(projects.a);
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
          { ...holder, id: 'occupancy-a', stepId: firstStepOf(projects.a) },
          {
            ...holder,
            id: 'occupancy-c',
            workItemId: secondLeaf,
            runId: null,
            stepId: firstStepOf(projects.a),
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
            projects: [
              {
                projectId: projects.a,
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
        if (opened.isMemory) {
          const clone = spyOn(MemoryState.prototype, 'clone');
          try {
            expect(
              await observation.readResourceOccupancyWithin(RAM, F, { ...scope, role: 'member' }),
            ).toEqual({ ok: false, reason: 'forbidden' });
            expect(clone).not.toHaveBeenCalled();
          } finally {
            clone.mockRestore();
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
            value: { projects: [{ claims: rows.map(() => ({ personName: 'Next Alias' })) }] },
          });
        }
      } finally {
        await close();
      }
    });

    // `wbs-shared-occupancy` S6, the fit half of task 5.1.
    it('agrees with the claim across projects', async () => {
      const { observation, projects, run, claim, release, leaf, state, close } =
        await seeded(store);
      try {
        await state(RAM, 16);
        for (const project of [0, 1] as const)
          await run(project, [
            { kind: 'setDemand', workItemId: leaf(project, 0), resourceId: RAM, units: 16 },
          ]);
        expect(await run(0, [claim(0, 0, 'a0')])).toMatchObject({ ok: true });
        const observed = await observation.readStartableWithin(
          projects.b,
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
              projectId: projects.a,
              workItemId: leaf(0, 0),
            },
          ],
          hiddenHolders: { units: 0 },
        });
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: false });
        await run(0, [release(0, 0, 'a0')]);
        const freed = await observation.startableWithin(projects.b, { kind: 'legacy' }, null);
        if (freed === null || 'kind' in freed) throw new Error('the read was refused');
        expect(freed.leaves.map(({ workItemId }) => workItemId)).toContain(leaf(1, 0));
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: true });
      } finally {
        await close();
      }
    });

    it('reports shared resources for leaf demands and project statements', async () => {
      const { observation, projects, run, claim, leaf, state, close } = await seeded(store);
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
            projects.b,
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
        expect(before.occupancyScope).toBe('project');
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

    it('keeps local units distinct from directory totals across project ceilings and lowering', async () => {
      const { source, observation, projects, run, claim, firstStepOf, leaf, state, close } =
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

        const steps = await source.stores.projects.stepsOf(projects.b);
        const otherStep = steps.find(({ id }) => id !== firstStepOf(projects.b));
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
            projects.b,
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
          [7, 3, 'project', 5],
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
            occupancyScope: 'project',
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

    it('uses every project leaf and omits shared resources used only by a parent or a holder', async () => {
      const { source, observation, projects, run, leaf, state, close } = await seeded(store);
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
            projects.b,
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

    // Review S3-5 (second pass): a holder's project is named only when it is
    // another project's, as `OccupancyHolder.projectId` says.
    it('names a holder’s project only when it is another project', async () => {
      const { run, claim, leaf, projects, state, close } = await seeded(store);
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
        expect(holders.map(({ personId, projectId }) => ({ personId, projectId }))).toEqual([
          { personId: 'a0', projectId: undefined },
          { personId: 'b0', projectId: projects.b },
        ]);
      } finally {
        await close();
      }
    });

    // Proof: with `findStartableWork` given empty organization inputs, this
    // failed beside its legacy twin (26 pass, 3 fail); watched 2026-10-25.
    if (store.name === 'sqlite')
      it('agrees with the claim across projects under scoped access', async () => {
        const {
          opened,
          observation,
          runner,
          people,
          projects,
          run,
          firstStepOf,
          leaf,
          state,
          close,
        } = await seeded(store);
        try {
          if (opened.activate === undefined) throw new Error('only SQLite activates');
          await state(RAM, 16);
          for (const project of [0, 1] as const)
            await run(project, [
              { kind: 'setDemand', workItemId: leaf(project, 0), resourceId: RAM, units: 16 },
            ]);
          opened.activate(F, people);
          const admin = {
            kind: 'scoped',
            scope: { organizationId: ORG, userId: F, role: 'admin' },
          } as const;
          const claimIn = (projectId: string, workItemId: string, personId: string) =>
            runner.runWithin(
              projectId,
              { id: F, username: F, scopes: ['write'] },
              [{ kind: 'claimWorkItem', workItemId, personId, steps: [firstStepOf(projectId)] }],
              admin,
            );
          expect(await claimIn(projects.a, leaf(0, 0), 'a0')).toMatchObject({ ok: true });
          const startable = await observation.startableWithin(projects.b, admin, null);
          if (startable === null || 'kind' in startable) throw new Error('the read was refused');
          expect(startable.leaves.map(({ workItemId }) => workItemId)).not.toContain(leaf(1, 0));
          const unfit = startable.doesNotFit.find((each) => each.workItemId === leaf(1, 0));
          expect(unfit?.exhausted).toMatchObject({ free: 0, scope: 'organization' });
          expect(await claimIn(projects.b, leaf(1, 0), 'b0')).toMatchObject({
            ok: false,
            reason: 'resources_exhausted',
          });
        } finally {
          await close();
        }
      });

    // Review S3-8: after activation every project has its organization row,
    // so an owned resource held in a project of none is corrupt, not skipped.
    it('throws on a holder in a project of no organization', async () => {
      const { source, graph, runner, run, claim, leaf, state, close } = await seeded(store);
      try {
        await state(RAM, 16);
        expect(
          await run(0, [{ kind: 'setDemand', workItemId: leaf(0, 0), resourceId: RAM, units: 4 }]),
        ).toMatchObject({ ok: true });
        expect(await run(0, [claim(0, 0, 'a0')])).toMatchObject({ ok: true });
        const { project, steps } = expectCreated(await graph.projects.create('Orphan', F));
        const step = steps.at(0);
        if (step === undefined) throw new Error('the orphan project has no step');
        if (store.name === 'memory')
          await source.stores.steps.add(
            {
              id: step.id,
              projectId: project.id,
              name: step.name,
              allowancePercent: 0,
              estimateUnit: 'workdays',
            },
            { at: 1, by: F },
          );
        const created = await runner.run(project.id, F, [
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
        expect(
          await source.stores.claims.organizationUnitsOf([RAM]).then(
            () => 'answered',
            (error: unknown) => String(error),
          ),
        ).toContain('held in a project of no organization');
        // The holder read refuses alike: a refusal never names a corrupt row.
        expect(
          await source.stores.claims.organizationOccupancyOf([RAM]).then(
            () => 'answered',
            (error: unknown) => String(error),
          ),
        ).toContain('held in a project of no organization');
      } finally {
        await close();
      }
    });

    if (store.name === 'sqlite')
      it('excludes a resource holder in a foreign-owned project from claim admission', async () => {
        const { source, run, claim, leaf, state, close } = await seeded(store, 'foreign-first');
        try {
          await state(RAM, 4);
          for (const project of [0, 1] as const)
            expect(
              await run(project, [
                { kind: 'setDemand', workItemId: leaf(project, 0), resourceId: RAM, units: 4 },
              ]),
            ).toMatchObject({ ok: true });
          expect(await run(0, [claim(0, 0, 'a0')])).toMatchObject({ ok: true });
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
      const { run, claim, leaf, held, state, projects, close } = await seeded(store);
      try {
        await state(RAM, 16);
        for (const project of [0, 1] as const)
          await run(project, [
            { kind: 'setResourceCapacity', resourceId: RAM, units: 16 },
            { kind: 'setDemand', workItemId: leaf(project, 0), resourceId: RAM, units: 16 },
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
            // Another project's holder names its project (S5).
            holders: [{ personId: 'a0', workItemId: leaf(0, 0), projectId: projects.a }],
            hiddenHolders: { units: 0 },
            resources: [{ resourceId: RAM, hiddenHolders: { units: 0 } }],
          },
        });
        expect(await held(RAM)).toBe(16);
      } finally {
        await close();
      }
    });

    it('holds one staging across projects, and B claims it once A releases it', async () => {
      const { run, claim, release, leaf, state, close } = await seeded(store);
      try {
        await state(STAGING, 1);
        for (const project of [0, 1] as const)
          await run(project, [
            { kind: 'setDemand', workItemId: leaf(project, 0), resourceId: STAGING, units: 1 },
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

    it('keeps the project ceiling binding while the organization has units free', async () => {
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
          detail: { free: 0, scope: 'project' },
        });
      } finally {
        await close();
      }
    });

    // Proof: a separate committed reader admitted both claims. Forcing commit
    // after refusal left the first claim durable on SQLite. Watched 2026-11-21.
    it('refuses the second of two leaves one batch claims past the directory capacity, writing nothing', async () => {
      const { source, projects, run, claim, leaf, held, state, close } = await seeded(store);
      try {
        await state(RAM, 16);
        await run(0, [
          { kind: 'setDemand', workItemId: leaf(0, 0), resourceId: RAM, units: 10 },
          { kind: 'setDemand', workItemId: leaf(0, 1), resourceId: RAM, units: 10 },
        ]);
        const journalScope = { projectId: projects.a, userId: F, personId: null };
        const journal = await source.stores.journal.entriesFor(journalScope);
        expect(await run(0, [claim(0, 0, 'a0'), claim(0, 1, 'a1')])).toMatchObject({
          ok: false,
          at: 1,
          reason: 'resources_exhausted',
          detail: { asked: 10, free: 6, scope: 'organization' },
        });
        expect(await source.stores.claims.listByProject(projects.a)).toEqual([]);
        expect(await source.stores.journal.entriesFor(journalScope)).toEqual(journal);
        expect(await held(RAM)).toBe(0);
      } finally {
        await close();
      }
    });

    it('decides as before when no directory capacity is stated', async () => {
      const { run, claim, leaf, held, close } = await seeded(store);
      try {
        for (const project of [0, 1] as const)
          await run(project, [
            { kind: 'setResourceCapacity', resourceId: RAM, units: 16 },
            { kind: 'setDemand', workItemId: leaf(project, 0), resourceId: RAM, units: 16 },
          ]);
        expect(await run(0, [claim(0, 0, 'a0')])).toMatchObject({ ok: true });
        // Per project only, as `wbs-resources` R3 counted it: 32 of an unstated directory.
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: true });
        expect(await held(RAM)).toBe(32);
      } finally {
        await close();
      }
    });

    it('refuses an undo of a release in A once B took the directory’s 16', async () => {
      const { runner, projects, run, claim, release, leaf, held, state, close } =
        await seeded(store);
      try {
        await state(RAM, 16);
        for (const project of [0, 1] as const)
          await run(project, [
            { kind: 'setDemand', workItemId: leaf(project, 0), resourceId: RAM, units: 16 },
          ]);
        await run(0, [claim(0, 0, 'a0')]);
        await run(0, [release(0, 0, 'a0')]);
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: true });
        const undone = await runner.undo(projects.a, F);
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
      const { runner, projects, run, claim, leaf, held, state, close } = await seeded(store);
      try {
        await state(RAM, 16);
        for (const project of [0, 1] as const)
          await run(project, [
            { kind: 'setDemand', workItemId: leaf(project, 0), resourceId: RAM, units: 12 },
          ]);
        await run(0, [claim(0, 0, 'a0')]);
        expect(await runner.undo(projects.a, F)).toMatchObject({ ok: true });
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: true });
        const redone = await runner.redo(projects.a, F);
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
        const { source, runner, projects, run, claim, leaf, held, state, close } =
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
          const undone = await runner.undo(projects.a, F);
          if (expected === 'refused') {
            expect(undone).toMatchObject({ ok: false, reason: 'stale_undo' });
            expect(staleDetail(undone)).toStartWith('resources_exhausted:');
            expect(await source.stores.claims.listByProject(projects.a)).toEqual([]);
            expect(await held(RAM)).toBe(taken);
          } else {
            expect(undone).toMatchObject({ ok: true });
            expect(await source.stores.claims.listByProject(projects.a)).not.toEqual([]);
            expect(await held(RAM)).toBe(16);
          }
        } finally {
          await close();
        }
      });

    it('refuses an undo of a cascading release leaf by leaf across projects', async () => {
      const { source, runner, projects, run, claim, leaf, held, state, close } =
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
        const undone = await runner.undo(projects.a, F);
        expect(undone).toMatchObject({ ok: false, reason: 'stale_undo' });
        expect(staleDetail(undone)).toStartWith('resources_exhausted:');
        expect(await source.stores.claims.listByProject(projects.a)).toEqual([]);
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
        for (const project of [0, 1] as const)
          await run(project, [
            { kind: 'setDemand', workItemId: leaf(project, 0), resourceId: RAM, units: 16 },
          ]);
        // An agent's claim for itself is leased (`wbs-claim-leases` L1).
        expect(await run(0, [claim(0, 0, 'a0')], { personId: 'a0' })).toMatchObject({ ok: true });
        expect(await run(1, [claim(1, 0, 'b0')])).toMatchObject({ ok: false });
        moveTo(now() + CLAIM_LEASE_MS + 1);
        const ticks: (() => void)[] = [];
        const sweep = new ClaimLeaseSweep({
          runner,
          projectsWithExpiredLeases: (at, limit) =>
            source.stores.claims.projectsWithExpiredLeases(at, limit),
          now,
          intervals: {
            every: (_ms, callback) => {
              ticks.push(callback);
              return () => undefined;
            },
          },
          intervalMs: 30_000,
          projectsPerTick: 50,
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
