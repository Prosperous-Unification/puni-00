import type { AuthenticatedUser, WbsScope } from '@wbs/contracts';
import type {
  CredentialRuleFacts,
  OrganizationAccess,
  OrganizationPrincipal,
  RefusedOrganizationAccess,
} from '@wbs/core';
import { decodeJwt } from 'jose';

import type { MappedUserOf } from './delegation';
import { DelegationSourceIneligible, signDelegation } from './delegation-issuer';
import type { OrganizationChoices } from './organization-selection';

/** The only audience an MCP delegation is ever issued for; never a caller's choice. */
export const MCP_DELEGATION_AUDIENCE = 'wbs-be-01/via-mcp-01';

/** Who an organization list or delegation is for: the user's own upstream access token. */
type Authenticate = (token: string) => Promise<AuthenticatedUser | 'unknown_identity' | null>;

/** The organizations an MCP consent may bind, or why none can be listed. */
export type McpOrganizationsOutcome =
  | { readonly kind: 'pre_activation' }
  | {
      readonly kind: 'listed';
      readonly userId: string;
      readonly memberships: readonly {
        readonly organizationId: string;
        readonly name: string;
        readonly role: 'super_admin' | 'admin' | 'member' | 'viewer';
      }[];
    }
  | { readonly kind: 'unauthenticated' | 'unknown_identity' | 'inactive' };

/** What mcp-01 asks a delegation for: its session's bound family, read from its own store. */
export interface McpDelegationRequest {
  readonly organizationId: string;
  readonly userId: string;
  readonly client: string;
  readonly grant: string;
  readonly scopes: readonly WbsScope[];
}

export type McpDelegationOutcome =
  | { readonly kind: 'issued'; readonly token: string }
  | {
      readonly kind:
        | 'unauthenticated'
        | 'unknown_identity'
        | 'inactive'
        | 'binding_changed'
        | 'insufficient_scope';
    }
  | { readonly kind: 'refused'; readonly refusal: RefusedOrganizationAccess };

/** One bound family's identity, as mcp-01 stored it at consent. */
export interface McpAuthorityRequest {
  readonly issuer: string;
  readonly subject: string;
  readonly userId: string;
  readonly organizationId: string;
}

export type McpAuthorityOutcome =
  | { readonly kind: 'denied' }
  | ({ readonly kind: 'admitted' } & McpAuthorityRequest &
      Pick<CredentialRuleFacts, 'enforced' | 'policy'>);

/** be-01's side of MCP organization delegation; see {@link mcpDelegationAuthority}. */
export interface McpDelegationAuthority {
  organizationsOf(upstreamToken: string): Promise<McpOrganizationsOutcome>;
  issue(upstreamToken: string, request: McpDelegationRequest): Promise<McpDelegationOutcome>;
  authorityOf(request: McpAuthorityRequest): Promise<McpAuthorityOutcome>;
}

/**
 * The membership role and credential-rule facts of one principal in one
 * organization now, or null for no membership: `SqliteOrganizationAccess`.
 */
export type CredentialFactsOf = (
  principal: OrganizationPrincipal,
  organizationId: string,
) => Promise<{ readonly facts: CredentialRuleFacts } | null>;

/**
 * A composition with no delegation authority: nothing is listed, issued or
 * admitted. `buildApp` mounts it when no authority is supplied, so the routes
 * exist and answer the same refusal everywhere.
 */
export const REFUSE_MCP_DELEGATION: McpDelegationAuthority = {
  organizationsOf: () => Promise.resolve({ kind: 'inactive' }),
  issue: () => Promise.resolve({ kind: 'inactive' }),
  authorityOf: () => Promise.resolve({ kind: 'denied' }),
};

/**
 * MCP organization delegation (`organization-ownership-and-access` 2.5, 6.4, 6.6).
 *
 * mcp-01 never holds the signing key. For every be-01 call a bound MCP session
 * makes, it presents the user's own upstream access token here and receives a
 * single-use, at most five-minute `wbs-be-01/via-mcp-01` delegation naming the
 * local user, the organization, mcp-01's OAuth client and grant (refresh
 * family) and the narrowed scopes, bound to the verified upstream
 * `(issuer, subject)`. be-01's delegation verifier then checks signature,
 * audience, identity mapping and one use, and organization access rechecks
 * the activation marker, current membership and credential rules.
 *
 * Before activation nothing is listed or issued: mcp-01 keeps forwarding the
 * upstream token exactly as it did. Without a signing key the routes answer
 * `inactive` after activation, which mcp-01 treats as a configuration fault.
 *
 * @throws unexpected verifier, store or marker failures unchanged.
 */
