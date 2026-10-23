import { claimIdentityOf, type TransactionalStores } from '@wbs/core';
import type { OrganizationLimitValues } from '@wbs/domain';

import { inMemoryActuals, type MemoryActualTable, memoryActualTable } from './actual-fixture';
import { inMemoryAttempts, type MemoryAttemptTable, memoryAttemptTable } from './attempt-fixture';
import { inMemoryUsers, type MemoryUserTable, memoryUserTable } from './auth-fixture';
import { inMemoryBudgets, type MemoryBudgetTable, memoryBudgetTable } from './budget-fixture';
import {
  inMemoryCalendarMarkers,
  type MemoryCalendarMarkerTable,
  memoryCalendarMarkerTable,
} from './calendar-marker-fixture';
import {
  inMemoryCapacity,
  type MemoryCapacityTable,
  memoryCapacityTable,
} from './capacity-fixture';
import {
  cascadeClaims,
  cascadeOccupancy,
  claimsTakenWith,
  inMemoryClaims,
  type MemoryClaimTable,
  memoryClaimTable,
} from './claim-fixture';
import {
  inMemoryCommandJournal,
  type MemoryCommandJournalTables,
  memoryCommandJournalTables,
} from './command-journal-fixture';
import {
  inMemoryDependencies,
  type MemoryDependencyTable,
  memoryDependencyTable,
} from './dependency-fixture';
import {
  inMemoryDirectory,
  type MemoryDirectoryTables,
  memoryDirectoryTables,
} from './directory-fixture';
import {
  inMemoryEstimates,
  type MemoryEstimateTable,
  memoryEstimateTable,
} from './estimate-fixture';
import { inMemoryPlanEvents } from './history-fixture';
import { inertMemoryLateWriteSeam, type MemoryLateWriteSeam } from './late-write-seam';
import {
  inMemoryMeasureEstimates,
  type MemoryMeasureEstimateTable,
  memoryMeasureEstimateTable,
} from './measure-estimate-fixture';
import {
  countEstimatesKeyedBy,
  countFactsKeyedBy,
  definitionsOfProject,
  inMemoryMeasures,
  type MemoryMeasureTable,
  memoryMeasureTable,
} from './measure-fixture';
import {
  inMemoryWorkItems,
  type MemoryWorkItemTables,
  memoryWorkItemTables,
} from './memory-work-item-fixture';
import {
  inMemoryOrganizationLimitGauge,
  type MemoryOrganizationLimitTables,
  memoryOrganizationLimitTables,
} from './organization-limits-fixture';
import {
  inMemoryPriorityBands,
  type MemoryPriorityBandTable,
  memoryPriorityBandTable,
} from './priority-band-fixture';
import {
  inMemoryProgress,
  type MemoryProgressTable,
  memoryProgressTable,
} from './progress-fixture';
import { inMemoryProjects, type MemoryProjectTables, memoryProjectTables } from './project-fixture';
import {
  inMemoryEventLog,
  type MemoryEventLogTables,
  memoryEventLogTables,
} from './replay-fixture';
import { cascadeDemands, inMemoryDemands, inMemoryResourceCapacity } from './resource-fixture';
import {
  inMemoryStepBlockages,
  type MemoryStepBlockageTable,
  memoryStepBlockageTable,
} from './step-blockage-fixture';
import { inMemorySteps, type MemoryStepTable, memoryStepTable } from './step-fixture';
import {
  inMemoryStepParallels,
  type MemoryStepParallelTable,
  memoryStepParallelTable,
} from './step-parallel-fixture';
import { inMemorySubtrees } from './subtree-fixture';
import {
  inMemoryTypedDependencies,
  type MemoryTypedDependencyTable,
  memoryTypedDependencyTable,
} from './typed-dependency-fixture';

