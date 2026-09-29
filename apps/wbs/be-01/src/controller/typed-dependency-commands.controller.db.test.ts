import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CREATOR_ADMISSION } from '@wbs/core';
import { DirectoryService } from '@wbs/core/module/directory/directory.resource';
import { ProjectService } from '@wbs/core/module/project/project.resource';
import { StepService } from '@wbs/core/module/step/step.resource';
import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import { AuthService } from '@wbs/core/service/auth.service';
import { DependencyGraphGuard } from '@wbs/core/service/dependency-graph';
import { type DependencyEndpoint, sliceKey } from '@wbs/domain';
import { TypedDependencyRepository } from '@wbs/store-sqlite/typed-dependency';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { buildApp } from '../app';
import { ActualRepository } from '../repository/actual';
import { CommandJournalRepository } from '../repository/command-journal';
import { openDatabase, openDrizzle } from '../repository/db';
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
import { fastScheduler } from '../service/optimizer-wiring';
import { evaluateSolverOutcome } from '../service/solver-exit-outcome';
import { buildSolverRequestPair } from '../service/solver-request-pair';
import { buildStores } from '../services';
import { TEST_JWT_KEY } from '../testing/auth-fixture';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { testCalendarMarkerService } from '../testing/calendar-marker-fixture';
import { inMemoryCapacity, testCapacityService } from '../testing/capacity-fixture';
import { testClock } from '../testing/clock-fixture';
import {
  refusingEmailVerification,
  refusingInvitations,
  refusingJoinRequests,
  refusingTestEmailDelivery,
} from '../testing/email-verification-fixture';
import { testHistoryService } from '../testing/history-fixture';
import { testLoginThrottle } from '../testing/login-throttle-fixture';
import { refusingOnboarding } from '../testing/onboarding-fixture';
import {
  legacyOrganizationAccess,
  refusingDomains,
  refusingMemberships,
} from '../testing/organization-access-fixture';
import { inMemoryPriorityBands, testPriorityBandService } from '../testing/priority-band-fixture';
import { testReplay } from '../testing/replay-fixture';
import { testSavedPlanService } from '../testing/saved-plan-fixture';
import { refusingSpaces } from '../testing/space-fixture';
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
let workItemService: WorkItemService;

beforeEach(() => {
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
      admission: CREATOR_ADMISSION,
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
  workItemService = writing.workItems;
  app = buildApp({
    loginThrottle: testLoginThrottle(),
    clock: testClock,
    appOrigin: 'http://localhost',
    savedPlans: testSavedPlanService(),
    organizations: legacyOrganizationAccess,
    memberships: refusingMemberships,
    domains: refusingDomains,
    emailVerification: refusingEmailVerification,
    invitations: refusingInvitations,
    joinRequests: refusingJoinRequests,
    spaces: refusingSpaces,
    emailDelivery: refusingTestEmailDelivery,
    onboarding: refusingOnboarding,
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
      batch: (scope, broadcast) => ({
        ...writing,
        workItems: new WorkItemService({
          admission: CREATOR_ADMISSION,
          scheduler: fastScheduler,
          clock: testClock,
          workItems: scope.stores.workItems,
          projects: scope.stores.projects,
          estimates: scope.stores.estimates,
          actuals: scope.stores.actuals,
          measures: scope.stores.measures,
          progress: scope.stores.progress,
          dependencies: scope.stores.dependencies,
          typedDependencies: scope.stores.typedDependencies,
          directory: scope.stores.directory,
          capacity: scope.stores.capacity,
          priorityBands: scope.stores.priorityBands,
          subtrees: scope.stores.subtrees,
          journal: scope.stores.journal,
          broadcast,
        }),
      }),
      uow: sqliteUnitOfWork(db, new WriteCoordinator(), buildStores(db, OPEN)),
    },
    migrationsApplied: true,
  });
});

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

