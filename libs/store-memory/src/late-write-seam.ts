export type MemoryLateWritePoint =
  'subtree-final-satellite' | 'journal-history-insert' | 'saved-plan-schedule-body';

export interface MemoryLateWriteEvidence {
  readonly journalEventIds?: readonly string[];
  readonly satelliteKeys?: readonly string[];
  readonly savedPlanId?: string;
  readonly savedPlanHeaderPresent?: boolean;
  readonly savedPlanBodyKinds?: readonly ('input' | 'schedule')[];
}

export interface MemoryLateWriteSeam {
  isActive?(phase: MemoryLateWritePoint): boolean;
  reach(phase: MemoryLateWritePoint, evidence?: MemoryLateWriteEvidence): void;
}

export const inertMemoryLateWriteSeam: MemoryLateWriteSeam = {
  reach: () => undefined,
};
