import {
  mayStateDirectoryCapacityInOrganization,
  occupancyByResource,
  type OrganizationOccupancyRow,
  type OrganizationScope,
} from '@wbs/domain';

import type { ClaimStore, StampedClaim } from '../../ports/claim-store';
import type { DirectoryStore } from '../../ports/directory-store';
import type { RefusedOrganizationAccess } from '../../ports/organization-access';
import type { ProjectStore } from '../../ports/project-store';
import { nameOccupancyHolder, projectVisibility, readHolderNames } from './shared-holders';

interface HoldingClaim {
  claimId: string;
  personId: string;
  personName: string;
  runId: string | null;
  workItemId: string;
  claimedAt: number;
  leaseExpiresAt: number | null;
  releasableBy: 'claimant_or_admin' | 'claimant';
}

interface HoldingProject {
  projectId: string;
  name: string;
  restricted: boolean;
  units: number;
  claims: HoldingClaim[];
}

export type ResourceOccupancyRead =
  | {
      readonly ok: true;
      readonly value: {
        resourceId: string;
        directoryCapacity: number | null;
        occupied: number;
        free: number | null;
        projects: HoldingProject[];
      };
    }
  | { readonly ok: false; readonly reason: 'forbidden' | 'not_found' }
  | RefusedOrganizationAccess;

interface ResourceOccupancyStores {
  readonly directory: Pick<
    DirectoryStore,
    'listInOrganization' | 'directoryCapacitiesOf' | 'personNamesInOrganization' | 'namesOf'
  >;
  readonly claims: Pick<ClaimStore, 'organizationOccupancyOf' | 'listStampedByIds'>;
  readonly projects: Pick<ProjectStore, 'findInOrganization' | 'mayReadProjectWithin'>;
}

/**
 * Projects a resource's held units and distinct visible claims in one admitted observation.
 * Stated shared capacity exposes organization units. Unstated capacity exposes readable units.
 * @throws when trusted holding ownership, identity, stamps or names cannot be established.
 */
export async function readResourceOccupancy(
  capture: () => ResourceOccupancyStores | Promise<ResourceOccupancyStores>,
  resourceId: string,
  actorId: string,
  scope: OrganizationScope,
): Promise<ResourceOccupancyRead> {
  // Proof: removing the role check returned HTTP 200 with another project's holding to a member.
  if (!mayStateDirectoryCapacityInOrganization(scope.role))
    return { ok: false, reason: 'forbidden' };
  const { directory, projects, claims } = await capture();
  const owned = (await directory.listInOrganization('resources', scope.organizationId)).some(
    ({ id }) => id === resourceId,
  );
  // Proof: removing scoped ownership returned HTTP 200 for a foreign resource.
  if (!owned) return { ok: false, reason: 'not_found' };
  const capacity = (await directory.directoryCapacitiesOf([resourceId])).find(
    (entry) => entry.resourceId === resourceId,
  );
  // Proof: treating a stated zero as absent returned null in the mounted zero-capacity read.
  const directoryCapacity = capacity === undefined ? null : capacity.units;
  const rows = await claims.organizationOccupancyOf([resourceId]);
  const byProject = groupHoldingClaims(rows, resourceId, scope.organizationId);
  const access = { kind: 'scoped' as const, scope };
  const mayRead = projectVisibility(projects, actorId, access);
  const visible: { project: Omit<HoldingProject, 'claims'>; holdings: StampedClaim[] }[] = [];
  let occupied = 0;
  for (const [projectId, group] of [...byProject].sort(([left], [right]) =>
    compareIds(left, right),
  )) {
    // Proof: substituting an origin for missing ownership returned a partial HTTP 200.
    const project = await projects.findInOrganization(projectId, scope.organizationId);
    if (project === null) throw new Error(`holding project ${projectId} has no verified owner`);
    // Proof: summing claim copies instead of each leaf's maximum returned 32 units instead of 20.
    const units = occupancyByResource(group).reduce((sum, holding) => sum + holding.occupied, 0);
    const readable = await mayRead({ id: projectId, organizationId: scope.organizationId });
    // Proof: a visible-only total lost 16 shared units. Counting all origins disclosed those units
    // when directory capacity was unstated.
    if (directoryCapacity !== null || readable) occupied += units;
    // Proof: projecting the denied project exposed its private holder in the mounted body.
    if (!readable) continue;
    const ordered = group.toSorted((left, right) => compareIds(left.claimId, right.claimId));
    const ids = ordered.map(({ claimId }) => claimId);
    // Proof: fabricating missing stamps returned a partial HTTP 200.
    const stamps = await claims.listStampedByIds(projectId, ids);
    const stamped = new Map(stamps.map((stamp) => [stamp.id, stamp]));
    // Proof: allowing a duplicate stamp made a contradictory store response return HTTP 200.
    if (stamped.size !== ids.length || stamps.length !== ids.length)
      throw new Error(`holding project ${projectId} has missing or duplicate claim stamps`);
    // Proof: collapsing details by leaf lost one of the two actual claim IDs.
    const holdings = ordered.map((row) => matchHoldingStamp(row, stamped.get(row.claimId)));
    visible.push({
      project: { projectId, name: project.name, restricted: project.restricted, units },
      holdings,
    });
  }
  // Proof: including denied IDs here failed the argument assertion while the redacted body held.
  const ids = [
    ...new Set(visible.flatMap(({ holdings }) => holdings.map(({ personId }) => personId))),
  ].sort();
  const names = await readHolderNames(directory, access, ids);
  return {
    ok: true,
    value: {
      resourceId,
      directoryCapacity,
      occupied,
      free: directoryCapacity === null ? null : directoryCapacity - occupied,
      projects: visible.map(({ project, holdings }) => ({
        ...project,
        claims: holdings.map((stamp) => ({
          claimId: stamp.id,
          // Proof: substituting the person ID for a missing name returned a partial HTTP 200.
          personName: nameOccupancyHolder(stamp, names).name,
          personId: stamp.personId,
          runId: stamp.runId,
          workItemId: stamp.workItemId,
          claimedAt: stamp.claimedAt,
          leaseExpiresAt: stamp.leaseExpiresAt,
          // Proof: an unconditional claimant_or_admin label failed the restricted release scenario.
          releasableBy: project.restricted ? 'claimant' : 'claimant_or_admin',
        })),
      })),
    },
  };
}

