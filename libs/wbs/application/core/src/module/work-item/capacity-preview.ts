import {
  type CapacityLimitCrossed,
  occupancyByResource,
  type Permission,
  refuseDirectoryCapacity,
} from '@wbs/domain';

import type { ClaimStore } from '../../ports/claim-store';
import type { DirectoryStore } from '../../ports/directory-store';
import type { RefusedOrganizationAccess, ResourceAccess } from '../../ports/organization-access';
import type { OrganizationLimitGauge } from '../../ports/organization-limits';
import type { WorkPackageReadAccess } from '../../ports/work-package-report-store';
import type { WorkPackageStore } from '../../ports/work-package-store';
import { workPackageVisibility } from './shared-holders';

export type CapacityPreview =
  | {
      readonly ok: true;
      readonly value: {
        readonly resourceId: string;
        readonly before: number | null;
        readonly after: number | null;
        readonly workPackages: { workPackageId: string; name: string; units: number }[];
        readonly hiddenWorkPackages: { count: number; units: number };
        readonly free: number | null;
        readonly refusal: ({ readonly error: 'capacity_limit' } & CapacityLimitCrossed) | null;
      };
    }
  | {
      readonly ok: false;
      readonly reason: 'forbidden' | 'not_found';
      readonly permission?: Permission;
    }
  | RefusedOrganizationAccess;

interface PreviewStores {
  readonly directory: Pick<DirectoryStore, 'listInOrganization' | 'usageOfResource'>;
  readonly claims: Pick<ClaimStore, 'organizationOccupancyOf'>;
  readonly limits: Pick<OrganizationLimitGauge, 'readDirectoryCapacityLimit'> | undefined;
  readonly workPackages: Pick<WorkPackageStore, 'findInOrganization'> & WorkPackageReadAccess;
}

/** Reads demand, holdings and the unconfirmed write's decision after directory authorization. */
export async function previewCapacity(
  acquire: () => PreviewStores | Promise<PreviewStores>,
  resourceId: string,
  units: number | null,
  actorId: string,
  access: Extract<ResourceAccess, { kind: 'scoped' }>,
  read: <T>(query: () => Promise<T>) => Promise<T> = (query) => query(),
): Promise<CapacityPreview> {
  const { scope } = access;
  if (actorId !== scope.userId || actorId !== access.principal.id)
    throw new Error('organization read actor differs from its admitted scope');
  // Proof: acquiring the Memory snapshot before refusing a member kept the
  // preview waiting for the held write turn in the composed-source test.
  const { directory, claims, limits, workPackages: catalog } = await acquire();
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
      ...rows.map(({ workPackageId }) => workPackageId),
      ...usage.capacities.map(({ workPackageId }) => workPackageId),
      ...usage.rows.workPackages.map(({ id }) => id),
    ]),
  ].sort();
  const decide = workPackageVisibility(catalog, actorId, access);
  const workPackages: { workPackageId: string; name: string; units: number }[] = [];
  let hiddenCount = 0;
  let hiddenUnits = 0;
  let occupied = 0;
  for (const id of ids) {
    const held =
      occupancyByResource(rows.filter((row) => row.workPackageId === id)).find(
        (row) => row.resourceId === resourceId,
      )?.occupied ?? 0;
    occupied += held;
    if (await read(() => decide({ id, organizationId: scope.organizationId }))) {
      const workPackage = await read(() => catalog.findInOrganization(id, scope.organizationId));
      if (workPackage === null)
        throw new Error(`work package ${id} disappeared from the observed organization`);
      workPackages.push({ workPackageId: id, name: workPackage.name, units: held });
    } else {
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
      workPackages,
      hiddenWorkPackages: { count: hiddenCount, units: hiddenUnits },
      // Proof: preview-free-visible-only answered 14 instead of -2 in the mounted preview.
      free: units === null ? null : units - occupied,
      // Proof: always answering null hid the precise 65-over-64 refusal in the mounted preview.
      refusal: refusal === null ? null : { error: 'capacity_limit', ...refusal },
    },
  };
}
