import { and, eq, inArray } from 'drizzle-orm';
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

  async remove(workItemId: string, roleId: string): Promise<void> {
    // Both halves of the key, not the role alone: the composite primary key is
    // (work item, role), and narrowing to one of them would clear that role
    // across the whole database. `estimate.test.ts` keeps a survivor for each
    // half so that mistake cannot pass.
    //
    // Proof: narrowed to `eq(estimate.roleId, roleId)` alone, `removes one
    // work item's role without touching the other role or the same role
    // elsewhere` fails; watched 2026-08-06.
    await this.db
      .delete(estimate)
      .where(and(eq(estimate.workItemId, workItemId), eq(estimate.roleId, roleId)));
  }

  async moveAll(fromWorkItemId: string, toWorkItemId: string): Promise<void> {
    await this.db
      .update(estimate)
      .set({ workItemId: toWorkItemId })
      .where(eq(estimate.workItemId, fromWorkItemId));
  }
}
