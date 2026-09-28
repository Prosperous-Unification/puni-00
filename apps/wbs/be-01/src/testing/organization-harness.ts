import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CREATOR_ADMISSION } from '@wbs/core';
import { createLogger } from '@wbs/observability';
import {
  EmailVerificationRepository,
  ExternalIdentityRepository,
  OnboardingRepository,
  openSqliteSource,
  OrganizationRepository,
  scheduleInputHash,
  SqliteDelegationUse,
  SqliteOrganizationAccess,
} from '@wbs/store-sqlite';
import { TypedDependencyRepository } from '@wbs/store-sqlite/typed-dependency';

import { buildApp } from '../app';
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
import { bunPasswordHasher, joseTokenCodec } from '../runtime/bun-runtime';
import { delegationVerifier } from '../runtime/delegation';
import { AuthService } from '../service/auth.service';
import { CalendarMarkerService } from '../service/calendar-marker.service';
import { DirectoryService } from '../service/directory.service';
import { fastScheduler } from '../service/optimizer-wiring';
import { ProjectService } from '../service/project.service';
import { StepService } from '../service/step.service';
import { WorkItemService } from '../service/work-item.service';
import { buildServices } from '../services';
import { TEST_JWT_KEY } from './auth-fixture';
import { recordingBroadcaster } from './broadcast-fixture';
import { inMemoryCapacity, testCapacityService } from './capacity-fixture';
import { testClock } from './clock-fixture';
import { sqliteDependencyGraph } from './dependency-graph-fixture';
import { testHistoryService } from './history-fixture';
import { testLoginThrottle } from './login-throttle-fixture';
import { inMemoryPriorityBands, testPriorityBandService } from './priority-band-fixture';
import { testReplay } from './replay-fixture';
import { testSavedPlanService } from './saved-plan-fixture';
import { testWrites } from './writes-fixture';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

/** One answered request: its status and its parsed body (text when not JSON, null for 204). */
export interface Answer {
  status: number;
  body: unknown;
}

interface TestMail {
  tokens: Map<string, string>;
  fail: boolean;
  beforeDelivery?: () => void;
}

/**
 * be-01 over real SQLite with the production {@link SqliteOrganizationAccess},
 * for the organization boundary suites (tasks 3.x).
 *
 * Task 2.4 has not bound sessions to organizations yet, so {@link bind} stands
 * in for that binding: it names a user's active organization. Everything
 * behind it — the marker read, the membership lookup, the scoped queries and
 * the role policy — is production code. Production passes
 * `NO_BOUND_ORGANIZATION`; `boot.db.test.ts` holds the wired process to that.
 */
export class OrganizationHarness {
  private readonly tokens = new Map<string, string>();
  private readonly ids = new Map<string, string>();

  private constructor(
    private readonly dir: string,
    readonly app: ReturnType<typeof buildApp>,
    /** A raw connection the app does not hold, as a second process would. */
    readonly sqlite: ReturnType<typeof openDatabase>,
    private readonly bound: Map<string, string>,
    private readonly mail?: TestMail,
    private readonly retryHash?: (projectId: string) => Promise<string>,
    private readonly retryDecision?: (
      projectId: string,
      organizationId: string,
      actorId: string,
      inputHash: string,
    ) => Promise<string>,
  ) {}

