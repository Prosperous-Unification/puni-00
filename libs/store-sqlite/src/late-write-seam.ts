export type SqliteLateWritePoint =
  'subtree-final-satellite' | 'journal-history-insert' | 'saved-plan-schedule-body';

export interface SqliteLateWriteEvidence {
  readonly satelliteKeys?: readonly string[];
}

export interface SqliteLateWriteSeam {
  reach(phase: SqliteLateWritePoint, evidence?: SqliteLateWriteEvidence): void;
}

export const inertSqliteLateWriteSeam: SqliteLateWriteSeam = {
  reach: () => undefined,
};
