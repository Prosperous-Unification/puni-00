import {
  type AccountfulServices,
  type Broadcaster,
  type Clock,
  clockOf,
  composeServices,
  type OidcVerifier,
  type PlanTransactionalStores,
  type ProjectRankStore,
  servicesOver as coreServicesOver,
} from '@wbs/core';
import { CREATOR_ADMISSION } from '@wbs/core';
import type { AuthenticatedUser } from '@wbs/core/service/auth.service';
import { standaloneRankStore } from '@wbs/core/service/standalone-rank';
import { contractVersionOf } from '@wbs/domain';
import type { Logger } from '@wbs/observability';
import { type FetchLike, PushClient, systemTimers } from '@wbs/runtime-portable';
import {
  capturedOptimizationReaderOf,
  DrizzleEventLogStore,
  scheduleInputHash,
  type SqliteSource,
} from '@wbs/store-sqlite';

import { installOptimization } from './module/optimization/check';
import type { ReservedSpawner } from './module/optimization/contract';
import type { OptimizationCoordinator } from './module/optimization/optimization.feature';
import { PLAN_EVENT_RETENTION_DAYS } from './repository';
import { createOptimizationRepository } from './repository/optimization';
import {
  bunPasswordHasher,
  joseTokenCodec,
  nodeDigest,
  systemInterval,
} from './runtime/bun-runtime';
import { createDequeueReservationOwner } from './service/optimization-dequeue-reservation';
import { createInitialReservationOwner } from './service/optimization-initial-reservation';
import {
  createOptimizationLifecycle,
  type OptimizationLifecycle,
} from './service/optimization-lifecycle';
import { createOptimizationOutcomeOwner } from './service/optimization-outcome';
import { createOptimizationReconciliation } from './service/optimization-reconciliation';
import { createRetryReservationOwner } from './service/optimization-retry-reservation';
import { optimizerWiring } from './service/optimizer-wiring';

const EVENT_LOG_MAX_PER_SUBSCRIPTION = 1_000;
const RETENTION_INTERVAL_MS = 10 * 60_000;
const REPLAY_BUFFER_MAX_AGE_MS = 5 * 60_000;

export interface OptimizerRuntime {
  solverVersion: string;
  budgetMs: number;
  spawn: ReservedSpawner;
}

export interface ServicesOptions {
  source: SqliteSource;
  logger: Logger;
  jwtKey: string;
  gwUrl: string;
  internalAuthSecret: string;
  pushFetch: FetchLike;
  oidc?: OidcVerifier;
  passwordSessions?: boolean;
  localIdentity?: AuthenticatedUser;
  optimizer?: OptimizerRuntime;
}

export interface BeServices extends AccountfulServices {
  readonly optimizer: OptimizationCoordinator | undefined;
  readonly optimizationLifecycle: OptimizationLifecycle;
  readonly gate: SqliteSource['gate'];
  readonly projectRanks: ProjectRankStore;
}

export type { WritingServices } from '@wbs/core';
export { buildStores } from '@wbs/store-sqlite/build-stores';

/** Compatibility shape for adapter tests while composition belongs to core. */
export interface SharedRuntime {
  readonly clock: Clock;
  readonly broadcast: Broadcaster;
  readonly optimized: ReturnType<typeof optimizerWiring>;
}

/** Compatibility entrypoint over core's pure transactional half. */
export function servicesOver(stores: PlanTransactionalStores, shared: SharedRuntime) {
  return coreServicesOver(stores, {
    admission: CREATOR_ADMISSION,
    clock: shared.clock,
    broadcast: shared.broadcast,
    scheduler: shared.optimized.scheduler,
  });
}

