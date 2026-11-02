import type { Resource, TransactionalStores } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import type { SeededPlan } from '../source-declaration';
import { type OpenCase, storeCase } from './store-case';

/**
 * The two resources every source seeds for the resource cases (`wbs-resources`):
 * one divisible and one exclusive, so a case can tell the kinds apart.
 */
export const CONFORMANCE_RESOURCES: readonly [Resource, Resource] = [
  { id: 'resource-ram', name: 'h2puni ram', kind: 'divisible', unitLabel: 'GB' },
  { id: 'resource-stage', name: 'staging', kind: 'exclusive', unitLabel: 'env' },
];

/** Whether a resource case needs {@link CONFORMANCE_RESOURCES} seeded before it opens. */
export function isResourceCase(caseId: string): boolean {
  return (
    caseId.startsWith('resourceCapacity.') ||
    caseId.startsWith('demands.') ||
    caseId.startsWith('directory.addResource') ||
    caseId.startsWith('directory.removeResource') ||
    caseId.startsWith('directory.setResourceProvider') ||
    caseId.startsWith('directory.setDirectoryCapacity') ||
    caseId.startsWith('claims.occupancy')
  );
}

const [RAM, STAGE] = CONFORMANCE_RESOURCES;

/**
 * The ownership the `claims.occupancy:organization-scope` case needs, which
 * no port writes: the seed's first project and RAM belong to `organizationId`,
 * the second project to `otherOrganizationId`, and the stage to none.
 */
export const SHARED_OCCUPANCY_OWNERSHIP = {
  caseIds: [
    'claims.occupancy:organization-scope',
    'directory.setDirectoryCapacity:state-clear-remove',
  ],
  organizationId: 'shared-occupancy-org',
  otherOrganizationId: 'shared-occupancy-other-org',
  resourceId: RAM.id,
} as const;

/**
 * Seeds {@link CONFORMANCE_RESOURCES} for a resource case, and for the removal
 * case a demand in the first project and a capacity in the second, through the
 * source's own writers.
 *
 * @throws when a seeding write is refused: the case would assert against a
 * source state nobody set up.
 */
export async function seedResourceCase(
  stores: Pick<TransactionalStores, 'directory' | 'demands' | 'resourceCapacity' | 'claims'>,
  caseId: string,
  seed: SeededPlan,
): Promise<void> {
  if (!isResourceCase(caseId)) return;
  for (const resource of CONFORMANCE_RESOURCES) {
    const added = await stores.directory.addResource(resource, seed.stamps[0]);
    if (!added.ok) throw new Error(`conformance resource ${resource.id} was refused`);
  }
  if (caseId === 'directory.setDirectoryCapacity:state-clear-remove') {
    // A claim holding RAM through its `resources` alone in each project, no
    // demand and no capacity: the first project is RAM's organization's and is
    // announced, the second another organization's and is not (review S3-1).
    const holders = [0, 1].map((index) => ({
      id: `claim-holding-ram-${String(index)}`,
      workItemId: seed.workItemIds[index === 0 ? 0 : 1][0],
      stepId: seed.stepIds[index === 0 ? 0 : 1][0],
      personId: seed.personIds[0],
      runId: null,
      parentClaimId: null,
      accountId: seed.ownerIds[0],
    }));
    const held = await stores.claims.add(
      holders,
      [],
      seed.stamps[0],
      holders.map(({ id }) => ({ claimId: id, resourceId: RAM.id, units: 2 })),
    );
    if (held !== 'written') throw new Error(`conformance occupancy was refused: ${held}`);
    return;
  }
  if (caseId !== 'directory.removeResource:in-use-cascade') return;
  if ((await stores.demands.set(seed.workItemIds[0][0], RAM.id, 4, seed.stamps[0])) !== 'written')
    throw new Error('conformance demand was refused');
  const stated = await stores.resourceCapacity.set(seed.projectIds[1], RAM.id, 32, seed.stamps[0]);
  if (!stated.ok) throw new Error('conformance resource capacity was refused');
  // A claim holding RAM and the stage on the second project's leaf: an
  // occupancy beside RAM's demand and capacity, and the stage's only use
  // (`wbs-resources` R8), so the count is read and refuses on its own.
  const holding = {
    id: 'claim-holding-ram',
    workItemId: seed.workItemIds[1][1],
    stepId: seed.stepIds[1][0],
    personId: seed.personIds[0],
    runId: null,
    parentClaimId: null,
    accountId: seed.ownerIds[0],
  };
  const held = await stores.claims.add([holding], [], seed.stamps[0], [
    { claimId: holding.id, resourceId: RAM.id, units: 2 },
    { claimId: holding.id, resourceId: STAGE.id, units: 1 },
  ]);
  if (held !== 'written') throw new Error(`conformance occupancy was refused: ${held}`);
}

