import type { ActualStore } from '../ports/actual-store';
import type { DependencyStore } from '../ports/dependency-store';
import type { EstimateStore } from '../ports/estimate-store';
import type { MeasureStore } from '../ports/measure-store';
import type { StepProgressStore } from '../ports/progress-store';
import type { PlanTransactionalStores } from '../ports/stores';
import type { Scope } from '../ports/unit-of-work';
import type { LabelledWorkItem, WorkItemStore } from '../ports/work-item-store';

/** One project's lazily retained reads, owned by one admitted command batch. */
export interface WorkingPlan {
  readonly stores: PlanTransactionalStores;
  close(): void;
}

/**
 * Creates the retained read graph for one admitted batch.
 *
 * Each retained collection loads from the supplied scope only on its first
 * read and returns detached records thereafter. {@link WorkingPlan.close}
 * permanently refuses retained reads, including callbacks borrowed while the
 * batch was open.
 *
 * Task 2.1 deliberately creates and closes this graph from the production
 * runner without yet dispatching commands through it. Tasks 2.3–2.7 add the
 * mutation-aware wrappers; Task 3.1 then switches the command service graph to
 * `workingPlan.stores`. Activating these retained reads before their mutation
 * refreshes exist would make a later command observe an earlier command's
 * stale before-image.
 */
export function createWorkingPlan(scope: Scope, projectId: string): WorkingPlan {
  let isClosed = false;
  const assertOpen = (): void => {
    if (isClosed) throw new Error(`Working plan for ${projectId} is closed`);
  };
  const assertProject = (requestedProjectId: string): void => {
    assertOpen();
    if (requestedProjectId !== projectId) {
      throw new Error(`Working plan for ${projectId} cannot read project ${requestedProjectId}`);
    }
  };

  const workItems = retainedRows(
    () => scope.stores.workItems.listByProject(projectId),
    cloneWorkItem,
    assertOpen,
  );
  const estimates = retainedRows(
    () => scope.stores.estimates.listByProject(projectId),
    cloneRecord,
    assertOpen,
  );
  const actuals = retainedRows(
    () => scope.stores.actuals.listByProject(projectId),
    cloneRecord,
    assertOpen,
  );
  const measures = retainedRows(
    () => scope.stores.measures.listByProject(projectId),
    cloneRecord,
    assertOpen,
  );
  const progress = retainedRows(
    () => scope.stores.progress.listByProject(projectId),
    cloneRecord,
    assertOpen,
  );
  const dependencies = retainedRows(
    () => scope.stores.dependencies.listByProject(projectId),
    cloneRecord,
    assertOpen,
  );

  const retainedWorkItems: WorkItemStore = {
    listByProject: async (requestedProjectId) => {
      assertProject(requestedProjectId);
      return workItems.all();
    },
    listByIds: async (requestedProjectId, ids) => {
      assertProject(requestedProjectId);
      const requested = new Set(ids);
      return (await workItems.all())
        .filter(({ id }) => requested.has(id))
        .sort((left, right) => left.id.localeCompare(right.id));
    },
    findById: guarded(assertOpen, (id) => scope.stores.workItems.findById(id)),
    insert: guarded(assertOpen, (workItem, respaced, stamp) =>
      scope.stores.workItems.insert(workItem, respaced, stamp),
    ),
    patch: guarded(assertOpen, (id, patch, stamp) =>
      scope.stores.workItems.patch(id, patch, stamp),
    ),
    move: guarded(assertOpen, (id, parentId, position, respaced, stamp) =>
      scope.stores.workItems.move(id, parentId, position, respaced, stamp),
    ),
    setPositions: guarded(assertOpen, (placements, moved, stamp) =>
      scope.stores.workItems.setPositions(placements, moved, stamp),
    ),
    setFrozenNumbers: guarded(assertOpen, (updates, stamp) =>
      scope.stores.workItems.setFrozenNumbers(updates, stamp),
    ),
    remove: guarded(assertOpen, (ids, promoted, stamp) =>
      scope.stores.workItems.remove(ids, promoted, stamp),
    ),
  };
  const retainedEstimates: EstimateStore = {
    listByProject: async (requestedProjectId) => {
      assertProject(requestedProjectId);
      return estimates.all();
    },
    listByWorkItems: async (requestedProjectId, ids) => {
      assertProject(requestedProjectId);
      return byWorkItem(await estimates.all(), ids);
    },
    set: guarded(assertOpen, (estimate, stamp) => scope.stores.estimates.set(estimate, stamp)),
    remove: guarded(assertOpen, (workItemId, stepId, stamp) =>
      scope.stores.estimates.remove(workItemId, stepId, stamp),
    ),
    moveAll: guarded(assertOpen, (fromWorkItemId, toWorkItemId, stamp) =>
      scope.stores.estimates.moveAll(fromWorkItemId, toWorkItemId, stamp),
    ),
  };
  const retainedActuals: ActualStore = {
    listByProject: async (requestedProjectId) => {
      assertProject(requestedProjectId);
      return actuals.all();
    },
    listByWorkItems: async (requestedProjectId, ids) => {
      assertProject(requestedProjectId);
      return byWorkItem(await actuals.all(), ids);
    },
    set: guarded(assertOpen, (actual, stamp) => scope.stores.actuals.set(actual, stamp)),
    remove: guarded(assertOpen, (workItemId, stepId, stamp) =>
      scope.stores.actuals.remove(workItemId, stepId, stamp),
    ),
    moveAll: guarded(assertOpen, (fromWorkItemId, toWorkItemId, stamp) =>
      scope.stores.actuals.moveAll(fromWorkItemId, toWorkItemId, stamp),
    ),
  };
  const retainedMeasures: MeasureStore = {
    listByProject: async (requestedProjectId) => {
      assertProject(requestedProjectId);
      return measures.all();
    },
    listByWorkItems: async (requestedProjectId, ids) => {
      assertProject(requestedProjectId);
      return byWorkItem(await measures.all(), ids);
    },
    set: guarded(assertOpen, (measure, stamp) => scope.stores.measures.set(measure, stamp)),
    remove: guarded(assertOpen, (workItemId, stepId, metric, stamp) =>
      scope.stores.measures.remove(workItemId, stepId, metric, stamp),
    ),
    moveAll: guarded(assertOpen, (fromWorkItemId, toWorkItemId, stamp) =>
      scope.stores.measures.moveAll(fromWorkItemId, toWorkItemId, stamp),
    ),
  };
  const retainedProgress: StepProgressStore = {
    listByProject: async (requestedProjectId) => {
      assertProject(requestedProjectId);
      return progress.all();
    },
    listByWorkItems: async (requestedProjectId, ids) => {
      assertProject(requestedProjectId);
      return byWorkItem(await progress.all(), ids);
    },
    set: guarded(assertOpen, (statement, stamp) => scope.stores.progress.set(statement, stamp)),
    remove: guarded(assertOpen, (workItemId, stepId, stamp) =>
      scope.stores.progress.remove(workItemId, stepId, stamp),
    ),
    moveAll: guarded(assertOpen, (fromWorkItemId, toWorkItemId, stamp) =>
      scope.stores.progress.moveAll(fromWorkItemId, toWorkItemId, stamp),
    ),
  };
  const retainedDependencies: DependencyStore = {
    listByProject: async (requestedProjectId) => {
      assertProject(requestedProjectId);
      return dependencies.all();
    },
    listByWorkItems: async (requestedProjectId, ids) => {
      assertProject(requestedProjectId);
      const requested = new Set(ids);
      return (await dependencies.all()).filter(
        ({ predecessorId, successorId }) =>
          requested.has(predecessorId) || requested.has(successorId),
      );
    },
    add: guarded(assertOpen, (dependency, stamp) =>
      scope.stores.dependencies.add(dependency, stamp),
    ),
    remove: guarded(assertOpen, (predecessorId, successorId, stamp) =>
      scope.stores.dependencies.remove(predecessorId, successorId, stamp),
    ),
    removeAllFor: guarded(assertOpen, (workItemIds, stamp) =>
      scope.stores.dependencies.removeAllFor(workItemIds, stamp),
    ),
  };

  const stores: PlanTransactionalStores = {
    get projects() {
      assertOpen();
      return scope.stores.projects;
    },
    get directory() {
      assertOpen();
      return scope.stores.directory;
    },
    get capacity() {
      assertOpen();
      return scope.stores.capacity;
    },
    get priorityBands() {
      assertOpen();
      return scope.stores.priorityBands;
    },
    get calendarMarkers() {
      assertOpen();
      return scope.stores.calendarMarkers;
    },
    get eventLog() {
      assertOpen();
      return scope.stores.eventLog;
    },
    get planEvents() {
      assertOpen();
      return scope.stores.planEvents;
    },
    get steps() {
      assertOpen();
      return scope.stores.steps;
    },
    workItems: retainedWorkItems,
    estimates: retainedEstimates,
    actuals: retainedActuals,
    measures: retainedMeasures,
    progress: retainedProgress,
    dependencies: retainedDependencies,
    get subtrees() {
      assertOpen();
      return scope.stores.subtrees;
    },
    get journal() {
      assertOpen();
      return scope.stores.journal;
    },
  };

  return {
    stores,
    close: () => {
      isClosed = true;
    },
  };
}

