import type { OrganizationRole } from '@wbs/domain';

import type { WriteStamp } from './write-stamp';

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
   * there permits it.
   */
  administer(
    organizationId: string,
    actorId: string,
    targetUserId: string,
    requested: OrganizationRole | null,
    stamp: WriteStamp,
  ): Promise<MembershipAdministered>;
}
