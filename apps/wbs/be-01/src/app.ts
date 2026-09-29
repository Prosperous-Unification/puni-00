import type {
  Broadcaster,
  Clock,
  DomainChallenges,
  EditAdmission,
  EmailDelivery,
  EmailVerification,
  HistoryService,
  ImportService,
  Invitation,
  JoinRequest,
  MembershipAdministration,
  Onboarding,
  OrganizationAccess,
  ReplayOrchestrator,
  SavedPlanService,
  SpaceStore,
} from '@wbs/core';
import { clockOf } from '@wbs/core';
import { domainRoutes } from '@wbs/core/http/domain.routes';
import { emailVerificationRoutes } from '@wbs/core/http/email-verification.routes';
import { invitationRoutes } from '@wbs/core/http/invitation.routes';
import { joinRequestRoutes } from '@wbs/core/http/join-request.routes';
import { onboardingRoutes } from '@wbs/core/http/onboarding.routes';
import { organizationRoutes } from '@wbs/core/http/organization.routes';
import { personLoadRoutes } from '@wbs/core/http/person-load.routes';
import { spaceRoutes } from '@wbs/core/http/space.routes';
import type { LoginThrottle } from '@wbs/core/module/authentication/login-throttle';
import { admittedWrites } from '@wbs/core/module/plan-commands/admitted-write';
import { PlanCommandRunner } from '@wbs/core/module/plan-commands/plan-commands.feature';
import type { AuthService } from '@wbs/core/service/auth.service';
import { PersonLoad } from '@wbs/core/service/person-load.feature';
import { RollUpCache, SpaceResource } from '@wbs/core/service/space.resource';
import { createLogger, type Logger, type MetricsScrape, scrapeMetrics } from '@wbs/observability';
import { Elysia } from 'elysia';

import { authOidcEndpoints } from './controller/auth-oidc-endpoints';
import { authPasswordEndpoints } from './controller/auth-password-endpoints';
import { bearerContextRoutes } from './controller/bearer-context.routes';
import { calendarMarkerRoutes } from './controller/calendar-marker.routes';
import { directoryRoutes } from './controller/directory.routes';
import { historyRoutes } from './controller/history.routes';
import { importRoutes } from './controller/import.routes';
import { infrastructureEndpoints } from './controller/infrastructure-endpoints';
import { gatewayAccessRoutes, internalRoutes } from './controller/internal.routes';
import type { OidcRouteOptions } from './controller/oidc-options';
import { projectRoutes } from './controller/project.routes';
import { savedPlanRoutes } from './controller/saved-plan.routes';
import { smokeRoutes } from './controller/smoke.routes';
import { solutionRoutes } from './controller/solution.routes';
import { stepRoutes } from './controller/step.routes';
import { workItemRoutes } from './controller/work-item.routes';
import { mountEndpoints } from './http/elysia/mount';
import { createUnexpectedFailureReporter } from './http/elysia/unexpected-failure';
import type { BoundEndpoint } from './http/endpoint';
import { identityResolver } from './http/identity';
import { openApiPlugin } from './openapi/openapi-plugin';
import type { DatabaseHealth } from './repository/health-probe';
import { type IssueBearerContext, REFUSE_BEARER_CONTEXT } from './runtime/bearer-context';
import { nodeDigest } from './runtime/bun-runtime';
import { type DelegationVerifier, REFUSE_DELEGATIONS } from './runtime/delegation';
import type { CalendarMarkerService } from './service/calendar-marker.service';
import type { CapacityService } from './service/capacity.service';
import type { DirectoryService } from './service/directory.service';
import type { OptimizationCoordinator } from './service/optimization-coordinator';
import type { PriorityBandService } from './service/priority-band.service';
import type { ProjectService } from './service/project.service';
import type { StepService } from './service/step.service';
import type { Scope, UnitOfWork } from './service/unit-of-work';
import type { WorkItemService } from './service/work-item.service';
import type { WritingServices } from './services';