it('adds a typed node dependency and exposes its minted identity on the tree', async () => {
  const at = await plan();
  const res = await command(at.projectId, at.token, {
    kind: 'addTypedDependency',
    predecessor: { scope: 'node', workItemId: at.a, stepId: at.devId },
    successor: { scope: 'node', workItemId: at.b, stepId: at.devId },
    type: 'FS',
  });
  expect(res.status).toBe(200);
  const reply = (await res.json()) as { results: { id: string }[] };
  expect(reply.results[0]?.id).toBeString();
  const tree = await send(`/api/projects/${at.projectId}/work-items`, at.token);
  const read = (await tree.json()) as { typedDependencies: { id: string }[] };
  expect(read.typedDependencies[0]?.id).toBe(reply.results[0]?.id);
});

const whole = (workItemId: string) => ({ scope: 'whole', workItemId });
const typedCommand = (
  at: Plan,
  predecessor: object = node(at.a, at.devId),
  successor: object = node(at.b, at.devId),
) => ({
  kind: 'addTypedDependency',
  predecessor,
  successor,
  type: 'FS',
});

it('accepts node IDs, updates endpoints under one ID, and removes the relationship', async () => {
  const at = await plan();
  const first = await command(
    at.projectId,
    at.token,
    typedCommand(at, {
      scope: 'node',
      stepNodeId: `sn1.${at.a}.${at.devId}`,
    }),
  );
  expect(first.status).toBe(200);
  const id = ((await first.json()) as { results: { id: string }[] }).results[0]?.id;
  expect(id).toBeString();
  const read = await send(`/api/projects/${at.projectId}/work-items`, at.token);
  const tree = (await read.json()) as {
    typedDependencies: { id: string; predecessor: { stepNodeId: string } }[];
  };
  expect(tree.typedDependencies[0]).toMatchObject({
    id,
    predecessor: { stepNodeId: `sn1.${at.a}.${at.devId}` },
  });
  const changed = await command(at.projectId, at.token, {
    kind: 'updateTypedDependency',
    dependencyId: id,
    predecessor: node(at.a, at.qaId),
    successor: whole(at.b),
    type: 'FS',
  });
  expect(changed.status).toBe(200);
  expect((await typed.listByProject(at.projectId))[0]).toMatchObject({
    id,
    predecessor: node(at.a, at.qaId),
    successor: whole(at.b),
  });
  const removed = await command(at.projectId, at.token, {
    kind: 'removeTypedDependency',
    dependencyId: id,
  });
  expect(removed.status).toBe(200);
  expect(await typed.listByProject(at.projectId)).toEqual([]);
});

it('keeps legacy addDependency semantics and stores no typed row', async () => {
  const at = await plan();
  const reply = await command(at.projectId, at.token, {
    kind: 'addDependency',
    workItemId: at.b,
    predecessorId: at.a,
  });
  expect(reply.status).toBe(200);
  expect(await typed.listByProject(at.projectId)).toEqual([]);
  const tree = await send(`/api/projects/${at.projectId}/work-items`, at.token);
  const read = (await tree.json()) as { workItems: { id: string; dependsOn: string[] }[] };
  expect(read.workItems.find((row) => row.id === at.b)?.dependsOn).toContain(at.a);
});

it('refuses malformed endpoints before applying any command', async () => {
  const at = await plan();
  for (const predecessor of [
    { scope: 'whole', workItemId: at.a, stepId: at.devId },
    { scope: 'node', workItemId: at.a },
  ]) {
    const reply = await command(at.projectId, at.token, typedCommand(at, predecessor));
    expect(reply.status).toBe(400);
    expect(await reply.json()).toMatchObject({ error: 'invalid_typed_endpoint', at: 0 });
  }
});

/**
 * A body the schema already refused still reaches the normalizer, which
 * classifies it; a missing, null or wrongly typed endpoint must be the
 * endpoint's indexed refusal and never a 500.
 */
it('refuses a missing or malformed endpoint as 400', async () => {
  const at = await plan();
  for (const predecessor of [
    null,
    undefined,
    'whole',
    { scope: 'sideways', workItemId: at.a },
    { scope: 'node', stepNodeId: 7 },
    { scope: 'whole', workItemId: 7 },
  ]) {
    const reply = await command(at.projectId, at.token, {
      kind: 'addTypedDependency',
      ...(predecessor === undefined ? {} : { predecessor }),
      successor: node(at.b, at.devId),
      type: 'FS',
    });
    expect(reply.status).toBe(400);
    expect(await reply.json()).toMatchObject({ error: 'invalid_typed_endpoint', at: 0 });
  }
});

