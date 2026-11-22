import { type Demand, indexTree, type ResourceCapacity, type ResourceUnits } from '@wbs/domain';

import { findProjectWithin, type ResourceAccess } from '../../ports/organization-access';
import type {
  DirectoryTotals,
  ProjectResourceRead,
  ProjectResourceStores,
} from '../../ports/project-report-store';
import type { LabelledWorkItem } from '../../ports/work-item-store';

/** Capacity statements and demands on all project leaves, independent of the startable filters. */
export function startableResourceIds(
  rows: readonly LabelledWorkItem[],
  capacities: readonly ResourceCapacity[],
  demands: readonly Demand[],
): string[] {
  const leafIds = new Set(indexTree(rows).leafIds);
  return [
    ...new Set([
      ...capacities.map(({ resourceId }) => resourceId),
      // Proof: including parent demands listed staging in the eligibility case on both stores.
      ...demands
        .filter(({ workItemId }) => leafIds.has(workItemId))
        .map(({ resourceId }) => resourceId),
    ]),
  ];
}

/** Runs one query inside the caller's observation, checking its lifetime on both sides if borrowed. */
export type ReportRead = <T>(query: () => Promise<T>) => Promise<T>;

const detachedRead: ReportRead = (query) => query();

/** Reads one bounded aggregate for the directory capacities in the same observation. */
export async function readDirectoryOccupancy(
  { directory, claims }: Pick<ProjectResourceStores, 'directory' | 'claims'>,
  resourceIds: readonly string[],
  read: ReportRead = detachedRead,
): Promise<{ directoryCapacities: ResourceCapacity[]; organizationOccupied: ResourceUnits[] }> {
  const directoryCapacities =
    resourceIds.length === 0 ? [] : await read(() => directory.directoryCapacitiesOf(resourceIds));
  // Proof: calling the empty aggregate or sending unstated catalog ids failed the mounted call checks.
  // An identity enumeration failed the same read's no-holder-call assertion.
  const organizationOccupied =
    directoryCapacities.length === 0
      ? []
      : await read(() =>
          claims.organizationUnitsOf(directoryCapacities.map(({ resourceId }) => resourceId)),
        );
  return { directoryCapacities, organizationOccupied };
}

/** Directory capacities with signed free units. An aggregate omits resources with no held units. */
export function directoryTotalsOf(
  capacities: readonly ResourceCapacity[],
  organizationOccupied: readonly ResourceUnits[],
): ReadonlyMap<string, DirectoryTotals> {
  const occupiedByResource = new Map(
    organizationOccupied.map(({ resourceId, units }) => [resourceId, units]),
  );
  return new Map(
    capacities.map(({ resourceId, units: capacity }) => {
      const occupied = occupiedByResource.get(resourceId) ?? 0;
      return [resourceId, { capacity, occupied, free: capacity - occupied }];
    }),
  );
}

/** Admits the project without separating scoped ownership from its reference checks. */
export async function admitsProjectRead(
  projects: ProjectResourceStores['projects'],
  projectId: string,
  access: ResourceAccess,
  read: ReportRead = detachedRead,
): Promise<boolean> {
  if ((await read(() => findProjectWithin(projects, projectId, access))) === null) return false;
  if (access.kind === 'scoped') {
    const { organizationId } = access.scope;
    const crossing = await read(() => projects.findCrossReferences(projectId, organizationId));
    if (crossing.length > 0) {
      const kinds = [...new Set(crossing.map((reference) => reference.kind))].sort();
      throw new Error(
        `project "${projectId}" holds references outside its organization: ${kinds.join(', ')}`,
      );
    }
  }
  return true;
}

/**
 * Reads the whole admitted catalog and the project's statements on one observation.
 * Only resources with stated directory capacities contribute an organization aggregate.
 */
export async function readProjectResources(
  stores: ProjectResourceStores,
  projectId: string,
  access: ResourceAccess,
  read: ReportRead = detachedRead,
): Promise<ProjectResourceRead> {
  if (!(await admitsProjectRead(stores.projects, projectId, access, read)))
    return { kind: 'not_found' };
  const { directory, demands, resourceCapacity } = stores;
  // Proof: reading the root catalog under scoped access listed both organizations' names
  // in `creates the same name in two organizations, each finding only its own` (2026-10-20).
  const listed = await read(() =>
    access.kind === 'scoped'
      ? directory.listInOrganization('resources', access.scope.organizationId)
      : directory.listResources(),
  );
  const { directoryCapacities, organizationOccupied } = await readDirectoryOccupancy(
    stores,
    listed.map(({ id }) => id),
    read,
  );
  const totals = directoryTotalsOf(directoryCapacities, organizationOccupied);
  const capacities = await read(() => resourceCapacity.listFor(projectId));
  const statedDemands = await read(() => demands.listByProject(projectId));
  const listedIds = new Set(listed.map(({ id }) => id));
  for (const { resourceId } of [...capacities, ...statedDemands]) {
    // Proof: the mounted omitted-catalog test returned 200 for a dangling demand without this check.
    if (!listedIds.has(resourceId))
      throw new Error(`resource ${resourceId} is not in the admitted catalog`);
  }
  return {
    kind: 'ready',
    value: {
      resources: listed.map((resource) => {
        const shared = totals.get(resource.id);
        // Proof: substituting a zero triple for a clear failed the viewer catalog read.
        return shared === undefined
          ? { ...resource, directoryCapacity: null, directory: null }
          : { ...resource, directoryCapacity: shared.capacity, directory: shared };
      }),
      capacities,
      demands: statedDemands,
    },
  };
}
