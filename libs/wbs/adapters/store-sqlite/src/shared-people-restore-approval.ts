import type { RestoreApproved, SharedPeopleRestoreApprovals, WriteStamp } from '@wbs/core';
import { retainSecurityPrincipal, type SecurityPrincipal } from '@wbs/core';
import { and, eq } from 'drizzle-orm';

import type { Drizzle } from './db';
import type { Gate } from './gate';
import {
  sharedPeopleRestoreApproval,
  sharedPeopleRestoreOperation,
  sharedPeopleRestoreReceipt,
} from './schema';
import { readSecurityRefusal, runSecurityTransaction } from './security-transaction';

/** Durable consent on the shared source writer; an immediate transaction closes admission races. */
export class SharedPeopleRestoreApprovalRepository implements SharedPeopleRestoreApprovals {
  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
  ) {}

  async approve(
    organizationId: string,
    principal: SecurityPrincipal,
    operationId: string,
    backupDigest: string,
    approvalId: string,
    stamp: WriteStamp,
  ): Promise<RestoreApproved> {
    // Proof: dropping this detached snapshot (snapshot-principal-restore-approval) failed `retains the actual queued security principal and current grant at restore-approval`; restored GREEN.
    principal = retainSecurityPrincipal(principal, stamp.by);
    // Proof: dropping this detached snapshot (snapshot-stamp-restore-approval) failed `retains detached queued security stamps and audit actors at restore-approval`; restored GREEN.
    stamp = structuredClone(stamp);

    // Proof: bypassing this gate failed the mounted queued-removal case: approval appeared while held.
    return runSecurityTransaction(this.db, this.gate, async (tx) => {
      const refusal = await readSecurityRefusal(tx, organizationId, principal);
      // Proof: bypassing this current permission check (permission-restore-approval) failed `encodes a current grant denial before effects at restore-approval`; restored GREEN.
      if (refusal !== null) return { ok: false, refusal: 'forbidden' };
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
      // Proof: removing completion refusal issued a new organization approval after durable completion.
      if (
        tx
          .select({ id: sharedPeopleRestoreReceipt.operationId })
          .from(sharedPeopleRestoreReceipt)
          .where(eq(sharedPeopleRestoreReceipt.operationId, operationId))
          .get() !== undefined
      )
        return { ok: false, refusal: 'restore_approval_conflict' };
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
    });
  }
}
