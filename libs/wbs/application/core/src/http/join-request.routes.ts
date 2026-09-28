import { approveJoinRequest, denyJoinRequest, listJoinRequests } from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type { EmailDelivery } from '../ports/email-delivery';
import type { JoinRequest, JoinRequestRefusal } from '../ports/join-request';
import type { OrganizationAccess } from '../ports/organization-access';
import type { Digest } from '../ports/runtime';
import { bind, EMPTY, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/** Converts repository decisions into the declared HTTP refusals. */
function refused(refusal: JoinRequestRefusal) {
  switch (refusal) {
    case 'onboarding_inactive':
      return { ok: false, status: 403, body: { error: refusal } } as const;
    case 'forbidden':
      return { ok: false, status: 403, body: { error: refusal } } as const;
    case 'not_found':
      return { ok: false, status: 404, body: { error: refusal } } as const;
    case 'request_resolved':
      return { ok: false, status: 409, body: { error: refusal } } as const;
    case 'domain_changed':
      return { ok: false, status: 409, body: { error: refusal } } as const;
  }
}

/** Mounted administration routes; every request resolves its current active organization. */
export function joinRequestRoutes(
  requests: JoinRequest,
  organizations: OrganizationAccess,
  delivery: EmailDelivery,
  clock: Pick<Clock, 'now'>,
  digest: Digest,
) {
  return [
    bind(listJoinRequests, async ({ principal }): Promise<HttpReply<typeof listJoinRequests>> => {
      // Proof: 2026-09-28, bypassing this guard failed `refuses delegated onboarding discovery and writes` at join-request listing.
      if (principal.delegation !== undefined)
        return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
      const answer = await requests.list(resolved.access.scope.organizationId, principal.id);
      return answer.ok
        ? { ok: true, status: 200, body: { requests: answer.value } }
        : refused(answer.refusal);
    }),
    bind(
      approveJoinRequest,
      async ({ principal, params, body }): Promise<HttpReply<typeof approveJoinRequest>> => {
        // Proof: 2026-09-28, bypassing this guard failed `refuses delegated onboarding discovery and writes` at approval.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('');
        const now = clock.now();
        const answer = await requests.approve(
          resolved.access.scope.organizationId,
          principal.id,
          params.id,
          body.role,
          // Proof: 2026-09-28, storing the raw token failed `approves one pending request by issuing a viewer invitation without membership` on its stored digest assertion.
          await digest.sha256(token),
          now + 7 * 24 * 60 * 60 * 1000,
          { at: now, by: principal.id },
        );
        if (!answer.ok) return refused(answer.refusal);
        try {
          await delivery.deliver(answer.value.email, token);
        } catch {
          // Proof: 2026-09-28, omitting compensation failed `reopens a request and revokes its invitation when the injected sink fails`.
          await requests.failDelivery(params.id, answer.value.invitationId, {
            at: clock.now(),
            by: principal.id,
          });
          return { ok: false, status: 503, body: { error: 'delivery_failed' } };
        }
        return { ok: true, status: 200, body: { invitationId: answer.value.invitationId } };
      },
    ),
    bind(
      denyJoinRequest,
      async ({ principal, params }): Promise<HttpReply<typeof denyJoinRequest>> => {
        // Proof: 2026-09-28, bypassing this guard failed `refuses delegated onboarding discovery and writes` at denial.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const answer = await requests.deny(
          resolved.access.scope.organizationId,
          principal.id,
          params.id,
          { at: clock.now(), by: principal.id },
        );
        return answer.ok ? { ok: true, status: 204, body: EMPTY } : refused(answer.refusal);
      },
    ),
  ] as const;
}
