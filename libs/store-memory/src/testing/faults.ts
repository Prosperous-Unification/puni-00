export type MemoryLateWritePoint =
  'subtree-final-satellite' | 'journal-history-insert' | 'saved-plan-schedule-body';

export interface MemoryLateWriteControl<Phase extends MemoryLateWritePoint> {
  readonly adapter: 'memory';
  readonly phase: Phase;
  arm(): void;
  isArmed(): boolean;
  reach(phase: Phase): boolean;
  reached(): boolean;
  reachStagedWrite(phase: Phase): boolean;
}

/** Creates a per-source hook to be called inside the staged write it names. */
export function memoryLateWriteControl<const Phase extends MemoryLateWritePoint>(
  phase: Phase,
): MemoryLateWriteControl<Phase> {
  let isArmed = false;
  let hasReached = false;
  const reach = (): boolean => {
    if (!isArmed) return false;
    hasReached = true;
    return true;
  };
  return {
    adapter: 'memory',
    phase,
    arm: () => {
      isArmed = true;
    },
    isArmed: () => isArmed,
    reach,
    reached: () => hasReached,
    reachStagedWrite: reach,
  };
}
