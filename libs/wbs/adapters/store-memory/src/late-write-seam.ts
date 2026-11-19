import type { StoredSavedPlanBytes } from '@wbs/core';

export type MemoryLateWritePoint =
  'subtree-final-satellite' | 'journal-history-insert' | 'saved-plan-schedule-body';

export interface MemoryLateWriteEvidence {
  readonly journalEventIds?: readonly string[];
  readonly satelliteKeys?: readonly string[];
  readonly savedPlan?: StoredSavedPlanBytes;
}

export interface MemoryLateWriteSeam {
  isActive?(phase: MemoryLateWritePoint): boolean;
  observeBoundary?(phase: MemoryLateWritePoint, evidence: MemoryLateWriteEvidence): void;
  reach(phase: MemoryLateWritePoint, evidence?: MemoryLateWriteEvidence): void;
}

export const inertMemoryLateWriteSeam: MemoryLateWriteSeam = {
  reach: () => undefined,
};
