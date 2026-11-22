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
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { testStepParallels } from '@wbs/store-memory/testing/service-fixtures';
import { MeasureEstimateRepository } from '@wbs/store-sqlite/measure-estimate';
import { DemandRepository, ResourceCapacityRepository } from '@wbs/store-sqlite/resource';
import { StepBlockageRepository } from '@wbs/store-sqlite/step-blockage';
import { StepNodeAttemptRepository } from '@wbs/store-sqlite/step-node-attempt';
import { StepParallelRepository } from '@wbs/store-sqlite/step-parallel';
import { TypedDependencyRepository } from '@wbs/store-sqlite/typed-dependency';
import { WorkItemBudgetRepository } from '@wbs/store-sqlite/work-item-budget';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { buildApp } from '../app';
import type { Step, WriteStamp } from '../repository';
import { ActualRepository } from '../repository/actual';
import { CommandJournalRepository } from '../repository/command-journal';
import { openDatabase, openDrizzle } from '../repository/db';
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
import { type RecordingBroadcaster, recordingBroadcaster } from '../testing/broadcast-fixture';
import { testCalendarMarkerService } from '../testing/calendar-marker-fixture';
import { inMemoryCapacity, testCapacityService } from '../testing/capacity-fixture';
import { testClock } from '../testing/clock-fixture';
import { sqliteDependencyContext } from '../testing/dependency-graph-fixture';
import { personAdded } from '../testing/directory-fixture';
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

/**
 * The step routes, over real SQLite.
 *
 * Real for the same reason `undo.controller.test.ts` is: every status this file
 * asserts is decided by rows — the unique index behind a 409 `taken`, the
 * estimates behind a 409 `in_use` — and a fixture answering them would be a
 * second implementation of the rules under test.
 */

let dir: string;
let app: ReturnType<typeof buildApp>;
let auth: AuthService;
let stepStore: StepRepository;
let catalogue: StepCatalogueRepository;
let estimates: EstimateRepository;
let actuals: ActualRepository;
let measures: StepMeasureRepository;
let progressStore: StepProgressRepository;
let directory: DirectoryRepository;
let workItems: WorkItemRepository;
let workPackages: WorkPackageRepository;
let seededBy: string;
/**
 * The one broadcaster in the process, held so a test can read what actually
 * left it while a batch was open.
 *
 * `services.ts` gives `StepService` the process's own broadcaster, so a fixture
 * that hands it a private recorder is not the wiring this app builds and cannot
 * see a batch capture a step event. That divergence is exactly what hid
 * TASK-256.
 */
let writes: ReturnType<typeof testWrites>;
let broadcast: RecordingBroadcaster;

const DAYS = { optimistic: 1, realistic: 2, pessimistic: 3 };

/**
 * The stamp the rows this file seeds straight into the repositories carry.
 *
 * The account exists only so they have one: `created_by` references `users(id)`
 * and this file is against real SQLite, while the plans below belong to accounts
 * `register` makes through the route and hands back nothing but a token. Nothing
 * here asserts on either field.
 */
const wrote = (): WriteStamp => ({ at: 1, by: seededBy });

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-step-http-'));
  const path = join(dir, 'test.db');
  migrateOrganizationCatalogueFixture(path);
  seedLegacyProject(path, 'http-fixture-legacy', PROJECT_ID);
  const db = openDrizzle(path);

  workPackages = new WorkPackageRepository(db, OPEN);
  stepStore = new StepRepository(db, OPEN);
  estimates = new EstimateRepository(db, OPEN);
  actuals = new ActualRepository(db, OPEN);
  measures = new StepMeasureRepository(db, OPEN);
  progressStore = new StepProgressRepository(db, OPEN);
  directory = new DirectoryRepository(db, OPEN);
  workItems = new WorkItemRepository(db, OPEN);

  seededBy = crypto.randomUUID();
  await new UserRepository(db, OPEN).create(
    { id: seededBy, username: 'the-fixture', passwordHash: 'x', createdAt: 1 },
    { at: 1, by: seededBy },
  );

  catalogue = new StepCatalogueRepository(db, OPEN, 'owned');
  await bindDevQaFixture(catalogue, 'http-fixture-legacy', PROJECT_ID, wrote());

  broadcast = recordingBroadcaster();
  const announcements = broadcast;

  auth = new AuthService({
    clock: testClock,
    users: new UserRepository(db, OPEN),
    tokens: joseTokenCodec(TEST_JWT_KEY),
    passwords: bunPasswordHasher,
  });
  // One graph for the routes and the batch alike — these stores hold no turn,
  // so there is nothing for a second graph to keep apart, and a batch given its
  // own would write into stores nothing here reads.
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
    // The shared wrapper here too, from Gemini's Minor on PR 203: this line
    // handed `WorkPackageService` a PRIVATE recorder, so anything it announced
    // landed in a log nothing reads. Harmless while no step route mutates
    // work package settings — and exactly the shape in which a future assertion
    // reads an empty log and passes. See {@link writes}.
    workPackages: new WorkPackageService({
      dependencyContext: sqliteDependencyContext(db, workPackages),
      clock: testClock,
      workPackages,
      broadcast: announcements,
    }),
    // The shared wrapper, as `services.ts` wires `StepService` — not a private
    // recorder. See {@link writes}.
    steps: new StepService({
      dependencyContext: sqliteDependencyContext(db, workPackages),
      clock: testClock,
      workPackages,
      steps: stepStore,
      broadcast: announcements,
    }),
    workItems: new WorkItemService({
      dependencyContext: createLocalDependencyContext({
        workPackages: workPackages,
        workItems: workItems,
        estimates: estimates,
        dependencies: new DependencyRepository(db, OPEN),
        typedDependencies: new TypedDependencyRepository(db, OPEN),
      }),
      externalDependencyAuthoring: INACTIVE_EXTERNAL_DEPENDENCIES,
      admission: LEGACY_EDIT_ADMISSION,
      scheduler: fastScheduler,
      clock: testClock,
      workItems,
      workPackages,
      estimates,
      actuals,
      measures,
      measureEstimates: new MeasureEstimateRepository(db, OPEN),
      budgets: new WorkItemBudgetRepository(db, OPEN),
      progress: progressStore,
      attempts: new StepNodeAttemptRepository(db, OPEN),
      blockages: new StepBlockageRepository(db, OPEN),
      stepParallels: new StepParallelRepository(db, OPEN),
      dependencies: new DependencyRepository(db, OPEN),
      typedDependencies: new TypedDependencyRepository(db, OPEN),
      directory,
      capacity: inMemoryCapacity(),
      demands: new DemandRepository(db, OPEN),
      resourceCapacity: new ResourceCapacityRepository(db, OPEN),
      priorityBands: inMemoryPriorityBands(),
      subtrees: new SubtreeRepository(db, OPEN),
      journal: new CommandJournalRepository(db, OPEN),
      broadcast: announcements,
    }),
  };
  writes = testWrites(broadcast, writing);
  app = buildApp({
    projects: refusingProjects,
    planExports: refusingPlanExports,
    workPackageObservation: new SqliteWorkPackageObservation({
      currentCapture: refusingSavedCurrentCapture,
      openConnection: () => openPackageObservationConnection(path),
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
    loginThrottle: testLoginThrottle(),
    clock: testClock,
    appOrigin: 'http://localhost',
    savedPlans: testSavedPlanService(),
    history: testHistoryService(),
    auth,
    ...writing,
    replay: testReplay().replay,
    admitDependencyClient: () => null,
    probeDatabase: () => 'ok',
    internalAuthSecret: 'x'.repeat(32),
    writes: {
      ...writes,
      uow: sqliteUnitOfWork(db, new WriteCoordinator(), {
        createScope: () => ({ stores: buildStores(db, OPEN) }),
        createRepairScope: () => ({ stores: buildStores(db, OPEN) }),
      }),
    },
    migrationsApplied: true,
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function register(username: string): Promise<string> {
  const res = await app.handle(
    new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: 'correct-horse' }),
    }),
  );
  const body = (await res.json()) as { token: string };
  return body.token;
}

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

