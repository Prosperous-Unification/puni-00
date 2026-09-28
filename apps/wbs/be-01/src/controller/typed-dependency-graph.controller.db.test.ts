import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { UnitOfWork } from '@wbs/core';
import { DependencyGraphGuard } from '@wbs/core/service/dependency-graph';
import type { DependencyEndpoint } from '@wbs/domain';
import { TypedDependencyRepository } from '@wbs/store-sqlite/typed-dependency';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { buildApp } from '../app';
import { ActualRepository } from '../repository/actual';
import { CommandJournalRepository } from '../repository/command-journal';
import { openDrizzle } from '../repository/db';
import { DependencyRepository } from '../repository/dependency';
import { DirectoryRepository } from '../repository/directory';
import { EstimateRepository } from '../repository/estimate';
import { OPEN, WriteCoordinator } from '../repository/gate';
import { runMigrations } from '../repository/migrate';
import { ProjectRepository } from '../repository/project';
import { sqliteUnitOfWork } from '../repository/sqlite-unit-of-work';
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
import { buildStores } from '../services';
import { TEST_JWT_KEY } from '../testing/auth-fixture';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { testCalendarMarkerService } from '../testing/calendar-marker-fixture';
import { inMemoryCapacity, testCapacityService } from '../testing/capacity-fixture';
import { testClock } from '../testing/clock-fixture';
import { testHistoryService } from '../testing/history-fixture';
import { testLoginThrottle } from '../testing/login-throttle-fixture';
import { legacyOrganizationAccess } from '../testing/organization-access-fixture';
import { inMemoryPriorityBands, testPriorityBandService } from '../testing/priority-band-fixture';
import { testReplay } from '../testing/replay-fixture';
import { testSavedPlanService } from '../testing/saved-plan-fixture';
import { testWrites } from '../testing/writes-fixture';

/**
 * Every write that can change the combined step-node graph, refused when the
 * state it would leave holds a cycle — over real SQLite and through the
 * routes, because the refusal has to roll back writes the command already
 * made (openspec/changes/add-step-finish-start-dependencies, task 2).
 *
 * Typed dependencies are seeded through the repository: the commands that
 * write them are task 4's. Each project holds the starting steps Dev then QA,
 * and two leaves A and B.
 */
const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

let dir: string;
let app: ReturnType<typeof buildApp>;
let typed: TypedDependencyRepository;
let dependencies: DependencyRepository;
let estimates: EstimateRepository;
let projects: ProjectRepository;
let steps: StepRepository;
/** How many units of work the app has run, so a test can see a route write go through one. */
let admittedRuns: number;

beforeEach(() => {
  admittedRuns = 0;
  dir = mkdtempSync(join(tmpdir(), 'wbs-typed-graph-'));
  const db = openDrizzle(join(dir, 'test.db'));
  runMigrations(join(dir, 'test.db'), FOLDER);
  const journal = new CommandJournalRepository(db, OPEN);
  projects = new ProjectRepository(db, OPEN);
  steps = new StepRepository(db, OPEN);
  const workItems = new WorkItemRepository(db, OPEN);
  estimates = new EstimateRepository(db, OPEN);
  dependencies = new DependencyRepository(db, OPEN);
  typed = new TypedDependencyRepository(db, OPEN);
  const directory = new DirectoryRepository(db, OPEN);
  const dependencyGraph = new DependencyGraphGuard({
    projects,
    workItems,
    estimates,
    dependencies,
    typedDependencies: typed,
  });
  const writing = {
    directory: new DirectoryService({
      clock: testClock,
      directory,
      broadcast: recordingBroadcaster(),
    }),
    capacity: testCapacityService(),
    priorityBands: testPriorityBandService(),
    calendarMarkers: testCalendarMarkerService(),
    projects: new ProjectService({
      clock: testClock,
      projects,
      broadcast: recordingBroadcaster(),
      dependencyGraph,
    }),
    steps: new StepService({
      clock: testClock,
      projects,
      steps,
      broadcast: recordingBroadcaster(),
      dependencyGraph,
    }),
    workItems: new WorkItemService({
      scheduler: fastScheduler,
      clock: testClock,
      workItems,
      projects,
      estimates,
      actuals: new ActualRepository(db, OPEN),
      measures: new StepMeasureRepository(db, OPEN),
      progress: new StepProgressRepository(db, OPEN),
      dependencies,
      typedDependencies: typed,
      directory,
      capacity: inMemoryCapacity(),
      priorityBands: inMemoryPriorityBands(),
      subtrees: new SubtreeRepository(db, OPEN),
      journal,
      broadcast: recordingBroadcaster(),
    }),
  };
  app = buildApp({
    loginThrottle: testLoginThrottle(),
    clock: testClock,
    appOrigin: 'http://localhost',
    savedPlans: testSavedPlanService(),
    organizations: legacyOrganizationAccess,
    history: testHistoryService(),
    auth: new AuthService({
      clock: testClock,
      users: new UserRepository(db, OPEN),
      tokens: joseTokenCodec(TEST_JWT_KEY),
      passwords: bunPasswordHasher,
    }),
    ...writing,
    replay: testReplay().replay,
    probeDatabase: () => 'ok',
    internalAuthSecret: 'x'.repeat(32),
    // The real unit of work over this connection: every refusal here has to
    // take back writes its command already made, which only the transaction
    // can do. The counting unit of work the other harnesses use records a
    // rollback without performing one.
    writes: {
      ...testWrites(undefined, writing),
      uow: countingRuns(sqliteUnitOfWork(db, new WriteCoordinator(), buildStores(db, OPEN))),
    },
    migrationsApplied: true,
  });
});

