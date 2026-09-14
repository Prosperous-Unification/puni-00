import type { ActualStore } from '../ports/actual-store';
import type { DependencyStore } from '../ports/dependency-store';
import type { EstimateStore } from '../ports/estimate-store';
import type { MeasureStore } from '../ports/measure-store';
import type { StepProgressStore } from '../ports/progress-store';
import type { PlanTransactionalStores } from '../ports/stores';
import type { Scope } from '../ports/unit-of-work';
import type { LabelledWorkItem } from '../ports/work-item-store';
import { createWorkingPlanRows } from './working-plan-rows';

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
 * Row wrappers exercise the authoritative targeted-refresh boundary. The
 * command service graph must not switch wholesale to `workingPlan.stores`
 * until every remaining mutation wrapper can advance the collections it
 * affects; doing so earlier would make a later command observe an earlier
 * command's stale before-image.
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

  const refreshRows = async (
    ids: readonly string[],
    insertedIds: readonly string[] = [],
  ): Promise<void> => {
    assertOpen();
    const requestedIds = [...new Set(ids)];
    if (requestedIds.length === 0) return;
    const requested = new Set(requestedIds);
    await workItems.replaceAndPlace(
      requestedIds,
      insertedIds,
      () => scope.stores.workItems.listByIds(projectId, requestedIds),
      (newIds) => scope.stores.workItems.listPlacements(projectId, newIds),
      ({ id }) => id,
      (row) => {
        if (row.projectId !== projectId) {
          throw new Error(`targeted work item ${row.id} is outside project ${projectId}`);
        }
        if (!requested.has(row.id)) {
          throw new Error(`targeted work item ${row.id} was not requested for refresh`);
        }
      },
    );
    await estimates.replaceGroups(
      requestedIds,
      () => scope.stores.estimates.listByWorkItems(projectId, requestedIds),
      ({ workItemId }) => workItemId,
      ({ workItemId }) => {
        assertRequested('estimate', workItemId, requested);
      },
    );
    await actuals.replaceGroups(
      requestedIds,
      () => scope.stores.actuals.listByWorkItems(projectId, requestedIds),
      ({ workItemId }) => workItemId,
      ({ workItemId }) => {
        assertRequested('actual', workItemId, requested);
      },
    );
    await measures.replaceGroups(
      requestedIds,
      () => scope.stores.measures.listByWorkItems(projectId, requestedIds),
      ({ workItemId }) => workItemId,
      ({ workItemId }) => {
        assertRequested('measure', workItemId, requested);
      },
    );
    await progress.replaceGroups(
      requestedIds,
      () => scope.stores.progress.listByWorkItems(projectId, requestedIds),
      ({ workItemId }) => workItemId,
      ({ workItemId }) => {
        assertRequested('progress', workItemId, requested);
      },
    );
    await dependencies.replaceIncident(
      () => scope.stores.dependencies.listByWorkItems(projectId, requestedIds),
      ({ predecessorId, successorId }) =>
        requested.has(predecessorId) || requested.has(successorId),
      ({ id }) => id,
      (edge) => {
        if (edge.projectId !== projectId) {
          throw new Error(`targeted dependency ${edge.id} is outside project ${projectId}`);
        }
        if (!requested.has(edge.predecessorId) && !requested.has(edge.successorId)) {
          throw new Error(
            `targeted dependency ${edge.id} touches no refreshed work item in project ${projectId}`,
          );
        }
      },
    );
  };

  const retainedWorkItems = createWorkingPlanRows(
    // Keep store selection lazy: admission refusals construct this graph but
    // must never touch transactional mutation ports.
    // Proof: passing the store eagerly made the absent-account admission test
    // throw "something asked it for workItems" before returning `forbidden`.
    () => scope.stores.workItems,
    {
      all: async () => workItems.all(),
      byIds: async (ids) => {
        const requested = new Set(ids);
        return (await workItems.all()).filter(({ id }) => requested.has(id));
      },
      placements: async (ids) => placementsOf(await workItems.all(), ids, ({ id }) => id),
    },
    assertOpen,
    refreshRows,
  );
  const checkedWorkItems = {
    ...retainedWorkItems,
    listByProject: async (requestedProjectId: string) => {
      assertProject(requestedProjectId);
      return retainedWorkItems.listByProject(requestedProjectId);
    },
    listByIds: async (requestedProjectId: string, ids: readonly string[]) => {
      assertProject(requestedProjectId);
      return retainedWorkItems.listByIds(requestedProjectId, ids);
    },
    listPlacements: async (requestedProjectId: string, ids: readonly string[]) => {
      assertProject(requestedProjectId);
      return retainedWorkItems.listPlacements(requestedProjectId, ids);
    },
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
    workItems: checkedWorkItems,
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

  async replaceGroups(
    ids: readonly string[],
    load: () => Promise<Row[]>,
    groupOf: (row: Row) => string,
    validate: (row: Row) => void,
  ): Promise<void> {
    this.assertOpen();
    if (this.rows === undefined) return;
    const replacements = await load();
    this.assertOpen();
    replacements.forEach(validate);
    const replaced = new Set(ids);
    const replacementsByGroup = new Map<string, Row[]>();
    for (const row of replacements) addToGroup(replacementsByGroup, groupOf(row), row);
    const inserted = new Set<string>();
    const retained: Row[] = [];
    for (const row of this.rows) {
      const group = groupOf(row);
      if (!replaced.has(group)) {
        retained.push(row);
        continue;
      }
      if (inserted.has(group)) continue;
      retained.push(...(replacementsByGroup.get(group) ?? []));
      inserted.add(group);
    }
    for (const row of replacements) {
      const group = groupOf(row);
      if (inserted.has(group)) continue;
      retained.push(...(replacementsByGroup.get(group) ?? []));
      inserted.add(group);
    }
    this.rows = retained.map(this.clone);
  }

  async replaceAndPlace(
    ids: readonly string[],
    insertedIds: readonly string[],
    load: () => Promise<Row[]>,
    loadPlacements: (
      ids: readonly string[],
    ) => Promise<readonly { id: string; afterId: string | null }[]>,
    groupOf: (row: Row) => string,
    validate: (row: Row) => void,
  ): Promise<void> {
    this.assertOpen();
    if (this.rows === undefined) return;
    const replacements = await load();
    this.assertOpen();
    replacements.forEach(validate);
    const replaced = new Set(ids);
    const replacementsByIdentity = new Map(replacements.map((row) => [groupOf(row), row] as const));
    const retained: Row[] = [];
    for (const row of this.rows) {
      const identity = groupOf(row);
      if (!replaced.has(identity)) {
        retained.push(row);
        continue;
      }
      const replacement = replacementsByIdentity.get(identity);
      if (replacement !== undefined) {
        retained.push(replacement);
        replacementsByIdentity.delete(identity);
      }
    }

    const inserted = new Set(insertedIds);
    const newIds = [...replacementsByIdentity.keys()];
    for (const id of newIds) {
      if (!inserted.has(id)) throw new Error(`refreshed work item ${id} has no retained position`);
    }
    const placements = await loadPlacements(newIds);
    this.assertOpen();
    const placed = new Set<string>();
    for (const { id, afterId } of placements) {
      if (!replacementsByIdentity.has(id) || placed.has(id)) {
        throw new Error(`targeted placement returned unexpected work item ${id}`);
      }
      const row = replacementsByIdentity.get(id);
      if (row === undefined) throw new Error(`targeted placement omitted work item ${id}`);
      const index =
        afterId === null
          ? 0
          : retained.findIndex((candidate) => groupOf(candidate) === afterId) + 1;
      if (index === 0 && afterId !== null) {
        throw new Error(`targeted placement for ${id} follows missing work item ${afterId}`);
      }
      retained.splice(index, 0, row);
      placed.add(id);
    }
    if (placed.size !== newIds.length) {
      const missing = newIds.find((id) => !placed.has(id));
      throw new Error(`targeted placement omitted work item ${missing ?? 'unknown'}`);
    }
    this.rows = retained.map(this.clone);
  }

  async replaceIncident(
    load: () => Promise<Row[]>,
    isIncident: (row: Row) => boolean,
    identityOf: (row: Row) => string,
    validate: (row: Row) => void,
  ): Promise<void> {
    this.assertOpen();
    if (this.rows === undefined) return;
    const replacements = await load();
    this.assertOpen();
    replacements.forEach(validate);
    const replacementByIdentity = new Map(
      replacements.map((row) => [identityOf(row), row] as const),
    );
    const retained: Row[] = [];
    let lastIncidentIndex = -1;
    for (const row of this.rows) {
      if (!isIncident(row)) {
        retained.push(row);
        continue;
      }
      const replacement = replacementByIdentity.get(identityOf(row));
      if (replacement === undefined) continue;
      retained.push(replacement);
      replacementByIdentity.delete(identityOf(row));
      lastIncidentIndex = retained.length;
    }
    retained.splice(
      lastIncidentIndex < 0 ? retained.length : lastIncidentIndex,
      0,
      ...replacementByIdentity.values(),
    );
    this.rows = retained.map(this.clone);
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

function placementsOf<Row>(
  rows: readonly Row[],
  ids: readonly string[],
  identityOf: (row: Row) => string,
): { id: string; afterId: string | null }[] {
  const requested = new Set(ids);
  return rows.flatMap((row, index) => {
    const id = identityOf(row);
    if (!requested.has(id)) return [];
    return [{ id, afterId: index === 0 ? null : identityOf(rows[index - 1]) }];
  });
}

function cloneRecord<Row extends object>(record: Row): Row {
  return { ...record };
}

function addToGroup<Row>(groups: Map<string, Row[]>, key: string, row: Row): void {
  const rows = groups.get(key);
  if (rows === undefined) groups.set(key, [row]);
  else rows.push(row);
}

function assertRequested(
  collection: string,
  workItemId: string,
  requested: ReadonlySet<string>,
): void {
  if (!requested.has(workItemId)) {
    throw new Error(`targeted ${collection} belongs to unrequested work item ${workItemId}`);
  }
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
