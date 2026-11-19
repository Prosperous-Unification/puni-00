import { seedLegacyProject } from '../testing/project-fixture';
const PARENT_PROJECT_ID = 'service-fixture-parent';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LEGACY_EDIT_ADMISSION } from '@wbs/core';
import { StepService } from '@wbs/core/module/step/step.resource';
import { WorkPackageService } from '@wbs/core/module/work-package/work-package.resource';
import { INACTIVE_EXTERNAL_DEPENDENCIES } from '@wbs/core/ports/external-dependency-authoring';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { expectCreated } from '@wbs/core/testing/expect-created';
import { MeasureEstimateRepository } from '@wbs/store-sqlite/measure-estimate';
import { DemandRepository, ResourceCapacityRepository } from '@wbs/store-sqlite/resource';
import { StepBlockageRepository } from '@wbs/store-sqlite/step-blockage';
import { StepNodeAttemptRepository } from '@wbs/store-sqlite/step-node-attempt';
import { StepParallelRepository } from '@wbs/store-sqlite/step-parallel';
import { TypedDependencyRepository } from '@wbs/store-sqlite/typed-dependency';
import { WorkItemBudgetRepository } from '@wbs/store-sqlite/work-item-budget';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import type { Step, WorkItem, WriteStamp } from '../repository';
import { ActualRepository } from '../repository/actual';
import { openDrizzle } from '../repository/db';
import { DependencyRepository } from '../repository/dependency';
import { DirectoryRepository } from '../repository/directory';
import { EstimateRepository } from '../repository/estimate';
import { OPEN } from '../repository/gate';
import { runMigrations } from '../repository/migrate';
import { StepRepository } from '../repository/step';
import { StepMeasureRepository } from '../repository/step-measure';
import { StepProgressRepository } from '../repository/step-progress';
import { UserRepository } from '../repository/user';
import { SubtreeRepository, WorkItemRepository } from '../repository/work-item';
import { WorkPackageRepository } from '../repository/work-package';
import { AvailableWorkItemService as WorkItemService } from '../testing/available-work-item-service';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { inMemoryCapacity } from '../testing/capacity-fixture';
import { testClock } from '../testing/clock-fixture';
import { inMemoryCommandJournal } from '../testing/command-journal-fixture';
import { sqliteDependencyContext } from '../testing/dependency-graph-fixture';
import { personAdded } from '../testing/directory-fixture';
import { inMemoryPriorityBands } from '../testing/priority-band-fixture';
import { workItemRow } from '../testing/work-item-fixture';
import { fastScheduler } from './optimizer-wiring';

/**
 * The revision battery: every mutation the API offers, and exactly which
 * revisions it moves.
 *
 * **Against real SQLite, and only there.** The bump is `revision = revision + 1`
 * inside the statement that makes the change, so a Map-backed fixture asserting
 * it would be asserting a second implementation of the rule — the in-memory
 * stores in `src/testing/` deliberately model no revisions at all, for the same
 * reason `subtree-fixture.ts` refuses to claim atomicity it cannot have.
 *
 * The **not-moving** assertions carry as much weight as the moving ones. A
 * counter that goes up on everything is a counter nobody can put a precondition
 * on: opening a work package, respacing a sibling, or copying a branch would each
 * defeat a write that had nothing to do with them.
 */
const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

let dir: string;
let path: string;
let workItems: WorkItemService;
let workPackages: WorkPackageService;
let stepService: StepService;
let workPackageStore: WorkPackageRepository;
let workItemStore: WorkItemRepository;
let estimateStore: EstimateRepository;
let actualStore: ActualRepository;
let measureStore: StepMeasureRepository;
let progressStore: StepProgressRepository;
let workPackageId: string;
let ownerId: string;
let steps: Step[];

/** The first step every work package starts with, which the estimate cases write to. */
const dev = (): string => {
  const found = steps.at(0);
  if (found === undefined)
    throw new Error('the work package was created without its starting steps');
  return found.id;
};

const DAYS = { optimistic: 1, realistic: 2, pessimistic: 3 };

/**
 * The stamp the direct-to-repository writes below carry. Nothing here is a claim
 * about the instant or the actor; the account has to be the seeded owner because
 * `created_by` references `users(id)` and this file is against real SQLite.
 */
