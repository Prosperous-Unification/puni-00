import type { StoredBudget } from '@wbs/domain';

import type { WriteStamp } from './write-stamp';

export type { BudgetKey, StoredBudget } from '@wbs/domain';

/**
 * Reading and writing the stated budgets (`wbs-measure-budgets` D5, design
 * D36), one per work item and definition key.
 *
 * A budget belongs to its work item and stays there through every structural
 * change (design D42): unlike facts and trios it is never moved down to a
 * first child or handed up from a last one, so there is no `moveAll`. A
 * deleted work item's budgets go with it (SQLite's cascade, the memory
 * source's satellite removal) and come back through {@link set} on undo.
 * Derived budgets are computed on read and never stored here.
 */
export interface BudgetStore {
  /** Every stated budget in the project, in work item then key order. */
  listByProject(projectId: string): Promise<StoredBudget[]>;
  /**
   * Writes one work item's budget in one key, replacing any earlier one there.
   *
   * @throws when the key is not one the owning organization defines (or,
   * unowned, one of the seeded four), or when the work item is absent: callers
   * decide the key first (`decideBudget`).
   */
  set(budget: StoredBudget, stamp: WriteStamp): Promise<void>;
  /** Takes one work item's budget in one key away; removing an absent one is not an error. */
  remove(workItemId: string, key: string, stamp: WriteStamp): Promise<void>;
}
