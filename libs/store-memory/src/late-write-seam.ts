export type MemoryLateWritePoint =
  'subtree-final-satellite' | 'journal-history-insert' | 'saved-plan-schedule-body';

export interface MemoryLateWriteEvidence {
  readonly journalEventIds?: readonly string[];
  readonly satelliteKeys?: readonly string[];
}

export interface MemoryLateWriteSeam {
  reach(phase: MemoryLateWritePoint, evidence?: MemoryLateWriteEvidence): void;
}

export const inertMemoryLateWriteSeam: MemoryLateWriteSeam = {
  reach: () => undefined,
};
