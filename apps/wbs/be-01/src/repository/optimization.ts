import type { RecordedEvent } from '@wbs/core';
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

import type {
  OptimizationCachedPair,
  OptimizationRepository,
  OptimizationRetryDecision,
  ReservedSolverAdmission,
} from '../module/optimization/contract';
import type { Drizzle } from './db';
import type { EventLogTransactionalWrite } from './event-log';

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

function reservationOf(
  admission: ReturnType<typeof reserveSolverSlot>,
  budgetMs: number,
): ReturnType<OptimizationRepository['reserveSlot']> {
  return admission.kind === 'reserved'
    ? { ...admission, startedAt: solverAdmissionStartedAt(admission, budgetMs) }
    : admission;
}

function projectCachedPair(pair: ReturnType<typeof readOptimizedPair>): OptimizationCachedPair {
  const project = (outcome: typeof pair.pri): OptimizationCachedPair['pri'] => {
    const state = optimizationVariantState(outcome, false);
    if (outcome.kind === 'ok') {
      if (state.state !== 'ready') throw new Error('stored optimized outcome is not ready');
      return { kind: 'ready', state, schedule: outcome.result.schedule };
    }
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

/** SQLite implementation of the Optimization persistence contract. */
export function createOptimizationRepository(
  db: Drizzle,
  eventLog: EventLogTransactionalWrite,
): OptimizationRepository {
  return {
    allocateGeneration: (projectId, contractVersion, inputHash, now) =>
      allocateEnabledGeneration(db, projectId, contractVersion, inputHash, now),
    readPairAndAdmit: (key, admit) => projectCachedPair(readOptimizedPairAndSpawn(db, key, admit)),
    isVariantLive: (key, generation, objective, now) =>
      optimizedVariantIsLive(db, key, generation, objective, now),
    reserveSlot: (request) => reservationOf(reserveSolverSlot(db, request), request.budgetMs),
    bindSlot: (slot) => bindSolverSlot(db, slot),
    enqueueRequest: (request) => enqueueSolverRequest(db, request),
    dequeueRequest: (request) => {
      const dequeued = dequeueSolverRequest(db, request);
      return dequeued.kind === 'reserved'
        ? {
            ...dequeued,
            admission: {
              ...dequeued.admission,
              startedAt: solverAdmissionStartedAt(dequeued.admission, dequeued.entry.budgetMs),
            },
          }
        : dequeued;
    },
    refreshSlot: (slot) => heartbeatSolverSlot(db, slot),
    releaseSlot: (slot) => releaseSolverSlot(db, slot),
    reconcileDrains: (now) => reconcileOptimizationDrains(db, now),
    recordOutcome: (write) => {
      // Proof: splitting cache storage into its own transaction made the throwing
      // event-writer test observe one cache row instead of zero.
      const committed = storeOptimizedOutcomeAndRecord(
        db,
        {
          recordEventIn: (tx, subscription, message, createdAt) => {
            const recorded = eventLog.recordEventIn(tx, subscription, message, createdAt);
            // Proof: an injected event writer returning undefined previously left one
            // committed cache row; the malformed-envelope test observed 1 instead of 0.
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
      if (committed.result !== 'stored') return { kind: committed.result };
      // The store's legacy optional fields are safe here because recordEventIn
      // validates the envelope inside the same transaction before commit.
      const envelope = committed as {
        readonly subscription: string;
        readonly recorded: RecordedEvent;
        readonly event: Extract<
          ReturnType<OptimizationRepository['recordOutcome']>,
          { kind: 'stored' }
        >['event'];
      };
      return {
        kind: 'stored',
        subscription: envelope.subscription,
        recorded: envelope.recorded,
        event: envelope.event,
      };
    },
    admitRetry: (ask): OptimizationRetryDecision =>
      db.transaction(
        (tx) => {
          const current = readGeneration(tx, ask.key.projectId, ask.key.contractVersion);
          if (current?.inputHash !== ask.key.inputHash) {
            return { kind: 'not-retryable', state: 'idle' } as const;
          }
          const outcome = readOptimizedPair(tx, ask.key)[ask.objective];
          const live = optimizedVariantIsLive(
            tx,
            ask.key,
            current.generation,
            ask.objective,
            ask.now,
          );
          if (outcome.kind !== 'failed' && outcome.kind !== 'corrupt') {
            return {
              kind: 'not-retryable',
              state: optimizationVariantState(outcome, live).state,
            } as const;
          }
          // Proof: minting a token on this live branch made the focused Retry
          // test observe two tokens instead of one.
          if (live) return { kind: 'already-running' } as const;
          // Retry owns the SQLite writer before it observes eligibility, and
          // stamps replacement strictly after the retained failure marker.
          const admittedAt = Math.max(ask.now, outcome.createdAt + 1);
          const request = {
            projectId: ask.key.projectId,
            contractVersion: ask.key.contractVersion,
            generation: current.generation,
            objective: ask.objective,
            budgetMs: ask.key.budgetMs,
            ownerId: ask.ownerId,
            attemptToken: ask.attemptToken(),
            now: admittedAt,
          };
          const admission = reserveSolverSlotIn(tx, request);
          if (admission.kind === 'already-present') return { kind: 'already-running' } as const;
          if (admission.kind === 'closed') {
            return { kind: 'not-retryable', state: outcome.kind } as const;
          }
          if (admission.kind === 'reserved') {
            return {
              kind: 'accepted',
              generation: current.generation,
              admission: enrichAdmission(admission, ask.key.budgetMs),
            } as const;
          }
          const queued = enqueueSolverRequestIn(tx, {
            projectId: ask.key.projectId,
            contractVersion: ask.key.contractVersion,
            generation: current.generation,
            objective: ask.objective,
            budgetMs: ask.key.budgetMs,
            enqueuedAt: admittedAt,
          });
          if (queued.kind === 'closed') {
            return { kind: 'not-retryable', state: outcome.kind } as const;
          }
          if (queued.kind === 'already-present') return { kind: 'already-running' } as const;
          return { kind: 'accepted', generation: current.generation, admission: null } as const;
        },
        // Proof: deleting immediate mode made the two-connection writer ownership
        // test fail with DrizzleQueryError on the deferred slot-reclaim delete.
        { behavior: 'immediate' },
      ),
  };
}
