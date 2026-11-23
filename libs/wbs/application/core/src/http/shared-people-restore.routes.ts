import { approveSharedPeopleRestore } from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type { OrganizationAccess } from '../ports/organization-access';
import { retainSecurityPrincipal } from '../ports/security-principal';
import type { SharedPeopleRestoreApprovals } from '../ports/shared-people-restore-approvals';
import { bind } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/** Issues personal consent; the writer owns the current security-grant decision and immutable binding. */
export function sharedPeopleRestoreRoutes(
  approvals: SharedPeopleRestoreApprovals,
  organizations: OrganizationAccess,
  clock: Pick<Clock, 'newId' | 'stampFor'>,
) {
  return [
    bind(approveSharedPeopleRestore, async ({ principal, body }) => {
      // Proof: removing this guard made the mounted delegated super-admin approval return 200.
      // Proof: bypassing this HTTP refusal (http-nondelegation-shared-people-restore) failed `refuses delegated restore approval even for a super-admin with a security grant`; restored GREEN.
      if (principal.delegation !== undefined)
        return { ok: false, status: 403, body: { error: 'insufficient_scope' } } as const;
      // Proof: retaining the caller alias across organization resolution (route-snapshot-restore-approval) failed `retains the route security principal across organization resolution at restore-approval: id`; restored GREEN.
      const actor = retainSecurityPrincipal(principal);
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      // Proof: removing this guard made the pre-activation mounted request throw (500 instead of 409).
      if (resolved.access.kind === 'legacy')
        return { ok: false, status: 409, body: { error: 'organization_required' } } as const;
      const approved = await approvals.approve(
        resolved.access.scope.organizationId,
        actor,
        body.operationId,
        body.backupDigest,
        clock.newId(),
        // Proof: replacing this principal with an asserted operator failed authenticated-actor persistence.
        clock.stampFor(actor.id),
      );
      if (!approved.ok) {
        return approved.refusal === 'forbidden'
          ? ({
              ok: false,
              status: 403,
              // Proof: dropping this permission property (http-permission-restore-approval) failed `encodes a current grant denial before effects at restore-approval`; restored GREEN.
              body: { error: 'forbidden', permission: 'organization.manage_security' },
            } as const)
          : ({ ok: false, status: 409, body: { error: 'restore_approval_conflict' } } as const);
      }
      return { ok: true, status: 200, body: { approval: approved.approval } } as const;
    }),
  ] as const;
}
