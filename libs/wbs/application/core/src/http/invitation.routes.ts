import {
  acceptInvitation,
  createInvitation,
  listInvitations,
  revokeInvitation,
} from '@wbs/contracts';
import { type Permission, selectInitialAccess } from '@wbs/domain';

import type { Clock } from '../ports/clock';
import type { EmailDelivery } from '../ports/email-delivery';
import type { Invitation, InvitationRefusal } from '../ports/invitation';
import type { OrganizationAccess } from '../ports/organization-access';
import type { Digest } from '../ports/runtime';
import { retainSecurityPrincipal } from '../ports/security-principal';
import { bind, EMPTY, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/** Creates a 256-bit opaque invitation token; only the digest enters storage. */
function createToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** Maps repository refusals to the typed invitation wire contract. */
function refused(answer: {
  readonly refusal: InvitationRefusal;
  readonly permission?: Permission;
}) {
  switch (answer.refusal) {
    case 'onboarding_inactive':
      return { ok: false, status: 403, body: { error: 'onboarding_inactive' } } as const;
    case 'forbidden':
      return {
        ok: false,
        status: 403,
        body: {
          error: 'forbidden',
          ...(answer.permission === undefined ? {} : { permission: answer.permission }),
        },
      } as const;
    case 'insufficient_scope':
      return { ok: false, status: 403, body: { error: 'insufficient_scope' } } as const;
    case 'not_found':
      return { ok: false, status: 404, body: { error: 'not_found' } } as const;
    case 'recipient_mismatch':
      return { ok: false, status: 403, body: { error: 'recipient_mismatch' } } as const;
    case 'email_verification_required':
      return { ok: false, status: 403, body: { error: 'email_verification_required' } } as const;
    case 'invitation_invalid':
      return { ok: false, status: 409, body: { error: 'invitation_invalid' } } as const;
  }
}

/** Mounted invitation routes: administration uses the active organization; acceptance uses the token. */
export function invitationRoutes(
  invitations: Invitation,
  organizations: OrganizationAccess,
  delivery: EmailDelivery,
  clock: Pick<Clock, 'now'>,
  digest: Digest,
) {
  return [
    bind(listInvitations, async ({ principal }): Promise<HttpReply<typeof listInvitations>> => {
      // Proof: 2026-09-28, bypassing this guard failed `refuses delegated onboarding discovery and writes` at the invitation list.
      if (principal.delegation !== undefined)
        return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
      /* Proof: invitation-list-route-principal: removed/changed production boundary.
       * retains the HTTP offer actor before resolver mutation at invitation-list
       * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
      const actor = retainSecurityPrincipal(principal);
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
      const answer = await invitations.list(resolved.access.scope.organizationId, actor);
      if (!answer.ok) {
        if (answer.refusal === 'onboarding_inactive')
          return { ok: false, status: 403, body: { error: 'onboarding_inactive' } };
        if (answer.refusal === 'insufficient_scope')
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        if (answer.refusal === 'forbidden')
          return {
            ok: false,
            status: 403,
            body: {
              error: 'forbidden',
              ...(answer.permission === undefined ? {} : { permission: answer.permission }),
            },
          };
        throw new Error(`unexpected list invitation refusal: ${answer.refusal}`);
      }
      return { ok: true, status: 200, body: { invitations: answer.value } };
    }),
    bind(
      createInvitation,
      async ({ principal, body }): Promise<HttpReply<typeof createInvitation>> => {
        // Proof: 2026-09-28, bypassing this guard failed `refuses delegated onboarding discovery and writes` at invitation issuance.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        /* Proof: invitation-issue-route-principal: removed/changed production boundary.
         * retains the HTTP offer actor before resolver mutation at invitation-issue
         * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
        const actor = retainSecurityPrincipal(principal);
        const initialAccess = selectInitialAccess(body.initialRoleId ?? null);
        const email = body.email.trim().toLowerCase();
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        // Proof: 2026-09-28, bypassing syntax, ASCII and 254-byte checks separately failed `rejects malformed recipient addresses and a super-admin offer`.
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          !/^[\x21-\x7e]+$/.test(email) ||
          email.length > 254
        )
          return { ok: false, status: 400, body: { error: 'invalid_body' } };
        const token = createToken();
        const now = clock.now();
        const answer = await invitations.issue(
          resolved.access.scope.organizationId,
          actor,
          email,
          initialAccess,
          // Proof: 2026-09-28, storing the raw token failed `is inert before activation and issues a digest-only invitation after activation`.
          await digest.sha256(token),
          now + 7 * 24 * 60 * 60 * 1000,
          { at: now, by: actor.id },
        );
        if (!answer.ok) {
          if (answer.refusal === 'onboarding_inactive')
            return { ok: false, status: 403, body: { error: 'onboarding_inactive' } };
          if (answer.refusal === 'insufficient_scope')
            return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
          if (answer.refusal === 'forbidden')
            return {
              ok: false,
              status: 403,
              body: {
                error: 'forbidden',
                ...(answer.permission === undefined ? {} : { permission: answer.permission }),
              },
            };
          throw new Error(`unexpected issue invitation refusal: ${answer.refusal}`);
        }
        try {
          // Proof: swapping this purpose failed the mounted invitation message-purpose assertion.
          await delivery.deliver({ purpose: 'invitation', recipient: email, token });
        } catch {
          // Proof: 2026-09-28, omitting this revocation failed `revokes an invitation when the injected mail sink rejects delivery`.
          await invitations.failDelivery(answer.value.id, clock.now());
          return { ok: false, status: 503, body: { error: 'delivery_failed' } };
        }
        return { ok: true, status: 201, body: { invitation: answer.value } };
      },
    ),
    bind(
      revokeInvitation,
      async ({ principal, params }): Promise<HttpReply<typeof revokeInvitation>> => {
        // Proof: 2026-09-28, bypassing this guard failed `refuses delegated onboarding discovery and writes` at invitation revocation.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        /* Proof: invitation-revoke-route-principal: removed/changed production boundary.
         * retains the HTTP offer actor before resolver mutation at invitation-revoke
         * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
        const actor = retainSecurityPrincipal(principal);
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const answer = await invitations.revoke(
          resolved.access.scope.organizationId,
          actor,
          params.id,
          { at: clock.now(), by: actor.id },
        );
        if (!answer.ok) {
          if (answer.refusal === 'onboarding_inactive')
            return { ok: false, status: 403, body: { error: 'onboarding_inactive' } };
          if (answer.refusal === 'insufficient_scope')
            return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
          if (answer.refusal === 'forbidden')
            return {
              ok: false,
              status: 403,
              body: {
                error: 'forbidden',
                ...(answer.permission === undefined ? {} : { permission: answer.permission }),
              },
            };
          if (answer.refusal === 'not_found')
            return { ok: false, status: 404, body: { error: 'not_found' } };
          if (answer.refusal === 'invitation_invalid')
            return { ok: false, status: 409, body: { error: 'invitation_invalid' } };
          throw new Error(`unexpected revoke invitation refusal: ${answer.refusal}`);
        }
        return { ok: true, status: 204, body: EMPTY };
      },
    ),
    bind(
      acceptInvitation,
      async ({ principal, body }): Promise<HttpReply<typeof acceptInvitation>> => {
        // Proof: 2026-09-28, bypassing this guard failed `refuses delegated onboarding discovery and writes` at acceptance.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        /* Proof: accept-route-principal: removed/changed production boundary.
         * retains the HTTP acceptance principal across the real awaited token digest
         * failed with the injected fault and passed after restoration (task-2.5 current receipt). */
        const actor = retainSecurityPrincipal(principal);
        const answer = await invitations.accept(actor, await digest.sha256(body.token), () =>
          clock.now(),
        );
        if (!answer.ok) {
          return refused(answer);
        }
        return { ok: true, status: 200, body: { membership: answer.value } };
      },
    ),
  ] as const;
}
