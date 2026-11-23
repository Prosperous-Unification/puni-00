import type { StoredEstimate } from '@wbs/domain';

import type { StepWriteDecision } from '../step-catalogue/step-write';
import type { WriteStamp } from './write-stamp';

export type { StoredEstimate } from '@wbs/domain';

/**
 * What a write that names a step answers when the step is not there.
 *
 * The **store**'s answer rather than a driver error for the service to
 * classify (D6, `docs/2026-09-05-ports-and-adapters-plan.md` §3.2). SQLite says
 * `FOREIGN KEY constraint failed` and names no column, so only the store — the
 * one thing that knows which references it just wrote — can say which of them
 * was the missing one. A service that read the driver's message would be
 * reading SQLite's, and a second source would have to produce that message to
 * be understood.
 *
 * Absent/foreign addressed identities are opaque unknown_step. Current direct type
 * conflicts and owned identities outside the leaf's resolved catalogue are modeled
 * refusals. An absent work item or malformed trusted catalogue still throws.
 * Applicability is captured on the mutation's actual writer before its first write.
 */
export type StepWriteOutcome = 'written' | 'unknown_step' | 'step_not_resolved' | 'type_conflict';

/** One populated value group's predecessor in that value store's full-reader order. */
export interface ValueGroupPlacement {
  readonly id: string;
  readonly afterId: string | null;
}

export interface EstimateStore {
  /** One current leaf snapshot for validation; set always captures again on its own writer before mutation. */
  readTarget(workItemId: string, stepId: string): Promise<StepWriteDecision>;
  listByWorkPackage(workPackageId: string): Promise<StoredEstimate[]>;
  /** Values for the requested work items in work package and step order. */
  listByWorkItems(workPackageId: string, ids: readonly string[]): Promise<StoredEstimate[]>;
  /**
   * Placement of each requested populated group in this store's full-reader order.
   *
   * Each answer names the immediate populated predecessor whether requested or
   * not. Missing, empty, and foreign-work-package groups are absent; empty IDs return
   * an empty collection.
   */
  listPlacements(workPackageId: string, ids: readonly string[]): Promise<ValueGroupPlacement[]>;
  /** Writes one work item's estimate for one step, replacing any earlier one. */
  set(estimate: StoredEstimate, stamp: WriteStamp): Promise<StepWriteOutcome>;
  /**
   * Takes away one work item's estimate for one step, leaving every other
   * step on that work item and that step on every other work item alone.
   *
   * Removing one that is not stored is not an error: the state asked for is
   * the state left, and two people emptying the same three boxes must not turn
   * the second one into a failure on screen.
   */
  remove(workItemId: string, stepId: string, stamp: WriteStamp): Promise<void>;
  /**
   * Moves every estimate from one work item to another.
   *
   * Used in both directions by the same rule: an estimated work item that gains
   * its first child hands the estimate down, and a work item whose last child is
   * deleted takes it back. Neither is a merge — a parent never holds estimates of
   * its own while it has children.
   */
  moveAll(fromWorkItemId: string, toWorkItemId: string, stamp: WriteStamp): Promise<void>;
}
