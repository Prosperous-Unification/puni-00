import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DeliveryReader } from '@shared/delivery';
import {
  buildOidcVerifier,
  type IssuerFetch,
  type KeySetFailureReport,
  oidcCredentialEvidence,
  type TokenVerifier,
  trustedIssuerDiscovery,
  TrustedIssuerKeySets,
} from '@wbs/auth';
import type { AuthenticatedUser } from '@wbs/contracts';
import type { DependencyRuntimeCapability } from '@wbs/contracts/dependency-runtime';
import {
  type CapacityModeSwitch,
  clockOf,
  CREATOR_ADMISSION,
  type DomainResolver,
  type EmailMessage,
  type PasswordHasher,
  type ProjectRankStore,
} from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import type { RecoveryWriteBoundary } from '@wbs/core/http/recovery-write';
import { CalendarMarkerService } from '@wbs/core/module/calendar-marker/calendar-marker.resource';
import { DirectoryService } from '@wbs/core/module/directory/directory.resource';
import type { ClaimLeaseSweep } from '@wbs/core/module/plan-commands/claim-lease-sweep';
import { createAdmittedWrites } from '@wbs/core/module/plan-commands/composition';
import type { PlanCommandRunner } from '@wbs/core/module/plan-commands/plan-commands.feature';
import { createImportService } from '@wbs/core/module/plan-import/composition';
import type { ImportService } from '@wbs/core/module/plan-import/plan-import.feature';
import { ProjectService } from '@wbs/core/module/project/project.resource';
import { StepService } from '@wbs/core/module/step/step.resource';
import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import { INACTIVE_EXTERNAL_DEPENDENCIES } from '@wbs/core/ports/external-dependency-authoring';
import type { CapturedFanout } from '@wbs/core/ports/fanout-capture-store';
import type { SavedPlanCaptureStore } from '@wbs/core/ports/saved-plan-capture-store';
import type { UnitOfWork } from '@wbs/core/ports/unit-of-work';
import { AuthService } from '@wbs/core/service/auth.service';
import type { DeliveryGateLimits } from '@wbs/core/service/delivery-gate';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { ProjectAddressSearch } from '@wbs/core/service/project-address-search';
import type { CapacityMode } from '@wbs/domain';
import { createLogger } from '@wbs/observability';
import { SqliteResourceRuntime } from '@wbs/store-sqlite';
import { SqliteResourceUses } from '@wbs/store-sqlite';
import {
  computeProvidersOver,
  currentMembershipAccess,
  DomainClaimRepository,
  EmailVerificationRepository,
  EnterpriseConnectionRepository,
  ExternalIdentityRepository,
  InvitationRepository,
  JoinRequestRepository,
  MachineCredentialAdministrationRepository,
  MachineCredentialRepository,
  MachineTokenAuditRepository,
  OnboardingRepository,
  openSqliteSource,
  OrganizationLimitGaugeRepository,
  OrganizationLimitsRepository,
  OrganizationRepository,
  ProjectRankRepository,
  ProvisioningTokenRepository,
  readOrganizationActivation,
  scheduleInputHash,
  ScimUserRepository,
  SessionPolicyRepository,
  SharedPeopleRestoreApprovalRepository,
  SpaceRepository,
  SqliteBrowserCredentialRevocations,
  SqliteCommandAccess,
  SqliteDelegationUse,
  SqliteOrganizationAccess,
  SqliteOrganizationSelection,
  type SqliteSource,
  TrustedIssuerAdministrationRepository,
  userBoundOrganizationOf,
} from '@wbs/store-sqlite';
import { canonicalOidcEmail } from '@wbs/store-sqlite/canonical-oidc-email';
import type { CaptureReadSeam } from '@wbs/store-sqlite/capture-read-seam';
import { ClaimRepository } from '@wbs/store-sqlite/claim';
import type { Connection } from '@wbs/store-sqlite/db';
import { openReadOnlyConnection as openAddressConnection } from '@wbs/store-sqlite/db';
import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { MeasureEstimateRepository } from '@wbs/store-sqlite/measure-estimate';
import { PlanEventRepository } from '@wbs/store-sqlite/plan-event';
import { ProjectAddressSearchRepository } from '@wbs/store-sqlite/project-address-search';
import { DemandRepository, ResourceCapacityRepository } from '@wbs/store-sqlite/resource';
import { openSqliteSourceWithCaptureReadSeam } from '@wbs/store-sqlite/source';
import { StepBlockageRepository } from '@wbs/store-sqlite/step-blockage';
import { StepNodeAttemptRepository } from '@wbs/store-sqlite/step-node-attempt';
import { StepParallelRepository } from '@wbs/store-sqlite/step-parallel';
import { CAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from '@wbs/store-sqlite/testing/dependency-capability';
import { TypedDependencyRepository } from '@wbs/store-sqlite/typed-dependency';
import { WorkItemBudgetRepository } from '@wbs/store-sqlite/work-item-budget';

import { type AppOptions, buildApp } from '../app';
import type { ReservedSpawner } from '../module/optimization/contract';
import type { OptimizationCoordinator } from '../module/optimization/optimization.feature';
import { ActualRepository } from '../repository/actual';
import { CalendarMarkerRepository } from '../repository/calendar-marker';
import { CommandJournalRepository } from '../repository/command-journal';
import { openDatabase, openDrizzle } from '../repository/db';
import { DependencyRepository } from '../repository/dependency';
import { DirectoryRepository } from '../repository/directory';
import { EstimateRepository } from '../repository/estimate';
import { OPEN, WriteCoordinator } from '../repository/gate';
import { runMigrations } from '../repository/migrate';
import { ProjectRepository } from '../repository/project';
import { StepRepository } from '../repository/step';
import { StepMeasureRepository } from '../repository/step-measure';
import { StepProgressRepository } from '../repository/step-progress';
import { UserRepository } from '../repository/user';
import { SubtreeRepository, WorkItemRepository } from '../repository/work-item';
import { bearerContextIssuer, nativeCredentialSource } from '../runtime/bearer-context';
import { nodeDigest } from '../runtime/bun-runtime';
import { joseTokenCodec } from '../runtime/bun-runtime';
import { delegationVerifier } from '../runtime/delegation';
import { delegationIssuer } from '../runtime/delegation-issuer';
import { runDomainProofWorker } from '../runtime/domain-proof-worker';
import { type MachineGrantKeys, machineGrantVerifier } from '../runtime/machine-grant';
import { machineGrantAuthority } from '../runtime/machine-grant-authority';
import { organizationCookieBinding } from '../runtime/organization-cookie';
import { organizationCredentialEvidence } from '../runtime/organization-credential';
import { organizationSelection } from '../runtime/organization-selection';
import { fastScheduler } from '../service/optimizer-wiring';
import { buildServices } from '../services';
import { TEST_JWT_KEY } from './auth-fixture';
import { recordingBroadcaster } from './broadcast-fixture';
import { inMemoryCapacity, testCapacityService } from './capacity-fixture';
import { testClock } from './clock-fixture';
import { sqliteDependencyContext } from './dependency-graph-fixture';
import type { FakeOidcProvider } from './fake-oidc-provider';
import { testHistoryService } from './history-fixture';
import { testLoginThrottle } from './login-throttle-fixture';
import { TEST_MCP_AUTHORIZATION_SERVER } from './machine-grant-fixture';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from './organization-limits-fixture';
import { inMemoryPriorityBands, testPriorityBandService } from './priority-band-fixture';
import { testReplay } from './replay-fixture';
import { testSavedPlanService } from './saved-plan-fixture';
import { testWrites } from './writes-fixture';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

/**
 * A deterministic, non-cryptographic stand-in for `Bun.password` in {@link OrganizationHarness.open}.
 * No harness test proves anything about argon2id, and each real hash cost 1 to 2 s of a loaded
 * host's CPU inside `beforeEach`: three registrations in the invitation suite's hook overran
 * be-01's 10 s budget. {@link OrganizationHarness.openComposed} keeps the real hasher.
 */
const fastPasswordHasher: PasswordHasher = {
  hash: (password) => Promise.resolve(`test-hash:${password}`),
  verify: (password, hash) => Promise.resolve(hash === `test-hash:${password}`),
};

/** One answered request: its status and its parsed body (text when not JSON, null for 204). */
export interface Answer {
  status: number;
  body: unknown;
}

/** What {@link OrganizationHarness.open} wires beyond its defaults. */
export interface OrganizationHarnessOptions {
  readonly admitDependencyClient?: AppOptions['admitDependencyClient'];
  readonly delegationKey?: CryptoKey;
  readonly directSigningKey?: CryptoKey;
  readonly policyDirectory?: string;
  readonly resolver?: DomainResolver;
  readonly sessionBinding?: boolean;
  /**
   * Mounts the browser OIDC routes over this fake provider, with password
   * sign-in and registration still on; excludes `upstreamCredential`.
   */
  readonly provider?: FakeOidcProvider;
  readonly upstreamCredential?: {
    readonly verifier: TokenVerifier;
    readonly groupPrefix: string;
    readonly groupsClaim: string;
  };
  /**
   * The clock the credential rules and SCIM provisioning read; a test fixes it
   * to pin session-policy edges, token lifetimes and SCIM admission.
   */
  readonly now?: () => number;
}

interface TestMail {
  purposes: Map<string, EmailMessage['purpose']>;
  tokens: Map<string, string>;
  fail: boolean;
  beforeDelivery?: () => void | Promise<void>;
}

/**
 * be-01 over real SQLite with the production {@link SqliteOrganizationAccess},
 * for the organization boundary suites (tasks 3.x).
 *
 * Unless `sessionBinding` selects the production cookie binding, {@link bind}
 * stands in for it: it names a user's active organization. Everything behind
 * it — the marker read, the membership lookup, the scoped queries and the role
 * policy — is production code. Production binds `NO_BOUND_ORGANIZATION` when
 * `BROWSER_SESSION_AUTHORITY=disabled` (`boot.db.test.ts`) and the cookie
 * binding when enabled (`boot-browser-session.db.test.ts`).
 */
export class OrganizationHarness {
  private appOrigin = 'http://localhost';
  private readonly tokens = new Map<string, string>();
  private readonly ids = new Map<string, string>();
  /**
   * Set when the browser OIDC routes are mounted: registration then needs an
   * edge client address and answers its session as the access cookie.
   */
  private federated = false;

  private constructor(
    private readonly dir: string,
    readonly app: ReturnType<typeof buildApp>,
    /** A raw connection the app does not hold, as a second process would. */
    readonly sqlite: ReturnType<typeof openDatabase>,
    private readonly bound: Map<string, string>,
    private readonly domains: DomainClaimRepository,
    private readonly mail?: TestMail,
    private readonly retryHash?: (projectId: string) => Promise<string>,
    private readonly retryDecision?: (
      projectId: string,
      organizationId: string,
      actorId: string,
      inputHash: string,
    ) => Promise<string>,
    private readonly inputChanged?: (projectId: string) => void,
    private readonly startOptimizer?: () => void,
    private readonly bareRemoveStep?: ReturnType<typeof createAdmittedWrites>['removeStepWithin'],
    private readonly composedGate?: WriteCoordinator,
    private readonly standaloneDirectory?: DirectoryService,
    private readonly composedUow?: UnitOfWork,
    private readonly optimizerCoordinator?: OptimizationCoordinator,
    private readonly savedPlanCapture?: SavedPlanCaptureStore,
    private readonly composedSource?: SqliteSource,
    private readonly composedCommands?: PlanCommandRunner,
    private readonly commandPrincipal?: (
      token: string,
      cookie: string,
    ) => Promise<AuthenticatedUser>,
    private readonly composedWrites?: RecoveryWriteBoundary,
    private readonly composedImports?: ImportService,
    private readonly syntheticTransferImporter?: ImportService,
    private readonly composedClaimLeases?: ClaimLeaseSweep,
  ) {}

  /**
   * The composed claim lease sweep (`wbs-claim-leases` L7), unstarted: boot
   * starts it in production; a test starts it to watch a revoke's tick.
   */
  claimLeaseSweep(): ClaimLeaseSweep {
    if (this.composedClaimLeases === undefined) throw new Error('composed claim leases are absent');
    return this.composedClaimLeases;
  }

  /** Exercises an already-admitted runtime actor against the same database and gate as HTTP ingestion. */
  resourceRuntime(): SqliteResourceRuntime {
    if (this.composedSource === undefined || this.composedGate === undefined)
      throw new Error('composed resource runtime is absent');
    return new SqliteResourceRuntime(this.composedSource.db, this.composedGate);
  }

  /** Drains async optimizer work and closes both SQLite connections in order. */
  async closeComposed(): Promise<void> {
    await this.composedClaimLeases?.stop();
    await this.optimizerCoordinator?.stop();
    await this.composedSource?.close();
    this.close();
  }

  /** Stops the composed app and closes both connections, leaving its exact database for host recovery. Caller owns directory cleanup. */
  async stopForRecovery(): Promise<string> {
    await this.composedClaimLeases?.stop();
    await this.optimizerCoordinator?.stop();
    await this.composedSource?.close();
    this.sqlite.close();
    return this.databasePath();
  }

  /** Reads one coherent source input for a selected-ready mounted fixture. */
  capturePlanInput(projectId: string) {
    if (this.savedPlanCapture === undefined) throw new Error('saved-plan capture is absent');
    return this.savedPlanCapture.readPlanInput(projectId);
  }

  /** Waits for composed edit admission before closing a selected-ready fixture. */
  async drainOptimization(): Promise<void> {
    await this.optimizerCoordinator?.drain();
  }

  /** The installed process reader, for a command graph live-admission tripwire. */
  publicOptimizer(): OptimizationCoordinator {
    if (this.optimizerCoordinator === undefined) throw new Error('composed optimizer is absent');
    return this.optimizerCoordinator;
  }

  /** Takes an earlier captured observation for a watched stale-preflight fault. */
  captureFanout(organizationId: string): Promise<CapturedFanout> {
    if (this.composedUow === undefined) throw new Error('composed UoW is absent');
    return this.composedUow.run(async (scope) => {
      if (scope.fanoutCapture === undefined) throw new Error('borrowed capture is absent');
      return { commit: false, value: await scope.fanoutCapture.capture(organizationId) };
    });
  }

  /** Exercises the composed public directory service without a command owner. */
  removeStandaloneDirectoryWithin(...args: Parameters<DirectoryService['removeWithin']>) {
    if (this.standaloneDirectory === undefined)
      throw new Error('composed standalone directory service is absent');
    return this.standaloneDirectory.removeWithin(...args);
  }

  /** Public composed directory graph for standalone service/DB boundary proofs. */
  publicDirectoryService(): DirectoryService {
    if (this.standaloneDirectory === undefined)
      throw new Error('composed standalone directory service is absent');
    return this.standaloneDirectory;
  }

  /** Holds the composed source's write turn until the test releases it. */
  holdWriteTurn(until: Promise<void>, entered: () => void): Promise<void> {
    if (this.composedGate === undefined) throw new Error('composed write gate is absent');
    return this.composedGate.enter(() => {
      entered();
      return until;
    });
  }

  /** Exercises the installed bare NO_ADMISSION graph, distinct from scoped recovery routing. */
  removeBareStep(...args: Parameters<ReturnType<typeof createAdmittedWrites>['removeStepWithin']>) {
    if (this.bareRemoveStep === undefined) throw new Error('composed bare step removal is absent');
    return this.bareRemoveStep(...args);
  }

  /** Original authenticated request evidence for direct runner boundary tests. */
  authenticatedCommandPrincipal(username: string, cookie: string): Promise<AuthenticatedUser> {
    if (this.commandPrincipal === undefined)
      throw new Error('composed command principal fixture is absent');
    return this.commandPrincipal(this.token(username), cookie);
  }

  /** Verifies a machine key before a direct runner test queues its retained principal. */
  authenticatedMachinePrincipal(key: string): Promise<AuthenticatedUser> {
    if (this.commandPrincipal === undefined)
      throw new Error('composed command principal fixture is absent');
    return this.commandPrincipal(key, '');
  }

  /** The actual core runner installed beside the mounted HTTP runner. */
  publicCommands(): PlanCommandRunner {
    if (this.composedCommands === undefined) throw new Error('composed commands are absent');
    return this.composedCommands;
  }

  /** The actual import service installed beside the mounted HTTP route. */
  publicImports(): ImportService {
    if (this.composedImports === undefined) throw new Error('composed imports are absent');
    return this.composedImports;
  }

  /**
   * Test-only active import over the same process SQLite writer and current authority.
   * Synthetic storage authority is seeded by the fixture. This proves transactional
   * transfer semantics, never runtime activation or mounted external import support.
   */
  syntheticImports(): ImportService {
    if (this.syntheticTransferImporter === undefined)
      throw new Error('synthetic transfer imports are absent');
    return this.syntheticTransferImporter;
  }

  /** Actual process writer boundary for direct admission integration tests. */
  publicWrites(): RecoveryWriteBoundary {
    if (this.composedWrites === undefined) throw new Error('composed write boundary is absent');
    return this.composedWrites;
  }

  /** Runs the composed background edit admission in integration tests. */
  triggerOptimization(projectId: string): void {
    if (this.inputChanged === undefined) throw new Error('composed optimizer is absent');
    this.inputChanged(projectId);
  }

  /** Starts the composed restart pump in integration tests. */
  startOptimization(): void {
    if (this.startOptimizer === undefined) throw new Error('composed optimizer is absent');
    this.startOptimizer();
  }

  /** Runs one injected worker pass against this harness's SQLite claim store. */
  checkDomains(
    at: number,
    now: () => number = () => at,
  ): Promise<{ checked: number; stale: number }> {
    return runDomainProofWorker(this.domains, at, now);
  }

  /** Exercises the claim-side status check consumed by join approval in task 4.5. */
  isVerifiedDomain(organizationId: string, domain: string): Promise<boolean> {
    return this.domains.isVerifiedDomain(organizationId, domain);
  }

  /** Calls the production rotation transaction directly to prove its marker guard. */
  rotateDomainClaim(organizationId: string, actorId: string, claimId: string) {
    return this.domains.rotateClaim(organizationId, actorId, claimId, '0'.repeat(64), {
      at: Date.now(),
      by: actorId,
    });
  }

  /** Calls the production release transaction directly to prove its marker guard. */
  releaseDomainClaim(organizationId: string, actorId: string, claimId: string) {
    return this.domains.releaseClaim(organizationId, actorId, claimId);
  }

  /**
   * `delegationKey`, when given, is the RS256 public key the app verifies
   * delegation tokens with (task 2.5); upstream identities resolve through the
   * real `external_identity` mapping. `directSigningKey` replaces the shared
   * session key so direct sessions cannot be minted with it; `policyDirectory`
   * points domain claims at a copied public-email policy, and `resolver` answers
   * their TXT lookups.
   */
  static open({
    admitDependencyClient = () => null,
    delegationKey,
    directSigningKey,
    policyDirectory,
    resolver,
    sessionBinding,
    provider,
    upstreamCredential,
    now = Date.now,
  }: OrganizationHarnessOptions = {}): OrganizationHarness {
    if (provider !== undefined && upstreamCredential !== undefined)
      throw new Error('a harness takes a fake provider or an upstream credential, not both');
    const dir = mkdtempSync(join(tmpdir(), 'wbs-organization-'));
    const path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const db = openDrizzle(path);
    const gate = new WriteCoordinator();
    const domains = new DomainClaimRepository(db, gate, policyDirectory, resolver);
    const bound = new Map<string, string>();
    const sessionKey =
      directSigningKey === undefined ? TEST_JWT_KEY : crypto.randomUUID() + crypto.randomUUID();
    const selection =
      sessionBinding === true
        ? organizationSelection(
            new SqliteOrganizationSelection(db),
            organizationCookieBinding(sessionKey),
            new SqliteBrowserCredentialRevocations(db, gate),
            (principal, organizationId) => organizations.admitTo(principal, organizationId),
          )
        : undefined;
    const organizations: SqliteOrganizationAccess = new SqliteOrganizationAccess(
      db,
      selection?.activeOrganizationOf ??
        userBoundOrganizationOf((userId) => Promise.resolve(bound.get(userId) ?? null)),
      now,
    );
    const users = new UserRepository(db, OPEN);
    const auth = new AuthService({
      clock: testClock,
      users,
      identities: users,
      enterprise: new EnterpriseConnectionRepository(db, gate),
      machineKeys: { credentials: new MachineCredentialRepository(db, gate), now },
      tokens: joseTokenCodec(sessionKey),
      passwords: fastPasswordHasher,
      ...(upstreamCredential === undefined
        ? {}
        : {
            oidc: buildOidcVerifier(upstreamCredential.verifier, upstreamCredential),
            passwordSessions: true,
          }),
      ...(provider === undefined
        ? {}
        : {
            oidc: buildOidcVerifier(provider.verifier, {
              groupPrefix: 'dev',
              groupsClaim: 'wbs_groups',
            }),
            passwordSessions: true,
          }),
    });
    const projects = new ProjectRepository(db, OPEN);
    const directoryStore = new DirectoryRepository(db, OPEN);
    const writing = {
      stepParallels: new StepParallelRepository(db, OPEN),
      directory: new DirectoryService({
        clock: testClock,
        directory: directoryStore,
        broadcast: recordingBroadcaster(),
        organizationLimits: new OrganizationLimitGaugeRepository(
          db,
          TEST_ORGANIZATION_DEFAULT_LIMITS,
        ),
      }),
      capacity: testCapacityService(),
      priorityBands: testPriorityBandService(),
      calendarMarkers: new CalendarMarkerService({
        projects,
        markers: new CalendarMarkerRepository(db, OPEN),
        clock: testClock,
      }),
      projects: new ProjectService({
        dependencyContext: sqliteDependencyContext(db, projects),
        clock: testClock,
        projects,
        broadcast: recordingBroadcaster(),
      }),
      steps: new StepService({
        dependencyContext: sqliteDependencyContext(db, projects),
        clock: testClock,
        projects,
        steps: new StepRepository(db, OPEN),
        broadcast: recordingBroadcaster(),
      }),
      workItems: new WorkItemService({
        dependencyContext: createLocalDependencyContext({
          projects: projects,
          workItems: new WorkItemRepository(db, OPEN),
          estimates: new EstimateRepository(db, OPEN),
          dependencies: new DependencyRepository(db, OPEN),
          typedDependencies: new TypedDependencyRepository(db, OPEN),
        }),
        externalDependencyAuthoring: INACTIVE_EXTERNAL_DEPENDENCIES,
        admission: CREATOR_ADMISSION,
        scheduler: fastScheduler,
        clock: testClock,
        workItems: new WorkItemRepository(db, OPEN),
        projects,
        estimates: new EstimateRepository(db, OPEN),
        actuals: new ActualRepository(db, OPEN),
        measures: new StepMeasureRepository(db, OPEN),
        measureEstimates: new MeasureEstimateRepository(db, OPEN),
        budgets: new WorkItemBudgetRepository(db, OPEN),
        progress: new StepProgressRepository(db, OPEN),
        attempts: new StepNodeAttemptRepository(db, OPEN),
        blockages: new StepBlockageRepository(db, OPEN),
        // The claims read observes committed state on a read-only connection
        // of its own, as openSqliteSource's public catalogs do. This copy of the
        // binding has no negative of its own: no harness test opens a batch
        // beside a read. The source's binding is proven in
        // claim-observation.db.test.ts.
        claims: new ClaimRepository(db, OPEN, {
          openConnection: () => openReadOnlyConnection(path),
        }),
        demands: new DemandRepository(db, OPEN),
        resourceCapacity: new ResourceCapacityRepository(db, OPEN),
        stepParallels: new StepParallelRepository(db, OPEN),
        dependencies: new DependencyRepository(db, OPEN),
        typedDependencies: new TypedDependencyRepository(db, OPEN),
        directory: directoryStore,
        capacity: inMemoryCapacity(),
        priorityBands: inMemoryPriorityBands(),
        subtrees: new SubtreeRepository(db, OPEN),
        journal: new CommandJournalRepository(db, OPEN),
        planEvents: new PlanEventRepository(db, OPEN),
        broadcast: recordingBroadcaster(),
      }),
    };
    const mail: TestMail = { tokens: new Map<string, string>(), purposes: new Map(), fail: false };
    const app = buildApp({
      projectAddressSearch: new ProjectAddressSearch(
        new ProjectAddressSearchRepository({
          openConnection: () => openAddressConnection(path),
          activeOrganizationOf: (snapshot) =>
            selection === undefined
              ? userBoundOrganizationOf((userId) => Promise.resolve(bound.get(userId) ?? null))
              : organizationSelection(
                  new SqliteOrganizationSelection(snapshot),
                  organizationCookieBinding(sessionKey),
                  new SqliteBrowserCredentialRevocations(snapshot, OPEN),
                  (principal, organizationId) =>
                    new SqliteOrganizationAccess(
                      snapshot,
                      selection.activeOrganizationOf,
                      now,
                    ).admitTo(principal, organizationId),
                ).activeOrganizationOf,
          now,
        }),
        nodeDigest,
      ),
      loginThrottle: testLoginThrottle(),
      clock: testClock,
      appOrigin: 'http://localhost',
      ...(provider === undefined ? {} : { oidc: provider.routeOptions('http://localhost') }),
      savedPlans: testSavedPlanService(),
      ...writing,
      organizations,
      ...(selection === undefined
        ? {}
        : {
            organizationSelection: selection.endpoints,
            credentialEvidence: organizationCredentialEvidence(
              auth,
              sessionKey,
              upstreamCredential === undefined
                ? undefined
                : oidcCredentialEvidence(upstreamCredential.verifier, upstreamCredential),
            ),
          }),
      memberships: new OrganizationRepository(db, OPEN),
      sharedPeopleRestoreApprovals: new SharedPeopleRestoreApprovalRepository(db, OPEN),
      domains,
      sessionPolicies: new SessionPolicyRepository(db, gate),
      organizationLimits: new OrganizationLimitsRepository(db, TEST_ORGANIZATION_DEFAULT_LIMITS),
      pendingMemberships: new ScimUserRepository(db, gate),
      enterpriseConnections: new EnterpriseConnectionRepository(db, gate),
      provisioning: {
        tokens: new ProvisioningTokenRepository(db, gate),
        users: new ScimUserRepository(db, gate),
        clock: { now },
        canonicalUserName: (raw) => canonicalOidcEmail(raw),
      },
      machineCredentials: new MachineCredentialAdministrationRepository(db, gate),
      mcpAuthorizationServer: TEST_MCP_AUTHORIZATION_SERVER,
      computeProviders: computeProvidersOver(db, gate),
      resourceUses: new SqliteResourceUses(db, gate),
      resourceRuntime: new SqliteResourceRuntime(db, gate),
      onboarding: new OnboardingRepository(db, OPEN),
      emailVerification: new EmailVerificationRepository(db, OPEN),
      invitations: new InvitationRepository(db, OPEN),
      joinRequests: new JoinRequestRepository(db, OPEN),
      spaces: new SpaceRepository(db, OPEN),
      projectRanks: uncomposedRanks(new ProjectRankRepository(db, OPEN)),
      emailDelivery: {
        deliver: async (message) => {
          await mail.beforeDelivery?.();
          if (mail.fail) return Promise.reject(new Error('injected mail sink failure'));
          mail.tokens.set(message.recipient, message.token);
          mail.purposes.set(message.recipient, message.purpose);
          return Promise.resolve();
        },
      },
      ...(delegationKey === undefined
        ? {}
        : {
            delegation: delegationVerifier(
              delegationKey,
              async (pair) => {
                const userId = await new ExternalIdentityRepository(db, OPEN).findUserId(pair);
                if (userId === null) return null;
                return new UserRepository(db, OPEN).findById(userId);
              },
              (issuer, jti, expiresAt, now) =>
                new SqliteDelegationUse(db, gate).consume(issuer, jti, expiresAt, now),
              Date.now,
              (userId) => new UserRepository(db, OPEN).findById(userId),
            ),
          }),
      ...(directSigningKey === undefined
        ? {}
        : {
            bearerContext: bearerContextIssuer(
              nativeCredentialSource(auth, sessionKey),
              organizations,
              delegationIssuer(
                directSigningKey,
                nativeCredentialSource(auth, sessionKey),
                // Membership only: the credential rules already ran for this
                // source in `bearerContextIssuer`'s resolution.
                (userId, organizationId) =>
                  Promise.resolve(currentMembershipAccess(db, organizationId, userId).ok),
              ),
              () => readOrganizationActivation(db),
            ),
          }),
      history: testHistoryService(),
      auth,
      replay: testReplay().replay,
      admitDependencyClient,
      probeDatabase: () => 'ok',
      internalAuthSecret: 'x'.repeat(32),
      writes: testWrites(undefined, writing),
      migrationsApplied: true,
    });
    const harness = new OrganizationHarness(dir, app, openDatabase(path), bound, domains, mail);
    harness.federated = provider !== undefined;
    return harness;
  }

  /**
   * The same boundary over be-01's production service composition: real
   * SQLite units of work under the command runner, so a refused batch is
   * rolled back exactly as in production. The command suites need this; the
   * fixtures {@link open} wires cannot roll a batch back.
   */
  static openComposed(
    withOptimizer = false,
    afterResolve?: () => void,
    spawn?: ReservedSpawner,
    solverVersion?: string,
    openReadOnlyConnection?: (dbPath: string) => Connection,
    pushFetch?: Parameters<typeof buildServices>[0]['pushFetch'],
    onFanoutCapture?: (organizationId: string) => unknown,
    onCapturedFanout?: (captured: CapturedFanout) => void,
    onBorrowedUnitOfWork?: () => void,
  ): OrganizationHarness {
    return OrganizationHarness.openComposedWith({
      withOptimizer,
      ...(afterResolve === undefined ? {} : { afterResolve }),
      ...(spawn === undefined ? {} : { spawn }),
      ...(solverVersion === undefined ? {} : { solverVersion }),
      ...(openReadOnlyConnection === undefined ? {} : { openReadOnlyConnection }),
      ...(pushFetch === undefined ? {} : { pushFetch }),
      ...(onFanoutCapture === undefined ? {} : { onFanoutCapture }),
      ...(onCapturedFanout === undefined ? {} : { onCapturedFanout }),
      ...(onBorrowedUnitOfWork === undefined ? {} : { onBorrowedUnitOfWork }),
    });
  }

  /**
   * {@link openComposed} with named options; new callers use this rather than
   * extending the positional list.
   */
  static openComposedWith({
    dependencyCapability = CAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    admitDependencyClient = () => null,
    appOrigin = 'http://localhost',
    now,
    withOptimizer = false,
    syntheticTransferImports,
    syntheticExternalCommands,
    delivery,
    deliveryLimits,
    afterResolve,
    spawn = () => new Promise<never>(() => undefined),
    solverVersion = '0.1.0',
    openReadOnlyConnection,
    captureRead,
    pushFetch = () => Promise.resolve(Response.json({ delivered_to_sockets: 0 })),
    internalAuthSecret,
    onFanoutCapture,
    onCapturedFanout,
    onBorrowedUnitOfWork,
    supportedCapacityModes,
    sessionBinding,
    provider,
    upstreamCredential,
    trustedIssuers,
    machineGrants,
    delegationKey,
    migrate = (path) => {
      runMigrations(path, FOLDER);
    },
  }: ComposedHarnessOptions): OrganizationHarness {
    if (provider !== undefined && upstreamCredential !== undefined)
      throw new Error('a harness takes a fake provider or an upstream credential, not both');
    const dir = mkdtempSync(join(tmpdir(), 'wbs-organization-'));
    const path = join(dir, 'test.db');
    migrate(path);
    const source = (
      captureRead === undefined
        ? openSqliteSource
        : (options: Parameters<typeof openSqliteSource>[0]) =>
            openSqliteSourceWithCaptureReadSeam(options, captureRead)
    )({
      dependencyCapability,
      dbPath: path,
      organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
      openReadOnlyConnection,
      onFanoutCapture,
      onCapturedFanout,
      onBorrowedUnitOfWork,
    });
    const bound = new Map<string, string>();
    const clock = clockOf({ now: now ?? (() => Date.now()), newId: () => crypto.randomUUID() });
    const selection =
      sessionBinding === true
        ? organizationSelection(
            new SqliteOrganizationSelection(source.db),
            organizationCookieBinding(TEST_JWT_KEY, () => clock.now()),
            new SqliteBrowserCredentialRevocations(source.db, source.gate),
            (principal, organizationId) => organizationAccess.admitTo(principal, organizationId),
          )
        : undefined;
    const organizationAccess: SqliteOrganizationAccess = new SqliteOrganizationAccess(
      source.db,
      selection?.activeOrganizationOf ??
        userBoundOrganizationOf((userId) => Promise.resolve(bound.get(userId) ?? null)),
      () => clock.now(),
    );
    const commandAccess = new SqliteCommandAccess(
      source.db,
      organizationAccess,
      new MachineCredentialRepository(source.db, source.gate),
    );
    const services = buildServices({
      source,
      clock,
      commandAccess,
      logger: createLogger({ service: 'be-01' }),
      jwtKey: TEST_JWT_KEY,
      gwUrl: 'http://gw.invalid',
      internalAuthSecret: internalAuthSecret ?? 's'.repeat(32),
      pushFetch,
      ...(now === undefined ? {} : { now }),
      ...(trustedIssuers === undefined
        ? {}
        : {
            trustedIssuers: {
              tokens: new TrustedIssuerKeySets({
                fetch: trustedIssuers.fetch,
                report: trustedIssuers.report ?? (() => undefined),
                ...(trustedIssuers.cooldownMs === undefined
                  ? {}
                  : { cooldownMs: trustedIssuers.cooldownMs }),
              }),
              configuredIssuer: () => Promise.resolve(trustedIssuers.configuredIssuer),
            },
          }),
      ...(provider === undefined
        ? {}
        : {
            oidc: buildOidcVerifier(provider.verifier, {
              groupPrefix: 'dev',
              groupsClaim: 'wbs_groups',
            }),
            passwordSessions: true,
          }),
      ...(upstreamCredential === undefined
        ? {}
        : {
            oidc: buildOidcVerifier(upstreamCredential.verifier, upstreamCredential),
            passwordSessions: true,
          }),
      ...(withOptimizer
        ? {
            optimizer: {
              solverVersion,
              budgetMs: 60_000,
              spawn,
            },
          }
        : {}),
    });
    const app = buildApp({
      projectAddressSearch: new ProjectAddressSearch(
        new ProjectAddressSearchRepository({
          openConnection: () => (openReadOnlyConnection ?? openAddressConnection)(path),
          activeOrganizationOf: (snapshot) =>
            selection === undefined
              ? userBoundOrganizationOf((userId) => Promise.resolve(bound.get(userId) ?? null))
              : organizationSelection(
                  new SqliteOrganizationSelection(snapshot),
                  organizationCookieBinding(TEST_JWT_KEY),
                  new SqliteBrowserCredentialRevocations(snapshot, OPEN),
                  (principal, organizationId) =>
                    new SqliteOrganizationAccess(snapshot, selection.activeOrganizationOf, () =>
                      services.clock.now(),
                    ).admitTo(principal, organizationId),
                ).activeOrganizationOf,
          now: () => services.clock.now(),
        }),
        nodeDigest,
      ),
      appOrigin,
      ...(delivery === undefined ? {} : { delivery }),
      ...(deliveryLimits === undefined ? {} : { deliveryLimits }),
      clock: services.clock,
      migrationsApplied: true,
      ...(provider === undefined ? {} : { oidc: provider.routeOptions('http://localhost') }),
      auth: services.auth,
      loginThrottle: services.loginThrottle,
      projects: services.projects,
      organizations: {
        resolve: async (principal) => {
          const access = await organizationAccess.resolve(principal);
          afterResolve?.();
          return access;
        },
      },
      ...(selection === undefined ? {} : { organizationSelection: selection.endpoints }),
      // As `boot.ts` wires it: an upstream Bearer is judged as evidence on
      // every request, so a machine token reaches that path here too.
      ...(selection === undefined && upstreamCredential === undefined
        ? {}
        : {
            credentialEvidence: organizationCredentialEvidence(
              services.auth,
              TEST_JWT_KEY,
              upstreamCredential === undefined
                ? undefined
                : oidcCredentialEvidence(upstreamCredential.verifier, upstreamCredential),
            ),
          }),
      memberships: new OrganizationRepository(source.db, services.gate),
      sharedPeopleRestoreApprovals: new SharedPeopleRestoreApprovalRepository(
        source.db,
        services.gate,
      ),
      domains: new DomainClaimRepository(source.db, services.gate),
      enterpriseConnections: new EnterpriseConnectionRepository(source.db, services.gate),
      machineCredentials: new MachineCredentialAdministrationRepository(source.db, services.gate),
      // As boot wires `WBS_MCP_AUTHORIZATION_SERVER`: the machine grants' own
      // when composed, else the tests' fixed one.
      mcpAuthorizationServer:
        machineGrants === undefined
          ? TEST_MCP_AUTHORIZATION_SERVER
          : machineGrants.authorizationServer,
      claimLeases: services.claimLeases,
      computeProviders: computeProvidersOver(source.db, services.gate),
      resourceUses: new SqliteResourceUses(source.db, services.gate),
      resourceRuntime: new SqliteResourceRuntime(source.db, services.gate),
      // As `boot.ts` wires it, so the composed boundary serves the limits read too.
      // Proof: without it, `swarm-end-to-end.db.test.ts` read the limits 403
      // no_active_organization on an activated organization; watched 2026-10-23.
      organizationLimits: new OrganizationLimitsRepository(
        source.db,
        TEST_ORGANIZATION_DEFAULT_LIMITS,
      ),
      ...(trustedIssuers === undefined
        ? {}
        : {
            trustedIssuers: {
              administration: new TrustedIssuerAdministrationRepository(source.db, services.gate),
              discovery: trustedIssuerDiscovery({ fetch: trustedIssuers.fetch }),
              configuredIssuer: () => Promise.resolve(trustedIssuers.configuredIssuer),
            },
          }),
      onboarding: new OnboardingRepository(source.db, services.gate),
      emailVerification: new EmailVerificationRepository(source.db, services.gate),
      invitations: new InvitationRepository(source.db, services.gate),
      joinRequests: new JoinRequestRepository(source.db, services.gate),
      spaces: new SpaceRepository(source.db, services.gate),
      projectRanks: services.projectRanks,
      ...(supportedCapacityModes === undefined ? {} : { supportedCapacityModes }),
      emailDelivery: {
        deliver: () => Promise.reject(new Error('composed harness mail sink refuses delivery')),
      },
      steps: services.steps,
      calendarMarkers: services.calendarMarkers,
      stepParallels: source.stores.stepParallels,
      workItems: services.workItems,
      optimizer: services.optimizer,
      savedPlans: services.savedPlans,
      directory: services.directory,
      capacity: services.capacity,
      priorityBands: services.priorityBands,
      history: services.history,
      replay: services.replay,
      admitDependencyClient,
      probeDatabase: () => 'ok',
      writes: {
        commandAccess,
        imports: services.imports,
        uow: services.uow,
        batch:
          syntheticExternalCommands !== true
            ? services.batch
            : (
                scope,
                broadcast,
                admission,
                dependencies,
                beforeProjectUpdate,
                beforeStepRemoval,
                beforeStepWrite,
              ) => ({
                ...services.batch(
                  scope,
                  broadcast,
                  admission,
                  dependencies,
                  beforeProjectUpdate,
                  beforeStepRemoval,
                  beforeStepWrite,
                ),
                workItems: new WorkItemService({
                  ...scope.stores,
                  clock,
                  scheduler: services.scheduler,
                  schedulerMode: 'capture',
                  admission,
                  dependencyContext: { kind: 'bound', context: dependencies },
                  externalDependencyAuthoring: { state: 'active' },
                  broadcast,
                }),
              }),
        announcements: services.announcements,
        committedFanout: services.committedFanout,
      },
      internalAuthSecret: internalAuthSecret ?? 'x'.repeat(32),
      ...(delegationKey === undefined
        ? {}
        : {
            delegation: delegationVerifier(
              delegationKey,
              async (pair) => {
                const userId = await new ExternalIdentityRepository(source.db, OPEN).findUserId(
                  pair,
                );
                if (userId === null) return null;
                return new UserRepository(source.db, OPEN).findById(userId);
              },
              (issuer, jti, expiresAt, at) =>
                new SqliteDelegationUse(source.db, services.gate).consume(
                  issuer,
                  jti,
                  expiresAt,
                  at,
                ),
              () => services.clock.now(),
              (userId) => new UserRepository(source.db, OPEN).findById(userId),
            ),
          }),
      ...(machineGrants === undefined
        ? {}
        : {
            mcpService: {
              secret: machineGrants.secret,
              verifyGrant:
                machineGrants.keys === null
                  ? null
                  : machineGrantVerifier(machineGrants.keys, () => services.clock.now()),
              grantKeySecrets: [],
            },
            machineGrants: machineGrantAuthority({
              activationState: () => readOrganizationActivation(source.db),
              keys: machineGrants.keys,
              authorizationServer: machineGrants.authorizationServer,
              admitProof: (presented) => services.auth.admitMachineProof(presented),
              audit: new MachineTokenAuditRepository(source.db, services.gate),
              now: () => services.clock.now(),
              ...(machineGrants.newId === undefined ? {} : { newId: machineGrants.newId }),
            }),
          }),
    });
    const harness = new OrganizationHarness(
      dir,
      app,
      openDatabase(path),
      bound,
      new DomainClaimRepository(source.db, services.gate),
      undefined,
      async (projectId) => {
        const input = await services.workItems.scheduleInput(projectId);
        if (input === null) throw new Error(`project ${projectId} has no optimization input`);
        return scheduleInputHash(input);
      },
      async (projectId, organizationId, actorId, inputHash) => {
        const input = await services.workItems.scheduleInput(projectId);
        if (input === null) throw new Error(`project ${projectId} has no optimization input`);
        if (services.optimizer === undefined) throw new Error('harness optimizer is absent');
        return (
          await services.optimizer.retry({
            projectId,
            objective: 'pri',
            inputHash,
            input,
            scoped: { organizationId, actorId, role: 'super_admin' },
          })
        ).kind;
      },
      services.optimizer?.inputChanged.bind(services.optimizer),
      services.optimizer?.start.bind(services.optimizer),
      createAdmittedWrites({
        commandAccess,
        uow: services.uow,
        batch: services.batch,
        announcements: services.announcements,
        committedFanout: services.committedFanout,
      }).removeStepWithin,
      services.gate,
      services.directory,
      services.uow,
      services.optimizer,
      source.history.savedPlanCapture,
      source,
      services.commands,
      async (token, cookie) => {
        const principal = await services.auth.authenticate(token);
        if (principal === null) throw new Error('command fixture token did not authenticate');
        if (principal.authentication?.kind === 'machine') return principal;
        const credential = await organizationCredentialEvidence(services.auth, TEST_JWT_KEY)(
          token,
          principal,
        );
        if (credential === null)
          throw new Error('command fixture token has no verified browser evidence');
        return {
          ...principal,
          organizationBinding: { credential, cookie },
          organizationOperation: {
            kind: 'mutation',
            expected: { kind: 'present', organizationId: 'org-a' },
          },
        };
      },
      {
        commandAccess,
        uow: services.uow,
        batch: services.batch,
        announcements: services.announcements,
        committedFanout: services.committedFanout,
      },
      services.imports,
      syntheticTransferImports === true
        ? createImportService({
            commandAccess,
            clock: services.clock,
            externalDependencies: { state: 'active' },
            scheduler: fastScheduler,
            uow: services.uow,
            announcements: services.announcements,
            committedFanout: services.committedFanout,
            batchServices: (scope, broadcast) =>
              servicesOver(scope.stores, {
                clock: services.clock,
                broadcast,
                scheduler: fastScheduler,
                schedulerMode: 'capture',
                admission: CREATOR_ADMISSION,
                dependencyContext: createLocalDependencyContext(scope.stores),
              }),
          })
        : undefined,
      services.claimLeases,
    );
    harness.appOrigin = appOrigin;
    harness.federated = provider !== undefined;
    return harness;
  }

  /** Token captured by the test-only injected sink; no message is sent. */
  deliveredEmailToken(address: string): string {
    const token = this.mail?.tokens.get(address);
    if (token === undefined) throw new Error(`no challenge delivered to ${address}`);
    return token;
  }

  /** Captured purpose, so the production caller cannot silently swap message semantics. */
  deliveredEmailPurpose(address: string): EmailMessage['purpose'] {
    const purpose = this.mail?.purposes.get(address);
    if (purpose === undefined) throw new Error('no message purpose was captured');
    return purpose;
  }

  /** Makes the injected test sink reject delivery. */
  failEmailDelivery(beforeDelivery?: () => void | Promise<void>): void {
    if (this.mail === undefined) throw new Error('no test mail sink');
    this.mail.fail = true;
    if (beforeDelivery !== undefined) this.mail.beforeDelivery = beforeDelivery;
  }

  /** Breaks the durable pending row after issue, before the sink reports success. */
  removeChallengeBeforeDelivery(): void {
    if (this.mail === undefined) throw new Error('no test mail sink');
    this.mail.beforeDelivery = () => {
      this.sqlite.run('DELETE FROM email_challenge');
    };
  }

  /** Deletes a just-issued invitation before its sink reports delivery. */
  removeInvitationBeforeDelivery(): void {
    if (this.mail === undefined) throw new Error('no test mail sink');
    this.mail.beforeDelivery = () => {
      this.sqlite.run('DELETE FROM organization_invitation');
    };
  }

  /** Hashes the same current schedule input the mounted Retry route rebuilds. */
  async optimizationHash(projectId: string): Promise<string> {
    if (this.retryHash === undefined) throw new Error('harness has no composed schedule input');
    return this.retryHash(projectId);
  }

  /** Calls the production retry admission without HTTP's earlier role check. */
  async retryAtStore(
    projectId: string,
    organizationId: string,
    actorId: string,
    inputHash: string,
  ): Promise<string> {
    if (this.retryDecision === undefined) throw new Error('harness has no composed optimizer');
    return this.retryDecision(projectId, organizationId, actorId, inputHash);
  }

  close(): void {
    this.sqlite.close();
    rmSync(this.dir, { recursive: true, force: true });
  }

  /** The fixture database path for a separate-process contention probe. */
  databasePath(): string {
    return join(this.dir, 'test.db');
  }

  async register(username: string): Promise<void> {
    const res = await this.app.handle(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: {
          origin: this.appOrigin,
          'content-type': 'application/json',
          // One address per account, so the registration throttle never joins them.
          ...(this.federated
            ? { 'x-forwarded-for': `203.0.113.${String(this.ids.size + 1)}` }
            : {}),
        },
        body: JSON.stringify({ username, password: 'correct-horse' }),
      }),
    );
    const body = (await res.json()) as { token?: unknown; user?: { id?: unknown } };
    const token = this.federated
      ? /__Host-wbs_access=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
      : body.token;
    if (typeof token !== 'string' || token === '' || typeof body.user?.id !== 'string') {
      throw new Error(`register did not answer with a token and user: ${JSON.stringify(body)}`);
    }
    this.tokens.set(username, decodeURIComponent(token));
    this.ids.set(username, body.user.id);
  }

  /** `username`'s session token, as {@link register} received it. */
  token(username: string): string {
    const found = this.tokens.get(username);
    if (found === undefined) throw new Error(`${username} was never registered`);
    return found;
  }

  userId(username: string): string {
    const found = this.ids.get(username);
    if (found === undefined) throw new Error(`${username} was never registered`);
    return found;
  }

  organization(id: string): void {
    this.sqlite.run('INSERT INTO organization (id, name, created_at) VALUES (?, ?, 1)', [id, id]);
  }

  member(organizationId: string, username: string, role: string): void {
    this.sqlite.run(
      'INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES (?, ?, ?, 1)',
      [organizationId, this.userId(username), role],
    );
  }

  /** Stands in for task 2.4: `username`'s session is bound to `organizationId`. */
  bind(username: string, organizationId: string): void {
    this.bound.set(this.userId(username), organizationId);
  }

  /** Stands in for task 2.4 again: `username`'s session is bound to no organization. */
  unbind(username: string): void {
    this.bound.delete(this.userId(username));
  }

  /** Commits the marker through a connection the app does not hold, as a swap would. */
  activate(): void {
    this.sqlite.run(
      "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
    );
  }

  /** One raw request to the app at `http://localhost`, for redirects and cookies. */
  request(path: string, init: RequestInit = {}): Promise<Response> {
    return Promise.resolve(this.app.handle(new Request(`http://localhost${path}`, init)));
  }

  async call(username: string, method: string, path: string, body?: unknown): Promise<Answer> {
    const userId = this.ids.get(username);
    const organizationId = userId === undefined ? undefined : this.bound.get(userId);
    return this.callWith(
      this.tokens.get(username) ?? 'none',
      method,
      path,
      body,
      organizationId === undefined ? {} : { 'X-WBS-Expected-Organization': organizationId },
    );
  }

  /** {@link call} with an explicit Bearer credential, and any extra headers a caller forges. */
  async callWith(
    token: string,
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<Answer> {
    const res = await this.app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...(method === 'GET' ? {} : { origin: this.appOrigin }),
          ...extraHeaders,
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    if (res.status === 204) return { status: 204, body: null };
    const text = await res.text();
    return { status: res.status, body: text.startsWith('{') ? JSON.parse(text) : text };
  }
}

