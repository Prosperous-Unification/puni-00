import { openReadOnlyConnection as openPackageObservationConnection } from '@wbs/store-sqlite/db';
import { NO_BOUND_ORGANIZATION } from '@wbs/store-sqlite/organization-access';
import { refusingSavedCurrentCapture } from '@wbs/store-sqlite/saved-current-capture';
import { StepCatalogueRepository } from '@wbs/store-sqlite/step-catalogue';
import { SqliteWorkPackageObservation } from '@wbs/store-sqlite/work-package-observation';

import { bindDevQaFixture } from '../testing/dev-qa-fixture';
import { refusingPlanExports } from '../testing/plan-export-fixture';
import { seedLegacyProject } from '../testing/project-fixture';
const PROJECT_ID = 'http-fixture-parent';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LEGACY_EDIT_ADMISSION } from '@wbs/core';
import { DirectoryService } from '@wbs/core/module/directory/directory.resource';
import { StepService } from '@wbs/core/module/step/step.resource';
import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import { WorkPackageService } from '@wbs/core/module/work-package/work-package.resource';
import { INACTIVE_EXTERNAL_DEPENDENCIES } from '@wbs/core/ports/external-dependency-authoring';
import { AuthService } from '@wbs/core/service/auth.service';
import { readPreconditions } from '@wbs/core/service/compensating';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import type { DependencyEndpoint } from '@wbs/domain';
import { testStepParallels } from '@wbs/store-memory/testing/service-fixtures';
import { MeasureEstimateRepository } from '@wbs/store-sqlite/measure-estimate';
import { DemandRepository, ResourceCapacityRepository } from '@wbs/store-sqlite/resource';
import { StepBlockageRepository } from '@wbs/store-sqlite/step-blockage';
import { StepNodeAttemptRepository } from '@wbs/store-sqlite/step-node-attempt';
import { StepParallelRepository } from '@wbs/store-sqlite/step-parallel';
import { activateTestStepBlockages } from '@wbs/store-sqlite/testing/step-blockage-activation';
import { TypedDependencyRepository } from '@wbs/store-sqlite/typed-dependency';
import { WorkItemBudgetRepository } from '@wbs/store-sqlite/work-item-budget';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { buildApp } from '../app';
import { ActualRepository } from '../repository/actual';
import { CommandJournalRepository } from '../repository/command-journal';
import { openDrizzle } from '../repository/db';
import { DependencyRepository } from '../repository/dependency';
import { DirectoryRepository } from '../repository/directory';
import { EstimateRepository } from '../repository/estimate';
import { OPEN, WriteCoordinator } from '../repository/gate';
import { sqliteUnitOfWork } from '../repository/sqlite-unit-of-work';
import { StepRepository } from '../repository/step';
import { StepMeasureRepository } from '../repository/step-measure';
import { StepProgressRepository } from '../repository/step-progress';
import { UserRepository } from '../repository/user';
import { SubtreeRepository, WorkItemRepository } from '../repository/work-item';
import { WorkPackageRepository } from '../repository/work-package';
import { bunPasswordHasher, joseTokenCodec } from '../runtime/bun-runtime';
import { fastScheduler } from '../service/optimizer-wiring';
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
  refusingEnterpriseConnections,
  refusingMemberships,
  refusingRestoreApprovals,
} from '../testing/organization-access-fixture';
import { migrateOrganizationCatalogueFixture } from '../testing/organization-catalogue-fixture';
import { inMemoryPriorityBands, testPriorityBandService } from '../testing/priority-band-fixture';
import { refusingProjects } from '../testing/project-fixture';
import { testReplay } from '../testing/replay-fixture';
import { testSavedPlanService } from '../testing/saved-plan-fixture';
import { refusingSpaceRead, refusingSpaces } from '../testing/space-fixture';
import { refusingWorkPackageAddressSearch } from '../testing/work-package-address-search-fixture';
import { refusingWorkPackageRanks } from '../testing/work-package-rank-fixture';
import { testWrites } from '../testing/writes-fixture';

