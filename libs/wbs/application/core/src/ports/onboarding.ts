import type { WriteStamp } from './write-stamp';

export type OnboardingState =
  | { state: 'verification_required' }
  | {
      state: 'selection_required';
      memberships: { organizationId: string; name: string; role: string }[];
    }
  | { state: 'create_organization' }
  | { state: 'join_organization'; organization: { id: string; name: string }; pending: boolean };

export type OnboardingRefusal =
  | 'onboarding_inactive'
  | 'email_verification_required'
  | 'already_member'
  | 'domain_matched'
  | 'join_request_pending'
  | 'not_found';

export type OnboardingAnswer<T> =
  { ok: true; value: T } | { ok: false; refusal: OnboardingRefusal };

/** One signed-in user's onboarding reads and transactional mutations. */
export interface Onboarding {
  discover(userId: string): Promise<OnboardingAnswer<OnboardingState>>;
  createOrganization(
    userId: string,
    name: string,
    stamp: WriteStamp,
  ): Promise<
    OnboardingAnswer<{
      organization: { id: string; name: string };
      membership: { organizationId: string; userId: string; role: 'super_admin' };
    }>
  >;
  submitJoinRequest(
    userId: string,
    organizationId: string,
    stamp: WriteStamp,
  ): Promise<
    OnboardingAnswer<{ request: { id: string; organizationId: string; status: 'pending' } }>
  >;
}