/** Named options for {@link OrganizationHarness.openComposedWith}. */
export interface ComposedHarnessOptions {
  /** Explicit binary identity for semantic/refusal fixtures; real boot owns its immutable descriptor. */
  readonly dependencyCapability?: DependencyRuntimeCapability;
  /** Explicit authority boundary for mounted runtime admission tests. */
  readonly admitDependencyClient?: AppOptions['admitDependencyClient'];
  /** Explicit allowed browser origin, shared by the mounted controller and fixture clients. */
  readonly appOrigin?: string;
  /** Builds a separate test-only importer; mounted imports retain source binary and durable authority. */
  readonly syntheticTransferImports?: true;
  /** Replaces only the admitted command WorkItemService with explicit fixture authority. */
  readonly syntheticExternalCommands?: true;
  /** Trusted external delivery reader; absent exercises production composition. */
  readonly delivery?: DeliveryReader;
  /** Delivery gate limits; absent uses the production defaults. */
  readonly deliveryLimits?: DeliveryGateLimits;
  readonly sessionBinding?: boolean;
  /** One secret for the mounted backend and its outbound production push client. */
  readonly internalAuthSecret?: string;
  /** The services clock's time source; real time unless a test fixes it. */
  readonly now?: () => number;
  withOptimizer?: boolean;
  /** Runs after organization access resolves, before the route acts. */
  afterResolve?: () => void;
  spawn?: ReservedSpawner;
  solverVersion?: string;
  openReadOnlyConnection?: (dbPath: string) => Connection;
  captureRead?: CaptureReadSeam;
  pushFetch?: Parameters<typeof buildServices>[0]['pushFetch'];
  onFanoutCapture?: (organizationId: string) => unknown;
  onCapturedFanout?: (captured: CapturedFanout) => void;
  onBorrowedUnitOfWork?: () => void;
  /** The release's capacity modes; production's `SUPPORTED_CAPACITY_MODES` when absent. */
  supportedCapacityModes?: readonly CapacityMode[];
  /** Mounts the browser OIDC routes over this fake provider; see {@link OrganizationHarnessOptions}. */
  provider?: FakeOidcProvider;
  /** Verifies upstream Bearer tokens; see {@link OrganizationHarnessOptions}. */
  upstreamCredential?: OrganizationHarnessOptions['upstreamCredential'];
  /**
   * Migrates the fresh, empty file at `dbPath` before anything opens it; in-process
   * `runMigrations` when absent. A rehearsal passes the operator's `migrate-cli.ts`.
   */
  migrate?: (dbPath: string) => void;
  /**
   * Turns the OIDC machine source on (`wbs-machine-credentials` slice 5), as
   * `boot.ts` does: trusted issuer administration and the trusted-issuer
   * verification path, both fetching through `fetch` (a test routes it to a
   * local issuer). `configuredIssuer` is the sign-in issuer they refuse.
   */
  trustedIssuers?: HarnessTrustedIssuers;
  /**
   * Composes machine grants as `boot.ts` does (`wbs-mcp-agent-surface` M3):
   * mcp-01's dedicated secret, the grant keys and the authorization server,
   * each null to compose the deployment without it.
   */
  machineGrants?: HarnessMachineGrants;
  /** Verifies delegations with this RSA public key, as `boot.ts` does with its configured pair. */
  delegationKey?: CryptoKey;
}