it('refuses invalid typed endpoints, duplicate keys, unsupported types and absent relationships', async () => {
  const at = await plan();
  const parentReply = await command(at.projectId, at.token, {
    kind: 'createWorkItem',
    name: 'Child',
    parentId: at.a,
    afterId: null,
  });
  expect(parentReply.status).toBe(200);
  const cases = [
    [node(at.b, 'missing'), 'unknown_step', 404],
    [node(at.a, at.devId), 'rolled_up', 409],
    [{ scope: 'descendant-step', workItemId: at.b, stepId: at.devId }, 'not_a_parent', 409],
    [whole('missing'), 'not_found', 404],
  ] as const;
  for (const [predecessor, reason, status] of cases) {
    const reply = await command(at.projectId, at.token, typedCommand(at, predecessor));
    expect(reply.status).toBe(status);
    expect(await reply.json()).toMatchObject({ error: reason, at: 0 });
  }
  const unsupported = await command(at.projectId, at.token, {
    ...typedCommand(at, whole(at.a)),
    type: 'SF',
  });
  expect(unsupported.status).toBe(400);
  expect(await unsupported.json()).toMatchObject({ error: 'invalid_body' });
  const first = await command(at.projectId, at.token, typedCommand(at, whole(at.a)));
  expect(first.status).toBe(200);
  const duplicate = await command(at.projectId, at.token, typedCommand(at, whole(at.a)));
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({ error: 'duplicate_dependency' });
  const absent = await command(at.projectId, at.token, {
    kind: 'removeTypedDependency',
    dependencyId: 'missing',
  });
  expect(absent.status).toBe(404);
  expect(await absent.json()).toMatchObject({ error: 'unknown_dependency' });
});

it('retains FS and SS on the same endpoints but refuses a duplicate SS', async () => {
  const at = await plan();
  const first = await command(at.projectId, at.token, typedCommand(at));
  expect(first.status).toBe(200);
  const second = await command(at.projectId, at.token, { ...typedCommand(at), type: 'SS' });
  expect(second.status).toBe(200);
  const duplicate = await command(at.projectId, at.token, { ...typedCommand(at), type: 'SS' });
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({ error: 'duplicate_dependency', at: 0 });
  expect((await typed.listByProject(at.projectId)).map((row) => row.type).sort()).toEqual([
    'FS',
    'SS',
  ]);
});

it('refuses an unsupported typed update at the HTTP boundary without changing the row', async () => {
  const at = await plan();
  const added = await command(at.projectId, at.token, typedCommand(at));
  expect(added.status).toBe(200);
  const id = ((await added.json()) as { results: { id: string }[] }).results[0]?.id;
  const changed = await command(at.projectId, at.token, {
    kind: 'updateTypedDependency',
    dependencyId: id,
    predecessor: node(at.a, at.qaId),
    successor: whole(at.b),
    type: 'SF',
  });
  expect(changed.status).toBe(400);
  expect(await changed.json()).toMatchObject({ error: 'invalid_body' });
  expect((await typed.listByProject(at.projectId))[0]).toMatchObject({
    id,
    predecessor: node(at.a, at.devId),
    successor: node(at.b, at.devId),
    type: 'FS',
  });
});

it('undoes an FF to SS update to the exact FF relationship and redoes SS', async () => {
  const at = await plan();
  const added = await command(at.projectId, at.token, { ...typedCommand(at), type: 'FF' });
  expect(added.status).toBe(200);
  const id = ((await added.json()) as { results: { id: string }[] }).results[0]?.id;
  const changed = await command(at.projectId, at.token, {
    kind: 'updateTypedDependency',
    dependencyId: id,
    predecessor: node(at.a, at.qaId),
    successor: whole(at.b),
    type: 'SS',
  });
  expect(changed.status).toBe(200);
  const undo = await send(`/api/projects/${at.projectId}/undo`, at.token, { method: 'POST' });
  expect(undo.status).toBe(200);
  expect((await typed.listByProject(at.projectId))[0]).toMatchObject({
    id,
    predecessor: node(at.a, at.devId),
    successor: node(at.b, at.devId),
    type: 'FF',
  });
  const redo = await send(`/api/projects/${at.projectId}/redo`, at.token, { method: 'POST' });
  expect(redo.status).toBe(200);
  expect((await typed.listByProject(at.projectId))[0]).toMatchObject({
    id,
    predecessor: node(at.a, at.qaId),
    successor: whole(at.b),
    type: 'SS',
  });
});

