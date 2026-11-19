import { seedLegacyProject } from '../testing/project-fixture';
const PARENT_PROJECT_ID = 'service-fixture-parent';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Broadcaster } from '@wbs/core';
import { EventLogService } from '@wbs/core';
import { LEGACY_EDIT_ADMISSION } from '@wbs/core';
import { GatewayBroadcaster } from '@wbs/core/module/realtime/gateway-broadcaster';
import { ReplayBuffer } from '@wbs/core/module/realtime/replay-buffer';
import { ReplayOrchestrator } from '@wbs/core/module/realtime/replay-orchestrator';
import { StepService } from '@wbs/core/module/step/step.resource';
import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import { WorkPackageService } from '@wbs/core/module/work-package/work-package.resource';
import { INACTIVE_EXTERNAL_DEPENDENCIES } from '@wbs/core/ports/external-dependency-authoring';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { systemTimers } from '@wbs/runtime-portable';
import { PushClient } from '@wbs/runtime-portable';
import { MeasureEstimateRepository } from '@wbs/store-sqlite/measure-estimate';
import { DemandRepository, ResourceCapacityRepository } from '@wbs/store-sqlite/resource';
import { StepBlockageRepository } from '@wbs/store-sqlite/step-blockage';
import { StepNodeAttemptRepository } from '@wbs/store-sqlite/step-node-attempt';
import { StepParallelRepository } from '@wbs/store-sqlite/step-parallel';
import { activateTestStepBlockages } from '@wbs/store-sqlite/testing/step-blockage-activation';
import { TypedDependencyRepository } from '@wbs/store-sqlite/typed-dependency';
import { WorkItemBudgetRepository } from '@wbs/store-sqlite/work-item-budget';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import type {
  DirectoryStore,
  EstimateStore,
  Step,
  StepStore,
  WorkItem,
  WriteStamp,
} from '../repository';
import { ActualRepository } from '../repository/actual';
import { CommandJournalRepository } from '../repository/command-journal';
import { openDatabase, openDrizzle } from '../repository/db';
import { DependencyRepository } from '../repository/dependency';
import { DirectoryRepository } from '../repository/directory';
import { EstimateRepository } from '../repository/estimate';
import { DrizzleEventLogStore } from '../repository/event-log';
import { OPEN } from '../repository/gate';
import { runMigrations } from '../repository/migrate';
import { StepRepository } from '../repository/step';
import { StepMeasureRepository } from '../repository/step-measure';
import { StepProgressRepository } from '../repository/step-progress';
import { UserRepository } from '../repository/user';
import { SubtreeRepository, WorkItemRepository } from '../repository/work-item';
import { WorkPackageRepository } from '../repository/work-package';
import { type RecordingBroadcaster, recordingBroadcaster } from '../testing/broadcast-fixture';
import { inMemoryCapacity } from '../testing/capacity-fixture';
import { testClock } from '../testing/clock-fixture';
import { sqliteDependencyContext } from '../testing/dependency-graph-fixture';
import { directoryWith, personAdded } from '../testing/directory-fixture';
import { inMemoryPriorityBands } from '../testing/priority-band-fixture';
import { workItemRow } from '../testing/work-item-fixture';
import { fastScheduler } from './optimizer-wiring';

/**
 * The step service, against real SQLite.
 *
 * The refusals it answers are all decided by rows — a name the index refuses,
 * an estimate that would be deleted, an assignment whose absence would promote
 * somebody — so the stores under it are the real ones. An in-memory step store
 * would be a second implementation of the rules being asserted.
 */
const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

let dir: string;
let db: ReturnType<typeof openDrizzle>;
let steps: StepService;
let stepStore: StepRepository;
let workPackageStore: WorkPackageRepository;
let estimates: EstimateRepository;
let actuals: ActualRepository;
let measures: StepMeasureRepository;
let progressStore: StepProgressRepository;
let directory: DirectoryRepository;
let broadcast: RecordingBroadcaster;
let workPackageId: string;
let ownerId: string;
let strangerId: string;
let devId: string;
let qaId: string;

const DAYS = { optimistic: 1, realistic: 2, pessimistic: 3 };

const newItem = (id: string, position: number, name: string): WorkItem =>
  workItemRow({
    id,
    workPackageId,
    position,
    name,
  });

/**
 * The stamp the writes this file makes by hand carry. The account is the owner
 * because `created_by` has an enforced foreign key to `users`, so a stamp naming
 * nobody would answer with the key rather than the behaviour being asserted.
 */
const wrote = (): WriteStamp => ({ at: 1, by: ownerId });

