export type SqliteLateWritePoint =
  'subtree-final-satellite' | 'journal-history-insert' | 'saved-plan-schedule-body';

export interface SqliteLateWriteSeam {
  reach(phase: SqliteLateWritePoint): void;
}

export const inertSqliteLateWriteSeam: SqliteLateWriteSeam = {
  reach: () => undefined,
};
