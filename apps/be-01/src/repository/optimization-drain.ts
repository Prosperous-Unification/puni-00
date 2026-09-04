import { and, eq, isNull } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { optimizationGeneration, solverQueue, solverSlot } from './schema';

/**
 * Phase 1 of the two-phase cancel-and-drain, for **contract retirement**
 * (tasks.md 3.9b).
 *
 * **Why deletion is two-phase at all.** The immediate cascade — delete the row
 * and let `ON DELETE CASCADE` take the slot rows with it — frees the capacity
 * accounting before the children are proved dead. That is the fault that let six
 * real solver processes run while SQLite counted two: a second project admitted
 * into capacity the first had not actually given back. So phase 1 closes the
 * door and phase 2 deletes, and between them the slot rows stay **counted and
 * undeleted** until each is released by its owner or passes its stored
 * `admittedDeadlineAt`.
 *
 * This begin is one transaction and does four things for the targeted
 * `(projectId, contractVersion)`:
 *
 * 1. `admissionState = 'draining'`, which is what admission and dequeue read.
 * 2. `cancelEpoch` advances by one, so a child admitted under the old epoch
 *    cannot write its result back.
 * 3. `cancel_requested_at` is stamped on that release's live slot rows — and
 *    **only on those that do not already carry one**. Re-stamping would move the
 *    instant a cancellation was first requested every time the reconciler ran,
 *    and that instant is what a reader uses to judge whether a child is ignoring
 *    the request. Leaving it alone is also what makes a repeated `begin`
 *    idempotent in the field that matters.
 * 4. That release's queued work is deleted. A queue row is unstarted work with
 *    no process behind it, so nothing is freed early by removing it — the
 *    asymmetry with the slot rows above is the whole point.
 *
 * **The generation row is not deleted here and admission is never reopened.**
 * `finishOptimizationDrain` is the only writer that removes it, and it may run
 * from a different coordinator than the one that began the drain.
 *
 * Returns the number of slot rows the caller must still wait for. Zero means
 * finish may run immediately; it does not mean finish has run.
 */
export function beginOptimizationDrain(
  db: SQLiteBunDatabase,
  projectId: string,
  contractVersion: string,
  now: number,
): number {
  return db.transaction((tx) => {
    const current = tx
      .select()
      .from(optimizationGeneration)
      .where(
        and(
          eq(optimizationGeneration.projectId, projectId),
          eq(optimizationGeneration.contractVersion, contractVersion),
        ),
      )
      .get();
    // A no-op on an absent target, rather than an allocation: draining a release
    // that never allocated would create the row it is trying to retire.
    if (current === undefined) return 0;

    tx.update(optimizationGeneration)
      .set({
        admissionState: 'draining',
        cancelEpoch: current.cancelEpoch + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(optimizationGeneration.projectId, projectId),
          eq(optimizationGeneration.contractVersion, contractVersion),
        ),
      )
      .run();

    tx.update(solverSlot)
      .set({ cancelRequestedAt: now })
      .where(
        and(
          eq(solverSlot.projectId, projectId),
          eq(solverSlot.contractVersion, contractVersion),
          isNull(solverSlot.cancelRequestedAt),
        ),
      )
      .run();

    tx.delete(solverQueue)
      .where(
        and(eq(solverQueue.projectId, projectId), eq(solverQueue.contractVersion, contractVersion)),
      )
      .run();

    return tx
      .select()
      .from(solverSlot)
      .where(
        and(eq(solverSlot.projectId, projectId), eq(solverSlot.contractVersion, contractVersion)),
      )
      .all().length;
  });
}
