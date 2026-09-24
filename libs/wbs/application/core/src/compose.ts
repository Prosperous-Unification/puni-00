import type { AuthenticatedUser, Logger } from '@wbs/contracts';

import type { AuthService } from './module/authentication/authentication.feature';
import { installAuthentication } from './module/authentication/check';
import type { LoginThrottle } from './module/authentication/login-throttle';
import { installBoundedReplaySweep } from './module/bounded-replay-sweep/check';
import type { RetentionTimer } from './module/bounded-replay-sweep/retention-timer';
import { installCalendarMarker } from './module/calendar-marker/check';
import { installCapacity } from './module/capacity/check';
import { installDirectory } from './module/directory/check';
import { installPlanCommands } from './module/plan-commands/check';
import type { PlanCommandRunner } from './module/plan-commands/plan-commands.feature';
import { installPlanHistory } from './module/plan-history/check';
import type { HistoryService } from './module/plan-history/plan-history.feature';
import { installPlanImport } from './module/plan-import/check';
import type { ImportService } from './module/plan-import/plan-import.feature';
import { installPriorityBand } from './module/priority-band/check';
import { installProject } from './module/project/check';
import { installRealtime } from './module/realtime/check';
import type { GatewayBroadcaster } from './module/realtime/gateway-broadcaster';
import type { ReplayBuffer } from './module/realtime/replay-buffer';
import type { ReplayOrchestrator } from './module/realtime/replay-orchestrator';
import { installSavedPlans } from './module/saved-plans/check';
import type { SavedPlanService } from './module/saved-plans/saved-plans.feature';
import { installStep } from './module/step/check';
import { installWorkItem } from './module/work-item/check';
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
import { OptimizerTriggerBroadcaster } from './service/optimizer-trigger-broadcaster';

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

/**
 * Builds the writing services over exactly the stores admitted to this act.
 *
 * Called once for the public graph and once per admitted batch or import, so
 * every resource module is installed here, per call, over the stores it is
 * handed — never once for the process. A shared installation would hand one
 * batch's staged stores to the next: the backend module map's "A singleton
 * module installation here would leak staged stores" hazard, and the
 * `Writing modules are installed per admitted scope` requirement of
 * `openspec/changes/adopt-di-composition/specs/di-composition/spec.md`.
 */
export function servicesOver(stores: PlanTransactionalStores, shared: ServicesOverOptions) {
  const { clock, broadcast, scheduler } = shared;
  return {
    projects: installProject({
      clock,
      projects: stores.projects,
      broadcast,
      optimizerAvailable: () => scheduler.supports('optimized'),
    }).projects,
    capacity: installCapacity({
      clock,
      projects: stores.projects,
      capacity: stores.capacity,
      broadcast,
    }).capacity,
    calendarMarkers: installCalendarMarker({
      clock,
      projects: stores.projects,
      markers: stores.calendarMarkers,
      broadcast,
    }).calendarMarkers,
    priorityBands: installPriorityBand({
      clock,
      projects: stores.projects,
      bands: stores.priorityBands,
      broadcast,
    }).priorityBands,
    steps: installStep({
      clock,
      projects: stores.projects,
      steps: stores.steps,
      broadcast,
    }).steps,
    directory: installDirectory({ clock, directory: stores.directory, broadcast }).directory,
    workItems: installWorkItem({
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
    }).workItems,
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
  readonly imports: ImportService;
  /**
   * Plan commands, installed once for the process over {@link batch}: every
   * batch it runs builds its own graph over the scope its own unit of work
   * admits. be-01's `mountedEndpoints` does not read this yet and constructs a
   * second, stateless `PlanCommandRunner` over the same values (task 7.4).
   */
  readonly commands: PlanCommandRunner;
}

export type AccountlessServices = CommonServices;

/**
 * `auth` and `loginThrottle` both come from the Authentication module and
 * both stay accountful-only: {@link LoginThrottle} throttles password
 * verification, which does not exist without an account graph to verify
 * against. Moving it here (it previously sat on {@link CommonServices},
 * unconditionally constructed even for the accountless graph) closes the
 * map's own "Accountless exports neither Authentication nor throttle"
 * requirement.
 */
export interface AccountfulServices extends CommonServices {
  readonly auth: AuthService;
  readonly loginThrottle: LoginThrottle;
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
  const { savedPlans } = installSavedPlans({
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
    imports: installPlanImport({
      clock: runtime.clock,
      scheduler: runtime.scheduler,
      uow: source.uow,
      announcements,
      batchServices: batch,
    }).imports,
    commands: installPlanCommands({
      batchServices: batch,
      publicServices,
      uow: source.uow,
      announcements,
    }).commands,
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
  };

  const hasAccounts = hasAccountStores(source);
  const hasRuntime = hasAccountRuntime(runtime);
  if (hasAccounts !== hasRuntime) {
    throw new Error('account stores and account runtime must be supplied together');
  }
  if (!hasAccounts || !hasRuntime) return common;
  const { auth, loginThrottle } = installAuthentication({
    account: {
      users: source.stores.users,
      passwords: runtime.passwords,
      tokens: runtime.tokens,
      clock: runtime.clock,
      ...(runtime.oidc === undefined ? {} : { oidc: runtime.oidc }),
      ...(runtime.passwordSessions === undefined
        ? {}
        : { passwordSessions: runtime.passwordSessions }),
      ...(runtime.localIdentity === undefined ? {} : { localIdentity: runtime.localIdentity }),
    },
    now: () => runtime.clock.now(),
    maxConcurrentLogins: shared.maxConcurrentLogins ?? 8,
  });
  return { ...common, auth, loginThrottle };
}

function hasAccountRuntime(
  runtime: RuntimePorts | (RuntimePorts & AccountRuntime),
): runtime is RuntimePorts & AccountRuntime {
  return 'passwords' in runtime && 'tokens' in runtime;
}

function hasAccountStores(source: Source): source is Source<TransactionalStores> {
  return 'users' in source.stores;
}