/** The shared resource-capacity cases: stated, zero, cleared, per project, and refusals. */
export function resourceCapacityRegistrations(
  open: OpenCase<'resourceCapacity'>,
): readonly CaseRegistration[] {
  return [
    storeCase(
      'resourceCapacity',
      'resourceCapacity.set:stated-zero-cleared',
      open,
      async ({ port, seed }) => {
        const [projectA, projectB] = seed.projectIds;
        expect(await port.set(projectA, RAM.id, 32, seed.stamps[0])).toEqual({ ok: true });
        expect(await port.set(projectA, STAGE.id, 0, seed.stamps[0])).toEqual({ ok: true });
        expect(await port.set(projectB, RAM.id, 8, seed.stamps[1])).toEqual({ ok: true });
        expect(await port.set(projectA, RAM.id, 48, seed.stamps[1])).toEqual({ ok: true });
        expect({
          a: await port.listFor(projectA),
          b: await port.listFor(projectB),
        }).toEqual({
          a: [
            { resourceId: RAM.id, units: 48 },
            { resourceId: STAGE.id, units: 0 },
          ],
          b: [{ resourceId: RAM.id, units: 8 }],
        });
        expect(await port.set(projectA, RAM.id, null, seed.stamps[1])).toEqual({ ok: true });
        expect(await port.set(projectA, RAM.id, null, seed.stamps[1])).toEqual({ ok: true });
        expect(await port.listFor(projectA)).toEqual([{ resourceId: STAGE.id, units: 0 }]);
        expect(await port.listFor(projectB)).toEqual([{ resourceId: RAM.id, units: 8 }]);
      },
    ),
    storeCase(
      'resourceCapacity',
      'resourceCapacity.set:missing-reference',
      open,
      async ({ port, seed }) => {
        expect(await port.set('project-missing', RAM.id, 3, seed.stamps[0])).toEqual({
          ok: false,
          reason: 'unknown_project',
        });
        expect(await port.set(seed.projectIds[0], 'resource-missing', 3, seed.stamps[0])).toEqual({
          ok: false,
          reason: 'unknown_resource',
        });
        expect(await port.listFor(seed.projectIds[0])).toEqual([]);
        expect(await port.listFor('project-missing')).toEqual([]);
      },
    ),
  ];
}

