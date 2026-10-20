import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildOidcVerifier, oidcCredentialEvidence, type TokenVerifier } from '@wbs/auth';
import {
  type CapacityModeSwitch,
  CREATOR_ADMISSION,
  type DomainResolver,
  type EmailMessage,
  type PasswordHasher,
  type ProjectRankStore,
} from '@wbs/core';
import { CalendarMarkerService } from '@wbs/core/module/calendar-marker/calendar-marker.resource';
import { DirectoryService } from '@wbs/core/module/directory/directory.resource';
import { createAdmittedWrites } from '@wbs/core/module/plan-commands/composition';
import { ProjectService } from '@wbs/core/module/project/project.resource';
import { StepService } from '@wbs/core/module/step/step.resource';
import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import type { CapturedFanout } from '@wbs/core/ports/fanout-capture-store';
import type { SavedPlanCaptureStore } from '@wbs/core/ports/saved-plan-capture-store';
import type { UnitOfWork } from '@wbs/core/ports/unit-of-work';
import { AuthService } from '@wbs/core/service/auth.service';
import type { CapacityMode } from '@wbs/domain';
import { createLogger } from '@wbs/observability';
import {
  currentMembershipAccess,
  DomainClaimRepository,
  EmailVerificationRepository,
  EnterpriseConnectionRepository,
  ExternalIdentityRepository,
  InvitationRepository,
  JoinRequestRepository,
  OnboardingRepository,
  openSqliteSource,
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
  SqliteDelegationUse,
  SqliteOrganizationAccess,
  SqliteOrganizationSelection,
  type SqliteSource,
  userBoundOrganizationOf,
} from '@wbs/store-sqlite';
import { canonicalOidcEmail } from '@wbs/store-sqlite/canonical-oidc-email';
import { ClaimRepository } from '@wbs/store-sqlite/claim';
import type { Connection } from '@wbs/store-sqlite/db';
import { StepBlockageRepository } from '@wbs/store-sqlite/step-blockage';
import { StepNodeAttemptRepository } from '@wbs/store-sqlite/step-node-attempt';
import { StepParallelRepository } from '@wbs/store-sqlite/step-parallel';
import { TypedDependencyRepository } from '@wbs/store-sqlite/typed-dependency';

