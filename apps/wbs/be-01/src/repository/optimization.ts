import type { RecordedEvent } from '@wbs/core';
import { subscriptionFor } from '@wbs/core';
import {
  readConnectedOptimizationPair,
  storeConnectedOptimizationOutcomeIn,
} from '@wbs/store-sqlite/connected-optimization-cache';
import type { Gate } from '@wbs/store-sqlite/gate';
import {
  bindSolverSlot,
  heartbeatSolverSlot,
  reserveSolverSlot,
  reserveSolverSlotIn,
  solverAdmissionStartedAt,
} from '@wbs/store-sqlite/optimization-admission';
import {
  reconcileOptimizationDrains,
  releaseSolverSlot,
} from '@wbs/store-sqlite/optimization-drain';
import {
  allocateEnabledGeneration,
  allocateEnabledGenerationIn,
  readGeneration,
} from '@wbs/store-sqlite/optimization-generation';
import {
  dequeueSolverRequest,
  enqueueSolverRequest,
  enqueueSolverRequestIn,
} from '@wbs/store-sqlite/optimization-queue';
import { storeOptimizedOutcomeAndRecord } from '@wbs/store-sqlite/optimized-outcome';
import {
  optimizationVariantState,
  optimizedVariantIsLive,
  readOptimizedPair,
  readOptimizedPairAndSpawn,
} from '@wbs/store-sqlite/optimized-schedule-cache';
import { project } from '@wbs/store-sqlite/schema';
import { eq } from 'drizzle-orm';

import type {
  CommittedDecision,
  OptimizationAdmissionObservation,
  OptimizationCachedPair,
  OptimizationRepository,
  OptimizationRetryDecision,
  RecordedOptimizationOutcome,
  ReservedSolverAdmission,
  SolverSlotAdmission,
} from '../module/optimization/contract';
import type { Drizzle } from './db';
import type { EventLogTransactionalWrite } from './event-log';
import { classifyProjectWriteIn, recordRecovery } from './project';

type Transaction = Parameters<Parameters<Drizzle['transaction']>[0]>[0];
type RetryAsk = Parameters<OptimizationRepository['admitRetry']>[0];
interface FailedRetryOutcome {
  readonly kind: 'failed' | 'corrupt';
  readonly createdAt: number;
}

export type RetryPreflight =
  | { readonly kind: 'refused'; readonly decision: OptimizationRetryDecision }
  | {
      readonly kind: 'eligible';
      readonly classified: 'ordinary' | 'recovery';
      readonly generation: number;
      readonly outcome: FailedRetryOutcome;
      readonly admittedAt: number;
    };

