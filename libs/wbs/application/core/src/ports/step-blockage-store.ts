import type { StoredStepBlockage } from '@wbs/domain';

import type { StepWriteOutcome } from './estimate-store';
import type { WriteStamp } from './write-stamp';

export type { StoredStepBlockage } from '@wbs/domain';

/** Sparse audited facts on leaf step nodes, separate from progress (ADR 0053). */
export interface StepBlockageStore {
  listByProject(projectId: string): Promise<StoredStepBlockage[]>;
  listByWorkItems(projectId: string, ids: readonly string[]): Promise<StoredStepBlockage[]>;
  set(blockage: StoredStepBlockage, stamp: WriteStamp): Promise<StepWriteOutcome>;
  remove(workItemId: string, stepId: string, stamp: WriteStamp): Promise<void>;
  /** Transfers facts without changing their original blocked time; bumps only changed owners. */
  moveAll(fromWorkItemId: string, toWorkItemId: string, stamp: WriteStamp): Promise<void>;
}
