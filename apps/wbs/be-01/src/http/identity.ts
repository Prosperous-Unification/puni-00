import type { AuthenticatedUser, AuthService } from '@wbs/core/service/auth.service';
import { decodeJwt, errors } from 'jose';

import {
  credentialFromHeaders,
  tokenFromHeaders,
  userFromHeaders,
} from '../middleware/authenticated';
import { bearerContextCredential } from '../runtime/bearer-context';
import { declaresDelegation, type DelegationVerifier } from '../runtime/delegation';
import { organizationCookieCarrier } from '../runtime/organization-cookie';
import type { VerifiedCredentialOf } from '../runtime/organization-credential';
import type { IdentityResolver } from './endpoint';

/**
 * Resolves one endpoint's declared identity through the existing account boundary.
 * User credentials retain cookie/Bearer precedence and are authenticated once.
 * Internal callers use only the configured x-internal-auth secret and never
 * receive a user principal. Unknown verifier/account failures reject unchanged.
 * A Bearer credential declaring itself a delegation is judged by `delegation`
 * alone, for the fixed MCP or direct audience declared by its signed claims;
 * its refusal is a 401 and never falls back to session authentication.
 */
export function identityResolver(
  auth: AuthService,
  internalAuthSecret: string,
  delegation: DelegationVerifier,
  credentialEvidence?: VerifiedCredentialOf,
): IdentityResolver {
  return async (requirement, request) => {
    if (requirement === 'internal') {
      // Proof: bypassing this comparison returned 200 instead of 401 in the
      // mounted internal-secret test (elysia/identity.test.ts).
      return request.headers.get('x-internal-auth') === internalAuthSecret
        ? { ok: true, principal: { kind: 'internal' } }
        : { ok: false, status: 401, body: { error: 'unauthorized' } };
    }
    if (requirement === 'gateway-delegation') {
      // Proof: bypassing service authentication made a gateway token without
      // x-internal-auth pass the mounted gateway access test (2026-09-28).
      if (request.headers.get('x-internal-auth') !== internalAuthSecret)
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
    // Proof: Bearer-only resolution selected grace instead of cookie account
    // ada; a second call failed expected 1/received 2; catch(() => null) changed
    // both account-store outage tests from 500 to 401 (elysia/identity.test.ts).
    const principal = await delegatedOrSession(auth, delegation, request.headers);
    // Proof: inventing a fallback account returned 200 instead of 401 in the
    // mounted absent/invalid/retired-credential test (elysia/identity.test.ts).
    if (principal === null) return { ok: false, status: 401, body: { error: 'unauthenticated' } };
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
      (requirement === 'read-scope' && !principal.scopes.includes('read')) ||
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
  headers: Headers,
): Promise<AuthenticatedUser | null> {
  const flat = Object.fromEntries(headers.entries());
  const bearer = headers.get('authorization');
  const presented = bearer?.startsWith('Bearer ') === true ? bearer.slice(7) : null;
  if (presented !== null && declaresDelegation(presented)) {
    // A delegation is the request's only credential: beside a session cookie,
    // which would otherwise take precedence, the request is ambiguous.
    // Proof (2026-09-28): replacing this raw-cookie check with decoded
    // credentialFromHeaders made `issues a native direct context only for its
    // own current membership` answer 200 for a valid cookie followed by a
    // malformed duplicate beside its signed Bearer. A malformed sole cookie
    // also answered 200 before this fix.
    if (bearerContextCredential(headers) === null) return null;
    const judged = await delegation(presented, directAudienceOf(presented));
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
  return userFromHeaders(auth, flat);
}

/** Dispatches a declared direct context only to its fixed verifier audience. */
function directAudienceOf(token: string): 'wbs-be-01/direct' | 'wbs-be-01/via-mcp-01' {
  try {
    return decodeJwt(token).aud === 'wbs-be-01/direct'
      ? 'wbs-be-01/direct'
      : 'wbs-be-01/via-mcp-01';
  } catch (cause) {
    if (cause instanceof errors.JOSEError) return 'wbs-be-01/via-mcp-01';
    throw cause;
  }
}
