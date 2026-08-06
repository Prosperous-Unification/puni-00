import { eq, inArray } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { EstimateStore, StoredEstimate } from './index';
import { estimate, workItem } from './schema';

export class EstimateRepository implements EstimateStore {
  constructor(private readonly db: SQLiteBunDatabase) {}

  async listByProject(projectId: string): Promise<StoredEstimate[]> {
    const ids = await this.db
      .select({ id: workItem.id })
      .from(workItem)
      .where(eq(workItem.projectId, projectId));
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(estimate)
      .where(
        inArray(
          estimate.workItemId,
          ids.map((row) => row.id),
        ),
      );
  }

  async set(toSet: StoredEstimate): Promise<void> {
    await this.db
      .insert(estimate)
      .values(toSet)
      .onConflictDoUpdate({
        target: [estimate.workItemId, estimate.roleId],
        set: {
          optimistic: toSet.optimistic,
          realistic: toSet.realistic,
          pessimistic: toSet.pessimistic,
        },
      });
  }

  async moveAll(fromWorkItemId: string, toWorkItemId: string): Promise<void> {
    await this.db
      .update(estimate)
      .set({ workItemId: toWorkItemId })
      .where(eq(estimate.workItemId, fromWorkItemId));
  }
}
