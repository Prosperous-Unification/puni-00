/** What a role or a grant scope is attached to, broadest first (`wbs-permissions` P1, P8). */
export const ACCESS_OBJECT_KINDS = ['organization', 'project', 'work_package'] as const;

export type AccessObjectKind = (typeof ACCESS_OBJECT_KINDS)[number];

/**
 * A permission's evaluation kind (`wbs-custom-permissions` CP16): an object kind,
 * or `any` for navigation, which every role of every kind may hold.
 */
export type PermissionKind = AccessObjectKind | 'any';

/**
 * The permission vocabulary with its kind metadata: `wbs-permissions`
 * "Permission vocabulary" and the rows of `permission-matrix.md`. Role
 * validation reads `kind`, never the id's prefix (CP16), so `organization.navigate`
 * is `any` despite its name. Tests compare these ids with the matrix's, never
 * a count (CP4); a new permission is a new entry plus its built-in seed rows.
 */
export const PERMISSIONS = [
  { id: 'organization.navigate', kind: 'any' },
  { id: 'organization.read', kind: 'organization' },
  { id: 'organization.manage_members', kind: 'organization' },
  { id: 'organization.manage_directory', kind: 'organization' },
  { id: 'organization.manage_spaces', kind: 'organization' },
  { id: 'organization.create_project', kind: 'organization' },
  { id: 'organization.manage_access', kind: 'organization' },
  { id: 'organization.manage_organization_roles', kind: 'organization' },
  { id: 'organization.manage_security', kind: 'organization' },
  { id: 'organization.manage_capacity_mode', kind: 'organization' },
  { id: 'organization.recover_restricted', kind: 'organization' },
  { id: 'organization.manage_settings', kind: 'organization' },
  { id: 'project.read', kind: 'project' },
  { id: 'project.manage_settings', kind: 'project' },
  { id: 'project.manage_budgets', kind: 'project' },
  { id: 'project.manage_dependencies', kind: 'project' },
  { id: 'project.manage_packages', kind: 'project' },
  { id: 'project.grant', kind: 'project' },
  { id: 'package.read', kind: 'work_package' },
  { id: 'package.write', kind: 'work_package' },
  { id: 'package.manage_settings', kind: 'work_package' },
  { id: 'package.claim_for_others', kind: 'work_package' },
] as const satisfies readonly { readonly id: string; readonly kind: PermissionKind }[];

export type Permission = (typeof PERMISSIONS)[number]['id'];

const KIND_OF_PERMISSION: ReadonlyMap<string, PermissionKind> = new Map(
  PERMISSIONS.map(({ id, kind }) => [id, kind]),
);

/** Whether a string read from storage or a request names a permission of {@link PERMISSIONS}. */
export function isPermission(candidate: string): candidate is Permission {
  return KIND_OF_PERMISSION.has(candidate);
}

/** The {@link PERMISSIONS} entry's kind; the vocabulary is closed, so every id has one. */
export function kindOfPermission(permission: Permission): PermissionKind {
  const kind = KIND_OF_PERMISSION.get(permission);
  if (kind === undefined) throw new Error(`permission ${permission} has no kind metadata`);
  return kind;
}

const BREADTH: Readonly<Record<AccessObjectKind, number>> = {
  organization: 3,
  project: 2,
  work_package: 1,
};

/**
 * Whether a role declared on `objectKind` may hold `permission` (CP7, CP16):
 * the permission's metadata kind is `any`, the role's kind or a kind beneath it,
 * so a project role may hold `package.*` and never an organization permission.
 * Read from {@link PERMISSIONS}' metadata, never the id's prefix.
 *
 * Proof: reading the kind from the id's prefix instead (so
 * `organization.navigate` counts as organization-kind) failed `every seeded
 * row satisfies roleMayHold` in `access-role.test.ts` on `package-manager`;
 * watched 2026-10-25.
 */
