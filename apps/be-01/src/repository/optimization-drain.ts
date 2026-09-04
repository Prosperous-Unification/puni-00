import { and, eq, isNull } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnUpdate } from './audit';
import type { WriteStamp } from './index';
import {
  optimizationGeneration,
  optimizedScheduleCache,
  project,
  solverQueue,
  solverSlot,
} from './schema';

/**
 * Phase 1 of the two-phase cancel-and-drain (tasks.md 3.9b).
 *
 * The target is what `contractVersion` selects, and the two targets are not two
 * policies: **naming a release retires that contract version**, and **omitting
 * it deletes the whole project**, closing every release it has. The steps below
 * are the same steps in both cases, widened from one generation row to all of
 * them, plus one extra write the project case needs and the release case must
 * not make — the durable `optimization_delete_pending_at` marker.
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
 * This begin is one transaction and does four things to the affected rows:
 *
 * 1. `admissionState = 'draining'`, which is what admission and dequeue read.
 * 2. `cancelEpoch` advances by one, so a child admitted under the old epoch
 *    cannot write its result back.
 * 3. `cancel_requested_at` is stamped on the affected live slot rows — and
 *    **only on those that do not already carry one**. Re-stamping would move the
 *    instant a cancellation was first requested every time the reconciler ran,
 *    and that instant is what a reader uses to judge whether a child is ignoring
 *    the request. Leaving it alone is also what makes a repeated `begin`
 *    idempotent in the field that matters.
 * 4. The affected queued work is deleted. A queue row is unstarted work with
 *    no process behind it, so nothing is freed early by removing it — the
 *    asymmetry with the slot rows above is the whole point.
 *
 * **Deleting a project writes the marker first, before any generation row.**
 * Within one transaction the order of two writes is not observable, so this is
 * about what a *reader* of the marker is promised rather than about the
 * interleaving: the marker is the durable fence a coordinator in another process
 * reads, and every generation row it fences is closed under the same commit.
 * Setting it after the generations would put the same rows under two fences that
 * commit together anyway — the sequence is written this way so the fence reads
 * as the first thing the deletion establishes, which is what
 * `finishOptimizationDrain` and the reconciler both re-read.
 *
 * **A deletion never gets the project's physical row taken out from under it
 * here.** The row remains, because the slot rows reference it and their capacity
 * accounting has to stay alive while the children it counts are still running —
 * that is the same reason a slot row survives a retirement. Phase 2 is what
 * removes the project, once it has observed no slots left.
 *
 * **The generation rows are not deleted here and admission is never reopened.**
 * `finishOptimizationDrain` is the only writer that removes them, and it may run
 * from a different coordinator than the one that began the drain.
 *
 * The stamp is a {@link WriteStamp} rather than a bare instant because the
 * deletion arm's marker lands on `project`, which carries audit columns, and
 * `auditOnUpdate` is how every write in this folder proves it filled them. It
 * asks no caller to invent an actor it does not have: `auditOnUpdate` writes
 * `updatedAt` and nothing else, so a retirement triggered by a deploy supplies
 * the same instant it always did.
 *
 * Returns the number of slot rows the caller must still wait for. Zero means
 * finish may run immediately; it does not mean finish has run.
 */
export function beginOptimizationDrain(
  db: SQLiteBunDatabase,
  projectId: string,
  stamp: WriteStamp,
  contractVersion?: string,
): number {
  return db.transaction((tx) => {
    if (contractVersion === undefined) {
      // `isNull` for the same reason the slot stamp carries one: the marker
      // records when the deletion was FIRST requested, and a reader judging how
      // long a drain has been stuck needs that instant rather than the instant
      // of the most recent attempt to make it.
      tx.update(project)
        .set({ optimizationDeletePendingAt: stamp.at, ...auditOnUpdate(stamp) })
        .where(and(eq(project.id, projectId), isNull(project.optimizationDeletePendingAt)))
        .run();
    }

    const affected = tx
      .select()
      .from(optimizationGeneration)
      .where(
        and(
          eq(optimizationGeneration.projectId, projectId),
          ...(contractVersion === undefined
            ? []
            : [eq(optimizationGeneration.contractVersion, contractVersion)]),
        ),
      )
      .all();

    // **Every write below is a no-op on an absent target, and none of them needs
    // a guard to be one.** Draining a release that never allocated updates no
    // generation because the loop has nothing to loop over; deleting a project
    // that is not there matches no row in any of the four statements. An
    // early return asserting either would be a branch no mutation can red, which
    // is a guard that documents a belief rather than enforcing one. What the
    // absence must NOT do is create the row — and none of these is an upsert.
    //
    // Row by row, because `cancelEpoch` advances from each row's own value and a
    // single statement cannot read one column per row without dropping to SQL.
    // A project holds one generation row per live contract version — two during
    // a swap — so this is a loop over two, not over a table.
    for (const row of affected) {
      tx.update(optimizationGeneration)
        .set({
          admissionState: 'draining',
          cancelEpoch: row.cancelEpoch + 1,
          updatedAt: stamp.at,
        })
        .where(
          and(
            eq(optimizationGeneration.projectId, projectId),
            eq(optimizationGeneration.contractVersion, row.contractVersion),
          ),
        )
        .run();
    }

    tx.update(solverSlot)
      .set({ cancelRequestedAt: stamp.at })
      .where(
        and(
          eq(solverSlot.projectId, projectId),
          ...(contractVersion === undefined
            ? []
            : [eq(solverSlot.contractVersion, contractVersion)]),
          isNull(solverSlot.cancelRequestedAt),
        ),
      )
      .run();

    tx.delete(solverQueue)
      .where(
        and(
          eq(solverQueue.projectId, projectId),
          ...(contractVersion === undefined
            ? []
            : [eq(solverQueue.contractVersion, contractVersion)]),
        ),
      )
      .run();

    return tx
      .select()
      .from(solverSlot)
      .where(
        and(
          eq(solverSlot.projectId, projectId),
          ...(contractVersion === undefined
            ? []
            : [eq(solverSlot.contractVersion, contractVersion)]),
        ),
      )
      .all().length;
  });
}

