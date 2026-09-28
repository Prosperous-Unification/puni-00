import type { EmailDelivery } from '@wbs/core';

/** Explicit production refusal until a reviewed mail adapter is supplied. */
export const refusingEmailDelivery: EmailDelivery = {
  deliver: () => Promise.reject(new Error('email delivery sink is not configured')),
};
