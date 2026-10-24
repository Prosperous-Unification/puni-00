import type { BudgetStore, StoredBudget, WriteStamp } from '@wbs/core';
import { definitionsOrUnowned, isBudgetPolicy } from '@wbs/domain';
import { and, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Gate } from './gate';
import { bumpWorkItems } from './revision';
import { projectOrganization, workItem, workItemBudget } from './schema';
import { measureIdFor } from './step-measure';

/**
 * The stated budgets (`wbs-measure-budgets` D5, design D36), a satellite of
 * their work item: every write moves that work item's revision in its own
 * transaction, as facts and trios do. Budgets never move between work items
 * (design D42), so there is no `moveAll`; `work_item_id` cascades.
 */
export class WorkItemBudgetRepository implements BudgetStore {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /**
   * Every stated budget in the project, in work item then key order.
   *
   * @throws on a stored policy outside the two: the CHECK refuses one, so it
   * is a schema that drifted from its constraint.
   */
  async listByProject(projectId: string): Promise<StoredBudget[]> {
    await Promise.resolve();
    return (
      this.db
        .select({
          workItemId: workItemBudget.workItemId,
          key: workItemBudget.measureKey,
          cap: workItemBudget.cap,
          policy: workItemBudget.policy,
          holdPerAttempt: workItemBudget.holdPerAttempt,
        })
        .from(workItemBudget)
        // Inner: `work_item_id` is a foreign key.
        .innerJoin(workItem, eq(workItemBudget.workItemId, workItem.id))
        .where(eq(workItem.projectId, projectId))
        .orderBy(workItemBudget.workItemId, workItemBudget.measureKey)
        .all()
        .map((row) => {
          // Proof: with this check made to pass, `rejects a stored budget
          // policy outside the two after constraint-bypassing corruption`
          // (targeted-readers.db.test.ts) read policy `firm`; watched 2026-10-24.
          if (!isBudgetPolicy(row.policy))
            throw new Error(
              `budget ${row.workItemId}/${row.key} holds policy ${String(row.policy)}`,
            );
          return { ...row, policy: row.policy };
        })
    );
  }

  /**
   * Writes one budget, replacing any earlier one in its key.
   *
   * @throws when the key names no definition of the owning organization (or,
   * unowned, none of the seeded four): the service decided it inside this
   * unit of work.
   */
  async set(budget: StoredBudget, stamp: WriteStamp): Promise<void> {
    const { workItemId, key, cap, policy, holdPerAttempt } = budget;
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        const measureId = this.referenceOf(tx, workItemId, key);
        tx.insert(workItemBudget)
          .values({
            workItemId,
            measureKey: key,
            measureId,
            cap,
            policy,
            holdPerAttempt,
            ...auditOnCreate(stamp),
          })
          .onConflictDoUpdate({
            target: [workItemBudget.workItemId, workItemBudget.measureKey],
            set: { cap, policy, holdPerAttempt, ...auditOnUpdate(stamp) },
          })
          .run();
        bumpWorkItems(tx, [workItemId], stamp);
      });
    });
  }

  async remove(workItemId: string, key: string, stamp: WriteStamp): Promise<void> {
    await this.gate.enter(async () => {
      await Promise.resolve();
      this.db.transaction((tx) => {
        tx.delete(workItemBudget)
          .where(and(eq(workItemBudget.workItemId, workItemId), eq(workItemBudget.measureKey, key)))
          .run();
        bumpWorkItems(tx, [workItemId], stamp);
      });
    });
  }

  /**
   * The definition id a budget in `key` references: the owning
   * organization's, or null for one of the seeded four on a project no
   * organization owns (design D19).
   */
  private referenceOf(tx: SQLiteBunDatabase, workItemId: string, key: string): string | null {
    const resolved = measureIdFor(tx, workItemId, key);
    if (resolved !== null) return resolved;
    const owned = tx
      .select({ organizationId: projectOrganization.organizationId })
      .from(workItem)
      .innerJoin(projectOrganization, eq(projectOrganization.resourceId, workItem.projectId))
      .where(eq(workItem.id, workItemId))
      .get();
    // Proof: with this throw removed, the SQLite certification's
    // `budgets.set:defined-key` stored `story_points` unkeyed; watched 2026-10-23.
    if (owned !== undefined || !definitionsOrUnowned(null).some((each) => each.key === key))
      throw new Error(
        `measure ${key} is not defined by the organization owning work item ${workItemId}`,
      );
    return null;
  }
}