/** Orders opaque IDs by their code units, including canonically equivalent strings. */
function compareIds(left: string, right: string): number {
  // Proof: locale order failed the mixed-case and normalization-distinct inventory case.
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Each claim can hold the requested resource once, under its own verified origin. */
function groupHoldingClaims(
  rows: readonly OrganizationOccupancyRow[],
  resourceId: string,
  organizationId: string,
): Map<string, OrganizationOccupancyRow[]> {
  const projects = new Map<string, OrganizationOccupancyRow[]>();
  const seen = new Map<string, OrganizationOccupancyRow>();
  for (const row of rows) {
    // Proof: accepting a foreign-origin row made the mounted corrupt read return HTTP 200.
    if (row.resourceId !== resourceId || row.organizationId !== organizationId)
      throw new Error(`holding claim ${row.claimId} is outside the observed resource`);
    const previous = seen.get(row.claimId);
    if (previous !== undefined) {
      // Proof: ignoring contradictory claimants made the conflicting-row read return HTTP 200.
      if (
        previous.projectId !== row.projectId ||
        previous.workItemId !== row.workItemId ||
        previous.personId !== row.personId ||
        previous.runId !== row.runId ||
        previous.units !== row.units
      )
        throw new Error(`holding claim ${row.claimId} has conflicting rows`);
      continue;
    }
    seen.set(row.claimId, row);
    const group = projects.get(row.projectId) ?? [];
    group.push(row);
    projects.set(row.projectId, group);
  }
  return projects;
}

/** A visible holding and its stamp must be two reads of the same claim. */
function matchHoldingStamp(
  row: OrganizationOccupancyRow,
  stamp: StampedClaim | undefined,
): StampedClaim {
  // Proof: removing either instant check let the adapter return that malformed stored value.
  if (
    stamp?.workItemId !== row.workItemId ||
    stamp.personId !== row.personId ||
    stamp.runId !== row.runId ||
    !Number.isSafeInteger(stamp.claimedAt) ||
    (stamp.leaseExpiresAt !== null && !Number.isSafeInteger(stamp.leaseExpiresAt))
  )
    throw new Error(`holding claim ${row.claimId} has no matching stamp`);
  return stamp;
}
