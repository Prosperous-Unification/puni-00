import type { BuiltSolverRequest } from '@wbs/contracts/solver/build-request';
import type { OptimizedResult } from '@wbs/contracts/solver/optimized-result';
import type { PlanInfeasibleResult } from '@wbs/contracts/solver/plan-infeasible';
import type { OptimizationVariantState, ProjectEvent, RecordedEvent } from '@wbs/core';
import type { SolverFailureReason, SolverObjectiveName } from '@wbs/domain';
import type { Schedule } from '@wbs/domain';
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
  readonly startedAt: number;
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
 * **K3 debt disclosed.** The coordinator and lifecycle now use neutral
 * {@link OptimizationRepository} and {@link SolverSlotRepository} ports.
 * The feature's repository-port dependency remains preserved K3 debt under
 * the layering ledger and task 7.4; the extraction closes direct SQLite
 * coupling without claiming full K3 compliance.
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

export type OptimizationCachedVariant =
  | {
      readonly kind: 'ready';
      readonly state: Extract<OptimizationVariantState, { state: 'ready' }>;
      readonly schedule: Schedule;
    }
  | {
      readonly kind: 'non-ready';
      readonly state: Exclude<OptimizationVariantState, { state: 'ready' }>;
      readonly schedule: null;
    };
export type OptimizationCachedPair = Readonly<
  Record<SolverObjectiveName, OptimizationCachedVariant>
>;
export type OptimizationOutcome =
  | {
      readonly kind: 'ok';
      readonly optimized: OptimizedResult;
    }
  | { readonly kind: 'failed'; readonly reason: SolverFailureReason }
  | {
      readonly kind: 'plan-infeasible';
      readonly certificate: PlanInfeasibleResult;
    };

export interface SolverSlotIdentity {
  readonly projectId: string;
  readonly contractVersion: string;
  readonly generation: number;
  readonly objective: SolverObjectiveName;
  readonly budgetMs: number;
  readonly attemptToken: string;
}
export interface SolverSlotRequest extends Omit<SolverSlotIdentity, 'attemptToken'> {
  readonly ownerId: string;
  readonly attemptToken: string;
  readonly now: number;
}
export type SolverSlotAdmission =
  | ReservedSolverAdmission
  | { readonly kind: 'already-present' | 'closed' | 'project-full' | 'global-full' };
export type SolverSlotHeartbeatOutcome =
  | { readonly kind: 'live' }
  | { readonly kind: 'cancelled'; readonly reason: 'requested' | 'generation' }
  | { readonly kind: 'lost' };
export interface SolverSlotReleaseOutcome {
  readonly released: boolean;
  readonly retirement: 'finished' | 'waiting' | 'open' | 'absent';
  readonly deletion: 'finished' | 'waiting' | 'open' | 'absent';
}

/** Heartbeat and release retain exact attempt-token ownership. */
export interface SolverSlotRepository {
  refreshSlot(
    slot: SolverSlotIdentity & { readonly admittedCancelEpoch: number; readonly now: number },
  ): SolverSlotHeartbeatOutcome;
  releaseSlot(slot: SolverSlotIdentity): SolverSlotReleaseOutcome;
}

export interface OptimizationQueueRequest extends Omit<SolverSlotIdentity, 'attemptToken'> {
  readonly enqueuedAt: number;
}
export interface OptimizationQueueEntry extends OptimizationQueueRequest {
  readonly admittedCancelEpoch: number;
}
export type OptimizationDequeued =
  | { readonly kind: 'empty' }
  | { readonly kind: 'capacity-full' }
  | {
      readonly kind: 'reserved';
      readonly entry: OptimizationQueueEntry;
      readonly inputHash: string;
      readonly admission: ReservedSolverAdmission;
    };
export interface OptimizationOutcomeWrite {
  readonly claim: SolverSlotIdentity & { readonly ownerId: string };
  readonly inputHash: string;
  readonly admittedCancelEpoch: number;
  readonly outcome: OptimizationOutcome;
  readonly now: number;
}
export type RecordedOptimizationOutcome =
  | {
      readonly kind: 'stored';
      readonly subscription: string;
      readonly recorded: RecordedEvent;
      readonly event: OptimizationOutcomeEvent;
    }
  | { readonly kind: 'superseded' | 'already-recorded' };
export type OptimizationRetryDecision =
  | { readonly kind: 'forbidden' | 'not_found' }
  | {
      readonly kind: 'not-retryable';
      readonly state: OptimizationVariantState['state'];
    }
  | { readonly kind: 'already-running' }
  | {
      readonly kind: 'accepted';
      readonly generation: number;
      readonly admission: ReservedSolverAdmission | null;
    };

/** Durable optimization decisions. Outcome recording and slot release are separate transactions. */
export interface OptimizationRepository extends SolverSlotRepository {
  allocateGeneration(
    projectId: string,
    contractVersion: string,
    inputHash: string,
    now: number,
  ): number | null;
  /** Snapshot both cached variants before invoking admission callbacks; return that snapshot even if callbacks write cache rows. */
  readPairAndAdmit(
    key: OptimizationCacheKey,
    admit: (request: {
      readonly key: OptimizationCacheKey;
      readonly objective: SolverObjectiveName;
    }) => void,
  ): OptimizationCachedPair;
  isVariantLive(
    key: OptimizationCacheKey,
    generation: number,
    objective: SolverObjectiveName,
    now: number,
  ): boolean;
  /** Reserve a counted seat before launch; the returned start time belongs to this admission. */
  reserveSlot(request: SolverSlotRequest): SolverSlotAdmission;
  bindSlot(slot: SolverSlotIdentity & { readonly pid: number }): boolean;
  enqueueRequest(request: OptimizationQueueRequest): {
    readonly kind: 'queued' | 'already-present' | 'closed';
  };
  /** Keep a head blocked by a matching retained slot so a later pump can retry it. */
  dequeueRequest(request: {
    readonly ownerId: string;
    readonly attemptToken: string;
    readonly now: number;
  }): OptimizationDequeued;
  /** Await one owned immediate transaction before answering Retry; mint the token only after writer ownership and the live check, and return accepted only after its audit and reservation commit. */
  admitRetry(ask: {
    readonly key: OptimizationCacheKey;
    readonly objective: SolverObjectiveName;
    readonly ownerId: string;
    readonly now: number;
    readonly attemptToken: () => string;
    readonly scoped?: { readonly organizationId: string; readonly actorId: string };
  }): Promise<OptimizationRetryDecision>;
  /** Atomically write the outcome and durable event; a superseded attempt publishes neither. Slot release is separate. */
  recordOutcome(write: OptimizationOutcomeWrite): RecordedOptimizationOutcome;
  reconcileDrains(now: number): {
    readonly reclaimed: number;
    readonly finished: number;
    readonly waiting: number;
  };
}
