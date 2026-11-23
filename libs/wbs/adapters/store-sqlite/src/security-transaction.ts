import { authorize, type SecurityPrincipal } from '@wbs/core';

import { AccessDecisionRepository } from './access-decisions';
import { type Drizzle, drizzleOuterTransaction } from './db';
import type { Gate } from './gate';
import { readOrganizationActivation } from './organization-activation';

/**
 * Owns one async security operation on the gate's connection. Native synchronous
 * transaction callbacks cannot retain ownership across an awaited grant decision.
 * Call only as an outer owner; borrowed identity/rank helpers never acquire a second gate.
 * @throws on trusted-state or SQLite failures; a failed rollback preserves both failures.
 */
export function runSecurityTransaction<T>(
  db: Drizzle,
  gate: Gate,
  work: (tx: Drizzle) => Promise<T>,
): Promise<T> {
  // Proof: bypassing the gate settled the held invocation in 'rechecks a queued security grant before session-policy set'; killed/restored, 2026-11-09.
  // Proof: bypassing the current writer gate (owner-current-gate) failed `rechecks a queued security grant before session-policy set`; restored GREEN.
  return gate.enter(async () => {
    const transaction = drizzleOuterTransaction(db);
    // Proof: removing BEGIN broke 'rolls session policy back when its audit write fails after the grant check'; killed/restored, 2026-11-09.
    // Proof: omitting BEGIN IMMEDIATE (owner-current-begin) failed `rolls session policy back when its audit write fails after the grant check`; restored GREEN.
    transaction.begin();
    try {
      // Proof: dropping await left the policy after the late audit fault in that production-writer negative; killed/restored, 2026-11-09.
      // Proof: committing before the awaited operation settles (owner-current-await-work) failed `rolls session policy back when its audit write fails after the grant check`; restored GREEN.
      const outcome = await work(db);
      // Proof: omitting commit hid the written policy from the independent mounted fixture connection; named PUT success failed, killed/restored, 2026-11-09.
      // Proof: omitting commit (owner-current-commit) failed `uses a minimal security grant instead of a viewer role for session-policy PUT`; restored GREEN.
      transaction.commit();
      return outcome;
    } catch (failure) {
      try {
        // Proof: omitting rollback left policy state after 'rolls session policy back when its audit write fails after the grant check'; killed/restored, 2026-11-09.
        // Proof: omitting rollback after a late audit failure (owner-current-rollback) failed `rolls session policy back when its audit write fails after the grant check`; restored GREEN.
        transaction.rollback();
      } catch (rollbackFailure) {
        // Proof: discarding the original failure broke 'preserves both session-policy and rollback failures from the current owner'; killed/restored, 2026-11-09.
        throw new AggregateError(
          // Proof: discarding the original failure when rollback also fails (owner-current-paired-failure) failed `preserves both session-policy and rollback failures from the current owner`; restored GREEN.
          [failure, rollbackFailure],
          'security operation and rollback failed',
          { cause: rollbackFailure },
        );
      }
      throw failure;
    }
  });
}

/** Current grant and fixed credential cap, read on the operation owner's connection. */
export async function readSecurityRefusal(
  db: Drizzle,
  organizationId: string,
  principal: SecurityPrincipal,
): Promise<'inactive' | 'forbidden' | null> {
  if (readOrganizationActivation(db) !== 'activated') return 'inactive';
  // Proof: converting corrupt grant state into forbidden (grant-state-no-fallback-corrupt) failed `throws on corrupt grant permissions before session-policy GET`; restored GREEN.
  // Proof: converting missing grant state into forbidden (grant-state-no-fallback-missing) failed `throws when session-policy read cannot read grant state`; restored GREEN.
  const decision = await authorize(
    new AccessDecisionRepository(db),
    principal,
    { kind: 'organization', organizationId },
    'organization.manage_security',
  );
  // Proof: removing this check admitted an effective personal grant in 'refuses a delegated human security grant at the direct session-policy writer'; killed/restored, 2026-11-09.
  // Proof: admitting an effective delegated human grant (current-common-nondelegation) failed `refuses a delegated human security grant at the direct session-policy writer`; restored GREEN.
  if (principal.delegation !== undefined) return 'forbidden';
  // Proof: bypassing this current decision admitted a role-only super-admin through the actual session-policy PUT route; killed/restored, 2026-11-09.
  // Proof: ignoring the current grant decision (current-common-grant-decision) failed `encodes manage_security for a role-only super-admin on session-policy PUT`; restored GREEN.
  return decision.ok ? null : 'forbidden';
}