import { buildApp } from '../app';
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
import { joseTokenCodec } from '../runtime/bun-runtime';
import { delegationVerifier } from '../runtime/delegation';
import { delegationIssuer } from '../runtime/delegation-issuer';
import { runDomainProofWorker } from '../runtime/domain-proof-worker';
import { organizationCookieBinding } from '../runtime/organization-cookie';
import { organizationCredentialEvidence } from '../runtime/organization-credential';
import { organizationSelection } from '../runtime/organization-selection';
import { fastScheduler } from '../service/optimizer-wiring';
import { buildServices } from '../services';
import { TEST_JWT_KEY } from './auth-fixture';
import { recordingBroadcaster } from './broadcast-fixture';
import { inMemoryCapacity, testCapacityService } from './capacity-fixture';
import { testClock } from './clock-fixture';
import { sqliteDependencyGraph } from './dependency-graph-fixture';
import type { FakeOidcProvider } from './fake-oidc-provider';
import { testHistoryService } from './history-fixture';
import { testLoginThrottle } from './login-throttle-fixture';
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
  ) {}

  /** Drains async optimizer work and closes both SQLite connections in order. */
  async closeComposed(): Promise<void> {
    await this.optimizerCoordinator?.stop();
    await this.composedSource?.close();
    this.close();
  }

  /** Stops the composed app and closes both connections, leaving its exact database for host recovery. Caller owns directory cleanup. */
  async stopForRecovery(): Promise<string> {
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
      }),
      capacity: testCapacityService(),
      priorityBands: testPriorityBandService(),
      calendarMarkers: new CalendarMarkerService({
        projects,
        markers: new CalendarMarkerRepository(db, OPEN),
        clock: testClock,
      }),
      projects: new ProjectService({
        dependencyGraph: sqliteDependencyGraph(db, projects),
        clock: testClock,
        projects,
        broadcast: recordingBroadcaster(),
      }),
      steps: new StepService({
        dependencyGraph: sqliteDependencyGraph(db, projects),
        clock: testClock,
        projects,
        steps: new StepRepository(db, OPEN),
        broadcast: recordingBroadcaster(),
      }),
      workItems: new WorkItemService({
        admission: CREATOR_ADMISSION,
        scheduler: fastScheduler,
        clock: testClock,
        workItems: new WorkItemRepository(db, OPEN),
        projects,
        estimates: new EstimateRepository(db, OPEN),
        actuals: new ActualRepository(db, OPEN),
        measures: new StepMeasureRepository(db, OPEN),
        progress: new StepProgressRepository(db, OPEN),
        attempts: new StepNodeAttemptRepository(db, OPEN),
        blockages: new StepBlockageRepository(db, OPEN),
        claims: new ClaimRepository(db, OPEN),
        stepParallels: new StepParallelRepository(db, OPEN),
        dependencies: new DependencyRepository(db, OPEN),
        typedDependencies: new TypedDependencyRepository(db, OPEN),
        directory: directoryStore,
        capacity: inMemoryCapacity(),
        priorityBands: inMemoryPriorityBands(),
        subtrees: new SubtreeRepository(db, OPEN),
        journal: new CommandJournalRepository(db, OPEN),
        broadcast: recordingBroadcaster(),
      }),
    };
    const mail: TestMail = { tokens: new Map<string, string>(), purposes: new Map(), fail: false };
    const app = buildApp({
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
      pendingMemberships: new ScimUserRepository(db, gate),
      enterpriseConnections: new EnterpriseConnectionRepository(db, gate),
      provisioning: {
        tokens: new ProvisioningTokenRepository(db, gate),
        users: new ScimUserRepository(db, gate),
        clock: { now },
        canonicalUserName: (raw) => canonicalOidcEmail(raw),
      },
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
    withOptimizer = false,
    afterResolve,
    spawn = () => new Promise<never>(() => undefined),
    solverVersion = '0.1.0',
    openReadOnlyConnection,
    pushFetch = () => Promise.resolve(Response.json({ delivered_to_sockets: 0 })),
    onFanoutCapture,
    onCapturedFanout,
    onBorrowedUnitOfWork,
    supportedCapacityModes,
    sessionBinding,
    provider,
    upstreamCredential,
  }: ComposedHarnessOptions): OrganizationHarness {
    if (provider !== undefined && upstreamCredential !== undefined)
      throw new Error('a harness takes a fake provider or an upstream credential, not both');
    const dir = mkdtempSync(join(tmpdir(), 'wbs-organization-'));
    const path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const source = openSqliteSource({
      dbPath: path,
      openReadOnlyConnection,
      onFanoutCapture,
      onCapturedFanout,
      onBorrowedUnitOfWork,
    });
    const bound = new Map<string, string>();
    const services = buildServices({
      source,
      logger: createLogger({ service: 'be-01' }),
      jwtKey: TEST_JWT_KEY,
      gwUrl: 'http://gw.invalid',
      internalAuthSecret: 's'.repeat(32),
      pushFetch,
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
    const selection =
      sessionBinding === true
        ? organizationSelection(
            new SqliteOrganizationSelection(source.db),
            organizationCookieBinding(TEST_JWT_KEY),
            new SqliteBrowserCredentialRevocations(source.db, services.gate),
            (principal, organizationId) => organizationAccess.admitTo(principal, organizationId),
          )
        : undefined;
    const organizationAccess: SqliteOrganizationAccess = new SqliteOrganizationAccess(
      source.db,
      selection?.activeOrganizationOf ??
        userBoundOrganizationOf((userId) => Promise.resolve(bound.get(userId) ?? null)),
      () => services.clock.now(),
    );
    const app = buildApp({
      appOrigin: 'http://localhost',
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
      ...(selection === undefined
        ? {}
        : {
            organizationSelection: selection.endpoints,
            credentialEvidence: organizationCredentialEvidence(services.auth, TEST_JWT_KEY),
          }),
      memberships: new OrganizationRepository(source.db, services.gate),
      sharedPeopleRestoreApprovals: new SharedPeopleRestoreApprovalRepository(
        source.db,
        services.gate,
      ),
      domains: new DomainClaimRepository(source.db, services.gate),
      enterpriseConnections: new EnterpriseConnectionRepository(source.db, services.gate),
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
      probeDatabase: () => 'ok',
      writes: {
        imports: services.imports,
        uow: services.uow,
        batch: services.batch,
        announcements: services.announcements,
        committedFanout: services.committedFanout,
      },
      internalAuthSecret: 'x'.repeat(32),
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
            scoped: { organizationId, actorId },
          })
        ).kind;
      },
      services.optimizer?.inputChanged.bind(services.optimizer),
      services.optimizer?.start.bind(services.optimizer),
      createAdmittedWrites({
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
    );
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
          origin: 'http://localhost',
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
          ...(method === 'GET' ? {} : { origin: 'http://localhost' }),
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
  readonly sessionBinding?: boolean;
  withOptimizer?: boolean;
  /** Runs after organization access resolves, before the route acts. */
  afterResolve?: () => void;
  spawn?: ReservedSpawner;
  solverVersion?: string;
  openReadOnlyConnection?: (dbPath: string) => Connection;
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
