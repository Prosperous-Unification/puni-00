import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Broadcaster, PlanCommandRunner } from '@wbs/core';
import type { PlanCommand } from '@wbs/core';
import { CalendarMarkerService } from '@wbs/core';
import { CapacityService } from '@wbs/core';
import { DirectoryService } from '@wbs/core';
import { type ScopedBatchOutcome } from '@wbs/core';
import { PriorityBandService } from '@wbs/core';
import { WorkPackageService } from '@wbs/core';
import { StepService } from '@wbs/core';
import { WorkItemService } from '@wbs/core';
import { LEGACY_EDIT_ADMISSION } from '@wbs/core';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { INACTIVE_EXTERNAL_DEPENDENCIES } from '@wbs/core/ports/external-dependency-authoring';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { ActualRepository } from './actual';
import { buildStores } from './build-stores';
import { CalendarMarkerRepository } from './calendar-marker';
import { CapacityRepository } from './capacity';
import { CommandJournalRepository } from './command-journal';
import type { Drizzle } from './db';
import { openDrizzle } from './db';
import { DependencyRepository } from './dependency';
import { DirectoryRepository } from './directory';
import { EstimateRepository } from './estimate';
import { DrizzleEventLogStore } from './event-log';
import { OPEN, WriteCoordinator } from './gate';
import { MeasureEstimateRepository } from './measure-estimate';
import { PriorityBandRepository } from './priority-band';
import { DemandRepository, ResourceCapacityRepository } from './resource';
import { sqliteUnitOfWork } from './sqlite-unit-of-work';
import { StepRepository } from './step';
import { StepBlockageRepository } from './step-blockage';
import { StepCatalogueRepository } from './step-catalogue';
import { StepMeasureRepository } from './step-measure';
import { StepNodeAttemptRepository } from './step-node-attempt';
import { StepProgressRepository } from './step-progress';
import { seedCurrentProjectFixture } from './testing/current-project-fixture';
import { TypedDependencyRepository } from './typed-dependency';
import { SubtreeRepository, WorkItemRepository } from './work-item';
import { WorkItemBudgetRepository } from './work-item-budget';
import { WorkPackageRepository } from './work-package';

const OWNER_ORG = 'fixture-legacy-org';
const PROJECT = 'fixture-project';

/**
 * A promise the test resolves, and the promise that says it has been reached.
 *
 * Two halves rather than one: the case has to know the batch really is
 * suspended before it starts the outside write, or it is asserting about a
 * window that may already have closed.
 */
function suspension(): {
  reached: Promise<void>;
  arrive: () => void;
  release: () => void;
  held: Promise<void>;
} {
  let arrive = (): void => {
    throw new Error('the suspension was awaited before it was built');
  };
  let release = arrive;
  const reached = new Promise<void>((resolve) => {
    arrive = () => {
      resolve();
    };
  });
  const held = new Promise<void>((resolve) => {
    release = () => {
      resolve();
    };
  });
  return { reached, arrive, release, held };
}