/** Adds be-01's optimizer process adapter around core's single service composition. */
export function buildServices(options: ServicesOptions): BeServices {
  const { source } = options;
  const clock = clockOf({ now: () => Date.now(), newId: () => crypto.randomUUID() });
  let coordinator: OptimizationCoordinator | undefined;
  const optimized =
    options.optimizer === undefined
      ? undefined
      : {
          readLive: (ask: Parameters<OptimizationCoordinator['readPlan']>[0]) => {
            if (coordinator === undefined) {
              throw new Error('optimizer read before service composition completed');
            }
            return coordinator.readPlan(ask);
          },
          readCaptured: capturedOptimizationReaderOf(source.db, {
            contractVersion: contractVersionOf(options.optimizer.solverVersion),
            budgetMs: options.optimizer.budgetMs,
            now: Date.now,
          }),
        };
  const scheduler = optimizerWiring(optimized).scheduler;
  const boundSource = source.bindLivePlans({
    schedulerOf: (readCaptured) =>
      optimizerWiring(
        readCaptured === undefined
          ? undefined
          : {
              // Proof: using the process reader failed captured publication: first start 4 instead of 3.
              readCaptured,
              readLive: () => {
                throw new Error('live optimizer admission inside chain snapshot');
              },
            },
      ).scheduler,
    ...(options.optimizer === undefined
      ? {}
      : {
          optimization: {
            contractVersion: contractVersionOf(options.optimizer.solverVersion),
            budgetMs: options.optimizer.budgetMs,
            now: Date.now,
          },
        }),
  });
  const graph = composeServices({
    // Proof: omitting installation failed mounted `shared tree and export agree` (start 0 instead of 3).
    source: boundSource,
    runtime: {
      clock,
      digest: nodeDigest,
      timers: systemTimers,
      intervals: systemInterval,
      push: new PushClient({
        gwUrl: options.gwUrl,
        secret: options.internalAuthSecret,
        fetchImpl: options.pushFetch,
        timers: systemTimers,
        attemptMs: 5_000,
        overallMs: 15_000,
        maxRetries: 5,
      }),
      scheduler,
      onPlanChanged: (projectId) => coordinator?.inputChanged(projectId),
      passwords: bunPasswordHasher,
      tokens: joseTokenCodec(options.jwtKey),
      ...(options.oidc === undefined ? {} : { oidc: options.oidc }),
      ...(options.passwordSessions === undefined
        ? {}
        : { passwordSessions: options.passwordSessions }),
      ...(options.localIdentity === undefined ? {} : { localIdentity: options.localIdentity }),
    },
    shared: {
      logger: options.logger,
      replayMaxPerSubscription: EVENT_LOG_MAX_PER_SUBSCRIPTION,
      replayMaxAgeMs: REPLAY_BUFFER_MAX_AGE_MS,
      retentionIntervalMs: RETENTION_INTERVAL_MS,
      planEventRetentionDays: PLAN_EVENT_RETENTION_DAYS,
    },
  });
  const optimizationLifecycle = createOptimizationLifecycle(
    source.db,
    boundSource.uow,
    graph.committedFanout,
  );
  const initialReservation = createInitialReservationOwner(
    source.db,
    boundSource.uow,
    graph.committedFanout,
  );
  const retryReservation = createRetryReservationOwner(
    source.db,
    boundSource.uow,
    graph.committedFanout,
  );
  const dequeueReservation = createDequeueReservationOwner(
    source.db,
    boundSource.uow,
    graph.committedFanout,
  );
  const reconciliation = createOptimizationReconciliation(
    source.db,
    source.gate,
    boundSource.uow,
    graph.committedFanout,
  );
  const outcome = createOptimizationOutcomeOwner(source.db, boundSource.uow, graph.committedFanout);
  if (options.optimizer !== undefined) {
    const optimizer = options.optimizer;
    coordinator = installOptimization({
      repository: {
        ...createOptimizationRepository(
          source.db,
          new DrizzleEventLogStore(source.db, source.gate),
          source.gate,
        ),
        // Proof: omitting this installed binding made the mounted terminal
        // child and, independently, initial/Retry preflight and queued cleanup
        // delete A without B's old-cause event.
        releaseSlot: (slot) => optimizationLifecycle.releaseSlot(slot),
        // Proof: omitting this installer binding reclaimed A but lost B's durable
        // event in the mounted initial-admission test.
        reserveSlot: initialReservation,
        // Proof: omitting this installed owner lost B's durable A-cause event;
        // the mounted second-event rollback case no longer rejected.
        dequeueRequest: dequeueReservation,
        // Proof: omitting the source-bound reconciliation installer let
        // startup delete populated A without B's durable recipient event.
        reconcileDrains: reconciliation,
        // Proof: omitting this binding let installed Retry delete A without
        // B's durable elsewhere_changed event; the mounted Retry test failed.
        admitRetry: retryReservation,
        // Proof: omitting this installed override stored A but left the
        // mounted selected-outcome test's durable B recipient row absent.
        recordOutcome: outcome,
      },
      contractVersion: contractVersionOf(optimizer.solverVersion),
      solverVersion: optimizer.solverVersion,
      budgetMs: optimizer.budgetMs,
      ownerId: crypto.randomUUID(),
      now: Date.now,
      attemptToken: () => crypto.randomUUID(),
      inputOf: async (projectId) => await graph.workItems.scheduleInput(projectId),
      enabledOf: async (projectId) =>
        (await source.stores.projects.findById(projectId))?.optimizationEnabled === true,
      // Proof: omitting the shared capture made the mounted upstream-only edit
      // request lose `elsewhere` (undefined instead of its holder interval).
      captureOf: async (projectId) => await graph.workItems.optimizationInput(projectId),
      hashInput: scheduleInputHash,
      spawn: optimizer.spawn,
      deliverCommitted: (events) => graph.committedFanout.deliverCommitted(events),
      onChildError: (error) => {
        options.logger.error({ err: error }, 'optimizer child failed');
      },
    }).optimizer;
  }

  const publicRanks = boundSource.stores.projectRanks;
  if (publicRanks === undefined) throw new Error('SQLite source omitted its public rank store');
  return {
    ...graph,
    optimizer: coordinator,
    // Proof: omitting the unconditional binding left the mounted lifecycle
    // undefined when this process had no active solver runtime.
    optimizationLifecycle,
    gate: source.gate,
    projectRanks: standaloneRankStore(publicRanks, boundSource.uow, graph.committedFanout),
  };
}
