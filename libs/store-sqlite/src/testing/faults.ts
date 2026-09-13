import { openConnection } from '../db';
import type {
  SqliteLateWriteEvidence,
  SqliteLateWritePoint,
  SqliteLateWriteSeam,
} from '../late-write-seam';
import type { StoredSavedPlan } from '../saved-plan';
import { SavedPlanRepository } from '../saved-plan';
import { armSavedPlanWriteFault, type SavedPlanWriteFault } from '../saved-plan-write-fault';
import type { OpenSqliteSourceOptions, SqliteSource } from '../source';
import { openSqliteSourceWithLateWriteSeam } from '../source';
import { createNonAtomicSubtreeMutantForTesting } from '../work-item';

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
  observedSavedPlan(): Pick<SqliteLateWriteEvidence, 'savedPlan'>;
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
    observedSavedPlan: () => ({
      savedPlan: evidence.savedPlan,
    }),
    reachTransactionWrite: reach,
  };
}

/** Opens the real SQLite source with this run's transaction barrier attached. */
export function openSqliteSourceWithFault(
  options: OpenSqliteSourceOptions,
  control: SqliteLateWriteControl<SqliteLateWritePoint>,
  reachProof: () => void = () => undefined,
): SqliteSource {
  return openSqliteSourceWithLateWriteSeam(options, {
    isActive: (phase) => control.isArmed() && phase === control.phase,
    reach(phase, evidence) {
      if (control.reachTransactionWrite(phase, evidence)) {
        reachProof();
        throw new Error(`injected SQLite fault at ${phase}`);
      }
    },
  });
}

/** Opens the real source with only the subtree transaction boundary disabled. */
export function openSqliteSourceWithNonAtomicSubtreeFault(
  options: OpenSqliteSourceOptions,
  control: SqliteLateWriteControl<'subtree-final-satellite'>,
  reachProof: () => void = () => undefined,
): SqliteSource {
  const lateWrite = {
    isActive: (phase) => control.isArmed() && phase === control.phase,
    reach(phase, evidence) {
      if (control.reachTransactionWrite(phase, evidence)) {
        reachProof();
        throw new Error(`injected SQLite fault at ${phase}`);
      }
    },
  } satisfies SqliteLateWriteSeam;
  const source = openSqliteSourceWithLateWriteSeam(options, lateWrite);
  return {
    ...source,
    stores: {
      ...source.stores,
      subtrees: createNonAtomicSubtreeMutantForTesting(source.db, source.gate, lateWrite),
    },
  };
}

/** Opens the real saved-plan repository with header/input committed before schedule failure. */
export function openSqliteSourceWithNonAtomicSavedPlanFault(
  options: OpenSqliteSourceOptions,
  control: SqliteLateWriteControl<'saved-plan-schedule-body'>,
  reachProof: () => void,
  beforeRestart?: () => void,
): SqliteSource {
  return openSqliteSourceWithSavedPlanFault(options, control, reachProof, {
    kind: 'split',
    targetId: 'late-target',
    beforeRestart,
  });
}

function openSqliteSourceWithSavedPlanFault(
  options: OpenSqliteSourceOptions,
  control: SqliteLateWriteControl<'saved-plan-schedule-body'>,
  reachProof: () => void,
  fault: SavedPlanWriteFault,
): SqliteSource {
  const lateWrite: SqliteLateWriteSeam = {
    isActive: (phase) => control.isArmed() && phase === control.phase,
    reach(phase, evidence) {
      if (control.reachTransactionWrite(phase, evidence)) {
        reachProof();
        throw new Error(`injected SQLite fault at ${phase}`);
      }
    },
  };
  const source = openSqliteSourceWithLateWriteSeam(options, lateWrite);
  const connect = options.openConnection ?? openConnection;
  const savedPlans = new SavedPlanRepository(
    { openConnection: () => connect(options.dbPath) },
    lateWrite,
  );
  armSavedPlanWriteFault(savedPlans, fault);
  return { ...source, history: { ...source.history, savedPlans } };
}

/** Opens the real repository with its input insert omitted before the late barrier. */
export function openSqliteSourceWithMissingSavedPlanInput(
  options: OpenSqliteSourceOptions,
  control: SqliteLateWriteControl<'saved-plan-schedule-body'>,
  reachProof: () => void,
  observeBoundary?: (stored: StoredSavedPlan) => void,
): SqliteSource {
  return openSqliteSourceWithSavedPlanFault(options, control, reachProof, {
    kind: 'omit-input',
    targetId: 'late-target',
    observeBoundary,
  });
}