let folder: string;
let app: ReturnType<typeof buildApp>;
let catalogue: StepCatalogueRepository;
let typed: TypedDependencyRepository;
let journal: CommandJournalRepository;
let workItems: WorkItemRepository;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'wbs-typed-lifecycle-'));
  migrateOrganizationCatalogueFixture(join(folder, 'test.db'));
  const db = openDrizzle(join(folder, 'test.db'));
  catalogue = new StepCatalogueRepository(db, OPEN, 'owned');
  seedLegacyProject(join(folder, 'test.db'), 'http-fixture-legacy', PROJECT_ID);
  activateTestStepBlockages(join(folder, 'test.db'));
  const workPackages = new WorkPackageRepository(db, OPEN);
  const steps = new StepRepository(db, OPEN);
  workItems = new WorkItemRepository(db, OPEN);
  const estimates = new EstimateRepository(db, OPEN);
  const dependencies = new DependencyRepository(db, OPEN);
  typed = new TypedDependencyRepository(db, OPEN);
  const directory = new DirectoryRepository(db, OPEN);
  journal = new CommandJournalRepository(db, OPEN);
  const dependencyContext = createLocalDependencyContext({
    workPackages,
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
    stepParallels: testStepParallels(),
    calendarMarkers: testCalendarMarkerService(),
    workPackages: new WorkPackageService({
      clock: testClock,
      workPackages,
      broadcast: recordingBroadcaster(),
      dependencyContext,
    }),
    steps: new StepService({
      clock: testClock,
      workPackages,
      steps,
      broadcast: recordingBroadcaster(),
      dependencyContext,
    }),
    workItems: new WorkItemService({
      dependencyContext: createLocalDependencyContext({
        workPackages: workPackages,
        workItems: workItems,
        estimates: estimates,
        dependencies: dependencies,
        typedDependencies: typed,
      }),
      externalDependencyAuthoring: INACTIVE_EXTERNAL_DEPENDENCIES,
      admission: LEGACY_EDIT_ADMISSION,
      scheduler: fastScheduler,
      clock: testClock,
      workItems,
      workPackages,
      estimates,
      actuals: new ActualRepository(db, OPEN),
      measures: new StepMeasureRepository(db, OPEN),
      measureEstimates: new MeasureEstimateRepository(db, OPEN),
      budgets: new WorkItemBudgetRepository(db, OPEN),
      progress: new StepProgressRepository(db, OPEN),
      attempts: new StepNodeAttemptRepository(db, OPEN),
      blockages: new StepBlockageRepository(db, OPEN),
      stepParallels: new StepParallelRepository(db, OPEN),
      dependencies,
      typedDependencies: typed,
      directory,
      capacity: inMemoryCapacity(),
      demands: new DemandRepository(db, OPEN),
      resourceCapacity: new ResourceCapacityRepository(db, OPEN),
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
    projects: refusingProjects,
    planExports: refusingPlanExports,
    workPackageObservation: new SqliteWorkPackageObservation({
      currentCapture: refusingSavedCurrentCapture,
      openConnection: () => openPackageObservationConnection(join(folder, 'test.db')),
      activeOrganizationOf: () => NO_BOUND_ORGANIZATION,
      now: () => testClock.now(),
    }),
    workPackageAddressSearch: refusingWorkPackageAddressSearch,
    organizations: legacyOrganizationAccess,
    memberships: refusingMemberships,
    sharedPeopleRestoreApprovals: refusingRestoreApprovals,
    domains: refusingDomains,
    enterpriseConnections: refusingEnterpriseConnections,
    emailVerification: refusingEmailVerification,
    invitations: refusingInvitations,
    joinRequests: refusingJoinRequests,
    spaces: refusingSpaces,
    spaceRead: refusingSpaceRead,
    workPackageRanks: refusingWorkPackageRanks,
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
    admitDependencyClient: () => null,
    probeDatabase: () => 'ok',
    internalAuthSecret: 'x'.repeat(32),
    writes: {
      ...testWrites(undefined, writing),
      batch: (scope, broadcast) => ({
        ...writing,
        workItems: new WorkItemService({
          dependencyContext: createLocalDependencyContext({
            workPackages: scope.stores.workPackages,
            workItems: scope.stores.workItems,
            estimates: scope.stores.estimates,
            dependencies: scope.stores.dependencies,
            typedDependencies: scope.stores.typedDependencies,
          }),
          externalDependencyAuthoring: INACTIVE_EXTERNAL_DEPENDENCIES,
          admission: LEGACY_EDIT_ADMISSION,
          scheduler: fastScheduler,
          clock: testClock,
          workItems: scope.stores.workItems,
          workPackages: scope.stores.workPackages,
          estimates: scope.stores.estimates,
          actuals: scope.stores.actuals,
          measures: scope.stores.measures,
          measureEstimates: scope.stores.measureEstimates,
          budgets: scope.stores.budgets,
          progress: scope.stores.progress,
          attempts: scope.stores.attempts,
          blockages: scope.stores.blockages,
          stepParallels: scope.stores.stepParallels,
          dependencies: scope.stores.dependencies,
          typedDependencies: scope.stores.typedDependencies,
          directory: scope.stores.directory,
          capacity: scope.stores.capacity,
          demands: scope.stores.demands,
          resourceCapacity: scope.stores.resourceCapacity,
          priorityBands: scope.stores.priorityBands,
          subtrees: scope.stores.subtrees,
          journal: scope.stores.journal,
          broadcast,
        }),
      }),
      uow: sqliteUnitOfWork(db, new WriteCoordinator(), {
        createScope: () => ({ stores: buildStores(db, OPEN) }),
        createRepairScope: () => ({ stores: buildStores(db, OPEN) }),
      }),
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
  await bindDevQaFixture(catalogue, 'http-fixture-legacy', PROJECT_ID, {
    at: testClock.now(),
    by: user.id,
  });
  const created = await send('/api/work-packages', token, {
    projectId: PROJECT_ID,
    name: 'Lifecycle',
  });
  const workPackage = (await created.json()) as {
    workPackage: { id: string };
    steps: { id: string; name: string }[];
  };
  const workPackageId = workPackage.workPackage.id;
  const devId = workPackage.steps.find((step) => step.name === 'Dev')?.id;
  if (devId === undefined) throw new Error('Dev step missing');
  const qaId = workPackage.steps.find((step) => step.name === 'QA')?.id;
  if (qaId === undefined) throw new Error('QA step missing');
  const command = (step: object) =>
    send(`/api/work-packages/${workPackageId}/commands`, token, { commands: [step] });
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
  return { token, userId: user.id, workPackageId, devId, qaId, command, create, add };
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
  const tree = await send(`/api/work-packages/${plan.workPackageId}/work-items`, plan.token);
  expect(await tree.json()).toMatchObject({
    typedDependencies: [{ id, predecessor: { stepNodeId: `sn1.${child}.${plan.devId}` } }],
  });
  expect(await typed.listByWorkPackage(plan.workPackageId)).toMatchObject([
    { id, predecessor: node(child, plan.devId) },
  ]);
  expect(
    (await send(`/api/work-packages/${plan.workPackageId}/undo`, plan.token, undefined, 'POST'))
      .status,
  ).toBe(200);
  expect(await typed.listByWorkPackage(plan.workPackageId)).toMatchObject([
    { id, predecessor: node(parent, plan.devId) },
  ]);
  expect(
    (await send(`/api/work-packages/${plan.workPackageId}/redo`, plan.token, undefined, 'POST'))
      .status,
  ).toBe(200);
  expect(await typed.listByWorkPackage(plan.workPackageId)).toMatchObject([
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
  expect(await typed.listByWorkPackage(plan.workPackageId)).toMatchObject([
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
  expect(await typed.listByWorkPackage(plan.workPackageId)).toEqual([]);
  expect(
    (await send(`/api/work-packages/${plan.workPackageId}/undo`, plan.token, undefined, 'POST'))
      .status,
  ).toBe(200);
  expect(await typed.listByWorkPackage(plan.workPackageId)).toMatchObject([
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
  expect(await typed.listByWorkPackage(plan.workPackageId)).toEqual([]);
  expect(
    (await send(`/api/work-packages/${plan.workPackageId}/undo`, plan.token, undefined, 'POST'))
      .status,
  ).toBe(200);
  const restored = await typed.listByWorkPackage(plan.workPackageId);
  expect(restored).toHaveLength(2);
  expect(restored.find((dependency) => dependency.id === first)?.predecessor).toEqual({
    ...node(doomed, plan.devId),
    workPackageId: plan.workPackageId,
  });
  expect(restored.find((dependency) => dependency.id === second)?.predecessor).toEqual({
    ...whole(doomed),
    workPackageId: plan.workPackageId,
  });
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
    expect(await typed.listByWorkPackage(plan.workPackageId)).toHaveLength(1);
    const tree = await send(`/api/work-packages/${plan.workPackageId}/work-items`, plan.token);
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
  expect(await typed.listByWorkPackage(plan.workPackageId)).toEqual([]);
  expect(
    (await send(`/api/work-packages/${plan.workPackageId}/undo`, plan.token, undefined, 'POST'))
      .status,
  ).toBe(200);
  expect(await typed.listByWorkPackage(plan.workPackageId)).toMatchObject([
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
  expect(await typed.listByWorkPackage(plan.workPackageId)).toEqual([]);
  const undo = await send(
    `/api/work-packages/${plan.workPackageId}/undo`,
    plan.token,
    undefined,
    'POST',
  );
  expect(undo.status).toBe(200);
  expect(await typed.listByWorkPackage(plan.workPackageId)).toMatchObject([
    {
      id,
      predecessor: { scope: 'descendant-step', workItemId: parent, stepId: plan.devId },
      successor: node(child, plan.qaId),
    },
  ]);
  expect(
    (await send(`/api/work-packages/${plan.workPackageId}/redo`, plan.token, undefined, 'POST'))
      .status,
  ).toBe(200);
  expect(await typed.listByWorkPackage(plan.workPackageId)).toEqual([]);
});

for (const refreshRevisions of [false, true]) {
  it(`refuses restore with ${refreshRevisions ? 'a pinned peer relationship after refreshing revision evidence' : 'a stale surviving parent revision'}`, async () => {
    const plan = await setup();
    const parent = await plan.create('010');
    const child = await plan.create('010.1', parent);
    const other = await plan.create('020');
    expect(
      (await plan.command({ kind: 'deleteWorkItem', workItemId: child, strategy: 'cascade' }))
        .status,
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
        workPackageId: plan.workPackageId,
        predecessor: { ...node(parent, plan.devId), workPackageId: plan.workPackageId },
        successor: { ...whole(other), workPackageId: plan.workPackageId },
        type: 'FS',
      },
      testClock.stampFor(peer.user.id),
    );
    // Proof: bypassing applyRestore shape validation made the refreshed-evidence
    // case receive 500 instead of 409; watched 2026-10-14.
    if (refreshRevisions) {
      const entry = (
        await journal.entriesFor({
          workPackageId: plan.workPackageId,
          userId: plan.userId,
          personId: null,
        })
      ).at(-1);
      if (entry === undefined) throw new Error('delete journal entry missing');
      const preconditions = readPreconditions(entry.preconditions);
      const rows = await workItems.listByWorkPackage(plan.workPackageId);
      const expected = { ...preconditions.expected };
      for (const owner of Object.keys(expected)) {
        const row = rows.find((candidate) => candidate.id === owner);
        if (row === undefined) throw new Error(`revision owner ${owner} missing`);
        expected[owner] = row.revision;
      }
      await journal.restamp(entry.id, { ...preconditions, expected });
    }
    const undo = await send(
      `/api/work-packages/${plan.workPackageId}/undo`,
      plan.token,
      undefined,
      'POST',
    );
    expect(undo.status).toBe(409);
    const refusal = (await undo.json()) as { error: string; detail: string };
    expect(refusal.error).toBe('stale_undo');
    if (refreshRevisions)
      expect(refusal.detail).toBe(`relationship ${id} no longer fits this tree.`);
    else expect(refusal.detail).toBe('“010” has changed since then.');
    const tree = await send(`/api/work-packages/${plan.workPackageId}/work-items`, plan.token);
    const body = (await tree.json()) as { workItems: { id: string }[] };
    expect(body.workItems.some((row) => row.id === child)).toBe(false);
    expect(await typed.listByWorkPackage(plan.workPackageId)).toMatchObject([
      { id, predecessor: node(parent, plan.devId), successor: whole(other) },
    ]);
  });
}

it('refuses redo of a child create when a newer node relationship pins its parent', async () => {
  const plan = await setup();
  const parent = await plan.create('010');
  const other = await plan.create('020');
  const child = await plan.create('010.1', parent);
  expect(
    (await send(`/api/work-packages/${plan.workPackageId}/undo`, plan.token, undefined, 'POST'))
      .status,
  ).toBe(200);
  await typed.add(
    {
      id: 'redo-create-relationship',
      workPackageId: plan.workPackageId,
      predecessor: { ...node(parent, plan.devId), workPackageId: plan.workPackageId },
      successor: { ...whole(other), workPackageId: plan.workPackageId },
      type: 'FS',
    },
    testClock.stampFor(plan.userId),
  );
  const redo = await send(
    `/api/work-packages/${plan.workPackageId}/redo`,
    plan.token,
    undefined,
    'POST',
  );
  expect(redo.status).toBe(409);
  const refusal = (await redo.json()) as { error: string; detail: string };
  expect(refusal.error).toBe('stale_undo');
  expect(refusal.detail).toBe('“010” has changed since then.');
  const tree = await send(`/api/work-packages/${plan.workPackageId}/work-items`, plan.token);
  const body = (await tree.json()) as { workItems: { id: string }[] };
  expect(body.workItems.some((row) => row.id === child)).toBe(false);
  expect(await typed.listByWorkPackage(plan.workPackageId)).toMatchObject([
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
      workPackageId: plan.workPackageId,
      predecessor: {
        workPackageId: plan.workPackageId,
        scope: 'descendant-step',
        workItemId: destination,
        stepId: plan.devId,
      },
      successor: { ...node(other, plan.devId), workPackageId: plan.workPackageId },
      type: 'FS',
    },
    testClock.stampFor(plan.userId),
  );
  const undone = await send(
    `/api/work-packages/${plan.workPackageId}/undo`,
    plan.token,
    undefined,
    'POST',
  );
  expect(undone.status).toBe(409);
  expect(await undone.json()).toMatchObject({ error: 'stale_undo' });
  const tree = await send(`/api/work-packages/${plan.workPackageId}/work-items`, plan.token);
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
    (await send(`/api/work-packages/${plan.workPackageId}/undo`, plan.token, undefined, 'POST'))
      .status,
  ).toBe(200);
  await typed.add(
    {
      id: 'replay-delete-relationship',
      workPackageId: plan.workPackageId,
      predecessor: {
        workPackageId: plan.workPackageId,
        scope: 'descendant-step',
        workItemId: parent,
        stepId: plan.devId,
      },
      successor: { ...node(other, plan.devId), workPackageId: plan.workPackageId },
      type: 'FS',
    },
    testClock.stampFor(plan.userId),
  );
  const redone = await send(
    `/api/work-packages/${plan.workPackageId}/redo`,
    plan.token,
    undefined,
    'POST',
  );
  expect(redone.status).toBe(409);
  expect(await redone.json()).toMatchObject({ error: 'stale_undo' });
  expect(await typed.listByWorkPackage(plan.workPackageId)).toHaveLength(1);
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
      workPackageId: plan.workPackageId,
      predecessor: { ...node(parent, plan.devId), workPackageId: plan.workPackageId },
      successor: { ...node(other, plan.devId), workPackageId: plan.workPackageId },
      type: 'FS',
    },
    testClock.stampFor(plan.userId),
  );
  const undone = await send(
    `/api/work-packages/${plan.workPackageId}/undo`,
    plan.token,
    undefined,
    'POST',
  );
  expect(undone.status).toBe(409);
  expect(await undone.json()).toMatchObject({ error: 'stale_undo' });
  expect(await typed.listByWorkPackage(plan.workPackageId)).toHaveLength(1);
});
