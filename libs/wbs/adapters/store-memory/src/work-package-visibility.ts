import type { ResourceAccess, WorkPackage } from '@wbs/core';
import { accessSubjectOf, capOf } from '@wbs/core/ports/access-decisions';
import type { WorkPackageReadAccess } from '@wbs/core/ports/work-package-report-store';
import {
  BUILT_IN_ROLES,
  effectiveRoleOn,
  may,
  reachingGrantsOf,
  type StoredGrantRow,
} from '@wbs/domain';

import type { MemoryState } from './memory-stores';
import { readMemoryOrganizationActivation } from './package-creation-fixture';

/** Evaluates only the finite built-in role/grant state actually represented by this Source. */
function memoryEffectiveRole(
  epoch: MemoryState,
  access: Extract<ResourceAccess, { kind: 'scoped' }>,
  target: WorkPackage | null,
) {
  const subject = accessSubjectOf(access.principal),
    rows: StoredGrantRow[] = [];
  for (const grant of epoch.tables.workPackages.creation.grants.values()) {
    if (grant.organizationId !== access.scope.organizationId) continue;
    if (target === null && grant.scope.kind !== 'organization') continue;
    const scopeId =
      grant.scope.kind === 'organization'
        ? grant.organizationId
        : grant.scope.kind === 'work_package'
          ? grant.scope.workPackageId
          : grant.scope.projectId;
    if (
      (grant.scope.kind === 'project' && scopeId !== target?.projectId) ||
      (grant.scope.kind === 'work_package' && scopeId !== target?.id)
    )
      continue;
    let subjectId: string;
    if (subject.kind === 'credential') {
      if (
        grant.subject.kind !== 'machine_credential' ||
        grant.subject.credentialId !== subject.credentialId
      )
        continue;
      subjectId = grant.subject.credentialId;
    } else {
      if (grant.subject.kind === 'group')
        throw new Error('memory export does not represent selected access-group membership');
      if (grant.subject.kind === 'user') {
        if (grant.subject.userId !== subject.accountId) continue;
        subjectId = grant.subject.userId;
      } else if (grant.subject.kind === 'organization_members') subjectId = grant.organizationId;
      else continue;
    }
    const kind = epoch.tables.workPackages.creation.roles.get(grant.roleId);
    const definition = BUILT_IN_ROLES.find((role) => role.id === grant.roleId);
    if (definition === undefined)
      throw new Error('memory export does not represent selected custom role permissions');
    if (kind === undefined) throw new Error('memory export selected role is absent');
    if (kind !== definition.objectKind)
      throw new Error('memory export selected built-in kind is inconsistent');
    for (const permission of definition.permissions)
      rows.push({
        grantId: grant.id,
        scopeKind: grant.scope.kind,
        scopeId,
        subjectKind: grant.subject.kind,
        subjectId,
        roleId: grant.roleId,
        objectKind: kind,
        reachesRestricted: definition.reachesRestricted,
        permission,
      });
  }
  return effectiveRoleOn(
    reachingGrantsOf(rows),
    target === null
      ? { kind: 'organization' }
      : { kind: 'work_package', restricted: target.restricted },
    capOf(subject),
  );
}

/** Read grants for one already verified package. */
export function memoryExportReadable(
  epoch: MemoryState,
  access: Extract<ResourceAccess, { kind: 'scoped' }>,
  target: WorkPackage,
): boolean {
  return memoryEffectiveRole(epoch, access, target) !== null;
}

/** The admitted actor still holds membership and any credential ceiling in this epoch. */
export function memoryDirectoryRead(
  epoch: MemoryState,
  actorId: string,
  access: Extract<ResourceAccess, { kind: 'scoped' }>,
):
  | { readonly ok: true }
  | { readonly ok: false; readonly refusal: 'no_active_organization' | 'not_a_member' }
  | {
      readonly ok: false;
      readonly reason: 'forbidden';
      readonly permission: 'organization.manage_directory';
    } {
  if (
    readMemoryOrganizationActivation(epoch.tables.workPackages.creation.activation) !== 'activated'
  )
    return { ok: false, refusal: 'no_active_organization' };
  if (actorId !== access.principal.id || actorId !== access.scope.userId)
    throw new Error('organization read actor differs from its admitted scope');
  if (!epoch.tables.directory.organizationMembers.get(access.scope.organizationId)?.has(actorId))
    return { ok: false, refusal: 'not_a_member' };
  if (!epoch.tables.users.byId.has(actorId))
    throw new Error('memory directory member account is absent');
  const effective = memoryEffectiveRole(epoch, access, null);
  if (effective === null)
    throw new Error('memory organization access decision is unexpectedly null');
  return may(effective, 'organization.manage_directory')
    ? { ok: true }
    : { ok: false, reason: 'forbidden', permission: 'organization.manage_directory' };
}

/** Resolves one verified holding origin on the same committed or staged snapshot. */
export function mayReadMemoryWorkPackage(
  epoch: MemoryState,
  ...[origin, actorId, access]: Parameters<WorkPackageReadAccess['mayReadWorkPackageWithin']>
): boolean {
  const packages = epoch.tables.workPackages;
  if (
    (access.kind === 'legacy') !==
    (readMemoryOrganizationActivation(packages.creation.activation) === 'pre_activation')
  )
    throw new Error('holder access differs from its observed activation');
  if (access.kind === 'legacy') {
    if (!packages.workPackages.has(origin.id))
      throw new Error('observed holder has no work package');
    return true;
  }
  if (actorId !== access.scope.userId || actorId !== access.principal.id)
    throw new Error('holder actor differs from its admitted scope');
  if (origin.organizationId !== access.scope.organizationId) return false;
  const target = packages.workPackages.get(origin.id);
  if (
    target === undefined ||
    epoch.tables.organizationLimits.workPackageOrganization.get(origin.id) !==
      origin.organizationId ||
    packages.owning.get(origin.id) !== origin.organizationId ||
    packages.creation.projects.get(target.projectId)?.organizationId !== origin.organizationId
  )
    throw new Error('holding work package has no verified owner');
  if (!epoch.tables.directory.organizationMembers.get(origin.organizationId)?.has(actorId))
    return false;
  if (!epoch.tables.users.byId.has(actorId))
    throw new Error('memory holder member account is absent');
  // Proof: returning true gave the restricted holder to a viewer; the
  // current claim-store test failed before the direct grant was added.
  return memoryExportReadable(epoch, access, target);
}