export interface AppOptions {
  clock: Pick<Clock, 'now'>;
  /** Trusted browser origin, resolved from operator configuration before boot. */
  appOrigin: string;
  migrationsApplied: boolean;
  /**
   * Required rather than optional. An optional auth service would let a
   * misconfigured process start with the registration and login routes simply
   * absent, answering 404 — indistinguishable from a routing fault at the edge.
   */
  auth: AuthService;
  /** The composition's one password-attempt throttle. */
  loginThrottle: LoginThrottle;
  oidc?: OidcRouteOptions;
  /**
   * Required for the same reason as `auth`: an absent project service would
   * answer 404 on every project route, which reads as an edge misconfiguration
   * rather than a process built without its domain.
   */
  projects: ProjectService;
  /**
   * Resolves each protected request's organization authority. Required: a
   * default would have to be legacy access, which is exactly the answer an
   * activated deployment must never give by omission.
   */
  organizations: OrganizationAccess;
  /**
   * Changes and removes memberships under the role matrix (task 3.7).
   * Required, like `organizations`: a process built without it would answer
   * 404 on the membership routes, which reads as a release without them.
   */
  memberships: MembershipAdministration;
  /** Checked policy and transactional challenge storage; omission is a composition error. */
  domains: DomainChallenges;
  /** Signed-in onboarding boundary; absence cannot masquerade as an HTTP 404. */
  onboarding: Onboarding;
  /** Required durable challenge boundary; absence is a boot configuration error. */
  emailVerification: EmailVerification;
  /** Required invitation boundary, inert until activation. */
  invitations: Invitation;
  /** Required join-request decision boundary. */
  joinRequests: JoinRequest;
  /** Injected mail sink; production's current adapter refuses delivery visibly. */
  emailDelivery: EmailDelivery;
  /** Required for the same reason as `projects`. */
  workItems: WorkItemService;
  /** The manual Retry admission seam; absent only in optimizer-less deployments and tests. */
  optimizer?: Pick<OptimizationCoordinator, 'retry'>;
  /**
   * Required for the same reason as `projects`. A process built without it
   * would answer 404 on every saved-plan route, which a client reads as "this
   * project has no saved plans" rather than as a be-01 that cannot store one.
   * Task 6.4 is where absence acquires a *typed* answer; until then it is not
   * an absence this process is allowed to have.
   */
  savedPlans: SavedPlanService;
  /**
   * Required for the same reason as `projects`, and for one more: a process
   * built without it would answer 404 on every step route, which is exactly
   * what a client asking a be-01 from before steps could be written sees.
   */
  steps: StepService;
  directory: DirectoryService;
  /**
   * Required for the same reason as `projects`: a process built without it would
   * answer 404 on the capacity route, and a plan whose capacity box silently did
   * nothing reads as a plan whose numbers do not matter.
   */
  capacity: CapacityService;
  /**
   * Required for the same reason as `capacity`: a process built without it would
   * answer 404 on the ladder route, and a Priorities dialog whose Save silently
   * did nothing reads as a plan whose configuration does not matter.
   */
  priorityBands: PriorityBandService;
  /**
   * Required for the same reason as `priorityBands`: a process built without it
   * would answer 404 on the history route, which a client cannot tell from a
   * plan whose history is empty — and "empty" is the answer for every plan the
   * day the table ships, so the mistake would be invisible for a week.
   */
  history: HistoryService;
  /**
   * Required for the same reason as `history`, and for its exact failure mode: a
   * process built without it answers 404 on every marker route, which a client
   * cannot tell from a project that has no markers — and "none" is the answer
   * for every project the day the table ships, so the mistake would be
   * invisible for a week.
   */
  calendarMarkers: CalendarMarkerService;
  /**
   * Organization spaces (`add-spaces`). Required, like `organizations`: a
   * process built without it would answer 404 on every space route.
   */
  spaces: SpaceStore;
  /**
   * Shared secret gw-01 presents on /internal/*. Required — a default here
   * would silently diverge from the value gw-01 loads from the environment,
   * failing every forward with a 401 that only shows up in a real deployment.
   */
  internalAuthSecret: string;
  /**
   * Verifies WBS-signed delegation tokens (task 2.5). Absent, every delegation
   * is refused with 401 (`REFUSE_DELEGATIONS`): production issues none yet,
   * so the path stays inert. Configuring keys alone never activates it.
   */
  delegation?: DelegationVerifier;
  /** Direct bearer issuance stays refusing unless explicitly wired after activation. */
  bearerContext?: IssueBearerContext;
  /**
   * Required for the same reason as `auth`, and for one more: the stub this
   * replaced answered every resume with `replaying, count: 0`, which no client
   * could distinguish from "you missed nothing". An optional service would let
   * that answer come back by accident.
   */
  replay: ReplayOrchestrator;
  /**
   * Asks the database whether it is the one this process was built for.
   *
   * Required, and it runs on every `/health` call rather than once at startup.
   * The endpoint used to answer from a boolean set before any query had been
   * made, so a container pointed at the wrong `DB_PATH` passed the deploy's
   * health gate and took traffic it could not serve. A health check that cannot
   * fail is the failure `AGENTS.md` R5 is about.
   */
  probeDatabase: () => DatabaseHealth;
  /**
   * What a command batch runs inside: the source's unit of work and the batch's
   * own service graph — `sqliteUnitOfWork(db, coordinator, admitted)` in
   * production, the counting fixture on in-memory stores. See
   * `libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts`,
   * ADR 0007 and ADR 0015.
   */
  writes: {
    /** The process's atomic archival plan importer over this same source admission boundary. */
    imports: Pick<ImportService, 'import'>;
    /**
     * What a command batch is one of: one turn at the source's write
     * coordinator and every write settled together (ADR 0015).
     */
    uow: UnitOfWork;
    /**
     * How a batch's services are built: over the stores its unit-of-work scope
     * admits (D20), and over the collector the runner hands in so the batch's
     * announcements are its own (D24). These are
     * **not** the services beside them in these options: those take a turn per
     * write and publish straight through, which is what keeps a route write —
     * and a route event — out of an open batch. The admission is the one the
     * batch's own unit of work established (see `EditAdmission`).
     */
    batch: (scope: Scope, broadcast: Broadcaster, admission: EditAdmission) => WritingServices;
    /**
     * Where a batch's collected announcements go once it has committed and let
     * go of its turn, and where every route publishes directly.
     */
    announcements: Broadcaster;
  };
  /**
   * The commit the checkout on disk is at, read fresh on every `/health` call.
   *
   * Optional, and this is the one place an absent value does not lie: `null`
   * means "this deployment cannot tell you which commit it is at", which is the
   * true answer for a prod image with no `.git` and for a test that never
   * wired it. `boot.ts` passes the real reader, and `boot.test.ts` fails if it
   * stops doing so, so the default cannot quietly become production's answer.
   *
   * A function rather than a string because dev's deploy is a `git reset` under
   * running watchers: a docs-only commit moves the checkout and restarts
   * nothing, so a value captured at startup would report the previous deploy
   * for as long as the process happened to live.
   */
  deployedCommit?: () => string | null;
  /** Overrides the process collector in tests while retaining the real shape boundary. */
  metricsScrape?: () => Promise<MetricsScrape>;
  version?: string;
}