/** Read-only Retry authority and eligibility inside the caller's owned writer. */
export function retryPreflightIn(tx: Transaction, ask: RetryAsk): RetryPreflight {
  const classified =
    ask.scoped === undefined
      ? 'ordinary'
      : classifyProjectWriteIn(
          tx,
          ask.key.projectId,
          ask.scoped.organizationId,
          ask.scoped.actorId,
          ask.scoped.role,
        );
  // Proof: forcing ordinary here let a removed super-admin Retry succeed.
  // Proof: removing either refusal changed foreign/removed mounted outcomes.
  if (classified === null) return { kind: 'refused', decision: { kind: 'not_found' } };
  // Proof: bypassing this refusal made mounted membership removal after read-close return 409 instead of 403.
  if (classified === 'refused') return { kind: 'refused', decision: { kind: 'forbidden' } };
  // Proof: omitting this pre-generation lookup made Q1→Q2→Q1 Retry return idle instead of the retained boundary terminal.
  const retained =
    ask.key.questions === undefined
      ? undefined
      : {
          question: ask.key.questions[ask.objective],
          outcome: readConnectedOptimizationPair(tx, { questions: ask.key.questions }).variants[
            ask.objective
          ],
        };
  // Proof: bypassing terminal lookup made mounted Retry after generation replacement return idle instead of boundary-infeasible.
  if (retained?.outcome.kind === 'boundary-infeasible')
    return {
      kind: 'refused',
      decision: {
        kind: 'not-retryable',
        state: 'boundary-infeasible',
        certificate: {
          kind: 'boundary-infeasible',
          question: retained.question,
          evidence:
            retained.outcome.outcome.certificate.evidence.kind === 'contradictory-bounds'
              ? 'contradictory-bounds'
              : 'initial-model-infeasible',
        },
      },
    };

  const current = readGeneration(tx, ask.key.projectId, ask.key.contractVersion);
  // Proof: bypassing this guard let a public Retry with valid caller hash but
  // mismatched persisted generation reach accepted/launcher instead of refusal.
  if (current?.inputHash !== ask.key.inputHash)
    return { kind: 'refused', decision: { kind: 'not-retryable', state: 'idle' } };
  const outcome =
    retained === undefined ? readOptimizedPair(tx, ask.key)[ask.objective] : retained.outcome;
  const live = optimizedVariantIsLive(tx, ask.key, current.generation, ask.objective, ask.now);
  if (outcome.kind !== 'failed' && outcome.kind !== 'corrupt')
    return {
      kind: 'refused',
      decision: {
        kind: 'not-retryable',
        state:
          ask.key.questions === undefined
            ? optimizationVariantState(readOptimizedPair(tx, ask.key)[ask.objective], live).state
            : outcome.kind === 'ok'
              ? 'ready'
              : outcome.kind === 'miss'
                ? live
                  ? 'pending'
                  : 'idle'
                : outcome.kind,
      },
    };
  // Proof: minting a token on this live branch made the focused Retry test
  // observe two tokens instead of one.
  if (live) return { kind: 'refused', decision: { kind: 'already-running' } };
  return {
    kind: 'eligible',
    classified,
    generation: current.generation,
    outcome: { kind: outcome.kind, createdAt: outcome.createdAt },
    // Proof: using ask.now alone left C undeleted although its slot deadline
    // preceded the failed marker; the mounted adjusted-cutoff Retry test failed.
    admittedAt: Math.max(ask.now, outcome.createdAt + 1),
  };
}

/** Preserve reservation, optional queue insert and accepted recovery audit in one raw act. */
export function retryMutationIn(
  tx: Transaction,
  ask: RetryAsk,
  eligible: Extract<RetryPreflight, { readonly kind: 'eligible' }>,
  onFinished?: (target: { readonly projectId: string; readonly contractVersion?: string }) => void,
): OptimizationRetryDecision {
  const accepted = (admission: ReservedSolverAdmission | null): OptimizationRetryDecision => {
    // Proof: skipping this insert made accepted recovery Retry lack its audit row.
    if (eligible.classified === 'recovery' && ask.scoped !== undefined)
      recordRecovery(tx, {
        id: crypto.randomUUID(),
        organizationId: ask.scoped.organizationId,
        actorId: ask.scoped.actorId,
        projectId: ask.key.projectId,
        detail: { optimizer: 'retry' },
        at: ask.now,
      });
    return { kind: 'accepted', generation: eligible.generation, admission };
  };
  const request = {
    projectId: ask.key.projectId,
    contractVersion: ask.key.contractVersion,
    generation: eligible.generation,
    objective: ask.objective,
    budgetMs: ask.key.budgetMs,
    ownerId: ask.ownerId,
    attemptToken: ask.attemptToken(),
    now: eligible.admittedAt,
  };
  const admission = reserveSolverSlotIn(tx, request, onFinished);
  if (admission.kind === 'already-present') return { kind: 'already-running' };
  if (admission.kind === 'closed') return { kind: 'not-retryable', state: eligible.outcome.kind };
  if (admission.kind === 'reserved') return accepted(enrichAdmission(admission, ask.key.budgetMs));
  const queued = enqueueSolverRequestIn(tx, {
    projectId: ask.key.projectId,
    contractVersion: ask.key.contractVersion,
    generation: eligible.generation,
    objective: ask.objective,
    budgetMs: ask.key.budgetMs,
    enqueuedAt: eligible.admittedAt,
  });
  if (queued.kind === 'closed') return { kind: 'not-retryable', state: eligible.outcome.kind };
  if (queued.kind === 'already-present') return { kind: 'already-running' };
  return accepted(null);
}

function isRecordedEvent(value: unknown): value is RecordedEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'subscription' in value &&
    typeof value.subscription === 'string' &&
    'seq' in value &&
    typeof value.seq === 'number' &&
    'createdAt' in value &&
    typeof value.createdAt === 'number' &&
    'message' in value
  );
}