/** What {@link ComposedHarnessOptions.machineGrants} wires. */
export interface HarnessMachineGrants {
  readonly secret: string | null;
  readonly keys: MachineGrantKeys | null;
  readonly authorizationServer: string | null;
  /** The audit row ids; random UUIDs when absent. */
  readonly newId?: () => string;
}

/** What {@link ComposedHarnessOptions.trustedIssuers} wires. */
export interface HarnessTrustedIssuers {
  readonly fetch: IssuerFetch;
  readonly configuredIssuer: string | null;
  /** The key sets' unknown-`kid` refetch cooldown; production's 30 s when absent. */
  readonly cooldownMs?: number;
  /** Where an unfetchable key set is reported; nowhere when absent. */
  readonly report?: KeySetFailureReport;
}

/**
 * The raw rank repository for the uncomposed harness. Switching the capacity
 * mode needs the composed write-turn owner, so it refuses here; use
 * {@link OrganizationHarness.openComposed}.
 */
function uncomposedRanks(ranks: ProjectRankRepository): ProjectRankStore & CapacityModeSwitch {
  return {
    orderIn: (organizationId) => ranks.orderIn(organizationId),
    moveAfter: (...args) => ranks.moveAfter(...args),
    capacityModeIn: (organizationId) => ranks.capacityModeIn(organizationId),
    switchCapacityMode: () =>
      Promise.reject(
        new Error('the uncomposed harness switches no capacity mode; use openComposed'),
      ),
  };
}
