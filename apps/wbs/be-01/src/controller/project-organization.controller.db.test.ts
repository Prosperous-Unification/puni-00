import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SqliteOrganizationAccess } from '@wbs/store-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

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
import { TEST_JWT_KEY } from '../testing/auth-fixture';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { testCalendarMarkerService } from '../testing/calendar-marker-fixture';
import { inMemoryCapacity, testCapacityService } from '../testing/capacity-fixture';
import { testClock } from '../testing/clock-fixture';
import { testHistoryService } from '../testing/history-fixture';
import { testLoginThrottle } from '../testing/login-throttle-fixture';
import { inMemoryPriorityBands, testPriorityBandService } from '../testing/priority-band-fixture';
import { testReplay } from '../testing/replay-fixture';
import { testSavedPlanService } from '../testing/saved-plan-fixture';
import { testWrites } from '../testing/writes-fixture';

/**
 * The project boundary under organization isolation (task 3.1), over real
 * SQLite and the production {@link SqliteOrganizationAccess}.
 *
 * Task 2.4 has not bound sessions to organizations yet, so `bound` stands in
 * for that binding: it names each user's active organization. Everything behind
 * it — the marker read, the membership lookup, the scoped queries and the role
 * policy — is production code. Production passes `NO_BOUND_ORGANIZATION`;
 * `boot.db.test.ts` holds the wired process to that.
 */
const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

let dir: string;
let app: ReturnType<typeof buildApp>;
let sqlite: ReturnType<typeof openDatabase>;
const bound = new Map<string, string>();
const tokens = new Map<string, string>();
const ids = new Map<string, string>();

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-project-organization-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const db = openDrizzle(path);
  sqlite = openDatabase(path);
  bound.clear();
  tokens.clear();
  ids.clear();

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
    projects: new ProjectService({ clock: testClock, projects, broadcast: recordingBroadcaster() }),
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
  app = buildApp({
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
  for (const username of ['ada', 'grace', 'vic', 'sam', 'nell']) await register(username);
  sqlite.run(
    "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1), ('org-b', 'B', 1)",
  );
  member('org-a', 'ada', 'member');
  member('org-a', 'vic', 'viewer');
  member('org-a', 'sam', 'super_admin');
  member('org-b', 'grace', 'member');
  for (const [username, organizationId] of [
    ['ada', 'org-a'],
    ['vic', 'org-a'],
    ['sam', 'org-a'],
    ['grace', 'org-b'],
  ] as const) {
    bound.set(userId(username), organizationId);
  }
});

afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

function userId(username: string): string {
  const found = ids.get(username);
  if (found === undefined) throw new Error(`${username} was never registered`);
  return found;
}

function member(organizationId: string, username: string, role: string): void {
  sqlite.run(
    'INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES (?, ?, ?, 1)',
    [organizationId, userId(username), role],
  );
}

/** Commits the marker through a connection the app does not hold, as a swap would. */
function activate(): void {
  sqlite.run(
    "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
  );
}