const wrote = (): WriteStamp => ({ at: 1, by: ownerId });

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-revision-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  seedLegacyProject(path, 'service-fixture-legacy', PARENT_PROJECT_ID);
  const db = openDrizzle(path);

  workPackageStore = new WorkPackageRepository(db, OPEN);
  workItemStore = new WorkItemRepository(db, OPEN);
  estimateStore = new EstimateRepository(db, OPEN);
  actualStore = new ActualRepository(db, OPEN);
  measureStore = new StepMeasureRepository(db, OPEN);
  progressStore = new StepProgressRepository(db, OPEN);
  const dependencies = new DependencyRepository(db, OPEN);
  const directory = new DirectoryRepository(db, OPEN);

  ownerId = crypto.randomUUID();
  await new UserRepository(db, OPEN).create(
    {
      id: ownerId,
      username: 'owner',
      passwordHash: 'x',
      createdAt: 1,
    },
    wrote(),
  );

  workPackages = new WorkPackageService({
    dependencyContext: sqliteDependencyContext(db, workPackageStore),
    clock: testClock,
    workPackages: workPackageStore,
    broadcast: recordingBroadcaster(),
  });
  stepService = new StepService({
    dependencyContext: sqliteDependencyContext(db, workPackageStore),
    clock: testClock,
    workPackages: workPackageStore,
    steps: new StepRepository(db, OPEN),
    broadcast: recordingBroadcaster(),
  });
  workItems = new WorkItemService({
    dependencyContext: createLocalDependencyContext({
      workPackages: workPackageStore,
      workItems: workItemStore,
      estimates: estimateStore,
      dependencies: dependencies,
      typedDependencies: new TypedDependencyRepository(db, OPEN),
    }),
    externalDependencyAuthoring: INACTIVE_EXTERNAL_DEPENDENCIES,
    admission: LEGACY_EDIT_ADMISSION,
    scheduler: fastScheduler,
    clock: testClock,
    workItems: workItemStore,
    workPackages: workPackageStore,
    estimates: estimateStore,
    actuals: actualStore,
    measures: measureStore,
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
    dependencies,
    typedDependencies: new TypedDependencyRepository(db, OPEN),
    subtrees: new SubtreeRepository(db, OPEN),
    journal: inMemoryCommandJournal(),
    broadcast: recordingBroadcaster(),
  });

  const created = expectCreated(
    await workPackages.create('Rewire the shed', PARENT_PROJECT_ID, ownerId),
  );
  workPackageId = created.workPackage.id;
  steps = created.steps;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** The stored revision of one work item. Throws rather than defaulting: an absent row is a bug in the test. */
async function revisionOf(id: string): Promise<number> {
  const found = await workItemStore.findById(id);
  if (found === null) throw new Error(`no work item ${id}`);
  return found.revision;
}

async function workPackageRevision(): Promise<number> {
  const found = await workPackageStore.findById(workPackageId);
  if (found === null) throw new Error(`no work package ${workPackageId}`);
  return found.revision;
}

/** Creates a root work item and answers its id, failing loudly on a refusal. */
async function root(name: string, afterId: string | null = null): Promise<string> {
  const outcome = await workItems.create(workPackageId, ownerId, { parentId: null, afterId, name });
  if (!outcome.ok) throw new Error(`create refused: ${outcome.reason}`);
  return outcome.value.id;
}

async function child(parentId: string, name: string): Promise<string> {
  const outcome = await workItems.create(workPackageId, ownerId, { parentId, afterId: null, name });
  if (!outcome.ok) throw new Error(`create refused: ${outcome.reason}`);
  return outcome.value.id;
}

describe('what a create starts at', () => {
  it('starts a work package and a work item at 0', async () => {
    const strip = await root('Strip');

    expect(await workPackageRevision()).toBe(0);
    expect(await revisionOf(strip)).toBe(0);
  });

  it('creates a work item without moving the work package or its siblings', async () => {
    const strip = await root('Strip');

    const cable = await root('Cable', strip);

    expect(await revisionOf(strip)).toBe(0);
    expect(await revisionOf(cable)).toBe(0);
    expect(await workPackageRevision()).toBe(0);
  });

  /**
   * A first child is 1, not 0, and that is the honest reading: the estimate
   * handoff is a second write, and the child genuinely holds figures it did not
   * hold a statement earlier. The parent moves for the same reason — it no
   * longer holds them.
   */
  it('hands the estimate down to a first child, moving both', async () => {
    const strip = await root('Strip');
    const outcome = await workItems.setEstimate(strip, ownerId, dev(), DAYS);
    expect(outcome.ok).toBe(true);
    const before = await revisionOf(strip);

    const sockets = await child(strip, 'Sockets');

    expect(await revisionOf(sockets)).toBe(1);
    expect(await revisionOf(strip)).toBe(before + 1);
  });
});

