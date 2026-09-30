import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CREATOR_ADMISSION } from '@wbs/core';
import { DependencyGraphGuard } from '@wbs/core/service/dependency-graph';
import type { DependencyEndpoint } from '@wbs/domain';
import { TypedDependencyRepository } from '@wbs/store-sqlite/typed-dependency';
import { afterEach, beforeEach, expect, it } from 'bun:test';

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
import { refusingOnboarding } from '../testing/onboarding-fixture';
import {
  legacyOrganizationAccess,
  refusingDomains,
  refusingMemberships,
} from '../testing/organization-access-fixture';
import { inMemoryPriorityBands, testPriorityBandService } from '../testing/priority-band-fixture';
import { testReplay } from '../testing/replay-fixture';
import { testSavedPlanService } from '../testing/saved-plan-fixture';
import { testWrites } from '../testing/writes-fixture';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;
let folder: string;
let app: ReturnType<typeof buildApp>;
let typed: TypedDependencyRepository;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'wbs-typed-lifecycle-'));
  const db = openDrizzle(join(folder, 'test.db'));
  runMigrations(join(folder, 'test.db'), FOLDER);
  const projects = new ProjectRepository(db, OPEN);
  const steps = new StepRepository(db, OPEN);
  const workItems = new WorkItemRepository(db, OPEN);
  const estimates = new EstimateRepository(db, OPEN);
  const dependencies = new DependencyRepository(db, OPEN);
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
      journal: new CommandJournalRepository(db, OPEN),
      broadcast: recordingBroadcaster(),
    }),
  };
  app = buildApp({
    loginThrottle: testLoginThrottle(),
    clock: testClock,
    appOrigin: 'http://localhost',
    savedPlans: testSavedPlanService(),
    organizations: legacyOrganizationAccess,
    memberships: refusingMemberships,
    domains: refusingDomains,
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
  rmSync(folder, { recursive: true, force: true });
});

function send(path: string, token: string, body?: object, method?: 'POST'): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

async function setup() {
  const registered = await app.handle(
    new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'correct-horse' }),
    }),
  );
  const { token, user } = (await registered.json()) as { token: string; user: { id: string } };
  const created = await send('/api/projects', token, { name: 'Lifecycle' });
  const project = (await created.json()) as {
    project: { id: string };
    steps: { id: string; name: string }[];
  };
  const projectId = project.project.id;
  const devId = project.steps.find((step) => step.name === 'Dev')?.id;
  if (devId === undefined) throw new Error('Dev step missing');
  const qaId = project.steps.find((step) => step.name === 'QA')?.id;
  if (qaId === undefined) throw new Error('QA step missing');
  const command = (step: object) =>
    send(`/api/projects/${projectId}/commands`, token, { commands: [step] });
  const create = async (name: string, parentId: string | null = null) => {
    const response = await command({ kind: 'createWorkItem', name, parentId, afterId: null });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: { id: string }[] };
    return body.results[0].id;
  };
  const add = async (predecessor: object, successor: object) => {
    const response = await command({
      kind: 'addTypedDependency',
      predecessor,
      successor,
      type: 'FS',
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: { id: string }[] };
    return body.results[0].id;
  };
  return { token, userId: user.id, projectId, devId, qaId, command, create, add };
}

const node = (workItemId: string, stepId: string): DependencyEndpoint => ({
  scope: 'node',
  workItemId,
  stepId,
});
const whole = (workItemId: string): DependencyEndpoint => ({ scope: 'whole', workItemId });

it('remaps a node endpoint on first child create and restores it on undo and redo', async () => {
  const plan = await setup();
  const parent = await plan.create('010');
  const other = await plan.create('020');
  const id = await plan.add(node(parent, plan.devId), whole(other));
  const child = await plan.create('010.1', parent);
  const tree = await send(`/api/projects/${plan.projectId}/work-items`, plan.token);
  expect(await tree.json()).toMatchObject({
    typedDependencies: [{ id, predecessor: { stepNodeId: `sn1.${child}.${plan.devId}` } }],
  });
  expect(await typed.listByProject(plan.projectId)).toMatchObject([
    { id, predecessor: node(child, plan.devId) },
  ]);
  expect(
    (await send(`/api/projects/${plan.projectId}/undo`, plan.token, undefined, 'POST')).status,
  ).toBe(200);
  expect(await typed.listByProject(plan.projectId)).toMatchObject([
    { id, predecessor: node(parent, plan.devId) },
  ]);
  expect(
    (await send(`/api/projects/${plan.projectId}/redo`, plan.token, undefined, 'POST')).status,
  ).toBe(200);
  expect(await typed.listByProject(plan.projectId)).toMatchObject([
    { id, predecessor: node(child, plan.devId) },
  ]);
});