/**
 * What one attempt at phase 2 did, and why it did nothing when it did nothing.
 *
 * Three of the four are ordinary and none is an error: `finish` is called from
 * three places that race each other on purpose — the initiator, every slot
 * release, and the reconciler — so most calls are expected to find the work
 * already done or not yet finishable.
 *
 * - `finished` — this call deleted the target.
 * - `waiting` — the closed state holds and affected slot rows remain. The
 *   children are still running and their capacity is still theirs.
 * - `open` — the durable closed state does **not** hold, so there is nothing to
 *   finish. This is the one that must never delete: a project with no slots is
 *   the ordinary state of most projects, and a `finish` that deleted on a
 *   zero-slot observation alone would delete a live project the moment anybody
 *   called it.
 * - `absent` — the target is already gone. The loser of a race, and a no-op.
 */
export type OptimizationDrainFinish = 'finished' | 'waiting' | 'open' | 'absent';

/**
 * Phase 2 of the two-phase cancel-and-drain (tasks.md 3.9b).
 *
 * **Finish is not the initiator's job.** A crash between `begin` and `finish`
 * left the project hidden with admission closed for ever, and admission is
 * exactly what a draining project rejects, so no later read could sweep it.
 * Three callers therefore run this same transaction: the initiator, every slot
 * release and reclaim sweep that removes the last affected row, and
 * `reconcileOptimizationDrains()` on its interval. All three are idempotent and
 * safe to race, and **none of them reopens admission** — there is no path from
 * `draining` back to `open` in this file.
 *
 * **The precondition is the lock.** The closed state and the zero-slot
 * observation are read inside the same transaction as the delete, and SQLite
 * will not let that transaction upgrade to a write on a stale read: a
 * concurrent commit in between makes the upgrade busy rather than letting it
 * proceed. So the loser of a race either blocks or comes back and observes the
 * row already gone, and never deletes on a view of the world that has moved.
 *
 * **What the delete takes.** Deleting the project row is the whole story — the
 * generation, slot, queue and cache rows all reference it `ON DELETE CASCADE`.
 * Retiring one contract version is not, because nothing references the
 * generation row: its queue rows went at `begin`, and its cache rows are taken
 * here, explicitly.
 *
 * **Assumption A-1, and what would falsify it.** Retiring a contract version
 * deletes that version's cache rows. They can never be read again — the cache
 * key carries `contractVersion` and no live release carries the retired one —
 * and 4.1b's retention bound is stated *per live contract version*, so a
 * retired version's rows fall outside every bound there is and accumulate one
 * release at a time, for ever. The cost of taking them is that a **rollback**
 * to a retired release starts on a cold cache and re-solves once per objective,
 * bounded by the budget the configuration already accepts. An unbounded leak
 * against a bounded re-solve is the trade this makes. It is falsified if
 * rolling back is routine rather than an incident: then the re-solve recurs and
 * keeping the rows is worth the growth.
 */
export function finishOptimizationDrain(
  db: SQLiteBunDatabase,
  projectId: string,
  contractVersion?: string,
): OptimizationDrainFinish {
  return db.transaction((tx) => {
    const outstanding = (): number =>
      tx
        .select()
        .from(solverSlot)
        .where(
          and(
            eq(solverSlot.projectId, projectId),
            ...(contractVersion === undefined
              ? []
              : [eq(solverSlot.contractVersion, contractVersion)]),
          ),
        )
        .all().length;

    if (contractVersion === undefined) {
      const target = tx.select().from(project).where(eq(project.id, projectId)).get();
      if (target === undefined) return 'absent';
      if (target.optimizationDeletePendingAt === null) return 'open';
      if (outstanding() > 0) return 'waiting';

      tx.delete(project).where(eq(project.id, projectId)).run();
      return 'finished';
    }

    const generation = tx
      .select()
      .from(optimizationGeneration)
      .where(
        and(
          eq(optimizationGeneration.projectId, projectId),
          eq(optimizationGeneration.contractVersion, contractVersion),
        ),
      )
      .get();
    if (generation === undefined) return 'absent';
    if (generation.admissionState !== 'draining') return 'open';
    if (outstanding() > 0) return 'waiting';

    tx.delete(optimizedScheduleCache)
      .where(
        and(
          eq(optimizedScheduleCache.projectId, projectId),
          eq(optimizedScheduleCache.contractVersion, contractVersion),
        ),
      )
      .run();

    tx.delete(optimizationGeneration)
      .where(
        and(
          eq(optimizationGeneration.projectId, projectId),
          eq(optimizationGeneration.contractVersion, contractVersion),
        ),
      )
      .run();
    return 'finished';
  });
}