describe('what a work item write moves', () => {
  it('moves the item it patched and no other', async () => {
    const strip = await root('Strip');
    const cable = await root('Cable', strip);

    const outcome = await workItems.patch(strip, ownerId, { name: 'Strip out' });

    expect(outcome.ok).toBe(true);
    expect(await revisionOf(strip)).toBe(1);
    expect(await revisionOf(cable)).toBe(0);
  });

  it('counts every patch, so three edits read as three', async () => {
    const strip = await root('Strip');

    await workItems.patch(strip, ownerId, { name: 'One' });
    await workItems.patch(strip, ownerId, { notes: 'Two' });
    await workItems.patch(strip, ownerId, { serviceTeamId: null });

    expect(await revisionOf(strip)).toBe(3);
  });

  it('moves the work item that moved', async () => {
    const strip = await root('Strip');
    const cable = await root('Cable', strip);

    const outcome = await workItems.move(
      cable,
      ownerId,
      { parentId: strip, afterId: null },
      { kind: 'legacy' },
    );

    expect(outcome.ok).toBe(true);
    expect(await revisionOf(cable)).toBe(1);
  });

  /**
   * The rule the whole design rests on: a respaced sibling keeps its revision.
   *
   * Its `position` changed and so, quite possibly, did the number a reader sees
   * for it — but position is storage detail and the number is derived from the
   * whole tree. A revision that followed the derived number would move on every
   * row of the work package for one insertion, and a precondition on it would then
   * only ever pass for whoever wrote last.
   *
   * Asserted at the repository, because that is the layer that is handed the
   * respacing: reaching a respace through the service needs a sibling group with
   * no gaps left in it, which proves nothing extra.
   */
  it('leaves a respaced sibling where it was', async () => {
    const strip = await root('Strip');
    const cable = await root('Cable', strip);
    const survey = await root('Survey', cable);

    await workItemStore.move(
      survey,
      null,
      15,
      [
        { id: strip, position: 10 },
        { id: cable, position: 30 },
      ],
      wrote(),
    );

    expect(await revisionOf(survey)).toBe(1);
    expect(await revisionOf(strip)).toBe(0);
    expect(await revisionOf(cable)).toBe(0);
  });

  it('leaves the siblings an insertion respaced where they were', async () => {
    const strip = await root('Strip');
    const cable = await root('Cable', strip);

    const inserted: WorkItem = workItemRow({
      id: crypto.randomUUID(),
      workPackageId,
      position: 20,
      name: 'Survey',
    });
    await workItemStore.insert(
      inserted,
      [
        { id: strip, position: 10 },
        { id: cable, position: 30 },
      ],
      wrote(),
    );

    expect(await revisionOf(inserted.id)).toBe(0);
    expect(await revisionOf(strip)).toBe(0);
    expect(await revisionOf(cable)).toBe(0);
  });

  it('moves the children a deletion promoted', async () => {
    const strip = await root('Strip');
    const sockets = await child(strip, 'Sockets');
    const cable = await root('Cable', strip);
    const before = await revisionOf(sockets);

    const outcome = await workItems.remove(strip, ownerId, 'promote', { kind: 'legacy' });

    expect(outcome.ok).toBe(true);
    expect(await revisionOf(sockets)).toBe(before + 1);
    // The former sibling was respaced into the promoted group and nothing else.
    expect(await revisionOf(cable)).toBe(0);
  });
});

describe('what a freeze moves', () => {
  it('moves the rows it wrote a number onto, and leaves the ones already frozen', async () => {
    const strip = await root('Strip');
    await workItems.freeze(workPackageId, ownerId);
    const cable = await root('Cable', strip);

    const outcome = await workItems.freeze(workPackageId, ownerId);

    expect(outcome.ok).toBe(true);
    // Frozen once. The second freeze writes only what was still deriving, which
    // is what lets a work package be frozen, planned into, and frozen again.
    expect(await revisionOf(strip)).toBe(1);
    expect(await revisionOf(cable)).toBe(1);
  });

  it('moves a work item returned to deriving', async () => {
    const strip = await root('Strip');
    await workItems.freeze(workPackageId, ownerId);

    const outcome = await workItems.unfreeze(strip, ownerId);

    expect(outcome.ok).toBe(true);
    expect(await revisionOf(strip)).toBe(2);
  });
});

