import type { CredentialAuthentication } from '@wbs/contracts';

import type { SessionPolicy } from './session-policies';

/**
 * What the credential rules read about one organization and one credential,
 * in the same query that rechecks membership: the organization's enforced
 * proven connections, its session policy, and the times of the browser
 * lifecycle the credential belongs to.
 */
export interface CredentialRuleFacts {
  /** Every enforced proven connection, by prefix and login slug; empty when SSO is not enforced. */
  readonly enforced: readonly { readonly prefix: string; readonly loginSlug: string }[];
  readonly policy: SessionPolicy | null;
  /** The OIDC browser lifecycle's times, or null when the credential belongs to none. */
  readonly lifecycle: {
    readonly openedAt: number | null;
    readonly reauthenticatedAt: number | null;
  } | null;
}

/** Why the credential rules refuse an organization context; the wire bodies of D2. */
export type CredentialRuleRefusal =
  | {
      readonly refusal: 'sso_required';
      readonly organizationId: string;
      readonly login: string;
      readonly link: true;
    }
  | {
      readonly refusal: 'reauthentication_required';
      readonly organizationId: string;
      readonly reason: 'max_session' | 'reauthenticate_after';
      readonly login: string;
    };

/** What the rules read of the principal. */
export interface RuledCredential {
  readonly authentication?: CredentialAuthentication;
  /** Whether the credential is a delegation (MCP, gateway or direct context). */
  readonly delegated: boolean;
}

/**
 * The one evaluation of enforced SSO (`organization-sso`) and session policy
 * (`organization-session-policy`) for a credential in an organization, at the
 * evaluating service's injected `now` (ADR 0012). Null admits.
 *
 * - Enforced SSO admits only an upstream pair that authenticated THIS
 *   credential and carries an enforced connection's whole prefix; a password
 *   session, a direct context and any other pair are refused.
 * - Session policy compares milliseconds: a bound is exceeded when the
 *   elapsed time is greater than the bound times 1000; equality admits. A
 *   password session's times are both its issue time (also when a direct
 *   context is being issued from it); an OIDC browser credential's are its
 *   lifecycle's; an upstream delegation has none until it carries its grant's
 *   authentication time, and a direct context carries no facts at all, so
 *   both are refused. An unknown time is refused, never defaulted.
 *
 * Proof, each watched 2026-10-12 in `credential-rules.test.ts`: skipping the
 * prefix test (admitting any member) made `refuse a social identity in an
 * enforced organization` admit `google-oauth2|7`, and made the mounted
 * `refuses a social identity in the enforced organization only`
 * (`organization-credential-rules.controller.db.test.ts`) select A;
 * treating a null `opened_at` as `now` made `refuses an unknown time` admit;
 * comparing either bound with `>=` made `admits the exact bound and refuses
 * one millisecond more` refuse the exact bound.
 */
export function credentialRuleRefusal(
  organizationId: string,
  facts: CredentialRuleFacts,
  credential: RuledCredential,
  now: number,
): CredentialRuleRefusal | null {
  const { authentication } = credential;
  const enforced = facts.enforced.at(0);
  if (enforced !== undefined) {
    const carried =
      authentication?.kind === 'upstream' &&
      facts.enforced.some(({ prefix }) => authentication.subject.startsWith(prefix));
    if (!carried)
      return {
        refusal: 'sso_required',
        organizationId,
        login: `/api/auth/login?organization=${encodeURIComponent(enforced.loginSlug)}`,
        link: true,
      };
  }
  const { policy } = facts;
  if (policy === null) return null;
  const times =
    authentication === undefined
      ? null
      : authentication.kind === 'first_party'
        ? { openedAt: authentication.issuedAt, reauthenticatedAt: authentication.issuedAt }
        : credential.delegated
          ? null
          : facts.lifecycle;
  const refuse = (reason: 'max_session' | 'reauthenticate_after'): CredentialRuleRefusal => ({
    refusal: 'reauthentication_required',
    organizationId,
    reason,
    login: `/api/auth/login?reauthenticate=${encodeURIComponent(organizationId)}`,
  });
  if (policy.maxSessionSeconds !== null) {
    const openedAt = times?.openedAt ?? null;
    if (openedAt === null || now - openedAt > policy.maxSessionSeconds * 1000)
      return refuse('max_session');
  }
  if (policy.reauthenticateAfterSeconds !== null) {
    const reauthenticatedAt = times?.reauthenticatedAt ?? null;
    if (
      reauthenticatedAt === null ||
      now - reauthenticatedAt > policy.reauthenticateAfterSeconds * 1000
    )
      return refuse('reauthenticate_after');
  }
  return null;
}
