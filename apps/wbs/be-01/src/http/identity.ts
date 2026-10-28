import { createHash, timingSafeEqual } from 'node:crypto';

import { MCP_INTERNAL_SECRET_HEADER } from '@wbs/contracts';
import type { AuthenticationRefusal } from '@wbs/core/module/authentication/authentication.feature';
import type { AuthenticatedUser, AuthService } from '@wbs/core/service/auth.service';
import { decodeJwt, errors } from 'jose';

import {
  credentialFromHeaders,
  tokenFromHeaders,
  userOrRefusalFromHeaders,
} from '../middleware/authenticated';
import { bearerContextCredential } from '../runtime/bearer-context';
import { declaresDelegation, type DelegationVerifier } from '../runtime/delegation';
import { declaresMachineGrant, type MachineGrantVerifier } from '../runtime/machine-grant';
import { organizationCookieCarrier } from '../runtime/organization-cookie';
import type { VerifiedCredentialOf } from '../runtime/organization-credential';
import type { IdentityResolver } from './endpoint';

/**
 * mcp-01's service identity at be-01 (`wbs-mcp-agent-surface` M3, M14): its
 * dedicated secret, and the verifier of the machine grants it carries.
 */
export interface McpServiceIdentity {
  /** `MCP_BE_INTERNAL_SECRET`; null when not configured, and then nothing meets it. */
  readonly secret: string | null;
  /** Null when no grant key is configured: every grant is then `unknown_grant_key`. */
  readonly verifyGrant: MachineGrantVerifier | null;
  /** The grant keys' secrets, which the app's logger redacts with the service secrets. */
  readonly grantKeySecrets: readonly string[];
}

/** A composition without mcp-01's dedicated secret or grant keys. */
export const NO_MCP_SERVICE: McpServiceIdentity = {
  secret: null,
  verifyGrant: null,
  grantKeySecrets: [],
};

/**
 * Whether a presented secret equals `expected`, comparing SHA-256 digests with
 * `timingSafeEqual`, so the time taken does not depend on where the two
 * differ or on the presented length. An absent side never matches.
 * `expected` is a configured secret, so its digest is computed once here
 * rather than on every request (`wbs-mcp-agent-surface` task 4.5).
 */
export function secretMatcher(expected: string | null): (presented: string | null) => boolean {
  const expectedDigest = expected === null ? null : digestOf(expected);
  return (presented) =>
    presented !== null &&
    expectedDigest !== null &&
    timingSafeEqual(digestOf(presented), expectedDigest);
}

