/** Stable obligations of the original operation; ownership is resolved again when replay is admitted. */
export type ReplayRequirement =
  | {
      readonly permission: 'package.write' | 'package.manage_settings' | 'package.claim_for_others';
      readonly target: { readonly kind: 'work_package'; readonly workPackageId: string };
    }
  | {
      readonly permission: 'project.manage_budgets';
      readonly target: { readonly kind: 'budget_owner'; readonly workPackageId: string };
    };

export type ReplayPermission = ReplayRequirement['permission'];

/** Version 1 is a permission-policy contract; changing obligations requires an explicit version compatibility decision. */
export interface ReplayAuthorization {
  readonly version: 1;
  readonly requirements: readonly ReplayRequirement[];
}

function isReplayPermission(permission: unknown): permission is ReplayPermission {
  return (
    permission === 'package.write' ||
    permission === 'package.manage_settings' ||
    permission === 'package.claim_for_others' ||
    permission === 'project.manage_budgets'
  );
}

/** Emits detached requirements at the original operation, before contributing recordings collapse into a batch. */
export function createReplayAuthorization(
  workPackageId: string,
  permissions: readonly ReplayPermission[],
  relatedPackageIds: readonly string[],
): ReplayAuthorization {
  if (permissions.length === 0) throw new Error('an original recording has no replay permission');
  const requirements: ReplayRequirement[] = permissions.map((permission) =>
    permission === 'project.manage_budgets'
      ? { permission, target: { kind: 'budget_owner', workPackageId } }
      : { permission, target: { kind: 'work_package', workPackageId } },
  );
  for (const relatedId of new Set(relatedPackageIds)) {
    if (relatedId === workPackageId) continue;
    requirements.push({
      permission: 'package.write',
      target: { kind: 'work_package', workPackageId: relatedId },
    });
  }
  return { version: 1, requirements };
}

/** Validates present trusted provenance. Absence is modeled separately by the journal decoder; malformed presence never becomes legacy. */
export function readReplayAuthorization(value: unknown): ReplayAuthorization {
  // Proof: accepting an unknown policy version replayed its metadata; `present unknown replay provenance`
  // (command-permission.controller.db.test.ts) failed with the fault and passed restored, 2026-11-09.
  // Proof: replay-null-diagnostic fault failed 'malformed replay provenance null presence' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
  if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1)
    throw new Error('journal replay authorization has an unsupported policy version');
  // Proof: accepting an empty requirement set replayed the row in 'malformed replay provenance empty requirement set'; fault/restored pass, 2026-11-09.
  if (
    !('requirements' in value) ||
    !Array.isArray(value.requirements) ||
    value.requirements.length === 0
  )
    throw new Error('journal replay authorization has no requirements');
  const requirements = value.requirements.map((requirement: unknown): ReplayRequirement => {
    // Proof: replay-known-permission fault failed 'malformed replay provenance unknown permission' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
    if (
      typeof requirement !== 'object' ||
      requirement === null ||
      !('permission' in requirement) ||
      !isReplayPermission(requirement.permission)
    )
      throw new Error('journal replay authorization names an unsupported permission');
    if (
      !('target' in requirement) ||
      typeof requirement.target !== 'object' ||
      requirement.target === null ||
      !('kind' in requirement.target) ||
      !('workPackageId' in requirement.target) ||
      // Proof: replay-nonempty-anchor fault failed 'malformed replay provenance empty package anchor' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
      typeof requirement.target.workPackageId !== 'string' ||
      requirement.target.workPackageId.trim().length === 0
    )
      throw new Error('journal replay authorization has a malformed package anchor');
    const { permission, target } = requirement;
    const workPackageId = requirement.target.workPackageId;
    if (permission === 'project.manage_budgets') {
      // Proof: accepting a package anchor replayed the row in 'malformed replay provenance budget with package anchor'; fault/restored pass, 2026-11-09.
      if (target.kind !== 'budget_owner')
        throw new Error('a replay budget permission has no current-owner anchor');
      return { permission, target: { kind: 'budget_owner', workPackageId } };
    }
    // Proof: accepting a budget anchor replayed the row in 'malformed replay provenance package with budget anchor'; fault/restored pass, 2026-11-09.
    if (target.kind !== 'work_package')
      throw new Error('a replay package permission has no package anchor');
    return { permission, target: { kind: 'work_package', workPackageId } };
  });
  return { version: 1, requirements };
}
