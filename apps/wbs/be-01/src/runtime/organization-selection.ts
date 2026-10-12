import type { AuthenticatedUser, VerifiedOrganizationCredential } from '@wbs/contracts';
import type { CredentialRuleRefusal, OrganizationPrincipal } from '@wbs/core';

import type { organizationCookieBinding } from './organization-cookie';

interface MembershipChoice {
  readonly organizationId: string;
  readonly name: string;
  readonly role: 'super_admin' | 'admin' | 'member' | 'viewer';
}

/** Reads the marker and current membership choices from one trusted snapshot. */
export interface OrganizationChoices {
  list(userId: string): Promise<'inactive' | readonly MembershipChoice[]>;
}

/**
 * The credential rules for a principal entering one organization now, read
 * with its current membership: `SqliteOrganizationAccess.admitTo`.
 */
export type CredentialAdmission = (
  principal: OrganizationPrincipal,
  organizationId: string,
) => Promise<'not_a_member' | CredentialRuleRefusal | null>;

/** Shared, per-request revocation lookup for an exact verified browser credential. */
export interface BrowserCredentialRevocations {
  isRevoked(credential: VerifiedOrganizationCredential): Promise<boolean>;
}

export type OrganizationSelectionOutcome =
  | {
      readonly kind: 'listed';
      readonly memberships: readonly (MembershipChoice & { readonly ssoRequired: boolean })[];
    }
  | { readonly kind: 'refused'; readonly refusal: CredentialRuleRefusal }
  | {
      readonly kind: 'selected';
      readonly organizationId: string;
      readonly cookie: string;
      readonly maxAge: number;
    }
  | { readonly kind: 'inactive' | 'invalid_credential' | 'not_a_member' };

/** An explicit selection with no user-global state or inferred sole membership. */
export interface OrganizationSelection {
  list(principal: AuthenticatedUser): Promise<OrganizationSelectionOutcome>;
  select(
    principal: AuthenticatedUser,
    organizationId: string,
  ): Promise<OrganizationSelectionOutcome>;
}

/** Production's selection remains inert until the activation wiring is reviewed. */
export const REFUSE_ORGANIZATION_SELECTION: OrganizationSelection = {
  list: () => Promise.resolve({ kind: 'inactive' }),
  select: () => Promise.resolve({ kind: 'inactive' }),
};

export function organizationSelection(
  choices: OrganizationChoices,
  cookie: ReturnType<typeof organizationCookieBinding>,
  revocations: BrowserCredentialRevocations,
  admit: CredentialAdmission,
): {
  readonly endpoints: OrganizationSelection;
  readonly activeOrganizationOf: (principal: OrganizationPrincipal) => Promise<string | null>;
} {
  return {
    endpoints: {
      async list(principal) {
        // The marker first: before activation every caller receives the
        // refusing composition's answer, whatever credential it presents.
        // Proof: reading it after the evidence check made the booted
        // pre-activation matrix answer a jti-less native session 401 instead
        // of 403 onboarding_inactive (boot-browser-session.db.test.ts,
        // 4 pass, 1 fail, 2026-10-11).
        const memberships = await choices.list(principal.id);
        if (memberships === 'inactive') return { kind: 'inactive' };
        if (principal.delegation !== undefined) return { kind: 'invalid_credential' };
        const evidence = principal.organizationBinding?.credential;
        if (evidence === undefined) return { kind: 'invalid_credential' };
        // Proof: bypassing this lookup let the mounted old-token membership
        // list answer 200 after a second connection committed revocation.
        if (await revocations.isRevoked(evidence)) return { kind: 'invalid_credential' };
        const marked = [];
        for (const member of memberships) {
          const admitted = await admit(principal, member.organizationId);
          marked.push({
            ...member,
            ssoRequired:
              admitted !== null &&
              admitted !== 'not_a_member' &&
              admitted.refusal === 'sso_required',
          });
        }
        return { kind: 'listed', memberships: marked };
      },
      async select(principal, organizationId) {
        // The marker first, as in `list`; the snapshot it returns is the
        // membership check below, so a revoked credential still learns nothing.
        // Proof: the same reordering here alone failed the same matrix
        // (4 pass, 1 fail, 2026-10-11).
        const memberships = await choices.list(principal.id);
        if (memberships === 'inactive') return { kind: 'inactive' };
        if (principal.delegation !== undefined) return { kind: 'invalid_credential' };
        const evidence = principal.organizationBinding?.credential;
        if (evidence === undefined) return { kind: 'invalid_credential' };
        // Proof: bypassing this lookup made the mounted revoked token receive
        // a fresh organization cookie after revocation committed.
        if (await revocations.isRevoked(evidence)) return { kind: 'invalid_credential' };
        // Proof: bypassing this current-membership check made the mounted
        // foreign-selection negative issue a cookie for org-b.
        if (!memberships.some((member) => member.organizationId === organizationId))
          return { kind: 'not_a_member' };
        // Enforced SSO and session policy, before any cookie: a refused
        // selection writes no binding (`organization-sso`).
        // Proof: skipping this admission made `refuses a social identity in
        // the enforced organization only` in
        // `organization-credential-rules.controller.db.test.ts` select A
        // (200 instead of 403); watched 2026-10-12.
        const admitted = await admit(principal, organizationId);
        if (admitted === 'not_a_member') return { kind: 'not_a_member' };
        if (admitted !== null) return { kind: 'refused', refusal: admitted };
        const issued = await cookie.issue(evidence, organizationId);
        return {
          kind: 'selected',
          organizationId,
          cookie: issued.value,
          maxAge: issued.maxAge,
        };
      },
    },
    activeOrganizationOf: async (principal) => {
      const presented = principal.organizationBinding;
      if (presented?.cookie == null) return null;
      // Proof: removing this read made the mounted old token/cookie pair keep
      // listing projects after a different connection committed revocation.
      if (await revocations.isRevoked(presented.credential)) return null;
      return cookie.read(presented.cookie, presented.credential);
    },
  };
}
