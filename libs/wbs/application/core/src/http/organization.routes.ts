import { changeMemberRole, removeMember } from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type {
  MembershipAdministered,
  MembershipAdministration,
} from '../ports/membership-administration';
import type { OrganizationAccess } from '../ports/organization-access';
import { bind, EMPTY, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/** A refused administration as its typed wire refusal. */
function refused(refusal: Extract<MembershipAdministered, { ok: false }>['refusal']) {
  switch (refusal) {
    case 'forbidden':
      return { ok: false, status: 403, body: { error: 'forbidden' } } as const;
    case 'not_found':
      return { ok: false, status: 404, body: { error: 'not_found' } } as const;
    case 'last_super_admin':
      return { ok: false, status: 409, body: { error: 'last_super_admin' } } as const;
  }
}

/**
 * Membership administration in the caller's active organization, which comes
 * only from the resolved session: the request names no organization. Before
 * activation there is no organization to administer, so the routes answer
 * `no_active_organization`.
 *
 * Proof: skipping the resolution made `refuses an unbound session and a
 * removed member` in `membership-organization.controller.db.test.ts` answer
 * `forbidden` instead of `no_active_organization`, and administering under
 * legacy access made `has no organization to administer` answer 200;
 * watched 2026-09-27.
 */
export function organizationRoutes(
  organizations: OrganizationAccess,
  memberships: MembershipAdministration,
  clock: Pick<Clock, 'now'>,
) {
  return [
    bind(
      changeMemberRole,
      async ({ params, body, principal }): Promise<HttpReply<typeof changeMemberRole>> => {
        const resolved = await organizations.resolve(principal.id);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const outcome = await memberships.administer(
          resolved.access.scope.organizationId,
          principal.id,
          params.userId,
          body.role,
          { at: clock.now(), by: principal.id },
        );
        if (!outcome.ok) return refused(outcome.refusal);
        if (outcome.membership === null) {
          throw new Error('a role change answered with a removed membership');
        }
        return { ok: true, status: 200, body: { membership: outcome.membership } };
      },
    ),
    bind(removeMember, async ({ params, principal }): Promise<HttpReply<typeof removeMember>> => {
      const resolved = await organizations.resolve(principal.id);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
      const outcome = await memberships.administer(
        resolved.access.scope.organizationId,
        principal.id,
        params.userId,
        null,
        { at: clock.now(), by: principal.id },
      );
      if (!outcome.ok) return refused(outcome.refusal);
      return { ok: true, status: 204, body: EMPTY };
    }),
  ] as const;
}