it('refuses moving a child onto a leaf with a pinned node endpoint', async () => {
  const plan = await setup();
  const pinned = await plan.create('010');
  const other = await plan.create('020');
  const moving = await plan.create('030');
  const id = await plan.add(node(pinned, plan.devId), whole(other));
  const response = await plan.command({
    kind: 'moveWorkItem',
    workItemId: moving,
    parentId: pinned,
    afterId: null,
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: 'node_on_parent', dependencyIds: [id] });
  expect(await typed.listByProject(plan.projectId)).toMatchObject([
    { id, predecessor: node(pinned, plan.devId) },
  ]);
});

it('removes a promoted parent endpoint and restores it with the parent', async () => {
  const plan = await setup();
  const parent = await plan.create('010');
  await plan.create('010.1', parent);
  const other = await plan.create('020');
  const id = await plan.add(whole(parent), whole(other));
  expect(
    (
      await plan.command({
        kind: 'deleteWorkItem',
        workItemId: parent,
        strategy: 'promote',
      })
    ).status,
  ).toBe(200);
  expect(await typed.listByProject(plan.projectId)).toEqual([]);
  expect(
    (await send(`/api/projects/${plan.projectId}/undo`, plan.token, undefined, 'POST')).status,
  ).toBe(200);
  expect(await typed.listByProject(plan.projectId)).toMatchObject([
    { id, predecessor: whole(parent), successor: whole(other) },
  ]);
});

it('removes node and whole endpoints on delete and restores their identities on undo', async () => {
  const plan = await setup();
  const doomed = await plan.create('010');
  const other = await plan.create('020');
  const first = await plan.add(node(doomed, plan.devId), whole(other));
  const second = await plan.add(whole(doomed), whole(other));
  expect(
    (await plan.command({ kind: 'deleteWorkItem', workItemId: doomed, strategy: 'cascade' }))
      .status,
  ).toBe(200);
  expect(await typed.listByProject(plan.projectId)).toEqual([]);
  expect(
    (await send(`/api/projects/${plan.projectId}/undo`, plan.token, undefined, 'POST')).status,
  ).toBe(200);
  const restored = await typed.listByProject(plan.projectId);
  expect(restored).toHaveLength(2);
  expect(restored.find((dependency) => dependency.id === first)?.predecessor).toEqual(
    node(doomed, plan.devId),
  );
  expect(restored.find((dependency) => dependency.id === second)?.predecessor).toEqual(
    whole(doomed),
  );
});

it('refuses deleting or moving the last child of a descendant-step parent', async () => {
  const plan = await setup();
  const parent = await plan.create('020');
  const child = await plan.create('020.1', parent);
  const other = await plan.create('030');
  const id = await plan.add(
    { scope: 'descendant-step', workItemId: parent, stepId: plan.devId },
    node(other, plan.devId),
  );
  for (const command of [
    { kind: 'deleteWorkItem', workItemId: child, strategy: 'cascade' },
    { kind: 'moveWorkItem', workItemId: child, parentId: null, afterId: null },
  ]) {
    const response = await plan.command(command);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: 'descendant_step_on_leaf',
      dependencyIds: [id],
    });
    expect(await typed.listByProject(plan.projectId)).toHaveLength(1);
    const tree = await send(`/api/projects/${plan.projectId}/work-items`, plan.token);
    const body = (await tree.json()) as {
      workItems: { id: string; parentId: string | null }[];
    };
    expect(body.workItems.find((row) => row.id === child)?.parentId).toBe(parent);
  }
});