export function roleMayHold(objectKind: AccessObjectKind, permission: Permission): boolean {
  const kind = kindOfPermission(permission);
  return kind === 'any' || BREADTH[kind] <= BREADTH[objectKind];
}

/**
 * The nine built-in roles and their sets, the seed `add_access_grants` writes
 * into `access_role` and `access_role_permission` (`wbs-permissions` E7,
 * `wbs-custom-permissions` CP7). `level` is display order only (CP1); no
 * decision reads it. `access-role.test.ts` and `access-grant-migration.db.test.ts`
 * hold this list and the migration's rows equal to `permission-matrix.md` cell by cell.
 */
export const BUILT_IN_ROLES = [
  {
    id: 'org-super-admin',
    objectKind: 'organization',
    level: 5,
    permissions: [
      'organization.navigate',
      'organization.read',
      'organization.manage_members',
      'organization.manage_directory',
      'organization.manage_spaces',
      'organization.create_project',
      'organization.manage_access',
      'organization.manage_organization_roles',
      'organization.manage_security',
      'organization.manage_capacity_mode',
      'organization.recover_restricted',
      'organization.manage_settings',
      'project.read',
      'project.manage_settings',
      'project.manage_budgets',
      'project.manage_dependencies',
      'project.manage_packages',
      'project.grant',
      'package.read',
      'package.write',
      'package.manage_settings',
      'package.claim_for_others',
    ],
  },
  {
    id: 'org-admin',
    objectKind: 'organization',
    level: 4,
    permissions: [
      'organization.navigate',
      'organization.read',
      'organization.manage_members',
      'organization.manage_directory',
      'organization.manage_spaces',
      'organization.create_project',
      'organization.manage_access',
      'organization.manage_settings',
      'project.read',
      'project.manage_settings',
      'project.manage_budgets',
      'project.manage_dependencies',
      'project.manage_packages',
      'project.grant',
      'package.read',
      'package.write',
      'package.manage_settings',
      'package.claim_for_others',
    ],
  },
  {
    id: 'org-viewer',
    objectKind: 'organization',
    level: 1,
    permissions: ['organization.navigate', 'organization.read', 'project.read', 'package.read'],
  },
  {
    id: 'project-manager',
    objectKind: 'project',
    level: 3,
    permissions: [
      'organization.navigate',
      'project.read',
      'project.manage_settings',
      'project.manage_budgets',
      'project.manage_dependencies',
      'project.manage_packages',
      'project.grant',
      'package.read',
      'package.write',
      'package.manage_settings',
      'package.claim_for_others',
    ],
  },
  {
    id: 'project-contributor',
    objectKind: 'project',
    level: 2,
    permissions: ['organization.navigate', 'project.read', 'package.read', 'package.write'],
  },
  {
    id: 'project-viewer',
    objectKind: 'project',
    level: 1,
    permissions: ['organization.navigate', 'project.read', 'package.read'],
  },
  {
    id: 'package-manager',
    objectKind: 'work_package',
    level: 3,
    permissions: [
      'organization.navigate',
      'package.read',
      'package.write',
      'package.manage_settings',
      'package.claim_for_others',
    ],
  },
  {
    id: 'package-contributor',
    objectKind: 'work_package',
    level: 2,
    permissions: ['organization.navigate', 'package.read', 'package.write'],
  },
  {
    id: 'package-viewer',
    objectKind: 'work_package',
    level: 1,
    permissions: ['organization.navigate', 'package.read'],
  },
] as const satisfies readonly {
  readonly id: string;
  readonly objectKind: AccessObjectKind;
  readonly level: 1 | 2 | 3 | 4 | 5;
  readonly permissions: readonly Permission[];
}[];

export type BuiltInRoleId = (typeof BUILT_IN_ROLES)[number]['id'];

function permissionsOfBuiltIn(id: BuiltInRoleId): readonly Permission[] {
  const role = BUILT_IN_ROLES.find((candidate) => candidate.id === id);
  if (role === undefined) throw new Error(`built-in role ${id} is not seeded`);
  return role.permissions;
}

