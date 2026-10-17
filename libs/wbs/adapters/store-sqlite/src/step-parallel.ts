import type { StepParallelStore, StoredStepParallel, WriteStamp } from '@wbs/core';
import { assertStepParallel } from '@wbs/domain';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import { step, stepParallel, workItem } from './schema';

/**
 * Pair-keyed audited parallelism, ordered by owner and project step position.
 * Left joins preserve malformed references for validation. A fact with no owner
 * cannot be safely scoped, so every full project read refuses that orphan.
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

  listByProject(projectId: string): Promise<StoredStepParallel[]> {
    return this.read(projectId);
  }

  listByWorkItems(projectId: string, ids: readonly string[]): Promise<StoredStepParallel[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.read(projectId, ids);
  }

  private async read(projectId: string, ids?: readonly string[]): Promise<StoredStepParallel[]> {
    const rows = await this.db
      .select({
        workItemId: stepParallel.workItemId,
        stepId: stepParallel.stepId,
        maxParallel: stepParallel.maxParallel,
        ownerProject: workItem.projectId,
        stepProject: step.projectId,
        hasChildren: sql<number>`EXISTS (SELECT 1 FROM work_item child WHERE child.parent_id = ${stepParallel.workItemId})`,
      })
      .from(stepParallel)
      .leftJoin(workItem, eq(workItem.id, stepParallel.workItemId))
      .leftJoin(step, eq(step.id, stepParallel.stepId))
      .where(
        and(
          or(eq(workItem.projectId, projectId), isNull(workItem.id)),
          ids === undefined ? undefined : inArray(stepParallel.workItemId, [...ids]),
        ),
      )
      .orderBy(stepParallel.workItemId, step.position, stepParallel.stepId);
    for (const row of rows) {
      // Proof: owner guard removed; missing-owner retained-row read negative failed, 2026-10-15.
      if (row.ownerProject === null)
        throw new Error('step parallelism has an invalid work-item reference');
      // Proof: step/project guard removed independently against missing-step and cross-project corrupt reads; both negatives failed, 2026-10-15.
      if (row.stepProject !== projectId)
        throw new Error('step parallelism has an invalid step reference');
      // Proof: leaf guard removed; corrupt-parent read negative failed, 2026-10-15.
      if (row.hasChildren !== 0) throw new Error('step parallelism owner is not a leaf');
      // Proof: read range call removed; corrupt-value read negative failed, 2026-10-15.
      assertStepParallel(row.maxParallel);
    }
    return rows.map(({ workItemId, stepId, maxParallel }) => ({ workItemId, stepId, maxParallel }));
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
