import type {
  StepBlockageStore,
  StepWriteOutcome,
  StoredStepBlockage,
  WriteStamp,
} from '@wbs/core';
import { and, eq } from 'drizzle-orm';

import { auditOnCreate, auditOnUpdate } from './audit';
import { rowsChanged } from './changes';
import type { Drizzle } from './db';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import {readSqliteBlockagesIn} from './sparse-step-reads';
import { stepBlockage } from './schema';
import { translateStepBlockageFailure } from './step-blockage-activation';
import { writingStep } from './step-reference';

/** Validates the external storage timestamp without coercion or rounding. */
function assertBlockedAt(blockedAt: number): void {
  // Proof: predicate removed; fractional-write/read negative failed; watched 2026-10-13.
  if (!Number.isSafeInteger(blockedAt))
    throw new Error('step blockage has an invalid blocked time');
}

/**
 * Pair-keyed audited blockage, ordered by each actual leaf's current SC18 steps.
 * Left joins preserve malformed references for validation. A fact with no owner
 * cannot be safely scoped, so every full work package read refuses that orphan.
 * Original blocked time survives moves; audit/revisions move with the write.
 *
 * @throws for invalid stored references, parent ownership or timestamps, and
 * for database failures other than the modeled missing-step write outcome.
 */
export class StepBlockageRepository implements StepBlockageStore {
  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
  ) {}

  listByWorkPackage(workPackageId: string): Promise<StoredStepBlockage[]> {
    return this.read(workPackageId);
  }

  listByWorkItems(workPackageId: string, ids: readonly string[]): Promise<StoredStepBlockage[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.read(workPackageId, ids);
  }

  /** Current fact and metadata queries share one actual supplied native transaction. */
  private async read(workPackageId:string,ids?:readonly string[]):Promise<StoredStepBlockage[]>{
    const retained=ids===undefined?null:[...ids];
    if(retained!==null&&retained.length===0)return[];
    return this.db.transaction(snapshot=>readSqliteBlockagesIn(snapshot,workPackageId,retained));
  }

  async set(blockage: StoredStepBlockage, stamp: WriteStamp): Promise<StepWriteOutcome> {
    // Proof: write validation call removed; fractional write negative failed; watched 2026-10-13.
    assertBlockedAt(blockage.blockedAt);
    return writingStep(this.db, blockage.stepId, () =>
      this.gate.enter(async () => {
        await Promise.resolve();
        this.db.transaction((transaction) => {
          transaction
            .insert(stepBlockage)
            .values({ ...blockage, ...auditOnCreate(stamp) })
            .onConflictDoUpdate({
              target: [stepBlockage.workItemId, stepBlockage.stepId],
              set: { blockedAt: blockage.blockedAt, ...auditOnUpdate(stamp) },
            })
            .run();
          bumpWorkItems(transaction, [blockage.workItemId], stamp);
        });
      }),
    ).catch((cause: unknown) => {
      throw translateStepBlockageFailure(cause);
    });
  }

  async remove(workItemId: string, stepId: string, stamp: WriteStamp): Promise<void> {
    await this.gate
      .enter(async () => {
        await Promise.resolve();
        this.db.transaction((transaction) => {
          // Proof: either pair predicate removed; survivor assertions in pair removal failed; watched 2026-10-13.
          transaction
            .delete(stepBlockage)
            .where(and(eq(stepBlockage.workItemId, workItemId), eq(stepBlockage.stepId, stepId)))
            .run();
          bumpWorkItems(transaction, [workItemId], stamp);
        });
      })
      .catch((cause: unknown) => {
        throw translateStepBlockageFailure(cause);
      });
  }

  async moveAll(fromWorkItemId: string, toWorkItemId: string, stamp: WriteStamp): Promise<void> {
    await this.gate
      .enter(async () => {
        await Promise.resolve();
        this.db.transaction((transaction) => {
          transaction
            .update(stepBlockage)
            .set({ workItemId: toWorkItemId, ...auditOnUpdate(stamp) })
            .where(eq(stepBlockage.workItemId, fromWorkItemId))
            .run();
          // Proof: empty-move guard removed; unchanged-owner revision assertion failed; watched 2026-10-13.
          if (rowsChanged(transaction, 'moving step blockages') === 0) return;
          bumpWorkItems(transaction, [fromWorkItemId, toWorkItemId], stamp);
        });
      })
      .catch((cause: unknown) => {
        throw translateStepBlockageFailure(cause);
      });
  }
}
