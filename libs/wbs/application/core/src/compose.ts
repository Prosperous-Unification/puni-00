import type { AuthenticatedUser, Logger } from '@wbs/contracts';

import { installBoundedReplaySweep } from './module/bounded-replay-sweep/check';
import type { RetentionTimer } from './module/bounded-replay-sweep/retention-timer';
import { installPlanHistory } from './module/plan-history/check';
import type { HistoryService } from './module/plan-history/plan-history.feature';
import { installRealtime } from './module/realtime/check';
import type { GatewayBroadcaster } from './module/realtime/gateway-broadcaster';
import type { ReplayBuffer } from './module/realtime/replay-buffer';
import type { ReplayOrchestrator } from './module/realtime/replay-orchestrator';
import type { Clock } from './ports/clock';
import type { OidcVerifier } from './ports/oidc-verifier';
import type { Broadcaster } from './ports/project-event';
import type { PushTransport } from './ports/push-transport';
import type { Digest, PasswordHasher, TokenCodec } from './ports/runtime';
import type { Scheduler } from './ports/scheduler';
import type { Source } from './ports/source';
import type { PlanTransactionalStores, TransactionalStores } from './ports/stores';
import type { Intervals, Timers } from './ports/timers';
import type { Scope } from './ports/unit-of-work';
import { AuthService } from './service/auth.service';
import { CalendarMarkerService } from './service/calendar-marker.service';
import { CapacityService } from './service/capacity.service';
import { DirectoryService } from './service/directory.service';
import { ImportService } from './service/import.service';
import { LoginThrottle } from './service/login-throttle';
import { OptimizerTriggerBroadcaster } from './service/optimizer-trigger-broadcaster';
import { PriorityBandService } from './service/priority-band.service';
import { ProjectService } from './service/project.service';
import { SavedPlanService } from './service/saved-plan.service';
import { StepService } from './service/step.service';
import { WorkItemService } from './service/work-item.service';

/** Runtime capabilities required by every service composition. */
export interface RuntimePorts {
  readonly clock: Clock;
  readonly digest: Digest;
  readonly timers: Timers;
  readonly intervals: Intervals;
  readonly push: PushTransport;
  readonly scheduler: Scheduler;
  /** Adapter callback for plan edits that should refresh runtime-owned optimization. */
  readonly onPlanChanged?: (projectId: string) => void;
}

/** Account-only capabilities. Their presence selects the accountful overload. */
export interface AccountRuntime {
  readonly passwords: PasswordHasher;
  readonly tokens: TokenCodec;
  readonly oidc?: OidcVerifier;
  readonly passwordSessions?: boolean;
  readonly localIdentity?: AuthenticatedUser;
}

/** Process limits and diagnostics shared by the graph. */
export interface SharedComposition {
  readonly logger: Logger;
  readonly replayMaxPerSubscription: number;
  readonly replayMaxAgeMs: number;
  readonly replayMaxEvents?: number;
  readonly retentionIntervalMs: number;
  readonly planEventRetentionDays: number;
  readonly maxConcurrentLogins?: number;
}

export interface ServicesOverOptions {
  readonly clock: Clock;
  readonly broadcast: Broadcaster;
  readonly scheduler: Scheduler;
}

/** Builds the writing services over exactly the stores admitted to this act. */
export function servicesOver(stores: PlanTransactionalStores, shared: ServicesOverOptions) {
  const { clock, broadcast, scheduler } = shared;
  return {
    projects: new ProjectService({
      clock,
      projects: stores.projects,
      broadcast,
      optimizerAvailable: () => scheduler.supports('optimized'),
    }),
    capacity: new CapacityService({
      clock,
      projects: stores.projects,
      capacity: stores.capacity,
      broadcast,
    }),
    calendarMarkers: new CalendarMarkerService({
      clock,
      projects: stores.projects,
      markers: stores.calendarMarkers,
      broadcast,
    }),
    priorityBands: new PriorityBandService({
      clock,
      projects: stores.projects,
      bands: stores.priorityBands,
      broadcast,
    }),
    steps: new StepService({
      clock,
      projects: stores.projects,
      steps: stores.steps,
      broadcast,
    }),
    directory: new DirectoryService({ clock, directory: stores.directory, broadcast }),
    workItems: new WorkItemService({
      clock,
      workItems: stores.workItems,
      projects: stores.projects,
      estimates: stores.estimates,
      actuals: stores.actuals,
      measures: stores.measures,
      progress: stores.progress,
      dependencies: stores.dependencies,
      directory: stores.directory,
      capacity: stores.capacity,
      priorityBands: stores.priorityBands,
      subtrees: stores.subtrees,
      journal: stores.journal,
      broadcast,
      scheduler,
    }),
  };
}

export type WritingServices = ReturnType<typeof servicesOver>;

interface CommonServices extends WritingServices {
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  readonly announcements: Broadcaster;
  readonly gatewayBroadcaster: GatewayBroadcaster;
  readonly replayBuffer: ReplayBuffer;
  readonly uow: Source['uow'];
  readonly batch: (scope: Scope, broadcast: Broadcaster) => WritingServices;
  readonly history: HistoryService;
  readonly plans: SavedPlanService;
  readonly savedPlans: SavedPlanService;
  readonly replay: ReplayOrchestrator;
  readonly retention: RetentionTimer;
  readonly loginThrottle: LoginThrottle;
  readonly imports: ImportService;
}

