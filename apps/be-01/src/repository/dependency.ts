import { and, eq, or } from 'drizzle-orm';

import type { Drizzle } from './db';
import type { DependencyStore, StoredDependency } from './index';
import { dependency } from './schema';

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
   */
  async add(toAdd: StoredDependency): Promise<void> {
    await this.db.insert(dependency).values(toAdd).onConflictDoNothing();
  }

  async remove(predecessorId: string, successorId: string): Promise<void> {
    await this.db
      .delete(dependency)
      .where(
        and(eq(dependency.predecessorId, predecessorId), eq(dependency.successorId, successorId)),
      );
  }

  /**
   * Both directions, because a work item being deleted is neither a predecessor
   * nor a successor any more. The foreign keys would refuse the delete otherwise,
   * which is the point: an edge to a row that is gone is not a thing to keep.
   */
  async removeAllFor(workItemId: string): Promise<void> {
    await this.db
      .delete(dependency)
      .where(or(eq(dependency.predecessorId, workItemId), eq(dependency.successorId, workItemId)));
  }
}
