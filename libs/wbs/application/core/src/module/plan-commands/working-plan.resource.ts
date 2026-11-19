import type { SettingScope } from '@wbs/domain';

import type { ActualStore } from '../../ports/actual-store';
import type { BudgetStore } from '../../ports/budget-store';
import type { DependencyStore } from '../../ports/dependency-store';
import type { EstimateStore } from '../../ports/estimate-store';
import type { MeasureEstimateStore } from '../../ports/measure-estimate-store';
import type { MeasureStore } from '../../ports/measure-store';
import type { StepProgressStore } from '../../ports/progress-store';
import type { SettingTarget } from '../../ports/setting-store';
import type { StepBlockageStore } from '../../ports/step-blockage-store';
import type { StepNodeAttemptStore } from '../../ports/step-node-attempt-store';
import type { PlanTransactionalStores } from '../../ports/stores';
import type { TypedDependencyStore } from '../../ports/typed-dependency-store';
import type { Scope } from '../../ports/unit-of-work';
import { guardStepCatalogue } from '../step-catalogue/step-catalogue';
import { createWorkingPlanDirectory } from './working-plan-directory.resource';
import { createWorkingPlanEdges } from './working-plan-edges.resource';
import { cloneWorkItem, createWorkingPlanRows } from './working-plan-rows.resource';
import { createWorkingPlanSubtrees } from './working-plan-subtrees.resource';
import { createWorkingPlanValues } from './working-plan-values.resource';