function countingRuns(inner: UnitOfWork): UnitOfWork {
  return {
    run: (act) => {
      admittedRuns += 1;
      return inner.run(act);
    },
  };
}

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function send(
  path: string,
  token: string,
  init: { method?: string; body?: string } = {},
): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    }),
  );
}

function command(projectId: string, token: string, step: object): Promise<Response> {
  return send(`/api/projects/${projectId}/commands`, token, {
    method: 'POST',
    body: JSON.stringify({ commands: [step] }),
  });
}

interface Plan {
  token: string;
  userId: string;
  projectId: string;
  devId: string;
  qaId: string;
  a: string;
  b: string;
}

/** An owner, a project with Dev then QA, and two root leaves A and B. */
async function plan(): Promise<Plan> {
  const registered = await app.handle(
    new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'correct-horse' }),
    }),
  );
  const account = (await registered.json()) as { token: string; user: { id: string } };
  const created = await send('/api/projects', account.token, {
    method: 'POST',
    body: JSON.stringify({ name: 'Rewire the shed' }),
  });
  const body = (await created.json()) as {
    project: { id: string };
    steps: { id: string; name: string }[];
  };
  const stepId = (name: string): string => {
    const found = body.steps.find((each) => each.name === name);
    if (found === undefined) throw new Error(`a project without its ${name} step`);
    return found.id;
  };
  const add = async (name: string): Promise<string> => {
    const res = await command(body.project.id, account.token, {
      kind: 'createWorkItem',
      parentId: null,
      afterId: null,
      name,
    });
    const { results } = (await res.json()) as { results: { id?: string }[] };
    const id = results[0]?.id;
    if (id === undefined) throw new Error('createWorkItem minted no id');
    return id;
  };
  return {
    token: account.token,
    userId: account.user.id,
    projectId: body.project.id,
    devId: stepId('Dev'),
    qaId: stepId('QA'),
    a: await add('A'),
    b: await add('B'),
  };
}

const node = (workItemId: string, stepId: string): DependencyEndpoint => ({
  scope: 'node',
  workItemId,
  stepId,
});

/** Seeds one typed FS relationship through the repository, as task 4's command will write it. */
async function seedTyped(
  at: Plan,
  predecessor: DependencyEndpoint,
  successor: DependencyEndpoint,
): Promise<string> {
  const id = crypto.randomUUID();
  await typed.add(
    { id, projectId: at.projectId, predecessor, successor, type: 'FS' },
    { at: 1, by: at.userId },
  );
  return id;
}

const DAYS = { optimistic: 1, realistic: 2, pessimistic: 3 };

/** Every node estimated, reach `anchor-slice`, and legacy B → A anchored at B.dev. */
async function anchoredAtBDev(at: Plan): Promise<void> {
  const patched = await send(`/api/projects/${at.projectId}`, at.token, {
    method: 'PATCH',
    body: JSON.stringify({ depReach: 'anchor-slice' }),
  });
  expect(patched.status).toBe(200);
  for (const workItemId of [at.a, at.b]) {
    for (const stepId of [at.devId, at.qaId]) {
      const set = await command(at.projectId, at.token, {
        kind: 'setEstimate',
        workItemId,
        stepId,
        days: DAYS,
      });
      expect(set.status).toBe(200);
    }
  }
  const linked = await command(at.projectId, at.token, {
    kind: 'addDependency',
    workItemId: at.a,
    predecessorId: at.b,
  });
  expect(linked.status).toBe(200);
}

