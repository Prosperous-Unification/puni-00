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
  /** Independently trusted grant lifecycle; token issuance and refresh never establish it. */
  readonly delegationLifecycle?: CredentialRuleFacts['lifecycle'];
}

/**
 * The one evaluation of enforced SSO (`organization-sso`) and session policy
 * (`organization-session-policy`) for a credential in an organization, at the
 * evaluating service's injected `now` (ADR 0012). Null admits.
 *
 * - A machine credential (`wbs-machine-credentials` A10) is admitted by
 *   neither rule: it has no human sign-in to judge. A consent delegation
 *   (A20) is judged by the human sign-in's pair that opened its family,
 *   exactly as an upstream delegation is.
 * - Enforced SSO admits only an upstream pair that authenticated THIS
 *   credential and carries an enforced connection's whole prefix; a password
 *   session, a direct context and any other pair are refused.
 * - Session policy compares milliseconds: a bound is exceeded when the
 *   elapsed time is greater than the bound times 1000; equality admits. A
 *   password session's times are both its issue time (also when a direct
 *   context is being issued from it); an OIDC browser credential's are its
 *   lifecycle's; an upstream delegation uses only explicitly trusted grant
 *   lifecycle evidence, and a direct context carries no facts at all. Missing
 *   or unknown evidence is refused, never replaced with token issuance time.
 *
 * Proof, each watched 2026-10-12 in `credential-rules.test.ts`: skipping the
 * prefix test (admitting any member) made `refuse a social identity in an
 * enforced organization` admit `google-oauth2|7`, and made the mounted
 * `refuses a social identity in the enforced organization only`
 * (`organization-credential-rules.controller.db.test.ts`) select A;
 * treating a null `opened_at` as `now` made `refuses an unknown time` admit;
 * comparing either bound with `>=` made `admits the exact bound and refuses
 * one millisecond more` refuse the exact bound. In MCP production paths on
 * 2026-10-13, defaulting unknown times to now failed six `unknown` negatives;
 * changing either > to >= failed six `equality` cases with trusted delegation evidence.
 */
export function credentialRuleRefusal(
  organizationId: string,
  facts: CredentialRuleFacts,
  credential: RuledCredential,
  now: number,
): CredentialRuleRefusal | null {
  const { authentication } = credential;
  // A headless machine credential has no human sign-in to judge
  // (`wbs-machine-credentials` A10): the organization controls it by its
  // issuer, the trusted-issuer gate and revoke.
  // Proof: with this branch removed, `admits a machine key under enforced
  // SSO` and `admits a machine key under a session policy` in
  // `organization-credential-rules.controller.db.test.ts` both failed their
  // expected 200; watched 2026-10-22.
  if (authentication?.kind === 'machine') return null;
  const enforced = facts.enforced.at(0);
  if (enforced !== undefined) {
    // Proof: with `consent` left out here, `refuses a consent delegation
    // whose human signed in outside the enforced connection, and admits one
    // inside it` (credential-rules.test.ts) refused the inside case
    // `sso_required`; watched 2026-10-22.
    const carried =
      (authentication?.kind === 'upstream' || authentication?.kind === 'consent') &&
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
          ? (credential.delegationLifecycle ?? null)
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
