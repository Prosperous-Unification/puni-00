import type { SqliteLateWriteEvidence, SqliteLateWritePoint } from '../late-write-seam';
import type { OpenSqliteSourceOptions, SqliteSource } from '../source';
import { openSqliteSourceWithLateWriteSeam } from '../source';

export type { SqliteLateWritePoint } from '../late-write-seam';

export interface SqliteLateWriteControl<Phase extends SqliteLateWritePoint> {
  readonly adapter: 'sqlite';
  readonly phase: Phase;
  claim(): boolean;
  arm(): void;
  isArmed(): boolean;
  reach(phase: SqliteLateWritePoint): boolean;
  reached(): boolean;
  observedSatelliteKeys(): readonly string[];
  reachTransactionWrite(phase: SqliteLateWritePoint, evidence?: SqliteLateWriteEvidence): boolean;
}

/** Creates a per-source hook to be called inside the transaction write it names. */
export function sqliteLateWriteControl<const Phase extends SqliteLateWritePoint>(
  phase: Phase,
): SqliteLateWriteControl<Phase> {
  let isArmed = false;
  let hasReached = false;
  let isClaimed = false;
  let evidence: SqliteLateWriteEvidence = {};
  const reach = (
    reachedPhase: SqliteLateWritePoint,
    reachedEvidence: SqliteLateWriteEvidence = {},
  ): boolean => {
    if (!isArmed || reachedPhase !== phase) return false;
    hasReached = true;
    evidence = reachedEvidence;
    return true;
  };
  return {
    adapter: 'sqlite',
    phase,
    claim() {
      if (isClaimed) return false;
      isClaimed = true;
      return true;
    },
    arm: () => {
      isClaimed = true;
      if (isArmed) throw new Error(`SQLite fault control for ${phase} was already armed`);
      isArmed = true;
    },
    isArmed: () => isArmed,
    reach,
    reached: () => hasReached,
    observedSatelliteKeys: () => evidence.satelliteKeys ?? [],
    reachTransactionWrite: reach,
  };
}

/** Opens the real SQLite source with this run's transaction barrier attached. */
export function openSqliteSourceWithFault(
  options: OpenSqliteSourceOptions,
  control: SqliteLateWriteControl<SqliteLateWritePoint>,
): SqliteSource {
  return openSqliteSourceWithLateWriteSeam(options, {
    reach(phase, evidence) {
      if (control.reachTransactionWrite(phase, evidence))
        throw new Error(`injected SQLite fault at ${phase}`);
    },
  });
}

/** Opens the real source with only the subtree transaction boundary disabled. */
export function openSqliteSourceWithNonAtomicSubtreeFault(
  options: OpenSqliteSourceOptions,
  control: SqliteLateWriteControl<'subtree-final-satellite'>,
): SqliteSource {
  return openSqliteSourceWithLateWriteSeam(
    options,
    {
      reach(phase, evidence) {
        if (control.reachTransactionWrite(phase, evidence))
          throw new Error(`injected SQLite fault at ${phase}`);
      },
    },
    false,
  );
}
