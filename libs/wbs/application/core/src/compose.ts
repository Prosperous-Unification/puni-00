import type { AuthenticatedUser, Logger } from '@wbs/contracts';

import type {
  AuthService,
  TrustedIssuerVerification,
} from './module/authentication/authentication.feature';
import { installAuthentication } from './module/authentication/check';
import type { LoginThrottle } from './module/authentication/login-throttle';
import { installBoundedReplaySweep } from './module/bounded-replay-sweep/check';
import type { RetentionTimer } from './module/bounded-replay-sweep/retention-timer';
import { installCalendarMarker } from './module/calendar-marker/check';
import { installCapacity } from './module/capacity/check';
import { installDirectory } from './module/directory/check';
import { standaloneDirectoryService } from './module/directory/standalone-directory';
import { installEventLog } from './module/event-log/check';
import { installPlanCommands } from './module/plan-commands/check';
import type { PlanCommandRunner } from './module/plan-commands/plan-commands.feature';
import { installPlanEvent } from './module/plan-event/check';
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
import type { CommandAccess } from './ports/command-access';
import type { DependencyContext, ServiceDependencyContext } from './ports/dependency-context';
import { CREATOR_ADMISSION, type EditAdmission, NO_ADMISSION } from './ports/edit-admission';
import type { EnterpriseConnections } from './ports/enterprise-connections';
import type {
  BeforeProjectUpdate,
  BeforeStepRemoval,
  BeforeStepWrite,
} from './ports/fanout-capture-store';
import type { MachineCredentials } from './ports/machine-credentials';
import type { OidcVerifier } from './ports/oidc-verifier';
import type { ConnectedOptimizationAdmission } from './ports/optimization-input';
import type { ResourceAccess } from './ports/organization-access';
import type { Broadcaster } from './ports/project-event';
import type { PushTransport } from './ports/push-transport';
import type { Digest, PasswordHasher, TokenCodec } from './ports/runtime';
import type { Scheduler } from './ports/scheduler';
import type { Source } from './ports/source';
import type { PlanTransactionalStores, TransactionalStores } from './ports/stores';
import type { Intervals, Timers } from './ports/timers';
import type { Scope } from './ports/unit-of-work';
import type { CommittedFanoutDelivery } from './service/committed-fanout';
import { createLocalDependencyContext } from './service/dependency-context';
import {
  OptimizerTriggerBroadcaster,
  reactToProjectEvent,
} from './service/optimizer-trigger-broadcaster';

/** Runtime capabilities required by every service composition. */
export interface RuntimePorts {
  readonly commandAccess: CommandAccess;
  readonly clock: Clock;
  readonly digest: Digest;
  readonly timers: Timers;
  readonly intervals: Intervals;
  readonly push: PushTransport;
  readonly scheduler: Scheduler;
  /** Live connected target admission; borrowed graphs never receive this capability. */
  readonly admitConnectedOptimization?: ConnectedOptimizationAdmission;
  /** Adapter callback for plan edits that should refresh runtime-owned optimization. */
  readonly onPlanChanged?: (projectId: string) => void;
}

/** Account-only capabilities. Their presence selects the accountful overload. */
export interface AccountRuntime {
  readonly passwords: PasswordHasher;
  readonly tokens: TokenCodec;
  /** Which enterprise connections are proven, for enterprise email trust (D4). */
  readonly enterprise: Pick<EnterpriseConnections, 'provenFor'>;
  /** What `wbs_mk_` API keys are verified against (`wbs-machine-credentials` A13). */
  readonly machineCredentials: MachineCredentials;
  /**
   * How trusted issuers' JWTs are verified (`wbs-machine-credentials` A13
   * step 3); absent, the OIDC machine source is off.
   */
  readonly trustedIssuers?: TrustedIssuerVerification;
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
  readonly dependencyContext: ServiceDependencyContext;
  readonly clock: Clock;
  readonly broadcast: Broadcaster;
  readonly scheduler: Scheduler;
  /** Live connected target admission; borrowed graphs never receive this capability. */
  readonly admitConnectedOptimization?: ConnectedOptimizationAdmission;
  /** A borrowed command graph reads the transaction-captured cache without live admission. */
  readonly schedulerMode?: 'capture';
  /** Who may write a project through the built services; see {@link EditAdmission}. */
  readonly admission: EditAdmission;
  /** Scoped dependent writes use this only after their own unit of work grants it. */
  readonly recoveryAdmission?: EditAdmission;
  readonly beforeProjectUpdate?: BeforeProjectUpdate;
  readonly beforeStepRemoval?: BeforeStepRemoval;
  readonly beforeStepWrite?: BeforeStepWrite;
}