/** Preserve outcome adaptation and durable-envelope validation in the caller's source turn. */
export function recordOptimizationOutcomeIn(
  db: Drizzle,
  eventLog: EventLogTransactionalWrite,
  write: Parameters<OptimizationRepository['recordOutcome']>[0],
): CommittedDecision<RecordedOptimizationOutcome> {
  if (write.kind === 'connected')
    return db.transaction((tx) => {
      // Proof: COMMIT/BEGIN between this write and event insertion left one certificate after the real event-insert fault (connected-publication.test.ts).
      const stored = storeConnectedOptimizationOutcomeIn(tx, write);
      if (stored !== 'stored') return { decision: { kind: stored }, envelopes: [] };
      const identity = {
        projectId: write.claim.projectId,
        generation: write.claim.generation,
        inputHash: write.question.inputHash,
        objective: write.claim.objective,
        contractVersion: write.claim.contractVersion,
        budgetMs: write.claim.budgetMs,
      };
      const event: Extract<RecordedOptimizationOutcome, { kind: 'stored' }>['event'] =
        write.outcome.kind === 'boundary-infeasible'
          ? {
              type: 'schedule_optimization_boundary_infeasible',
              ...identity,
              scope: 'connected-stage',
              questionHash: write.question.questionHash,
            }
          : write.outcome.kind === 'ok'
            ? { type: 'schedule_optimized', ...identity }
            : write.outcome.kind === 'failed'
              ? {
                  type: 'schedule_optimization_failed',
                  ...identity,
                  failureReason: write.outcome.reason,
                }
              : { type: 'schedule_optimization_infeasible', ...identity };
      const subscription = subscriptionFor(write.claim.projectId);
      const recorded = eventLog.recordEventIn(tx, subscription, event, write.now);
      if (!isRecordedEvent(recorded))
        throw new Error('stored connected outcome has no durable event envelope');
      return { decision: { kind: 'stored', subscription, recorded, event }, envelopes: [] };
    });
  const committed = storeOptimizedOutcomeAndRecord(
    db,
    {
      recordEventIn: (tx, subscription, message, createdAt) => {
        const recorded = eventLog.recordEventIn(tx, subscription, message, createdAt);
        // Proof: an injected event writer returning undefined left one
        // committed cache row when this guard was removed; the malformed
        // envelope test observed 1 instead of 0 before restoration.
        if (!isRecordedEvent(recorded))
          throw new Error('stored optimization outcome has no durable event envelope');
        return recorded;
      },
    },
    {
      ...write,
      outcome:
        write.outcome.kind === 'ok'
          ? { kind: 'ok', result: write.outcome.optimized }
          : write.outcome,
    },
  );
  if (committed.result !== 'stored') return { decision: { kind: committed.result }, envelopes: [] };
  // The store's optional fields are valid here because recordEventIn checked
  // the envelope before the nested synchronous transaction committed.
  const envelope = committed as {
    readonly subscription: string;
    readonly recorded: RecordedEvent;
    readonly event: Extract<RecordedOptimizationOutcome, { kind: 'stored' }>['event'];
  };
  return {
    decision: {
      kind: 'stored',
      subscription: envelope.subscription,
      recorded: envelope.recorded,
      event: envelope.event,
    },
    envelopes: [],
  };
}

