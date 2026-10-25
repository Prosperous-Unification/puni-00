import type {
  Demand,
  DemandStore,
  DemandWritten,
  Resource,
  ResourceCapacity,
  ResourceCapacityStore,
  ResourceCapacityWritten,
  WorkItemStore,
} from '@wbs/core';

/**
 * The resources of the memory directory and what plans state about them
 * (`wbs-resources`), held together so a resource's removal can take its
 * demands and capacities as SQLite's cascades do.
 */
export interface MemoryResourceTables {
  readonly resources: Map<string, Resource>;
  /** Keyed `projectId::resourceId`; a pair with no entry is unstated. */
  readonly capacities: Map<string, { projectId: string; resourceId: string; units: number }>;
  /** Keyed `workItemId::resourceId`. */
  readonly demands: Map<string, Demand>;
  /** Each resource's stated directory capacity (`wbs-shared-occupancy` S1); absent is unstated. */
  readonly directoryCapacities: Map<string, number>;
  /**
   * What SQLite's `organization_audit` records of each directory capacity
   * write, in write order: the memory twin has no audit table of its own.
   */
  readonly directoryCapacityAudit: {
    readonly id: string;
    readonly organizationId: string;
    readonly actorId: string;
    readonly resourceId: string;
    readonly before: number | null;
    readonly after: number | null;
  }[];
}

export function memoryResourceTables(): MemoryResourceTables {
  return {
    resources: new Map(),
    capacities: new Map(),
    demands: new Map(),
    directoryCapacities: new Map(),
    directoryCapacityAudit: [],
  };
}

function pairKey(left: string, right: string): string {
  return `${left}::${right}`;
}

/**
 * A {@link ResourceCapacityStore} over {@link MemoryResourceTables}. Unlike
 * `inMemoryCapacity` it checks both ids, because the tables it reads hold the
 * resources and `hasProject` answers for the projects.
 */
export function inMemoryResourceCapacity(
  tables: MemoryResourceTables,
  hasProject: (projectId: string) => Promise<boolean>,
): ResourceCapacityStore {
  return {
    listFor(projectId) {
      const listed: ResourceCapacity[] = [...tables.capacities.values()]
        .filter((each) => each.projectId === projectId)
        .map(({ resourceId, units }) => ({ resourceId, units }))
        .sort((left, right) => left.resourceId.localeCompare(right.resourceId));
      return Promise.resolve(listed);
    },
    async set(projectId, resourceId, units, _stamp) {
      let written: ResourceCapacityWritten = { ok: true };
      if (!(await hasProject(projectId))) written = { ok: false, reason: 'unknown_project' };
      else if (!tables.resources.has(resourceId))
        written = { ok: false, reason: 'unknown_resource' };
      else if (units === null) tables.capacities.delete(pairKey(projectId, resourceId));
      else tables.capacities.set(pairKey(projectId, resourceId), { projectId, resourceId, units });
      return written;
    },
  };
}

/**
 * A {@link DemandStore} over {@link MemoryResourceTables}, checking both ids.
 * It moves no revision because the memory work items keep none; the revision
 * bump is asserted against SQLite in `resource.db.test.ts`.
 */
export function inMemoryDemands(
  tables: MemoryResourceTables,
  workItems: WorkItemStore,
): DemandStore {
  return {
    async listByProject(projectId) {
      const ids = new Set((await workItems.listByProject(projectId)).map(({ id }) => id));
      return [...tables.demands.values()]
        .filter((each) => ids.has(each.workItemId))
        .sort(
          (left, right) =>
            left.workItemId.localeCompare(right.workItemId) ||
            left.resourceId.localeCompare(right.resourceId),
        );
    },
    async set(workItemId, resourceId, units, _stamp) {
      let written: DemandWritten = 'written';
      if ((await workItems.findById(workItemId)) === null) written = 'unknown_work_item';
      else if (!tables.resources.has(resourceId)) written = 'unknown_resource';
      else {
        if (units === null) tables.demands.delete(pairKey(workItemId, resourceId));
        else tables.demands.set(pairKey(workItemId, resourceId), { workItemId, resourceId, units });
      }
      return written;
    },
  };
}

/** Takes the demands of removed work items, as `work_item_resource_demand`'s cascade does. */
export function cascadeDemands(
  tables: MemoryResourceTables,
  removed: (workItemId: string) => boolean,
): void {
  for (const [key, each] of tables.demands)
    if (removed(each.workItemId)) tables.demands.delete(key);
}
