import {
  type CapacityLimitCrossed,
  mayStateDirectoryCapacityInOrganization,
  occupancyByResource,
  type OrganizationScope,
  refuseDirectoryCapacity,
} from '@wbs/domain';

import type { ClaimStore } from '../../ports/claim-store';
import type { DirectoryStore } from '../../ports/directory-store';
import type { RefusedOrganizationAccess } from '../../ports/organization-access';
import type { OrganizationLimitGauge } from '../../ports/organization-limits';
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
        readonly refusal: ({ readonly error: 'capacity_limit' } & CapacityLimitCrossed) | null;
      };
    }
  | { readonly ok: false; readonly reason: 'forbidden' | 'not_found' }
  | RefusedOrganizationAccess;

interface PreviewStores {
  readonly directory: Pick<DirectoryStore, 'listInOrganization' | 'usageOfResource'>;
  readonly claims: Pick<ClaimStore, 'organizationOccupancyOf'>;
  readonly limits: Pick<OrganizationLimitGauge, 'readDirectoryCapacityLimit'> | undefined;
  readonly projects: Pick<ProjectStore, 'findInOrganization' | 'mayReadProjectWithin'>;
}

/** Projects demand, holdings and the unconfirmed write's decision from one admitted observation. */
export async function previewCapacity(
  acquire: () => PreviewStores | Promise<PreviewStores>,
  resourceId: string,
  units: number | null,
  actorId: string,
  scope: OrganizationScope,
  read: <T>(query: () => Promise<T>) => Promise<T> = (query) => query(),
): Promise<CapacityPreview> {
  if (actorId !== scope.userId)
    throw new Error('organization read actor differs from its admitted scope');
  if (!mayStateDirectoryCapacityInOrganization(scope.role))
    return { ok: false, reason: 'forbidden' };
  // Proof: acquiring the Memory snapshot before refusing a member kept the
  // preview waiting for the held write turn in the composed-source test.
  const { directory, claims, limits, projects: catalog } = await acquire();
  const owned = (
    await read(() => directory.listInOrganization('resources', scope.organizationId))
  ).some(({ id }) => id === resourceId);
  if (!owned) return { ok: false, reason: 'not_found' };
  if (limits === undefined)
    throw new Error('a directory capacity preview was admitted without organization limits');
  const reading = await read(() =>
    limits.readDirectoryCapacityLimit(scope.organizationId, resourceId),
  );
  const refusal = refuseDirectoryCapacity(resourceId, reading, units, false);
  const rows = await read(() => claims.organizationOccupancyOf([resourceId]));
  const usage = await read(() => directory.usageOfResource(resourceId));
  const ids = [
    ...new Set([
      ...rows.map(({ projectId }) => projectId),
      ...usage.capacities.map(({ projectId }) => projectId),
      ...usage.rows.projects.map(({ id }) => id),
    ]),
  ].sort();
  const decide = projectVisibility(catalog, actorId, { kind: 'scoped', scope });
  const projects: { projectId: string; name: string; units: number }[] = [];
  let hiddenCount = 0;
  let hiddenUnits = 0;
  let occupied = 0;
  for (const id of ids) {
    const project = await read(() => catalog.findInOrganization(id, scope.organizationId));
    if (project === null)
      throw new Error(`project ${id} names resource ${resourceId} outside its organization`);
    const held =
      occupancyByResource(rows.filter((row) => row.projectId === id)).find(
        (row) => row.resourceId === resourceId,
      )?.occupied ?? 0;
    occupied += held;
    if (await read(() => decide({ id, organizationId: scope.organizationId })))
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
      before: reading.before,
      after: units,
      projects,
      hiddenProjects: { count: hiddenCount, units: hiddenUnits },
      // Proof: preview-free-visible-only answered 14 instead of -2 in the mounted preview.
      free: units === null ? null : units - occupied,
      // Proof: always answering null hid the precise 65-over-64 refusal in the mounted preview.
      refusal: refusal === null ? null : { error: 'capacity_limit', ...refusal },
    },
  };
}