interface MemoryTables {
  readonly users: MemoryUserTable;
  readonly projects: MemoryProjectTables;
  readonly directory: MemoryDirectoryTables;
  readonly steps: MemoryStepTable;
  readonly dependencies: MemoryDependencyTable;
  readonly typedDependencies: MemoryTypedDependencyTable;
  readonly workItems: MemoryWorkItemTables;
  readonly estimates: MemoryEstimateTable;
  readonly actuals: MemoryActualTable;
  readonly measures: MemoryMeasureTable;
  readonly measureEstimates: MemoryMeasureEstimateTable;
  readonly budgets: MemoryBudgetTable;
  readonly progress: MemoryProgressTable;
  readonly attempts: MemoryAttemptTable;
  readonly blockages: MemoryStepBlockageTable;
  readonly stepParallels: MemoryStepParallelTable;
  readonly claims: MemoryClaimTable;
  readonly capacity: MemoryCapacityTable;
  readonly priorityBands: MemoryPriorityBandTable;
  readonly calendarMarkers: MemoryCalendarMarkerTable;
  readonly eventLog: MemoryEventLogTables;
  readonly journal: MemoryCommandJournalTables;
  readonly organizationLimits: MemoryOrganizationLimitTables;
}

function emptyTables(): MemoryTables {
  return {
    users: memoryUserTable(),
    projects: memoryProjectTables(),
    directory: memoryDirectoryTables(),
    steps: memoryStepTable(),
    dependencies: memoryDependencyTable(),
    typedDependencies: memoryTypedDependencyTable(),
    workItems: memoryWorkItemTables(),
    estimates: memoryEstimateTable(),
    actuals: memoryActualTable(),
    measures: memoryMeasureTable(),
    measureEstimates: memoryMeasureEstimateTable(),
    budgets: memoryBudgetTable(),
    progress: memoryProgressTable(),
    attempts: memoryAttemptTable(),
    blockages: memoryStepBlockageTable(),
    stepParallels: memoryStepParallelTable(),
    claims: memoryClaimTable(),
    capacity: memoryCapacityTable(),
    priorityBands: memoryPriorityBandTable(),
    calendarMarkers: memoryCalendarMarkerTable(),
    eventLog: memoryEventLogTables(),
    journal: memoryCommandJournalTables(),
    organizationLimits: memoryOrganizationLimitTables(),
  };
}

export function replaceMap<K, V>(target: Map<K, V>, source: Map<K, V>): void {
  target.clear();
  for (const [key, value] of source) target.set(key, structuredClone(value));
}

function replaceArray<T>(target: T[], source: T[]): void {
  target.splice(0, target.length, ...structuredClone(source));
}

/** Prevents a source reader from retaining a reference to its stored value. */
function detachedStore<T extends object>(store: T): T {
  return new Proxy(store, {
    get(target, key, receiver) {
      const member: unknown = Reflect.get(target, key, receiver);
      if (typeof member !== 'function') return structuredClone(member);
      return (...args: unknown[]): unknown => {
        const returned: unknown = Reflect.apply(member, target, args);
        if (returned instanceof Promise) {
          return returned.then((value: unknown) => structuredClone(value));
        }
        return structuredClone(returned);
      };
    },
  });
}

/** Applies the one detached-read boundary to every store in the catalog. */
function detachedStores(stores: TransactionalStores): TransactionalStores {
  const wrapped = new Map<PropertyKey, object>();
  return new Proxy(stores, {
    get(target, key, receiver) {
      const store: unknown = Reflect.get(target, key, receiver);
      if (store === null || typeof store !== 'object') return store;
      const existing = wrapped.get(key);
      if (existing !== undefined) return existing;
      const detached = detachedStore(store);
      wrapped.set(key, detached);
      return detached;
    },
  });
}

/** Cloneable transactional table values owned by one memory source. */
export class MemoryState {
  readonly tables: MemoryTables;

  constructor(tables: MemoryTables = emptyTables()) {
    this.tables = tables;
  }

  // Proof: aliasing tables here failed `discards refused state and gives the next
  // batch a fresh scope` at the refused-state read (2026-10-16).
  clone(): MemoryState {
    return new MemoryState(structuredClone(this.tables));
  }

