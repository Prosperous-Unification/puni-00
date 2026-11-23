import { listMembers, removeMember } from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type {
  MembershipAdministered,
  MembershipAdministration,
} from '../ports/membership-administration';
import type { OrganizationAccess } from '../ports/organization-access';
import { retainSecurityPrincipal } from '../ports/security-principal';
import { bind, EMPTY, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/** A refused administration as its typed wire refusal. */
function refused(outcome: Extract<MembershipAdministered, { ok: false }>) {
  switch (outcome.refusal) {
    case 'forbidden':
      return {
        ok: false,
        status: 403,
        body: {
          error: 'forbidden',
          ...(outcome.permission === undefined ? {} : { permission: outcome.permission }),
        },
      } as const;
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
    bind(listMembers, async ({ principal }): Promise<HttpReply<typeof listMembers>> => {
      // Proof: 2026-09-29, bypassing this guard failed `refuses delegated
      // onboarding discovery and writes` at the member list.
      if (principal.delegation !== undefined)
        return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
      // Proof: member-list-route-snapshot: removed/broken boundary failed `retains the membership list principal before resolver alias changes`; named assertion RED and restored GREEN (task-2.5 guard-faults).
      const actor = retainSecurityPrincipal(principal);
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
      const listed = await memberships.listMembers(resolved.access.scope.organizationId, actor);
      if (!listed.ok) {
        switch (listed.refusal) {
          case 'onboarding_inactive':
            return { ok: false, status: 403, body: { error: 'onboarding_inactive' } };
          case 'forbidden':
            return {
              ok: false,
              status: 403,
              body: {
                error: 'forbidden',
                ...(listed.permission === undefined ? {} : { permission: listed.permission }),
              },
            };
        }
      }
      return {
        ok: true,
        status: 200,
        body: {
          members: listed.members.map((member) => ({
            ...member,
            effectiveRole:
              member.effectiveRole === null
                ? null
                : {
                    permissions: [...member.effectiveRole.permissions],
                    via: [...member.effectiveRole.via],
                  },
          })),
        },
      };
    }),
    bind(removeMember, async ({ params, principal }): Promise<HttpReply<typeof removeMember>> => {
      // Proof: 2026-09-29, bypassing this guard made `refuses delegated member
      // administration even for a super-admin` answer 204 with the membership
      // removed.
      if (principal.delegation !== undefined)
        return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
      // Proof: member-remove-route-snapshot: removed/broken boundary failed `retains the membership remove principal before resolver alias changes`; named assertion RED and restored GREEN (task-2.5 guard-faults).
      const actor = retainSecurityPrincipal(principal);
      const actorId = actor.id;
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
      const outcome = await memberships.administer(
        resolved.access.scope.organizationId,
        // Proof: member-route-snapshot: removing this boundary failed `retains the authenticated membership removal actor before organization resolution`;
        // restored GREEN with the named diagnostic (task-4.1 guard-faults receipt, 2026-11-10).
        actor,
        params.userId,
        { stamp: { at: clock.now(), by: actorId }, actor: actorId, auditId: crypto.randomUUID() },
        'route',
      );
      if (!outcome.ok) return refused(outcome);
      return { ok: true, status: 204, body: EMPTY };
    }),
  ] as const;
}
