export type MemoryLateWritePoint =
  'subtree-final-satellite' | 'journal-history-insert' | 'saved-plan-schedule-body';

export interface MemoryLateWriteSeam {
  reach(phase: MemoryLateWritePoint): void;
}

export const inertMemoryLateWriteSeam: MemoryLateWriteSeam = {
  reach: () => undefined,
};
