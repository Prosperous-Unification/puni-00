import type { StepNodeRef } from './step-node';

/** A sparse direct blockage fact, independent of progress and schedule (ADR 0053). */
export interface StoredStepBlockage extends StepNodeRef {
  readonly blockedAt: number;
}

/** A root of informational stoppage; a stepless hold has no invented step identity. */
export type BlockageRoot =
  | { readonly kind: 'step'; readonly nodeId: string }
  | { readonly kind: 'work-item'; readonly workItemId: string };

/** Direct blockage kinds read by this release; absence means no direct fact. */
export const STEP_BLOCKAGE_KINDS = ['blocked'] as const;