/**
 * Builds the writing services over exactly the stores admitted to this act.
 *
 * Called once for the public graph and once per admitted batch or import, so
 * every resource module is installed here, per call, over the stores it is
 * handed — never once for the process. Project and Step share one dependency
 * graph guard over those same stores. A shared installation would hand one
 * batch's staged stores to the next: the backend module map's "A singleton
 * module installation here would leak staged stores" hazard, and the
 * `Writing modules are installed per admitted scope` requirement of
 * `openspec/changes/adopt-di-composition/specs/di-composition/spec.md`.
 */
export function servicesOver(stores: PlanTransactionalStores, shared: ServicesOverOptions) {
  const { clock, broadcast, scheduler, admission } = shared;
  const recoveryAdmission = shared.recoveryAdmission ?? NO_ADMISSION;
  return {
    projects: installProject({
      clock,
      projects: stores.projects,
      broadcast,
      optimizerAvailable: () => scheduler.supports('optimized'),
      dependencyContext: shared.dependencyContext,
      beforeUpdate: shared.beforeProjectUpdate,
    }).projects,
    capacity: installCapacity({
      clock,
      projects: stores.projects,
      capacity: stores.capacity,
      resourceCapacity: stores.resourceCapacity,
      // Proof: with this spread removed, every activated statement case of
      // capacity-limit.controller.db.test.ts threw the capacity service's
      // composition error (2 pass, 10 fail); watched 2026-10-22.
      ...(stores.organizationLimits === undefined
        ? {}
        : { organizationLimits: stores.organizationLimits }),
      broadcast,
      admission,
    }).capacity,
    calendarMarkers: installCalendarMarker({
      clock,
      projects: stores.projects,
      markers: stores.calendarMarkers,
      broadcast,
      recoveryAdmission,
    }).calendarMarkers,
    priorityBands: installPriorityBand({
      clock,
      projects: stores.projects,
      bands: stores.priorityBands,
      broadcast,
      admission,
    }).priorityBands,
    steps: installStep({
      clock,
      projects: stores.projects,
      steps: stores.steps,
      broadcast,
      recoveryAdmission,
      dependencyContext: shared.dependencyContext,
      beforeRemove: shared.beforeStepRemoval,
      beforeWrite: shared.beforeStepWrite,
    }).steps,
    directory: installDirectory({
      clock,
      directory: stores.directory,
      broadcast,
      ...(stores.organizationLimits === undefined
        ? {}
        : { organizationLimits: stores.organizationLimits }),
    }).directory,
    workItems: installWorkItem({
      ...(stores.livePlans === undefined ? {} : { livePlans: stores.livePlans }),
      clock,
      workItems: stores.workItems,
      stepParallels: stores.stepParallels,
      projects: stores.projects,
      estimates: stores.estimates,
      actuals: stores.actuals,
      measures: stores.measures,
      progress: stores.progress,
      blockages: stores.blockages,
      claims: stores.claims,
      ...(stores.organizationLimits === undefined
        ? {}
        : { organizationLimits: stores.organizationLimits }),
      demands: stores.demands,
      resourceCapacity: stores.resourceCapacity,
      attempts: stores.attempts,
      dependencies: stores.dependencies,
      typedDependencies: stores.typedDependencies,
      directory: stores.directory,
      capacity: stores.capacity,
      priorityBands: stores.priorityBands,
      subtrees: stores.subtrees,
      journal: stores.journal,
      // Proof: inactive substitution hid deleted authority in the mounted production command reread test.
      externalDependencyAuthoring: stores.externalDependencyAuthoring,
      dependencyContext: shared.dependencyContext,
      broadcast,
      admission,
      scheduler,
      ...(shared.admitConnectedOptimization === undefined
        ? {}
        : { admitConnectedOptimization: shared.admitConnectedOptimization }),
      ...(shared.schedulerMode === undefined ? {} : { schedulerMode: shared.schedulerMode }),
    }).workItems,
  };
}