  /**
   * `delegationKey`, when given, is the RS256 public key the app verifies
   * delegation tokens with (task 2.5); upstream identities resolve through the
   * real `external_identity` mapping.
   */
  static open(delegationKey?: CryptoKey): OrganizationHarness {
    const dir = mkdtempSync(join(tmpdir(), 'wbs-organization-'));
    const path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const db = openDrizzle(path);
    const gate = new WriteCoordinator();
    const bound = new Map<string, string>();
    const projects = new ProjectRepository(db, OPEN);
    const directoryStore = new DirectoryRepository(db, OPEN);
    const writing = {
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
    const mail: TestMail = { tokens: new Map<string, string>(), fail: false };
    const app = buildApp({
      loginThrottle: testLoginThrottle(),
      clock: testClock,
      appOrigin: 'http://localhost',
      savedPlans: testSavedPlanService(),
      ...writing,
      organizations: new SqliteOrganizationAccess(db, (userId) =>
        Promise.resolve(bound.get(userId) ?? null),
      ),
      memberships: new OrganizationRepository(db, OPEN),
      onboarding: new OnboardingRepository(db, OPEN),
      emailVerification: new EmailVerificationRepository(db, OPEN),
      emailDelivery: {
        deliver: (address, token) => {
          if (mail.fail) return Promise.reject(new Error('injected mail sink failure'));
          mail.beforeDelivery?.();
          mail.tokens.set(address, token);
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
            ),
          }),
      history: testHistoryService(),
      auth: new AuthService({
        clock: testClock,
        users: new UserRepository(db, OPEN),
        tokens: joseTokenCodec(TEST_JWT_KEY),
        passwords: bunPasswordHasher,
      }),
      replay: testReplay().replay,
      probeDatabase: () => 'ok',
      internalAuthSecret: 'x'.repeat(32),
      writes: testWrites(undefined, writing),
      migrationsApplied: true,
    });
    return new OrganizationHarness(dir, app, openDatabase(path), bound, mail);
  }

  /**
   * The same boundary over be-01's production service composition: real
   * SQLite units of work under the command runner, so a refused batch is
   * rolled back exactly as in production. The command suites need this; the
   * fixtures {@link open} wires cannot roll a batch back.
   */
  static openComposed(withOptimizer = false, afterResolve?: () => void): OrganizationHarness {
    const dir = mkdtempSync(join(tmpdir(), 'wbs-organization-'));
    const path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const source = openSqliteSource({ dbPath: path });
    const bound = new Map<string, string>();
    const services = buildServices({
      source,
      logger: createLogger({ service: 'be-01' }),
      jwtKey: TEST_JWT_KEY,
      gwUrl: 'http://gw.invalid',
      internalAuthSecret: 's'.repeat(32),
      pushFetch: () => Promise.resolve(Response.json({ delivered_to_sockets: 0 })),
      ...(withOptimizer
        ? {
            optimizer: {
              solverVersion: '0.1.0',
              budgetMs: 60_000,
              spawn: () => new Promise<never>(() => undefined),
            },
          }
        : {}),
    });
    const organizationAccess = new SqliteOrganizationAccess(source.db, (userId) =>
      Promise.resolve(bound.get(userId) ?? null),
    );
    const app = buildApp({
      appOrigin: 'http://localhost',
      clock: services.clock,
      migrationsApplied: true,
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
      memberships: new OrganizationRepository(source.db, services.gate),
      onboarding: new OnboardingRepository(source.db, services.gate),
      emailVerification: new EmailVerificationRepository(source.db, services.gate),
      emailDelivery: {
        deliver: () => Promise.reject(new Error('composed harness mail sink refuses delivery')),
      },
      steps: services.steps,
      calendarMarkers: services.calendarMarkers,
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
      },
      internalAuthSecret: 'x'.repeat(32),
    });
    return new OrganizationHarness(
      dir,
      app,
      openDatabase(path),
      bound,
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
    );
  }

  /** Token captured by the test-only injected sink; no message is sent. */
  deliveredEmailToken(address: string): string {
    const token = this.mail?.tokens.get(address);
    if (token === undefined) throw new Error(`no challenge delivered to ${address}`);
    return token;
  }

  /** Makes the injected test sink reject delivery. */
  failEmailDelivery(): void {
    if (this.mail === undefined) throw new Error('no test mail sink');
    this.mail.fail = true;
  }

  /** Breaks the durable pending row after issue, before the sink reports success. */
  removeChallengeBeforeDelivery(): void {
    if (this.mail === undefined) throw new Error('no test mail sink');
    this.mail.beforeDelivery = () => {
      this.sqlite.run('DELETE FROM email_challenge');
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
        headers: { origin: 'http://localhost', 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: 'correct-horse' }),
      }),
    );
    const body = (await res.json()) as { token?: unknown; user?: { id?: unknown } };
    if (typeof body.token !== 'string' || typeof body.user?.id !== 'string') {
      throw new Error(`register did not answer with a token and user: ${JSON.stringify(body)}`);
    }
    this.tokens.set(username, body.token);
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

  async call(username: string, method: string, path: string, body?: unknown): Promise<Answer> {
    return this.callWith(this.tokens.get(username) ?? 'none', method, path, body);
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
