import {
  mayStateDirectoryCapacityInOrganization,
  occupancyByResource,
  type OrganizationScope,
} from '@wbs/domain';

import type { ClaimStore } from '../../ports/claim-store';
import type { DirectoryStore } from '../../ports/directory-store';
import type { RefusedOrganizationAccess } from '../../ports/organization-access';
import type { ProjectStore } from '../../ports/project-store';
import { projectVisibility } from './shared-holders';

export type CapacityPreview =
  | {
      readonly ok: true;
      readonly value: {
        readonly resourceId: string;
        readonly before: number | null;
        readonly after: number | null;
        readonly projects: { projectId: string; name: string; units: number }[];
        readonly hiddenProjects: { count: number; units: number };
        readonly free: number | null;
        readonly refusal: null;
      };
    }
  | { readonly ok: false; readonly reason: 'forbidden' | 'not_found' }
  | RefusedOrganizationAccess;

/** Projects states, demand and held units from one admitted snapshot. Never writes. */
export async function previewCapacity(
  stores: {
    readonly directory: Pick<
      DirectoryStore,
      'listInOrganization' | 'directoryCapacitiesOf' | 'usageOfResource'
    >;
    readonly claims: Pick<ClaimStore, 'organizationOccupancyOf'>;
    readonly projects: Pick<ProjectStore, 'findInOrganization' | 'mayReadProjectWithin'>;
  },
  resourceId: string,
  units: number | null,
  actorId: string,
  scope: OrganizationScope,
): Promise<CapacityPreview> {
  if (!mayStateDirectoryCapacityInOrganization(scope.role))
    return { ok: false, reason: 'forbidden' };
  const { directory } = stores;
  const owned = (await directory.listInOrganization('resources', scope.organizationId)).some(
    ({ id }) => id === resourceId,
  );
  if (!owned) return { ok: false, reason: 'not_found' };
  const before =
    (await directory.directoryCapacitiesOf([resourceId])).find(
      (entry) => entry.resourceId === resourceId,
    )?.units ?? null;
  const rows = await stores.claims.organizationOccupancyOf([resourceId]);
  const usage = await directory.usageOfResource(resourceId);
  const ids = [
    ...new Set([
      ...rows.map(({ projectId }) => projectId),
      ...usage.capacities.map(({ projectId }) => projectId),
      ...usage.rows.projects.map(({ id }) => id),
    ]),
  ].sort();
  const decide = projectVisibility(stores.projects, actorId, { kind: 'scoped', scope });
  const projects: { projectId: string; name: string; units: number }[] = [];
  let hiddenCount = 0;
  let hiddenUnits = 0;
  let occupied = 0;
  for (const id of ids) {
    const project = await stores.projects.findInOrganization(id, scope.organizationId);
    if (project === null)
      throw new Error(`project ${id} names resource ${resourceId} outside its organization`);
    const held =
      occupancyByResource(rows.filter((row) => row.projectId === id)).find(
        (row) => row.resourceId === resourceId,
      )?.occupied ?? 0;
    occupied += held;
    if (await decide({ id, organizationId: scope.organizationId }))
      projects.push({ projectId: id, name: project.name, units: held });
    else {
      // Proof: preview-count-duplicated counted a repeated origin, and preview-zero-omitted lost the zero holder.
      hiddenCount += 1;
      hiddenUnits += held;
    }
  }
  return {
    ok: true,
    value: {
      resourceId,
      before,
      after: units,
      projects,
      hiddenProjects: { count: hiddenCount, units: hiddenUnits },
      // Proof: preview-free-visible-only answered 14 instead of -2 in the mounted preview.
      free: units === null ? null : units - occupied,
      refusal: null,
    },
  };
}