interface InfrastructureRuntime {
  logger: Logger;
  scrapeMetrics: () => Promise<MetricsScrape>;
}

/** Typed bindings mounted by the production app. */
export function mountedEndpoints(
  opts: AppOptions,
  runtime: InfrastructureRuntime = {
    logger: createLogger({ service: 'be-01', version: opts.version }),
    scrapeMetrics: opts.metricsScrape ?? (() => scrapeMetrics('be-01')),
  },
): readonly BoundEndpoint[] {
  const passwordThrottle = opts.loginThrottle;
  const commands = new PlanCommandRunner({
    batchServices: opts.writes.batch,
    publicServices: {
      workItems: opts.workItems,
      steps: opts.steps,
      directory: opts.directory,
      capacity: opts.capacity,
      priorityBands: opts.priorityBands,
    },
    uow: opts.writes.uow,
    announcements: opts.writes.announcements,
  });
  // A project reach change and a step removal read the combined dependency
  // graph before they write, so each runs as one unit of work: a write landing
  // between the check and the write could otherwise leave a cycle.
  const admitted = admittedWrites(opts.writes);
  // Spaces stamp their writes; the app's clock is time alone, so ids are
  // random UUIDs as `services.ts` issues them.
  const spaceClock = clockOf({ now: () => opts.clock.now(), newId: () => crypto.randomUUID() });
  // One cache per app, which is one per process in production (design memo §8).
  const rollUpCache = new RollUpCache(opts.clock);
  return [
    // Proof: omitting health and metrics separately made app.routes.test.ts
    // expect 40 local bindings and receive 39 for each injected fault.
    ...infrastructureEndpoints({
      // Readiness changes after the endpoint table is built. Capturing this
      // boolean here left production `/health` at 503 after boot had completed;
      // boot.db.test.ts observed `Expected: 200, Received: 503` on five paths.
      get migrationsApplied() {
        return opts.migrationsApplied;
      },
      probeDatabase: opts.probeDatabase,
      deployedCommit: opts.deployedCommit,
      logger: runtime.logger,
      scrapeMetrics: runtime.scrapeMetrics,
    }),
    ...authPasswordEndpoints(opts.auth, opts.oidc, passwordThrottle),
    ...bearerContextRoutes(opts.bearerContext ?? REFUSE_BEARER_CONTEXT),
    // Proof: removing this spread made app.routes.test.ts receive 40 bindings
    // instead of the 44 required by the OIDC composition.
    ...(opts.oidc === undefined ? [] : authOidcEndpoints(opts.auth, opts.oidc, passwordThrottle)),
    // Proof: omitting this binding made “binds each shared HTTP shape once”
    // receive 40 endpoints instead of 41 in app.routes.test.ts (2026-09-10).
    ...smokeRoutes(),
    ...organizationRoutes(opts.organizations, opts.memberships, opts.clock),
    ...domainRoutes(opts.organizations, opts.domains, opts.clock),
    ...onboardingRoutes(opts.onboarding, opts.clock),
    ...emailVerificationRoutes(opts.emailVerification, opts.emailDelivery, opts.clock, nodeDigest),
    ...invitationRoutes(
      opts.invitations,
      opts.organizations,
      opts.emailDelivery,
      opts.clock,
      nodeDigest,
    ),
    ...joinRequestRoutes(
      opts.joinRequests,
      opts.organizations,
      opts.emailDelivery,
      opts.clock,
      nodeDigest,
    ),
    ...stepRoutes(
      {
        addWithin: (...args) => opts.steps.addWithin(...args),
        findWithin: (...args) => opts.steps.findWithin(...args),
        renameWithin: (...args) => opts.steps.renameWithin(...args),
        removeWithin: admitted.removeStepWithin,
      },
      commands,
      opts.organizations,
      opts.writes,
    ),
    ...directoryRoutes(opts.directory, opts.organizations),
    // One per mounted app, so its memo lives as long as the process serving it.
    ...personLoadRoutes(
      new PersonLoad({
        projects: opts.projects,
        workItems: opts.workItems,
        directory: opts.directory,
      }),
      opts.organizations,
    ),
    ...historyRoutes(opts.history, opts.projects, opts.organizations),
    ...solutionRoutes(opts.projects, opts.organizations),
    // Proof: omitting this spread made the production import reachability test receive 404.
    ...importRoutes(opts.writes.imports, opts.organizations),
    ...projectRoutes(
      {
        authorizeRetry: (...args) => opts.projects.authorizeRetry(...args),
        createWithin: (...args) => opts.projects.createWithin(...args),
        listWithin: (...args) => opts.projects.listWithin(...args),
        openWithin: (...args) => opts.projects.openWithin(...args),
        readWithin: (...args) => opts.projects.readWithin(...args),
        updateWithin: admitted.updateProjectWithin,
      },
      opts.organizations,
      opts.workItems,
      opts.directory,
      opts.calendarMarkers,
      opts.clock,
      opts.optimizer,
    ),
    ...workItemRoutes(opts.workItems, commands, nodeDigest, opts.organizations),
    ...calendarMarkerRoutes(opts.calendarMarkers, opts.organizations, opts.writes),
    ...spaceRoutes(
      new SpaceResource({
        spaces: opts.spaces,
        projects: opts.projects,
        clock: spaceClock,
        trees: opts.workItems,
        sequences: opts.writes.announcements,
        rollUpCache,
      }),
      opts.organizations,
    ),
    ...savedPlanRoutes(
      opts.savedPlans,
      opts.projects,
      opts.writes.announcements,
      opts.organizations,
    ),
    ...internalRoutes({
      // A deliberate pure ack: every mutation is an HTTP call to be-01, so a
      // client socket message has no write authority.
      onForward: () => Promise.resolve({ push_responses: [] }),
      onResume: (points) => opts.replay.replay(points),
    }),
    ...gatewayAccessRoutes(opts.projects, opts.organizations),
  ] as const;
}