/**
 * The machine boundary (`wbs-permissions` P12, `wbs-custom-permissions` CP8):
 * the union of the seeded `project-contributor` and `package-contributor` sets.
 * A `machine` or `consent` principal's effective set is intersected with it, so
 * no grant, manage or claim-for-others permission ever reaches an agent.
 *
 * Proof: adding `project.manage_budgets` to this union failed `a machine
 * principal never manages budgets, whatever its grant` in `access-role.test.ts`;
 * adding `package.claim_for_others` to `package-contributor`'s seed above failed
 * `a machine principal never claims for others, whatever its grant` and the
 * matrix cases; both watched 2026-10-25.
 */
export const CONTRIBUTOR_CAP: ReadonlySet<Permission> = new Set([
  ...permissionsOfBuiltIn('project-contributor'),
  ...permissionsOfBuiltIn('package-contributor'),
]);

/**
 * What an organization-scope `org-admin` or `org-super-admin` keeps on a
 * restricted work package (`wbs-custom-permissions` CP18): it reads, never writes.
 */
export const READ_ONLY: ReadonlySet<Permission> = new Set<Permission>([
  'organization.navigate',
  'project.read',
  'package.read',
]);

/** Who a grant names (`wbs-permissions` E7, P17). */
export const GRANT_SUBJECT_KINDS = [
  'user',
  'group',
  'organization_members',
  'machine_credential',
] as const;

export type GrantSubjectKind = (typeof GRANT_SUBJECT_KINDS)[number];

/**
 * What wrote a grant: the `add_access_grants` backfill, a grant route, an
 * invitation's initial grant, or a creation (P6). Only `backfill` rows let
 * that migration roll back.
 */
export const GRANT_ORIGINS = ['backfill', 'route', 'invitation', 'creation'] as const;

export type GrantOrigin = (typeof GRANT_ORIGINS)[number];

/** One grant's identity as every effective-set read reports it (`wbs-permissions` P14). */
export interface GrantProvenance {
  readonly scopeKind: AccessObjectKind;
  readonly scopeId: string;
  readonly subjectKind: GrantSubjectKind;
  readonly subjectId: string;
  readonly roleId: string;
}

/**
 * One reaching grant with its role's set, already validated against
 * {@link PERMISSIONS} and {@link roleMayHold} (CP9). `builtIn` is
 * `access_role.organization_id IS NULL`; a custom role never earns the
 * restricted-target admin read, whatever its name or set (CP18).
 */
export interface ReachingGrant extends GrantProvenance {
  readonly builtIn: boolean;
  readonly permissions: ReadonlySet<Permission>;
}

/** The target a decision is about, as far as the transformation needs it. */
export type GrantTarget =
  | { readonly kind: 'organization' }
  | { readonly kind: 'project' }
  | { readonly kind: 'work_package'; readonly restricted: boolean };

/** The three outcomes of {@link permissionsOnTarget}. */
export type GrantOnTarget =
  | { readonly outcome: 'unchanged'; readonly permissions: ReadonlySet<Permission> }
  | { readonly outcome: 'read_only'; readonly permissions: ReadonlySet<Permission> }
  | { readonly outcome: 'skipped' };

const RESTRICTED_TARGET_READERS: ReadonlySet<string> = new Set<BuiltInRoleId>([
  'org-admin',
  'org-super-admin',
]);

/**
 * P5 in sets (`wbs-custom-permissions` CP18). On a restricted work package an
 * organization-scope grant of the built-in `org-admin` or `org-super-admin`
 * held by anyone but the organization-members subject is intersected with
 * {@link READ_ONLY}; every other organization-scope grant is skipped, custom
 * organization roles included even when their set equals `org-admin`'s. A grant
 * naming the project or the package, and every grant on an unrestricted target,
 * is unchanged. Runs after row validation and before the cap.
 *
 * Proof: returning the built-in admin's set unchanged on a restricted target
 * failed `an org-admin reads a restricted work package and never writes it`;
 * admitting a custom organization role equal to `org-admin` failed `a custom
 * organization role equal to org-admin reads no restricted work package`; both
 * in `access-role.test.ts`, watched 2026-10-25.
 */
