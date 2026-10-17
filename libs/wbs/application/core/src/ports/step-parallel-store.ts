import type { StoredStepParallel } from '@wbs/domain';

import type { WriteStamp } from './write-stamp';
export type { StoredStepParallel } from '@wbs/domain';

/**
 * Sparse authored facts. Set replaces one pair even when equal to the row default;
 * remove restores absence. Reads refuse corrupt references, values and duplicates.
 * Writes participate in the source unit of work; missing references throw.
 * This internal foundation has no public writer or scheduling consumer yet.
 */
export interface StepParallelStore {
  listByProject(projectId: string): Promise<StoredStepParallel[]>;
  listByWorkItems(projectId: string, ids: readonly string[]): Promise<StoredStepParallel[]>;
  set(parallel: StoredStepParallel, stamp: WriteStamp): Promise<void>;
  remove(workItemId: string, stepId: string, stamp: WriteStamp): Promise<void>;
}
