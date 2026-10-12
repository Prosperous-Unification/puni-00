import type { AuditedAct } from './organization-audit';

/** The smallest and largest bound a session policy accepts, in seconds. */
export const SESSION_POLICY_BOUNDS = { least: 300, most: 2_592_000 } as const;

/**
 * An organization's session bounds in seconds (`organization-session-policy`).
 * At least one is set; an organization without a policy has no row.
 */
export interface SessionPolicy {
  readonly maxSessionSeconds: number | null;
  readonly reauthenticateAfterSeconds: number | null;
}

/**
 * Whether `policy` is one a super-admin may store: each bound null or an
 * integer within {@link SESSION_POLICY_BOUNDS}, and the reauthentication bound
 * no larger than the session bound when both are set. Both null clears.
 *
 * Proof: admitting a reauthentication bound larger than the session bound made
 * `refuses an inverted policy` in `session-policies.test.ts` answer true;
 * watched 2026-10-12.
 */
export function isAdmissibleSessionPolicy(policy: SessionPolicy): boolean {
  const bounded = (value: number | null) =>
    value === null ||
    (Number.isSafeInteger(value) &&
      value >= SESSION_POLICY_BOUNDS.least &&
      value <= SESSION_POLICY_BOUNDS.most);
  return (
    bounded(policy.maxSessionSeconds) &&
    bounded(policy.reauthenticateAfterSeconds) &&
    (policy.maxSessionSeconds === null ||
      policy.reauthenticateAfterSeconds === null ||
      policy.reauthenticateAfterSeconds <= policy.maxSessionSeconds)
  );
}

/**
 * Session policies. Writes recheck activation and the actor's super-admin
 * role and write their audit row in one immediate transaction.
 *
 * @throws when trusted state is missing, unreadable or malformed.
 */
export interface SessionPolicies {
  read(
    organizationId: string,
    actorId: string,
  ): Promise<SessionPolicy | null | 'inactive' | 'forbidden'>;
  /** Stores `policy`, or clears it when both bounds are null. */
  set(
    organizationId: string,
    actorId: string,
    policy: SessionPolicy,
    act: AuditedAct,
  ): Promise<'set' | 'cleared' | 'unchanged' | 'inactive' | 'forbidden'>;
}