export type WritingServices = ReturnType<typeof servicesOver>;

interface CommonServices extends WritingServices {
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  readonly announcements: Broadcaster;
  readonly committedFanout: CommittedFanoutDelivery;
  readonly gatewayBroadcaster: GatewayBroadcaster;
  readonly replayBuffer: ReplayBuffer;
  readonly uow: Source['uow'];
  /**
   * One batch's writing graph over the scope its unit of work admitted, with
   * the admission that unit of work established; see {@link EditAdmission}.
   */
  readonly batch: (
    scope: Scope,
    broadcast: Broadcaster,
    admission: EditAdmission,
    dependencies: DependencyContext,
    beforeProjectUpdate?: BeforeProjectUpdate,
    beforeStepRemoval?: BeforeStepRemoval,
    beforeStepWrite?: BeforeStepWrite,
  ) => WritingServices;
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
    readonly enterprise?: never;
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
  const eventLog = installEventLog({ events: source.stores.eventLog }).eventLog;
  const planEvents = installPlanEvent({ events: source.stores.planEvents }).planEvents;
  const realtime = installRealtime({
    eventLog,
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
  const committedFanout: CommittedFanoutDelivery = {
    now: () => runtime.clock.now(),
    deliverCommitted: async (events) => {
      // Every row is durable before this callback; trigger all recipients before transport can wait.
      if (runtime.onPlanChanged !== undefined)
        for (const { projectId, event } of events)
          // Proof: omitting the committed reaction left the recipient unchanged
          // while transport was held; direct delivery test received [].
          reactToProjectEvent(projectId, event, runtime.onPlanChanged);
      for (const { recorded, event } of events)
        // Proof: substituting publish advanced the durable sequence and the
        // direct delivery test received a second row instead of the original.
        await broadcaster.pushRecorded(recorded.subscription, recorded, event);
    },
  };
  const rawPublicServices = servicesOver(source.stores, {
    dependencyContext: createLocalDependencyContext(source.stores),
    clock: runtime.clock,
    broadcast: announcements,
    scheduler: runtime.scheduler,
    ...(runtime.admitConnectedOptimization === undefined
      ? {}
      : { admitConnectedOptimization: runtime.admitConnectedOptimization }),
    admission: CREATOR_ADMISSION,
  });
  const publicServices = {
    ...rawPublicServices,
    directory:
      source.stores.livePlans === undefined
        ? rawPublicServices.directory
        : standaloneDirectoryService({
            directory: source.stores.directory,
            uow: source.uow,
            clock: runtime.clock,
            announcements,
            delivery: committedFanout,
          }),
  };
  const batch = (
    scope: Scope,
    broadcast: Broadcaster,
    admission: EditAdmission,
    dependencies: DependencyContext,
    beforeProjectUpdate?: BeforeProjectUpdate,
    beforeStepRemoval?: BeforeStepRemoval,
    beforeStepWrite?: BeforeStepWrite,
  ) =>
    // Proof: binding the public standalone directory service here made a
    // project-null command attempt a nested UoW (typed 500 instead of 200)
    // before its one durable fan-out could commit.
    servicesOver(scope.stores, {
      clock: runtime.clock,
      broadcast,
      scheduler: runtime.scheduler,
      // Borrowed command reads use this source connection's captured cache;
      // live admission would wait for the writer turn this batch already owns.
      // Proof: omitting capture mode made the isolated mounted arrange command
      // enter the throwing live optimizer and answer 500 instead of 200.
      schedulerMode: 'capture',
      admission,
      recoveryAdmission: admission,
      dependencyContext: { kind: 'bound', context: dependencies },
      beforeProjectUpdate,
      beforeStepRemoval,
      beforeStepWrite,
    });
  const { savedPlans } = installSavedPlans({
    digest: runtime.digest,
    capture: source.history.savedPlanCapture,
    plans: source.history.savedPlans,
    scheduler: runtime.scheduler,
    // The installed save/current path rechecks admitted human authority in this read snapshot.
    // Proof: removing this entire binding failed mounted saved displacement (expected 3, got 0).
    ...(source.stores.livePlans === undefined
      ? {}
      : {
          captureSharedPlan: async (projectId: string, access: ResourceAccess) => {
            // Proof: project-owned readProject bypassed revoked human membership: mounted
            // comparison returned 200 instead of 403/not_a_member; save writer still refused.
            const captured = await source.stores.livePlans?.read(projectId, access);
            if (captured === undefined)
              throw new Error('installed shared saved-plan capture lost its live-plan store');
            // Proof: injecting process-scheduler live mode here for an enabled optimized
            // target failed the mounted S4 no-write assertion: a generation and cache rows appeared.
            return captured.kind === 'shared' ? captured.chain : captured;
          },
        }),
    newId: () => runtime.clock.newId(),
    now: () => Math.floor(runtime.clock.now() / 1_000),
  });
  const common: CommonServices = {
    ...publicServices,
    clock: runtime.clock,
    scheduler: runtime.scheduler,
    announcements,
    committedFanout,
    gatewayBroadcaster: broadcaster,
    replayBuffer: buffer,
    uow: source.uow,
    batch,
    imports: installPlanImport({
      commandAccess: runtime.commandAccess,
      // Proof: inactive substitution returned 409 instead of 500 after authority deletion in the mounted production import test.
      externalDependencies: (scope) => scope.stores.externalDependencyAuthoring,
      clock: runtime.clock,
      scheduler: runtime.scheduler,
      uow: source.uow,
      announcements,
      // Proof: dropping this binding made the mounted tied import answer 500
      // instead of recording (B,A); watched in 6j.a.
      committedFanout,
      // An import writes only the project it creates for its importer, whom
      // the creator rule admits.
      // Proof: replacing this borrowed directory with the public standalone
      // wrapper made the mounted import hit its bounded nested-owner refusal.
      batchServices: (scope, broadcast) =>
        servicesOver(scope.stores, {
          clock: runtime.clock,
          broadcast,
          scheduler: runtime.scheduler,
          schedulerMode: 'capture',
          admission: CREATOR_ADMISSION,
          dependencyContext: createLocalDependencyContext(scope.stores),
        }),
    }).imports,
    commands: installPlanCommands({
      commandAccess: runtime.commandAccess,
      batchServices: batch,
      publicServices,
      uow: source.uow,
      announcements,
      committedFanout,
    }).commands,
    history: installPlanHistory({
      projects: publicServices.projects,
      planEvents,
    }).history,
    plans: savedPlans,
    savedPlans,
    replay: realtime.replay,
    retention: installBoundedReplaySweep({
      eventLog,
      maxPerSubscription: shared.replayMaxPerSubscription,
      planEvents,
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
      enterprise: runtime.enterprise,
      machineCredentials: runtime.machineCredentials,
      ...(runtime.trustedIssuers === undefined ? {} : { trustedIssuers: runtime.trustedIssuers }),
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
