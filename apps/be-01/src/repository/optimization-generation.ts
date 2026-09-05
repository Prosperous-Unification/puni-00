import { and, eq, lt } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { toOptimizationGenerationRow } from './optimizer-rows';
import {
  optimizationGeneration,
  type OptimizationGenerationRow,
  optimizedScheduleCache,
  solverQueue,
} from './schema';

/** The handle a caller's own transaction hands to {@link readGeneration}. */
type Transaction = Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0];

/**
 * A database handle or an open transaction on one.
 *
 * {@link readGeneration} takes this because 4.1's conditional write reads the
 * generation row from *inside* the transaction that inserts against it; on the
 * outer handle it would be answering about a state the insert never sees.
 */
type GenerationReader = SQLiteBunDatabase | Transaction;

/**
 * The generation identity, allocated and read per `(projectId, contractVersion)`.
 *
 * **The key is why this exists.** `SCHEDULER_CONTRACT_VERSION` is bumped while
 * two releases run against one SQLite file, so a counter living on the
 * `project` row would be shared: blue computing H1 and green computing H2 would
 * alternately increment it and delete each other's cache rows for ever, on a
 * plan nobody edited. Each release owns its own row instead, and
 * {@link allocateGeneration} never reads or writes another contract version's.
 *
 * A **real plan edit still fences both**, because it changes `inputHash`, which
 * is a key column of the cache in every contract version. Blue/green isolation
 * is about the generation counter, not about the hash.
 */
export type { OptimizationGenerationRow };

/**
 * Reads the generation row for one release's key, or null before the first
 * allocation.
 *
 * The row goes through {@link toOptimizationGenerationRow}, so an
 * `admission_state` no `CHECK` was in force for throws here rather than being
 * cast into the caller's typed field (tasks.md 3.8).
 */
export function readGeneration(
  db: GenerationReader,
  projectId: string,
  contractVersion: string,
): OptimizationGenerationRow | null {
  const row = db
    .select()
    .from(optimizationGeneration)
    .where(
      and(
        eq(optimizationGeneration.projectId, projectId),
        eq(optimizationGeneration.contractVersion, contractVersion),
      ),
    )
    .get();
  return row === undefined ? null : toOptimizationGenerationRow(row);
}

/**
 * Allocates the next generation for one release's key and evicts what it
 * supersedes, in one transaction (tasks.md 4.1's allocation clause).
 *
 * Three rules the eviction obeys, each of them load-bearing:
 *
 * 1. **Only this contract version's rows.** Every `where` below carries
 *    `contractVersion`, so allocating for green cannot delete a row blue is
 *    still serving. That is the blue/green case of 3.9.
 * 2. **Only OLDER generations.** The rows this allocation itself will produce
 *    carry the new number, and a delete written as "not the current one" would
 *    race its own writer.
 * 3. **Slot rows are not touched.** Freeing the count before the children are
 *    proved dead is what let six real children run while SQLite counted two;
 *    a slot row is released by the owner that holds it, never by an allocation.
 */
export function allocateGeneration(
  db: SQLiteBunDatabase,
  projectId: string,
  contractVersion: string,
  inputHash: string,
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
    const next = (current?.generation ?? 0) + 1;

    tx.insert(optimizationGeneration)
      .values({
        projectId,
        contractVersion,
        generation: next,
        inputHash,
        cancelEpoch: current?.cancelEpoch ?? 0,
        admissionState: current?.admissionState ?? 'open',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [optimizationGeneration.projectId, optimizationGeneration.contractVersion],
        // `cancelEpoch` and `admissionState` are deliberately absent: a new
        // generation is not a cancellation and does not reopen a draining one.
        set: { generation: next, inputHash, updatedAt: now },
      })
      .run();

    tx.delete(optimizedScheduleCache)
      .where(
        and(
          eq(optimizedScheduleCache.projectId, projectId),
          eq(optimizedScheduleCache.contractVersion, contractVersion),
          lt(optimizedScheduleCache.generation, next),
        ),
      )
      .run();
    tx.delete(solverQueue)
      .where(
        and(
          eq(solverQueue.projectId, projectId),
          eq(solverQueue.contractVersion, contractVersion),
          lt(solverQueue.generation, next),
        ),
      )
      .run();

    return next;
  });
}
