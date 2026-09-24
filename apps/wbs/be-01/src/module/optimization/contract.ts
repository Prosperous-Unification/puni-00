import type { BuiltSolverRequest } from '@wbs/contracts/solver/build-request';
import type { ProjectEvent } from '@wbs/core';
import type { SolverObjectiveName } from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

import type {
  OptimizationCoordinator,
  OptimizationCoordinatorOptions,
} from './optimization.feature';

/** The exact deterministic request a launcher writes to the solver's stdin. */
type SolverRequest = Extract<BuiltSolverRequest, { readonly ok: true }>['request'];

/**
 * The cache address one solve answers: a plan read's key without its
 * objective.
 *
 * Declared here, and not borrowed from `@wbs/store-sqlite`'s
 * `OptimizedCacheKey`, so that the spawn port names no repository row type.
 * SQLite's key carries exactly these four members, so it is assignable here
 * without a conversion.
 */
export interface OptimizationCacheKey {
  readonly projectId: string;
  readonly inputHash: string;
  readonly contractVersion: string;
  readonly budgetMs: number;
}

/**
 * The counted solver seat an attempt holds while its launcher runs.
 *
 * The `reserved` answer of SQLite's slot admission, restated as the port's own
 * type for the reason {@link OptimizationCacheKey} gives.
 */
export interface ReservedSolverAdmission {
  readonly kind: 'reserved';
  readonly attemptToken: string;
  readonly admittedCancelEpoch: number;
  readonly childDeadlineAt: number;
  readonly admittedDeadlineAt: number;
}

/** Everything the launcher needs from the read and its successful reservation. */
export interface ReservedSpawnRequest {
  readonly key: OptimizationCacheKey;
  readonly objective: SolverObjectiveName;
  readonly generation: number;
  readonly admission: ReservedSolverAdmission;
  /** The exact deterministic request written to the launcher's stdin after bind. */
  readonly request: SolverRequest;
  /** The canonical input used to materialise and independently revalidate the response. */
  readonly input: ScheduleInput;
}

export interface ReservedSolverTerminal {
  readonly exitCode: number;
  readonly deadlineKilled: boolean;
  readonly oomKilled: boolean;
}

/** A solver child as the coordinator's lifecycle owns it: both streams, its exit and a kill. */
export interface SolverChildProcess {
  readonly pid: number;
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  readonly kill: () => void | Promise<void>;
}

/** The authenticated host child and the streams its lifecycle drains immediately. */
export interface ReservedSolverChild extends SolverChildProcess {
  readonly terminal?: Promise<ReservedSolverTerminal>;
  readonly verdict: (verdict: 'bound' | 'abort') => void | Promise<void>;
}

/**
 * The launcher port: called only after SQLite returned this attempt's counted
 * `starting` row. The Supervisor and the development-only local launcher each
 * implement it; the Optimization feature never names either.
 */
export type ReservedSpawner = (request: ReservedSpawnRequest) => Promise<ReservedSolverChild>;

/**
 * The cache-key port: the storage key of one exact scheduler input.
 *
 * The domain owns the canonical bytes and SQLite's adapter owns the SHA-256
 * over them (`@wbs/store-sqlite/schedule-input-hash`); the composition root
 * supplies that function, so the feature names no repository helper.
 */
export type ScheduleInputHasher = (input: ScheduleInput) => string;

/** A stored `ok` result's project event, projected from the neutral `ProjectEvent`. */
export type ScheduleOptimizedEvent = Extract<ProjectEvent, { type: 'schedule_optimized' }>;
/** A stored failure's project event, projected from the neutral `ProjectEvent`. */
export type ScheduleOptimizationFailedEvent = Extract<
  ProjectEvent,
  { type: 'schedule_optimization_failed' }
>;
/** A stored infeasibility certificate's project event, projected from the neutral `ProjectEvent`. */
export type ScheduleOptimizationInfeasibleEvent = Extract<
  ProjectEvent,
  { type: 'schedule_optimization_infeasible' }
>;
/** The three events a stored solver outcome publishes, and nothing else. */
export type OptimizationOutcomeEvent =
  ScheduleOptimizedEvent | ScheduleOptimizationFailedEvent | ScheduleOptimizationInfeasibleEvent;

/**
 * What a host must supply to install {@link optimizationModule}.
 *
 * Exactly {@link OptimizationCoordinatorOptions}, unchanged by the move but
 * for the spawn, child and outcome-event types it now takes from this
 * contract and the cache-key port `hashInput` task 1.6 added. `bootBe01`
 * starts and stops the one coordinator a process holds; the module registers
 * no disposer.
 *
 * **K3 debt disclosed.** The backend module map gives Optimization queue,
 * generation, cache, slot and outcome repository ports. This extraction does
 * not add them: the feature still takes the SQLite `db` and calls
 * `@wbs/store-sqlite`'s queue, admission, drain, generation, cache and
 * outcome functions directly, and its private `solver-child-lifecycle.ts`
 * does the same for heartbeat and release. Those calls sit inside the spawn,
 * cancel and restart interleavings the coordinator owns, so replacing them is
 * its own change with an interleaving test. Tracked under tasks 3.6 and 7.4
 * of `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type OptimizationRequirements = OptimizationCoordinatorOptions;

/** What installing {@link optimizationModule} adds to a host graph. */
export interface OptimizationExports {
  readonly optimizer: OptimizationCoordinator;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * The module lives under `apps/wbs/be-01`, so its wiki module identifier
 * carries the runtime word, `module.backend.optimization`, and the label drops
 * the `module.` prefix.
 */
export const OPTIMIZATION_LABEL = 'backend.optimization';