it('refuses a later cycle command after an SS add and rolls back the batch', async () => {
  const at = await plan();
  const response = await send(`/api/projects/${at.projectId}/commands`, at.token, {
    method: 'POST',
    body: JSON.stringify({
      commands: [
        { ...typedCommand(at, node(at.a, at.qaId), node(at.b, at.qaId)), type: 'SS' },
        typedCommand(at, node(at.b, at.qaId), node(at.a, at.devId)),
      ],
    }),
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    error: 'cycle',
    at: 1,
    kind: 'addTypedDependency',
  });
  expect(await typed.listByProject(at.projectId)).toEqual([]);
});

it('refuses a later legacy add that closes an SS cycle and rolls back the batch', async () => {
  const at = await plan();
  const response = await send(`/api/projects/${at.projectId}/commands`, at.token, {
    method: 'POST',
    body: JSON.stringify({
      commands: [
        { ...typedCommand(at, whole(at.a), whole(at.b)), type: 'SS' },
        { kind: 'addDependency', workItemId: at.a, predecessorId: at.b },
      ],
    }),
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: 'cycle', at: 1, kind: 'addDependency' });
  expect(await typed.listByProject(at.projectId)).toEqual([]);
  expect(await dependencies.listByProject(at.projectId)).toEqual([]);
});

it('refuses a self node and a step-node cycle before writing', async () => {
  const at = await plan();
  const self = await command(
    at.projectId,
    at.token,
    typedCommand(at, node(at.a, at.devId), node(at.a, at.devId)),
  );
  expect(self.status).toBe(409);
  expect(await self.json()).toMatchObject({ error: 'self_node' });
  const first = await command(
    at.projectId,
    at.token,
    typedCommand(at, node(at.a, at.qaId), node(at.b, at.qaId)),
  );
  expect(first.status).toBe(200);
  const cycle = await command(
    at.projectId,
    at.token,
    typedCommand(at, node(at.b, at.qaId), node(at.a, at.devId)),
  );
  expect(cycle.status).toBe(409);
  expect(await cycle.json()).toMatchObject({ error: 'cycle' });
  expect(await typed.listByProject(at.projectId)).toHaveLength(1);
});

it('resolves a batch-local node reference and rolls back a later refusal', async () => {
  const at = await plan();
  const steps = [
    { kind: 'createWorkItem', ref: 'c', name: 'C', parentId: null, afterId: null },
    {
      kind: 'addTypedDependency',
      predecessor: { scope: 'node', workItemRef: 'c', stepId: at.devId },
      successor: node(at.b, at.devId),
      type: 'FS',
    },
  ];
  const sent = async (commands: object[]) =>
    send(`/api/projects/${at.projectId}/commands`, at.token, {
      method: 'POST',
      body: JSON.stringify({ commands }),
    });
  const refused = await sent([
    ...steps,
    {
      kind: 'addTypedDependency',
      predecessor: node(at.a, 'missing'),
      successor: node(at.b, at.qaId),
      type: 'FS',
    },
  ]);
  expect(refused.status).toBe(404);
  expect(await refused.json()).toMatchObject({ error: 'unknown_step', at: 2 });
  expect(await typed.listByProject(at.projectId)).toEqual([]);
  const kept = await sent(steps);
  expect(kept.status).toBe(200);
  const applied = (await kept.json()) as { results: { id: string }[] };
  expect((await typed.listByProject(at.projectId))[0]?.predecessor).toEqual(
    node(applied.results[0]?.id ?? '', at.devId),
  );
});

