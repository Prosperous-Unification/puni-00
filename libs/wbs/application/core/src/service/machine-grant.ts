import { MACHINE_SCOPES, type MachineActor } from '@wbs/domain';

/**
 * The longest a machine grant lives (`wbs-mcp-agent-surface` M3, M4): mcp-01's
 * 24-hour token cap plus the 60 s by which mcp-01 ends its token before the
 * grant. Independent of the delegation cap, which stays at 300 s.
 */
export const MOST_MACHINE_GRANT_SECONDS = 24 * 60 * 60 + 60;

/** The bounds one grant's terms are decided within, in seconds since the epoch. */
export interface MachineGrantBounds {
  /** The `exp` mcp-01 wants: its token's lifetime plus 60 s, jitter applied. */
  readonly requestedExpiresAt: number;
  /** The verified workload assertion's `exp`; null for an API key. */
  readonly assertionExpiresAt: number | null;
  /** The matched API-key secret's expiry (a rotation window's end); null when none. */
  readonly secretExpiresAt: number | null;
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
 * - `exp` is `min(requested, now + MOST_MACHINE_GRANT_SECONDS, assertion exp,
 *   secret expiry)`, floored to a whole second: be-01 is the one owner of the
 *   lifetime, an OIDC grant never outlives its assertion, and a key's grant
 *   never outlives the rotated secret that minted it.
 * - Fresh scopes are the fixed read/write {@link MACHINE_SCOPES} envelope.
 *   Actual operations still require the credential's own grants under the contributor cap.
 * - The run is carried through as asked; none is never defaulted.
 *
 * `unknown_identity` when the account is no member of the credential's
 * organization (A5's one refusal); `no_lifetime` when the capped `exp` is not
 * after now.
 */
export function machineGrantTermsOf(
  actor: MachineActor,
  request: MachineGrantBounds,
  now: number,
): MachineGrantTerms | 'unknown_identity' | 'no_lifetime' {
  // Proof: terms-current-member; bypassed current membership refusal.
  // 'uses fixed machine scopes for current members and refuses missing membership' (machine-grant.test.ts) failed; restored GREEN, 2026-11-10.
  if (!actor.accountIsMember) return 'unknown_identity';
  const issuedAt = Math.floor(now / 1000);
  // Proof: with the secret term dropped, `never outlives the rotated secret
  // that minted it` (be-01 machine-grant.controller.db.test.ts) issued the
  // requested 12 hours; without the floor, `floors a fractional request`
  // (machine-grant.test.ts) answered a fractional exp; watched 2026-10-26.
  const expiresAt = Math.floor(
    Math.min(
      request.requestedExpiresAt,
      issuedAt + MOST_MACHINE_GRANT_SECONDS,
      request.assertionExpiresAt ?? Number.POSITIVE_INFINITY,
      request.secretExpiresAt ?? Number.POSITIVE_INFINITY,
    ),
  );
  if (expiresAt <= issuedAt) return 'no_lifetime';
  return {
    credentialId: actor.credentialId,
    personId: actor.personId,
    organizationId: actor.organizationId,
    accountId: actor.accountId,
    // Proof: machine-issue-envelope; narrowed the fresh envelope to read only.
    // 'issues the fixed machine envelope independently of a viewer compatibility label' (machine-grant.controller.db.test.ts) failed; restored GREEN, 2026-11-10.
    // Proof: machine-issue-fresh-array; returned shared MACHINE_SCOPES instead of a fresh array.
    // 'keeps later machine grant terms independent of a previously returned scope array' (machine-grant.test.ts) failed; restored GREEN, 2026-11-10.
    scopes: [...MACHINE_SCOPES],
    runId: request.runId,
    issuedAt,
    expiresAt,
  };
}