let dir: string;
let db: Drizzle;
let runner: PlanCommandRunner;
let catalogue: StepCatalogueRepository;
let custody: { hasUnknownOwner: boolean };
let workItemStore: WorkItemRepository;
let workPackageId: string;
let ownerId: string;
let hold: ReturnType<typeof suspension>;
let coordinator: WriteCoordinator;
let publicDirectory: DirectoryRepository;
let publicEventLog: DrizzleEventLogStore;
let publicWorkPackages: WorkPackageRepository;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-coordinator-'));
  const path = join(dir, 'test.db');
  ownerId = crypto.randomUUID();
  custody = { hasUnknownOwner: false };
  await seedCurrentProjectFixture(
    {
      path,
      directory: dir,
      organizationId: OWNER_ORG,
      projectId: PROJECT,
      stamp: { at: 1, by: ownerId },
      definitions: [],
    },
    custody,
  );
  db = openDrizzle(path);

  // The process's one coordinator, exactly as `boot.ts` builds it.
  coordinator = new WriteCoordinator();
  // The batch's stores hold no turn: `PlanCommandRunner` holds it for them.
  const workPackageStore = new WorkPackageRepository(db, OPEN);
  const directoryStore = new DirectoryRepository(db, OPEN);
  const capacityStore = new CapacityRepository(db, OPEN);
  const bandStore = new PriorityBandRepository(db, OPEN);
  workItemStore = new WorkItemRepository(db, OPEN);
  // The route's do, which is the whole subject of this file.
  catalogue = new StepCatalogueRepository(db, coordinator, 'owned');
  publicDirectory = new DirectoryRepository(db, coordinator);
  publicEventLog = new DrizzleEventLogStore(db, coordinator);
  publicWorkPackages = new WorkPackageRepository(db, coordinator);
  const broadcast = recordingBroadcaster();

  hold = suspension();
  // The suspension is a *store* method rather than a service one, because the
  // window this case is about is between the batch's first write and its
  // rollback — inside the transaction, holding the lock. The second create
  // arrives here, says so, and waits for the case to let it go.
  let inserts = 0;
  const suspendingWorkItems: WorkItemRepository = Object.create(workItemStore, {
    insert: {
      value: async (...args: Parameters<WorkItemRepository['insert']>) => {
        inserts += 1;
        if (inserts === 2) {
          hold.arrive();
          await hold.held;
        }
        await workItemStore.insert(...args);
      },
    },
  }) as WorkItemRepository;

  const serviceOptions = {
    scheduler: fastScheduler,
    workItems: suspendingWorkItems,
    workPackages: workPackageStore,
    estimates: new EstimateRepository(db, OPEN),
    actuals: new ActualRepository(db, OPEN),
    measures: new StepMeasureRepository(db, OPEN),
    measureEstimates: new MeasureEstimateRepository(db, OPEN),
    budgets: new WorkItemBudgetRepository(db, OPEN),
    progress: new StepProgressRepository(db, OPEN),
    attempts: new StepNodeAttemptRepository(db, OPEN),
    blockages: new StepBlockageRepository(db, OPEN),
    directory: directoryStore,
    capacity: capacityStore,
    demands: new DemandRepository(db, OPEN),
    resourceCapacity: new ResourceCapacityRepository(db, OPEN),
    priorityBands: bandStore,
    dependencies: new DependencyRepository(db, OPEN),
    typedDependencies: new TypedDependencyRepository(db, OPEN),
    subtrees: new SubtreeRepository(db, OPEN),
    journal: new CommandJournalRepository(db, OPEN),
    stepParallels: buildStores(db, OPEN).stepParallels,
    broadcast,
    dependencyContext: createLocalDependencyContext({
      workPackages: workPackageStore,
      workItems: suspendingWorkItems,
      estimates: new EstimateRepository(db, OPEN),
      dependencies: new DependencyRepository(db, OPEN),
      typedDependencies: new TypedDependencyRepository(db, OPEN),
    }),
    externalDependencyAuthoring: INACTIVE_EXTERNAL_DEPENDENCIES,
  };
  // The batch's own stores, over an open gate: `sqliteUnitOfWork` holds the
  // turn for them. The suspending work-item store above is one of these.
  const admitted = { ...buildStores(db, OPEN), workItems: suspendingWorkItems };
  const servicesWith = (selectedBroadcast: Broadcaster) => ({
    workItems: new WorkItemService({
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      ...serviceOptions,
      broadcast: selectedBroadcast,
    }),
    directory: new DirectoryService({
      clock: testClock,
      directory: directoryStore,
      broadcast: selectedBroadcast,
    }),
    capacity: new CapacityService({
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      workPackages: workPackageStore,
      capacity: capacityStore,
      resourceCapacity: new ResourceCapacityRepository(db, OPEN),
      broadcast: selectedBroadcast,
    }),
    priorityBands: new PriorityBandService({
      admission: LEGACY_EDIT_ADMISSION,
      clock: testClock,
      workPackages: workPackageStore,
      bands: bandStore,
      broadcast: selectedBroadcast,
    }),
    workPackages: new WorkPackageService({
      dependencyContext: createLocalDependencyContext({
        ...buildStores(db, OPEN),
        workPackages: workPackageStore,
      }),
      clock: testClock,
      workPackages: workPackageStore,
      broadcast: selectedBroadcast,
    }),
    steps: new StepService({
      dependencyContext: createLocalDependencyContext({
        ...buildStores(db, OPEN),
        workPackages: workPackageStore,
      }),
      clock: testClock,
      workPackages: workPackageStore,
      steps: new StepRepository(db, OPEN),
      broadcast: selectedBroadcast,
    }),
    calendarMarkers: new CalendarMarkerService({
      clock: testClock,
      workPackages: workPackageStore,
      markers: new CalendarMarkerRepository(db, OPEN),
      broadcast: selectedBroadcast,
    }),
  });
  runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    batchServices: (_scope, collector) => servicesWith(collector),
    publicServices: servicesWith(broadcast),
    uow: sqliteUnitOfWork(db, coordinator, {
      createScope: () => ({ stores: admitted }),
      createRepairScope: () => ({ stores: admitted }),
    }),
    announcements: broadcast,
  });
  const created = await new WorkPackageService({
    dependencyContext: createLocalDependencyContext({
      ...buildStores(db, OPEN),
      workPackages: workPackageStore,
    }),
    clock: testClock,
    workPackages: workPackageStore,
    broadcast: recordingBroadcaster(),
  }).create('Rewire the shed', PROJECT, ownerId);
  if (typeof created === 'string') throw new Error(`fixture creation refused: ${created}`);
  workPackageId = created.workPackage.id;
});