it('undoes and redoes a typed update with its exact ID and endpoints', async () => {
  const at = await plan();
  const added = await command(at.projectId, at.token, typedCommand(at));
  const id = ((await added.json()) as { results: { id: string }[] }).results[0]?.id;
  const changed = await command(at.projectId, at.token, {
    kind: 'updateTypedDependency',
    dependencyId: id,
    predecessor: node(at.a, at.qaId),
    successor: whole(at.b),
    type: 'FS',
  });
  expect(changed.status).toBe(200);
  const undo = await send(`/api/projects/${at.projectId}/undo`, at.token, { method: 'POST' });
  expect(undo.status).toBe(200);
  expect((await typed.listByProject(at.projectId))[0]).toMatchObject({
    id,
    predecessor: node(at.a, at.devId),
    successor: node(at.b, at.devId),
    type: 'FS',
  });
  const redo = await send(`/api/projects/${at.projectId}/redo`, at.token, { method: 'POST' });
  expect(redo.status).toBe(200);
  expect((await typed.listByProject(at.projectId))[0]).toMatchObject({
    id,
    predecessor: node(at.a, at.qaId),
    successor: whole(at.b),
    type: 'FS',
  });
});

it('refuses stale undo after another account changes the relationship', async () => {
  const at = await plan();
  const registered = await app.handle(
    new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'peer', password: 'correct-horse' }),
    }),
  );
  const peer = (await registered.json()) as { token: string };
  const added = await command(at.projectId, at.token, typedCommand(at));
  const id = ((await added.json()) as { results: { id: string }[] }).results[0]?.id;
  const changed = await command(at.projectId, peer.token, {
    kind: 'updateTypedDependency',
    dependencyId: id,
    predecessor: node(at.a, at.qaId),
    successor: whole(at.b),
    type: 'FS',
  });
  expect(changed.status).toBe(200);
  const undo = await send(`/api/projects/${at.projectId}/undo`, at.token, { method: 'POST' });
  expect(undo.status).toBe(409);
  expect(await undo.json()).toMatchObject({ error: 'stale_undo' });
  expect((await typed.listByProject(at.projectId))[0]).toMatchObject({
    id,
    predecessor: node(at.a, at.qaId),
    successor: whole(at.b),
  });
});

it('refuses undo when the stored relationship changed outside the journal', async () => {
  const at = await plan();
  const added = await command(at.projectId, at.token, typedCommand(at));
  expect(added.status).toBe(200);
  const stored = (await typed.listByProject(at.projectId)).at(0);
  if (stored === undefined) throw new Error('typed add did not persist');
  await typed.update({ ...stored, predecessor: node(at.a, at.qaId) }, { at: 2, by: at.userId });
  // Keep the row revision at the entry's expected value to exercise apply's
  // exact relationship check independently of the ordinary revision guard.
  const sqlite = openDatabase(join(dir, 'test.db'));
  try {
    sqlite.query('UPDATE work_item SET revision = revision - 1 WHERE id IN (?, ?)').run(at.a, at.b);
  } finally {
    sqlite.close();
  }
  const undo = await send(`/api/projects/${at.projectId}/undo`, at.token, { method: 'POST' });
  expect(undo.status).toBe(409);
  expect(await undo.json()).toMatchObject({
    error: 'stale_undo',
    detail: 'that relationship has changed since this command.',
  });
  expect((await typed.listByProject(at.projectId))[0]?.predecessor).toEqual(node(at.a, at.qaId));
});

/**
 * The update branch's own stale check: the entry here is an update, so undo
 * replays `update_typed_dependency`, and the revisions are put back so only the
 * relationship comparison can refuse it.
 *
 * Proof: the `sameTypedDependency` comparison in the `update_typed_dependency`
 * replay disabled made this case fail on `Expected: 409, Received: 200`;
 * watched 2026-09-27.
 */