/** A second account, which writes to the same unrestricted project. */
async function registerOther(): Promise<string> {
  const registered = await app.handle(
    new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'other', password: 'correct-horse' }),
    }),
  );
  return ((await registered.json()) as { token: string }).token;
}

async function addUnder(at: Plan, parentId: string | null, name: string): Promise<string> {
  const res = await command(at.projectId, at.token, {
    kind: 'createWorkItem',
    parentId,
    afterId: null,
    name,
  });
  const id = ((await res.json()) as { results: { id?: string }[] }).results.at(0)?.id;
  if (id === undefined) throw new Error('createWorkItem minted no id');
  return id;
}

describe('route writes that check the graph', () => {
  /**
   * Proof: the app's `update` bound to `opts.projects.update` and its step
   * `remove` to `opts.steps.remove`, each in turn, made this case fail on
   * `Expected: 1, Received: 0` for the reach change and `Expected: 2,
   * Received: 1` for the removal; watched 2026-09-27.
   */
  it('runs a project reach change and a step removal as one unit of work each', async () => {
    const at = await plan();
    const before = admittedRuns;
    const patched = await send(`/api/projects/${at.projectId}`, at.token, {
      method: 'PATCH',
      body: JSON.stringify({ depReach: 'anchor-slice' }),
    });
    expect(patched.status).toBe(200);
    expect(admittedRuns - before).toBe(1);

    const removed = await send(`/api/projects/${at.projectId}/steps/${at.qaId}`, at.token, {
      method: 'DELETE',
    });
    expect(removed.status).toBe(204);
    expect(admittedRuns - before).toBe(2);
  });
});

describe('graph-changing writes on a legacy-only project', () => {
  it('refuses an undo of a move that a legacy link made cyclic', async () => {
    const at = await plan();
    const p = await addUnder(at, null, 'P');
    const q = await addUnder(at, null, 'Q');
    const x = await addUnder(at, p, 'X');
    const c = await addUnder(at, x, 'C');
    const moved = await command(at.projectId, at.token, {
      kind: 'moveWorkItem',
      workItemId: x,
      parentId: q,
      afterId: null,
    });
    expect(moved.status).toBe(200);
    // Somebody else makes C wait for P, which is fine while C sits under Q.
    const other = await registerOther();
    const linked = await command(at.projectId, other, {
      kind: 'addDependency',
      workItemId: c,
      predecessorId: p,
    });
    expect(linked.status).toBe(200);

    // Undoing the move puts C back under P: P → C is then an edge onto its
    // own descendant, a leaf-level cycle nothing else would refuse, because
    // a replayed move does not pass through `canReparent`.
    const res = await send(`/api/projects/${at.projectId}/undo`, at.token, { method: 'POST' });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'stale_undo',
      detail: 'that would now close a dependency cycle between steps.',
    });
  });
});