afterEach(() => {
  if (!custody.hasUnknownOwner) rmSync(dir, { recursive: true, force: true });
});

function addWiring() {
  return catalogue.defineAndBindStep(
    OWNER_ORG,
    {
      id: 'wiring',
      code: 'wiring',
      name: 'Wiring',
      position: 10,
      defaultAllowancePercent: 0,
      defaultEstimateUnit: 'workdays',
    },
    {
      bindingId: 'binding-wiring',
      scopeKind: 'project',
      scopeId: PROJECT,
      workItemTypeId: null,
      position: 10,
    },
    { at: 1, by: ownerId },
  );
}

/** Two creates and a refusal: the second create is where the batch suspends. */
const REFUSED_BATCH: PlanCommand[] = [
  { kind: 'createWorkItem', ref: 'strip', parentId: null, afterId: null, name: 'Strip' },
  {
    kind: 'createWorkItem',
    ref: 'sand',
    parentId: null,
    afterId: null,
    afterRef: 'strip',
    name: 'Sand',
  },
  {
    kind: 'setEstimate',
    workItemRef: 'strip',
    stepId: 'no-such-step',
    days: { optimistic: 1, realistic: 2, pessimistic: 3 },
  },
];

describe('the write coordinator', () => {
  it('does not roll a route write back with a batch it never belonged to', async () => {
    const batch: Promise<ScopedBatchOutcome> = runner.run(workPackageId, ownerId, REFUSED_BATCH);
    await hold.reached;

    // Started while the batch holds the transaction open, and deliberately not
    // awaited yet: what this case is about is where the write *lands*, and on a
    // process whose route writes take no turn it lands inside the batch.
    const added = addWiring();
    hold.release();

    const outcome = await batch;
    expect(outcome.ok).toBe(false);
    const step = await added;
    expect(step.ok).toBe(true);

    // The batch's own two rows went with its refusal, which is ADR 0007 working.
    expect(await workItemStore.listByWorkPackage(workPackageId)).toEqual([]);
    // The step did not. It was a different request, and nobody refused it.
    // Proof: selecting borrowed mode bypassed the coordinator and returned
    // success inside the batch; its rollback erased Wiring from the catalogue.
    expect((await catalogue.readCatalogue(OWNER_ORG))?.definitions).toMatchObject([
      { id: 'wiring', name: 'Wiring' },
    ]);
    expect((await publicWorkPackages.stepsOf(workPackageId)).map(({ id }) => id)).toEqual([
      'wiring',
    ]);
  });

  it("makes every public transactional store wait for the batch's turn", async () => {
    // Case (i) of the plan's admission list, on the production call path: one
    // mutating method per public store, started while a batch is suspended and
    // read back after that batch has been **refused**. Survival is the oracle
    // rather than "has it written yet": a store that took no turn writes inside
    // the batch's `BEGIN IMMEDIATE`, and the rollback erases it. Counting
    // microtasks instead was tried first and could not fail — an ungated write
    // is a few turns late, not synchronous, so the sample was satisfied for the
    // wrong reason.
    const stamp = { at: 1, by: ownerId };
    const batch = runner.run(workPackageId, ownerId, REFUSED_BATCH);
    await hold.reached;

    const writes = [
      addWiring(),
      publicDirectory.addTag({ id: crypto.randomUUID(), name: 'urgent' }, stamp),
      publicEventLog.recordEvent(
        `work-package:${workPackageId}`,
        { type: 'saved_plans_changed' },
        1,
      ),
      publicWorkPackages.update(workPackageId, { name: 'Rewire the shed, again' }, stamp),
    ];
    hold.release();

    expect((await batch).ok).toBe(false);
    await Promise.all(writes);

    // Proof: `publicWorkPackages` built over `OPEN` instead of the coordinator —
    // the shape every store had before this change. Failed on `expected
    // 'Rewire the shed' to be 'Rewire the shed, again'`: the rename landed
    // inside the batch's transaction and its refusal took it. Watched
    // 2026-09-08.
    expect((await publicWorkPackages.findById(workPackageId))?.name).toBe('Rewire the shed, again');
    expect((await catalogue.readCatalogue(OWNER_ORG))?.definitions).toMatchObject([
      { id: 'wiring', name: 'Wiring' },
    ]);
    expect((await publicWorkPackages.stepsOf(workPackageId)).map(({ id }) => id)).toEqual([
      'wiring',
    ]);
    expect((await publicDirectory.listTags()).map((each) => each.name)).toContain('urgent');
    expect(await publicEventLog.latestSeq(`work-package:${workPackageId}`)).toBeGreaterThanOrEqual(
      0,
    );
  });
});
