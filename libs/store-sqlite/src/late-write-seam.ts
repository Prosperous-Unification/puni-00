export type SqliteLateWritePoint =
  'subtree-final-satellite' | 'journal-history-insert' | 'saved-plan-schedule-body';

export interface SqliteLateWriteEvidence {
  readonly satelliteKeys?: readonly string[];
  readonly savedPlanId?: string;
  readonly savedPlanHeaderPresent?: boolean;
  readonly savedPlanBodyKinds?: readonly ('input' | 'schedule')[];
}

export interface SqliteLateWriteSeam {
  isActive?(phase: SqliteLateWritePoint): boolean;
  reach(phase: SqliteLateWritePoint, evidence?: SqliteLateWriteEvidence): void;
}

export const inertSqliteLateWriteSeam: SqliteLateWriteSeam = {
  reach: () => undefined,
};
