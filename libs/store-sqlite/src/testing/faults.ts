export type SqliteLateWritePoint =
  'subtree-final-satellite' | 'journal-history-insert' | 'saved-plan-schedule-body';

export interface SqliteLateWriteControl<Phase extends SqliteLateWritePoint> {
  readonly adapter: 'sqlite';
  readonly phase: Phase;
  arm(): void;
  isArmed(): boolean;
  reach(phase: Phase): boolean;
  reached(): boolean;
  reachTransactionWrite(phase: Phase): boolean;
}

/** Creates a per-source hook to be called inside the transaction write it names. */
export function sqliteLateWriteControl<const Phase extends SqliteLateWritePoint>(
  phase: Phase,
): SqliteLateWriteControl<Phase> {
  let isArmed = false;
  let hasReached = false;
  const reach = (): boolean => {
    if (!isArmed) return false;
    hasReached = true;
    return true;
  };
  return {
    adapter: 'sqlite',
    phase,
    arm: () => {
      isArmed = true;
    },
    isArmed: () => isArmed,
    reach,
    reached: () => hasReached,
    reachTransactionWrite: reach,
  };
}
