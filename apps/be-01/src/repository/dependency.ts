import { and, eq, or } from 'drizzle-orm';

import type { Drizzle } from './db';
import type { DependencyStore, StoredDependency } from './index';
import { bumpWorkItems } from './revision';
import { dependency } from './schema';

/**
 * An edge is a satellite of **both** work items it joins: the successor reads
 * it as "what I wait for" and the predecessor as "what waits for me". Every
 * write here therefore moves two revisions, in the transaction that carries the
 * edge write.
 *
 * Proof: bumped for the successor alone, `adding an edge moves both endpoints`
 * in `service/revision.test.ts` fails on the predecessor; watched 2026-08-07.
 */
export class DependencyRepository implements DependencyStore {
  constructor(private readonly db: Drizzle) {}

  async listByProject(projectId: string): Promise<StoredDependency[]> {
    return this.db.select().from(dependency).where(eq(dependency.projectId, projectId));
  }

  /**
   * `onConflictDoNothing` on the unique pair rather than a read-then-write.
   *
   * Two people drawing the same arrow at the same moment would both see "not
   * there" and both insert; the second would fail on the index and surface as a
   * 500 for an action that had already succeeded.
   *
   * The revisions move even when the insert did nothing, for the same reason
   * the estimate bumps are unconditional: making the bump depend on what the
   * insert did means reading what the insert did, and a spurious bump costs a
   * retry where a missing one costs a lost edit.
   */
  async add(toAdd: StoredDependency): Promise<void> {
    await Promise.resolve();
    this.db.transaction((tx) => {
      tx.insert(dependency).values(toAdd).onConflictDoNothing().run();
      bumpWorkItems(tx, [toAdd.predecessorId, toAdd.successorId]);
    });
  }

  async remove(predecessorId: string, successorId: string): Promise<void> {
    await Promise.resolve();
    this.db.transaction((tx) => {
      tx.delete(dependency)
        .where(
          and(eq(dependency.predecessorId, predecessorId), eq(dependency.successorId, successorId)),
        )
        .run();
      bumpWorkItems(tx, [predecessorId, successorId]);
    });
  }

  /**
   * Both directions, because a work item being deleted is neither a predecessor
   * nor a successor any more. The foreign keys would refuse the delete otherwise,
   * which is the point: an edge to a row that is gone is not a thing to keep.
   *
   * The **surviving** ends are bumped and `workItemId` is not. This is the one
   * place the edges have to be read before they are written: which work items
   * lose an edge is not knowable from the argument, and it is the *set of rows*
   * being read, never the counter — the counter is still `revision + 1` in SQL,
   * inside the same transaction as the delete. The caller is on its way to
   * deleting `workItemId`, so bumping it would move a counter onto a row about
   * to stop existing.
   */
  async removeAllFor(workItemId: string): Promise<void> {
    await Promise.resolve();
    const touchesIt = or(
      eq(dependency.predecessorId, workItemId),
      eq(dependency.successorId, workItemId),
    );
    this.db.transaction((tx) => {
      const losing = tx
        .select({ predecessorId: dependency.predecessorId, successorId: dependency.successorId })
        .from(dependency)
        .where(touchesIt)
        .all();
      tx.delete(dependency).where(touchesIt).run();
      bumpWorkItems(
        tx,
        losing
          .flatMap((edge) => [edge.predecessorId, edge.successorId])
          .filter((id) => id !== workItemId),
      );
    });
  }
}
