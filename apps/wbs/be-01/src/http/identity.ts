import { userFromHeaders } from '../middleware/authenticated';
import type { DelegationVerifier } from '../runtime/delegation';
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
  const bearer = headers.get('authorization');
  if (bearer?.startsWith('Bearer ') === true) {
    const judged = await delegation(bearer.slice(7), 'wbs-be-01/via-mcp-01');
    // Proof: falling through to the session path on a refusal failed five
    // cases of `delegation.controller.db.test.ts`, a session-key-signed
    // delegation among them; watched 2026-09-28.
    if (judged.kind === 'refused') return null;
    if (judged.kind === 'verified') return judged.principal;
  }
  return userFromHeaders(auth, Object.fromEntries(headers.entries()));
}
