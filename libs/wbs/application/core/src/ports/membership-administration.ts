import type { OrganizationRole } from '@wbs/domain';

import type { AuditedAct } from './organization-audit';

/** The explicit owning entrypoint of a membership removal. */
export type MembershipRemovalSource = 'route' | 'self_leave';

/** What one membership administration answered. */
export type MembershipAdministered =
  | {
      readonly ok: true;
      /** The membership as it now stands; null when it was removed. */
      readonly membership: { readonly userId: string; readonly role: OrganizationRole } | null;
    }
  | {
      readonly ok: false;
      /**
       * - `forbidden`: the actor's current role may not make this change.
       * - `not_found`: the target is not a member of the organization.
       * - `last_super_admin`: the change would leave no super-admin.
       */
      readonly refusal: 'forbidden' | 'not_found' | 'last_super_admin';
    };

/** One member of an organization as an administrator sees it. */
export interface MemberSummary {
  readonly userId: string;
  readonly username: string;
  /** Null for an account that has never recorded an address. */
  readonly email: string | null;
  readonly role: OrganizationRole;
  readonly createdAt: number;
}

/** What one member listing answered. */
export type MembersListed =
  | { readonly ok: true; readonly members: readonly MemberSummary[] }
  | {
      readonly ok: false;
      /**
       * - `onboarding_inactive`: organization administration is not activated.
       * - `forbidden`: the actor is not currently an admin or super-admin there.
       */
      readonly refusal: 'onboarding_inactive' | 'forbidden';
    };

/**
 * Changes or removes organization memberships under the role matrix.
 *
 * The actor's role, the target's role and the count of remaining
 * super-admins are all read inside the same immediate transaction as the
 * write, so a concurrent promotion, demotion or removal cannot slip between a
 * check and the change it authorizes.
 */
export interface MembershipAdministration {
  /**
   * Sets `targetUserId`'s role in `organizationId` to `requested`, or removes
   * the membership when `requested` is null, when `actorId`'s current role
   * there permits it. A removal cleans up direct user grants and access-group
   * memberships and records one aggregate audit in that same owner. `source`
   * names the owning entrypoint, even when an admin route targets its actor.
   * The legacy role matrix remains until permission task2.5.
   */
  administer(
    organizationId: string,
    actorId: string,
    targetUserId: string,
    requested: OrganizationRole | null,
    act: AuditedAct,
    source: MembershipRemovalSource,
  ): Promise<MembershipAdministered>;

  /**
   * Lists `organizationId`'s members when `actorId` is currently an admin or
   * super-admin there, reading activation and the actor's role in the same
   * transaction as the rows.
   */
  listMembers(organizationId: string, actorId: string): Promise<MembersListed>;
}