class RetainedRows<Row> {
  private rows: readonly Row[] | undefined;

  constructor(
    private readonly load: () => Promise<Row[]>,
    private readonly clone: (row: Row) => Row,
    private readonly assertOpen: () => void,
  ) {}

  async all(): Promise<Row[]> {
    this.assertOpen();
    if (this.rows === undefined) {
      const loaded = await this.load();
      this.assertOpen();
      this.rows = loaded.map(this.clone);
    }
    return this.rows.map(this.clone);
  }
}

function retainedRows<Row>(
  load: () => Promise<Row[]>,
  clone: (row: Row) => Row,
  assertOpen: () => void,
): RetainedRows<Row> {
  return new RetainedRows(load, clone, assertOpen);
}

function guarded<Arguments extends readonly unknown[], Value>(
  assertOpen: () => void,
  operation: (...parameters: Arguments) => Promise<Value>,
): (...parameters: Arguments) => Promise<Value> {
  return (...parameters) => {
    assertOpen();
    return operation(...parameters);
  };
}

function byWorkItem<Row extends { workItemId: string }>(
  rows: readonly Row[],
  ids: readonly string[],
): Row[] {
  const requested = new Set(ids);
  return rows.filter(({ workItemId }) => requested.has(workItemId));
}

function cloneRecord<Row extends object>(record: Row): Row {
  return { ...record };
}

/**
 * Detaches a retained row deeply enough that a borrowed before-image cannot
 * rewrite the cache or an inverse already collected from another answer.
 */
function cloneWorkItem(workItem: LabelledWorkItem): LabelledWorkItem {
  return {
    ...workItem,
    teamIds: [...workItem.teamIds],
    tagIds: [...workItem.tagIds],
    serviceIds: [...workItem.serviceIds],
    typeIds: [...workItem.typeIds],
    externalRefs: workItem.externalRefs.map((reference) => ({ ...reference })),
  };
}