/** One work package's lazily retained reads, owned by one admitted command batch. */
export interface WorkingPlan {
  readonly stores: PlanTransactionalStores;
  /** Strictly reloads local identities after raw incident staging; never accepts remote rows. */
  readonly refreshRows: (ids: readonly string[]) => Promise<void>;
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
 * Row, step-value, dependency, subtree and directory wrappers advance the
 * authoritative affected identities before returning, so the command service
 * graph can use these stores for the full lifetime of its admitted batch.
 */
export function createWorkingPlan(scope: Scope, workPackageId: string): WorkingPlan {
  let isClosed = false;
  const assertOpen = (): void => {
    if (isClosed) throw new Error(`Working plan for ${workPackageId} is closed`);
  };
  const assertWorkPackage = (requestedWorkPackageId: string): void => {
    assertOpen();
    if (requestedWorkPackageId !== workPackageId) {
      throw new Error(
        `Working plan for ${workPackageId} cannot read work package ${requestedWorkPackageId}`,
      );
    }
  };

  const workItems = retainedRows(
    () => scope.stores.workItems.listByWorkPackage(workPackageId),
    cloneWorkItem,
    assertOpen,
  );
  const estimates = retainedRows(
    () => scope.stores.estimates.listByWorkPackage(workPackageId),
    cloneRecord,
    assertOpen,
  );
  const actuals = retainedRows(
    () => scope.stores.actuals.listByWorkPackage(workPackageId),
    cloneRecord,
    assertOpen,
  );
  const measures = retainedRows(
    () => scope.stores.measures.listByWorkPackage(workPackageId),
    cloneRecord,
    assertOpen,
  );
  const progress = retainedRows(
    () => scope.stores.progress.listByWorkPackage(workPackageId),
    cloneRecord,
    assertOpen,
  );
  const dependencies = retainedRows(
    () => scope.stores.dependencies.listByWorkPackage(workPackageId),
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
      () => scope.stores.workItems.listByIds(workPackageId, requestedIds),
      (newIds) => scope.stores.workItems.listPlacements(workPackageId, newIds),
      ({ id }) => id,
      (row) => {
        if (row.workPackageId !== workPackageId) {
          throw new Error(`targeted work item ${row.id} is outside work package ${workPackageId}`);
        }
        if (!requested.has(row.id)) {
          throw new Error(`targeted work item ${row.id} was not requested for refresh`);
        }
      },
    );
    await estimates.replaceGroupsAndPlace(
      requestedIds,
      () => scope.stores.estimates.listByWorkItems(workPackageId, requestedIds),
      (newIds) => scope.stores.estimates.listPlacements(workPackageId, newIds),
      ({ workItemId }) => workItemId,
      ({ workItemId }) => {
        assertRequested('estimate', workItemId, requested);
      },
    );
    await actuals.replaceGroupsAndPlace(
      requestedIds,
      () => scope.stores.actuals.listByWorkItems(workPackageId, requestedIds),
      (newIds) => scope.stores.actuals.listPlacements(workPackageId, newIds),
      ({ workItemId }) => workItemId,
      ({ workItemId }) => {
        assertRequested('actual', workItemId, requested);
      },
    );
    await measures.replaceGroupsAndPlace(
      requestedIds,
      () => scope.stores.measures.listByWorkItems(workPackageId, requestedIds),
      (newIds) => scope.stores.measures.listPlacements(workPackageId, newIds),
      ({ workItemId }) => workItemId,
      ({ workItemId }) => {
        assertRequested('measure', workItemId, requested);
      },
    );
    await progress.replaceGroupsAndPlace(
      requestedIds,
      () => scope.stores.progress.listByWorkItems(workPackageId, requestedIds),
      (newIds) => scope.stores.progress.listPlacements(workPackageId, newIds),
      ({ workItemId }) => workItemId,
      ({ workItemId }) => {
        assertRequested('progress', workItemId, requested);
      },
    );
    await dependencies.replaceIncident(
      () => scope.stores.dependencies.listByWorkItems(workPackageId, requestedIds),
      ({ predecessorId, successorId }) =>
        requested.has(predecessorId) || requested.has(successorId),
      ({ id }) => id,
      (edge) => {
        if (edge.workPackageId !== workPackageId) {
          throw new Error(
            `targeted dependency ${edge.id} is outside work package ${workPackageId}`,
          );
        }
        if (!requested.has(edge.predecessorId) && !requested.has(edge.successorId)) {
          throw new Error(
            `targeted dependency ${edge.id} touches no refreshed work item in work package ${workPackageId}`,
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
    listByWorkPackage: async (requestedWorkPackageId: string) => {
      assertWorkPackage(requestedWorkPackageId);
      return retainedWorkItems.listByWorkPackage(requestedWorkPackageId);
    },
    listByIds: async (requestedWorkPackageId: string, ids: readonly string[]) => {
      assertWorkPackage(requestedWorkPackageId);
      return retainedWorkItems.listByIds(requestedWorkPackageId, ids);
    },
    listPlacements: async (requestedWorkPackageId: string, ids: readonly string[]) => {
      assertWorkPackage(requestedWorkPackageId);
      return retainedWorkItems.listPlacements(requestedWorkPackageId, ids);
    },
  };
  const retainedEstimates: EstimateStore = {
    ...createWorkingPlanValues(
      () => scope.stores.estimates,
      {
        all: async (requestedWorkPackageId) => {
          assertWorkPackage(requestedWorkPackageId);
          return estimates.all();
        },
        byWorkItems: async (requestedWorkPackageId, ids) => {
          assertWorkPackage(requestedWorkPackageId);
          return byWorkItem(await estimates.all(), ids);
        },
        placements: async (requestedWorkPackageId, ids) => {
          assertWorkPackage(requestedWorkPackageId);
          return placementsOfGroups(await estimates.all(), ids, ({ workItemId }) => workItemId);
        },
      },
      assertOpen,
      refreshRows,
    ),
    async readTarget(workItemId, stepId) {
      assertOpen();
      const target = await scope.stores.estimates.readTarget(workItemId, stepId);
      assertOpen();
      return target;
    },
  };
  const retainedActuals: ActualStore = createWorkingPlanValues(
    () => scope.stores.actuals,
    {
      all: async (requestedWorkPackageId) => {
        assertWorkPackage(requestedWorkPackageId);
        return actuals.all();
      },
      byWorkItems: async (requestedWorkPackageId, ids) => {
        assertWorkPackage(requestedWorkPackageId);
        return byWorkItem(await actuals.all(), ids);
      },
      placements: async (requestedWorkPackageId, ids) => {
        assertWorkPackage(requestedWorkPackageId);
        return placementsOfGroups(await actuals.all(), ids, ({ workItemId }) => workItemId);
      },
    },
    assertOpen,
    refreshRows,
  );
  const retainedMeasures: MeasureStore = {
    ...createWorkingPlanValues(
      () => scope.stores.measures,
      {
        all: async (requestedWorkPackageId) => {
          assertWorkPackage(requestedWorkPackageId);
          return measures.all();
        },
        byWorkItems: async (requestedWorkPackageId, ids) => {
          assertWorkPackage(requestedWorkPackageId);
          return byWorkItem(await measures.all(), ids);
        },
        placements: async (requestedWorkPackageId, ids) => {
          assertWorkPackage(requestedWorkPackageId);
          return placementsOfGroups(await measures.all(), ids, ({ workItemId }) => workItemId);
        },
      },
      assertOpen,
      refreshRows,
    ),
    // Definitions are directory state, not plan values: read through, never retained.
    definitionsFor: async (requestedWorkPackageId) => {
      assertWorkPackage(requestedWorkPackageId);
      return await scope.stores.measures.definitionsFor(requestedWorkPackageId);
    },
  };
  // Read through, never retained: a tokens write here also writes or removes
  // the legacy `token_estimate` row (design D28), so every write refreshes the
  // row's retained groups, measures among them.
  // Proof: with the set and remove refreshes skipped, `refreshes the retained
  // measures when a tokens trio writes or retires the legacy token estimate`
  // (working-plan.test.ts) read the stale legacy figure; watched 2026-10-23.
  const retainedMeasureEstimates: MeasureEstimateStore = {
    listByWorkPackage: async (requestedWorkPackageId) => {
      assertWorkPackage(requestedWorkPackageId);
      return await scope.stores.measureEstimates.listByWorkPackage(requestedWorkPackageId);
    },
    set: async (estimate, stamp) => {
      assertOpen();
      const written = await scope.stores.measureEstimates.set(estimate, stamp);
      await refreshRows([estimate.workItemId]);
      return written;
    },
    remove: async (workItemId, stepId, key, stamp) => {
      assertOpen();
      await scope.stores.measureEstimates.remove(workItemId, stepId, key, stamp);
      await refreshRows([workItemId]);
    },
    moveAll: async (fromWorkItemId, toWorkItemId, stamp) => {
      assertOpen();
      await scope.stores.measureEstimates.moveAll(fromWorkItemId, toWorkItemId, stamp);
      await refreshRows([fromWorkItemId, toWorkItemId]);
    },
  };
  // Read through, never retained: a budget write moves its work item's
  // revision (as every satellite write does), so the row is refreshed.
  const retainedBudgets: BudgetStore = {
    listByWorkPackage: async (requestedWorkPackageId) => {
      assertWorkPackage(requestedWorkPackageId);
      return await scope.stores.budgets.listByWorkPackage(requestedWorkPackageId);
    },
    set: async (budget, stamp) => {
      assertOpen();
      await scope.stores.budgets.set(budget, stamp);
      await refreshRows([budget.workItemId]);
    },
    remove: async (workItemId, key, stamp) => {
      assertOpen();
      await scope.stores.budgets.remove(workItemId, key, stamp);
      await refreshRows([workItemId]);
    },
  };
  const retainedProgress: StepProgressStore = createWorkingPlanValues(
    () => scope.stores.progress,
    {
      all: async (requestedWorkPackageId) => {
        assertWorkPackage(requestedWorkPackageId);
        return progress.all();
      },
      byWorkItems: async (requestedWorkPackageId, ids) => {
        assertWorkPackage(requestedWorkPackageId);
        return byWorkItem(await progress.all(), ids);
      },
      placements: async (requestedWorkPackageId, ids) => {
        assertWorkPackage(requestedWorkPackageId);
        return placementsOfGroups(await progress.all(), ids, ({ workItemId }) => workItemId);
      },
    },
    assertOpen,
    refreshRows,
  );
  const retainedDependencies: DependencyStore = createWorkingPlanEdges(
    () => scope.stores.dependencies,
    workPackageId,
    {
      all: async (requestedWorkPackageId) => {
        assertWorkPackage(requestedWorkPackageId);
        return dependencies.all();
      },
      byWorkItems: async (requestedWorkPackageId, ids) => {
        assertWorkPackage(requestedWorkPackageId);
        const requested = new Set(ids);
        return (await dependencies.all()).filter(
          ({ predecessorId, successorId }) =>
            requested.has(predecessorId) || requested.has(successorId),
        );
      },
    },
    assertOpen,
    refreshRows,
  );
  /**
   * Typed links pass through to the batch scope: every read sees preceding
   * writes in that transaction, with no retained snapshot to refresh. The
   * wrapper still enforces the working plan's lifetime and work package boundary.
   *
   * Proof: bypassing the work package, closed-plan, remove-owner, or bulk-owner
   * check separately made the matching negative in `passes typed links through
   * the batch and refuses cross-work-package and closed access` resolve; each
   * watched failing on 2026-09-27.
   */
  // Proof: without the work package partition, the external-write refresh test hit
  // its raw-store tripwire: retained owner refresh requested a remote identity.
  // Proof: owner-refresh-partition bypass failed `refreshes only retained owner rows`'s selected assertion
  // (service consumer; watched 2026-10-22).
  const refreshTypedEndpoints = (
    rows: readonly {
      predecessor: { workPackageId: string; workItemId: string };
      successor: { workPackageId: string; workItemId: string };
    }[],
  ) =>
    refreshRows([
      ...new Set(
        rows
          .flatMap((row) => [row.predecessor, row.successor])
          .filter((endpoint) => endpoint.workPackageId === workPackageId)
          .map((endpoint) => endpoint.workItemId),
      ),
    ]);
  const typedDependencies: TypedDependencyStore = {
    hasDeletingEndpoint: (row) => {
      assertWorkPackage(row.workPackageId);
      return scope.stores.typedDependencies.hasDeletingEndpoint(row);
    },
    get incidents(): TypedDependencyStore['incidents'] {
      throw new Error('incident staging requires raw admitted stores');
    },
    // Proof: removing the open check or requested-work-package checks separately made `passes typed links through the batch and refuses cross-work-package and closed access` resolve forbidden/closed incident calls (2026-10-22).
    listIncident: (requestedWorkPackageIds) => {
      assertOpen();
      for (const requestedWorkPackageId of requestedWorkPackageIds)
        assertWorkPackage(requestedWorkPackageId);
      return scope.stores.typedDependencies.listIncident(requestedWorkPackageIds);
    },
    listByWorkPackage: (requestedWorkPackageId) => {
      assertWorkPackage(requestedWorkPackageId);
      // Proof: returning the pre-edit empty set made `sees the first typed relationship
      // when a later batch command closes a cycle` receive 200 instead of 409; watched 2026-09-27.
      // Proof: returning stale FF after an SS update made `reads the committed SS
      // type and endpoints after an FF edit` fail: expected SS, received FF.
      // Returning stale FS after an FF update made `lets a later command read
      // the committed FF type after an edit` receive the captured ID and endpoints
      // with FS instead of FF (2026-09-28).
      return scope.stores.typedDependencies.listByWorkPackage(requestedWorkPackageId);
    },
    add: async (row, stamp) => {
      assertWorkPackage(row.workPackageId);
      await scope.stores.typedDependencies.add(row, stamp);
      await refreshTypedEndpoints([row]);
    },
    update: async (row, stamp) => {
      assertWorkPackage(row.workPackageId);
      const previous = (await scope.stores.typedDependencies.listByWorkPackage(workPackageId)).find(
        (current) => current.id === row.id,
      );
      if (previous === undefined)
        throw new Error(`typed dependency ${row.id} is outside work package ${workPackageId}`);
      await scope.stores.typedDependencies.update(row, stamp);
      // Proof: skipping this refresh made `undoes and redoes a typed update with
      // its exact ID and endpoints` receive 409 instead of 200; watched 2026-09-27.
      await refreshTypedEndpoints([previous, row]);
    },
    remove: async (id, stamp) => {
      assertOpen();
      const rows = await scope.stores.typedDependencies.listByWorkPackage(workPackageId);
      const previous = rows.find((row) => row.id === id);
      if (previous === undefined) {
        throw new Error(`typed dependency ${id} is outside work package ${workPackageId}`);
      }
      await scope.stores.typedDependencies.remove(id, stamp);
      await refreshTypedEndpoints([previous]);
    },
    removeAllFor: async (workItemIds, stamp) => {
      assertOpen();
      const admitted = await scope.stores.workItems.listByIds(workPackageId, workItemIds);
      if (new Set(admitted.map(({ id }) => id)).size !== new Set(workItemIds).size) {
        throw new Error(
          `typed dependency removal has a work item outside work package ${workPackageId}`,
        );
      }
      const removed = await scope.stores.typedDependencies.removeAllFor(workItemIds, stamp);
      await refreshTypedEndpoints(removed);
      return removed;
    },
  };
  /**
   * Attempts pass through to the batch scope — no batch-planning read folds
   * them — but every write moves its work item's revision, so the retained
   * rows are refreshed after it, as {@link createWorkingPlanValues} does for
   * the other step facts. A stale row would hand the journal the revision from
   * before the write, and the entry's own undo would refuse as stale.
   *
   * Proof: the start's refresh skipped (as every one was before this
   * wrapper) made `starts an attempt by step node ID … and one undo removes
   * it` in `step-node-attempt.controller.db.test.ts` answer `409 stale_undo`
   * (`“Strip” has changed since then.`); watched 2026-10-12.
   */
  const attempts: StepNodeAttemptStore = {
    listByWorkPackage: (requestedWorkPackageId) => {
      assertWorkPackage(requestedWorkPackageId);
      return scope.stores.attempts.listByWorkPackage(requestedWorkPackageId);
    },
    listByWorkItems: (requestedWorkPackageId, ids) => {
      assertWorkPackage(requestedWorkPackageId);
      return scope.stores.attempts.listByWorkItems(requestedWorkPackageId, ids);
    },
    listOfWorkItem: (workItemId) => {
      assertOpen();
      return scope.stores.attempts.listOfWorkItem(workItemId);
    },
    start: async (start, stamp) => {
      assertOpen();
      const started = await scope.stores.attempts.start(start, stamp);
      if (started.ok) await refreshRows([start.workItemId]);
      return started;
    },
    end: async (end, stamp) => {
      assertOpen();
      const ended = await scope.stores.attempts.end(end, stamp);
      if (ended.ok) await refreshRows([end.workItemId]);
      return ended;
    },
    remove: async (workItemId, stepId, attemptNumber, stamp) => {
      assertOpen();
      const removed = await scope.stores.attempts.remove(workItemId, stepId, attemptNumber, stamp);
      if (removed !== null) await refreshRows([workItemId]);
      return removed;
    },
    restore: async (attempt, stamp) => {
      assertOpen();
      await scope.stores.attempts.restore(attempt, stamp);
      await refreshRows([attempt.workItemId]);
    },
    listIssued: (requestedWorkPackageId, ids) => {
      assertWorkPackage(requestedWorkPackageId);
      return scope.stores.attempts.listIssued(requestedWorkPackageId, ids);
    },
    // A mark moves no revision, so there is no row to refresh.
    raiseIssued: (marks) => {
      assertOpen();
      return scope.stores.attempts.raiseIssued(marks);
    },
    moveAll: async (fromWorkItemId, toWorkItemId, stamp) => {
      assertOpen();
      await scope.stores.attempts.moveAll(fromWorkItemId, toWorkItemId, stamp);
      await refreshRows([fromWorkItemId, toWorkItemId]);
    },
  };
  const assertOwner = async (workItemId: string): Promise<void> => {
    assertOpen();
    const owner = await scope.stores.workItems.findById(workItemId);
    if (owner?.workPackageId !== workPackageId) {
      throw new Error(`work item ${workItemId} is outside work package ${workPackageId}`);
    }
  };
  /** Scope-bound facts preserve the transactional read and row revision after writes. */
  const blockages: StepBlockageStore = {
    listByWorkPackage: (requestedWorkPackageId) => {
      assertWorkPackage(requestedWorkPackageId);
      return scope.stores.blockages.listByWorkPackage(requestedWorkPackageId);
    },
    listByWorkItems: (requestedWorkPackageId, ids) => {
      assertWorkPackage(requestedWorkPackageId);
      return scope.stores.blockages.listByWorkItems(requestedWorkPackageId, ids);
    },
    set: async (blockage, stamp) => {
      await assertOwner(blockage.workItemId);
      const written = await scope.stores.blockages.set(blockage, stamp);
      if (written === 'written') await refreshRows([blockage.workItemId]);
      return written;
    },
    remove: async (workItemId, stepId, stamp) => {
      await assertOwner(workItemId);
      await scope.stores.blockages.remove(workItemId, stepId, stamp);
      await refreshRows([workItemId]);
    },
    moveAll: async (fromWorkItemId, toWorkItemId, stamp) => {
      await assertOwner(fromWorkItemId);
      await assertOwner(toWorkItemId);
      await scope.stores.blockages.moveAll(fromWorkItemId, toWorkItemId, stamp);
      await refreshRows([fromWorkItemId, toWorkItemId]);
    },
  };
  const retainedSubtrees = createWorkingPlanSubtrees(
    () => scope.stores.subtrees,
    {
      byIds: async (ids) => {
        const requested = new Set(ids);
        return (await workItems.all()).filter(({ id }) => requested.has(id));
      },
    },
    assertOpen,
    refreshRows,
  );
  const retainedDirectory = createWorkingPlanDirectory(
    () => scope.stores.directory,
    assertOpen,
    async () => {
      await Promise.all([
        workItems.reload(),
        estimates.reload(),
        actuals.reload(),
        measures.reload(),
        progress.reload(),
        dependencies.reload(),
      ]);
    },
    refreshRows,
  );

  const stores: PlanTransactionalStores = {
    get stepCatalogue() {
      assertOpen();
      return guardStepCatalogue(scope.stores.stepCatalogue, assertOpen);
    },
    get settings() {
      assertOpen();
      const settings = scope.stores.settings;
      function readTarget(
        address: { readonly level: 'organization'; readonly id: string },
        organizationId: string | null,
      ): Promise<Extract<SettingTarget, { readonly kind: 'organization' }> | null>;
      function readTarget(
        address: { readonly level: 'space'; readonly id: string },
        organizationId: string | null,
      ): Promise<Extract<SettingTarget, { readonly kind: 'space' }> | null>;
      function readTarget(
        address: { readonly level: 'project'; readonly id: string },
        organizationId: string | null,
      ): Promise<Extract<SettingTarget, { readonly kind: 'project' }> | null>;
      function readTarget(
        address: { readonly level: 'work_package'; readonly id: string },
        organizationId: string | null,
      ): Promise<Extract<SettingTarget, { readonly kind: 'work_package' }> | null>;
      function readTarget(
        address: SettingScope,
        organizationId: string | null,
      ): Promise<SettingTarget | null>;
      async function readTarget(
        address: SettingScope,
        organizationId: string | null,
      ): Promise<SettingTarget | null> {
        assertOpen();
        const target = await settings.readTarget(address, organizationId);
        assertOpen();
        return target;
      }
      return {
        readTarget,
        packageIds: async (...args: Parameters<typeof settings.packageIds>) => {
          assertOpen();
          const ids = await settings.packageIds(...args);
          assertOpen();
          return ids;
        },
        touchPackages: async (...args: Parameters<typeof settings.touchPackages>) => {
          assertOpen();
          const changed = await settings.touchPackages(...args);
          assertOpen();
          return changed;
        },
        capture: async (...args: Parameters<typeof settings.capture>) => {
          assertOpen();
          const snapshot = await settings.capture(...args);
          assertOpen();
          return snapshot;
        },
        write: async (...args: Parameters<typeof settings.write>) => {
          assertOpen();
          const written = await settings.write(...args);
          assertOpen();
          return written;
        },
      };
    },
    get externalDependencyAuthoring() {
      assertOpen();
      return scope.stores.externalDependencyAuthoring;
    },
    get runtimeCommands() {
      // Proof: P49 omitted the lifetime check; the closed runtime-catalog getter returned its borrowed store.
      assertOpen();
      return scope.stores.runtimeCommands;
    },
    get livePlans() {
      assertOpen();
      return scope.stores.livePlans;
    },
    get workPackages() {
      assertOpen();
      return scope.stores.workPackages;
    },
    // Proof: omitting this admitted-port forwarding made both grant claim controller cases answer500 instead of403/200 (2026-11-09).
    // Proof: bypassing this getter fence failed 'refuses to hand out its grant capability after plan close'; observed fault/restored pass, 2026-11-09.
    get accessDecisions() {
      assertOpen();
      const decisions = scope.stores.accessDecisions;
      if (decisions === undefined) return undefined;
      return {
        packageTargetOf: async (...args: Parameters<typeof decisions.packageTargetOf>) => {
          assertOpen();
          const target = await decisions.packageTargetOf(...args);
          assertOpen();
          return target;
        },
        effectiveRoleAt: async (...args: Parameters<typeof decisions.effectiveRoleAt>) => {
          // Proof: bypassing the pre-call fence touched the grant port in 'refuses a retained effectiveRoleAt call'; fault/restored pass, 2026-11-09.
          assertOpen();
          const effective = await decisions.effectiveRoleAt(...args);
          // Proof: bypassing this post-await fence returned an answer in 'refuses a suspended effectiveRoleAt answer'; fault/restored pass, 2026-11-09.
          assertOpen();
          return effective;
        },
        readablePackageIds: async (...args: Parameters<typeof decisions.readablePackageIds>) => {
          // Proof: bypassing the pre-call fence touched the grant port in 'refuses a retained readablePackageIds call'; fault/restored pass, 2026-11-09.
          assertOpen();
          const readable = await decisions.readablePackageIds(...args);
          // Proof: bypassing this post-await fence returned an answer in 'refuses a suspended readablePackageIds answer'; fault/restored pass, 2026-11-09.
          assertOpen();
          return readable;
        },
      };
    },
    get directory() {
      assertOpen();
      return retainedDirectory;
    },
    // A claim, a directory command and a capacity statement in a work package batch
    // read the organization's cap in this same transaction
    // (`wbs-organization-limits` L10); the gauge keeps no rows to retain.
    // Proof, each watched 2026-10-22 with this getter left out: every activated
    // claim of claim-limit.controller.db.test.ts threw "a bound claim was added
    // under scoped access without organization limits" (1 pass, 11 fail); `promotes
    // inside a work package batch under the cap and refuses it at the cap`
    // (agent-person-limit.controller.db.test.ts) answered 500 "an agent person
    // was added under scoped access without organization limits" (13 pass, 1 fail);
    // every activated statement case of capacity-limit.controller.db.test.ts
    // answered 500 "a resource capacity was stated under scoped access without
    // organization limits" (2 pass, 10 fail).
    // Proof: removing this getter made the mounted runtime cap refusal case
    // return shared-client unexpected_status 500 instead of claim_limit 409,
    // logging "a bound claim was added under scoped access without organization
    // limits" (0 pass, 1 fail); exact restoration passed both runtime cap cases,
    // watched 2026-10-22 in runtime-claim-limit.db.test.ts.
    get organizationLimits() {
      assertOpen();
      return scope.stores.organizationLimits;
    },
    get capacity() {
      assertOpen();
      return scope.stores.capacity;
    },
    get resourceCapacity() {
      assertOpen();
      return scope.stores.resourceCapacity;
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
    measureEstimates: retainedMeasureEstimates,
    budgets: retainedBudgets,
    progress: retainedProgress,
    attempts,
    blockages,
    claims: {
      listByWorkPackage: (requestedWorkPackageId) => {
        assertWorkPackage(requestedWorkPackageId);
        return scope.stores.claims.listByWorkPackage(requestedWorkPackageId);
      },
      listStampedByWorkPackage: (requestedWorkPackageId) => {
        assertWorkPackage(requestedWorkPackageId);
        return scope.stores.claims.listStampedByWorkPackage(requestedWorkPackageId);
      },
      findById: (requestedWorkPackageId, claimId) => {
        assertWorkPackage(requestedWorkPackageId);
        return scope.stores.claims.findById(requestedWorkPackageId, claimId);
      },
      observeWorkPackage: (requestedWorkPackageId, access) => {
        assertWorkPackage(requestedWorkPackageId);
        return scope.stores.claims.observeWorkPackage(requestedWorkPackageId, access);
      },
      occupancyOf: (requestedWorkPackageId) => {
        assertWorkPackage(requestedWorkPackageId);
        return scope.stores.claims.occupancyOf(requestedWorkPackageId);
      },
      // Unfenced and uncached (`wbs-shared-occupancy` S4): the organization's
      // other work packages are what this read is for, and the batch's own
      // connection answers its earlier claims and every committed one.
      organizationOccupancyOf: (resourceIds) => {
        assertOpen();
        return scope.stores.claims.organizationOccupancyOf(resourceIds);
      },
      organizationUnitsOf: (resourceIds) => {
        assertOpen();
        return scope.stores.claims.organizationUnitsOf(resourceIds);
      },
      boundAccountOf: (personId) => {
        assertOpen();
        return scope.stores.claims.boundAccountOf(personId);
      },
      pinnedPersonOf: (credential) => {
        assertOpen();
        return scope.stores.claims.pinnedPersonOf(credential);
      },
      add: async (claims, stated, stamp, occupancy, leases) => {
        const owners = [...new Set([...claims, ...stated].map(({ workItemId }) => workItemId))];
        for (const owner of owners) await assertOwner(owner);
        const written = await scope.stores.claims.add(claims, stated, stamp, occupancy, leases);
        // Proof: with this refresh removed, `shows the batch the progress its
        // claim stated` (claim-command.test.ts) let a later setStatus ready
        // through on stale retained progress; watched 2026-10-19.
        if (written === 'written') await refreshRows(owners);
        return written;
      },
      remove: async (claims, cleared, stamp) => {
        const owners = [...new Set([...claims, ...cleared].map(({ workItemId }) => workItemId))];
        for (const owner of owners) await assertOwner(owner);
        await scope.stores.claims.remove(claims, cleared, stamp);
        await refreshRows(owners);
      },
      moveAll: async (fromWorkItemId, toWorkItemId, stamp) => {
        await assertOwner(fromWorkItemId);
        await assertOwner(toWorkItemId);
        await scope.stores.claims.moveAll(fromWorkItemId, toWorkItemId, stamp);
        await refreshRows([fromWorkItemId, toWorkItemId]);
      },
      // A renewal is the person's, across work packages, and moves no revision or
      // retained row: a lease is not a plan fact (`wbs-claim-leases` L4).
      renewLeases: (personId, runId, now) => {
        assertOpen();
        return scope.stores.claims.renewLeases(personId, runId, now);
      },
      expiredLeasesOf: (requestedWorkPackageId, at) => {
        assertWorkPackage(requestedWorkPackageId);
        return scope.stores.claims.expiredLeasesOf(requestedWorkPackageId, at);
      },
      workPackagesWithExpiredLeases: (at, limit) => {
        assertOpen();
        return scope.stores.claims.workPackagesWithExpiredLeases(at, limit);
      },
    },
    demands: {
      listByWorkPackage: (requestedWorkPackageId) => {
        assertWorkPackage(requestedWorkPackageId);
        return scope.stores.demands.listByWorkPackage(requestedWorkPackageId);
      },
      set: async (workItemId, resourceId, units, stamp) => {
        await assertOwner(workItemId);
        const written = await scope.stores.demands.set(workItemId, resourceId, units, stamp);
        // The write moved the row's revision; a later command of the batch must
        // read it, or its own precondition is pinned to a revision that is gone.
        if (written === 'written') await refreshRows([workItemId]);
        return written;
      },
    },
    stepParallels: {
      // Proof: spreading the real SQLite class dropped prototype methods;
      // mounted borrowed-scope regression failed on listByWorkPackage (prototype-red.txt).
      listByWorkPackage: (requestedWorkPackageId) => {
        // Proof: independently omitting work package or lifetime checks resolved the
        // mounted foreign/closed read negatives (mutation-list-*-guard.txt).
        assertWorkPackage(requestedWorkPackageId);
        return scope.stores.stepParallels.listByWorkPackage(requestedWorkPackageId);
      },
      listByWorkItems: (requestedWorkPackageId, ids) => {
        // Proof: omitted scope guard resolved foreign/closed reads; stale empty
        // evidence committed the preceding batch patch (first-child mutation logs).
        assertWorkPackage(requestedWorkPackageId);
        return scope.stores.stepParallels.listByWorkItems(requestedWorkPackageId, ids);
      },
      set: async (parallel, stamp) => {
        // Proof: omitted owner check accepted the mounted foreign-scope write
        // (mutation-set-owner-guard.txt); the closed call also refuses here.
        await assertOwner(parallel.workItemId);
        await scope.stores.stepParallels.set(parallel, stamp);
        // Proof: omitted refresh left the warmed listByWorkPackage revision stale
        // against SQLite (mutation-set-refresh.txt); findById is not this cache.
        await refreshRows([parallel.workItemId]);
      },
      remove: async (workItemId, stepId, stamp) => {
        // Proof: omitted owner check accepted foreign/missing-owner removal
        // (mutation-remove-owner-guard.txt); the mounted regression failed.
        await assertOwner(workItemId);
        await scope.stores.stepParallels.remove(workItemId, stepId, stamp);
        // Proof: omitted refresh left the warmed listByWorkPackage revision stale
        // against SQLite (mutation-remove-refresh.txt).
        await refreshRows([workItemId]);
      },
    },
    dependencies: retainedDependencies,
    typedDependencies,
    subtrees: retainedSubtrees,
    get journal() {
      assertOpen();
      return scope.stores.journal;
    },
  };

  return {
    stores,
    refreshRows,
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

  async reload(): Promise<void> {
    this.assertOpen();
    if (this.rows === undefined) return;
    const loaded = await this.load();
    this.assertOpen();
    this.rows = loaded.map(this.clone);
  }

  async replaceGroupsAndPlace(
    ids: readonly string[],
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
    const replacementsByGroup = new Map<string, Row[]>();
    for (const row of replacements) addToGroup(replacementsByGroup, groupOf(row), row);
    const inserted = new Set<string>();
    const retainedGroups = new Set(this.rows.map(groupOf));
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
    const newGroups = [...replacementsByGroup.keys()].filter((group) => !retainedGroups.has(group));
    if (newGroups.length === 0) {
      this.rows = retained.map(this.clone);
      return;
    }
    const placements = await loadPlacements(newGroups);
    this.assertOpen();
    const newReplacements = new Map(
      newGroups.map((group) => [group, replacementsByGroup.get(group) ?? []] as const),
    );
    placeGroups(retained, newReplacements, placements, groupOf, 'value group');
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
    if (newIds.length === 0) {
      this.rows = retained.map(this.clone);
      return;
    }
    const placements = await loadPlacements(newIds);
    this.assertOpen();
    const newRows = new Map<string, Row[]>(
      [...replacementsByIdentity].map(([id, row]) => [id, [row]]),
    );
    placeGroups(retained, newRows, placements, groupOf, 'work item');
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
    for (const row of this.rows) {
      if (!isIncident(row)) {
        retained.push(row);
        continue;
      }
      const replacement = replacementByIdentity.get(identityOf(row));
      if (replacement === undefined) continue;
      retained.push(replacement);
      replacementByIdentity.delete(identityOf(row));
    }
    retained.push(...replacementByIdentity.values());
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

function placementsOfGroups<Row>(
  rows: readonly Row[],
  ids: readonly string[],
  groupOf: (row: Row) => string,
): { id: string; afterId: string | null }[] {
  const requested = new Set(ids);
  const groups = [...new Set(rows.map(groupOf))];
  return groups.flatMap((id, index) =>
    requested.has(id) ? [{ id, afterId: index === 0 ? null : groups[index - 1] }] : [],
  );
}

function placeGroups<Row>(
  retained: Row[],
  replacements: ReadonlyMap<string, Row[]>,
  placements: readonly { id: string; afterId: string | null }[],
  groupOf: (row: Row) => string,
  noun: 'value group' | 'work item',
): void {
  const expected = new Set(replacements.keys());
  const placed = new Set<string>();
  const known = new Set(retained.map(groupOf));
  for (const { id, afterId } of placements) {
    if (placed.has(id)) throw new Error(`targeted placement returned duplicate ${noun} ${id}`);
    if (!expected.has(id)) throw new Error(`targeted placement returned unexpected ${noun} ${id}`);
    if (afterId !== null && typeof afterId !== 'string') {
      throw new Error(`targeted placement for ${id} has malformed predecessor`);
    }
    if (afterId === id) throw new Error(`targeted placement for ${id} cannot follow itself`);
    if (afterId !== null && !known.has(afterId)) {
      throw new Error(`targeted placement for ${id} follows missing ${noun} ${afterId}`);
    }
    known.add(id);
    placed.add(id);
  }
  if (placed.size !== expected.size) {
    const missing = [...expected].find((id) => !placed.has(id));
    throw new Error(`targeted placement omitted ${noun} ${missing ?? 'unknown'}`);
  }
  for (const { id, afterId } of placements) {
    const rows = replacements.get(id);
    if (rows === undefined) throw new Error(`targeted placement omitted ${noun} ${id}`);
    const index = afterId === null ? 0 : lastGroupIndex(retained, afterId, groupOf) + 1;
    retained.splice(index, 0, ...rows);
  }
}

function lastGroupIndex<Row>(
  rows: readonly Row[],
  id: string,
  groupOf: (row: Row) => string,
): number {
  return rows.findLastIndex((row) => groupOf(row) === id);
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
