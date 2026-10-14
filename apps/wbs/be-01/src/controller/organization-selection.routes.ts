import {
  listOrganizationMemberships,
  readActiveOrganization,
  selectActiveOrganization,
} from '@wbs/contracts';
import type { OrganizationAccess } from '@wbs/core';
import { organizationRefusal } from '@wbs/core/http/organization-refusal';

import { bind } from '../http/endpoint';
import { organizationCookieCarrier } from '../runtime/organization-cookie';
import type {
  OrganizationSelection,
  OrganizationSelectionOutcome,
} from '../runtime/organization-selection';

function refusal(
  outcome: OrganizationSelectionOutcome,
  allowMembershipRefusal: false,
):
  | {
      readonly ok: false;
      readonly status: 403;
      readonly body: { readonly error: 'onboarding_inactive' };
    }
  | {
      readonly ok: false;
      readonly status: 401;
      readonly body: { readonly error: 'unauthenticated' };
    };
function refusal(
  outcome: OrganizationSelectionOutcome,
  allowMembershipRefusal: true,
):
  | {
      readonly ok: false;
      readonly status: 403;
      readonly body: { readonly error: 'onboarding_inactive' | 'not_a_member' };
    }
  | {
      readonly ok: false;
      readonly status: 401;
      readonly body: { readonly error: 'unauthenticated' };
    };
function refusal(outcome: OrganizationSelectionOutcome, allowMembershipRefusal: boolean) {
  switch (outcome.kind) {
    case 'inactive':
      return { ok: false, status: 403, body: { error: 'onboarding_inactive' } } as const;
    case 'invalid_credential':
      return { ok: false, status: 401, body: { error: 'unauthenticated' } } as const;
    case 'not_a_member':
      if (!allowMembershipRefusal) throw new Error('membership refusal cannot come from list');
      return { ok: false, status: 403, body: { error: 'not_a_member' } } as const;
    default:
      throw new Error(`selection outcome ${outcome.kind} is not a refusal`);
  }
}

/** Browser organization context operations; the default composition refuses them. */
export function organizationSelectionRoutes(
  selection: OrganizationSelection,
  organizations: OrganizationAccess,
) {
  return [
    bind(readActiveOrganization, async ({ principal }) => {
      if (principal.delegation !== undefined)
        return { ok: false, status: 403, body: { error: 'insufficient_scope' } } as const;
      const choices = await selection.list(principal);
      if (choices.kind !== 'listed') return refusal(choices, false);
      // Proof: using the first membership without binding/current admission
      // made unbound and removed discovery answer 200, caught by the mounted
      // discovery cases; watched 2026-10-13.
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      if (resolved.access.kind === 'legacy')
        return { ok: false, status: 403, body: { error: 'onboarding_inactive' } } as const;
      const { organizationId, role } = resolved.access.scope;
      const membership = choices.memberships.find(
        (choice) => choice.organizationId === organizationId,
      );
      if (membership === undefined)
        return { ok: false, status: 403, body: { error: 'not_a_member' } } as const;
      return {
        ok: true,
        status: 200,
        body: { organizationId, name: membership.name, role },
      } as const;
    }),
    bind(listOrganizationMemberships, async ({ principal }) => {
      const outcome = await selection.list(principal);
      if (outcome.kind !== 'listed') return refusal(outcome, false);
      return {
        ok: true,
        status: 200,
        body: {
          state: outcome.memberships.length === 0 ? 'onboarding_required' : 'selection_required',
          memberships: outcome.memberships.map((member) => ({ ...member })),
        },
      } as const;
    }),
    bind(selectActiveOrganization, async ({ principal, body, request }) => {
      // Proof: omitting this raw carrier refusal let two conflicting
      // organization cookies produce a new selection (200 instead of 401).
      if (organizationCookieCarrier(request.headers).kind === 'invalid')
        return { ok: false, status: 401, body: { error: 'unauthenticated' } } as const;
      const outcome = await selection.select(principal, body.organizationId);
      if (outcome.kind === 'refused') return organizationRefusal({ ok: false, ...outcome.refusal });
      if (outcome.kind !== 'selected') return refusal(outcome, true);
      return {
        ok: true,
        status: 200,
        body: { organizationId: outcome.organizationId },
        headers: [
          [
            'set-cookie',
            `__Host-wbs_organization=${encodeURIComponent(outcome.cookie)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${String(outcome.maxAge)}`,
          ],
        ],
      } as const;
    }),
  ] as const;
}