export function buildApp(opts: AppOptions, makeLogger: typeof createLogger = createLogger) {
  const secrets = [opts.internalAuthSecret];
  // Proof: on 2026-09-21, omitting `secrets` made “reports one redacted unexpected
  // production failure with its shared occurrence” receive undefined instead of the secret array.
  const logger = makeLogger({ service: 'be-01', version: opts.version, secrets });
  // Proof: on 2026-09-21, passing `[]` made “reports one redacted unexpected production
  // failure with its shared occurrence” emit an operator line containing the production secret.
  const reportUnexpectedFailure = createUnexpectedFailureReporter(logger, secrets);
  // The OIDC callback binding reports provider refusals, and it names no
  // framework, so it cannot reach the decorated `logger` above and is handed
  // it here instead of at every call site that builds `OidcRouteOptions`
  // (TASK-273). A caller that supplied its own wins — that is how a test
  // asserts on what a refused login writes down without a pino destination.
  const routedOptions: AppOptions =
    opts.oidc === undefined
      ? opts
      : {
          ...opts,
          oidc: { logger, ...opts.oidc },
          // Spreading `opts` snapshots accessors. Keep readiness live so the
          // health endpoint observes boot's post-migration state transition.
          get migrationsApplied() {
            return opts.migrationsApplied;
          },
        };
  const endpoints: readonly BoundEndpoint[] = mountedEndpoints(routedOptions, {
    logger,
    scrapeMetrics: opts.metricsScrape ?? (() => scrapeMetrics('be-01')),
  });

  return (
    new Elysia()
      .decorate('logger', logger)
      // The document comes from this configuration's mounted endpoint table, so
      // local auth does not advertise the four conditional OIDC operations.
      .use(openApiPlugin(endpoints.map(({ shape }) => shape)))
      .use(
        // Proof: mounting an empty table made “reaches every local path and method”
        // report postApiAuthRegister equal to the 404/NOT_FOUND router miss.
        mountEndpoints(endpoints, {
          appOrigin: opts.appOrigin,
          resolveIdentity: identityResolver(
            opts.auth,
            opts.internalAuthSecret,
            opts.delegation ?? REFUSE_DELEGATIONS,
          ),
          // Proof: on 2026-09-21, replacing this production callback with a no-op made
          // “reports one redacted unexpected production failure with its shared occurrence” receive
          // zero logger calls instead of one.
          reportUnexpectedFailure,
        }),
      )
  );
}
