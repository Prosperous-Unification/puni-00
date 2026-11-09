import { type EffectiveRole, may, type Permission } from '@wbs/domain';

import type { AccessDecisions, AccessTarget, ScopedPrincipal } from '../ports/access-decisions';
import type { ResourceAccess } from '../ports/organization-access';
import type { Project, ProjectPatch } from '../ports/project-store';

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
    // watched 2026-11-09. Returning forbidden also made the mounted `answers the same HTTP404 for an invisible and an absent work package` answer403; restored green 2026-11-09.
    return { ok: false, reason: 'not_found' };
  }
  // Proof: bypassing this check admitted a viewer and credential managers in
  // `names the missing permission on a visible work package` and both
  // `resolves a ... principal ... using only its credential grants`; watched 2026-11-09.
  if (!may(effective, permission)) return { ok: false, reason: 'forbidden', permission };
  return { ok: true, effective };
}

/** Evaluates a current package grant with the admitted authenticated identity and interim hierarchy. */
export function authorizePackage(
  decisions: AccessDecisions | undefined,
  access: Extract<ResourceAccess, { kind: 'scoped' }>,
  project: Pick<Project, 'id' | 'restricted'>,
  actorId: string,
  permission: Permission,
): Promise<Authorization> {
  // Proof: package-actor-coherence fault failed 'scoped step service preserves exact grant scope' (step.routes.test.ts); restored GREEN, 2026-11-09.
  if (access.principal.id !== actorId || access.scope.userId !== actorId)
    throw new Error('package permission principal differs from the acting account');
  return authorize(
    decisions,
    access.principal,
    {
      kind: 'work_package',
      chain: {
        level: 'work_package',
        organizationId: access.scope.organizationId,
        workPackageId: project.id,
      },
      restricted: project.restricted,
    },
    permission,
  );
}

/** A restricted-package recovery clears only its flag; all other settings require the package permission. */
export async function authorizePackageSettings(
  decisions: AccessDecisions | undefined,
  principal: ScopedPrincipal,
  organizationId: string,
  project: Pick<Project, 'id' | 'restricted'>,
  patch: ProjectPatch,
): Promise<
  | (Extract<Authorization, { ok: true }> & { readonly recovery: boolean })
  | Extract<Authorization, { ok: false }>
> {
  const decision = await authorize(
    decisions,
    principal,
    {
      kind: 'work_package',
      chain: { level: 'work_package', organizationId, workPackageId: project.id },
      restricted: project.restricted,
    },
    'package.manage_settings',
  );
  if (decision.ok) return { ...decision, recovery: false };
  // Proof: accepting extra settings fields admitted a compound recovery patch; `allows recovery only to clear the restricted flag`
  // (command-permission.controller.db.test.ts) failed with the fault and passed restored, 2026-11-09.
  if (
    decision.reason === 'not_found' ||
    !project.restricted ||
    patch.restricted !== false ||
    Object.keys(patch).length !== 1
  )
    return decision;
  const recovery = await authorize(
    decisions,
    principal,
    { kind: 'organization', organizationId },
    'organization.recover_restricted',
  );
  return recovery.ok ? { ...recovery, recovery: true } : recovery;
}
