import type { PlanEvent, PlanEventFilter } from './plan-event-values';
export type { PlanEvent, PlanEventFilter } from './plan-event-values';
export { PLAN_EVENT_RETENTION_DAYS } from './plan-event-values';

export interface PlanEventStore {
  /**
   * One project's history, **newest first**, narrowed by `filter`.
   *
   * There is no `append` here, and that absence is the design. A history row is
   * written by {@link CommandJournalStore.append}, inside the transaction that
   * writes the undo entry, because the two record one act — see that method.
   */
  listFor(projectId: string, filter: PlanEventFilter): Promise<PlanEvent[]>;
  /**
   * Deletes every event recorded before `cutoff`, and answers how many went.
   *
   * The only statement in the product that removes a row from this table.
   */
  pruneOlderThan(cutoff: number): Promise<number>;
}