/** The shared demand cases: replace, clear, project scope, refusals, and the work item cascade. */
export function demandRegistrations(open: OpenCase<'demands'>): readonly CaseRegistration[] {
  return [
    storeCase('demands', 'demands.set:replace-clear-scope', open, async ({ port, seed }) => {
      const [first, second] = seed.workItemIds[0];
      const [other] = seed.workItemIds[1];
      expect(await port.set(first, RAM.id, 4, seed.stamps[0])).toBe('written');
      expect(await port.set(first, STAGE.id, 1, seed.stamps[0])).toBe('written');
      expect(await port.set(second, RAM.id, 2, seed.stamps[0])).toBe('written');
      expect(await port.set(other, RAM.id, 16, seed.stamps[1])).toBe('written');
      expect(await port.set(first, RAM.id, 6, seed.stamps[1])).toBe('written');
      expect(await port.listByProject(seed.projectIds[0])).toEqual([
        { workItemId: first, resourceId: RAM.id, units: 6 },
        { workItemId: first, resourceId: STAGE.id, units: 1 },
        { workItemId: second, resourceId: RAM.id, units: 2 },
      ]);
      expect(await port.set(first, STAGE.id, null, seed.stamps[1])).toBe('written');
      expect(await port.listByProject(seed.projectIds[0])).toEqual([
        { workItemId: first, resourceId: RAM.id, units: 6 },
        { workItemId: second, resourceId: RAM.id, units: 2 },
      ]);
      expect(await port.listByProject(seed.projectIds[1])).toEqual([
        { workItemId: other, resourceId: RAM.id, units: 16 },
      ]);
    }),
    storeCase('demands', 'demands.set:missing-reference', open, async ({ port, seed }) => {
      const [first] = seed.workItemIds[0];
      expect(await port.set('work-missing', RAM.id, 1, seed.stamps[0])).toBe('unknown_work_item');
      expect(await port.set(first, 'resource-missing', 1, seed.stamps[0])).toBe('unknown_resource');
      expect(await port.listByProject(seed.projectIds[0])).toEqual([]);
    }),
  ];
}

