import type { StoredMeasureEstimate } from '@wbs/domain';

import type { StepWriteOutcome } from './estimate-store';
import type { WriteStamp } from './write-stamp';

export type { MeasureEstimateKey, StoredMeasureEstimate } from '@wbs/domain';

/**
 * Reading and writing the three-point estimates in measures other than time
 * (`wbs-measure-budgets` D3), one per step node and definition key.
 *
 * The time trio is not here: it stays in {@link EstimateStore}, the solver's
 * only input (D2). These trios follow their work item through every
 * structural change exactly as {@link MeasureStore}'s facts do — the
 * hand-down, the hand-up, the restore an undo runs — through the same call
 * sites.
 *
 * **The tokens trio and the legacy token estimate are one figure** (design
 * D28): a single-point `tokens` trio is held as the legacy `token_estimate`
 * row in {@link MeasureStore}, which the outgoing release reads and writes,
 * and a three-point one is held here with no legacy row. Each adapter keeps
 * the two in step: SQLite by triggers on `step_measure`, the memory fixture by
 * deriving the single-point trios from its measure rows on read.
 */
export interface MeasureEstimateStore {
  /**
   * Every trio in the project, single-point tokens trios included, in work
   * item, step order and key order.
   */
  listByProject(projectId: string): Promise<StoredMeasureEstimate[]>;
  /**
   * Writes one step node's trio in one measure, replacing any earlier one in
   * that measure and leaving its other measures alone.
   *
   * A `tokens` trio with `singlePoint` set is written as the legacy
   * `token_estimate` row (its three points must be equal); any other is
   * written here, and for `tokens` the legacy row is taken away.
   *
   * @throws when the key is not one the owning organization defines (or,
   * unowned, `tokens`), when `singlePoint` is set on anything but an equal
   * tokens trio, or when the trio is unordered: callers decide the key first.
   */
  set(estimate: StoredMeasureEstimate, stamp: WriteStamp): Promise<StepWriteOutcome>;
  /**
   * Takes one step node's trio in one measure away, the legacy row with it
   * for `tokens`. Removing one that is not stored is not an error.
   */
  remove(workItemId: string, stepId: string, key: string, stamp: WriteStamp): Promise<void>;
  /**
   * Moves every trio held here from one work item to another, at the
   * hand-down a leaf's first child takes. The single-point tokens trios move
   * with their legacy rows ({@link MeasureStore.moveAll}).
   */
  moveAll(fromWorkItemId: string, toWorkItemId: string, stamp: WriteStamp): Promise<void>;
}
