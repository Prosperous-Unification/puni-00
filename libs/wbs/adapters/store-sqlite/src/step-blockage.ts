import type {
  StepBlockageStore,
  StepWriteOutcome,
  StoredStepBlockage,
  WriteStamp,
} from '@wbs/core';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { auditOnCreate, auditOnUpdate } from './audit';
import { rowsChanged } from './changes';
import type { Drizzle } from './db';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import { step, stepBlockage, workItem } from './schema';
import { writingStep } from './step-reference';

/** Validates the external storage timestamp without coercion or rounding. */
function assertBlockedAt(blockedAt: number): void {
  // Proof: predicate removed; fractional-write/read negative failed; watched 2026-10-13.
  if (!Number.isSafeInteger(blockedAt))
    throw new Error('step blockage has an invalid blocked time');
}

/**
 * Pair-keyed audited blockage, ordered by owner and project step position.
 * Left joins preserve malformed references for validation. A fact with no owner
 * cannot be safely scoped, so every full project read refuses that orphan.
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

  listByProject(projectId: string): Promise<StoredStepBlockage[]> {
    return this.read(projectId);
  }

  listByWorkItems(projectId: string, ids: readonly string[]): Promise<StoredStepBlockage[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.read(projectId, ids);
  }

  private async read(projectId: string, ids?: readonly string[]): Promise<StoredStepBlockage[]> {
    const rows = await this.db
      .select({
        workItemId: stepBlockage.workItemId,
        stepId: stepBlockage.stepId,
        blockedAt: stepBlockage.blockedAt,
        ownerProject: workItem.projectId,
        stepProject: step.projectId,
        hasChildren: sql<number>`EXISTS (SELECT 1 FROM work_item child WHERE child.parent_id = ${stepBlockage.workItemId})`,
      })
      .from(stepBlockage)
      .leftJoin(workItem, eq(workItem.id, stepBlockage.workItemId))
      .leftJoin(step, eq(step.id, stepBlockage.stepId))
      .where(
        and(
          or(eq(workItem.projectId, projectId), isNull(workItem.id)),
          ids === undefined ? undefined : inArray(stepBlockage.workItemId, [...ids]),
        ),
      )
      .orderBy(stepBlockage.workItemId, step.position, stepBlockage.stepId);
    for (const row of rows) {
      // Proof: owner check removed; missing trusted owner read negative failed; watched 2026-10-13.
      if (row.ownerProject === null)
        throw new Error('step blockage has an invalid work-item reference');
      // Proof: step check removed; corrupted/missing step read negatives failed; watched 2026-10-13.
      if (row.stepProject !== projectId)
        throw new Error('step blockage has an invalid step reference');
      // Proof: leaf check removed; corrupted parent-owner read negative failed; watched 2026-10-13.
      if (row.hasChildren !== 0) throw new Error('step blockage owner is not a leaf');
      // Proof: read validation call removed; malformed stored timestamp negative failed; watched 2026-10-13.
      assertBlockedAt(row.blockedAt);
    }
    return rows.map(({ workItemId, stepId, blockedAt }) => ({ workItemId, stepId, blockedAt }));
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
    );
  }

  async remove(workItemId: string, stepId: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((transaction) => {
        // Proof: either pair predicate removed; survivor assertions in pair removal failed; watched 2026-10-13.
        transaction
          .delete(stepBlockage)
          .where(and(eq(stepBlockage.workItemId, workItemId), eq(stepBlockage.stepId, stepId)))
          .run();
        bumpWorkItems(transaction, [workItemId], stamp);
      });
    });
  }

  async moveAll(fromWorkItemId: string, toWorkItemId: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
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
    });
  }
}