it('removes a relationship internal to a deleted subtree and restores it on undo', async () => {
  const plan = await setup();
  const parent = await plan.create('010');
  const first = await plan.create('010.1', parent);
  const second = await plan.create('010.2', parent);
  const id = await plan.add(whole(first), whole(second));
  expect(
    (await plan.command({ kind: 'deleteWorkItem', workItemId: parent, strategy: 'cascade' }))
      .status,
  ).toBe(200);
  expect(await typed.listByProject(plan.projectId)).toEqual([]);
  expect(
    (await send(`/api/projects/${plan.projectId}/undo`, plan.token, undefined, 'POST')).status,
  ).toBe(200);
  expect(await typed.listByProject(plan.projectId)).toMatchObject([
    { id, predecessor: whole(first), successor: whole(second) },
  ]);
});

it('deletes a last child when its descendant-step relationship is removed with it', async () => {
  const plan = await setup();
  const parent = await plan.create('010');
  const child = await plan.create('010.1', parent);
  const id = await plan.add(
    { scope: 'descendant-step', workItemId: parent, stepId: plan.devId },
    node(child, plan.qaId),
  );
  const deletion = { kind: 'deleteWorkItem', workItemId: child, strategy: 'cascade' };
  expect((await plan.command(deletion)).status).toBe(200);
  expect(await typed.listByProject(plan.projectId)).toEqual([]);
  const undo = await send(`/api/projects/${plan.projectId}/undo`, plan.token, undefined, 'POST');
  expect(undo.status).toBe(200);
  expect(await typed.listByProject(plan.projectId)).toMatchObject([
    {
      id,
      predecessor: { scope: 'descendant-step', workItemId: parent, stepId: plan.devId },
      successor: node(child, plan.qaId),
    },
  ]);
  expect(
    (await send(`/api/projects/${plan.projectId}/redo`, plan.token, undefined, 'POST')).status,
  ).toBe(200);
  expect(await typed.listByProject(plan.projectId)).toEqual([]);
});

it('refuses restore when a newer node relationship pins the deleted child’s parent', async () => {
  const plan = await setup();
  const parent = await plan.create('010');
  const child = await plan.create('010.1', parent);
  const other = await plan.create('020');
  expect(
    (await plan.command({ kind: 'deleteWorkItem', workItemId: child, strategy: 'cascade' })).status,
  ).toBe(200);
  const id = 'peer-node-relationship';
  const registered = await app.handle(
    new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'peer', password: 'correct-horse' }),
    }),
  );
  expect(registered.status).toBe(200);
  const peer = (await registered.json()) as { user: { id: string } };
  await typed.add(
    {
      id,
      projectId: plan.projectId,
      predecessor: node(parent, plan.devId),
      successor: whole(other),
      type: 'FS',
    },
    testClock.stampFor(peer.user.id),
  );
  const undo = await send(`/api/projects/${plan.projectId}/undo`, plan.token, undefined, 'POST');
  expect(undo.status).toBe(409);
  const refusal = (await undo.json()) as { error: string; detail: string };
  expect(refusal.error).toBe('stale_undo');
  expect(refusal.detail).toContain(id);
  const tree = await send(`/api/projects/${plan.projectId}/work-items`, plan.token);
  const body = (await tree.json()) as { workItems: { id: string }[] };
  expect(body.workItems.some((row) => row.id === child)).toBe(false);
  expect(await typed.listByProject(plan.projectId)).toMatchObject([
    { id, predecessor: node(parent, plan.devId), successor: whole(other) },
  ]);
});

