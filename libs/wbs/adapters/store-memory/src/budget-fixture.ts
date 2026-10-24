import type { BudgetStore, StoredBudget, WorkItemStore } from '@wbs/core';
import { definitionsOrUnowned, type MeasureDefinition } from '@wbs/domain';

import { compareValueGroupIds } from './value-group-placement';

/** The stated budgets of a memory source. */
export interface MemoryBudgetTable {
  readonly rows: StoredBudget[];
}
export function memoryBudgetTable(): MemoryBudgetTable {
  return { rows: [] };
}

/**
 * A BudgetStore over an array: the memory twin of `work_item_budget`
 * (`wbs-measure-budgets` design D36).
 *
 * `definitionsOf` answers the owning organization's definitions, or null for
 * an unowned project, which answers the seeded four (design D19). A deleted
 * work item's budgets are taken by the source's satellite removal, as SQLite's
 * cascade takes them.
 */
export function inMemoryBudgets(
  workItems: WorkItemStore,
  table: MemoryBudgetTable = memoryBudgetTable(),
  definitionsOf: (projectId: string) => MeasureDefinition[] | null = () => null,
): BudgetStore {
  const { rows } = table;
  const removeStored = (workItemId: string, key: string): void => {
    const kept = rows.filter((row) => !(row.workItemId === workItemId && row.key === key));
    rows.splice(0, rows.length, ...kept);
  };
  return {
    async listByProject(projectId) {
      const ids = new Set((await workItems.listByProject(projectId)).map((each) => each.id));
      return rows
        .filter((row) => ids.has(row.workItemId))
        .sort(
          (left, right) =>
            compareValueGroupIds(left.workItemId, right.workItemId) ||
            (left.key < right.key ? -1 : left.key > right.key ? 1 : 0),
        )
        .map((row) => ({ ...row }));
    },
    async set(budget, _stamp) {
      const owner = await workItems.findById(budget.workItemId);
      if (owner === null) throw new Error(`budget names absent work item ${budget.workItemId}`);
      // Proof: with this check removed, the memory certification's
      // `budgets.set:defined-key` stored `story_points`; watched 2026-10-23.
      if (
        !definitionsOrUnowned(definitionsOf(owner.projectId)).some(
          (each) => each.key === budget.key,
        )
      )
        throw new Error(
          `measure ${budget.key} is not defined by the organization owning work item ${budget.workItemId}`,
        );
      removeStored(budget.workItemId, budget.key);
      rows.push({ ...budget });
    },
    remove(workItemId, key, _stamp) {
      removeStored(workItemId, key);
      return Promise.resolve();
    },
  };
}