export function permissionsOnTarget(grant: ReachingGrant, target: GrantTarget): GrantOnTarget {
  if (target.kind !== 'work_package' || !target.restricted || grant.scopeKind !== 'organization')
    return { outcome: 'unchanged', permissions: grant.permissions };
  const readsAsAdmin =
    grant.builtIn &&
    RESTRICTED_TARGET_READERS.has(grant.roleId) &&
    grant.subjectKind !== 'organization_members';
  if (!readsAsAdmin) return { outcome: 'skipped' };
  return {
    outcome: 'read_only',
    permissions: new Set([...grant.permissions].filter((permission) => READ_ONLY.has(permission))),
  };
}

/**
 * One principal's permissions on one target (`wbs-custom-permissions` CP1):
 * the union of the reaching grants' sets after {@link permissionsOnTarget},
 * intersected with the cap, and the grants that contributed.
 */
export interface EffectiveRole {
  readonly permissions: ReadonlySet<Permission>;
  readonly via: readonly GrantProvenance[];
}

/**
 * Combines validated reaching grants into an {@link EffectiveRole}: each grant
 * transformed for the target, skipped ones dropped from `via`, the union
 * intersected with `cap` when the principal is a `machine` or `consent`
 * principal ({@link CONTRIBUTOR_CAP}); `cap` null means a person, uncapped (P12).
 */
export function combineGrants(
  grants: readonly ReachingGrant[],
  target: GrantTarget,
  cap: ReadonlySet<Permission> | null,
): EffectiveRole {
  const permissions = new Set<Permission>();
  const via: GrantProvenance[] = [];
  for (const grant of grants) {
    const onTarget = permissionsOnTarget(grant, target);
    if (onTarget.outcome === 'skipped') continue;
    const { scopeKind, scopeId, subjectKind, subjectId, roleId } = grant;
    via.push({ scopeKind, scopeId, subjectKind, subjectId, roleId });
    for (const permission of onTarget.permissions)
      if (cap === null || cap.has(permission)) permissions.add(permission);
  }
  return { permissions, via };
}

/**
 * The one decision every call site makes (`wbs-custom-permissions` CP1): set
 * membership. Null is "no grant reaches the target" (invisible), never a set.
 */
export function may(effective: EffectiveRole | null, permission: Permission): boolean {
  return effective?.permissions.has(permission) === true;
}

/**
 * Where a decision or a setting resolves, discriminated by level and ending at
 * the target's own level (`wbs-permissions` P13, P14; shared with
 * `wbs-work-packages`' `resolveSetting`). A project sits in one space or none.
 */
export type ScopeChain = OrganizationChain | SpaceChain | ProjectChain | WorkPackageChain;

export interface OrganizationChain {
  readonly level: 'organization';
  readonly organizationId: string;
}

export interface SpaceChain {
  readonly level: 'space';
  readonly organizationId: string;
  readonly spaceId: string;
}

export interface ProjectChain {
  readonly level: 'project';
  readonly organizationId: string;
  /** Null: an organization-level project (P14). */
  readonly spaceId: string | null;
  readonly projectId: string;
}

export interface WorkPackageChain {
  readonly level: 'work_package';
  readonly organizationId: string;
  readonly spaceId: string | null;
  readonly projectId: string;
  readonly workPackageId: string;
}

/**
 * A work package before the project entity exists (`wbs-permissions` P13):
 * until `wbs-work-packages` slice 2 a package is addressed by its organization
 * and its own id only. Task 3.4 removes it.
 */
export interface InterimPackageChain {
  readonly level: 'work_package';
  readonly organizationId: string;
  readonly workPackageId: string;
}