it('refuses redo of a child create when a newer node relationship pins its parent', async () => {
  const plan = await setup();
  const parent = await plan.create('010');
  const other = await plan.create('020');
  const child = await plan.create('010.1', parent);
  expect(
    (await send(`/api/projects/${plan.projectId}/undo`, plan.token, undefined, 'POST')).status,
  ).toBe(200);
  await typed.add(
    {
      id: 'redo-create-relationship',
      projectId: plan.projectId,
      predecessor: node(parent, plan.devId),
      successor: whole(other),
      type: 'FS',
    },
    testClock.stampFor(plan.userId),
  );
  const redo = await send(`/api/projects/${plan.projectId}/redo`, plan.token, undefined, 'POST');
  expect(redo.status).toBe(409);
  const refusal = (await redo.json()) as { error: string; detail: string };
  expect(refusal.error).toBe('stale_undo');
  expect(refusal.detail).toContain('redo-create-relationship');
  const tree = await send(`/api/projects/${plan.projectId}/work-items`, plan.token);
  const body = (await tree.json()) as { workItems: { id: string }[] };
  expect(body.workItems.some((row) => row.id === child)).toBe(false);
  expect(await typed.listByProject(plan.projectId)).toMatchObject([
    { id: 'redo-create-relationship', predecessor: node(parent, plan.devId) },
  ]);
});

it('refuses undo of a move when a newer descendant-step endpoint would lose its children', async () => {
  const plan = await setup();
  const original = await plan.create('010');
  const destination = await plan.create('020');
  const other = await plan.create('030');
  const child = await plan.create('010.1', original);
  expect(
    (
      await plan.command({
        kind: 'moveWorkItem',
        workItemId: child,
        parentId: destination,
        afterId: null,
      })
    ).status,
  ).toBe(200);
  await typed.add(
    {
      id: 'replay-move-relationship',
      projectId: plan.projectId,
      predecessor: { scope: 'descendant-step', workItemId: destination, stepId: plan.devId },
      successor: node(other, plan.devId),
      type: 'FS',
    },
    testClock.stampFor(plan.userId),
  );
  const undone = await send(`/api/projects/${plan.projectId}/undo`, plan.token, undefined, 'POST');
  expect(undone.status).toBe(409);
  expect(await undone.json()).toMatchObject({ error: 'stale_undo' });
  const tree = await send(`/api/projects/${plan.projectId}/work-items`, plan.token);
  const body = (await tree.json()) as { workItems: { id: string; parentId: string | null }[] };
  expect(body.workItems.find((row) => row.id === child)?.parentId).toBe(destination);
});

it('refuses redo of a deletion when a newer descendant-step endpoint needs its last child', async () => {
  const plan = await setup();
  const parent = await plan.create('010');
  const other = await plan.create('020');
  const child = await plan.create('010.1', parent);
  expect(
    (
      await plan.command({
        kind: 'deleteWorkItem',
        workItemId: child,
        strategy: 'cascade',
      })
    ).status,
  ).toBe(200);
  expect(
    (await send(`/api/projects/${plan.projectId}/undo`, plan.token, undefined, 'POST')).status,
  ).toBe(200);
  await typed.add(
    {
      id: 'replay-delete-relationship',
      projectId: plan.projectId,
      predecessor: { scope: 'descendant-step', workItemId: parent, stepId: plan.devId },
      successor: node(other, plan.devId),
      type: 'FS',
    },
    testClock.stampFor(plan.userId),
  );
  const redone = await send(`/api/projects/${plan.projectId}/redo`, plan.token, undefined, 'POST');
  expect(redone.status).toBe(409);
  expect(await redone.json()).toMatchObject({ error: 'stale_undo' });
  expect(await typed.listByProject(plan.projectId)).toHaveLength(1);
});

it('refuses undo of a move into a leaf with a newer pinned node endpoint', async () => {
  const plan = await setup();
  const parent = await plan.create('010');
  const other = await plan.create('020');
  const child = await plan.create('010.1', parent);
  expect(
    (
      await plan.command({
        kind: 'moveWorkItem',
        workItemId: child,
        parentId: null,
        afterId: null,
      })
    ).status,
  ).toBe(200);
  await typed.add(
    {
      id: 'replay-node-relationship',
      projectId: plan.projectId,
      predecessor: node(parent, plan.devId),
      successor: node(other, plan.devId),
      type: 'FS',
    },
    testClock.stampFor(plan.userId),
  );
  const undone = await send(`/api/projects/${plan.projectId}/undo`, plan.token, undefined, 'POST');
  expect(undone.status).toBe(409);
  expect(await undone.json()).toMatchObject({ error: 'stale_undo' });
  expect(await typed.listByProject(plan.projectId)).toHaveLength(1);
});
