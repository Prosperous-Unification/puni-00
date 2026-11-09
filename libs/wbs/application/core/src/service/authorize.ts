import { type EffectiveRole, may, type Permission } from '@wbs/domain';

import type { AccessDecisions, AccessTarget, ScopedPrincipal } from '../ports/access-decisions';

/** The permission decision; an invisible object reveals no permission or provenance. */
export type Authorization =
  | { readonly ok: true; readonly effective: EffectiveRole }
  | { readonly ok: false; readonly reason: 'not_found' }
  | { readonly ok: false; readonly reason: 'forbidden'; readonly permission: Permission };

/**
 * Evaluates `permission` through the catalog's grant authority (P10, P13).
 * Pass the admitted turn's `stores.accessDecisions` for writes, so the
 * decision sees revocations and membership changes in that transaction.
 * The evaluator owns subject selection, restrictions and the machine cap;
 * no legacy membership role supplies permission here.
 *
 * @throws when the catalog carries no access decisions, or its trusted
 * state cannot be read or validated, including a null organization decision
 * that violates the port contract. No trusted-state fault becomes an admission
 * or a permission refusal.
 */
export async function authorize(
  decisions: AccessDecisions | undefined,
  principal: ScopedPrincipal,
  scope: AccessTarget,
  permission: Permission,
): Promise<Authorization> {
  // Proof: returning ok for an absent port admitted a memory turn in
  // `throws when a memory catalog carries no access decisions`; watched 2026-11-09.
  if (decisions === undefined) throw new Error('the catalog carries no access decisions');
  // Proof: catching this read and admitting failed `propagates unreadable trusted
  // state` and SQLite's `throws when trusted grant state is unreadable`; watched 2026-11-09.
  const effective = await decisions.effectiveRoleAt(principal, scope);
  if (effective === null) {
    // Proof: returning forbidden here failed `throws when an organization decision
    // violates its non-null contract`; watched 2026-11-09.
    if (scope.kind === 'organization')
      throw new Error('the organization access decision is unexpectedly null');
    // Proof: returning forbidden disclosed an invisible object to
    // `answers not_found for an invisible work package` and the real-grant
    // `authorizes an authenticated machine grant through its own persisted grant`;
    // watched 2026-11-09. Controller wiring and its HTTP proof belong to tasks 2.2/3.1.
    return { ok: false, reason: 'not_found' };
  }
  // Proof: bypassing this check admitted a viewer and credential managers in
  // `names the missing permission on a visible work package` and both
  // `resolves a ... principal ... using only its credential grants`; watched 2026-11-09.
  if (!may(effective, permission)) return { ok: false, reason: 'forbidden', permission };
  return { ok: true, effective };
}
