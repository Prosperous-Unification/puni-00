import type { Source, TransactionalStores } from '@wbs/core';

import type { MemoryLateWritePoint } from '../late-write-seam';
import { openMemorySourceWithLateWriteSeam } from '../source';

export type { MemoryLateWritePoint } from '../late-write-seam';

export interface MemoryLateWriteControl<Phase extends MemoryLateWritePoint> {
  readonly adapter: 'memory';
  readonly phase: Phase;
  claim(): boolean;
  arm(): void;
  isArmed(): boolean;
  reach(phase: MemoryLateWritePoint): boolean;
  reached(): boolean;
  reachStagedWrite(phase: MemoryLateWritePoint): boolean;
}

/** Creates a per-source hook to be called inside the staged write it names. */
export function memoryLateWriteControl<const Phase extends MemoryLateWritePoint>(
  phase: Phase,
): MemoryLateWriteControl<Phase> {
  let isArmed = false;
  let hasReached = false;
  let isClaimed = false;
  const reach = (reachedPhase: MemoryLateWritePoint): boolean => {
    if (!isArmed || reachedPhase !== phase) return false;
    hasReached = true;
    return true;
  };
  return {
    adapter: 'memory',
    phase,
    claim() {
      if (isClaimed) return false;
      isClaimed = true;
      return true;
    },
    arm: () => {
      isClaimed = true;
      if (isArmed) throw new Error(`memory fault control for ${phase} was already armed`);
      isArmed = true;
    },
    isArmed: () => isArmed,
    reach,
    reached: () => hasReached,
    reachStagedWrite: reach,
  };
}

/** Opens the real staged source with this run's late-write barrier attached. */
export function openMemorySourceWithFault(
  control: MemoryLateWriteControl<MemoryLateWritePoint>,
): Source<TransactionalStores> {
  return openMemorySourceWithLateWriteSeam({
    reach(phase) {
      if (control.reachStagedWrite(phase)) throw new Error(`injected memory fault at ${phase}`);
    },
  });
}
