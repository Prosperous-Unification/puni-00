import { inMemoryActuals } from '@wbs/store-memory/actual-fixture';
import { inMemoryAttempts } from '@wbs/store-memory/attempt-fixture';
import { inMemoryBudgets } from '@wbs/store-memory/budget-fixture';
import { inMemoryCapacity } from '@wbs/store-memory/capacity-fixture';
import { inMemoryCommandJournal } from '@wbs/store-memory/command-journal-fixture';
import { inMemoryDependencies } from '@wbs/store-memory/dependency-fixture';
import { inMemoryDirectory, memoryDirectoryTables } from '@wbs/store-memory/directory-fixture';
import { inMemoryEstimates } from '@wbs/store-memory/estimate-fixture';
import {
  inMemoryMeasureEstimates,
  memoryMeasureEstimateTable,
} from '@wbs/store-memory/measure-estimate-fixture';
import { inMemoryMeasures, memoryMeasureTable } from '@wbs/store-memory/measure-fixture';
import { inMemoryWorkItems } from '@wbs/store-memory/memory-work-item-fixture';
import { inMemoryPriorityBands } from '@wbs/store-memory/priority-band-fixture';
import { inMemoryProgress } from '@wbs/store-memory/progress-fixture';
import { inMemoryProjects } from '@wbs/store-memory/project-fixture';
import {
  cascadeDemands,
  inMemoryDemands,
  inMemoryResourceCapacity,
  memoryResourceTables,
} from '@wbs/store-memory/resource-fixture';
import { inMemoryStepBlockages } from '@wbs/store-memory/step-blockage-fixture';
import { inMemoryStepParallels } from '@wbs/store-memory/step-parallel-fixture';
import { inMemorySubtrees } from '@wbs/store-memory/subtree-fixture';
import { inMemoryTypedDependencies } from '@wbs/store-memory/typed-dependency-fixture';

import type { WorkItemServiceOptions } from '../module/work-item/work-item.resource';
import { CREATOR_ADMISSION } from '../ports/edit-admission';
import { INACTIVE_EXTERNAL_DEPENDENCIES } from '../ports/external-dependency-authoring';
import { createLocalDependencyContext } from '../service/dependency-context';
import { AvailableWorkItemService } from './available-work-item-service';
import { type RecordingBroadcaster, recordingBroadcaster } from './broadcast-fixture';
import { testClock } from './clock-fixture';
import { fastScheduler } from './scheduler-fixture';

/**
 * A {@link WorkItemService} over in-memory stores, **with the stores.**
 *
 * `buildServices` is the composition root over a real `Drizzle`; this is its T0
 * twin, and the two answer the same object graph so a suite can move between
 * tiers by changing one line.
 *
 * Handing the stores back is the whole difference from
 * {@link testWorkItemService}, which composes the same graph and then discards
 * them — which is why twenty-four test files re-derived it by hand instead of
 * using it. A suite that seeds a plan or asserts on a row needs the store, and
 * the graph is thirteen ports with three wiring rules that are easy to get
 * subtly wrong:
 *
 * - `inMemoryWorkItems` takes the **directory**, so labels resolve; built
 *   without one, a row's effective team set is empty and no test can see it.
 * - the four satellite stores take the **work item store**, so a row's figures
 *   follow it through a move and go with it on a delete.
 * - `inMemorySubtrees` takes **all seven**, because a subtree write is the one
 *   act that touches every table at once.
 *
 * Get one of those wrong and nothing says so: the graph still constructs, the
 * suite still runs, and a label or a figure is simply never there to assert on.
 *
 * (The 2026-09-02 review claimed `undo.test.ts:122` mixed a real
 * `SubtreeRepository(db)` into an in-memory graph. It does not. That suite wires
 * **real** repositories throughout and takes in-memory fixtures for exactly two
 * ports, `capacity` and `priorityBands`, which its cases never drive. It is a
 * T1 suite and this harness does not apply to it.)
 *
 * Every port can be overridden, because the variation between suites is real: a
 * test that reads the plan's history wraps the journal, and one that drives two
 * projects seeds the project store. Anything not named is built here.
 */
