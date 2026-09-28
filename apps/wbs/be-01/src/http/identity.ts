import {
  credentialFromHeaders,
  tokenFromHeaders,
  userFromHeaders,
} from '../middleware/authenticated';
import { declaresDelegation, type DelegationVerifier } from '../runtime/delegation';
import type { AuthenticatedUser, AuthService } from '../service/auth.service';
import type { IdentityResolver } from './endpoint';

/**
 * Resolves one endpoint's declared identity through the existing account boundary.
 * User credentials retain cookie/Bearer precedence and are authenticated once.
 * Internal callers use only the configured x-internal-auth secret and never
 * receive a user principal. Unknown verifier/account failures reject unchanged.
 * A Bearer credential declaring itself a delegation is judged by `delegation`
 * alone, for the MCP audience; its refusal is a 401 and never falls back to
 * session authentication.
 */
export function identityResolver(
  auth: AuthService,
  internalAuthSecret: string,
  delegation: DelegationVerifier,
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
    // Proof: independently removing either scope check returned 200 instead
    // of 403 in the mounted scoped-token matrix (elysia/identity.test.ts).
    if (
      (requirement === 'read-scope' && !principal.scopes.includes('read')) ||
      (requirement === 'write-scope' && !principal.scopes.includes('write'))
    ) {
      return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
    }
    return { ok: true, principal };
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
    if (credentialFromHeaders({ cookie: flat['cookie'] }).token !== null) return null;
    const judged = await delegation(presented, 'wbs-be-01/via-mcp-01');
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
