import type { StepNodeRef } from './step-node';

/** A sparse direct blockage fact, independent of progress and schedule (ADR 0053). */
export interface StoredStepBlockage extends StepNodeRef {
  readonly blockedAt: number;
}

/** Direct blockage kinds read by this release; absence means no direct fact. */
export const STEP_BLOCKAGE_KINDS = ['blocked'] as const;