async function newWorkPackage(token: string): Promise<{ id: string; devId: string; qaId: string }> {
  const res = await send('/api/work-packages', token, {
    method: 'POST',
    body: JSON.stringify({ projectId: PROJECT_ID, name: 'Rewire the shed' }),
  });
  const body = (await res.json()) as {
    workPackage: { id: string };
    steps: { id: string; name: string }[];
  };
  const dev = body.steps.find((each) => each.name === 'Dev');
  const qa = body.steps.find((each) => each.name === 'QA');
  if (dev === undefined || qa === undefined)
    throw new Error('a work package without its seed steps');
  return { id: body.workPackage.id, devId: dev.id, qaId: qa.id };
}

async function bindFixtureStep(
  name: string,
  code: string,
  defaultEstimateUnit: 'workdays' | 'minutes' = 'workdays',
  defaultAllowancePercent = 0,
) {
  const id = crypto.randomUUID();
  const bound = await catalogue.defineAndBindStep(
    'http-fixture-legacy',
    { id, name, code, position: 30, defaultEstimateUnit, defaultAllowancePercent },
    {
      bindingId: crypto.randomUUID(),
      scopeKind: 'project',
      scopeId: PROJECT_ID,
      workItemTypeId: null,
      position: 30,
    },
    wrote(),
  );
  if (!bound.ok) throw new Error('fixture step binding refused: ' + bound.reason);
  return id;
}

async function unbindFixtureStep(stepId: string) {
  const rows = await catalogue.readCatalogue('http-fixture-legacy');
  const binding = rows?.bindings.find(
    (entry) =>
      entry.scopeKind === 'project' && entry.scopeId === PROJECT_ID && entry.stepId === stepId,
  );
  if (binding === undefined) throw new Error('fixture project binding absent');
  const removed = await catalogue.unbindStep(
    'http-fixture-legacy',
    binding.bindingId,
    { dryRun: false },
    wrote(),
  );
  expect(removed).toMatchObject({ kind: 'unbound' });
}

/** One plan batch of a single command — the one way a plan is written to. */
const planCommand = (
  workPackageId: string,
  token: string,
  step: Record<string, unknown>,
): Promise<Response> =>
  send(`/api/work-packages/${workPackageId}/commands`, token, {
    method: 'POST',
    body: JSON.stringify({ commands: [step] }),
  });

/** A top-level work item by name, through the command that creates them; throws on a refusal. */
async function newWorkItem(workPackageId: string, token: string, name: string): Promise<string> {
  const res = await planCommand(workPackageId, token, {
    kind: 'createWorkItem',
    parentId: null,
    afterId: null,
    name,
  });
  const body = (await res.json()) as { results?: { id?: string }[] };
  const id = body.results?.at(0)?.id;
  if (res.status !== 200 || id === undefined) {
    throw new Error(`the create was refused: ${String(res.status)} ${JSON.stringify(body)}`);
  }
  return id;
}