describe('what an estimate moves', () => {
  it('moves the work item it is on and no other', async () => {
    const strip = await root('Strip');
    const cable = await root('Cable', strip);

    await workItems.setEstimate(strip, ownerId, dev(), DAYS);

    expect(await revisionOf(strip)).toBe(1);
    expect(await revisionOf(cable)).toBe(0);
  });

  it('moves it again when the trio is cleared', async () => {
    const strip = await root('Strip');
    await workItems.setEstimate(strip, ownerId, dev(), DAYS);

    await workItems.clearEstimate(strip, ownerId, dev());

    expect(await revisionOf(strip)).toBe(2);
  });

  /**
   * The counter is arithmetic in the database, not a number this process chose.
   *
   * Two `EstimateRepository`s on two connections to one file, neither of which
   * has read the row: each write leaves `revision + 1` behind, so the second
   * lands on what the first wrote rather than on what its own process last saw.
   *
   * **The honest limit.** `bun:sqlite` is synchronous and in-process, so two
   * writers cannot actually be raced here — this does not observe a lost update,
   * and no test in this repo does. What it observes is the property that makes a
   * lost update impossible: the new value is computed by SQLite from the row's
   * current contents. The fault that breaks it is the bump written as a value
   * this process worked out, which passes every single-write assertion above and
   * fails here; see `verify.md`.
   */
  it('leaves the counter at 2 after two writes through two connections', async () => {
    const strip = await root('Strip');
    const first = new EstimateRepository(openDrizzle(path), OPEN);
    const second = new EstimateRepository(openDrizzle(path), OPEN);

    await first.set({ workItemId: strip, stepId: dev(), ...DAYS }, wrote());
    await second.set(
      {
        workItemId: strip,
        stepId: dev(),
        optimistic: 2,
        realistic: 4,
        pessimistic: 6,
      },
      wrote(),
    );

    expect(await revisionOf(strip)).toBe(2);
  });

  it('takes the estimates back when the last child goes, moving the parent', async () => {
    const strip = await root('Strip');
    const sockets = await child(strip, 'Sockets');
    await workItems.setEstimate(sockets, ownerId, dev(), DAYS);
    const before = await revisionOf(strip);

    const outcome = await workItems.remove(sockets, ownerId, 'cascade', { kind: 'legacy' });

    expect(outcome.ok).toBe(true);
    expect(await revisionOf(strip)).toBe(before + 1);
  });
});

describe('what an assignment moves', () => {
  it('moves the work item assigned, and no other', async () => {
    const strip = await root('Strip');
    const cable = await root('Cable', strip);
    const person = await personAdded(
      new DirectoryRepository(openDrizzle(path), OPEN).addPerson(
        { id: crypto.randomUUID(), name: 'Ada' },
        [],
        wrote(),
      ),
    );

    await workItems.assign(strip, ownerId, dev(), person.id);

    expect(await revisionOf(strip)).toBe(1);
    expect(await revisionOf(cable)).toBe(0);

    await workItems.assign(strip, ownerId, dev(), null);

    expect(await revisionOf(strip)).toBe(2);
    expect(await revisionOf(cable)).toBe(0);
  });
});

describe('what a dependency moves', () => {
  it('moves both endpoints and no third row', async () => {
    const strip = await root('Strip');
    const cable = await root('Cable', strip);
    const survey = await root('Survey', cable);

    const outcome = await workItems.addDependency(cable, ownerId, strip);

    expect(outcome.ok).toBe(true);
    expect(await revisionOf(strip)).toBe(1);
    expect(await revisionOf(cable)).toBe(1);
    expect(await revisionOf(survey)).toBe(0);
  });

  it('moves both endpoints again when the edge is removed', async () => {
    const strip = await root('Strip');
    const cable = await root('Cable', strip);
    await workItems.addDependency(cable, ownerId, strip);

    await workItems.removeDependency(cable, ownerId, strip);

    expect(await revisionOf(strip)).toBe(2);
    expect(await revisionOf(cable)).toBe(2);
  });

  /**
   * A deletion takes every edge touching the doomed rows with it, and the work
   * items at the *other* ends survive with one fewer dependency than they had.
   * They are the ones that read differently afterwards, so they are the ones
   * that move.
   */
  it('moves what still depended on a work item that was deleted', async () => {
    const strip = await root('Strip');
    const cable = await root('Cable', strip);
    await workItems.addDependency(cable, ownerId, strip);
    const before = await revisionOf(cable);

    const outcome = await workItems.remove(strip, ownerId, 'cascade', { kind: 'legacy' });

    expect(outcome.ok).toBe(true);
    expect(await revisionOf(cable)).toBe(before + 1);
  });
});