export type AccountlessServices = CommonServices;

export interface AccountfulServices extends CommonServices {
  readonly auth: AuthService;
}

export type AccountlessSource = Source<PlanTransactionalStores & { readonly users?: never }>;

interface AccountlessOptions {
  readonly source: AccountlessSource;
  readonly runtime: RuntimePorts & {
    readonly passwords?: never;
    readonly tokens?: never;
    readonly oidc?: never;
    readonly passwordSessions?: never;
    readonly localIdentity?: never;
  };
  readonly shared: SharedComposition;
}

interface AccountfulOptions {
  readonly source: Source<TransactionalStores>;
  readonly runtime: RuntimePorts & AccountRuntime;
  readonly shared: SharedComposition;
}

export function composeServices(options: AccountfulOptions): AccountfulServices;
export function composeServices(options: AccountlessOptions): AccountlessServices;
export function composeServices(
  options: AccountfulOptions | AccountlessOptions,
): AccountfulServices | AccountlessServices {
  const { source, runtime, shared } = options;
  const realtime = installRealtime({
    eventLog: source.stores.eventLog,
    clock: runtime.clock,
    push: runtime.push,
    maxPerSubscription: shared.replayMaxPerSubscription,
    maxAgeMs: shared.replayMaxAgeMs,
    ...(shared.replayMaxEvents === undefined ? {} : { maxEvents: shared.replayMaxEvents }),
    onPushFailed: (error, subscription) => {
      shared.logger.warn({ err: error, subscription }, 'project event recorded but not pushed');
    },
  });
  const { replayBuffer: buffer, broadcaster } = realtime;
  const announcements: Broadcaster =
    runtime.onPlanChanged === undefined
      ? broadcaster
      : new OptimizerTriggerBroadcaster(broadcaster, runtime.onPlanChanged);
  const publicServices = servicesOver(source.stores, {
    clock: runtime.clock,
    broadcast: announcements,
    scheduler: runtime.scheduler,
  });
  const batch = (scope: Scope, broadcast: Broadcaster) =>
    servicesOver(scope.stores, {
      clock: runtime.clock,
      broadcast,
      scheduler: runtime.scheduler,
    });
  const savedPlans = new SavedPlanService({
    digest: runtime.digest,
    capture: source.history.savedPlanCapture,
    plans: source.history.savedPlans,
    scheduler: runtime.scheduler,
    newId: () => runtime.clock.newId(),
    now: () => Math.floor(runtime.clock.now() / 1_000),
  });
  const common: CommonServices = {
    ...publicServices,
    clock: runtime.clock,
    scheduler: runtime.scheduler,
    announcements,
    gatewayBroadcaster: broadcaster,
    replayBuffer: buffer,
    uow: source.uow,
    batch,
    imports: new ImportService({
      clock: runtime.clock,
      scheduler: runtime.scheduler,
      uow: source.uow,
      announcements,
      batchServices: batch,
    }),
    history: installPlanHistory({
      projectStore: source.stores.projects,
      planEventStore: source.stores.planEvents,
    }).history,
    plans: savedPlans,
    savedPlans,
    replay: realtime.replay,
    retention: installBoundedReplaySweep({
      eventLog: source.stores.eventLog,
      maxPerSubscription: shared.replayMaxPerSubscription,
      planEvents: source.stores.planEvents,
      planEventRetentionDays: shared.planEventRetentionDays,
      intervalMs: shared.retentionIntervalMs,
      intervals: runtime.intervals,
      now: () => runtime.clock.now(),
      onSweep: (removed) => {
        if (removed.eventLog > 0) {
          shared.logger.info({ removed: removed.eventLog }, 'event log pruned');
        }
        if (removed.planEvents > 0) {
          shared.logger.info({ removed: removed.planEvents }, 'plan history pruned');
        }
      },
      onError: (error) => {
        shared.logger.error({ err: error }, 'retention sweep failed');
      },
    }).retention,
    loginThrottle: new LoginThrottle({
      now: () => runtime.clock.now(),
      maxConcurrent: shared.maxConcurrentLogins ?? 8,
    }),
  };

  const hasAccounts = hasAccountStores(source);
  const hasRuntime = hasAccountRuntime(runtime);
  if (hasAccounts !== hasRuntime) {
    throw new Error('account stores and account runtime must be supplied together');
  }
  if (!hasAccounts || !hasRuntime) return common;
  return {
    ...common,
    auth: new AuthService({
      users: source.stores.users,
      identities: source.stores.users,
      passwords: runtime.passwords,
      tokens: runtime.tokens,
      clock: runtime.clock,
      ...(runtime.oidc === undefined ? {} : { oidc: runtime.oidc }),
      ...(runtime.passwordSessions === undefined
        ? {}
        : { passwordSessions: runtime.passwordSessions }),
      ...(runtime.localIdentity === undefined ? {} : { localIdentity: runtime.localIdentity }),
    }),
  };
}

function hasAccountRuntime(
  runtime: RuntimePorts | (RuntimePorts & AccountRuntime),
): runtime is RuntimePorts & AccountRuntime {
  return 'passwords' in runtime && 'tokens' in runtime;
}

function hasAccountStores(source: Source): source is Source<TransactionalStores> {
  return 'users' in source.stores;
}