/** The shared directory cases for resources: a name refused, and usage that decides removal. */
export function directoryResourceRegistrations(
  open: OpenCase<'directory'>,
): readonly CaseRegistration[] {
  return [
    storeCase('directory', 'directory.addResource:taken', open, async ({ port, seed }) => {
      const again = { ...RAM, id: 'resource-again', kind: 'exclusive' as const };
      expect(await port.addResource(again, seed.stamps[0])).toEqual({ ok: false, reason: 'taken' });
      expect(await port.listResources()).toEqual([RAM, STAGE]);
      const disk = {
        id: 'resource-disk',
        name: 'h2puni disk',
        kind: 'divisible' as const,
        unitLabel: 'GB',
      };
      expect(await port.addResource(disk, seed.stamps[0])).toEqual({ ok: true, resource: disk });
      expect(await port.patchResource(disk.id, { name: RAM.name }, seed.stamps[1])).toEqual({
        ok: false,
        reason: 'taken',
      });
      const patched = await port.patchResource(disk.id, { unitLabel: 'TB' }, seed.stamps[1]);
      expect(patched).toEqual({
        ok: true,
        resource: { ...disk, unitLabel: 'TB' },
        projectIds: [],
      });
      expect(
        await port.patchResource('resource-missing', { unitLabel: 'x' }, seed.stamps[1]),
      ).toEqual({
        ok: false,
        reason: 'not_found',
      });
    }),
    // The reference only ever names an instance the source holds; the memory
    // twin holds none and SQLite none seeded here, so every id is unknown and
    // clearing is the one write both accept (`compute-providers` P3).
    storeCase(
      'directory',
      'directory.setResourceProvider:unknown-and-clear',
      open,
      async ({ port, seed }) => {
        expect(await port.setResourceProvider(RAM.id, null, null, seed.stamps[1])).toEqual({
          ok: true,
          projectIds: [],
        });
        expect(
          await port.setResourceProvider(RAM.id, 'provider-missing', null, seed.stamps[1]),
        ).toEqual({ ok: false, reason: 'unknown_provider' });
        expect(
          await port.setResourceProvider('resource-missing', null, null, seed.stamps[1]),
        ).toEqual({ ok: false, reason: 'not_found' });
        expect(await port.listResources()).toEqual([RAM, STAGE]);
      },
    ),
    // `wbs-shared-occupancy` S1, S2, S8. RAM is the organization's (seeded by
    // {@link SHARED_OCCUPANCY_OWNERSHIP}); the stage belongs to none.
    // Proof, each watched 2026-10-25: with the memory twin's organization
    // refusal removed, the memory certification failed here stating the
    // stage's capacity; with its removal check ignoring the directory capacity,
    // it removed RAM unconfirmed; with SQLite's usage answering null, the
    // SQLite certification failed the same way. The announce names the
    // organization's project whose claim holds RAM, not the other
    // organization's (review S3-1); its fault lines are proven at each
    // store's `setDirectoryCapacity`.
    storeCase(
      'directory',
      'directory.setDirectoryCapacity:state-clear-remove',
      open,
      async ({ port, seed }) => {
        const act = (auditId: string) => ({
          stamp: seed.stamps[0],
          actor: seed.ownerIds[0],
          auditId,
        });
        expect(await port.directoryCapacitiesOf([RAM.id, STAGE.id])).toEqual([]);
        expect(await port.setDirectoryCapacity(RAM.id, 16, act('audit-1'))).toEqual({
          ok: true,
          before: null,
          after: 16,
          organizationId: SHARED_OCCUPANCY_OWNERSHIP.organizationId,
          projectIds: [seed.projectIds[0]],
        });
        expect(await port.setDirectoryCapacity(RAM.id, 0, act('audit-2'))).toMatchObject({
          ok: true,
          before: 16,
          after: 0,
        });
        expect(await port.directoryCapacitiesOf([STAGE.id, RAM.id])).toEqual([
          { resourceId: RAM.id, units: 0 },
        ]);
        expect(await port.setDirectoryCapacity(STAGE.id, 1, act('audit-3'))).toEqual({
          ok: false,
          reason: 'organization_required',
        });
        expect(await port.setDirectoryCapacity('resource-missing', 1, act('audit-4'))).toEqual({
          ok: false,
          reason: 'not_found',
        });
        expect((await port.usageOfResource(RAM.id)).directoryCapacity).toBe(0);
        expect((await port.usageOfResource(STAGE.id)).directoryCapacity).toBeNull();
        expect(await port.removeResource(RAM.id, false, seed.stamps[1])).toMatchObject({
          ok: false,
          reason: 'in_use',
          usage: { directoryCapacity: 0 },
        });
        expect(await port.removeResource(RAM.id, true, seed.stamps[1])).toMatchObject({ ok: true });
        expect(await port.directoryCapacitiesOf([RAM.id])).toEqual([]);
        expect(await port.setDirectoryCapacity(RAM.id, 4, act('audit-5'))).toEqual({
          ok: false,
          reason: 'not_found',
        });
      },
    ),
    storeCase(
      'directory',
      'directory.removeResource:in-use-cascade',
      open,
      async ({ port, seed }) => {
        const usage = await port.usageOfResource(RAM.id);
        expect({
          demands: usage.demands,
          capacities: usage.capacities,
          occupancies: usage.occupancies,
          projects: usage.rows.projects.map(({ id }) => id),
        }).toEqual({
          demands: [{ workItemId: seed.workItemIds[0][0], resourceId: RAM.id, units: 4 }],
          capacities: [{ projectId: seed.projectIds[1], units: 32 }],
          occupancies: 1,
          projects: [seed.projectIds[0]],
        });
        const refused = await port.removeResource(RAM.id, false, seed.stamps[0]);
        expect(refused.ok).toBe(false);
        expect(await port.listResources()).toEqual([RAM, STAGE]);
        // Held by a claim and named by nothing else, the stage is in use too.
        expect((await port.usageOfResource(STAGE.id)).occupancies).toBe(1);
        expect(await port.removeResource(STAGE.id, false, seed.stamps[0])).toMatchObject({
          ok: false,
          reason: 'in_use',
          usage: { occupancies: 1, demands: [], capacities: [] },
        });
        const removed = await port.removeResource(RAM.id, true, seed.stamps[1]);
        expect(removed).toEqual({
          ok: true,
          removal: {
            workItemIds: [seed.workItemIds[0][0]],
            projectIds: [seed.projectIds[0], seed.projectIds[1]],
          },
        });
        expect(await port.listResources()).toEqual([STAGE]);
        const after = await port.usageOfResource(STAGE.id);
        expect(after.demands).toEqual([]);
        expect(after.occupancies).toBe(1);
        expect(await port.removeResource(RAM.id, true, seed.stamps[1])).toEqual({
          ok: false,
          reason: 'not_found',
        });
      },
    ),
  ];
}