function digestOf(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Resolves one endpoint's declared identity through the existing account boundary.
 * User credentials retain cookie/Bearer precedence and are authenticated once.
 * Internal callers use only the configured x-internal-auth secret and never
 * receive a user principal; mcp-01 on `/internal/mcp/*` uses its dedicated
 * secret or, until the cutover's second release, x-internal-auth
 * (`mcp-internal`), and the dedicated secret alone where grants are issued
 * (`mcp-dedicated`); either missing or wrong is `internal_unauthorized`.
 * Every secret is compared in constant time ({@link secretMatcher}).
 * Unknown verifier/account failures reject unchanged.
 * A Bearer credential declaring itself a delegation is judged by `delegation`
 * alone, for the exact MCP or direct audience declared by its signed claims;
 * any other audience is `invalid_token`. A Bearer declaring itself a machine
 * grant needs mcp-01's dedicated secret beside it, is verified by the grant
 * keys alone, and its credential is reread at every use. No refusal of either
 * falls back to session authentication.
 */
export function identityResolver(
  auth: AuthService,
  internalAuthSecret: string,
  delegation: DelegationVerifier,
  credentialEvidence?: VerifiedCredentialOf,
  mcp: McpServiceIdentity = NO_MCP_SERVICE,
): IdentityResolver {
  const isInternalSecret = secretMatcher(internalAuthSecret);
  const isMcpSecret = secretMatcher(mcp.secret);
  const internalSecretOf = (request: { readonly headers: Headers }) =>
    isInternalSecret(request.headers.get('x-internal-auth'));
  const mcpSecretOf = (request: { readonly headers: Headers }) =>
    isMcpSecret(request.headers.get(MCP_INTERNAL_SECRET_HEADER));
  return async (requirement, request) => {
    if (requirement === 'internal') {
      // Proof: bypassing this comparison returned 200 instead of 401 in the
      // mounted internal-secret test (elysia/identity.test.ts).
      return internalSecretOf(request)
        ? { ok: true, principal: { kind: 'internal' } }
        : { ok: false, status: 401, body: { error: 'unauthorized' } };
    }
    if (requirement === 'mcp-internal' || requirement === 'mcp-dedicated') {
      // Proof: with this admission answering true whatever the headers, and
      // separately with the `mcp-internal` condition dropped (gw-01's
      // x-internal-auth admitted where grants are issued), `answers a missing,
      // wrong or gateway secret internal_unauthorized`
      // (machine-grant.controller.db.test.ts) failed; watched 2026-10-26.
      const admitted =
        mcpSecretOf(request) || (requirement === 'mcp-internal' && internalSecretOf(request));
      // Proof: with the refusal code below set to `unknown_grant_key`, the same
      // test saw that code, which mcp-01 would answer with a re-fetch rather
      // than a reported fault; watched 2026-10-26. The mcp-01 half of that
      // negative waits for task 3.2.
      return admitted
        ? { ok: true, principal: { kind: 'internal' } }
        : { ok: false, status: 401, body: { error: 'internal_unauthorized' } };
    }
    if (requirement === 'gateway-delegation') {
      // Proof: bypassing service authentication made a gateway token without
      // x-internal-auth pass the mounted gateway access test (2026-09-28).
      if (!internalSecretOf(request))
        return { ok: false, status: 401, body: { error: 'unauthorized' } };
      const authorization = request.headers.get('authorization');
      const token = authorization?.startsWith('Bearer ') === true ? authorization.slice(7) : null;
      // Proof (2026-09-28): removing the cookie condition made `refuses a
      // gateway bearer beside a session cookie` answer 204 instead of 401.
      if (
        token === null ||
        !declaresDelegation(token) ||
        credentialFromHeaders({ cookie: request.headers.get('cookie') ?? undefined }).token !== null
      )
        return { ok: false, status: 401, body: { error: 'unauthenticated' } };
      // Proof: selecting the audience from a caller header made the MCP token
      // pass gateway access in the mounted audience test (2026-09-28).
      const judged = await delegation(token, 'wbs-be-01/via-gw-01');
      if (judged.kind !== 'verified')
        return { ok: false, status: 401, body: { error: 'unauthenticated' } };
      // Proof: bypassing read scope changed the mounted gateway test's 403
      // to 204; watched 2026-09-28.
      if (!judged.principal.scopes.includes('read'))
        return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
      return { ok: true, principal: judged.principal };
    }
    if (requirement === 'gateway-browser') {
      // The gateway's own identity first: a browser cookie reaching this route
      // from anywhere but gw-01 proves nothing.
      // Proof: bypassing this comparison let a forwarded browser cookie without
      // x-internal-auth reach the check in `refuses a forwarded browser
      // credential without the gateway secret` (gateway-browser.controller.db.test.ts).
      if (!internalSecretOf(request))
        return { ok: false, status: 401, body: { error: 'unauthorized' } };
      // Only the forwarded browser cookies may prove the principal; a Bearer
      // beside them would make the request's identity ambiguous.
      // Proof: dropping this refusal answered 204 for a gateway request
      // carrying a Bearer instead of the cookie in `refuses a Bearer in place
      // of the forwarded browser cookie` (gateway-browser.controller.db.test.ts).
      if (request.headers.get('authorization') !== null)
        return { ok: false, status: 401, body: { error: 'unauthenticated' } };
    }
    // Proof: Bearer-only resolution selected grace instead of cookie account
    // ada; a second call failed expected 1/received 2; catch(() => null) changed
    // both account-store outage tests from 500 to 401 (elysia/identity.test.ts).
    const principal = await delegatedOrSession(auth, delegation, mcp, isMcpSecret, request.headers);
    // Proof: inventing a fallback account returned 200 instead of 401 in the
    // mounted absent/invalid/retired-credential test (elysia/identity.test.ts).
    if (principal === null) return { ok: false, status: 401, body: { error: 'unauthenticated' } };
    // A verified machine token no account is linked to (`wbs-team-claims` D6b).
    if (principal === 'unknown_identity')
      return { ok: false, status: 401, body: { error: 'unknown_identity' } };
    // A JWT of no trusted issuer, or one its trusted issuer's key set does
    // not verify (`wbs-machine-credentials` A13 step 5).
    if (principal === 'invalid_token')
      return { ok: false, status: 401, body: { error: 'invalid_token' } };
    // A machine grant without mcp-01's dedicated secret, or under no
    // configured key (`wbs-mcp-agent-surface` M3).
    if (principal === 'internal_unauthorized' || principal === 'unknown_grant_key')
      return { ok: false, status: 401, body: { error: principal } };
    let requestPrincipal = principal;
    if (credentialEvidence !== undefined && principal.delegation === undefined) {
      const credential = bearerContextCredential(request.headers);
      if (credential !== null) {
        const evidence = await credentialEvidence(credential, principal);
        if (evidence !== null && evidence.userId === principal.id) {
          // Proof: mutating the authenticated principal made the next request
          // inherit a prior binding when the account adapter reused its object.
          const carrier = organizationCookieCarrier(request.headers);
          requestPrincipal = {
            ...principal,
            organizationBinding: {
              credential: evidence,
              cookie: carrier.kind === 'present' ? carrier.value : null,
            },
          };
        }
      }
    }
    // Proof: independently removing either scope check returned 200 instead
    // of 403 in the mounted scoped-token matrix (elysia/identity.test.ts).
    if (
      ((requirement === 'read-scope' || requirement === 'gateway-browser') &&
        !principal.scopes.includes('read')) ||
      (requirement === 'write-scope' && !principal.scopes.includes('write'))
    ) {
      return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
    }
    return { ok: true, principal: requestPrincipal };
  };
}

/**
 * The principal a delegation or a session credential establishes, or null.
 * Only the Authorization header can carry a delegation; no other header can
 * select an organization, user, client or audience.
 */
async function delegatedOrSession(
  auth: AuthService,
  delegation: DelegationVerifier,
  mcp: McpServiceIdentity,
  isMcpSecret: (presented: string | null) => boolean,
  headers: Headers,
): Promise<
  AuthenticatedUser | AuthenticationRefusal | 'internal_unauthorized' | 'unknown_grant_key' | null
> {
  const flat = Object.fromEntries(headers.entries());
  const bearer = headers.get('authorization');
  const presented = bearer?.startsWith('Bearer ') === true ? bearer.slice(7) : null;
  if (presented !== null && declaresMachineGrant(presented)) {
    // The secret first: a grant alone, lifted from an access token, acts as
    // no one (M14).
    // Proof: with this check removed, `refuses a grant without the secret, or
    // with a wrong one, internal_unauthorized` (machine-grant.controller.db.test.ts)
    // answered 200 with the projects; watched 2026-10-26.
    if (!isMcpSecret(headers.get(MCP_INTERNAL_SECRET_HEADER))) return 'internal_unauthorized';
    // A grant is the request's only credential, as a delegation is.
    // Proof: with this check removed, `refuses a grant beside a session
    // cookie` (machine-grant.controller.db.test.ts) answered 200; watched
    // 2026-10-26.
    if (bearerContextCredential(headers) === null) return null;
    if (mcp.verifyGrant === null) return 'unknown_grant_key';
    const verdict = await mcp.verifyGrant(presented);
    if (verdict.kind === 'unknown_grant_key') return verdict.kind;
    if (verdict.kind === 'refused') return 'invalid_token';
    // Nothing is consumed: a grant is reusable until its `exp`.
    // Proof: with a single-use consume of the grant's `jti` added here, `writes
    // nothing per call: 100 reads, no delegation use and at most one last-use
    // touch` (machine-grant.controller.db.test.ts) answered 401 on a later
    // read; watched 2026-10-26.
    return auth.admitMachineGrant(verdict.claims);
  }
  if (presented !== null && declaresDelegation(presented)) {
    // A delegation is the request's only credential: beside a session cookie,
    // which would otherwise take precedence, the request is ambiguous.
    // Proof (2026-09-28): replacing this raw-cookie check with decoded
    // credentialFromHeaders made `issues a native direct context only for its
    // own current membership` answer 200 for a valid cookie followed by a
    // malformed duplicate beside its signed Bearer. A malformed sole cookie
    // also answered 200 before this fix.
    if (bearerContextCredential(headers) === null) return null;
    // Proof: with every audience but the direct one sent to the via-mcp-01
    // verifier (the former dispatch), `refuses a gateway, grant or unknown
    // audience invalid_token` (delegation.controller.db.test.ts) answered
    // unauthenticated; watched 2026-10-26.
    const audience = delegationAudienceOf(presented);
    if (audience === null) return 'invalid_token';
    const judged = await delegation(presented, audience);
    // Proof: falling through to the session path on a refusal failed five
    // cases of `delegation.controller.db.test.ts`, a session-key-signed
    // delegation among them; watched 2026-09-28.
    return judged.kind === 'verified' ? judged.principal : null;
  }
  const session = tokenFromHeaders(flat);
  // Proof: skipping this made `refuses a delegation carried in the session
  // cookie` in `delegation.controller.db.test.ts` answer 200; watched
  // 2026-09-28.
  if (session !== null && declaresDelegation(session)) return null;
  return userOrRefusalFromHeaders(auth, flat);
}

/**
 * The verifier audience a declared delegation is dispatched to, by its exact
 * scalar `aud` (`wbs-mcp-agent-surface` M3): direct contexts and MCP
 * delegations only. Any other audience, an array or an undecodable token is
 * null, refused `invalid_token` before any verifier reads it.
 */
function delegationAudienceOf(token: string): 'wbs-be-01/direct' | 'wbs-be-01/via-mcp-01' | null {
  let aud: unknown;
  try {
    ({ aud } = decodeJwt(token));
  } catch (cause) {
    if (cause instanceof errors.JOSEError) return null;
    throw cause;
  }
  return aud === 'wbs-be-01/direct' || aud === 'wbs-be-01/via-mcp-01' ? aud : null;
}
