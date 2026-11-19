import type { WriteStamp } from '@wbs/core';
import { assertStepParallel } from '@wbs/domain';
import { and, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnUpdate } from './audit';
import {
  dependency,
  estimate,
  externalDependency,
  optimizationGeneration,
  optimizedScheduleCache,
  workPackage,
  workPackageAccess,
  type SolverObjectiveName,
  solverQueue,
  solverSlot,
  step,
  stepParallel,
  typedDependency,
  workItem,
} from './schema';

/** The handle a caller's own transaction hands to the helpers below. */
type Transaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];

/** Throws naming the external relationship before destructive drain state can commit. */
function assertWorkPackageUnreferenced(tx: Transaction, workPackageId: string): void {
  const reference = tx
    .select({ id: externalDependency.id })
    .from(externalDependency)
    .where(eq(externalDependency.predecessorWorkPackageId, workPackageId))
    .get();
  if (reference !== undefined)
    throw new Error(
      `work package ${workPackageId} has externally referenced predecessor ${reference.id}`,
    );
}

/**
 * Phase 1 of the two-phase cancel-and-drain (tasks.md 3.9b).
 *
 * The target is what `contractVersion` selects, and the two targets are not two
 * policies: **naming a release retires that contract version**, and **omitting
 * it deletes the whole work package**, closing every release it has. The steps below
 * are the same steps in both cases, widened from one generation row to all of
 * them, plus one extra write the work package case needs and the release case must
 * not make — the durable `optimization_delete_pending_at` marker.
 *
 * **Why deletion is two-phase at all.** The immediate cascade — delete the row
 * and let `ON DELETE CASCADE` take the slot rows with it — frees the capacity
 * accounting before the children are proved dead. That is the fault that let six
 * real solver processes run while SQLite counted two: a second work package admitted
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
 * **Deleting a work package writes the marker first, before any generation row.**
 * Within one transaction the order of two writes is not observable, so this is
 * about what a *reader* of the marker is promised rather than about the
 * interleaving: the marker is the durable fence a coordinator in another process
 * reads, and every generation row it fences is closed under the same commit.
 * Setting it after the generations would put the same rows under two fences that
 * commit together anyway — the sequence is written this way so the fence reads
 * as the first thing the deletion establishes, which is what
 * `finishOptimizationDrain` and the reconciler both re-read.
 *
 * **A deletion never gets the work package's physical row taken out from under it
 * here.** The row remains, because the slot rows reference it and their capacity
 * accounting has to stay alive while the children it counts are still running —
 * that is the same reason a slot row survives a retirement. Phase 2 is what
 * removes the work package, once it has observed no slots left.
 *
 * **The generation rows are not deleted here and admission is never reopened.**
 * `finishOptimizationDrain` is the only writer that removes them, and it may run
 * from a different coordinator than the one that began the drain.
 *
 * The stamp is a {@link WriteStamp} rather than a bare instant because the
 * deletion arm's marker lands on `workPackage`, which carries audit columns, and
 * `auditOnUpdate` is how every write in this folder proves it filled them. It
 * asks no caller to invent an actor it does not have: `auditOnUpdate` writes
 * `updatedAt` and nothing else, so a retirement triggered by a deploy supplies
 * the same instant it always did.
 *
 * Whole-work-package deletion refuses external predecessor references before any
 * drain write; named contract retirement leaves those relationships intact.
 *
 * Returns the number of slot rows the caller must still wait for. Zero means
 * finish may run immediately; it does not mean finish has run.
 */