export function mcpDelegationAuthority(deps: {
  readonly authenticate: Authenticate;
  readonly choices: OrganizationChoices;
  readonly organizations: OrganizationAccess;
  readonly credentialFactsOf: CredentialFactsOf;
  readonly mappedUserOf: MappedUserOf;
  readonly isMember: (userId: string, organizationId: string) => Promise<boolean>;
  readonly activationState: () => 'pre_activation' | 'activated';
  readonly signingKey: CryptoKey | null;
  readonly now?: () => number;
}): McpDelegationAuthority {
  const now = deps.now ?? Date.now;
  return {
    async organizationsOf(upstreamToken) {
      const verified = await verifiedUpstream(deps.authenticate, upstreamToken);
      if (verified.kind !== 'verified') return verified;
      const listed = await deps.choices.list(verified.principal.id);
      // Proof: answering an empty list for the inactive marker made `lists
      // nothing and issues nothing before activation` in
      // `mcp-delegation.boot.db.test.ts` answer `activated`; watched 2026-10-21.
      if (listed === 'inactive') return { kind: 'pre_activation' };
      // Proof: dropping this made `answers delegation_inactive after activation
      // without a key pair` list memberships; watched 2026-10-21.
      if (deps.signingKey === null) return { kind: 'inactive' };
      const memberships = [];
      for (const membership of listed) {
        // The same rules a later delegation of this consent meets: membership,
        // enforced SSO and session policy for a delegated credential. Those
        // rules read only that a delegation is present, never its client or
        // grant, which do not exist before the code exchange.
        const resolved = await deps.organizations.resolve(
          delegatedPrincipal(verified.principal, membership.organizationId, 'consent', 'consent'),
        );
        if (resolved.ok) memberships.push(membership);
      }
      return { kind: 'listed', userId: verified.principal.id, memberships };
    },

    async issue(upstreamToken, request) {
      const verified = await verifiedUpstream(deps.authenticate, upstreamToken);
      if (verified.kind !== 'verified') return verified;
      const { principal, expiresAt, upstream } = verified;
      // Proof: dropping this refusal failed `lists nothing and issues nothing
      // before activation` (403 no_active_organization) and `answers
      // delegation_inactive after activation without a key pair` (a signing
      // TypeError) in `mcp-delegation.boot.db.test.ts`; watched 2026-10-21.
      if (deps.activationState() === 'pre_activation' || deps.signingKey === null)
        return { kind: 'inactive' };
      // Proof: dropping this comparison made `refuses a token that now maps
      // to another account` in `mcp-delegation.boot.db.test.ts` issue ada a
      // delegation under the binding grace's session claimed; watched 2026-10-21.
      if (principal.id !== request.userId) return { kind: 'binding_changed' };
      // The client's grant only narrows what the token's own account holds.
      // Proof: requesting the grant's scopes unnarrowed, and separately
      // dropping the empty refusal, each failed `narrows scopes to the token
      // and refuses none in common` in `mcp-delegation.boot.db.test.ts`: the
      // signer refused the over-ceiling request, and the empty one answered
      // not_a_member instead of insufficient_scope; watched 2026-10-21.
      const scopes = request.scopes.filter((scope) => principal.scopes.includes(scope));
      if (scopes.length === 0) return { kind: 'insufficient_scope' };
      // Proof: replacing this resolution with an admitting one made `refuses a
      // delegation the organization's credential rules refuse` in
      // `mcp-delegation.boot.db.test.ts` issue under a session policy; the
      // nonmember case is also refused by the signer's membership check.
      // Watched 2026-10-21.
      const resolved = await deps.organizations.resolve(
        delegatedPrincipal(principal, request.organizationId, request.client, request.grant),
      );
      if (!resolved.ok) return { kind: 'refused', refusal: resolved };
      // One clock reading for this check and the signer, so a token cannot
      // expire between them and be reported as a removed member below.
      const issuedAt = now();
      // Proof: see `mcp-delegation.test.ts`; without this the signer refuses an
      // expired source as ineligible, read below as a removed member.
      if (expiresAt <= issuedAt) return { kind: 'unauthenticated' };
      try {
        const token = await signDelegation(
          deps.signingKey,
          {
            kind: 'verified-wbs-credential',
            delegated: false,
            credentialExpiresAt: expiresAt,
            userId: principal.id,
            organizationId: request.organizationId,
            scopeCeiling: principal.scopes,
            client: request.client,
            grant: request.grant,
            upstreamIssuer: upstream.issuer,
            upstreamSubject: upstream.subject,
          },
          MCP_DELEGATION_AUDIENCE,
          scopes,
          deps.isMember,
          () => issuedAt,
        );
        return { kind: 'issued', token };
      } catch (cause) {
        // Every other eligibility condition was checked above; what remains is
        // a membership removed between resolution and signing.
        if (cause instanceof DelegationSourceIneligible)
          return { kind: 'refused', refusal: { ok: false, refusal: 'not_a_member' } };
        throw cause;
      }
    },

    async authorityOf(request) {
      // Proof: dropping this made `lists nothing and issues nothing before
      // activation` admit a pre-activation membership; watched 2026-10-21.
      if (deps.activationState() === 'pre_activation') return { kind: 'denied' };
      const mapped = await deps.mappedUserOf({ issuer: request.issuer, subject: request.subject });
      // Proof: dropping this comparison made `denies a family whose upstream
      // pair maps to another account` in `mcp-delegation.boot.db.test.ts`
      // answer admitted; watched 2026-10-21.
      if (mapped?.id !== request.userId) return { kind: 'denied' };
      const read = await deps.credentialFactsOf(
        {
          id: request.userId,
          authentication: { kind: 'upstream', issuer: request.issuer, subject: request.subject },
        },
        request.organizationId,
      );
      // Proof: answering admitted without this membership read made `denies a
      // removed member's family and refuses its next delegation` in
      // `mcp-delegation.boot.db.test.ts`
      // answer admitted; watched 2026-10-21.
      if (read === null) return { kind: 'denied' };
      return {
        kind: 'admitted',
        ...request,
        enforced: read.facts.enforced,
        policy: read.facts.policy,
      };
    },
  };
}

