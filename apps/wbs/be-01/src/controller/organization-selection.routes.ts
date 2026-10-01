import { listOrganizationMemberships, selectActiveOrganization } from '@wbs/contracts';

import { bind } from '../http/endpoint';
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

/** Browser selection endpoints; the default production binding refuses both. */
export function organizationSelectionRoutes(selection: OrganizationSelection) {
  return [
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
        headers: [
          ['cache-control', 'no-store'],
          ['vary', 'Cookie, Authorization'],
        ],
      } as const;
    }),
    bind(selectActiveOrganization, async ({ principal, body }) => {
      const outcome = await selection.select(principal, body.organizationId);
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
          ['cache-control', 'no-store'],
          ['vary', 'Cookie, Authorization'],
        ],
      } as const;
    }),
  ] as const;
}
