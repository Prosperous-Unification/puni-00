import { readSessionPolicy, setSessionPolicy } from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type { OrganizationAccess } from '../ports/organization-access';
import { isAdmissibleSessionPolicy, type SessionPolicies } from '../ports/session-policies';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/**
 * Session policy administration in the caller's active organization, for its
 * current super-admins (`organization-session-policy`). The organization
 * comes only from the resolved session; a delegation may not administer.
 */
export function sessionPolicyRoutes(
  organizations: OrganizationAccess,
  policies: SessionPolicies,
  clock: Pick<Clock, 'now'>,
) {
  return [
    bind(readSessionPolicy, async ({ principal }): Promise<HttpReply<typeof readSessionPolicy>> => {
      if (principal.delegation !== undefined)
        return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
      const read = await policies.read(resolved.access.scope.organizationId, principal.id);
      if (read === 'inactive') return organizationRefusal('no_active_organization');
      if (read === 'forbidden') return { ok: false, status: 403, body: { error: 'forbidden' } };
      return { ok: true, status: 200, body: { policy: read } };
    }),
    bind(
      setSessionPolicy,
      async ({ principal, body }): Promise<HttpReply<typeof setSessionPolicy>> => {
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        const policy = {
          maxSessionSeconds: body.maxSessionSeconds,
          reauthenticateAfterSeconds: body.reauthenticateAfterSeconds,
        };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        // Proof: admitting every body made `refuses out-of-range, fractional
        // and inverted bounds` in `session-policy.controller.db.test.ts`
        // answer 500 from the store instead of 400; watched 2026-10-12.
        if (!isAdmissibleSessionPolicy(policy))
          return { ok: false, status: 400, body: { error: 'invalid_body' } };
        const set = await policies.set(resolved.access.scope.organizationId, principal.id, policy, {
          stamp: { at: clock.now(), by: principal.id },
          actor: principal.id,
          auditId: crypto.randomUUID(),
        });
        switch (set) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return { ok: false, status: 403, body: { error: 'forbidden' } };
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
