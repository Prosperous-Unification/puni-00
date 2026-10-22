import type { WbsScope } from './oidc-identity';

/**
 * Who a request is, once a session token has been read and believed.
 *
 * It lives in the contracts library rather than beside the authentication
 * service because four use cases — the command batch, the replay, the save and
 * the retention sweep — admit on it without being about authentication. A type
 * exported from the service makes each of them import a sibling feature, which
 * rule K6 of `docs/superpowers/specs/2026-09-19-code-organization-design.md`
 * forbids; every relevant backend kind may import Contracts.
 *
 * `scopes` is what the token carried, not what the account may ever hold: an
 * older token keeps the scopes it was minted with until it expires.
 */
export interface AuthenticatedUser {
  /** Request evidence installed by the endpoint binding, never authority. */
  organizationOperation?: {
    readonly kind: 'read' | 'mutation';
    readonly expected: ExpectedOrganization;
  };
  id: string;
  username: string;
  scopes: readonly WbsScope[];
  /**
   * The organization a verified WBS-signed delegation or direct context bound this request to.
   * Absent for a session or upstream credential, which carries no
   * organization of its own; see {@link Delegation}.
   */
  delegation?: Delegation;
  /** Verified exact access credential and presented selection cookie, if this request has both carriers. */
  organizationBinding?: {
    readonly credential: VerifiedOrganizationCredential;
    readonly cookie: string | null;
  };
  /**
   * What authenticated this request's credential, for the organization
   * credential rules (enforced SSO and session policy). Absent when nothing
   * is known — a direct context, the local development identity — which
   * every rule treats as failing.
   */
  authentication?: CredentialAuthentication;
}

/**
 * How a credential was authenticated, from its verifier and never from a
 * caller: an upstream pair (a verified provider token, or the pair a
 * delegation carries), a first-party password session and when it was
 * issued, in epoch milliseconds, a WBS machine credential
 * (`wbs-machine-credentials` A10, A13) and the person it is pinned to, or an
 * MCP consent delegation (A8, A20): the human sign-in's upstream pair that
 * opened the family, which the credential rules keep judging (A10), and the
 * `mcp_consent` credential and agent person it acts as.
 */
export type CredentialAuthentication =
  | { readonly kind: 'upstream'; readonly issuer: string; readonly subject: string }
  | { readonly kind: 'first_party'; readonly issuedAt: number }
  | { readonly kind: 'machine'; readonly credentialId: string; readonly personId: string }
  | {
      readonly kind: 'consent';
      readonly issuer: string;
      readonly subject: string;
      readonly credentialId: string;
      readonly personId: string;
    };

/**
 * The verified `(issuer, subject)` a request's credential carries: an upstream
 * token's, or the pair a delegation carries. Absent for a first-party session.
 * What a claim reads a credential pin by (`wbs-team-claims` D6).
 */
export interface CredentialPair {
  readonly issuer: string;
  readonly subject: string;
}

/**
 * What a claim reads a request's pin from: an upstream pair, whose pin is the
 * operator link's `external_identity.person_id` (`wbs-team-claims` D6), or a
 * machine or consent credential's own person (`wbs-machine-credentials` A12,
 * A20).
 */
export type CredentialPin = CredentialPair | { readonly personId: string };

/**
 * The pin source of `authentication`: the pair of an upstream one, the person
 * of a machine or consent credential, else null (unpinned). A consent
 * delegation is pinned by its credential's person, never by the human's pair.
 *
 * Proof: answering null for a machine credential made `claims as its person
 * and is refused as any other of its account's persons` in
 * `machine-credential.controller.db.test.ts` accept the claim as `codex`;
 * watched 2026-10-22. Answering null for a consent made `a consent session's
 * tool call claims as its agent, never with the human's reach` (mcp-01
 * `organization-delegation.boot.test.ts`) accept the claim as `codex`;
 * watched 2026-10-22.
 */
export function credentialPinOf(
  authentication: CredentialAuthentication | undefined,
): CredentialPin | null {
  if (authentication?.kind === 'upstream')
    return { issuer: authentication.issuer, subject: authentication.subject };
  if (authentication?.kind === 'machine' || authentication?.kind === 'consent')
    return { personId: authentication.personId };
  return null;
}

/** Evidence from the credential verifier, never from caller-declared kind or expiry. */
export interface VerifiedOrganizationCredential {
  readonly kind: 'native' | 'oidc';
  readonly userId: string;
  readonly digest: string;
  readonly expiresAt: number;
}

/** Who may present a delegation, as its `aud` names it; see {@link Delegation}. */
export const DELEGATION_AUDIENCES = [
  'wbs-be-01/via-mcp-01',
  'wbs-be-01/via-gw-01',
  'wbs-be-01/direct',
] as const;

export type DelegationAudience = (typeof DELEGATION_AUDIENCES)[number];

/**
 * What a verified delegation or direct context (task 2.5) binds a request to. Its
 * signature, audience, lifetime and identity binding were checked by be-01's
 * delegation verifier; nothing here comes from a caller header, and a header
 * can never select any of it.
 */
export type Delegation =
  | { readonly organizationId: string; readonly audience: 'wbs-be-01/direct' }
  | {
      readonly organizationId: string;
      readonly audience: Exclude<DelegationAudience, 'wbs-be-01/direct'>;
      /** The OAuth client the delegating service acted for. */
      readonly client: string;
      /** The grant or refresh family the delegating service's credential belongs to. */
      readonly grant: string;
    };

/**
 * The gateway or another trusted process, admitted by the internal adapter.
 *
 * It carries no id on purpose. An internal caller acts for the deployment, not
 * for a person, and a field to put a person in would be one somebody fills.
 */
export interface InternalIdentity {
  kind: 'internal';
}

/** The HTTP carrier preserves absence and malformed evidence independently of authority. */
export type ExpectedOrganization =
  | { readonly kind: 'absent' | 'invalid' }
  | { readonly kind: 'present'; readonly organizationId: string };