/** Reads one admission identity inside a synchronous immediate source turn. */
export function observeForAdmissionIn(
  db: Drizzle,
  key: Parameters<OptimizationRepository['observeForAdmission']>[0],
  now: number,
): OptimizationAdmissionObservation {
  return db.transaction(
    (tx) => {
      if (key.questions !== undefined) {
        const enabled = tx
          .select({ enabled: project.optimizationEnabled })
          .from(project)
          .where(eq(project.id, key.projectId))
          .get();
        const current = readGeneration(tx, key.projectId, key.contractVersion);
        if (enabled?.enabled !== true || (current !== null && current.admissionState !== 'open'))
          return { kind: 'idle' };
        const captured = readConnectedOptimizationPair(tx, { questions: key.questions });
        const missing = (['pri', 'time'] as const).filter(
          (objective) => captured.variants[objective].kind === 'miss',
        );
        // Proof: allocating before this retained lookup advanced Q1→Q2→Q1 from generation 2 to 3 in connected-publication.test.ts.
        if (missing.length === 0)
          return {
            kind: 'connected-observed',
            generation: captured.generation,
            variants: captured.variants,
            requests: [],
          };
        const generation = allocateEnabledGenerationIn(
          tx,
          key.projectId,
          key.contractVersion,
          key.inputHash,
          now,
        );
        if (generation === null) return { kind: 'idle' };
        return {
          kind: 'connected-observed',
          generation,
          variants: captured.variants,
          requests: missing
            .filter((objective) => !optimizedVariantIsLive(tx, key, generation, objective, now))
            .map((objective) => ({ key, objective })),
        };
      }
      const generation = allocateEnabledGenerationIn(
        tx,
        key.projectId,
        key.contractVersion,
        key.inputHash,
        now,
      );
      if (generation === null) return { kind: 'idle' } as const;
      const requests: { key: typeof key; objective: 'pri' | 'time' }[] = [];
      const pair = projectCachedPair(
        readOptimizedPairAndSpawn(tx, key, (request) => {
          requests.push(request);
        }),
      );
      return { kind: 'observed', generation, pair, requests } as const;
    },
    { behavior: 'immediate' },
  );
}

/** The writer rechecks terminal evidence after observation and before reclaim or token admission. */
export function connectedReservationIsTerminal(
  db: Drizzle,
  request: Parameters<OptimizationRepository['reserveSlot']>[0],
): boolean {
  if (request.questions === undefined) return false;
  const outcome = readConnectedOptimizationPair(db, { questions: request.questions }).variants[
    request.objective
  ];
  // Proof: omitting this check returned two extra reserved seats after the competitor's terminal committed, rather than two closed decisions.
  return outcome.kind !== 'miss';
}

export function reservationOf(
  admission: ReturnType<typeof reserveSolverSlot>,
  budgetMs: number,
): SolverSlotAdmission {
  return admission.kind === 'reserved'
    ? { ...admission, startedAt: solverAdmissionStartedAt(admission, budgetMs) }
    : admission;
}

function projectCachedPair(pair: ReturnType<typeof readOptimizedPair>): OptimizationCachedPair {
  const project = (outcome: typeof pair.pri): OptimizationCachedPair['pri'] => {
    const state = optimizationVariantState(outcome, false);
    if (outcome.kind === 'ok') {
      // Proof (2026-09-27): making store-sqlite's optimizationVariantState answer idle for an
      // ok row failed `runs bound children through evaluation, the token-fenced store, and
      // release` in optimization-coordinator.db.test.ts with this error.
      if (state.state !== 'ready') throw new Error('stored optimized outcome is not ready');
      return { kind: 'ready', state, schedule: outcome.result.schedule };
    }
    // Proof (2026-09-27): making it answer ready for a miss failed `debounces edits and reads
    // the newest enabled input once` in optimization-coordinator.db.test.ts with this error.
    if (state.state === 'ready') throw new Error('non-ready outcome projected as ready');
    return { kind: 'non-ready', state, schedule: null };
  };
  return { pri: project(pair.pri), time: project(pair.time) };
}

function enrichAdmission(
  admission: ReturnType<typeof reserveSolverSlot>,
  budgetMs: number,
): ReservedSolverAdmission | null {
  const projected = reservationOf(admission, budgetMs);
  return projected.kind === 'reserved' ? projected : null;
}

/**
 * SQLite implementation of the Optimization persistence contract. Retry takes
 * `gate` before its immediate transaction so an accepted decision means its
 * reservation and any recovery audit have committed outside another unit of work.
 */