  replaceWith(next: MemoryState): void {
    replaceMap(this.tables.users.byId, next.tables.users.byId);
    replaceMap(this.tables.projects.projects, next.tables.projects.projects);
    replaceMap(this.tables.projects.steps, next.tables.projects.steps);
    replaceMap(this.tables.projects.opened, next.tables.projects.opened);
    // Proof: with this line removed, `undoes an allowance edit committed in an
    // earlier unit of work` failed: the undo answered ok: false (2026-09-27).
    replaceMap(this.tables.projects.allowanceRevisions, next.tables.projects.allowanceRevisions);
    replaceMap(this.tables.projects.timezones, next.tables.projects.timezones);
    replaceMap(this.tables.directory.teams, next.tables.directory.teams);
    replaceMap(this.tables.directory.tags, next.tables.directory.tags);
    replaceMap(this.tables.directory.services, next.tables.directory.services);
    replaceMap(this.tables.directory.workItemTypes, next.tables.directory.workItemTypes);
    replaceMap(this.tables.directory.externalSystems, next.tables.directory.externalSystems);
    replaceMap(this.tables.directory.people, next.tables.directory.people);
    replaceMap(this.tables.directory.memberships, next.tables.directory.memberships);
    replaceMap(this.tables.directory.owned, next.tables.directory.owned);
    replaceMap(this.tables.directory.assignments, next.tables.directory.assignments);
    replaceMap(this.tables.directory.accountOf, next.tables.directory.accountOf);
    replaceMap(
      this.tables.directory.organizationMembers,
      next.tables.directory.organizationMembers,
    );
    replaceMap(this.tables.directory.credentialPins, next.tables.directory.credentialPins);
    // Proof: with the resource copy removed, ten of resource-command.test.ts's
    // thirteen cases read no resource after the batch that declared it had
    // committed; watched 2026-10-20.
    replaceMap(
      this.tables.directory.resources.resources,
      next.tables.directory.resources.resources,
    );
    replaceMap(
      this.tables.directory.resources.capacities,
      next.tables.directory.resources.capacities,
    );
    replaceMap(this.tables.directory.resources.demands, next.tables.directory.resources.demands);
    // Proof: with this copy removed, `defines, patches and removes a measure,
    // listing it after the seeded five` (measure-command.test.ts) read no
    // `gpu_minutes` after its batch committed; watched 2026-10-23.
    replaceMap(
      this.tables.directory.measureDefinitions.organizations,
      next.tables.directory.measureDefinitions.organizations,
    );
    replaceArray(this.tables.steps.rows, next.tables.steps.rows);
    replaceArray(this.tables.dependencies.rows, next.tables.dependencies.rows);
    // Proof: omitting this copy left `commits all mixed-store writes together`
    // with no committed typed row; watched failing 2026-09-27.
    replaceArray(this.tables.typedDependencies.rows, next.tables.typedDependencies.rows);
    replaceMap(this.tables.workItems.byId, next.tables.workItems.byId);
    replaceMap(this.tables.workItems.teamsOf, next.tables.workItems.teamsOf);
    replaceMap(this.tables.workItems.tagsOf, next.tables.workItems.tagsOf);
    replaceMap(this.tables.workItems.servicesOf, next.tables.workItems.servicesOf);
    replaceMap(this.tables.workItems.typesOf, next.tables.workItems.typesOf);
    replaceMap(this.tables.workItems.refsOf, next.tables.workItems.refsOf);
    replaceArray(this.tables.estimates.rows, next.tables.estimates.rows);
    replaceArray(this.tables.actuals.rows, next.tables.actuals.rows);
    replaceArray(this.tables.measures.rows, next.tables.measures.rows);
    // Proof: with this copy removed, `records, re-estimates and clears a trio
    // in tokens, cost and a defined measure, undoably` and seven more cases of
    // measure-estimate-command.test.ts (core) read no trio after the batch
    // committed; watched 2026-10-23.
    replaceArray(this.tables.measureEstimates.rows, next.tables.measureEstimates.rows);
    // Proof: with this copy removed, `sets, replaces and clears a budget,
    // undoably` (budget-command.test.ts in core) read no budget after the
    // batch committed; watched 2026-10-23.
    replaceArray(this.tables.budgets.rows, next.tables.budgets.rows);
    replaceArray(this.tables.progress.rows, next.tables.progress.rows);
    replaceArray(this.tables.attempts.rows, next.tables.attempts.rows);
    // Proof: removing this copy failed the project-seeded fact transaction test
    // after commit left the old fact in place; watched 2026-10-13.
    replaceArray(this.tables.blockages.rows, next.tables.blockages.rows);
    // Proof: copy removed; source commit assertion lost the real authored fact (memory-commit.txt), 2026-10-15.
    replaceArray(this.tables.stepParallels.rows, next.tables.stepParallels.rows);
    replaceArray(this.tables.attempts.issued, next.tables.attempts.issued);
    // Proof: with this copy removed, eight cases of claim-command.test.ts lost
    // their committed claims; watched 2026-10-19.
    replaceArray(this.tables.claims.rows, next.tables.claims.rows);
    // Proof: with this copy removed, `acquires the declared demand and reads it
    // per project and per resource` (resource-occupancy.db.test.ts, memory) read
    // no occupancy after the batch committed; watched 2026-10-20.
    replaceArray(this.tables.claims.occupancy, next.tables.claims.occupancy);
    replaceMap(this.tables.capacity.held, next.tables.capacity.held);
    replaceMap(this.tables.priorityBands.held, next.tables.priorityBands.held);
    replaceMap(this.tables.calendarMarkers.held, next.tables.calendarMarkers.held);
    replaceMap(this.tables.eventLog.rows, next.tables.eventLog.rows);
    replaceMap(this.tables.eventLog.nextSeq, next.tables.eventLog.nextSeq);
    replaceArray(this.tables.journal.entries, next.tables.journal.entries);
    replaceArray(this.tables.journal.events, next.tables.journal.events);
    replaceMap(this.tables.organizationLimits.caps, next.tables.organizationLimits.caps);
    replaceMap(
      this.tables.organizationLimits.projectOrganization,
      next.tables.organizationLimits.projectOrganization,
    );
  }
}