export interface InMemoryPlan {
  service: AvailableWorkItemService;
  scheduler: WorkItemServiceOptions['scheduler'];
  /** The recording broadcaster, unless one was passed in. */
  broadcast: RecordingBroadcaster;
  stores: Required<
    Pick<
      WorkItemServiceOptions,
      | 'workItems'
      | 'projects'
      | 'estimates'
      | 'actuals'
      | 'measures'
      | 'measureEstimates'
      | 'budgets'
      | 'progress'
      | 'attempts'
      | 'blockages'
      | 'stepParallels'
      | 'dependencies'
      | 'typedDependencies'
      | 'directory'
      | 'capacity'
      | 'priorityBands'
      | 'journal'
      | 'subtrees'
      | 'demands'
      | 'resourceCapacity'
    >
  >;
}

export function inMemoryServices(overrides: Partial<WorkItemServiceOptions> = {}): InMemoryPlan {
  // The demand and capacity stores read the directory's own resource tables, so
  // a resource the directory declares is one they know; a caller's own directory
  // holds tables this harness cannot see, and gets an empty catalog beside it.
  const directoryTables = memoryDirectoryTables();
  const resourceTables =
    overrides.directory === undefined ? directoryTables.resources : memoryResourceTables();
  const directory =
    overrides.directory ??
    inMemoryDirectory(
      (projectId): Promise<readonly { id: string }[]> => workItems.listByProject(projectId),
      directoryTables,
    );
  const rowsOnlyWorkItems = overrides.workItems ?? inMemoryWorkItems(directory);
  // A removed row takes its demands, as `bindStores` and SQLite's cascade do:
  // left behind, they would come back with the row on an undo that wrote none,
  // and a test here would pass where production loses them.
  // Proof: with this cascade removed, `takes a removed row's demands, so a row
  // put back without them reads none` (harness.test.ts) read the demand back
  // after the reinsert; watched 2026-10-20.
  //
  // A proxy, not a spread: an overriding store may be a class instance (the
  // SQLite `WorkItemRepository` the scope tests pass), whose reads live on its
  // prototype, which a spread drops.
  // Proof: with the spread, the six scope tests in `assignment-scope`,
  // `startable-scope` and `person-work-scope.db.test.ts` threw
  // `this.opts.workItems.listByProject is not a function`; watched 2026-10-20.
  const removeCascading: typeof rowsOnlyWorkItems.remove = async (ids, promoted, stamp) => {
    await rowsOnlyWorkItems.remove(ids, promoted, stamp);
    const removed = new Set(ids);
    cascadeDemands(resourceTables, (workItemId) => removed.has(workItemId));
  };
  const workItems = new Proxy(rowsOnlyWorkItems, {
    get(target, key) {
      if (key === 'remove') return removeCascading;
      const member: unknown = Reflect.get(target, key);
      if (typeof member !== 'function') return member;
      const bound: unknown = member.bind(target);
      return bound;
    },
  });
  const estimates = overrides.estimates ?? inMemoryEstimates(workItems);
  const actuals = overrides.actuals ?? inMemoryActuals(workItems);
  // One measure table under both stores, so a legacy token estimate reads as
  // a single-point tokens trio, as in `bindStores`.
  const measureTable = memoryMeasureTable();
  const measureEstimateTable = memoryMeasureEstimateTable();
  const measures =
    overrides.measures ??
    inMemoryMeasures(workItems, measureTable, undefined, undefined, measureEstimateTable);
  const measureEstimates =
    overrides.measureEstimates ??
    inMemoryMeasureEstimates(workItems, measureTable, measureEstimateTable);
  const budgets = overrides.budgets ?? inMemoryBudgets(workItems);
  const progress = overrides.progress ?? inMemoryProgress(workItems);
  const attempts = overrides.attempts ?? inMemoryAttempts(workItems);
  const dependencies = overrides.dependencies ?? inMemoryDependencies([], undefined, workItems);
  const typedDependencies = overrides.typedDependencies ?? inMemoryTypedDependencies();
  const projects = overrides.projects ?? inMemoryProjects();
  const blockages =
    overrides.blockages ??
    inMemoryStepBlockages(workItems, {
      findById: async (stepId) => {
        for (const project of await projects.list()) {
          const step = (await projects.stepsOf(project.id)).find(
            (candidate) => candidate.id === stepId,
          );
          if (step !== undefined) return step;
        }
        return null;
      },
    });
  const stepParallels =
    overrides.stepParallels ??
    inMemoryStepParallels(workItems, {
      findById: async (stepId) => {
        for (const project of await projects.list()) {
          const step = (await projects.stepsOf(project.id)).find(
            (candidate) => candidate.id === stepId,
          );
          if (step !== undefined) return step;
        }
        return null;
      },
    });
  const capacity = overrides.capacity ?? inMemoryCapacity();
  const resourceCapacity =
    overrides.resourceCapacity ??
    inMemoryResourceCapacity(resourceTables, async (projectId) =>
      (await projects.list()).some((each) => each.id === projectId),
    );
  const demands = overrides.demands ?? inMemoryDemands(resourceTables, workItems);
  const priorityBands = overrides.priorityBands ?? inMemoryPriorityBands();
  const journal = overrides.journal ?? inMemoryCommandJournal();
  const subtrees =
    overrides.subtrees ??
    inMemorySubtrees({
      workItems,
      estimates,
      actuals,
      measures,
      progress,
      dependencies,
      directory,
      demands,
    });
  // `recordingBroadcaster` unless the caller brought one, and the return type
  // says which: a suite that passes its own gets it back as the type it passed,
  // and one that does not gets the recorder it will want to read.
  const broadcast = overrides.broadcast ?? recordingBroadcaster();
  const scheduler = overrides.scheduler ?? fastScheduler;

  const stores = {
    workItems,
    projects,
    estimates,
    actuals,
    measures,
    measureEstimates,
    budgets,
    progress,
    attempts,
    blockages,
    stepParallels,
    dependencies,
    typedDependencies,
    directory,
    capacity,
    priorityBands,
    journal,
    subtrees,
    demands,
    resourceCapacity,
  };
  return {
    // The caller's clock when it hands one, or the wall clock. `testClock` was
    // hardcoded here until 2026-09-13 while the type already accepted a
    // `clock` override, so `takes the UTC day of its own stamp when no day is
    // given` asserted a fixed day against `Date.now()` — green on the day it
    // was written, red the morning after (`Expected: "2026-09-12" · Received:
    // "2026-09-13"`, PR #428's gate). A check that could not fail — the
    // twenty-eighth of R5's kind; the catalogue in `docs/findings` is a
    // verbatim mirror the root-migration map pins and cannot take a new entry,
    // so the record is `openspec/changes/status-at-a-glance/verify.md`.
    service: new AvailableWorkItemService({
      admission: overrides.admission ?? CREATOR_ADMISSION,
      clock: overrides.clock ?? testClock,
      ...stores,
      externalDependencyAuthoring:
        overrides.externalDependencyAuthoring ?? INACTIVE_EXTERNAL_DEPENDENCIES,
      dependencyContext: overrides.dependencyContext ?? createLocalDependencyContext(stores),
      ...(overrides.livePlans === undefined ? {} : { livePlans: overrides.livePlans }),
      ...(overrides.claims === undefined ? {} : { claims: overrides.claims }),
      broadcast,
      scheduler,
    }),
    scheduler,
    broadcast: broadcast as RecordingBroadcaster,
    stores,
  };
}