describe('graph-changing writes against typed dependencies', () => {
  it('refuses a legacy link that closes a step-node cycle and writes nothing', async () => {
    const at = await plan();
    await seedTyped(at, node(at.a, at.qaId), node(at.b, at.qaId));

    // Legacy B → A under whole-item leaves B.qa and enters A.dev, and A.dev
    // reaches A.qa, which the typed relationship joins to B.qa.
    const res = await command(at.projectId, at.token, {
      kind: 'addDependency',
      workItemId: at.a,
      predecessorId: at.b,
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'cycle', at: 0, kind: 'addDependency' });
    expect(await dependencies.listByProject(at.projectId)).toEqual([]);
  });

  it('accepts a graph-changing write when the typed edges only look cyclic by work item', async () => {
    const at = await plan();
    // A.dev → B.dev beside B.qa → A.qa: A and B wait for each other by work
    // item, and the step-node graph is a DAG.
    await seedTyped(at, node(at.a, at.devId), node(at.b, at.devId));
    await seedTyped(at, node(at.b, at.qaId), node(at.a, at.qaId));

    const res = await command(at.projectId, at.token, {
      kind: 'setEstimate',
      workItemId: at.a,
      stepId: at.devId,
      days: DAYS,
    });

    expect(res.status).toBe(200);
  });

  it('refuses an estimate clearing that moves a legacy anchor into a cycle', async () => {
    const at = await plan();
    await anchoredAtBDev(at);
    await seedTyped(at, node(at.a, at.qaId), node(at.b, at.qaId));

    // Clearing B.dev moves the anchor to B.qa, and B.qa → A.dev → A.qa → B.qa.
    const res = await command(at.projectId, at.token, {
      kind: 'clearEstimate',
      workItemId: at.b,
      stepId: at.devId,
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'cycle', at: 0, kind: 'clearEstimate' });
    const kept = (await estimates.listByProject(at.projectId)).filter(
      (each) => each.workItemId === at.b && each.stepId === at.devId,
    );
    expect(kept).toHaveLength(1);
  });

  it('refuses a depReach change that closes a step-node cycle', async () => {
    const at = await plan();
    await anchoredAtBDev(at);
    await seedTyped(at, node(at.a, at.qaId), node(at.b, at.qaId));

    const res = await send(`/api/projects/${at.projectId}`, at.token, {
      method: 'PATCH',
      body: JSON.stringify({ depReach: 'whole-item' }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'dependency_cycle' });
    expect((await projects.findById(at.projectId))?.depReach).toBe('anchor-slice');
  });

  it('refuses a move that brings a successor under its own whole predecessor', async () => {
    const at = await plan();
    const parent = await command(at.projectId, at.token, {
      kind: 'createWorkItem',
      parentId: null,
      afterId: null,
      name: 'P',
    });
    const parentId = ((await parent.json()) as { results: { id: string }[] }).results.at(0)?.id;
    if (parentId === undefined) throw new Error('createWorkItem minted no id');
    const child = await command(at.projectId, at.token, {
      kind: 'createWorkItem',
      parentId,
      afterId: null,
      name: 'C',
    });
    expect(child.status).toBe(200);
    await seedTyped(at, { scope: 'whole', workItemId: parentId }, node(at.b, at.devId));

    // Under P, B is one of P's leaves: whole P → B.dev includes B.qa → B.dev,
    // which B's own Dev → QA chain closes.
    const res = await command(at.projectId, at.token, {
      kind: 'moveWorkItem',
      workItemId: at.b,
      parentId,
      afterId: null,
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'cycle', at: 0, kind: 'moveWorkItem' });
  });

  it('refuses an undo that would close a step-node cycle', async () => {
    const at = await plan();
    await anchoredAtBDev(at);
    await seedTyped(at, node(at.a, at.qaId), node(at.b, at.qaId));
    const removed = await command(at.projectId, at.token, {
      kind: 'removeDependency',
      workItemId: at.a,
      predecessorId: at.b,
    });
    expect(removed.status).toBe(200);
    // With the legacy link gone, whole-item is acyclic. Undoing the removal
    // would put B → A back under whole-item: B.qa → A.dev → A.qa → B.qa.
    // The reach change moves no work item's revision, so the entry is not
    // stale and only the graph check can refuse it.
    const patched = await send(`/api/projects/${at.projectId}`, at.token, {
      method: 'PATCH',
      body: JSON.stringify({ depReach: 'whole-item' }),
    });
    expect(patched.status).toBe(200);

    const res = await send(`/api/projects/${at.projectId}/undo`, at.token, { method: 'POST' });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'stale_undo',
      detail: 'that would now close a dependency cycle between steps.',
    });
    expect(await dependencies.listByProject(at.projectId)).toEqual([]);
  });

  it('refuses removing a step a typed dependency names, whatever cascade says', async () => {
    const at = await plan();
    const named = await seedTyped(at, node(at.a, at.qaId), node(at.b, at.devId));

    const res = await send(
      `/api/projects/${at.projectId}/steps/${at.qaId}?cascade=true`,
      at.token,
      { method: 'DELETE' },
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'referenced_by_dependency',
      dependencyIds: [named],
    });
    expect((await projects.stepsOf(at.projectId)).map((step) => step.id)).toContain(at.qaId);
  });

  it('refuses removing a step that moves a legacy anchor into a cycle', async () => {
    const at = await plan();
    await anchoredAtBDev(at);
    await seedTyped(at, node(at.a, at.qaId), node(at.b, at.qaId));

    // Without Dev, legacy B → A leaves B.qa and enters A.qa, which the typed
    // relationship joins back to B.qa.
    const res = await send(
      `/api/projects/${at.projectId}/steps/${at.devId}?cascade=true`,
      at.token,
      { method: 'DELETE' },
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'dependency_cycle' });
    expect((await steps.findById(at.devId))?.id).toBe(at.devId);
  });
});