it('refuses undo of an update when the stored relationship changed outside the journal', async () => {
  const at = await plan();
  const added = await command(at.projectId, at.token, typedCommand(at));
  expect(added.status).toBe(200);
  const stored = (await typed.listByProject(at.projectId)).at(0);
  if (stored === undefined) throw new Error('typed add did not persist');
  const updated = await command(at.projectId, at.token, {
    kind: 'updateTypedDependency',
    dependencyId: stored.id,
    predecessor: node(at.a, at.qaId),
    successor: node(at.b, at.qaId),
    type: 'FS',
  });
  expect(updated.status).toBe(200);
  const sqlite = openDatabase(join(dir, 'test.db'));
  try {
    // A change nobody journalled, with the revisions the entry expects kept.
    sqlite
      .query('UPDATE typed_dependency SET successor_step_id = ? WHERE id = ?')
      .run(at.devId, stored.id);
  } finally {
    sqlite.close();
  }
  const undo = await send(`/api/projects/${at.projectId}/undo`, at.token, { method: 'POST' });
  expect(undo.status).toBe(409);
  expect(await undo.json()).toMatchObject({
    error: 'stale_undo',
    detail: 'that relationship has changed since this command.',
  });
  expect((await typed.listByProject(at.projectId)).at(0)?.successor).toEqual(node(at.b, at.devId));
});

it('refuses undo when only a journalled relationship type changed outside history', async () => {
  const at = await plan();
  const added = await command(at.projectId, at.token, { ...typedCommand(at), type: 'FF' });
  expect(added.status).toBe(200);
  const stored = (await typed.listByProject(at.projectId)).at(0);
  if (stored === undefined) throw new Error('typed add did not persist');
  const updated = await command(at.projectId, at.token, {
    kind: 'updateTypedDependency',
    dependencyId: stored.id,
    predecessor: stored.predecessor,
    successor: stored.successor,
    type: 'SS',
  });
  expect(updated.status).toBe(200);
  const sqlite = openDatabase(join(dir, 'test.db'));
  try {
    sqlite.query('UPDATE typed_dependency SET type = ? WHERE id = ?').run('FS', stored.id);
  } finally {
    sqlite.close();
  }
  const undo = await send(`/api/projects/${at.projectId}/undo`, at.token, { method: 'POST' });
  expect(undo.status).toBe(409);
  expect(await undo.json()).toMatchObject({ error: 'stale_undo' });
  expect((await typed.listByProject(at.projectId)).at(0)?.type).toBe('FS');
});

it('rejects a cycle introduced by the second typed add', async () => {
  const at = await plan();
  const first = await command(
    at.projectId,
    at.token,
    typedCommand(at, node(at.a, at.qaId), node(at.b, at.qaId)),
  );
  expect(first.status).toBe(200);
  const second = await command(
    at.projectId,
    at.token,
    typedCommand(at, node(at.b, at.qaId), node(at.a, at.devId)),
  );
  expect(second.status).toBe(409);
  expect(await second.json()).toMatchObject({ error: 'cycle' });
  expect(await typed.listByProject(at.projectId)).toHaveLength(1);
});

it('sees the first typed relationship when a later batch command closes a cycle', async () => {
  const at = await plan();
  const response = await send(`/api/projects/${at.projectId}/commands`, at.token, {
    method: 'POST',
    body: JSON.stringify({
      commands: [
        typedCommand(at, node(at.a, at.qaId), node(at.b, at.qaId)),
        typedCommand(at, node(at.b, at.qaId), node(at.a, at.devId)),
      ],
    }),
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    error: 'cycle',
    at: 1,
    kind: 'addTypedDependency',
  });
  expect(await typed.listByProject(at.projectId)).toEqual([]);
});

it('refuses redo when its relationship ID has been reused', async () => {
  const at = await plan();
  const added = await command(at.projectId, at.token, typedCommand(at));
  expect(added.status).toBe(200);
  const stored = (await typed.listByProject(at.projectId)).at(0);
  if (stored === undefined) throw new Error('typed add did not persist');
  const undo = await send(`/api/projects/${at.projectId}/undo`, at.token, { method: 'POST' });
  expect(undo.status).toBe(200);
  await typed.add(stored, { at: 2, by: at.userId });
  const sqlite = openDatabase(join(dir, 'test.db'));
  try {
    sqlite.query('UPDATE work_item SET revision = revision - 1 WHERE id IN (?, ?)').run(at.a, at.b);
  } finally {
    sqlite.close();
  }
  const redo = await send(`/api/projects/${at.projectId}/redo`, at.token, { method: 'POST' });
  expect(redo.status).toBe(409);
  expect(await redo.json()).toMatchObject({
    error: 'stale_undo',
    detail: 'that relationship identity is already in use.',
  });
});

