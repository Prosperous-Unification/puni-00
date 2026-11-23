import { type EffectiveRole, may, type Permission } from '@wbs/domain';

import type { AccessDecisions, AccessTarget, ScopedPrincipal } from '../ports/access-decisions';
import type { ResourceAccess } from '../ports/organization-access';
import type { WorkPackage, WorkPackagePatch } from '../ports/work-package-store';

/** The permission decision; an invisible object reveals no permission or provenance. */
export type Authorization =
  | { readonly ok: true; readonly effective: EffectiveRole }
  | { readonly ok: false; readonly reason: 'not_found' }
  | { readonly ok: false; readonly reason: 'forbidden'; readonly permission: Permission };

/**
 * Requires the current owner's grant evaluator.
 * @throws when the admitted catalog lacks its required access-decision port.
 */
export function requireAccessDecisions(decisions: AccessDecisions | undefined): AccessDecisions {
  // Proof: removing this boundary changed the actual Memory absent-port refusal to an
  // incidental TypeError in `throws when a memory catalog carries no access decisions`;
  // exact restore passed (verification-project-shell-read-20261119.json).
  if (decisions === undefined) throw new Error('the catalog carries no access decisions');
  return decisions;
}

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
  decisions = requireAccessDecisions(decisions);
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
    // watched 2026-11-09. Returning forbidden also made the mounted `answers the same HTTP404 for an invisible and an absent work package` answer403; restored green 2026-11-09.
    return { ok: false, reason: 'not_found' };
  }
  // Proof: bypassing this check admitted a viewer and credential managers in
  // `names the missing permission on a visible work package` and both
  // `resolves a ... principal ... using only its credential grants`; watched 2026-11-09.
  if (!may(effective, permission)) return { ok: false, reason: 'forbidden', permission };
  return { ok: true, effective };
}

/** The shared actor boundary for general and already-captured package targets. */
function assertPackageActor(
  access: Extract<ResourceAccess, { kind: 'scoped' }>,
  actorId: string,
): void {
  // Proof: package-actor-coherence fault failed 'scoped step service preserves exact grant scope' (step.routes.test.ts); restored GREEN, 2026-11-09.
  if (access.principal.id !== actorId || access.scope.userId !== actorId)
    throw new Error('package permission principal differs from the acting account');
}

/** Authorizes one already-retained actual target; never re-queries or rebuilds its space. */
export function authorizePackageAt(
  decisions: AccessDecisions | undefined,
  access: Extract<ResourceAccess, { kind: 'scoped' }>,
  target: Extract<AccessTarget, { kind: 'work_package' }>,
  actorId: string,
  permission: Permission,
): Promise<Authorization> {
  assertPackageActor(access, actorId);
  if (target.chain.organizationId !== access.scope.organizationId)
    return Promise.resolve({ ok: false, reason: 'not_found' });
  return authorize(decisions, access.principal, target, permission);
}

/** General DTO callers obtain the actual narrow current target on the same admitted owner. */
export async function authorizePackage(
  decisions: AccessDecisions | undefined,
  access: Extract<ResourceAccess, { kind: 'scoped' }>,
  workPackage: Pick<WorkPackage, 'id'>,
  actorId: string,
  permission: Permission,
): Promise<Authorization> {
  access = structuredClone(access);
  const id = workPackage.id;
  assertPackageActor(access, actorId);
  if (decisions === undefined) throw new Error('the catalog carries no access decisions');
  const target = await decisions.packageTargetOf(id, access.scope.organizationId);
  return target === null
    ? { ok: false, reason: 'not_found' }
    : authorizePackageAt(decisions, access, target, actorId, permission);
}

/** A restricted-package recovery clears only its flag; all other settings require the package permission. */
export async function authorizePackageSettings(
  decisions: AccessDecisions | undefined,
  principal: ScopedPrincipal,
  target: Extract<AccessTarget, { kind: 'work_package' }>,
  patch: WorkPackagePatch,
): Promise<
  | (Extract<Authorization, { ok: true }> & { readonly recovery: boolean })
  | Extract<Authorization, { ok: false }>
> {
  const decision = await authorize(decisions, principal, target, 'package.manage_settings');
  if (decision.ok) return { ...decision, recovery: false };
  // Proof: accepting extra settings fields admitted a compound recovery patch; `allows recovery only to clear the restricted flag`
  // (command-permission.controller.db.test.ts) failed with the fault and passed restored, 2026-11-09.
  if (
    decision.reason === 'not_found' ||
    !target.restricted ||
    patch.restricted !== false ||
    Object.keys(patch).length !== 1
  )
    return decision;
  const recovery = await authorize(
    decisions,
    principal,
    { kind: 'organization', organizationId: target.chain.organizationId },
    'organization.recover_restricted',
  );
  return recovery.ok ? { ...recovery, recovery: true } : recovery;
}
