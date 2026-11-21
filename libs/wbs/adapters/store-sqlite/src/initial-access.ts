import { accessSubjectOf, authorize, capOf, type SecurityPrincipal } from '@wbs/core';
import {
  INITIAL_ACCESS_ROLES,
  type InitialAccess,
  type InitialAccessRole,
  isPermission,
  type Permission,
  PermissionKindRow,
  PERMISSIONS,
  roleMayHold,
  UnknownPermissionRow,
} from '@wbs/domain';
import { type } from '@wbs/validation';
import { sql } from 'drizzle-orm';

import { AccessDecisionRepository, readGrantComparisonIn } from './access-decisions';
import type { Drizzle } from './db';

/** Finite personal admission or grant denial; callers preserve its named permission. */
export type InitialAccessRefusal =
  | { readonly refusal: 'insufficient_scope' }
  | { readonly refusal: 'forbidden'; readonly permission: Permission };

const initialAccessSchema = type
  .or(
    type({ kind: "'none'" }),
    type({ kind: "'role'", roleId: type.enumerated(...INITIAL_ACCESS_ROLES) }),
  )
  /* Proof: initial-selection-schema: removed/changed production boundary.
   * throws on stored initial selection none-extra without consuming or granting
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  .onDeepUndeclaredKey('reject');

/** Validates the trusted selection once; compatibility role is never an authority fallback. */
export function decodeInitialAccess(encoded: string | null): InitialAccess {
  /* Proof: initial-missing-selection: explicit trusted-state diagnostic; no absent-value default.
   * reports a missing stored initial selection through its actual reader
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  if (encoded === null) throw new Error('initial access selection is missing');
  let selection: unknown;
  try {
    selection = JSON.parse(encoded);
  } catch (cause) {
    if (cause instanceof SyntaxError)
      throw new Error('initial access selection is malformed JSON', { cause });
    throw cause;
  }
  const checked = initialAccessSchema(selection);
  if (checked instanceof type.errors) throw new Error('initial access selection is malformed');
  return checked;
}

/** Explicit none is stored distinctly from outgoing-writer omission. */
export function encodeInitialAccess(selection: InitialAccess): string {
  return JSON.stringify(selection);
}

/** Schema compatibility for outgoing binaries, which still interpret this column; incoming code never grants from it. */
export function projectLegacyOfferRole(selection: InitialAccess): 'admin' | 'member' | 'viewer' {
  if (selection.kind === 'none') return 'viewer';
  switch (selection.roleId) {
    case 'org-admin':
      return 'admin';
    case 'project-contributor':
      return 'member';
    case 'org-viewer':
    case 'project-viewer':
      return 'viewer';
  }
}

/** Catalogue kind is known before any grant read, including for early credential-cap refusal. */
function readGrantPermission(
  roleId: InitialAccessRole,
): 'organization.manage_access' | 'organization.manage_organization_roles' {
  return roleId === 'org-admin' || roleId === 'org-viewer'
    ? 'organization.manage_organization_roles'
    : 'organization.manage_access';
}

/** Personal-only admission precedes the fixed cap, then current manage_members on this borrowed connection. */
export async function readMembershipRefusalIn(
  db: Drizzle,
  organizationId: string,
  principal: SecurityPrincipal,
  capPermission: Permission,
): Promise<InitialAccessRefusal | null> {
  /* Proof: initial-personal-precedence: removed/changed production boundary.
   * refuses delegated before an unreadable grant dependency at invitation-issue
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  if (principal.delegation !== undefined) return { refusal: 'insufficient_scope' };
  const cap = capOf(accessSubjectOf(principal));
  /* Proof: initial-helper-cap: removed/changed production boundary.
   * retains queued credential authentication at invitation-issue
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  if (cap !== null && !cap.has(capPermission))
    return { refusal: 'forbidden', permission: capPermission };
  const decision = await authorize(
    new AccessDecisionRepository(db),
    principal,
    { kind: 'organization', organizationId },
    'organization.manage_members',
  );
  /* Proof: initial-helper-members: removed/changed production boundary.
   * requires manage_members even when a legacy admin issues no initial access
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  return decision.ok ? null : { refusal: 'forbidden', permission: 'organization.manage_members' };
}

/** Current stored catalogue sets, validated before comparing or issuing durable authority. */
function readInitialRolePermissionsIn(
  db: Drizzle,
  roleId: InitialAccessRole,
): ReadonlySet<Permission> {
  const rows = db.all<{ kind: string; reaches_restricted: number; permission: string | null }>(
    sql`SELECT r.object_kind AS kind,r.reaches_restricted,p.permission FROM access_role r LEFT JOIN access_role_permission p ON p.role_id=r.id WHERE r.id=${roleId} ORDER BY p.permission`,
  );
  /* Proof: initial-role-missing: removed/changed production boundary.
   * throws on offered initial role metadata missing before persisting an offer
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  if (rows.length === 0) throw new Error('initial access role is missing: ' + roleId);
  const kind = roleId === 'org-admin' || roleId === 'org-viewer' ? 'organization' : 'project';
  const permissions = new Set<Permission>();
  for (const row of rows) {
    /* Proof: initial-role-flag: removed/changed production boundary.
     * throws on offered initial role metadata invalid-flag before persisting an offer
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    if (row.reaches_restricted !== 0 && row.reaches_restricted !== 1)
      throw new Error('initial access role has an invalid restricted flag: ' + roleId);
    /* Proof: initial-role-kind: removed/changed production boundary.
     * throws on offered initial role metadata wrong-kind before persisting an offer
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    if (row.kind !== kind) throw new Error('initial access role has an unexpected kind: ' + roleId);
    const permission = row.permission;
    /* Proof: initial-role-empty: explicit trusted-role diagnostic; downstream unknown-value rejection remains.
     * throws on offered initial role metadata empty before persisting an offer
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    if (permission === null) throw new Error('initial access role has no permissions: ' + roleId);
    /* Proof: initial-role-unknown-permission: closed permission-vocabulary diagnostic before kind projection.
     * throws on offered initial role metadata unknown-permission before persisting an offer
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    if (!isPermission(permission)) throw new UnknownPermissionRow(roleId, permission);
    /* Proof: initial-role-permission-kind: removed/changed production boundary.
     * rejects a permission outside the offered role catalogue kind
     * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
    if (!roleMayHold(kind, permission)) throw new PermissionKindRow(roleId, kind, permission);
    permissions.add(permission);
  }
  return permissions;
}

/**
 * P11 authority for issue/approval and actual initial-grant insertion. The actual
 * principal is admitted before raw comparison; full ancestor sets remain uncapped
 * and untransformed only for subset comparison. Missing permissions follow canonical
 * PERMISSIONS order. A durable offer's personally issued account is projected only
 * by its acceptance owner after validating the stored issuer provenance.
 */
export async function readInitialAccessRefusalIn(
  db: Drizzle,
  organizationId: string,
  principal: SecurityPrincipal,
  selection: InitialAccess,
): Promise<InitialAccessRefusal | null> {
  const roleId = selection.kind === 'role' ? selection.roleId : null;
  const permission = roleId === null ? 'organization.manage_members' : readGrantPermission(roleId);
  const membership = await readMembershipRefusalIn(db, organizationId, principal, permission);
  if (membership !== null) return membership;
  if (roleId === null) return null;
  const decision = await authorize(
    new AccessDecisionRepository(db),
    principal,
    { kind: 'organization', organizationId },
    permission,
  );
  /* Proof: initial-helper-kind-permission: removed/changed production boundary.
   * requires the grant permission for initial org-viewer
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  if (!decision.ok) return { refusal: 'forbidden', permission };
  const offered = readInitialRolePermissionsIn(db, roleId);
  const held = readGrantComparisonIn(db, principal, organizationId);
  const missing = PERMISSIONS.find(({ id }) => offered.has(id) && !held.has(id));
  /* Proof: initial-helper-subset: removed/changed production boundary.
   * refuses the first permission missing from the full initial-role comparison set
   * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
  return missing === undefined ? null : { refusal: 'forbidden', permission: missing.id };
}
