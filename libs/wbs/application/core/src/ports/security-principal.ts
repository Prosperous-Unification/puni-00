import type { OrganizationPrincipal } from './organization-access';

/** Actual authenticated security administrator; never reconstructed from an actor ID or membership role. */
export type SecurityPrincipal = Pick<OrganizationPrincipal, 'id' | 'authentication' | 'delegation'>;

/**
 * Detaches only authorization and nondelegation evidence before any queued await.
 * No session cookie, organization binding, raw token or caller alias is retained.
 * @throws when an audited actor differs from the authenticated principal.
 */
export function retainSecurityPrincipal(
  principal: SecurityPrincipal,
  ...actorIds: readonly string[]
): SecurityPrincipal {
  // Proof: removing equality reached the forbidden owner in 'rejects mismatched session-policy audit identity before acquiring the owner'; killed/restored, 2026-11-09.
  // Proof: removing actor/stamp identity equality (current-actor-coherence) failed `rejects mismatched session-policy audit identity before acquiring the owner`; restored GREEN.
  if (actorIds.some((actorId) => actorId !== principal.id))
    throw new Error('security principal differs from the audited actor');
  // Proof: replacing this deep clone with a shallow projection admitted mutated machine authentication in 'retains queued machine authentication for the security cap independently of caller aliases'; killed/restored, 2026-11-09.
  // Proof: retaining nested caller authentication aliases (current-deep-auth-snapshot) failed `retains queued machine authentication for the security cap independently of caller aliases`; restored GREEN.
  // Proof: cloning the full caller instead of this authority projection (snapshot-exact-security-projection) failed `projects actual security authority without retaining credential binding or secret-shaped extras`; restored GREEN.
  return structuredClone({
    id: principal.id,
    authentication: principal.authentication,
    delegation: principal.delegation,
  });
}