describe('what a duplicate does not move', () => {
  it('copies a branch at 0 and leaves the original where it was', async () => {
    const strip = await root('Strip');
    const sockets = await child(strip, 'Sockets');
    await workItems.setEstimate(sockets, ownerId, dev(), DAYS);
    const stripBefore = await revisionOf(strip);
    const socketsBefore = await revisionOf(sockets);

    const outcome = await workItems.duplicate(strip, ownerId);

    if (!outcome.ok) throw new Error(`duplicate refused: ${outcome.reason}`);
    expect(await revisionOf(outcome.value.id)).toBe(0);
    // A copy does not change what it was copied from. This is the assertion
    // that keeps `duplicate` from defeating a precondition somebody else holds
    // on the original.
    expect(await revisionOf(strip)).toBe(stripBefore);
    expect(await revisionOf(sockets)).toBe(socketsBefore);
  });
});

describe('what a work package write moves', () => {
  it('moves allowed legacy fields before restriction and leaves later writes unchanged', async () => {
    await workPackages.update(workPackageId, ownerId, { name: 'Rewire the shed, properly' });
    expect(await workPackageRevision()).toBe(1);

    await workPackages.update(workPackageId, ownerId, { estimateMethod: 'pessimistic' });
    expect(await workPackageRevision()).toBe(2);

    await workPackages.update(workPackageId, ownerId, { startDate: '2026-08-10' });
    expect(await workPackageRevision()).toBe(3);

    await workPackages.update(workPackageId, ownerId, { restricted: true });
    expect(await workPackageRevision()).toBe(4);
    expect(
      await workPackages.update(workPackageId, ownerId, { name: 'Blocked after restriction' }),
    ).toEqual({ ok: false, reason: 'forbidden' });
    expect(await workPackageRevision()).toBe(4);
  });

  /**
   * Navigation history, not a change to the plan. If opening a work package moved
   * it, a second tab would defeat every conditional write anybody made.
   */
  it('does not move the work package when somebody opens it', async () => {
    const opened = await workPackages.open(workPackageId, ownerId);

    expect(opened).toBe(true);
    expect(await workPackageRevision()).toBe(0);
  });

  it('does not move the work package when a work item under it changes', async () => {
    const strip = await root('Strip');
    await workItems.patch(strip, ownerId, { name: 'Strip out' });
    await workItems.setEstimate(strip, ownerId, dev(), DAYS);

    expect(await workPackageRevision()).toBe(0);
  });

  it('does not move a work item when the work package it is in changes', async () => {
    const strip = await root('Strip');

    await workPackages.update(workPackageId, ownerId, { name: 'Renamed' });

    expect(await revisionOf(strip)).toBe(0);
  });
});

describe('what a step write moves', () => {
  it('moves the work package on each step write, and no work item on an add or a rename', async () => {
    const strip = await root('Strip');
    await workItems.setEstimate(strip, ownerId, dev(), DAYS);
    const estimated = await revisionOf(strip);

    const added = await stepService.add(workPackageId, ownerId, 'Design', 0);
    if (!added.ok) throw new Error(`add refused: ${added.reason}`);
    expect(await workPackageRevision()).toBe(1);

    const renamed = await stepService.rename(workPackageId, added.value.id, ownerId, 'Drawing');
    if (!renamed.ok) throw new Error(`rename refused: ${renamed.reason}`);
    expect(await workPackageRevision()).toBe(2);

    // A step arriving or being renamed writes nothing of any work item's: no
    // stored field of theirs moved and no satellite of theirs was written, so a
    // precondition on a row somebody is editing must survive it.
    expect(await revisionOf(strip)).toBe(estimated);
  });

  it('moves the work package and only the work items a removal emptied', async () => {
    const strip = await root('Strip');
    const sand = await root('Sand');
    await workItems.setEstimate(strip, ownerId, dev(), DAYS);
    const stripBefore = await revisionOf(strip);
    const sandBefore = await revisionOf(sand);
    const workPackageBefore = await workPackageRevision();

    const removed = await stepService.remove(workPackageId, dev(), ownerId, true);
    expect(removed).toEqual({ ok: true });

    expect(await workPackageRevision()).toBe(workPackageBefore + 1);
    expect(await revisionOf(strip)).toBe(stripBefore + 1);
    // Held nothing of that step's, so nobody's reading of it changed.
    expect(await revisionOf(sand)).toBe(sandBefore);
  });
});

describe('what a reader is told', () => {
  it('reports every work item’s revision and the work package’s in one read', async () => {
    const strip = await root('Strip');
    await workItems.patch(strip, ownerId, { name: 'Strip out' });
    await workPackages.update(workPackageId, ownerId, { name: 'Renamed' });

    const tree = await workItems.tree(workPackageId);

    expect(tree?.workPackageRevision).toBe(1);
    expect(tree?.workItems.map((row) => [row.id, row.revision])).toEqual([[strip, 1]]);
  });
});