describe('the steps routes are the only spelling', () => {
  it("serves a work package's steps", async () => {
    const token = await register('owner');
    const workPackage = await newWorkPackage(token);

    await bindFixtureStep('Design', 'design');
    const read = await send(`/api/work-packages/${workPackage.id}`, token);
    const body = (await read.json()) as { steps: { name: string }[] };
    expect(body.steps.map((step) => step.name)).toEqual(['Dev', 'QA', 'Design']);
  });

  it('refuses the old roles route as unknown', async () => {
    const token = await register('owner');
    const workPackage = await newWorkPackage(token);

    /*
      Every verb, because a shim that kept one of them would be the compatibility
      layer `steps-not-phases` design D3 decided against: the three callers ship
      together, so an accepted `roles` request is a second parse path nobody asks
      for and a second spelling of one resource on the wire.

      Proof: `.post('/:id/roles', …)` left mounted beside `/:id/steps` in
      `step.routes.ts`, forwarding to the same handler. This failed on
      `expect(received).toBe(expected) … Expected: 404  Received: 200`, and the
      other two verbs stayed green — which is the point of asserting all three.
      Watched 2026-08-29.
    */
    const post = await send(`/api/work-packages/${workPackage.id}/roles`, token, {
      method: 'POST',
      body: JSON.stringify({ name: 'Design' }),
    });
    expect(post.status).toBe(404);

    const patch = await send(
      `/api/work-packages/${workPackage.id}/roles/${workPackage.qaId}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Review' }),
      },
    );
    expect(patch.status).toBe(404);

    const remove = await send(
      `/api/work-packages/${workPackage.id}/roles/${workPackage.qaId}`,
      token,
      {
        method: 'DELETE',
      },
    );
    expect(remove.status).toBe(404);

    // And nothing was written by any of them.
    expect(await stepStore.listByWorkPackage(workPackage.id)).toHaveLength(2);
  });
});

describe('package commands after project step binding changes', () => {
  it('appends nothing to the account’s undo stack', async () => {
    const token = await register('owner');
    const workPackage = await newWorkPackage(token);
    const strip = await newWorkItem(workPackage.id, token, 'Strip');
    await planCommand(workPackage.id, token, {
      kind: 'patchWorkItem',
      workItemId: strip,
      patch: { name: 'Strip the paint' },
    });

    await bindFixtureStep('Design', 'design');
    await unbindFixtureStep(workPackage.qaId);

    const undone = await send(`/api/work-packages/${workPackage.id}/undo`, token, {
      method: 'POST',
    });
    expect(undone.status).toBe(200);
    expect(((await undone.json()) as { done: string }).done).toContain('rename');
  });

  it('leaves an undo whose step has gone refusing as stale, not writing', async () => {
    const token = await register('owner');
    const workPackage = await newWorkPackage(token);
    const strip = await newWorkItem(workPackage.id, token, 'Strip');
    await planCommand(workPackage.id, token, {
      kind: 'setEstimate',
      workItemId: strip,
      stepId: workPackage.qaId,
      days: { optimistic: 1, realistic: 2, pessimistic: 3 },
    });
    // Cleared, so the entry on top of the stack is one whose *inverse writes*:
    // undoing it puts the trio back. That is the entry that would reach for a
    // step that is not there.
    await planCommand(workPackage.id, token, {
      kind: 'clearEstimate',
      workItemId: strip,
      stepId: workPackage.qaId,
    });

    await unbindFixtureStep(workPackage.qaId);
    const undone = await send(`/api/work-packages/${workPackage.id}/undo`, token, {
      method: 'POST',
    });
    expect(undone.status).toBe(409);
    expect(await undone.json()).toMatchObject({ error: 'stale_undo' });
    expect(await estimates.listByWorkPackage(workPackage.id)).toEqual([]);
  });

  it('refuses an estimate and an assignee for a step that has gone, rather than 500ing', async () => {
    const token = await register('owner');
    const workPackage = await newWorkPackage(token);
    const strip = await newWorkItem(workPackage.id, token, 'Strip');
    const ada = await personAdded(
      directory.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [], wrote()),
    );
    await unbindFixtureStep(workPackage.qaId);

    const estimated = await planCommand(workPackage.id, token, {
      kind: 'setEstimate',
      workItemId: strip,
      stepId: workPackage.qaId,
      days: DAYS,
    });
    expect(estimated.status).toBe(422);
    expect(await estimated.json()).toEqual({
      error: 'step_not_resolved',
      at: 0,
      kind: 'setEstimate',
    });

    const assigned = await planCommand(workPackage.id, token, {
      kind: 'setAssignee',
      workItemId: strip,
      stepId: workPackage.qaId,
      personId: ada.id,
    });
    expect(assigned.status).toBe(404);
    expect(await assigned.json()).toEqual({ error: 'unknown_step', at: 0, kind: 'setAssignee' });
  });

  it('takes estimates for a step added after the work package was made', async () => {
    const token = await register('owner');
    const workPackage = await newWorkPackage(token);
    const design = await bindFixtureStep('Design', 'design');
    const strip = await newWorkItem(workPackage.id, token, 'Strip');

    const estimated = await planCommand(workPackage.id, token, {
      kind: 'setEstimate',
      workItemId: strip,
      stepId: design,
      days: { optimistic: 1, realistic: 2, pessimistic: 3 },
    });

    expect(estimated.status).toBe(200);
    const tree = await send(`/api/work-packages/${workPackage.id}/work-items`, token);
    const body = (await tree.json()) as {
      workItems: { estimates: Record<string, unknown> }[];
    };
    expect(body.workItems[0]?.estimates).toHaveProperty(design);
  });
});

describe('a work package step allowance over HTTP', () => {
  async function tree(
    workPackageId: string,
    token: string,
  ): Promise<{
    steps: { id: string; allowancePercent: number }[];
    workItems: { id: string; finalDays: Record<string, number> }[];
  }> {
    const res = await send(`/api/work-packages/${workPackageId}/work-items`, token);
    expect(res.status).toBe(200);
    return (await res.json()) as {
      steps: { id: string; allowancePercent: number }[];
      workItems: { id: string; finalDays: Record<string, number> }[];
    };
  }

  async function qaAllowance(workPackageId: string, qaId: string, token: string): Promise<number> {
    const held = (await tree(workPackageId, token)).steps.find((step) => step.id === qaId);
    if (held === undefined) throw new Error('QA is gone');
    return held.allowancePercent;
  }

  const patchAllowance = (
    workPackageId: string,
    stepId: string,
    token: string,
    allowanceBps: number,
  ): Promise<Response> =>
    send(`/api/work-packages/${workPackageId}/steps/${stepId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ allowanceBps }),
    });

  it('sets the allowance, charges the estimate and undoes in one step', async () => {
    const token = await register('owner');
    const workPackage = await newWorkPackage(token);
    const leaf = await newWorkItem(workPackage.id, token, 'Strip the roof');
    await planCommand(workPackage.id, token, {
      kind: 'setEstimate',
      workItemId: leaf,
      stepId: workPackage.qaId,
      days: { optimistic: 1.1, realistic: 1.1, pessimistic: 1.1 },
    });

    const res = await patchAllowance(workPackage.id, workPackage.qaId, token, 3000);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      step: {
        estimateUnit: 'workdays' as const,
        id: workPackage.qaId,
        name: 'QA',
        allowancePercent: 30,
      },
    });
    const charged = (await tree(workPackage.id, token)).workItems.find((row) => row.id === leaf);
    expect(charged?.finalDays[workPackage.qaId]).toBe(2);

    const undone = await send(`/api/work-packages/${workPackage.id}/undo`, token, {
      method: 'POST',
    });
    expect(undone.status).toBe(200);
    expect(await qaAllowance(workPackage.id, workPackage.qaId, token)).toBe(0);
  });

  it('adds a step with an allowance, and a plan read carries every step’s', async () => {
    const token = await register('owner');
    const workPackage = await newWorkPackage(token);

    await bindFixtureStep('Review', 'review', 'workdays', 12.5);
    const read = await send(`/api/work-packages/${workPackage.id}`, token);
    const body = (await read.json()) as { steps: { name: string; allowancePercent: number }[] };
    expect(body.steps.map(({ name, allowancePercent }) => [name, allowancePercent])).toEqual([
      ['Dev', 0],
      ['QA', 0],
      ['Review', 12.5],
    ]);
  });

  it('refuses an allowance over 1000% and leaves the step as it was', async () => {
    const token = await register('owner');
    const workPackage = await newWorkPackage(token);

    const patched = await patchAllowance(workPackage.id, workPackage.qaId, token, 100001);
    expect(patched.status).toBe(422);
    expect(await patched.json()).toEqual({ error: 'invalid_body' });

    const batched = await planCommand(workPackage.id, token, {
      kind: 'setStepAllowance',
      stepId: workPackage.qaId,
      allowancePercent: 1000.01,
    });
    expect(batched.status).toBe(400);
    expect(await batched.json()).toEqual({
      error: 'allowancePercent_must_be_0_to_1000_with_two_decimals',
      at: 0,
      kind: 'setStepAllowance',
    });
    expect(await qaAllowance(workPackage.id, workPackage.qaId, token)).toBe(0);
  });

  it('charges a later command in the same batch at the edited allowance', async () => {
    const token = await register('owner');
    const workPackage = await newWorkPackage(token);
    const leaf = await newWorkItem(workPackage.id, token, 'Sand the beams');

    const committed = await send(`/api/work-packages/${workPackage.id}/commands`, token, {
      method: 'POST',
      body: JSON.stringify({
        commands: [
          { kind: 'setStepAllowance', stepId: workPackage.qaId, allowancePercent: 30 },
          {
            kind: 'setEstimate',
            workItemId: leaf,
            stepId: workPackage.qaId,
            days: { optimistic: 2, realistic: 2, pessimistic: 2 },
          },
        ],
      }),
    });
    expect(committed.status).toBe(200);
    const charged = (await tree(workPackage.id, token)).workItems.find((row) => row.id === leaf);
    expect(charged?.finalDays[workPackage.qaId]).toBe(3);
  });

  it('refuses an allowance undo after the step was removed', async () => {
    const token = await register('owner');
    const workPackage = await newWorkPackage(token);
    expect((await patchAllowance(workPackage.id, workPackage.qaId, token, 3000)).status).toBe(200);
    await unbindFixtureStep(workPackage.qaId);

    const undone = await send(`/api/work-packages/${workPackage.id}/undo`, token, {
      method: 'POST',
    });

    expect(undone.status).toBe(409);
    expect(await undone.json()).toMatchObject({ error: 'stale_undo' });
  });
});

