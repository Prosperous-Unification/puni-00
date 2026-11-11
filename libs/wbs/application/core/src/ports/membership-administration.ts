import type { GrantProvenance, Permission } from '@wbs/domain';

import type { AuditedAct } from './organization-audit';
import type { SecurityPrincipal } from './security-principal';

/** The explicit owning entrypoint of a membership removal. */
export type MembershipRemovalSource = 'route' | 'self_leave';

/** What one current-grant membership removal answered. */
export type MembershipAdministered =
  | { readonly ok: true; readonly membership: null }
  | {
      readonly ok: false;
      readonly refusal: 'forbidden' | 'not_found' | 'last_super_admin';
      readonly permission?: Permission;
    };

/** Organization-kind grants at organization scope, never a strongest-role label. */
export interface MemberEffectiveRole {
  readonly permissions: readonly Permission[];
  readonly via: readonly GrantProvenance[];
}

/** One member and their account's access, without addressed package identifiers. */
export interface MemberSummary {
  readonly userId: string;
  readonly username: string;
  readonly email: string | null;
  readonly effectiveRole: MemberEffectiveRole | null;
  /** Distinct grants at all scopes reaching this account, excluding credentials. */
  readonly grantCount: number;
  readonly createdAt: number;
}

/** What one current-grant member listing answered. */
export type MembersListed =
  | { readonly ok: true; readonly members: readonly MemberSummary[] }
  | {
      readonly ok: false;
      readonly refusal: 'onboarding_inactive' | 'forbidden';
      readonly permission?: Permission;
    };

/** Current membership authorization and effects share the operation owner's connection. */
export interface MembershipAdministration {
  /**
   * Removes a target with manage_members and, for any direct organization-kind user
   * grant, manage_organization_roles. Deletes direct grants and group memberships,
   * appending one aggregate audit atomically. Actual authenticated authority is retained
   * before the queue; the legacy membership role conveys no permission.
   */
  administer(
    organizationId: string,
    principal: SecurityPrincipal,
    targetUserId: string,
    act: AuditedAct,
    source: MembershipRemovalSource,
  ): Promise<MembershipAdministered>;
  /** Authorizes organization.read as the actual caller, then summarizes target accounts. */
  listMembers(organizationId: string, principal: SecurityPrincipal): Promise<MembersListed>;
}
