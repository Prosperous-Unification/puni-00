import type { CredentialRuleFacts } from '@wbs/core';

import type { ConsentBinding, CredentialBinding, FamilyRecord } from './session-store';

/** Immutable identity supplied to the independently trusted authority boundary. */
export interface McpRefreshAuthority {
  readonly familyId: string;
  readonly clientId: string;
  readonly subject: string;
  readonly scope: string;
  readonly credentialEpoch: number;
  readonly binding: CredentialBinding;
  /** The agent person and consent credential a consent family acts as (A20). */
  readonly consent?: ConsentBinding;
}

/**
 * Reads current membership and verified issuer-subject ownership together with current
 * proven SSO connections, policy and independently trusted grant lifecycle evidence.
 * An admitted read must echo the identity it actually verified. Missing/malformed trusted
 * state throws; only a modeled service outage returns unavailable. Production composes
 * be-01's family authority read (`organization-authority.ts`) when mcp-01 has
 * `INTERNAL_AUTH_SECRET`.
 */
export type McpRefreshAuthorityReader = (authority: McpRefreshAuthority) => Promise<
  | { readonly outcome: 'denied' }
  | { readonly outcome: 'unavailable' }
  | {
      readonly outcome: 'admitted';
      readonly authority: McpRefreshAuthority;
      readonly facts: CredentialRuleFacts;
    }
>;

/**
 * Compares all immutable authority fields; provider rotation changes none of them.
 * Proof: 2026-10-13, omitting each of the eight comparisons separately made all three
 * corresponding `checks substituted <field>` production-path negatives release credentials.
 * The consent comparison has no negative: the reader passes the caller's consent through and
 * nothing substitutes it; the store's immutability trigger keeps a family's consent fixed.
 */
export function matchesRefreshAuthority(
  authority: McpRefreshAuthority,
  family: FamilyRecord,
): boolean {
  return (
    authority.familyId === family.familyId &&
    authority.clientId === family.clientId &&
    authority.subject === family.subject &&
    authority.scope === family.scope &&
    authority.credentialEpoch === family.credentialEpoch &&
    authority.binding.organizationId === family.binding?.organizationId &&
    authority.binding.userId === family.binding.userId &&
    authority.binding.issuer === family.binding.issuer &&
    authority.consent?.personId === family.consent?.personId &&
    authority.consent?.credentialId === family.consent?.credentialId
  );
}