describe('estimate unit boundary', () => {
  it('reads a minute step bound after package birth beside the original workday step', async () => {
    const token = await register('unit-owner');
    const workPackage = await newWorkPackage(token);
    const stepId = await bindFixtureStep('Agent', 'agent', 'minutes');
    const response = await send(`/api/work-packages/${workPackage.id}`, token);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { steps: Step[] };
    expect(body.steps.find((step) => step.id === workPackage.devId)?.estimateUnit).toBe('workdays');
    expect(body.steps.find((step) => step.id === stepId)?.estimateUnit).toBe('minutes');
  });
  it('refuses an unknown unit and changing a unit over three estimates, then changes after clearing', async () => {
    const token = await register('unit-owner');
    const workPackage = await newWorkPackage(token);
    const patch = (unit: string) =>
      send(`/api/work-packages/${workPackage.id}/steps/${workPackage.devId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ estimateUnit: unit }),
      });
    const unknown = await patch('hours');
    expect(unknown.status).toBe(422);
    expect(await unknown.json()).toEqual({ error: 'invalid_body' });
    for (const name of ['A', 'B', 'C']) {
      const id = await newWorkItem(workPackage.id, token, name);
      expect(
        (
          await planCommand(workPackage.id, token, {
            kind: 'setEstimate',
            workItemId: id,
            stepId: workPackage.devId,
            days: { optimistic: 1, realistic: 2, pessimistic: 3 },
          })
        ).status,
      ).toBe(200);
    }
    const conflict = await patch('minutes');
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: 'estimates_present', count: 3 });
    for (const row of await workItems.listByWorkPackage(workPackage.id))
      expect(
        (
          await planCommand(workPackage.id, token, {
            kind: 'clearEstimate',
            workItemId: row.id,
            stepId: workPackage.devId,
          })
        ).status,
      ).toBe(200);
    const changed = await patch('minutes');
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({ step: { estimateUnit: 'minutes' } });
  });
  it('stores whole minutes and refuses fractional and above-max minute commands atomically', async () => {
    const token = await register('unit-owner');
    const workPackage = await newWorkPackage(token);
    const stepId = await bindFixtureStep('Agent', 'agent', 'minutes');
    const id = await newWorkItem(workPackage.id, token, 'A');
    const initial = await planCommand(workPackage.id, token, {
      kind: 'setEstimate',
      workItemId: id,
      stepId,
      days: { optimistic: 30, realistic: 40, pessimistic: 90 },
    });
    expect(initial.status).toBe(200);
    const connection = openDatabase(join(dir, 'test.db'));
    const counts = () => ({
      journal: connection.query('SELECT * FROM command_journal').all(),
      events: connection.query('SELECT * FROM plan_event').all(),
    });
    const before = counts();
    const emitted = broadcast.published.length;
    for (const [point, reason] of [
      [1.5, 'minutes_not_integer'],
      [21_474_836_161, 'minutes_above_max'],
    ] as const) {
      const response = await send(`/api/work-packages/${workPackage.id}/commands`, token, {
        method: 'POST',
        body: JSON.stringify({
          commands: [
            { kind: 'patchWorkItem', workItemId: id, patch: { name: 'Should roll back' } },
            {
              kind: 'setEstimate',
              workItemId: id,
              stepId,
              days: { optimistic: point, realistic: point, pessimistic: point },
            },
          ],
        }),
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: reason, at: 1 });
      expect(await workItems.findById(id)).toMatchObject({ name: 'A' });
      expect(counts()).toEqual(before);
      expect(broadcast.published.length).toBe(emitted);
    }
    connection.close();
  });
  it('refuses workday overflow after structural parsing with the command index', async () => {
    const token = await register('unit-owner');
    const workPackage = await newWorkPackage(token);
    const id = await newWorkItem(workPackage.id, token, 'A');
    const response = await planCommand(workPackage.id, token, {
      kind: 'setEstimate',
      workItemId: id,
      stepId: workPackage.devId,
      days: { optimistic: 44_739_243, realistic: 44_739_243, pessimistic: 44_739_243 },
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: 'invalid_estimate',
      at: 0,
      kind: 'setEstimate',
    });
  });
  it('refuses undo that would restore an estimate under a changed unit', async () => {
    const token = await register('unit-owner');
    const workPackage = await newWorkPackage(token);
    const id = await newWorkItem(workPackage.id, token, 'A');
    expect(
      (
        await planCommand(workPackage.id, token, {
          kind: 'setEstimate',
          workItemId: id,
          stepId: workPackage.devId,
          days: { optimistic: 2, realistic: 2, pessimistic: 2 },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await planCommand(workPackage.id, token, {
          kind: 'clearEstimate',
          workItemId: id,
          stepId: workPackage.devId,
        })
      ).status,
    ).toBe(200);
    const changed = await send(
      `/api/work-packages/${workPackage.id}/steps/${workPackage.devId}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify({ estimateUnit: 'minutes' }),
      },
    );
    expect(changed.status).toBe(200);
    const undone = await send(`/api/work-packages/${workPackage.id}/undo`, token, {
      method: 'POST',
    });
    expect(undone.status).toBe(409);
    expect(await undone.json()).toMatchObject({ error: 'stale_undo' });
    expect(await estimates.listByWorkPackage(workPackage.id)).toHaveLength(0);
  });

  it('reads charged minutes beside the workday figure and places half a day', async () => {
    const token = await register('unit-owner');
    const workPackage = await newWorkPackage(token);
    expect(
      (
        await send(`/api/work-packages/${workPackage.id}/steps/${workPackage.devId}`, token, {
          method: 'PATCH',
          body: JSON.stringify({ estimateUnit: 'minutes' }),
        })
      ).status,
    ).toBe(200);
    const id = await newWorkItem(workPackage.id, token, 'A');
    expect(
      (
        await planCommand(workPackage.id, token, {
          kind: 'setEstimate',
          workItemId: id,
          stepId: workPackage.devId,
          days: { optimistic: 240, realistic: 240, pessimistic: 240 },
        })
      ).status,
    ).toBe(200);
    const response = await send(`/api/work-packages/${workPackage.id}/work-items`, token);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      workItems: {
        id: string;
        charged: Record<string, unknown>;
        finalDays: Record<string, number>;
        schedule: { duration: number };
      }[];
    };
    const row = payload.workItems.find((each) => each.id === id);
    expect(row?.charged[workPackage.devId]).toEqual({ unit: 'minutes', minutes: 240 });
    expect(row?.finalDays[workPackage.devId]).toBe(0.5);
    expect(row?.schedule.duration).toBe(0.5);
  });

  it('accepts a whole-minute estimate above the workday maximum', async () => {
    const token = await register('unit-owner');
    const workPackage = await newWorkPackage(token);
    expect(
      (
        await send(`/api/work-packages/${workPackage.id}/steps/${workPackage.devId}`, token, {
          method: 'PATCH',
          body: JSON.stringify({ estimateUnit: 'minutes' }),
        })
      ).status,
    ).toBe(200);
    const id = await newWorkItem(workPackage.id, token, 'A');
    const response = await planCommand(workPackage.id, token, {
      kind: 'setEstimate',
      workItemId: id,
      stepId: workPackage.devId,
      days: { optimistic: 44_739_243, realistic: 44_739_243, pessimistic: 44_739_243 },
    });
    expect(response.status).toBe(200);
    expect(await estimates.listByWorkPackage(workPackage.id)).toMatchObject([
      { optimistic: 44_739_243, realistic: 44_739_243, pessimistic: 44_739_243 },
    ]);
  });

  it('refuses a minute inverse after changing back to workdays', async () => {
    const token = await register('unit-owner');
    const workPackage = await newWorkPackage(token);
    expect(
      (
        await send(`/api/work-packages/${workPackage.id}/steps/${workPackage.devId}`, token, {
          method: 'PATCH',
          body: JSON.stringify({ estimateUnit: 'minutes' }),
        })
      ).status,
    ).toBe(200);
    const id = await newWorkItem(workPackage.id, token, 'A');
    expect(
      (
        await planCommand(workPackage.id, token, {
          kind: 'setEstimate',
          workItemId: id,
          stepId: workPackage.devId,
          days: DAYS,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await planCommand(workPackage.id, token, {
          kind: 'clearEstimate',
          workItemId: id,
          stepId: workPackage.devId,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await send(`/api/work-packages/${workPackage.id}/steps/${workPackage.devId}`, token, {
          method: 'PATCH',
          body: JSON.stringify({ estimateUnit: 'workdays' }),
        })
      ).status,
    ).toBe(200);
    expect(
      (await send(`/api/work-packages/${workPackage.id}/undo`, token, { method: 'POST' })).status,
    ).toBe(409);
    expect(await estimates.listByWorkPackage(workPackage.id)).toHaveLength(0);
  });

  it('refuses redo after changing the unit of its cleared estimate', async () => {
    const token = await register('unit-owner');
    const workPackage = await newWorkPackage(token);
    const id = await newWorkItem(workPackage.id, token, 'A');
    expect(
      (
        await planCommand(workPackage.id, token, {
          kind: 'setEstimate',
          workItemId: id,
          stepId: workPackage.devId,
          days: DAYS,
        })
      ).status,
    ).toBe(200);
    expect(
      (await send(`/api/work-packages/${workPackage.id}/undo`, token, { method: 'POST' })).status,
    ).toBe(200);
    expect(
      (
        await send(`/api/work-packages/${workPackage.id}/steps/${workPackage.devId}`, token, {
          method: 'PATCH',
          body: JSON.stringify({ estimateUnit: 'minutes' }),
        })
      ).status,
    ).toBe(200);
    expect(
      (await send(`/api/work-packages/${workPackage.id}/redo`, token, { method: 'POST' })).status,
    ).toBe(409);
    expect(await estimates.listByWorkPackage(workPackage.id)).toHaveLength(0);
  });

  it('refuses restoring a deleted estimated subtree after its empty step changes unit', async () => {
    const token = await register('unit-owner');
    const workPackage = await newWorkPackage(token);
    const id = await newWorkItem(workPackage.id, token, 'A');
    expect(
      (
        await planCommand(workPackage.id, token, {
          kind: 'setEstimate',
          workItemId: id,
          stepId: workPackage.devId,
          days: DAYS,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await planCommand(workPackage.id, token, {
          kind: 'deleteWorkItem',
          workItemId: id,
          strategy: 'cascade',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await send(`/api/work-packages/${workPackage.id}/steps/${workPackage.devId}`, token, {
          method: 'PATCH',
          body: JSON.stringify({ estimateUnit: 'minutes' }),
        })
      ).status,
    ).toBe(200);
    expect(
      (await send(`/api/work-packages/${workPackage.id}/undo`, token, { method: 'POST' })).status,
    ).toBe(409);
    expect(await workItems.findById(id)).toBeNull();
    expect(await estimates.listByWorkPackage(workPackage.id)).toHaveLength(0);
  });

  it('refuses a mixed batch before its inverse rename and keeps an older independent entry reachable', async () => {
    const token = await register('unit-owner');
    const workPackage = await newWorkPackage(token);
    const estimated = await newWorkItem(workPackage.id, token, 'Estimated');
    expect(
      (
        await planCommand(workPackage.id, token, {
          kind: 'setEstimate',
          workItemId: estimated,
          stepId: workPackage.devId,
          days: DAYS,
        })
      ).status,
    ).toBe(200);
    const renamed = await newWorkItem(workPackage.id, token, 'Original');
    const older = await newWorkItem(workPackage.id, token, 'Independent');
    expect(
      (
        await send(`/api/work-packages/${workPackage.id}/commands`, token, {
          method: 'POST',
          body: JSON.stringify({
            commands: [
              { kind: 'deleteWorkItem', workItemId: estimated, strategy: 'cascade' },
              { kind: 'patchWorkItem', workItemId: renamed, patch: { name: 'Changed' } },
            ],
          }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await send(`/api/work-packages/${workPackage.id}/steps/${workPackage.devId}`, token, {
          method: 'PATCH',
          body: JSON.stringify({ estimateUnit: 'minutes' }),
        })
      ).status,
    ).toBe(200);
    const before = await workItems.findById(renamed);
    const emitted = broadcast.published.length;
    const connection = openDatabase(join(dir, 'test.db'));
    const entries = connection
      .query<{ id: string }, []>('SELECT id FROM command_journal ORDER BY seq')
      .all();
    const events = connection.query('SELECT * FROM plan_event').all();
    const response = await send(`/api/work-packages/${workPackage.id}/undo`, token, {
      method: 'POST',
    });
    expect(response.status).toBe(409);
    expect(await workItems.findById(renamed)).toEqual(before);
    expect(await workItems.findById(estimated)).toBeNull();
    expect(await estimates.listByWorkPackage(workPackage.id)).toHaveLength(0);
    expect(broadcast.published.length).toBe(emitted);
    expect(connection.query('SELECT * FROM plan_event').all()).toEqual(events);
    expect(
      connection.query<{ id: string }, []>('SELECT id FROM command_journal ORDER BY seq').all(),
    ).toEqual(entries.slice(0, -1));
    connection.close();
    expect(
      (await send(`/api/work-packages/${workPackage.id}/undo`, token, { method: 'POST' })).status,
    ).toBe(200);
    expect(await workItems.findById(older)).toBeNull();
  });

  it('retains minute bindings through chained undo redo and rebase', async () => {
    const token = await register('unit-owner');
    const workPackage = await newWorkPackage(token);
    expect(
      (
        await send(`/api/work-packages/${workPackage.id}/steps/${workPackage.devId}`, token, {
          method: 'PATCH',
          body: JSON.stringify({ estimateUnit: 'minutes' }),
        })
      ).status,
    ).toBe(200);
    const id = await newWorkItem(workPackage.id, token, 'A');
    for (const point of [30, 60])
      expect(
        (
          await planCommand(workPackage.id, token, {
            kind: 'setEstimate',
            workItemId: id,
            stepId: workPackage.devId,
            days: { optimistic: point, realistic: point, pessimistic: point },
          })
        ).status,
      ).toBe(200);
    for (const [direction, point] of [
      ['undo', 30],
      ['undo', null],
      ['redo', 30],
      ['redo', 60],
    ] as const) {
      expect(
        (await send(`/api/work-packages/${workPackage.id}/${direction}`, token, { method: 'POST' }))
          .status,
      ).toBe(200);
      const stored = await estimates.listByWorkPackage(workPackage.id);
      if (point === null) expect(stored).toHaveLength(0);
      else
        expect(stored).toMatchObject([{ optimistic: point, realistic: point, pessimistic: point }]);
    }
  });

  it('treats legacy absent bindings as workdays and refuses malformed present bindings', async () => {
    const token = await register('unit-owner');
    const workPackage = await newWorkPackage(token);
    const id = await newWorkItem(workPackage.id, token, 'A');
    expect(
      (
        await planCommand(workPackage.id, token, {
          kind: 'setEstimate',
          workItemId: id,
          stepId: workPackage.devId,
          days: DAYS,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await planCommand(workPackage.id, token, {
          kind: 'clearEstimate',
          workItemId: id,
          stepId: workPackage.devId,
        })
      ).status,
    ).toBe(200);
    const connection = openDatabase(join(dir, 'test.db'));
    const latest = connection
      .query<{ id: string; preconditions: string }, []>(
        'SELECT id,preconditions FROM command_journal ORDER BY seq DESC LIMIT 1',
      )
      .get();
    if (latest === null) throw new Error('missing test journal entry');
    const preconditions = JSON.parse(latest.preconditions) as Record<string, unknown>;
    for (const estimateUnits of [null, {}]) {
      connection.run('UPDATE command_journal SET preconditions=? WHERE id=?', [
        JSON.stringify({ ...preconditions, estimateUnits }),
        latest.id,
      ]);
      expect(
        (await send(`/api/work-packages/${workPackage.id}/undo`, token, { method: 'POST' })).status,
      ).toBe(500);
      expect(await estimates.listByWorkPackage(workPackage.id)).toHaveLength(0);
    }
    delete preconditions['estimateUnits'];
    connection.run('UPDATE command_journal SET preconditions=? WHERE id=?', [
      JSON.stringify(preconditions),
      latest.id,
    ]);
    expect(
      (await send(`/api/work-packages/${workPackage.id}/undo`, token, { method: 'POST' })).status,
    ).toBe(200);
    expect(
      (await send(`/api/work-packages/${workPackage.id}/redo`, token, { method: 'POST' })).status,
    ).toBe(200);
    connection.run('UPDATE command_journal SET preconditions=? WHERE id=?', [
      JSON.stringify(preconditions),
      latest.id,
    ]);
    expect(
      (
        await send(`/api/work-packages/${workPackage.id}/steps/${workPackage.devId}`, token, {
          method: 'PATCH',
          body: JSON.stringify({ estimateUnit: 'minutes' }),
        })
      ).status,
    ).toBe(200);
    expect(
      (await send(`/api/work-packages/${workPackage.id}/undo`, token, { method: 'POST' })).status,
    ).toBe(409);
    expect(await estimates.listByWorkPackage(workPackage.id)).toHaveLength(0);
    connection.close();
  });

  it('allows same-unit unrelated-step and away-and-back edits before replay', async () => {
    const token = await register('unit-owner');
    const workPackage = await newWorkPackage(token);
    const id = await newWorkItem(workPackage.id, token, 'A');
    expect(
      (
        await planCommand(workPackage.id, token, {
          kind: 'setEstimate',
          workItemId: id,
          stepId: workPackage.devId,
          days: DAYS,
        })
      ).status,
    ).toBe(200);
    const renamed = await catalogue.patchStepDefinition(
      'http-fixture-legacy',
      workPackage.devId,
      { name: 'Build' },
      wrote(),
    );
    expect(renamed).toMatchObject({
      ok: true,
      definition: { id: workPackage.devId, name: 'Build' },
    });
    expect(
      (
        await send(`/api/work-packages/${workPackage.id}/steps/${workPackage.devId}`, token, {
          method: 'PATCH',
          body: JSON.stringify({ estimateUnit: 'workdays' }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await send(`/api/work-packages/${workPackage.id}/steps/${workPackage.qaId}`, token, {
          method: 'PATCH',
          body: JSON.stringify({ estimateUnit: 'minutes' }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await send(`/api/work-packages/${workPackage.id}/steps/${workPackage.devId}`, token, {
          method: 'PATCH',
          body: JSON.stringify({ allowanceBps: 3000 }),
        })
      ).status,
    ).toBe(200);
    expect(
      (await send(`/api/work-packages/${workPackage.id}/undo`, token, { method: 'POST' })).status,
    ).toBe(200);
    expect(
      (
        await planCommand(workPackage.id, token, {
          kind: 'clearEstimate',
          workItemId: id,
          stepId: workPackage.devId,
        })
      ).status,
    ).toBe(200);
    for (const unit of ['minutes', 'workdays'])
      expect(
        (
          await send(`/api/work-packages/${workPackage.id}/steps/${workPackage.devId}`, token, {
            method: 'PATCH',
            body: JSON.stringify({ estimateUnit: unit }),
          })
        ).status,
      ).toBe(200);
    expect(
      (await send(`/api/work-packages/${workPackage.id}/undo`, token, { method: 'POST' })).status,
    ).toBe(200);
    expect(await estimates.listByWorkPackage(workPackage.id)).toMatchObject([DAYS]);
  });

  it('binds first-child hand-down and last-child hand-up estimate arrays', async () => {
    for (const transfer of ['down', 'up'] as const) {
      const token = await register(`unit-owner-${transfer}`);
      const workPackage = await newWorkPackage(token);
      const parent = await newWorkItem(workPackage.id, token, 'Parent');
      if (transfer === 'down')
        expect(
          (
            await planCommand(workPackage.id, token, {
              kind: 'setEstimate',
              workItemId: parent,
              stepId: workPackage.devId,
              days: DAYS,
            })
          ).status,
        ).toBe(200);
      const created = await planCommand(workPackage.id, token, {
        kind: 'createWorkItem',
        parentId: parent,
        name: 'Child',
      });
      expect(created.status).toBe(200);
      const { results } = (await created.json()) as { results: { id: string }[] };
      const child = results[0].id;
      if (transfer === 'down') {
        // Reopen the original create as the top entry after a raw emptying of the current trio;
        // its immutable bindings, rather than row revision staleness, must protect the hand-up.
        const connection = openDatabase(join(dir, 'test.db'));
        connection.run('DELETE FROM estimate');
        connection.close();
      } else {
        expect(
          (
            await planCommand(workPackage.id, token, {
              kind: 'setEstimate',
              workItemId: child,
              stepId: workPackage.devId,
              days: DAYS,
            })
          ).status,
        ).toBe(200);
        expect(
          (
            await send(`/api/work-packages/${workPackage.id}/commands`, token, {
              method: 'POST',
              body: JSON.stringify({
                commands: [
                  { kind: 'deleteWorkItem', workItemId: child, strategy: 'cascade' },
                  { kind: 'clearEstimate', workItemId: parent, stepId: workPackage.devId },
                ],
              }),
            })
          ).status,
        ).toBe(200);
      }
      expect(await estimates.listByWorkPackage(workPackage.id)).toHaveLength(0);
      expect(
        (
          await send(`/api/work-packages/${workPackage.id}/steps/${workPackage.devId}`, token, {
            method: 'PATCH',
            body: JSON.stringify({ estimateUnit: 'minutes' }),
          })
        ).status,
      ).toBe(200);
      expect(
        (await send(`/api/work-packages/${workPackage.id}/undo`, token, { method: 'POST' })).status,
      ).toBe(409);
      expect(await estimates.listByWorkPackage(workPackage.id)).toHaveLength(0);
      expect(await workItems.findById(parent)).not.toBeNull();
      expect((await workItems.findById(child)) === null).toBe(transfer === 'up');
    }
  });

  it('refuses restoring an estimate whose bound step was removed', async () => {
    const token = await register('unit-owner');
    const workPackage = await newWorkPackage(token);
    const id = await newWorkItem(workPackage.id, token, 'A');
    expect(
      (
        await planCommand(workPackage.id, token, {
          kind: 'setEstimate',
          workItemId: id,
          stepId: workPackage.devId,
          days: DAYS,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await planCommand(workPackage.id, token, {
          kind: 'clearEstimate',
          workItemId: id,
          stepId: workPackage.devId,
        })
      ).status,
    ).toBe(200);
    await unbindFixtureStep(workPackage.devId);
    expect(
      (await send(`/api/work-packages/${workPackage.id}/undo`, token, { method: 'POST' })).status,
    ).toBe(409);
    expect(await estimates.listByWorkPackage(workPackage.id)).toHaveLength(0);
  });
});