export function createOptimizationRepository(
  db: Drizzle,
  eventLog: EventLogTransactionalWrite,
  gate: Gate,
): OptimizationRepository {
  return {
    allocateGeneration: (projectId, contractVersion, inputHash, now) =>
      // Proof: bypassing this source turn made the real held-writer allocation
      // settle inside the owner's transaction and disappear on rollback.
      gate.enter(() =>
        Promise.resolve().then(() =>
          allocateEnabledGeneration(db, projectId, contractVersion, inputHash, now),
        ),
      ),
    observeForAdmission: (key, now) =>
      // Proof: bypassing this turn while a writer held an uncommitted input hash
      // made the SQLite observation test return generation 2 instead of 1.
      // Nesting a second public turn in this owner made the bounded cold
      // admission test time out before either objective could be requested.
      // Proof: splitting allocation and pair read into two turns let an
      // intervening generation 3 failed PRI row appear beside generation 1,
      // and the objective list lost PRI in the competing-owner test.
      gate.enter(() =>
        Promise.resolve().then(() => ({
          decision: observeForAdmissionIn(db, key, now),
          envelopes: [],
        })),
      ),
    isVariantLive: (key, generation, objective, now) =>
      // Proof: dropping this turn settled a live read inside an awaited source
      // owner before its open transaction had rolled back.
      gate.enter(() =>
        Promise.resolve().then(() => optimizedVariantIsLive(db, key, generation, objective, now)),
      ),
    reserveSlot: (request) =>
      // Proof: omitting the source turn lost the reserved slot on owner rollback.
      gate.enter(() =>
        Promise.resolve().then(() => ({
          decision: connectedReservationIsTerminal(db, request)
            ? { kind: 'closed' as const }
            : reservationOf(reserveSolverSlot(db, request), request.budgetMs),
          envelopes: [],
        })),
      ),
    // Proof: omitting this turn left the slot starting with no PID after owner rollback.
    bindSlot: (slot) => gate.enter(() => Promise.resolve().then(() => bindSolverSlot(db, slot))),
    // Proof: omitting this turn lost the enqueued PRI row after owner rollback.
    enqueueRequest: (request) =>
      gate.enter(() => Promise.resolve().then(() => enqueueSolverRequest(db, request))),
    dequeueRequest: (request) =>
      // Proof: omitting this turn left the dequeued PRI row present after owner rollback.
      gate.enter(() =>
        Promise.resolve().then(() => {
          const dequeued = dequeueSolverRequest(db, request);
          const decision =
            dequeued.kind === 'reserved'
              ? {
                  ...dequeued,
                  admission: {
                    ...dequeued.admission,
                    startedAt: solverAdmissionStartedAt(
                      dequeued.admission,
                      dequeued.entry.budgetMs,
                    ),
                  },
                }
              : dequeued;
          return { decision, envelopes: [] };
        }),
      ),
    // Proof: omitting this turn left heartbeat_at=10 rather than 21 after owner rollback.
    refreshSlot: (slot) =>
      gate.enter(() => Promise.resolve().then(() => heartbeatSolverSlot(db, slot))),
    // Proof: omitting this turn retained the exact attempt slot after owner rollback.
    releaseSlot: (slot) =>
      gate.enter(() => Promise.resolve().then(() => releaseSolverSlot(db, slot))),
    // Proof: omitting this turn retained the draining generation after owner rollback.
    reconcileDrains: (now) =>
      gate.enter(() => Promise.resolve().then(() => reconcileOptimizationDrains(db, now))),
    // Proof: omitting this turn lost the committed cache and event on owner rollback.
    recordOutcome: (write) =>
      gate.enter<CommittedDecision<RecordedOptimizationOutcome>>(() =>
        // Proof: splitting cache storage into its own transaction made the throwing
        // event-writer test observe one cache row instead of zero.
        Promise.resolve().then(() => recordOptimizationOutcomeIn(db, eventLog, write)),
      ),
    // Proof (2026-09-28): replacing the coordinator turn with immediate execution
    // made `waits for an overlapping rolled-back unit of work before accepting
    // Retry` observe an early decision before the outer rollback (1 fail).
    // Restored and reran green; the test then found the audit and slot committed.
    admitRetry: (ask) =>
      gate.enter(() =>
        Promise.resolve().then(() => {
          const decision = db.transaction(
            (tx) => {
              const preflight = retryPreflightIn(tx, ask);
              return preflight.kind === 'refused'
                ? preflight.decision
                : retryMutationIn(tx, ask, preflight);
            },
            // Proof: deleting immediate mode made the two-connection writer
            // ownership test fail at a deferred slot-reclaim delete.
            { behavior: 'immediate' },
          );
          return { decision, envelopes: [] };
        }),
      ),
  };
}