/**
 * The stores over `state`. Given `organizationDefaultLimits`, the catalog also
 * carries the organization limits gauge (`wbs-organization-limits` L10), which
 * the source hands only to the scopes its unit of work admits, as SQLite does.
 */
export function bindStores(
  state: MemoryState,
  lateWrite: MemoryLateWriteSeam = inertMemoryLateWriteSeam,
  organizationDefaultLimits?: OrganizationLimitValues,
): TransactionalStores {
  const users = inMemoryUsers(state.tables.users);
  let workItems: TransactionalStores['workItems'] | null = null;
  const fixtureDirectory = inMemoryDirectory(
    (projectId) => {
      if (workItems === null) throw new Error('work-item table was read before it was bound');
      return workItems.listByProject(projectId);
    },
    state.tables.directory,
    state.tables.users.byId,
  );
  const measureOwnership = {
    projectOrganization: state.tables.organizationLimits.projectOrganization,
    definitions: state.tables.directory.measureDefinitions,
  };
  const claimsOf = (personId: string) =>
    claimsTakenWith(state.tables.claims, personId).map(
      ({ workItemId, stepId, personId: holder }) => ({ workItemId, stepId, personId: holder }),
    );
  const directory: TransactionalStores['directory'] = {
    ...fixtureDirectory,
    async renameTag(tagId, name, stamp) {
      const written = await fixtureDirectory.renameTag(tagId, name, stamp);
      if (!written.ok) return written;
      // Proof: the coherent capture RED received projectIds: [] after the real
      // attached tag rename; source-owned relations must supply its touched project.
      const projectIds = [
        ...new Set(
          [...state.tables.workItems.byId.values()]
            .filter((row) => state.tables.workItems.tagsOf.get(row.id)?.includes(tagId) === true)
            .map((row) => row.projectId),
        ),
      ].sort();
      return { ...written, projectIds };
    },
    // Claims live in the source's own table, out of the fixture's sight: a
    // person's claims refuse an unconfirmed removal and go with a confirmed one,
    // as SQLite's do.
    async usageOfPerson(personId) {
      return { ...(await fixtureDirectory.usageOfPerson(personId)), claims: claimsOf(personId) };
    },
    async removePerson(personId, cascade, stamp, reach) {
      const claimed = claimsOf(personId);
      // Proof: with this refusal removed, the memory certification's
      // `directory.removePerson:claims-in-use` case failed; watched 2026-10-19.
      if (!cascade && claimed.length > 0) {
        return {
          ok: false,
          reason: 'in_use',
          usage: { ...(await fixtureDirectory.usageOfPerson(personId)), claims: claimed },
        };
      }
      const removed = await fixtureDirectory.removePerson(personId, cascade, stamp, reach);
      if (!removed.ok) return removed;
      cascadeClaims(state.tables.claims, (each) => each.personId === personId);
      // Proof: without the claims' work items here, the memory
      // `directory.removePerson:delegated-claims` case found the worker's work
      // item missing from the removal; watched 2026-10-20.
      const workItemIds = [
        ...new Set([...removed.removal.workItemIds, ...claimed.map((each) => each.workItemId)]),
      ];
      return { ...removed, removal: { ...removed.removal, workItemIds } };
    },
    // The fixture's resource answers, with the projects a demand sits in read
    // off the source's own work items, which the fixture cannot see.
    async patchResource(resourceId, patch, stamp) {
      const written = await fixtureDirectory.patchResource(resourceId, patch, stamp);
      if (!written.ok) return written;
      return {
        ...written,
        projectIds: [...new Set([...written.projectIds, ...demandProjectsOf(resourceId)])].sort(),
      };
    },
    // Occupancies live in the source's claim table, out of the fixture's sight,
    // and refuse an unconfirmed removal and go with a confirmed one, as SQLite's do.
    // Facts live in the source's measure table, out of the fixture's sight.
    // Proof: answering zero here, `refuses deleting a definition that holds a
    // fact, and deletes it once the fact is cleared`
    // (measure-fact-command.test.ts in core) deleted it; watched 2026-10-23.
    // And trios in the source's measure estimate table, for the same reason.
    // Proof: answering facts alone, the memory certification's
    // `directory.usageOfMeasure:estimates` read zero; watched 2026-10-23.
    usageOfMeasure(organizationId, measureId) {
      return Promise.resolve({
        references:
          countFactsKeyedBy(
            measureOwnership,
            state.tables.measures.rows,
            state.tables.workItems.byId,
            organizationId,
            measureId,
          ) +
          countEstimatesKeyedBy(
            measureOwnership,
            state.tables.measureEstimates.rows,
            state.tables.workItems.byId,
            organizationId,
            measureId,
          ) +
          // And budgets, keyed the same way (`wbs-measure-budgets` D42).
          // Proof: answering facts and trios alone, the memory certification's
          // `directory.usageOfMeasure:budgets` read zero; watched 2026-10-23.
          countEstimatesKeyedBy(
            measureOwnership,
            state.tables.budgets.rows,
            state.tables.workItems.byId,
            organizationId,
            measureId,
          ),
      });
    },
    async usageOfResource(resourceId) {
      const usage = await fixtureDirectory.usageOfResource(resourceId);
      return {
        ...usage,
        rows: await demandRowsOf(resourceId),
        occupancies: occupyingLeavesOf(resourceId),
      };
    },
    async removeResource(resourceId, cascade, stamp) {
      const projectIds = demandProjectsOf(resourceId);
      const rows = await demandRowsOf(resourceId);
      const occupancies = occupyingLeavesOf(resourceId);
      // Proof: with this refusal removed, the memory certification's
      // `directory.removeResource:in-use-cascade` case removed the stage only
      // a claim held instead of answering in_use; watched 2026-10-20.
      if (!cascade && occupancies > 0) {
        const usage = await fixtureDirectory.usageOfResource(resourceId);
        return { ok: false, reason: 'in_use', usage: { ...usage, rows, occupancies } };
      }
      const removed = await fixtureDirectory.removeResource(resourceId, cascade, stamp);
      if (!removed.ok)
        return removed.reason === 'in_use'
          ? { ...removed, usage: { ...removed.usage, rows, occupancies } }
          : removed;
      // Read before the cascade takes the occupancy: a project whose only link
      // is a standing claim's units is told too.
      // Proof: with this left out, `refuses deleting a resource a claim holds,
      // counting it, and cascades on confirmation` (resource-occupancy.db.test.ts)
      // announced no project on memory; watched 2026-10-20.
      const occupying = occupyingProjectsOf(resourceId);
      cascadeOccupancy(state.tables.claims, resourceId);
      return {
        ok: true,
        removal: {
          ...removed.removal,
          projectIds: [
            ...new Set([...removed.removal.projectIds, ...projectIds, ...occupying]),
          ].sort(),
        },
      };
    },
  };
  /** The projects whose claims hold units of the resource. */
  const occupyingProjectsOf = (resourceId: string): string[] => {
    const projectOfClaim = new Map(
      state.tables.claims.rows.map(({ id, workItemId }) => {
        const projectId = state.tables.workItems.byId.get(workItemId)?.projectId;
        if (projectId === undefined)
          throw new Error(`claim ${id} names absent work item ${workItemId}`);
        return [id, projectId] as const;
      }),
    );
    return [
      ...new Set(
        state.tables.claims.occupancy
          .filter((row) => row.resourceId === resourceId)
          .map(({ claimId }) => {
            const projectId = projectOfClaim.get(claimId);
            if (projectId === undefined) throw new Error(`occupancy names absent claim ${claimId}`);
            return projectId;
          }),
      ),
    ];
  };
  /** How many leaves hold units of the resource through their claims. */
  const occupyingLeavesOf = (resourceId: string): number => {
    const leafOf = new Map(state.tables.claims.rows.map(({ id, workItemId }) => [id, workItemId]));
    return new Set(
      state.tables.claims.occupancy
        .filter((row) => row.resourceId === resourceId)
        .map(({ claimId }) => leafOf.get(claimId)),
    ).size;
  };
  /** The projects whose work items demand the resource. */
  const demandProjectsOf = (resourceId: string): string[] => {
    const projectOf = new Map(
      [...state.tables.workItems.byId.values()].map((row) => [row.id, row.projectId]),
    );
    return [
      ...new Set(
        [...state.tables.directory.resources.demands.values()]
          .filter((each) => each.resourceId === resourceId)
          .flatMap((each) => {
            const projectId = projectOf.get(each.workItemId);
            if (projectId === undefined)
              throw new Error(`demand names absent work item ${each.workItemId}`);
            return [projectId];
          }),
      ),
    ].sort();
  };
  /** A usage's rows for the demanding projects: their labelled work items and names. */
  const demandRowsOf = async (resourceId: string) => {
    if (workItems === null) throw new Error('work-item table was read before it was bound');
    const bound = workItems;
    const projectIds = demandProjectsOf(resourceId);
    const rows = await Promise.all(projectIds.map((projectId) => bound.listByProject(projectId)));
    return {
      assignments: [],
      steps: [],
      people: [],
      members: [],
      claims: [],
      pinnedCredentials: 0,
      machineCredentials: 0,
      capacityOf: new Map<string, number>(),
      workItems: rows.flat(),
      projects: projectIds.map((id) => {
        const project = state.tables.projects.projects.get(id);
        if (project === undefined) throw new Error(`demand names absent project ${id}`);
        return { id, name: project.name };
      }),
    };
  };
  workItems = inMemoryWorkItems(directory, state.tables.workItems);
  const dependencies = inMemoryDependencies([], state.tables.dependencies, workItems);
  const typedDependencies = inMemoryTypedDependencies([], state.tables.typedDependencies);
  // Proof: a separate parallel table let source removal erase the step; mixed rollback tests failed, 2026-10-17.
  const tableSteps = inMemorySteps([], state.tables.steps, state.tables.estimates, {
    table: state.tables.stepParallels,
    workItems,
  });
  // A removed step leaves the project's own step list too, as SQLite's one
  // `step` table does: the work-item service reads `projects.stepsOf`, and a
  // step still listed there after its removal let a replay restore rows onto it.
  // Proof: with this removal skipped, `refuses an undo of a delete once a step
  // its claims and progress name was removed` (resource-occupancy.db.test.ts)
  // answered the undo ok on memory; watched 2026-10-20.
  const steps: typeof tableSteps = {
    ...tableSteps,
    async remove(projectId, stepId, cascade, stamp) {
      const removed = await tableSteps.remove(projectId, stepId, cascade, stamp);
      if (removed.ok) {
        const listed = state.tables.projects.steps.get(projectId);
        if (listed !== undefined)
          state.tables.projects.steps.set(
            projectId,
            listed.filter(({ id }) => id !== stepId),
          );
      }
      return removed;
    },
  };
  const projects = inMemoryProjects(users, state.tables.projects);
  const estimates = inMemoryEstimates(workItems, state.tables.estimates, steps);
  const actuals = inMemoryActuals(workItems, state.tables.actuals, steps);
  // The memory twin of `project_organization` joined to `measure`: the
  // owning organization's definitions, or none for an unowned project.
  const measures = inMemoryMeasures(
    workItems,
    state.tables.measures,
    steps,
    (projectId) => definitionsOfProject(measureOwnership, projectId),
    state.tables.measureEstimates,
  );
  const measureEstimates = inMemoryMeasureEstimates(
    workItems,
    state.tables.measures,
    state.tables.measureEstimates,
    steps,
    (projectId) => definitionsOfProject(measureOwnership, projectId),
  );
  const progress = inMemoryProgress(workItems, state.tables.progress, steps);
  const attempts = inMemoryAttempts(workItems, state.tables.attempts, steps, progress);
  const blockages = inMemoryStepBlockages(
    workItems,
    {
      async findById(stepId) {
        const step = await steps.findById(stepId);
        if (step !== null) return step;
        for (const project of await projects.list()) {
          const seeded = (await projects.stepsOf(project.id)).find(
            (candidate) => candidate.id === stepId,
          );
          if (seeded !== undefined) return seeded;
        }
        return null;
      },
    },
    state.tables.blockages,
  );
  const stepParallels = inMemoryStepParallels(
    workItems,
    {
      async findById(stepId) {
        const step = await steps.findById(stepId);
        if (step !== null) return step;
        for (const project of await projects.list()) {
          const seeded = (await projects.stepsOf(project.id)).find(
            (candidate) => candidate.id === stepId,
          );
          if (seeded !== undefined) return seeded;
        }
        return null;
      },
    },
    state.tables.stepParallels,
  );
  const rowsOnlyWorkItems = workItems;
  workItems = {
    ...rowsOnlyWorkItems,
    async remove(ids, promoted, stamp) {
      await rowsOnlyWorkItems.remove(ids, promoted, stamp);
      const removed = new Set(ids);
      const removeSatelliteRows = (rows: { readonly workItemId: string }[]) => {
        const kept = rows.filter(({ workItemId }) => !removed.has(workItemId));
        rows.splice(0, rows.length, ...kept);
      };
      // SQLite explicitly deletes estimates before its work-item delete, while
      // work-item foreign keys cascade actuals, progress, and measures; the
      // memory source must expose the same post-write boundary for all four.
      // Proof: omitting this cascade made the runner's delete-last-child hand-up
      // reject at the next targeted estimate read with an orphaned work-item reference.
      removeSatelliteRows(state.tables.estimates.rows);
      removeSatelliteRows(state.tables.actuals.rows);
      removeSatelliteRows(state.tables.progress.rows);
      removeSatelliteRows(state.tables.measures.rows);
      removeSatelliteRows(state.tables.measureEstimates.rows);
      // Proof: with this cascade removed, `refuses an undo of a delete whose
      // budget is in a measure deleted since` (budget-command.test.ts in core)
      // read the deleted leaf's budget still listed; watched 2026-10-23.
      removeSatelliteRows(state.tables.budgets.rows);
      removeSatelliteRows(state.tables.attempts.rows);
      // Proof: removing this cascade failed the same test when a deleted owner
      // left an unreadable blockage fact; watched 2026-10-13.
      removeSatelliteRows(state.tables.blockages.rows);
      removeSatelliteRows(state.tables.attempts.issued);
      // SQLite cascades claims with their work item and delegated claims with their parent.
      cascadeClaims(state.tables.claims, ({ workItemId }) => removed.has(workItemId));
      // And a work item's demands with it (`work_item_resource_demand`).
      cascadeDemands(state.tables.directory.resources, (workItemId) => removed.has(workItemId));
    },
  };
  const demands = inMemoryDemands(state.tables.directory.resources, workItems);
  const stores: TransactionalStores = {
    users,
    projects,
    directory,
    steps,
    workItems,
    estimates,
    actuals,
    measures,
    measureEstimates,
    budgets: inMemoryBudgets(workItems, state.tables.budgets, (projectId) =>
      definitionsOfProject(measureOwnership, projectId),
    ),
    progress,
    attempts,
    blockages,
    stepParallels,
    claims: inMemoryClaims(
      workItems,
      state.tables.progress,
      state.tables.claims,
      claimIdentityOf(directory),
      (resourceId) => state.tables.directory.resources.resources.has(resourceId),
    ),
    dependencies,
    typedDependencies,
    capacity: inMemoryCapacity({}, state.tables.capacity),
    resourceCapacity: inMemoryResourceCapacity(state.tables.directory.resources, (projectId) =>
      Promise.resolve(state.tables.projects.projects.has(projectId)),
    ),
    demands,
    priorityBands: inMemoryPriorityBands({}, state.tables.priorityBands),
    calendarMarkers: inMemoryCalendarMarkers([], state.tables.calendarMarkers),
    planEvents: inMemoryPlanEvents([], { held: state.tables.journal.events }),
    eventLog: inMemoryEventLog(state.tables.eventLog),
    journal: inMemoryCommandJournal(state.tables.journal, (journalEventIds) => {
      // Proof: omitting this forwarding failed `runs every Task 5.1 journal case`
      // when the expected late rollback case did not pass (2026-10-16).
      lateWrite.reach('journal-history-insert', { journalEventIds });
    }),
    subtrees: inMemorySubtrees(
      {
        workItems,
        estimates,
        actuals,
        progress,
        measures,
        dependencies,
        directory,
        demands,
      },
      (satelliteKeys) => {
        // Proof: omitting this forwarding failed `runs every subtree case` at
        // the expected late rollback outcome (2026-10-16).
        lateWrite.reach('subtree-final-satellite', { satelliteKeys });
      },
    ),
    ...(organizationDefaultLimits === undefined
      ? {}
      : {
          organizationLimits: inMemoryOrganizationLimitGauge(
            {
              limits: state.tables.organizationLimits,
              directory: state.tables.directory,
              claims: state.tables.claims,
              workItems: state.tables.workItems,
            },
            organizationDefaultLimits,
          ),
        }),
  };
  // Proof: returning stores directly failed both public and admitted detached
  // storage-shape reads after caller mutation (2026-10-16).
  return detachedStores(stores);
}
