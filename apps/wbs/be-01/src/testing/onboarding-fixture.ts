import type { Onboarding } from '@wbs/core';

/** Inactive onboarding for endpoint tests unrelated to activated organizations. */
export const refusingOnboarding: Onboarding = {
  isActive: () => Promise.resolve(false),
  discover: () => Promise.resolve({ ok: false, refusal: 'onboarding_inactive' }),
  createOrganization: () => Promise.resolve({ ok: false, refusal: 'onboarding_inactive' }),
  submitJoinRequest: () => Promise.resolve({ ok: false, refusal: 'onboarding_inactive' }),
};
