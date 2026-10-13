import type { RestoreApproved, SharedPeopleRestoreApprovals, WriteStamp } from '@wbs/core';
import { and, eq } from 'drizzle-orm';

import type { Drizzle } from './db';
import type { Gate } from './gate';
import { readOrganizationActivation } from './organization-activation';
import {
  organizationMembership,
  sharedPeopleRestoreApproval,
  sharedPeopleRestoreOperation,
} from './schema';

/** Durable consent on the shared source writer; an immediate transaction closes admission races. */
export class SharedPeopleRestoreApprovalRepository implements SharedPeopleRestoreApprovals {
  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
  ) {}

  async approve(
    organizationId: string,
    operationId: string,
    backupDigest: string,
    approvalId: string,
    stamp: WriteStamp,
  ): Promise<RestoreApproved> {
    // Proof: bypassing this gate failed the mounted queued-removal case: approval appeared while held.
    return this.gate.enter(async () => {
      await Promise.resolve();
      // Proof: running on this.db without a transaction left an operation after the injected approval-insert fault.
      return this.db.transaction(
        (tx): RestoreApproved => {
          const membership = tx
            .select({ role: organizationMembership.role })
            .from(organizationMembership)
            .where(
              and(
                // Proof: dropping organization scope admitted a viewer with a super-admin role elsewhere.
                eq(organizationMembership.organizationId, organizationId),
                // Proof: dropping actor scope admitted the admin under another member's super-admin role.
                eq(organizationMembership.userId, stamp.by),
              ),
            )
            .get();
          // Proof: separately bypassing activation admitted pre-activation issuance; bypassing role admitted the admin.
          // Mounted demotion/removal cases also require this check after admission and before retry.
          if (readOrganizationActivation(tx) !== 'activated' || membership?.role !== 'super_admin')
            return { ok: false, refusal: 'forbidden' };
          const operation = tx
            .select()
            .from(sharedPeopleRestoreOperation)
            .where(eq(sharedPeopleRestoreOperation.id, operationId))
            .get();
          // Proof: bypassing the digest comparison returned 200 for a different backup in the mounted binding case.
          if (operation !== undefined && operation.backupDigest !== backupDigest)
            return { ok: false, refusal: 'restore_approval_conflict' };
          const approval = tx
            .select()
            .from(sharedPeopleRestoreApproval)
            .where(
              and(
                eq(sharedPeopleRestoreApproval.operationId, operationId),
                // Proof: forcing org-a here refused the valid second organization's independent approval.
                eq(sharedPeopleRestoreApproval.organizationId, organizationId),
              ),
            )
            .get();
          if (approval !== undefined) {
            // Proof: bypassing actor equality returned the first person's consent to another super-admin.
            if (approval.actorId !== stamp.by)
              return { ok: false, refusal: 'restore_approval_conflict' };
            return { ok: true, approval: { ...approval, backupDigest } };
          }
          if (operation === undefined)
            tx.insert(sharedPeopleRestoreOperation)
              .values({ id: operationId, backupDigest, createdAt: stamp.at })
              .run();
          const issued = {
            id: approvalId,
            operationId,
            organizationId,
            actorId: stamp.by,
            createdAt: stamp.at,
          };
          tx.insert(sharedPeopleRestoreApproval).values(issued).run();
          return { ok: true, approval: { ...issued, backupDigest } };
        },
        // Proof: deferred allowed the rival demotion before membership SELECT; the immediate-writer case failed.
        { behavior: 'immediate' },
      );
    });
  }
}
