import type { EmailDelivery, EmailVerification, Invitation } from '@wbs/core';

/** Inert fixture for routes outside the email challenge suite. */
export const refusingEmailVerification: EmailVerification = {
  issue: () => Promise.resolve({ ok: false, refusal: 'onboarding_inactive' }),
  recordDelivery: () => Promise.reject(new Error('no challenge was issued')),
  confirm: () => Promise.resolve({ ok: false, refusal: 'onboarding_inactive' }),
};

/** Explicitly refuses delivery in unrelated endpoint fixtures. */
export const refusingTestEmailDelivery: EmailDelivery = {
  deliver: () => Promise.reject(new Error('fixture mail sink refuses delivery')),
};

/** Inert invitation boundary for unrelated app compositions. */
export const refusingInvitations: Invitation = {
  list: () => Promise.resolve({ ok: false, refusal: 'onboarding_inactive' }),
  issue: () => Promise.resolve({ ok: false, refusal: 'onboarding_inactive' }),
  revoke: () => Promise.resolve({ ok: false, refusal: 'onboarding_inactive' }),
  failDelivery: () => Promise.reject(new Error('no invitation was issued')),
  accept: () => Promise.resolve({ ok: false, refusal: 'onboarding_inactive' }),
};
