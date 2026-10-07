import type { AuthenticatedUser, VerifiedOrganizationCredential } from '@wbs/contracts';
import type { OrganizationPrincipal } from '@wbs/core';

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

/** Shared, per-request revocation lookup for an exact verified browser credential. */
export interface BrowserCredentialRevocations {
  isRevoked(credential: VerifiedOrganizationCredential): Promise<boolean>;
}

export type OrganizationSelectionOutcome =
  | { readonly kind: 'listed'; readonly memberships: readonly MembershipChoice[] }
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
): {
  readonly endpoints: OrganizationSelection;
  readonly activeOrganizationOf: (principal: OrganizationPrincipal) => Promise<string | null>;
} {
  return {
    endpoints: {
      async list(principal) {
        if (principal.delegation !== undefined) return { kind: 'invalid_credential' };
        const evidence = principal.organizationBinding?.credential;
        if (evidence === undefined) return { kind: 'invalid_credential' };
        // Proof: bypassing this lookup let the mounted old-token membership
        // list answer 200 after a second connection committed revocation.
        if (await revocations.isRevoked(evidence)) return { kind: 'invalid_credential' };
        const memberships = await choices.list(principal.id);
        return memberships === 'inactive' ? { kind: 'inactive' } : { kind: 'listed', memberships };
      },
      async select(principal, organizationId) {
        if (principal.delegation !== undefined) return { kind: 'invalid_credential' };
        const evidence = principal.organizationBinding?.credential;
        if (evidence === undefined) return { kind: 'invalid_credential' };
        // Proof: bypassing this lookup made the mounted revoked token receive
        // a fresh organization cookie after revocation committed.
        if (await revocations.isRevoked(evidence)) return { kind: 'invalid_credential' };
        const memberships = await choices.list(principal.id);
        if (memberships === 'inactive') return { kind: 'inactive' };
        // Proof: bypassing this current-membership check made the mounted
        // foreign-selection negative issue a cookie for org-b.
        if (!memberships.some((member) => member.organizationId === organizationId))
          return { kind: 'not_a_member' };
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