/**
 * The commands path end to end, now that SS/FF writes are open: a plan whose
 * relationships were written through `addTypedDependency` reaches the solver
 * seam, and a solver answer that abuts on its own axis publishes rather than
 * failing as `invalid-output`.
 *
 * X (1 day), then A (PERT 0.5/0.75/1.5 = 5/6 of a day, `exact` rounding), then B,
 * with X→B SS so the weighted placement runs. The answer is the quantised Fast
 * baseline itself, which pins A at unit 48 and B at unit 88: B starts exactly
 * where A finishes on the solver axis, and 1 + 5/6 differs from 88/48 by one
 * ulp in the real domain.
 *
 * Proof: with `schedule.ts` and `real-boundaries.ts` reverted to their state
 * before batch-9/010-4-7-weighted-pin-drift (the strict `<` pinned-bound
 * refusal), this test failed with `{ kind: 'failed', reason: 'invalid-output' }`
 * where `ok` was expected; watched 2026-09-29.
 */
it('publishes a tight solver answer for an SS/FF plan written through the commands', async () => {
  const at = await plan();
  const exact = await send(`/api/projects/${at.projectId}`, at.token, {
    method: 'PATCH',
    body: JSON.stringify({ estimateRounding: 'exact' }),
  });
  expect(exact.status).toBe(200);
  const created = await command(at.projectId, at.token, {
    kind: 'createWorkItem',
    parentId: null,
    afterId: null,
    name: 'X',
  });
  const x = ((await created.json()) as { results: { id?: string }[] }).results[0]?.id;
  if (x === undefined) throw new Error('createWorkItem minted no id');
  const estimate = (workItemId: string, days: number[]) => ({
    kind: 'setEstimate',
    workItemId,
    stepId: at.devId,
    days: { optimistic: days[0], realistic: days[1], pessimistic: days[2] },
  });
  const link = (predecessor: string, successor: string, type: 'FS' | 'SS') => ({
    kind: 'addTypedDependency',
    predecessor: whole(predecessor),
    successor: whole(successor),
    type,
  });
  const written = await send(`/api/projects/${at.projectId}/commands`, at.token, {
    method: 'POST',
    body: JSON.stringify({
      commands: [
        estimate(x, [1, 1, 1]),
        estimate(at.a, [0.5, 0.75, 1.5]),
        estimate(at.b, [1, 1, 1]),
        link(x, at.a, 'FS'),
        link(x, at.b, 'SS'),
        link(at.a, at.b, 'FS'),
      ],
    }),
  });
  expect(written.status).toBe(200);

  const input = await workItemService.scheduleInput(at.projectId);
  if (input === null) throw new Error('the written project has no schedule input');
  expect(input.typed.map((dependency) => dependency.type).sort()).toEqual(['FS', 'FS', 'SS']);
  const pair = buildSolverRequestPair(input, '0.1.4', 60_000);
  if (!pair.time.ok) throw new Error('the written plan was refused a solver request');
  const request = pair.time.request;
  const offsets = request.baselineOffsets;
  const a = sliceKey(at.a, at.devId);
  const b = sliceKey(at.b, at.devId);
  expect([offsets[a], offsets[b]]).toEqual([48, 88]);

  let makespan = 0;
  let priority = 0;
  for (const slice of request.slices) {
    const finish = offsets[slice.key] + slice.durationUnits;
    makespan = Math.max(makespan, finish);
    priority += slice.priorityWeight * finish;
  }
  const term = (value: number) => ({ value, stageValue: value, bound: value, status: 'optimal' });
  const stdout = `${JSON.stringify({
    wireVersion: request.wireVersion,
    status: 'feasible',
    offsets,
    objectiveValues: { makespan: term(makespan), priority: term(priority), movement: term(0) },
  })}\n`;

  const outcome = evaluateSolverOutcome(input, request, { kind: 'response', stdout });
  expect(outcome).toMatchObject({ kind: 'ok' });
  if (outcome.kind !== 'ok') return;
  const placed = outcome.optimized.schedule.slices;
  expect(placed.get(b)?.earliestStart).toBeGreaterThanOrEqual(placed.get(a)?.earliestFinish ?? NaN);
});