/**
 * A principal shaped as the delegation this consent or call will carry, so
 * organization access applies the delegated credential rules (no browser
 * lifecycle, the upstream pair that authenticated it) and takes this
 * organization rather than any session binding.
 */
function delegatedPrincipal(
  principal: AuthenticatedUser,
  organizationId: string,
  client: string,
  grant: string,
): OrganizationPrincipal {
  return {
    id: principal.id,
    authentication: principal.authentication,
    delegation: { organizationId, audience: MCP_DELEGATION_AUDIENCE, client, grant },
  };
}

type VerifiedUpstream =
  | {
      readonly kind: 'verified';
      readonly principal: AuthenticatedUser;
      readonly upstream: { readonly issuer: string; readonly subject: string };
      /** Verified upstream access-token expiry, epoch milliseconds. */
      readonly expiresAt: number;
    }
  | { readonly kind: 'unauthenticated' | 'unknown_identity' };

/**
 * The account and upstream pair one presented upstream access token proves.
 * A first-party session or a token without a numeric `exp` proves nothing
 * here: only a verified provider identity can be delegated. A WBS delegation
 * verifies as neither an upstream nor a session token, so it is refused
 * as unauthenticated without a check of its own.
 */
async function verifiedUpstream(
  authenticate: Authenticate,
  token: string,
): Promise<VerifiedUpstream> {
  const principal = await authenticate(token);
  if (principal === null) return { kind: 'unauthenticated' };
  if (principal === 'unknown_identity') return { kind: 'unknown_identity' };
  const authentication = principal.authentication;
  // Proof: admitting a first-party session made `refuses an unlinked token, a
  // native session and an expired upstream token` in
  // `mcp-delegation.boot.db.test.ts` issue a delegation; watched 2026-10-21.
  if (authentication?.kind !== 'upstream') return { kind: 'unauthenticated' };
  // `authenticate` has just verified these exact bytes with the OIDC
  // verifier, signature and `exp` included, so reading `exp` back from them
  // reads a verified claim; the identity port does not return it.
  const { exp } = decodeJwt(token);
  // Proof: removing this made `refuses a verified token that carries no
  // numeric expiry` (`mcp-delegation.test.ts`) throw; watched 2026-10-21.
  if (typeof exp !== 'number') return { kind: 'unauthenticated' };
  return {
    kind: 'verified',
    principal,
    upstream: { issuer: authentication.issuer, subject: authentication.subject },
    expiresAt: exp * 1000,
  };
}
