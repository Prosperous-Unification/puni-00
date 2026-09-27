import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SqliteOrganizationAccess } from '@wbs/store-sqlite';

import { buildApp } from '../app';
import { ActualRepository } from '../repository/actual';
import { CommandJournalRepository } from '../repository/command-journal';
import { openDatabase, openDrizzle } from '../repository/db';
import { DependencyRepository } from '../repository/dependency';
import { DirectoryRepository } from '../repository/directory';
import { EstimateRepository } from '../repository/estimate';
import { OPEN } from '../repository/gate';
import { runMigrations } from '../repository/migrate';
import { ProjectRepository } from '../repository/project';
import { StepRepository } from '../repository/step';
import { StepMeasureRepository } from '../repository/step-measure';
import { StepProgressRepository } from '../repository/step-progress';
import { UserRepository } from '../repository/user';
import { SubtreeRepository, WorkItemRepository } from '../repository/work-item';
import { bunPasswordHasher, joseTokenCodec } from '../runtime/bun-runtime';
import { AuthService } from '../service/auth.service';
import { DirectoryService } from '../service/directory.service';
import { fastScheduler } from '../service/optimizer-wiring';
import { ProjectService } from '../service/project.service';
import { StepService } from '../service/step.service';
import { WorkItemService } from '../service/work-item.service';
import { TEST_JWT_KEY } from './auth-fixture';
import { recordingBroadcaster } from './broadcast-fixture';
import { testCalendarMarkerService } from './calendar-marker-fixture';
import { inMemoryCapacity, testCapacityService } from './capacity-fixture';
import { testClock } from './clock-fixture';
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
  ) {}

  static open(): OrganizationHarness {
    const dir = mkdtempSync(join(tmpdir(), 'wbs-organization-'));
    const path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const db = openDrizzle(path);
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
      calendarMarkers: testCalendarMarkerService(),
      projects: new ProjectService({
        clock: testClock,
        projects,
        broadcast: recordingBroadcaster(),
      }),
      steps: new StepService({
        clock: testClock,
        projects,
        steps: new StepRepository(db, OPEN),
        broadcast: recordingBroadcaster(),
      }),
      workItems: new WorkItemService({
        scheduler: fastScheduler,
        clock: testClock,
        workItems: new WorkItemRepository(db, OPEN),
        projects,
        estimates: new EstimateRepository(db, OPEN),
        actuals: new ActualRepository(db, OPEN),
        measures: new StepMeasureRepository(db, OPEN),
        progress: new StepProgressRepository(db, OPEN),
        dependencies: new DependencyRepository(db, OPEN),
        directory: directoryStore,
        capacity: inMemoryCapacity(),
        priorityBands: inMemoryPriorityBands(),
        subtrees: new SubtreeRepository(db, OPEN),
        journal: new CommandJournalRepository(db, OPEN),
        broadcast: recordingBroadcaster(),
      }),
    };
    const app = buildApp({
      loginThrottle: testLoginThrottle(),
      clock: testClock,
      appOrigin: 'http://localhost',
      savedPlans: testSavedPlanService(),
      ...writing,
      organizations: new SqliteOrganizationAccess(db, (userId) =>
        Promise.resolve(bound.get(userId) ?? null),
      ),
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
    return new OrganizationHarness(dir, app, openDatabase(path), bound);
  }

  close(): void {
    this.sqlite.close();
    rmSync(this.dir, { recursive: true, force: true });
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

  /** Commits the marker through a connection the app does not hold, as a swap would. */
  activate(): void {
    this.sqlite.run(
      "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
    );
  }

  async call(username: string, method: string, path: string, body?: unknown): Promise<Answer> {
    const res = await this.app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.tokens.get(username) ?? 'none'}`,
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
