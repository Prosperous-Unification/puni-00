import { conversationAllowance } from './conversation-store';

/**
 * Guardrail figures beside {@link conversationAllowance}; the rationale for each lives in the
 * `website-abuse-guardrails` design. Daily caps count per UTC day; login windows and locks are in
 * milliseconds; the pause and the half-spend alert are micro-USD of the site-day ceiling.
 */
export const guardrailAllowance = {
  draftSourceDay: 20,
  draftSiteDay: 2_000,
  proposalSourceDay: 5,
  proposalEmailDay: 3,
  proposalSiteDay: 200,
  sourceLoginFailures: 5,
  sourceLoginWindowMilliseconds: 15 * 60_000,
  sourceLockMilliseconds: 15 * 60_000,
  accountLoginFailures: 20,
  accountLoginWindowMilliseconds: 60 * 60_000,
  accountLockMilliseconds: 60 * 60_000,
  pauseMicroUsd: (conversationAllowance.siteDayMicroUsd * 4) / 5,
  halfSpendMicroUsd: conversationAllowance.siteDayMicroUsd / 2,
} as const;
