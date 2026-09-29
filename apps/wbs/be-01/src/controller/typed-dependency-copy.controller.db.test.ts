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
    emailVerification: refusingEmailVerification,
    invitations: refusingInvitations,
    joinRequests: refusingJoinRequests,
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
  const add = async (predecessor: object, successor: object, type: 'FS' | 'SS' | 'FF' = 'FS') => {
    const response = await command({
      kind: 'addTypedDependency',
      predecessor,
      successor,
      type,
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
const descendant = (workItemId: string, stepId: string): DependencyEndpoint => ({
  scope: 'descendant-step',
  workItemId,
  stepId,
});

it('copies only internal typed relationships and replays them with stable ids', async () => {
  const plan = await setup();
  const parent = await plan.create('P');
  const first = await plan.create('C1', parent);
  const second = await plan.create('C2', parent);
  const branch = await plan.create('D', parent);
  await plan.create('D1', branch);
  const outside = await plan.create('X');
  const internalId = await plan.add(node(first, plan.devId), node(second, plan.qaId), 'FF');
  const wholeId = await plan.add(whole(first), whole(second), 'SS');
  const descendantId = await plan.add(descendant(branch, plan.devId), whole(second), 'FF');
  const externalId = await plan.add(node(outside, plan.devId), whole(first));
  const outgoingId = await plan.add(whole(branch), whole(outside));

  const duplicated = await plan.command({ kind: 'duplicateWorkItem', workItemId: parent });
  expect(duplicated.status).toBe(200);
  const copyId = ((await duplicated.json()) as { results: { id: string }[] }).results[0].id;
  const tree = (await (
    await send(`/api/projects/${plan.projectId}/work-items`, plan.token)
  ).json()) as {
    workItems: { id: string; parentId: string | null; name: string }[];
    typedDependencies: {
      id: string;
      predecessor: DependencyEndpoint;
      successor: DependencyEndpoint;
      type: string;
    }[];
  };
  const firstCopy = tree.workItems.find((row) => row.parentId === copyId && row.name === 'C1');
  const secondCopy = tree.workItems.find((row) => row.parentId === copyId && row.name === 'C2');
  const branchCopy = tree.workItems.find((row) => row.parentId === copyId && row.name === 'D');
  expect(firstCopy).toBeDefined();
  expect(secondCopy).toBeDefined();
  expect(branchCopy).toBeDefined();
  if (firstCopy === undefined || secondCopy === undefined || branchCopy === undefined)
    throw new Error('copy children missing');
  const copied = tree.typedDependencies.find(
    (edge) => edge.predecessor.workItemId === firstCopy.id && edge.predecessor.scope === 'node',
  );
  // Proof: retaining the source work-item id in the copied FF predecessor made
  // this assertion fail: no relationship started at the C1 copy (2026-09-28).
  expect(copied).toMatchObject({
    predecessor: node(firstCopy.id, plan.devId),
    successor: node(secondCopy.id, plan.qaId),
    type: 'FF',
  });
  expect(copied?.id).toBeDefined();
  // Proof: 2026-09-28, admitting the outside endpoints made duplication return 500.
  expect(tree.typedDependencies).toHaveLength(8);
  const copiedWhole = tree.typedDependencies.find(
    (edge) => edge.predecessor.workItemId === firstCopy.id && edge.predecessor.scope === 'whole',
  );
  const copiedDescendant = tree.typedDependencies.find(
    (edge) => edge.predecessor.workItemId === branchCopy.id,
  );
  expect(copiedWhole).toMatchObject({
    predecessor: whole(firstCopy.id),
    successor: whole(secondCopy.id),
    type: 'SS',
  });
  expect(copiedDescendant).toMatchObject({
    predecessor: descendant(branchCopy.id, plan.devId),
    successor: whole(secondCopy.id),
    type: 'FF',
  });
  expect(
    tree.typedDependencies.filter((edge) => edge.successor.workItemId === outside),
  ).toHaveLength(1);
  expect(tree.typedDependencies.find((edge) => edge.id === internalId)).toMatchObject({
    predecessor: node(first, plan.devId),
    successor: node(second, plan.qaId),
  });
  expect(tree.typedDependencies.find((edge) => edge.id === externalId)).toMatchObject({
    predecessor: node(outside, plan.devId),
    successor: whole(first),
  });
  expect(tree.typedDependencies.find((edge) => edge.id === outgoingId)).toMatchObject({
    predecessor: whole(branch),
    successor: whole(outside),
  });
  expect(await typed.listByProject(plan.projectId)).toHaveLength(8);

  expect(
    (await send(`/api/projects/${plan.projectId}/undo`, plan.token, undefined, 'POST')).status,
  ).toBe(200);
  expect((await typed.listByProject(plan.projectId)).map((edge) => edge.id).sort()).toEqual(
    [internalId, wholeId, descendantId, externalId, outgoingId].sort(),
  );
  const undone = (await (
    await send(`/api/projects/${plan.projectId}/work-items`, plan.token)
  ).json()) as { workItems: { id: string }[] };
  expect(undone.workItems.some((row) => row.id === copyId)).toBe(false);

  expect(
    (await send(`/api/projects/${plan.projectId}/redo`, plan.token, undefined, 'POST')).status,
  ).toBe(200);
  expect(
    (await typed.listByProject(plan.projectId)).find((edge) => edge.id === copied?.id),
  ).toMatchObject({
    id: copied?.id,
    predecessor: node(firstCopy.id, plan.devId),
    successor: node(secondCopy.id, plan.qaId),
    type: 'FF',
  });
  expect(
    (await typed.listByProject(plan.projectId)).find((edge) => edge.id === copiedWhole?.id),
  ).toMatchObject({
    predecessor: whole(firstCopy.id),
    successor: whole(secondCopy.id),
    type: 'SS',
  });
  expect(
    (await typed.listByProject(plan.projectId)).find((edge) => edge.id === copiedDescendant?.id),
  ).toMatchObject({
    predecessor: descendant(branchCopy.id, plan.devId),
    successor: whole(secondCopy.id),
    type: 'FF',
  });
  const redone = (await (
    await send(`/api/projects/${plan.projectId}/work-items`, plan.token)
  ).json()) as { workItems: { id: string }[] };
  expect(redone.workItems.some((row) => row.id === copyId)).toBe(true);
});

it('undoes first-child hand-down before undoing a copied typed relationship', async () => {
  const plan = await setup();
  const parent = await plan.create('P');
  const first = await plan.create('C1', parent);
  const second = await plan.create('C2', parent);
  await plan.add(node(first, plan.devId), node(second, plan.qaId));
  const duplicate = await plan.command({ kind: 'duplicateWorkItem', workItemId: parent });
  expect(duplicate.status).toBe(200);
  const copyId = ((await duplicate.json()) as { results: { id: string }[] }).results[0].id;
  const copied = (await (
    await send(`/api/projects/${plan.projectId}/work-items`, plan.token)
  ).json()) as {
    workItems: { id: string; parentId: string | null; name: string }[];
    typedDependencies: {
      id: string;
      predecessor: DependencyEndpoint;
      successor: DependencyEndpoint;
    }[];
  };
  const firstCopy = copied.workItems.find((row) => row.parentId === copyId && row.name === 'C1');
  const secondCopy = copied.workItems.find((row) => row.parentId === copyId && row.name === 'C2');
  if (firstCopy === undefined || secondCopy === undefined) throw new Error('copy children missing');
  const copiedEdge = copied.typedDependencies.find(
    (edge) => edge.predecessor.workItemId === firstCopy.id,
  );
  if (copiedEdge === undefined) throw new Error('copied relationship missing');
  await plan.create('C1.1', firstCopy.id);
  expect(
    (await send(`/api/projects/${plan.projectId}/undo`, plan.token, undefined, 'POST')).status,
  ).toBe(200);
  // Proof: 2026-09-28, dropping the other endpoint from create.touched made this return 409.
  expect(
    (await send(`/api/projects/${plan.projectId}/undo`, plan.token, undefined, 'POST')).status,
  ).toBe(200);
  expect(
    (await typed.listByProject(plan.projectId)).some((edge) => edge.id === copiedEdge.id),
  ).toBe(false);
  expect(
    (
      (await (await send(`/api/projects/${plan.projectId}/work-items`, plan.token)).json()) as {
        workItems: { id: string }[];
      }
    ).workItems.some((row) => row.id === secondCopy.id),
  ).toBe(false);
});

it('undoes an earlier typed write after undoing a first-child hand-down', async () => {
  const plan = await setup();
  const first = await plan.create('A');
  const second = await plan.create('B');
  const edgeId = await plan.add(node(first, plan.devId), node(second, plan.devId));
  await plan.create('A1', first);
  expect(
    (await send(`/api/projects/${plan.projectId}/undo`, plan.token, undefined, 'POST')).status,
  ).toBe(200);
  // Proof: 2026-09-28, dropping B from create.touched made this return 409.
  expect(
    (await send(`/api/projects/${plan.projectId}/undo`, plan.token, undefined, 'POST')).status,
  ).toBe(200);
  expect((await typed.listByProject(plan.projectId)).some((edge) => edge.id === edgeId)).toBe(
    false,
  );
});
