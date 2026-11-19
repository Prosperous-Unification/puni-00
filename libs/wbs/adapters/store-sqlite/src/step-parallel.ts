import type { StepParallelStore, StoredStepParallel, WriteStamp } from '@wbs/core';
import { assertStepParallel } from '@wbs/domain';
import { and, eq } from 'drizzle-orm';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import {readSqliteParallelsIn} from './sparse-step-reads';
import { stepParallel } from './schema';

/**
 * Pair-keyed audited parallelism, ordered by each actual leaf's current SC18 steps.
 * Left joins preserve malformed references for validation. A fact with no owner
 * cannot be safely scoped, so every full work package read refuses that orphan.
 * Explicit values survive row-default changes; writes update audit and row revisions.
 *
 * @throws for invalid stored references, parent ownership or maximum parallelism,
 * and every database failure. Missing references are never converted to absence.
 */
export class StepParallelRepository implements StepParallelStore {
  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
  ) {}

  listByWorkPackage(workPackageId: string): Promise<StoredStepParallel[]> {
    return this.read(workPackageId);
  }

  listByWorkItems(workPackageId: string, ids: readonly string[]): Promise<StoredStepParallel[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.read(workPackageId, ids);
  }

  /** Current fact and metadata queries share one actual supplied native transaction. */
  private async read(workPackageId:string,ids?:readonly string[]):Promise<StoredStepParallel[]>{
    const retained=ids===undefined?null:[...ids];
    if(retained!==null&&retained.length===0)return[];
    return this.db.transaction(snapshot=>readSqliteParallelsIn(snapshot,workPackageId,retained));
  }

  async set(parallelism: StoredStepParallel, stamp: WriteStamp): Promise<void> {
    // Proof: write range call removed; source invalid-value message negative failed, 2026-10-15.
    assertStepParallel(parallelism.maxParallel);
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((transaction) => {
        transaction
          .insert(stepParallel)
          .values({ ...parallelism, ...auditOnCreate(stamp) })
          .onConflictDoUpdate({
            target: [stepParallel.workItemId, stepParallel.stepId],
            set: { maxParallel: parallelism.maxParallel, ...auditOnUpdate(stamp) },
          })
          .run();
        bumpWorkItems(transaction, [parallelism.workItemId], stamp);
      });
    });
  }

  async remove(workItemId: string, stepId: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((transaction) => {
        transaction
          .delete(stepParallel)
          .where(and(eq(stepParallel.workItemId, workItemId), eq(stepParallel.stepId, stepId)))
          .run();
        bumpWorkItems(transaction, [workItemId], stamp);
      });
    });
  }
}