export function beginOptimizationDrain(
  db: SQLiteBunDatabase,
  workPackageId: string,
  stamp: WriteStamp,
  contractVersion?: string,
): number {
  return db.transaction((tx) => {
    if (contractVersion === undefined) {
      // Proof: removing this call committed marker/audit, queue deletion and
      // generation/slot cancellation in installed and raw begin tests (2026-10-22).
      assertWorkPackageUnreferenced(tx, workPackageId);
      // `isNull` for the same reason the slot stamp carries one: the marker
      // records when the deletion was FIRST requested, and a reader judging how
      // long a drain has been stuck needs that instant rather than the instant
      // of the most recent attempt to make it.
      tx.update(workPackage)
        .set({ optimizationDeletePendingAt: stamp.at, ...auditOnUpdate(stamp) })
        .where(
          and(eq(workPackage.id, workPackageId), isNull(workPackage.optimizationDeletePendingAt)),
        )
        .run();
    }

    const affected = tx
      .select()
      .from(optimizationGeneration)
      .where(
        and(
          eq(optimizationGeneration.workPackageId, workPackageId),
          ...(contractVersion === undefined
            ? []
            : [eq(optimizationGeneration.contractVersion, contractVersion)]),
        ),
      )
      .all();

    // **Every write below is a no-op on an absent target, and none of them needs
    // a guard to be one.** Draining a release that never allocated updates no
    // generation because the loop has nothing to loop over; deleting a work package
    // that is not there matches no row in any of the four statements. An
    // early return asserting either would be a branch no mutation can red, which
    // is a guard that documents a belief rather than enforcing one. What the
    // absence must NOT do is create the row — and none of these is an upsert.
    //
    // Row by row, because `cancelEpoch` advances from each row's own value and a
    // single statement cannot read one column per row without dropping to SQL.
    // A work package holds one generation row per live contract version — two during
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
            eq(optimizationGeneration.workPackageId, workPackageId),
            eq(optimizationGeneration.contractVersion, row.contractVersion),
          ),
        )
        .run();
    }

    tx.update(solverSlot)
      .set({ cancelRequestedAt: stamp.at })
      .where(
        and(
          eq(solverSlot.workPackageId, workPackageId),
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
          eq(solverQueue.workPackageId, workPackageId),
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
          eq(solverSlot.workPackageId, workPackageId),
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
 *   finish. This is the one that must never delete: a work package with no slots is
 *   the ordinary state of most work packages, and a `finish` that deleted on a
 *   zero-slot observation alone would delete a live work package the moment anybody
 *   called it.
 * - `absent` — the target is already gone. The loser of a race, and a no-op.
 */
export type OptimizationDrainFinish = 'finished' | 'waiting' | 'open' | 'absent';

/**
 * Phase 2 of the two-phase cancel-and-drain (tasks.md 3.9b).
 *
 * **Finish is not the initiator's job.** A crash between `begin` and `finish`
 * left the work package hidden with admission closed for ever, and admission is
 * exactly what a draining work package rejects, so no later read could sweep it.
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
 * **What the delete takes.** The work package arm explicitly removes its owned
 * incoming external relationships, estimates, access, work items and steps before
 * its root; the work-item delete cascades valid local legacy and typed dependencies. The
 * migrated schema deliberately restricts deletion of a populated root. Root
 * cascades then remove optimizer, placement and history rows, preserving shared
 * directory entries and unrelated work packages. Incident sparse step policy is
 * validated in this transaction before cleanup; malformed or unreadable trusted
 * evidence throws, while valid local facts cascade with the deleted graph.
 * Retiring one contract version
 * removes only that version's cache and generation rows.
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
  workPackageId: string,
  contractVersion?: string,
): OptimizationDrainFinish {
  return db.transaction((tx) => finishDrainIn(tx, workPackageId, contractVersion));
}

/**
 * The whole of phase 2, in a transaction the caller already opened.
 *
 * **Every word of `finishOptimizationDrain`'s contract lives here, including
 * the one about the lock.** The three callers differ only in which transaction
 * they hand it: the initiator and the reconciler open one that does nothing
 * else, while a slot release opens one that has just removed a row — and the
 * spec asks for exactly that, the marker re-read *in the same transaction that
 * removes the last affected row*. Splitting the body out is what makes the
 * shared transaction expressible at all: `db.transaction` cannot be called
 * from inside a transaction, so the release path could otherwise only have
 * committed its delete first and finished afterwards, leaving a window in
 * which the target has no slots and no finisher.
 */
function finishDrainIn(
  tx: Transaction,
  workPackageId: string,
  contractVersion?: string,
): OptimizationDrainFinish {
  const outstanding = (): number =>
    tx
      .select()
      .from(solverSlot)
      .where(
        and(
          eq(solverSlot.workPackageId, workPackageId),
          ...(contractVersion === undefined
            ? []
            : [eq(solverSlot.contractVersion, contractVersion)]),
        ),
      )
      .all().length;

  if (contractVersion === undefined) {
    const target = tx.select().from(workPackage).where(eq(workPackage.id, workPackageId)).get();
    if (target === undefined) return 'absent';
    // Proof: bypassing this marker fence deleted an ordinary unmarked work package
    // instead of returning `open` in the raw finalizer test.
    if (target.optimizationDeletePendingAt === null) return 'open';
    // Proof: bypassing this counted-slot fence deleted a populated work package
    // while its child still occupied capacity instead of returning `waiting`.
    if (outstanding() > 0) return 'waiting';

    // Proof: removing this call reached the first-cleanup estimate trigger
    // instead of the external-reference refusal in raw finalization (2026-10-22).
    assertWorkPackageUnreferenced(tx, workPackageId);

    // Proof: independently bypassing either ownership refusal made the raw
    // finalizer return `finished` and erase a bystander-owned dependency edge.
    const foreignLegacy = tx
      .select({ id: dependency.id })
      .from(dependency)
      .where(
        sql`EXISTS (
        SELECT 1 FROM work_item predecessor
        JOIN work_item successor ON successor.id = ${dependency.successorId}
        WHERE predecessor.id = ${dependency.predecessorId}
          AND (
            ${dependency.workPackageId} = ${workPackageId}
            OR predecessor.work_package_id = ${workPackageId}
            OR successor.work_package_id = ${workPackageId}
          )
          AND (
            ${dependency.workPackageId} <> predecessor.work_package_id
            OR ${dependency.workPackageId} <> successor.work_package_id
          )
      )`,
      )
      .get();
    if (foreignLegacy !== undefined)
      throw new Error(
        `work package ${workPackageId} has cross-work-package dependency ${foreignLegacy.id}`,
      );

    const foreignTyped = tx
      .select({ id: typedDependency.id })
      .from(typedDependency)
      .where(
        sql`EXISTS (
        SELECT 1 FROM work_item predecessor
        JOIN work_item successor ON successor.id = ${typedDependency.successorWorkItemId}
        LEFT JOIN step predecessor_step ON predecessor_step.id = ${typedDependency.predecessorStepId}
        LEFT JOIN step successor_step ON successor_step.id = ${typedDependency.successorStepId}
        WHERE predecessor.id = ${typedDependency.predecessorWorkItemId}
          AND (
            ${typedDependency.workPackageId} = ${workPackageId}
            OR predecessor.work_package_id = ${workPackageId}
            OR successor.work_package_id = ${workPackageId}
            OR predecessor_step.work_package_id = ${workPackageId}
            OR successor_step.work_package_id = ${workPackageId}
          )
          AND (
            ${typedDependency.workPackageId} <> predecessor.work_package_id
            OR ${typedDependency.workPackageId} <> successor.work_package_id
            OR (predecessor_step.id IS NOT NULL AND ${typedDependency.workPackageId} <> predecessor_step.work_package_id)
            OR (successor_step.id IS NOT NULL AND ${typedDependency.workPackageId} <> successor_step.work_package_id)
          )
      )`,
      )
      .get();
    if (foreignTyped !== undefined)
      throw new Error(
        `work package ${workPackageId} has cross-work-package typed dependency ${foreignTyped.id}`,
      );

    // Proof: owner-only/step-only selection missed the opposite incident direction;
    // inner joins hid missing references. Missing/unreadable storage defaulted to
    // empty accepted deletion; overbroad reads refused nonincident corrupt policy.
    // Early reads displaced waiting/typed refusals; late reads hit the first-cleanup
    // witness. Premature release commit lost generation/slot/cache; reclaim commit
    // lost the slot. Installed UOW error commit failed graph/journal/event snapshots
    // (optimization-drain-step-parallel and services cases, watched 2026-10-17).
    const parallels = tx
      .select({
        workItemId: stepParallel.workItemId,
        stepId: stepParallel.stepId,
        maxParallel: stepParallel.maxParallel,
        ownerWorkPackage: workItem.workPackageId,
        stepWorkPackage: step.workPackageId,
        hasChildren: sql<number>`EXISTS (SELECT 1 FROM work_item child WHERE child.parent_id = ${stepParallel.workItemId})`,
      })
      .from(stepParallel)
      .leftJoin(workItem, eq(workItem.id, stepParallel.workItemId))
      .leftJoin(step, eq(step.id, stepParallel.stepId))
      .where(or(eq(workItem.workPackageId, workPackageId), eq(step.workPackageId, workPackageId)))
      .all();
    for (const parallel of parallels) {
      // Proof: omitting each null check independently returned work package mismatch
      // instead of the required missing-owner/missing-step sparse diagnostic.
      if (parallel.ownerWorkPackage === null)
        throw new Error('step parallelism has an invalid work-item reference');
      if (parallel.stepWorkPackage === null)
        throw new Error('step parallelism has an invalid step reference');
      // Proof: dropping either work package predicate accepted cross-work-package evidence
      // or reached an independent FK failure instead of the sparse refusal.
      if (parallel.ownerWorkPackage !== workPackageId || parallel.stepWorkPackage !== workPackageId)
        throw new Error('step parallelism work package mismatch');
      // Proof: omitting leaf validation accepted the corrupt parent policy case.
      if (parallel.hasChildren !== 0) throw new Error('step parallelism owner is not a leaf');
      // Proof: omitting range validation accepted zero/fraction/1001; watched 2026-10-17.
      assertStepParallel(parallel.maxParallel);
    }

    const ownedWorkItems = tx
      .select({ id: workItem.id })
      .from(workItem)
      .where(eq(workItem.workPackageId, workPackageId));
    // Proof: moving the estimate delete into the raw wrapper before this
    // transaction left it committed after a later step-cleanup trigger aborted.
    // Proof: omitting any one of these four deletes made installed populated
    // finish fail; broadening each predicate independently erased a bystander
    // estimate, access row, work item or step in the mounted retention tests.
    // Proof: broadening this delete erased C→D in the installed successor
    // cleanup fixture; late step failure restored both links (2026-10-22).
    // Incoming links belong to the deleted successor; surviving predecessors
    // retain their facts and revisions. This lifecycle has no undo journal.
    tx.delete(externalDependency)
      .where(eq(externalDependency.successorWorkPackageId, workPackageId))
      .run();
    tx.delete(estimate).where(inArray(estimate.workItemId, ownedWorkItems)).run();
    tx.delete(workPackageAccess).where(eq(workPackageAccess.workPackageId, workPackageId)).run();
    tx.delete(workItem).where(eq(workItem.workPackageId, workPackageId)).run();
    tx.delete(step).where(eq(step.workPackageId, workPackageId)).run();
    tx.delete(workPackage).where(eq(workPackage.id, workPackageId)).run();
    return 'finished';
  }

  // A work package drain also retires contracts first. Refuse before that retirement
  // can commit a reclaimed slot or generation ahead of work package finalization.
  const target = tx.select().from(workPackage).where(eq(workPackage.id, workPackageId)).get();
  // Proof: bypassing this pending-work-package defense committed retirement and
  // lost slot/generation before raw reclaim refused the work package (2026-10-22).
  if (target !== undefined && target.optimizationDeletePendingAt !== null)
    assertWorkPackageUnreferenced(tx, workPackageId);

  const generation = tx
    .select()
    .from(optimizationGeneration)
    .where(
      and(
        eq(optimizationGeneration.workPackageId, workPackageId),
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
        eq(optimizedScheduleCache.workPackageId, workPackageId),
        eq(optimizedScheduleCache.contractVersion, contractVersion),
      ),
    )
    .run();

  tx.delete(optimizationGeneration)
    .where(
      and(
        eq(optimizationGeneration.workPackageId, workPackageId),
        eq(optimizationGeneration.contractVersion, contractVersion),
      ),
    )
    .run();
  return 'finished';
}

/**
 * Why an admission or a dequeue must refuse, or `null` when neither is closed.
 *
 * - `deleting` — the work package carries `optimization_delete_pending_at`. Reported
 *   in preference to `draining` when both hold, because a deletion closes every
 *   release of the work package and saying so is the more useful of two true things.
 * - `draining` — that contract version alone is retiring. Its siblings are
 *   unaffected, which is the whole difference between the two targets.
 * - `absent` — there is no generation row, or no work package. **This is a refusal,
 *   not a shrug**, and it is the one that is easy to get wrong: `finish` deletes
 *   the generation row, so a caller that read absence as "nothing closed here"
 *   would admit work for a contract version that has just been retired, one
 *   transaction after the drain it was supposed to respect completed.
 */
export type OptimizationClosedReason = 'deleting' | 'draining' | 'absent';

/**
 * The closed-state predicate 3.9b puts in front of both admission and dequeue.
 *
 * **One predicate rather than two copies**, because 3.9b's second watched red
 * removes "either closed-state predicate" and requires work to start between
 * the zero-slot observation and the final delete — a red that only means
 * something if there is a single thing to remove. Admission (6.2) and dequeue
 * (6.3) both reject unless the matching generation is `open` and the work package
 * carries no delete marker; the rest of the dequeue's re-check — generation
 * currency, `cancelEpoch`, the work package toggle — is 6.3's own and is not here.
 *
 * Read inside the caller's transaction so the two reads and the caller's insert
 * commit together. {@link readOptimizationClosedState} is the same read for a
 * caller with no transaction of its own, and opens one for the same reason:
 * the marker and the admission state must be observed as of one instant.
 */
function closedStateIn(
  tx: Transaction,
  workPackageId: string,
  contractVersion: string,
): OptimizationClosedReason | null {
  const target = tx.select().from(workPackage).where(eq(workPackage.id, workPackageId)).get();
  if (target === undefined) return 'absent';
  if (target.optimizationDeletePendingAt !== null) return 'deleting';

  const generation = tx
    .select()
    .from(optimizationGeneration)
    .where(
      and(
        eq(optimizationGeneration.workPackageId, workPackageId),
        eq(optimizationGeneration.contractVersion, contractVersion),
      ),
    )
    .get();
  if (generation === undefined) return 'absent';
  return generation.admissionState === 'open' ? null : 'draining';
}

/** {@link closedStateIn} for a caller that has no transaction open. */
export function readOptimizationClosedState(
  db: SQLiteBunDatabase,
  workPackageId: string,
  contractVersion: string,
): OptimizationClosedReason | null {
  return db.transaction((tx) => closedStateIn(tx, workPackageId, contractVersion));
}

/** Which slot row a release means, and which attempt is entitled to release it. */
export interface SolverSlotRelease {
  readonly workPackageId: string;
  readonly contractVersion: string;
  readonly generation: number;
  readonly objective: SolverObjectiveName;
  readonly budgetMs: number;
  /** 6.11's fence. A release presenting a stale token removes nothing. */
  readonly attemptToken: string;
}

/** What one slot release did — to the row, and to each of the two drain targets. */
export interface SolverSlotReleaseOutcome {
  /** Whether this call is the one that removed the row. */
  readonly released: boolean;
  /** Phase 2 on the slot's own contract version. */
  readonly retirement: OptimizationDrainFinish;
  /** Phase 2 on the slot's work package. */
  readonly deletion: OptimizationDrainFinish;
}

/**
 * Give a solver slot back, and finish any drain that was waiting on it
 * (tasks.md 3.9b, path (a) — the opportunistic finish).
 *
 * **One transaction, and that is the requirement rather than an optimisation.**
 * The delete and both marker re-reads commit together, so no observer ever sees
 * a drained target with zero slots and nobody finishing it. Committing the
 * delete first and finishing afterwards would leave exactly that window, and a
 * crash inside it is what makes the reconciler necessary — this path exists so
 * the reconciler is the backstop for a crash rather than the ordinary route.
 *
 * **The token is a fence, not a formality.** Reclamation mints a new
 * `attemptToken` (6.11), so an owner that was reclaimed and whose slot was then
 * re-admitted would, releasing late, delete a row belonging to a live child and
 * hand its capacity to somebody else. The delete carries the token; a stale one
 * matches no row and `released` comes back false.
 *
 * **Both finishes run even when nothing was released**, and both run even when
 * no drain is in progress. A release that removed nothing is precisely the case
 * where another path already took the row, which is the moment a target may
 * have gone quiet; and on an ordinary work package neither target is closed, so both
 * calls read a marker, return `open` and write nothing. Two reads is what the
 * ordinary path pays for never needing to know whether it is the last one out.
 *
 * **Retirement before deletion**, for the reason the reconciler orders its two
 * loops the same way: a delete-pending work package has every release draining, and
 * retiring them first is what makes the observation. Deleting the work package first
 * reaches the same end state by cascade, without it.
 */
export function releaseSolverSlot(
  db: SQLiteBunDatabase,
  slot: SolverSlotRelease,
): SolverSlotReleaseOutcome {
  return db.transaction((tx) => {
    const held = and(
      eq(solverSlot.workPackageId, slot.workPackageId),
      eq(solverSlot.contractVersion, slot.contractVersion),
      eq(solverSlot.generation, slot.generation),
      eq(solverSlot.objective, slot.objective),
      eq(solverSlot.budgetMs, slot.budgetMs),
      eq(solverSlot.attemptToken, slot.attemptToken),
    );
    // Read then delete, never `.run().changes`: bun-sqlite returns that count at
    // runtime but drizzle types it `void` here, and a number nobody can
    // typecheck is a number nobody can trust.
    const released = tx.select().from(solverSlot).where(held).all().length > 0;
    tx.delete(solverSlot).where(held).run();

    return {
      released,
      retirement: finishDrainIn(tx, slot.workPackageId, slot.contractVersion),
      deletion: finishDrainIn(tx, slot.workPackageId),
    };
  });
}

/** How long a coordinator waits between reconciliation passes (tasks.md 3.9b). */
export const DRAIN_RECONCILE_INTERVAL_MS = 60000;

/** What one reconciliation pass did, for the log line and for the tests. */
export interface OptimizationDrainReconciliation {
  /** Slot rows removed because they passed their own stored deadline. */
  readonly reclaimed: number;
  /** Targets phase 2 completed on this pass. */
  readonly finished: number;
  /** Targets still holding at least one live slot row. */
  readonly waiting: number;
}

/** Limit a reclaim pass to one drain target; omit it for admission's global sweep. */
export interface SolverSlotReclaimScope {
  readonly workPackageId: string;
  readonly contractVersion?: string;
}

/** Read one reconciliation phase's targets; each caller later rechecks under its own writer. */
export function reconciliationTargets(
  db: SQLiteBunDatabase,
  phase: 'generations' | 'work_packages',
): readonly SolverSlotReclaimScope[] {
  if (phase === 'generations')
    return db
      .select({
        workPackageId: optimizationGeneration.workPackageId,
        contractVersion: optimizationGeneration.contractVersion,
      })
      .from(optimizationGeneration)
      .where(eq(optimizationGeneration.admissionState, 'draining'))
      .all();
  return db
    .select({ workPackageId: workPackage.id })
    .from(workPackage)
    .where(isNotNull(workPackage.optimizationDeletePendingAt))
    .all();
}

/** Re-read the named marker after its sweep has acquired the source writer. */
export function reconciliationTargetIsCurrent(
  db: SQLiteBunDatabase,
  target: SolverSlotReclaimScope,
): boolean {
  if (target.contractVersion !== undefined)
    return (
      db
        .select({ state: optimizationGeneration.admissionState })
        .from(optimizationGeneration)
        .where(
          and(
            eq(optimizationGeneration.workPackageId, target.workPackageId),
            eq(optimizationGeneration.contractVersion, target.contractVersion),
          ),
        )
        .get()?.state === 'draining'
    );
  const current = db
    .select({ pendingAt: workPackage.optimizationDeletePendingAt })
    .from(workPackage)
    .where(eq(workPackage.id, target.workPackageId))
    .get();
  return current !== undefined && current.pendingAt !== null;
}

/**
 * Remove expired seats and finish every affected drain in the same transaction.
 *
 * Admission calls the unscoped form before counting capacity, because an
 * expired child anywhere on the host no longer owns a global seat. The drain
 * reconciler calls the scoped form so its existing target-by-target result
 * counts stay meaningful. In both cases the deadline comes from each row and
 * the last-row delete cannot commit without the matching finish attempt.
 */
export function reclaimExpiredSolverSlotsIn(
  tx: Transaction,
  now: number,
  scope?: SolverSlotReclaimScope,
  onFinished?: (target: SolverSlotReclaimScope) => void,
): OptimizationDrainReconciliation {
  const expiring = and(
    // Proof: admitting all deadlines during installed initial reclaim deleted
    // the future E work package and slot in the two-organization mounted fixture.
    // Proof: omitting the persisted-deadline predicate in installed startup
    // reconciliation deleted future-counted C while expired A was eligible.
    lte(solverSlot.admittedDeadlineAt, now),
    ...(scope === undefined
      ? []
      : [
          eq(solverSlot.workPackageId, scope.workPackageId),
          ...(scope.contractVersion === undefined
            ? []
            : [eq(solverSlot.contractVersion, scope.contractVersion)]),
        ]),
  );
  const expired = tx
    .select({
      workPackageId: solverSlot.workPackageId,
      contractVersion: solverSlot.contractVersion,
    })
    .from(solverSlot)
    .where(expiring)
    .all();
  tx.delete(solverSlot).where(expiring).run();

  const targets: SolverSlotReclaimScope[] = [];
  if (scope !== undefined) {
    targets.push(scope);
  } else {
    const contracts = new Map<string, SolverSlotReclaimScope>();
    const workPackages = new Map<string, SolverSlotReclaimScope>();
    for (const row of expired) {
      contracts.set(`${row.workPackageId}\u0000${row.contractVersion}`, row);
      workPackages.set(row.workPackageId, { workPackageId: row.workPackageId });
    }
    targets.push(...contracts.values(), ...workPackages.values());
  }

  let finished = 0;
  let waiting = 0;
  for (const target of targets) {
    const outcome = finishDrainIn(tx, target.workPackageId, target.contractVersion);
    if (outcome === 'finished') {
      finished += 1;
      // Proof: omitting the finished-target callback lost B's selected
      // contract retirement event while A and its graph remained present.
      onFinished?.(target);
    }
    if (outcome === 'waiting') waiting += 1;
  }
  return { reclaimed: expired.length, finished, waiting };
}

/**
 * The path that makes a crash between `begin` and `finish` recoverable
 * (tasks.md 3.9b).
 *
 * **Why it has to exist.** Without it, a coordinator that died after `begin`
 * left the work package hidden with admission closed for ever — and admission is
 * exactly what a draining work package rejects, so no ordinary read could ever sweep
 * it up again. Remove this function and that work package is wedged and undeletable
 * by any code path in the system. Called on coordinator startup and every
 * {@link DRAIN_RECONCILE_INTERVAL_MS}.
 *
 * **What it reclaims, and why that is not the immediate cascade wearing a new
 * name.** A slot row is deleted here only once `now` has passed the deadline
 * **stored on that row**, at which point its child is presumed dead and the
 * capacity was never really outstanding. The deadline is read from the row
 * rather than computed from this coordinator's own configuration, so a
 * coordinator running the smaller budget cannot reclaim a larger-budget child
 * that is still inside its own deadline — the fault that would put the six
 * processes back by another route.
 *
 * **Generations before work packages.** A delete-pending work package has every one of
 * its generations draining, so the first pass retires them release by release
 * and the second deletes the work package once nothing is left. Running it the other
 * way would delete the work package first and take the generation rows with it by
 * cascade — the same end state, reached without ever observing the releases,
 * which is the observation the drain exists to make.
 *
 * Idempotent and safe to run concurrently, because every decision it makes is
 * `finishOptimizationDrain`'s: two reconcilers reach the same end state and
 * neither errors, one of them simply reading `absent` where the other read
 * `finished`. It never reopens admission.
 */
export function reconcileOptimizationDrains(
  db: SQLiteBunDatabase,
  now: number,
): OptimizationDrainReconciliation {
  let reclaimed = 0;
  let finished = 0;
  let waiting = 0;

  const sweep = (workPackageId: string, contractVersion?: string): void => {
    // Reclaim and finish in ONE transaction, which is what 3.9b asks of a
    // reclaim sweep in the same words it asks it of a slot release: the marker
    // is re-read in the transaction that removes the last affected row. The
    // counts are returned rather than added inside the callback, so a rolled
    // back transaction cannot leave this pass reporting rows it did not remove.
    //
    // Counted by reading the rows rather than by the delete's own row count:
    // `.run()` is typed `void` here, so `.changes` is reachable at runtime but
    // untyped, and a number nobody can typecheck is a number nobody can trust.
    const pass = db.transaction((tx) =>
      reclaimExpiredSolverSlotsIn(tx, now, { workPackageId, contractVersion }),
    );
    reclaimed += pass.reclaimed;
    finished += pass.finished;
    waiting += pass.waiting;
  };

  const draining = db
    .select()
    .from(optimizationGeneration)
    .where(eq(optimizationGeneration.admissionState, 'draining'))
    .all();
  for (const row of draining) sweep(row.workPackageId, row.contractVersion);

  const pending = db
    .select()
    .from(workPackage)
    .where(isNotNull(workPackage.optimizationDeletePendingAt))
    .all();
  for (const row of pending) sweep(row.id);

  return { reclaimed, finished, waiting };
}
