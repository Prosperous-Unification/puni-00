import {
  createOnboardingOrganization,
  readOnboarding,
  submitOnboardingJoinRequest,
} from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type { Onboarding } from '../ports/onboarding';
import { bind, type HttpReply } from './endpoint';

/** Session onboarding uses durable evidence and needs no active organization. */
export function onboardingRoutes(onboarding: Onboarding, clock: Pick<Clock, 'now'>) {
  return [
    bind(readOnboarding, async ({ principal }): Promise<HttpReply<typeof readOnboarding>> => {
      // Proof: 2026-09-28, skipping this check made `refuses delegated onboarding
      // discovery and writes` reveal memberships outside the delegated organization.
      if (principal.delegation !== undefined)
        return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
      const answer = await onboarding.discover(principal.id);
      if (!answer.ok) {
        if (answer.refusal === 'email_verification_required')
          return { ok: true, status: 200, body: { state: 'verification_required' } };
        if (answer.refusal === 'onboarding_inactive')
          return { ok: false, status: 403, body: { error: 'onboarding_inactive' } };
        throw new Error(`unexpected onboarding discovery refusal: ${answer.refusal}`);
      }
      return { ok: true, status: 200, body: answer.value };
    }),
    bind(
      createOnboardingOrganization,
      async ({ principal, body }): Promise<HttpReply<typeof createOnboardingOrganization>> => {
        // Proof: 2026-09-28, skipping this check made `refuses delegated onboarding
        // discovery and writes` create a super-admin membership for a delegated caller.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        const name = body.name.trim();
        if (name.length === 0 || name.length > 120)
          return { ok: false, status: 400, body: { error: 'invalid_body' } };
        const answer = await onboarding.createOrganization(principal.id, name, {
          at: clock.now(),
          by: principal.id,
        });
        if (!answer.ok) {
          switch (answer.refusal) {
            case 'onboarding_inactive':
              return { ok: false, status: 403, body: { error: 'onboarding_inactive' } };
            case 'email_verification_required':
              return { ok: false, status: 403, body: { error: 'email_verification_required' } };
            case 'already_member':
              return { ok: false, status: 409, body: { error: 'already_member' } };
            case 'domain_matched':
              return { ok: false, status: 409, body: { error: 'domain_matched' } };
            default:
              throw new Error(`unexpected organization creation refusal: ${answer.refusal}`);
          }
        }
        return { ok: true, status: 201, body: answer.value };
      },
    ),
    bind(
      submitOnboardingJoinRequest,
      async ({ principal, body }): Promise<HttpReply<typeof submitOnboardingJoinRequest>> => {
        // Proof: 2026-09-28, skipping this check made `refuses delegated onboarding
        // discovery and writes` submit a join request for a delegated caller.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        const answer = await onboarding.submitJoinRequest(principal.id, body.organizationId, {
          at: clock.now(),
          by: principal.id,
        });
        if (!answer.ok) {
          switch (answer.refusal) {
            case 'onboarding_inactive':
              return { ok: false, status: 403, body: { error: 'onboarding_inactive' } };
            case 'email_verification_required':
              return { ok: false, status: 403, body: { error: 'email_verification_required' } };
            case 'already_member':
              return { ok: false, status: 409, body: { error: 'already_member' } };
            case 'join_request_pending':
              return { ok: false, status: 409, body: { error: 'join_request_pending' } };
            case 'not_found':
              return { ok: false, status: 404, body: { error: 'not_found' } };
            default:
              throw new Error(`unexpected join request refusal: ${answer.refusal}`);
          }
        }
        return { ok: true, status: 201, body: answer.value };
      },
    ),
  ] as const;
}
