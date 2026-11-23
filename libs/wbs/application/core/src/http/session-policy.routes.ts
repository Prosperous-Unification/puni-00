import { readSessionPolicy, setSessionPolicy } from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type { OrganizationAccess } from '../ports/organization-access';
import { retainSecurityPrincipal } from '../ports/security-principal';
import { isAdmissibleSessionPolicy, type SessionPolicies } from '../ports/session-policies';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/**
 * Session policy administration in the caller's active organization, for its
 * current organization.manage_security holders (`wbs-permissions` P7). The organization
 * comes only from the resolved session; a delegation may not administer.
 */
export function sessionPolicyRoutes(
  organizations: OrganizationAccess,
  policies: SessionPolicies,
  clock: Pick<Clock, 'now'>,
) {
  return [
    bind(readSessionPolicy, async ({ principal }): Promise<HttpReply<typeof readSessionPolicy>> => {
      // Proof: removing this route guard changed the signed delegated-human security-grant negative from insufficient_scope to named forbidden; GET/PUT faults killed/restored, 2026-11-09.
      // Proof: bypassing this HTTP refusal (http-current-session-nondelegation-GET) failed `refuses delegated session-policy GET despite an effective personal security grant`; restored GREEN.
      if (principal.delegation !== undefined)
        return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
      // Proof: retaining the caller alias across organization resolution (route-snapshot-session-GET) failed `retains the route security principal across organization resolution at session-GET: id`; restored GREEN.
      const actor = retainSecurityPrincipal(principal);
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
      const read = await policies.read(resolved.access.scope.organizationId, actor);
      if (read === 'inactive') return organizationRefusal('no_active_organization');
      if (read === 'forbidden')
        return {
          ok: false,
          status: 403,
          // Proof: removing permission failed the corresponding encoded role-only super-admin GET/PUT negative; both faults killed/restored, 2026-11-09.
          // Proof: dropping this permission property (http-permission-session-read) failed `encodes manage_security for a role-only super-admin on session-policy GET`; restored GREEN.
          body: { error: 'forbidden', permission: 'organization.manage_security' },
        };
      return { ok: true, status: 200, body: { policy: read } };
    }),
    bind(
      setSessionPolicy,
      async ({ principal, body }): Promise<HttpReply<typeof setSessionPolicy>> => {
        // Proof: removing this route guard changed the signed delegated-human security-grant negative from insufficient_scope to named forbidden; GET/PUT faults killed/restored, 2026-11-09.
        // Proof: bypassing this HTTP refusal (http-current-session-nondelegation-PUT) failed `refuses delegated session-policy PUT despite an effective personal security grant`; restored GREEN.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        const policy = {
          maxSessionSeconds: body.maxSessionSeconds,
          reauthenticateAfterSeconds: body.reauthenticateAfterSeconds,
        };
        // Proof: retaining the caller alias across organization resolution (route-snapshot-session-PUT) failed `retains the route security principal across organization resolution at session-PUT: id`; restored GREEN.
        const actor = retainSecurityPrincipal(principal);
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        // Proof: admitting every body made `refuses out-of-range, fractional
        // and inverted bounds` in `session-policy.controller.db.test.ts`
        // answer 500 from the store instead of 400; watched 2026-10-12.
        if (!isAdmissibleSessionPolicy(policy))
          return { ok: false, status: 400, body: { error: 'invalid_body' } };
        const set = await policies.set(resolved.access.scope.organizationId, actor, policy, {
          stamp: { at: clock.now(), by: actor.id },
          actor: actor.id,
          auditId: crypto.randomUUID(),
        });
        switch (set) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return {
              ok: false,
              status: 403,
              // Proof: removing permission failed the corresponding encoded role-only super-admin GET/PUT negative; both faults killed/restored, 2026-11-09.
              // Proof: dropping this permission property (http-permission-session-set) failed `encodes manage_security for a role-only super-admin on session-policy PUT`; restored GREEN.
              body: { error: 'forbidden', permission: 'organization.manage_security' },
            };
          case 'cleared':
            return { ok: true, status: 200, body: { policy: null } };
          case 'set':
          case 'unchanged':
            return {
              ok: true,
              status: 200,
              body: {
                policy:
                  policy.maxSessionSeconds === null && policy.reauthenticateAfterSeconds === null
                    ? null
                    : policy,
              },
            };
        }
      },
    ),
  ] as const;
}