async function register(username: string): Promise<void> {
  const res = await app.handle(
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
  tokens.set(username, body.token);
  ids.set(username, body.user.id);
}

async function call(
  username: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        authorization: `Bearer ${tokens.get(username) ?? 'none'}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  if (res.status === 204) return { status: 204, body: null };
  const text = await res.text();
  return { status: res.status, body: text.startsWith('{') ? JSON.parse(text) : text };
}

async function create(username: string, name: string): Promise<string> {
  const answer = await call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

async function listedNames(username: string): Promise<string[]> {
  const answer = await call(username, 'GET', '/api/projects');
  expect(answer.status).toBe(200);
  return (answer.body as { projects: { name: string }[] }).projects.map((p) => p.name).sort();
}

/** Every project route, addressed at `id`, with a body each would accept from a writer. */
function everyAddressedRoute(id: string): [string, string, unknown?][] {
  return [
    ['GET', `/api/projects/${id}`],
    ['GET', `/api/projects/${id}/export?format=markdown`],
    ['POST', `/api/projects/${id}/opened`],
    ['PATCH', `/api/projects/${id}`, { name: 'Renamed' }],
    ['POST', `/api/projects/${id}/optimization/retry`, { objective: 'pri', inputHash: 'h' }],
  ];
}

describe('before activation', () => {
  it('keeps deployment-wide access whatever organization a session is bound to', async () => {
    const id = await create('grace', 'B plan');
    expect(await listedNames('ada')).toEqual(['B plan']);
    expect((await call('ada', 'GET', `/api/projects/${id}`)).status).toBe(200);
    expect((await call('nell', 'GET', `/api/projects/${id}`)).status).toBe(200);
    expect((await call('vic', 'PATCH', `/api/projects/${id}`, { name: 'Legacy' })).status).toBe(
      200,
    );
  });
});

describe('after activation', () => {
  it('scopes the same running app once another connection activates isolation', async () => {
    await create('ada', 'A plan');
    await create('grace', 'B plan');
    expect(await listedNames('ada')).toEqual(['A plan', 'B plan']);
    activate();
    expect(await listedNames('ada')).toEqual([]);
  });

  it('creates a project only its own organization can see', async () => {
    activate();
    const id = await create('ada', 'A plan');
    expect((await call('ada', 'GET', `/api/projects/${id}`)).status).toBe(200);
    expect((await call('grace', 'GET', `/api/projects/${id}`)).status).toBe(404);
    expect(
      sqlite
        .query('SELECT organization_id FROM project_organization WHERE resource_id = ?')
        .all(id),
    ).toEqual([{ organization_id: 'org-a' }]);
  });

  it("lists only the active organization's projects", async () => {
    activate();
    await create('ada', 'A plan');
    await create('grace', 'B plan');
    expect(await listedNames('ada')).toEqual(['A plan']);
    expect(await listedNames('grace')).toEqual(['B plan']);
  });

  it('answers 404 alike for a foreign and an absent project, and changes nothing', async () => {
    activate();
    const foreign = await create('grace', 'B plan');
    const missing = everyAddressedRoute('missing');
    for (const [at, [method, path, body]] of everyAddressedRoute(foreign).entries()) {
      const [, missingPath] = missing[at];
      const toForeign = await call('ada', method, path, body);
      const toMissing = await call('ada', method, missingPath, body);
      expect({ route: `${method} ${path}`, ...toForeign }).toEqual({
        route: `${method} ${path}`,
        status: 404,
        body: { error: 'not_found' },
      });
      expect(toMissing).toEqual(toForeign);
    }
    expect(await listedNames('grace')).toEqual(['B plan']);
    expect(sqlite.query('SELECT COUNT(*) AS n FROM project_access').get()).toEqual({ n: 0 });
  });

  it('refuses a viewer every project write and lets the viewer read and open', async () => {
    activate();
    const id = await create('ada', 'A plan');
    expect(await call('vic', 'POST', '/api/projects', { name: 'Viewer plan' })).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(await call('vic', 'PATCH', `/api/projects/${id}`, { name: 'Viewer' })).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(
      await call('vic', 'POST', `/api/projects/${id}/optimization/retry`, {
        objective: 'pri',
        inputHash: 'h',
      }),
    ).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect((await call('vic', 'GET', `/api/projects/${id}`)).status).toBe(200);
    expect((await call('vic', 'GET', `/api/projects/${id}/export?format=markdown`)).status).toBe(
      200,
    );
    expect((await call('vic', 'POST', `/api/projects/${id}/opened`)).status).toBe(204);
    expect(await listedNames('ada')).toEqual(['A plan']);
  });

  it('lets only the creator edit a restricted project, super-admin included', async () => {
    activate();
    const id = await create('ada', 'A plan');
    expect((await call('ada', 'PATCH', `/api/projects/${id}`, { restricted: true })).status).toBe(
      200,
    );
    expect(await call('sam', 'PATCH', `/api/projects/${id}`, { name: 'Recovered' })).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect((await call('ada', 'PATCH', `/api/projects/${id}`, { name: 'Mine' })).status).toBe(200);
  });

  it('refuses a removed member on the next request', async () => {
    activate();
    const id = await create('ada', 'A plan');
    sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [userId('ada')]);
    for (const [method, path, body] of [
      ['GET', '/api/projects'],
      ['POST', '/api/projects', { name: 'After removal' }],
      ...everyAddressedRoute(id),
    ] as [string, string, unknown?][]) {
      expect({ route: `${method} ${path}`, ...(await call('ada', method, path, body)) }).toEqual({
        route: `${method} ${path}`,
        status: 403,
        body: { error: 'not_a_member' },
      });
    }
  });

  it('refuses a session bound to no organization before any lookup', async () => {
    activate();
    const id = await create('ada', 'A plan');
    for (const [method, path, body] of [
      ['GET', '/api/projects'],
      ['POST', '/api/projects', { name: 'Unbound' }],
      ...everyAddressedRoute(id),
      ...everyAddressedRoute('missing'),
    ] as [string, string, unknown?][]) {
      expect({ route: `${method} ${path}`, ...(await call('nell', method, path, body)) }).toEqual({
        route: `${method} ${path}`,
        status: 403,
        body: { error: 'no_active_organization' },
      });
    }
  });

  it("refuses a solution link that could reveal another organization's project", async () => {
    activate();
    const own = await create('ada', 'A plan');
    const foreign = await create('grace', 'B plan');
    sqlite.run("UPDATE project SET solution_slug = 'shared', solution_url = 'u' WHERE id = ?", [
      foreign,
    ]);
    for (const slug of ['shared', 'free']) {
      expect(
        await call('ada', 'PATCH', `/api/projects/${own}`, { solutionRef: { slug, url: 'u' } }),
      ).toEqual({ status: 403, body: { error: 'forbidden' } });
    }
    expect((await call('ada', 'PATCH', `/api/projects/${own}`, { solutionRef: null })).status).toBe(
      200,
    );
  });

  it('fails as a server error on a malformed membership role', async () => {
    activate();
    sqlite.run('PRAGMA ignore_check_constraints = ON');
    sqlite.run("UPDATE organization_membership SET role = 'owner' WHERE user_id = ?", [
      userId('vic'),
    ]);
    sqlite.run('PRAGMA ignore_check_constraints = OFF');
    expect((await call('vic', 'POST', '/api/projects', { name: 'Owner plan' })).status).toBe(500);
  });

  it('answers 401 for a missing credential, before organization access', async () => {
    activate();
    expect((await call('nobody', 'GET', '/api/projects')).status).toBe(401);
  });
});

describe('a broken activation marker', () => {
  it.each([
    ['absent', 'DROP TABLE organization_activation'],
    ['malformed', 'DROP TRIGGER IF EXISTS organization_activation_no_delete'],
  ])('fails the project list and read as a server error when %s', async (state, damage) => {
    sqlite.run(damage);
    if (state === 'malformed') sqlite.run('DELETE FROM organization_activation');
    expect((await call('ada', 'GET', '/api/projects')).status).toBe(500);
    expect((await call('ada', 'GET', '/api/projects/missing')).status).toBe(500);
  });
});
