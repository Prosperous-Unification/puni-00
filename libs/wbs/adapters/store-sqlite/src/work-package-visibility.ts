import type { WorkPackageReadAccess } from '@wbs/core/ports/work-package-report-store';
import { authorizePackageAt } from '@wbs/core/service/authorize';
import { eq } from 'drizzle-orm';

import { AccessDecisionRepository } from './access-decisions';
import type { Drizzle } from './db';
import { readOrganizationActivation } from './organization-activation';
import { workPackage } from './schema';
import { readSettingTargetIn } from './settings';

/** Resolves a verified holding origin on the caller's observation or command writer. */
export async function mayReadSqliteWorkPackage(
  db: Drizzle,
  ...[origin, actorId, access]: Parameters<WorkPackageReadAccess['mayReadWorkPackageWithin']>
): Promise<boolean> {
  if ((access.kind === 'legacy') !== (readOrganizationActivation(db) === 'pre_activation'))
    throw new Error('holder access differs from its observed activation');
  if (access.kind === 'legacy') {
    const target = db
      .select({ id: workPackage.id })
      .from(workPackage)
      .where(eq(workPackage.id, origin.id))
      .get();
    if (target === undefined) throw new Error('observed holder has no work package');
    return true;
  }
  if (actorId !== access.scope.userId || actorId !== access.principal.id)
    throw new Error('holder actor differs from its admitted scope');
  if (origin.organizationId !== access.scope.organizationId) return false;
  const decisions = new AccessDecisionRepository(db);
  const target = readSettingTargetIn(
    db,
    { level: 'work_package', id: origin.id },
    origin.organizationId,
  );
  if (target === null) throw new Error('holding work package has no verified owner');
  // Proof: returning true gave the restricted holder to a viewer; the
  // current claim-store test failed before the direct grant was added.
  return (await authorizePackageAt(decisions, access, target, actorId, 'package.read')).ok;
}
