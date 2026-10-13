import { approveSharedPeopleRestore } from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type { OrganizationAccess } from '../ports/organization-access';
import type { SharedPeopleRestoreApprovals } from '../ports/shared-people-restore-approvals';
import { bind } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/** Issues personal consent; the writer owns the current role decision and immutable binding. */
export function sharedPeopleRestoreRoutes(
  approvals: SharedPeopleRestoreApprovals,
  organizations: OrganizationAccess,
  clock: Pick<Clock, 'newId' | 'stampFor'>,
) {
  return [
    bind(approveSharedPeopleRestore, async ({ principal, body }) => {
      // Proof: removing this guard made the mounted delegated super-admin approval return 200.
      if (principal.delegation !== undefined)
        return { ok: false, status: 403, body: { error: 'insufficient_scope' } } as const;
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      // Proof: removing this guard made the pre-activation mounted request throw (500 instead of 409).
      if (resolved.access.kind === 'legacy')
        return { ok: false, status: 409, body: { error: 'organization_required' } } as const;
      const approved = await approvals.approve(
        resolved.access.scope.organizationId,
        body.operationId,
        body.backupDigest,
        clock.newId(),
        // Proof: replacing this principal with an asserted operator failed authenticated-actor persistence.
        clock.stampFor(principal.id),
      );
      if (!approved.ok) {
        return approved.refusal === 'forbidden'
          ? ({ ok: false, status: 403, body: { error: 'forbidden' } } as const)
          : ({ ok: false, status: 409, body: { error: 'restore_approval_conflict' } } as const);
      }
      return { ok: true, status: 200, body: { approval: approved.approval } } as const;
    }),
  ] as const;
}