const stepNamed = async (name: string): Promise<Step> => {
  const found = (await stepStore.listByWorkPackage(workPackageId)).find(
    (each) => each.name === name,
  );
  if (found === undefined) throw new Error(`no step called ${name}`);
  return found;
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-step-service-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  seedLegacyProject(path, 'service-fixture-legacy', PARENT_PROJECT_ID);
  activateTestStepBlockages(path);
  db = openDrizzle(path);

  workPackageStore = new WorkPackageRepository(db, OPEN);
  stepStore = new StepRepository(db, OPEN);
  estimates = new EstimateRepository(db, OPEN);
  actuals = new ActualRepository(db, OPEN);
  measures = new StepMeasureRepository(db, OPEN);
  progressStore = new StepProgressRepository(db, OPEN);
  directory = new DirectoryRepository(db, OPEN);
  broadcast = recordingBroadcaster();
  steps = new StepService({
    dependencyContext: sqliteDependencyContext(db, workPackageStore),
    clock: testClock,
    workPackages: workPackageStore,
    steps: stepStore,
    broadcast,
  });

  const users = new UserRepository(db, OPEN);
  ownerId = crypto.randomUUID();
  strangerId = crypto.randomUUID();
  await users.create(
    { id: ownerId, username: 'owner', passwordHash: 'x', createdAt: 1 },
    { at: 1, by: ownerId },
  );
  await users.create(
    { id: strangerId, username: 'stranger', passwordHash: 'x', createdAt: 2 },
    { at: 2, by: strangerId },
  );

  const created = await new WorkPackageService({
    dependencyContext: sqliteDependencyContext(db, workPackageStore),
    clock: testClock,
    workPackages: workPackageStore,
    broadcast: recordingBroadcaster(),
  }).create('Shed', PARENT_PROJECT_ID, ownerId);
  if (typeof created === 'string')
    throw new Error(`fixture work package creation refused: ${created}`);
  workPackageId = created.workPackage.id;
  devId = (await stepNamed('Dev')).id;
  qaId = (await stepNamed('QA')).id;

  const workItems = new WorkItemRepository(db, OPEN);
  await workItems.insert(newItem('strip', 10, 'Strip'), [], wrote());
  await workItems.insert(newItem('sand', 20, 'Sand'), [], wrote());
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('StepService.add', () => {
  it('adds a step and announces it', async () => {
    const outcome = await steps.add(workPackageId, ownerId, 'Design', 0);

    if (!outcome.ok) throw new Error(`add refused: ${outcome.reason}`);
    expect(outcome.value.name).toBe('Design');
    expect(outcome.value.workPackageId).toBe(workPackageId);
    // The very row that was written, not a shape that resembles it: the event
    // carrying a different id from the answer is the failure worth catching.
    expect(broadcast.published).toEqual([
      { workPackageId, event: { type: 'step_added', step: outcome.value } },
    ]);
  });

  it('trims the name, and refuses one that is only spaces', async () => {
    const trimmed = await steps.add(workPackageId, ownerId, '  Design  ', 0);
    if (!trimmed.ok) throw new Error(`add refused: ${trimmed.reason}`);
    expect(trimmed.value.name).toBe('Design');
    expect(await steps.add(workPackageId, ownerId, '   ', 0)).toEqual({
      ok: false,
      reason: 'name_required',
    });
    // The refused one announced nothing: there is nothing for anybody to reread.
    expect(broadcast.published).toHaveLength(1);
  });

  it('refuses a name the work package already holds', async () => {
    expect(await steps.add(workPackageId, ownerId, 'QA', 0)).toEqual({
      ok: false,
      reason: 'taken',
    });
    expect(broadcast.published).toEqual([]);
  });

  it('refuses an absent package and a restricted legacy package for both stranger and creator', async () => {
    expect(await steps.add(crypto.randomUUID(), ownerId, 'Design', 0)).toEqual({
      ok: false,
      reason: 'not_found',
    });

    await workPackageStore.update(workPackageId, { restricted: true }, wrote());
    expect(await steps.add(workPackageId, strangerId, 'Design', 0)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    // Retired-policy comment retained verbatim; current legacy access refuses every restricted actor.
    // The owner of the restricted work package still may.
    expect(await steps.add(workPackageId, ownerId, 'Design', 0)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });
});

describe('StepService.rename', () => {
  it('renames a step and announces it', async () => {
    const outcome = await steps.rename(workPackageId, qaId, ownerId, 'Review');

    expect(outcome).toEqual({
      ok: true,
      value: {
        id: qaId,
        workPackageId,
        name: 'Review',
        position: 20,
        code: 'qa',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
    });
    expect(broadcast.published).toEqual([
      {
        workPackageId,
        event: {
          type: 'step_renamed',
          step: {
            id: qaId,
            workPackageId,
            name: 'Review',
            position: 20,
            code: 'qa',
            allowancePercent: 0,
            estimateUnit: 'workdays' as const,
          },
        },
      },
    ]);
  });

  it('refuses a name the work package already holds', async () => {
    expect(await steps.rename(workPackageId, qaId, ownerId, 'Dev')).toEqual({
      ok: false,
      reason: 'taken',
    });
  });

  it('refuses a step that belongs to another work package', async () => {
    const other = await new WorkPackageService({
      dependencyContext: sqliteDependencyContext(db, workPackageStore),
      clock: testClock,
      workPackages: workPackageStore,
      broadcast: recordingBroadcaster(),
    }).create('Roof', PARENT_PROJECT_ID, ownerId);
    if (typeof other === 'string')
      throw new Error(`fixture work package creation refused: ${other}`);
    const theirs = (await stepStore.listByWorkPackage(other.workPackage.id)).at(0);
    if (theirs === undefined) throw new Error('the other work package was created without steps');

    // Not found rather than forbidden: this work package does not have that step,
    // and saying "you may not" would tell the caller it exists here.
    expect(await steps.rename(workPackageId, theirs.id, ownerId, 'Review')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await stepStore.findById(theirs.id)).toEqual(theirs);
  });
});

/**
 * The real store with one method wrapped, so a test can put somebody else's
 * write in the gap between two of the service's calls.
 *
 * Written out rather than spread from the repository: `StepRepository`'s
 * methods live on its prototype, and `{ ...stepStore }` copies its connection
 * and none of them.
 */
function storeWith(overrides: Partial<StepStore>): StepStore {
  return {
    listByWorkPackage: (workPackageOf) => stepStore.listByWorkPackage(workPackageOf),
    findById: (stepOf) => stepStore.findById(stepOf),
    add: (toAdd, stamp) => stepStore.add(toAdd, stamp),
    rename: (workPackageOf, stepOf, name, stamp) =>
      stepStore.rename(workPackageOf, stepOf, name, stamp),
    usageOf: (workPackageOf, stepOf) => stepStore.usageOf(workPackageOf, stepOf),
    patchUnit: (...args) => stepStore.patchUnit(...args),
    remove: (workPackageOf, stepOf, cascade, stamp) =>
      stepStore.remove(workPackageOf, stepOf, cascade, stamp),
    ...overrides,
  };
}

describe('StepService.remove', () => {
  it('refuses direct blockage before opening the deletion transaction, including beneath done progress', async () => {
    const blockages = new StepBlockageRepository(db, OPEN);
    await blockages.set({ workItemId: 'strip', stepId: qaId, blockedAt: -12 }, wrote());
    const removeThroughStore = stepStore.remove.bind(stepStore);
    let transactionsOpened = 0;
    stepStore.remove = (...args: Parameters<StepStore['remove']>) => {
      transactionsOpened += 1;
      return removeThroughStore(...args);
    };
    for (const state of ['unknown', 'done']) {
      if (state === 'done')
        await progressStore.set(
          { workItemId: 'strip', stepId: qaId, state, statedAt: 44 },
          wrote(),
        );
      expect(await steps.remove(workPackageId, qaId, ownerId, false)).toMatchObject({
        ok: false,
        reason: 'in_use',
        inUse: { blockages: 1 },
      });
    }
    expect(transactionsOpened).toBe(0);
    expect(await blockages.listByWorkPackage(workPackageId)).toEqual([
      { workItemId: 'strip', stepId: qaId, blockedAt: -12 },
    ]);
    expect(broadcast.published).toEqual([]);
  });

  it('refuses a blockage arriving after the fast usage count', async () => {
    const blockages = new StepBlockageRepository(db, OPEN);
    const service = new StepService({
      dependencyContext: sqliteDependencyContext(db, workPackageStore),
      clock: testClock,
      workPackages: workPackageStore,
      broadcast,
      steps: storeWith({
        async usageOf(workPackage, step) {
          const counted = await stepStore.usageOf(workPackage, step);
          await blockages.set({ workItemId: 'strip', stepId: qaId, blockedAt: 52 }, wrote());
          return counted;
        },
      }),
    });
    expect(await service.remove(workPackageId, qaId, ownerId, false)).toMatchObject({
      ok: false,
      reason: 'in_use',
      inUse: { blockages: 1 },
    });
    expect(await stepStore.findById(qaId)).not.toBeNull();
    expect(await blockages.listByWorkPackage(workPackageId)).toHaveLength(1);
    expect(broadcast.published).toEqual([]);
  });

  it('confirmed cascade counts blockage facts, bumps blockage-only owners and keeps unrelated facts', async () => {
    const blockages = new StepBlockageRepository(db, OPEN);
    const workItems = new WorkItemRepository(db, OPEN);
    await blockages.set({ workItemId: 'strip', stepId: qaId, blockedAt: -12 }, wrote());
    await blockages.set({ workItemId: 'sand', stepId: devId, blockedAt: 33 }, wrote());
    const before = await workItems.listByWorkPackage(workPackageId);
    expect(await stepStore.remove(workPackageId, qaId, true, wrote())).toMatchObject({
      ok: true,
      removal: { blockages: 1, workItemIds: ['strip'] },
    });
    expect(await blockages.listByWorkPackage(workPackageId)).toEqual([
      { workItemId: 'sand', stepId: devId, blockedAt: 33 },
    ]);
    const after = await workItems.listByWorkPackage(workPackageId);
    for (const id of ['strip', 'sand'])
      expect(after.find((row) => row.id === id)?.revision).toBe(
        Number(before.find((row) => row.id === id)?.revision) + (id === 'strip' ? 1 : 0),
      );
  });

  it('rolls back blockage facts, step and revisions when deletion fails after owner bumps', async () => {
    const blockages = new StepBlockageRepository(db, OPEN);
    const workItems = new WorkItemRepository(db, OPEN);
    await blockages.set({ workItemId: 'strip', stepId: qaId, blockedAt: -12 }, wrote());
    const before = await workItems.listByWorkPackage(workPackageId);
    const workPackageBefore = await workPackageStore.findById(workPackageId);
    const connection = openDatabase(join(dir, 'test.db'));
    connection.run(
      "CREATE TRIGGER refuse_step_revision BEFORE UPDATE ON work_package BEGIN SELECT RAISE(ABORT, 'injected revision failure'); END",
    );
    connection.close();
    let failure: unknown;
    try {
      await steps.remove(workPackageId, qaId, ownerId, true);
    } catch (caught) {
      failure = caught;
    }
    if (!(failure instanceof Error))
      throw new Error('expected a work package revision write failure');
    expect(failure.message).toContain('update "work_package"');
    expect(await blockages.listByWorkPackage(workPackageId)).toEqual([
      { workItemId: 'strip', stepId: qaId, blockedAt: -12 },
    ]);
    expect(await stepStore.findById(qaId)).not.toBeNull();
    expect(await workItems.listByWorkPackage(workPackageId)).toEqual(before);
    expect(await workPackageStore.findById(workPackageId)).toEqual(workPackageBefore);
    expect(broadcast.published).toEqual([]);
  });

  it('removes a step nothing points at, without asking again', async () => {
    const outcome = await steps.remove(workPackageId, qaId, ownerId, false);

    expect(outcome).toEqual({ ok: true });
    expect(await stepStore.findById(qaId)).toBeNull();
    expect(broadcast.published).toEqual([
      { workPackageId, event: { type: 'step_removed', stepId: qaId } },
    ]);
  });

  it('refuses a step that is used, counting what would go', async () => {
    await estimates.set({ workItemId: 'strip', stepId: qaId, ...DAYS }, wrote());
    await estimates.set({ workItemId: 'sand', stepId: qaId, ...DAYS }, wrote());
    const ada = await personAdded(
      directory.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [], wrote()),
    );
    await directory.assign('strip', qaId, ada.id, wrote());
    await directory.assign('strip', devId, ada.id, wrote());

    const outcome = await steps.remove(workPackageId, qaId, ownerId, false);

    expect(outcome).toEqual({
      ok: false,
      reason: 'in_use',
      inUse: {
        estimates: 2,
        actuals: 0,
        progress: 0,
        blockages: 0,
        measures: 0,
        attempts: 0,
        claims: 0,
        assignments: 1,
        assumedAssignees: [{ workItemId: 'strip', assumedNow: null, assumedAfter: ada.id }],
      },
    });
    expect(await stepStore.findById(qaId)).not.toBeNull();
    expect(broadcast.published).toEqual([]);
  });

  it('carries the figures that are not days into the refusal it shows a person', async () => {
    // `inUseFrom` is the one place both readings — the fast path's and the
    // transaction's — are turned into the numbers somebody consents to. A count
    // that stopped at the repository would leave this step looking free: no
    // estimate, no recorded day, nobody assigned, and two figures that go.
    await measures.set(
      {
        workItemId: 'strip',
        stepId: qaId,
        metric: 'token_estimate',
        value: 8000,
        recordedAt: 1000,
      },
      wrote(),
    );
    await measures.set(
      {
        workItemId: 'strip',
        stepId: qaId,
        metric: 'token_actual',
        value: 9500,
        recordedAt: 2000,
      },
      wrote(),
    );

    const outcome = await steps.remove(workPackageId, qaId, ownerId, false);

    expect(outcome).toEqual({
      ok: false,
      reason: 'in_use',
      inUse: {
        estimates: 0,
        actuals: 0,
        progress: 0,
        blockages: 0,
        measures: 2,
        attempts: 0,
        claims: 0,
        assignments: 0,
        assumedAssignees: [],
      },
    });
    expect(await stepStore.findById(qaId)).not.toBeNull();
    expect(broadcast.published).toEqual([]);
  });

  it.each([
    [
      'recorded days',
      async () =>
        actuals.set({ workItemId: 'strip', stepId: qaId, days: 2, recordedAt: 1000 }, wrote()),
    ],
    [
      'progress',
      async () =>
        progressStore.set(
          { workItemId: 'strip', stepId: qaId, state: 'done', statedAt: 1000 },
          wrote(),
        ),
    ],
  ])(
    'refuses a step holding only %s at the gate, before a transaction opens',
    async (_what, hold) => {
      // **Two moments, one rule.** The gate refuses so a reader is asked to
      // confirm; the transaction refuses again because the gate's answer can be
      // stale by the time the deletes would run. The gate used to ask
      // `estimates > 0 || assignments > 0`, so a step holding only recorded days,
      // only progress, or only measures walked past it and was refused one layer
      // down instead.
      //
      // The outcome is identical either way — which is why the drift was
      // invisible for as long as it was, and why this asserts on the *store call*
      // rather than the answer. `carries the figures that are not days into the
      // refusal it shows a person` above passes with the gate broken.
      //
      // Two proofs, because the assertions break on different faults and
      // neither sees the other's. With the `actuals` term dropped from
      // `stepIsInUse`, the outcome assertion failed on `toMatchObject ·
      // - "ok": false · + "ok": true` — both callers ask that function now, so
      // the step is deleted outright. With the gate's condition put back to
      // `seen.estimates > 0 || seen.assignments > 0`, the count failed on
      // `Expected: 0 · Received: 1` for both cases: the answer was right and a
      // transaction opened to produce it. Both watched 2026-09-02.
      await hold();
      let transactionsOpened = 0;
      const removeThroughStore = stepStore.remove.bind(stepStore);
      stepStore.remove = (...args: Parameters<StepStore['remove']>) => {
        transactionsOpened += 1;
        return removeThroughStore(...args);
      };

      const outcome = await steps.remove(workPackageId, qaId, ownerId, false);

      expect(outcome).toMatchObject({ ok: false, reason: 'in_use' });
      expect(transactionsOpened).toBe(0);
      expect(await stepStore.findById(qaId)).not.toBeNull();
    },
  );

  it('removes it on the second, explicit call', async () => {
    await estimates.set({ workItemId: 'strip', stepId: qaId, ...DAYS }, wrote());
    expect(await steps.remove(workPackageId, qaId, ownerId, false)).toMatchObject({
      reason: 'in_use',
    });

    const outcome = await steps.remove(workPackageId, qaId, ownerId, true);

    expect(outcome).toEqual({ ok: true });
    expect(await estimates.listByWorkPackage(workPackageId)).toEqual([]);
    expect(broadcast.published).toEqual([
      { workPackageId, event: { type: 'step_removed', stepId: qaId } },
    ]);
  });

  it('refuses an unconfirmed removal when an estimate lands after the count', async () => {
    // The gap the confirmation opens, from the other side. The service counts
    // first as a fast path, and somebody estimates the doomed step in the
    // moment between that count and the delete. An unconfirmed request must
    // still refuse: it was never consent to take anything, and what it would
    // take is a trio nobody has been shown.
    const service = new StepService({
      dependencyContext: sqliteDependencyContext(db, workPackageStore),
      clock: testClock,
      workPackages: workPackageStore,
      steps: storeWith({
        async usageOf(watchedWorkPackage, watchedStep) {
          const counted = await stepStore.usageOf(watchedWorkPackage, watchedStep);
          await estimates.set({ workItemId: 'strip', stepId: qaId, ...DAYS }, wrote());
          return counted;
        },
      }),
      broadcast,
    });

    const outcome = await service.remove(workPackageId, qaId, ownerId, false);

    expect(outcome).toMatchObject({ ok: false, reason: 'in_use' });
    expect(await estimates.listByWorkPackage(workPackageId)).toHaveLength(1);
    expect(await stepStore.findById(qaId)).not.toBeNull();
    expect(broadcast.published).toEqual([]);
  });

  it('refuses the loser of two removals, bumping and announcing nothing', async () => {
    // Both requests pass the gate against a step that is still there, and one
    // of them commits first. The loser has nothing to remove, so it has nothing
    // to announce either: a second `step_removed` would make every client
    // reread for a change that did not happen, and the work package's revision would
    // move for a write nobody made.
    let winnerRevision: number | undefined;
    const service = new StepService({
      dependencyContext: sqliteDependencyContext(db, workPackageStore),
      clock: testClock,
      workPackages: workPackageStore,
      steps: storeWith({
        async findById(watched) {
          const found = await stepStore.findById(watched);
          if (winnerRevision === undefined) {
            await stepStore.remove(workPackageId, qaId, true, wrote());
            winnerRevision = (await workPackageStore.findById(workPackageId))?.revision;
          }
          return found;
        },
      }),
      broadcast,
    });

    const outcome = await service.remove(workPackageId, qaId, ownerId, true);

    expect(outcome).toEqual({ ok: false, reason: 'not_found' });
    expect((await workPackageStore.findById(workPackageId))?.revision).toBe(winnerRevision);
    expect(broadcast.published).toEqual([]);
  });

  it('refuses a caller who may not write to the work package, cascade or not', async () => {
    await workPackageStore.update(workPackageId, { restricted: true }, wrote());

    expect(await steps.remove(workPackageId, qaId, strangerId, true)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await stepStore.findById(qaId)).not.toBeNull();
  });

  it('refuses a step that is not there', async () => {
    expect(await steps.remove(workPackageId, crypto.randomUUID(), ownerId, true)).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});

describe('a step removed between the check and the write', () => {
  /**
   * A work item service whose estimate and assignment writes are preceded by
   * somebody else's removal of `qaId` — the commit that lands in the gap
   * between `holdsStep` saying yes and the write reaching the foreign key.
   */
  function serviceWritingIntoTheGap(): WorkItemService {
    const vanishing: EstimateStore = {
      readTarget: (workItemId, stepId) => estimates.readTarget(workItemId, stepId),
      listByWorkPackage: (of) => estimates.listByWorkPackage(of),
      listByWorkItems: (of, ids) => estimates.listByWorkItems(of, ids),
      listPlacements: (of, ids) => estimates.listPlacements(of, ids),
      remove: (workItemId, stepId, stamp) => estimates.remove(workItemId, stepId, stamp),
      moveAll: (from, to, stamp) => estimates.moveAll(from, to, stamp),
      async set(toSet, stamp) {
        await stepStore.remove(workPackageId, qaId, true, wrote());
        return await estimates.set(toSet, stamp);
      },
    };
    const vanishingToo: DirectoryStore = directoryWith(directory, {
      async assign(workItemId, stepId, personId, stamp) {
        await stepStore.remove(workPackageId, qaId, true, wrote());
        return directory.assign(workItemId, stepId, personId, stamp);
      },
    });
    return new WorkItemService({
      dependencyContext: createLocalDependencyContext({
        workPackages: workPackageStore,
        workItems: new WorkItemRepository(db, OPEN),
        estimates: vanishing,
        dependencies: new DependencyRepository(db, OPEN),
        typedDependencies: new TypedDependencyRepository(db, OPEN),
      }),
      externalDependencyAuthoring: INACTIVE_EXTERNAL_DEPENDENCIES,
      admission: LEGACY_EDIT_ADMISSION,
      scheduler: fastScheduler,
      clock: testClock,
      workItems: new WorkItemRepository(db, OPEN),
      workPackages: workPackageStore,
      estimates: vanishing,
      actuals: new ActualRepository(db, OPEN),
      measures: new StepMeasureRepository(db, OPEN),
      measureEstimates: new MeasureEstimateRepository(db, OPEN),
      budgets: new WorkItemBudgetRepository(db, OPEN),
      progress: new StepProgressRepository(db, OPEN),
      attempts: new StepNodeAttemptRepository(db, OPEN),
      blockages: new StepBlockageRepository(db, OPEN),
      stepParallels: new StepParallelRepository(db, OPEN),
      directory: vanishingToo,
      capacity: inMemoryCapacity(),
      demands: new DemandRepository(db, OPEN),
      resourceCapacity: new ResourceCapacityRepository(db, OPEN),
      priorityBands: inMemoryPriorityBands(),
      dependencies: new DependencyRepository(db, OPEN),
      typedDependencies: new TypedDependencyRepository(db, OPEN),
      subtrees: new SubtreeRepository(db, OPEN),
      journal: new CommandJournalRepository(db, OPEN),
      broadcast: recordingBroadcaster(),
    });
  }

  it('refuses the estimate rather than answering with the foreign key', async () => {
    const outcome = await serviceWritingIntoTheGap().setEstimate('strip', ownerId, qaId, DAYS);

    expect(outcome).toEqual({ ok: false, reason: 'unknown_step' });
    expect(await estimates.listByWorkPackage(workPackageId)).toEqual([]);
  });

  it('refuses the assignee the same way', async () => {
    const ada = await personAdded(
      directory.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [], wrote()),
    );

    const outcome = await serviceWritingIntoTheGap().assign('strip', ownerId, qaId, ada.id);

    expect(outcome).toEqual({ ok: false, reason: 'unknown_step' });
    expect(await directory.assignmentsOf(['strip'])).toEqual([]);
  });

  it('names the person, not the step, when it is the person who has gone', async () => {
    // The person is the one that has gone, and the step is exactly where it
    // was. Reporting `unknown_step` for that would be a confident lie about
    // which of the request's ids is wrong. It is `unknown_person` now rather
    // than the raw foreign key it used to be — `DirectoryRepository.assign`
    // reads the person inside its own transaction — but the thing being
    // asserted is unchanged: `writeNamingStep` must not claim the step.
    const workItems = new WorkItemService({
      dependencyContext: createLocalDependencyContext({
        workPackages: workPackageStore,
        workItems: new WorkItemRepository(db, OPEN),
        estimates: estimates,
        dependencies: new DependencyRepository(db, OPEN),
        typedDependencies: new TypedDependencyRepository(db, OPEN),
      }),
      externalDependencyAuthoring: INACTIVE_EXTERNAL_DEPENDENCIES,
      admission: LEGACY_EDIT_ADMISSION,
      scheduler: fastScheduler,
      clock: testClock,
      workItems: new WorkItemRepository(db, OPEN),
      workPackages: workPackageStore,
      estimates,
      actuals,
      measures,
      measureEstimates: new MeasureEstimateRepository(db, OPEN),
      budgets: new WorkItemBudgetRepository(db, OPEN),
      progress: progressStore,
      attempts: new StepNodeAttemptRepository(db, OPEN),
      blockages: new StepBlockageRepository(db, OPEN),
      stepParallels: new StepParallelRepository(db, OPEN),
      directory,
      capacity: inMemoryCapacity(),
      demands: new DemandRepository(db, OPEN),
      resourceCapacity: new ResourceCapacityRepository(db, OPEN),
      priorityBands: inMemoryPriorityBands(),
      dependencies: new DependencyRepository(db, OPEN),
      typedDependencies: new TypedDependencyRepository(db, OPEN),
      subtrees: new SubtreeRepository(db, OPEN),
      journal: new CommandJournalRepository(db, OPEN),
      broadcast: recordingBroadcaster(),
    });

    const outcome = await workItems.assign('strip', ownerId, qaId, 'nobody-by-that-id');

    expect(outcome).toEqual({ ok: false, reason: 'unknown_person' });
    expect(await stepStore.findById(qaId)).not.toBeNull();
    expect(await directory.assignmentsOf(['strip'])).toEqual([]);
  });
});

describe('step events', () => {
  /** What the work package's steps looked like at the moment each event was published. */
  function watchingBroadcaster(): { stepsAtPublish: string[][] } & Broadcaster {
    const stepsAtPublish: string[][] = [];
    return {
      stepsAtPublish,
      async publish(watched: string) {
        stepsAtPublish.push((await stepStore.listByWorkPackage(watched)).map((each) => each.name));
      },
      latestSeq: () => Promise.resolve(-1),
    };
  }

  it('records the event after the write, never before it', async () => {
    // The sequence-consistency rule, asserted where it is decided rather than
    // reasoned about: a reader that acts on the event — a client rereading the
    // work package, the replay log recording it — must never see the work package as it
    // was before the change. Reading the steps from inside `publish` is the
    // only moment that can tell the two orders apart.
    const watching = watchingBroadcaster();
    const service = new StepService({
      dependencyContext: sqliteDependencyContext(db, workPackageStore),
      clock: testClock,
      workPackages: workPackageStore,
      steps: stepStore,
      broadcast: watching,
    });

    await service.add(workPackageId, ownerId, 'Design', 0);
    await service.remove(workPackageId, qaId, ownerId, true);

    expect(watching.stepsAtPublish[0]).toContain('Design');
    expect(watching.stepsAtPublish[1]).not.toContain('QA');
  });

  it('replays a step event to a client that reconnects', async () => {
    const eventLog = new DrizzleEventLogStore(db, OPEN);
    const buffer = new ReplayBuffer({
      maxPerSubscription: 100,
      maxAgeMs: 60_000,
      now: Date.now,
    });
    const durable = new StepService({
      dependencyContext: sqliteDependencyContext(db, workPackageStore),
      clock: testClock,
      workPackages: workPackageStore,
      steps: stepStore,
      broadcast: new GatewayBroadcaster({
        clock: testClock,
        eventLog: new EventLogService(eventLog),
        buffer,
        // Nowhere to push, deliberately: the replay must come from what was
        // recorded, not from a delivery that happened to succeed.
        push: new PushClient({
          ...{
            timers: systemTimers,
            fetchImpl: globalThis.fetch,
            attemptMs: 5000,
            overallMs: 15000,
          },
          gwUrl: 'http://gw.invalid',
          secret: 's'.repeat(32),
        }),
        onPushFailed: () => undefined,
      }),
    });
    const subscription = `work-package:${workPackageId}`;

    await durable.add(workPackageId, ownerId, 'Design', 0);
    const seenUpTo = await eventLog.latestSeq(subscription);
    await durable.remove(workPackageId, qaId, ownerId, true);

    const replayed = await new ReplayOrchestrator({
      log: new EventLogService(eventLog),
      buffer,
    }).replay({
      [subscription]: seenUpTo,
    });

    expect(replayed[subscription]).toEqual({
      status: 'replaying',
      events: [{ seq: seenUpTo + 1, message: { type: 'step_removed', stepId: qaId } }],
    });
  });
});

for (const cascade of [false, true]) {
  it(`refuses retained sparse parallelism atomically (cascade=${String(cascade)})`, async () => {
    const parallels = new StepParallelRepository(db, OPEN);
    await parallels.set({ workItemId: 'strip', stepId: devId, maxParallel: 1 }, wrote());
    await parallels.set({ workItemId: 'sand', stepId: devId, maxParallel: 2 }, wrote());
    await parallels.set({ workItemId: 'sand', stepId: qaId, maxParallel: 3 }, wrote());
    const before = await workPackageStore.findById(workPackageId);
    const nodes = [
      { workItemId: 'sand', stepId: devId },
      { workItemId: 'strip', stepId: devId },
    ];
    expect(await stepStore.remove(workPackageId, devId, cascade, wrote())).toEqual({
      ok: false,
      reason: 'referenced_by_step_parallel',
      nodes,
    });
    expect(await steps.remove(workPackageId, devId, ownerId, cascade)).toEqual({
      ok: false,
      reason: 'referenced_by_step_parallel',
      nodes,
    });
    expect(await workPackageStore.findById(workPackageId)).toEqual(before);
    expect(broadcast.published).toEqual([]);
    expect(await stepStore.remove('foreign', devId, cascade, wrote())).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await stepStore.remove(workPackageId, 'missing', cascade, wrote())).toEqual({
      ok: false,
      reason: 'not_found',
    });
    await parallels.remove('strip', devId, wrote());
    await parallels.remove('sand', devId, wrote());
    expect(await stepStore.remove(workPackageId, devId, cascade, wrote())).toMatchObject({
      ok: true,
    });
    expect(await parallels.listByWorkPackage(workPackageId)).toEqual([
      { workItemId: 'sand', stepId: qaId, maxParallel: 3 },
    ]);
  });
}

it('refuses sparse parallelism inserted after the fast usage count', async () => {
  const parallels = new StepParallelRepository(db, OPEN);
  const service = new StepService({
    dependencyContext: sqliteDependencyContext(db, workPackageStore),
    clock: testClock,
    workPackages: workPackageStore,
    broadcast,
    steps: storeWith({
      async usageOf(workPackage, step) {
        const counted = await stepStore.usageOf(workPackage, step);
        await parallels.set({ workItemId: 'strip', stepId: devId, maxParallel: 1 }, wrote());
        return counted;
      },
    }),
  });
  expect(await service.remove(workPackageId, devId, ownerId, false)).toEqual({
    ok: false,
    reason: 'referenced_by_step_parallel',
    nodes: [{ workItemId: 'strip', stepId: devId }],
  });
  expect(await stepStore.findById(devId)).not.toBeNull();
  expect(broadcast.published).toEqual([]);
});

it('authorizes before consulting sparse step references', async () => {
  await workPackageStore.update(workPackageId, { restricted: true }, wrote());
  await new StepParallelRepository(db, OPEN).set(
    { workItemId: 'strip', stepId: devId, maxParallel: 1 },
    wrote(),
  );
  let removals = 0;
  const service = new StepService({
    dependencyContext: sqliteDependencyContext(db, workPackageStore),
    clock: testClock,
    workPackages: workPackageStore,
    broadcast,
    steps: storeWith({
      async remove(...args) {
        removals++;
        return stepStore.remove(...args);
      },
    }),
  });
  expect(await service.remove(workPackageId, devId, strangerId, true)).toEqual({
    ok: false,
    reason: 'forbidden',
  });
  expect(removals).toBe(0);
});
