import type { MachineActor } from '@wbs/domain';

/**
 * The longest a machine grant lives (`wbs-mcp-agent-surface` M3, M4): mcp-01's
 * 24-hour token cap plus the 60 s by which mcp-01 ends its token before the
 * grant. Independent of the delegation cap, which stays at 300 s.
 */
export const MOST_MACHINE_GRANT_SECONDS = 24 * 60 * 60 + 60;

/** What mcp-01 asks of one grant, in seconds since the epoch. */
export interface MachineGrantRequest {
  /** The `exp` mcp-01 wants: its token's lifetime plus 60 s, jitter applied. */
  readonly requestedExpiresAt: number;
  /** The verified workload assertion's `exp`; null for an API key. */
  readonly assertionExpiresAt: number | null;
  /** The opted-in `wbs_run` (M15); null when the client sent none. */
  readonly runId: string | null;
}

/**
 * One grant be-01 signs (M3): who it acts as, with scopes derived from the
 * credential alone and the lifetime it owns, in whole seconds.
 */
export interface MachineGrantTerms {
  readonly credentialId: string;
  readonly personId: string;
  readonly organizationId: string;
  readonly accountId: string;
  readonly scopes: readonly ('read' | 'write')[];
  readonly runId: string | null;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

/**
 * The terms of the grant an admitted machine credential receives
 * (`wbs-mcp-agent-surface` M3, M4, M15).
 *
 * - `exp` is `min(requested, now + MOST_MACHINE_GRANT_SECONDS, assertion exp)`:
 *   be-01 is the one owner of the lifetime, and an OIDC grant never outlives
 *   its assertion.
 * - Scopes come from the credential's account role, never from the request:
 *   `read` for a `viewer`, `read write` otherwise.
 * - The run is carried through as asked; none is never defaulted.
 *
 * `unknown_identity` when the account is no member of the credential's
 * organization (A5's one refusal); `no_lifetime` when the capped `exp` is not
 * after now.
 */
export function machineGrantTermsOf(
  actor: MachineActor,
  request: MachineGrantRequest,
  now: number,
): MachineGrantTerms | 'unknown_identity' | 'no_lifetime' {
  if (actor.accountRole === null) return 'unknown_identity';
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = Math.min(
    request.requestedExpiresAt,
    issuedAt + MOST_MACHINE_GRANT_SECONDS,
    request.assertionExpiresAt ?? Number.POSITIVE_INFINITY,
  );
  if (expiresAt <= issuedAt) return 'no_lifetime';
  return {
    credentialId: actor.credentialId,
    personId: actor.personId,
    organizationId: actor.organizationId,
    accountId: actor.accountId,
    scopes: actor.accountRole === 'viewer' ? ['read'] : ['read', 'write'],
    runId: request.runId,
    issuedAt,
    expiresAt,
  };
}
