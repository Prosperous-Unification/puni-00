import type { Space, SpaceStore } from '@wbs/core';
import { type MoveWriteOutcome, retainMoveWrite } from '@wbs/core';
import {
  type FirstChildWrite,
  type FirstChildWriteOutcome,
  retainFirstChildWrite,
  type WriteStamp,
} from '@wbs/core';
import { retainSubtreeWrite, type SubtreeStore, type SubtreeWriteOutcome } from '@wbs/core';
import {
  claimIdentityOf,
  readPackageStepValues,
  retainWorkPackageCreation,
  type StepUnitWritten,
  type TransactionalStores,
  type WorkPackageCreationRefusal,
  type WorkPackageCreatorGrant,
  WorkPackageStepMissing,
  type WorkPackageStore,
  type WorkPackageWithSteps,
} from '@wbs/core';
import { INACTIVE_EXTERNAL_DEPENDENCIES } from '@wbs/core/ports/external-dependency-authoring';
import type { OrganizationLimitValues } from '@wbs/domain';
import { allowanceHundredthsOf, resolveSetting } from '@wbs/domain';

import { inMemoryActuals, type MemoryActualTable, memoryActualTable } from './actual-fixture';
import { inMemoryAttempts, type MemoryAttemptTable, memoryAttemptTable } from './attempt-fixture';
import { inMemoryUsers, type MemoryUserTable, memoryUserTable } from './auth-fixture';
import { inMemoryBudgets, type MemoryBudgetTable, memoryBudgetTable } from './budget-fixture';
import { inMemoryCalendarMarkers, type MemoryCalendarMarkerTable } from './calendar-marker-fixture';
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
import { readMemoryClaimStepsIn } from './claim-observation';
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
import { applyMemoryFirstChildIn } from './first-child';
import { inMemoryPlanEvents } from './history-fixture';
import { bindIncidentDependencies } from './incident-dependency-fixture';
import { inertMemoryLateWriteSeam, type MemoryLateWriteSeam } from './late-write-seam';
import {
  inMemoryMeasureEstimates,
  type MemoryMeasureEstimateTable,
  memoryMeasureEstimateTable,
} from './measure-estimate-fixture';
import {
  countEstimatesKeyedBy,
  countFactsKeyedBy,
  definitionsOfWorkPackage,
  inMemoryMeasures,
  type MemoryMeasureTable,
  memoryMeasureTable,
} from './measure-fixture';
import { readMemoryWorkItemRowsIn } from './memory-work-item-fixture';
import {
  inMemoryWorkItems,
  type MemoryWorkItemTables,
  memoryWorkItemTables,
} from './memory-work-item-fixture';
import { applyMemoryMoveIn } from './move';
import {
  inMemoryOrganizationLimitGauge,
  type MemoryOrganizationLimitTables,
  memoryOrganizationLimitTables,
} from './organization-limits-fixture';
import {
  readMemoryOrganizationActivation,
  writePackageCreatorGrantIn,
} from './package-creation-fixture';
import { ownMemoryActualReads, ownMemoryProgressReads } from './point-reads';
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
import {
  inMemoryEventLog,
  type MemoryEventLogTables,
  memoryEventLogTables,
} from './replay-fixture';
import { cascadeDemands, inMemoryDemands, inMemoryResourceCapacity } from './resource-fixture';
import {
  inMemoryRuntimeCommands,
  type MemoryRuntimeTable,
  memoryRuntimeTable,
} from './runtime-command';
import {
  captureMemorySettingsIn,
  inMemorySettings,
  type MemorySettingTables,
} from './settings-fixture';
import { inMemorySpaces } from './space-fixture';
import { createCurrentBlockageStore, createCurrentParallelStore } from './sparse-step-stores';
import { type MemoryStepBlockageTable, memoryStepBlockageTable } from './step-blockage-fixture';
import {
  inMemoryStepCatalogue,
  materializeMemoryPackageStepsIn,
  type MemoryStepCatalogueContext,
  type MemoryStepCatalogueTables,
  memoryStepCatalogueTables,
} from './step-catalogue';
import { inMemorySteps, type MemoryStepTable, memoryStepTable } from './step-fixture';
import { readMemoryStepOrderProjectionIn } from './step-order-projection';
import { readMemoryPackageStepsIn } from './step-package-reads';
import { type MemoryStepParallelTable, memoryStepParallelTable } from './step-parallel-fixture';
import { readMemoryTreeRowsIn } from './step-tree-reads';
import { inMemorySubtrees } from './subtree-fixture';
import { applyMemorySubtreeIn } from './subtree-write';
import {
  ownMemoryAttemptReads,
  ownMemoryMeasureEstimateReads,
  ownMemoryMeasureReads,
} from './tuple-reads';
import {
  inMemoryTypedDependencies,
  type MemoryTypedDependencyTable,
  memoryTypedDependencyTable,
} from './typed-dependency-fixture';
import {
  createMemoryWorkPackageIn,
  inMemoryWorkPackages,
  type MemoryWorkPackageTables,
  memoryWorkPackageTables,
} from './work-package-fixture';
import { mayReadMemoryWorkPackage } from './work-package-visibility';

interface MemoryTables {
  readonly settings: MemorySettingTables;
  readonly spaces: Map<string, Space>;
  readonly spacePeople: Map<string, Set<string>>;
  readonly spaceTeams: Map<string, Set<string>>;
  readonly runtime: MemoryRuntimeTable;
  readonly users: MemoryUserTable;
  readonly workPackages: MemoryWorkPackageTables;
  readonly directory: MemoryDirectoryTables;
  readonly steps: MemoryStepTable;
  readonly stepCatalogue: MemoryStepCatalogueTables;
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
  const packages = memoryWorkPackageTables();
  return {
    settings: packages.settings,
    spaces: packages.spaces,
    spacePeople: new Map(),
    spaceTeams: new Map(),
    runtime: memoryRuntimeTable(),
    users: memoryUserTable(),
    workPackages: packages,
    directory: memoryDirectoryTables(),
    steps: memoryStepTable(),
    stepCatalogue: memoryStepCatalogueTables(),
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
    calendarMarkers: packages.markers,
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
      if (key === 'incidents' && typeof member === 'object' && member !== null)
        return detachedStore(member);
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
function detachedStores<Stores extends TransactionalStores>(stores: Stores): Stores {
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
  // Proof: aliasing only definitions leaked an unused Wiring definition after
  // refused/thrown batches; complete-source comparisons failed both cases while
  // named reads alone passed (uow-definitions-alias-*-v1, 2026-11-19).
  clone(): MemoryState {
    return new MemoryState(structuredClone(this.tables));
  }

  replaceWith(next: MemoryState): void {
    replaceMap(this.tables.settings.values, next.tables.settings.values);
    replaceMap(this.tables.spaces, next.tables.spaces);
    replaceMap(this.tables.spacePeople, next.tables.spacePeople);
    replaceMap(this.tables.spaceTeams, next.tables.spaceTeams);
    // Proof: P27 aliased the staged tables; refused/late-failing real runtime writes escaped rollback.
    this.tables.runtime.ledger = structuredClone(next.tables.runtime.ledger);
    replaceMap(this.tables.runtime.authorities, next.tables.runtime.authorities);
    replaceMap(this.tables.runtime.bindings, next.tables.runtime.bindings);
    replaceMap(this.tables.runtime.acceptances, next.tables.runtime.acceptances);
    replaceMap(this.tables.users.byId, next.tables.users.byId);
    replaceMap(this.tables.workPackages.workPackages, next.tables.workPackages.workPackages);
    replaceMap(this.tables.workPackages.steps, next.tables.workPackages.steps);
    replaceMap(this.tables.workPackages.opened, next.tables.workPackages.opened);
    replaceMap(this.tables.workPackages.owning, next.tables.workPackages.owning);
    replaceMap(
      this.tables.workPackages.creation.projects,
      next.tables.workPackages.creation.projects,
    );
    replaceMap(
      this.tables.workPackages.creation.creators,
      next.tables.workPackages.creation.creators,
    );
    replaceMap(this.tables.workPackages.creation.roles, next.tables.workPackages.creation.roles);
    replaceMap(this.tables.workPackages.creation.grants, next.tables.workPackages.creation.grants);
    replaceMap(this.tables.workPackages.creation.audits, next.tables.workPackages.creation.audits);
    // Proof: with this line removed, `undoes an allowance edit committed in an
    // earlier unit of work` failed: the undo answered ok: false (2026-09-27).
    replaceMap(
      this.tables.workPackages.allowanceRevisions,
      next.tables.workPackages.allowanceRevisions,
    );
    replaceMap(this.tables.directory.teams, next.tables.directory.teams);
    replaceMap(this.tables.directory.tags, next.tables.directory.tags);
    replaceMap(this.tables.directory.services, next.tables.directory.services);
    replaceMap(this.tables.directory.workItemTypes, next.tables.directory.workItemTypes);
    replaceMap(this.tables.directory.externalSystems, next.tables.directory.externalSystems);
    replaceMap(this.tables.directory.people, next.tables.directory.people);
    replaceMap(this.tables.directory.memberships, next.tables.directory.memberships);
    replaceMap(this.tables.directory.owned, next.tables.directory.owned);
    replaceMap(this.tables.directory.assignments, next.tables.directory.assignments);
    // Proof: omitting ownership publication made both directory-ownership.test.ts commit cases lose their actual type scope (import-directory-ownership-red-v2).
    replaceMap(this.tables.directory.organizationOf, next.tables.directory.organizationOf);
    replaceMap(this.tables.directory.accountOf, next.tables.directory.accountOf);
    replaceMap(
      this.tables.directory.organizationMembers,
      next.tables.directory.organizationMembers,
    );
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
    // Proof: with the capacities' copy removed, `states and clears a directory
    // capacity with its unit of work` (directory-capacity.test.ts in
    // core) read no capacity after it committed; watched 2026-10-25.
    replaceMap(
      this.tables.directory.resources.directoryCapacities,
      next.tables.directory.resources.directoryCapacities,
    );
    // Proof: with this copy removed, `defines, patches and removes a measure,
    // listing it after the seeded five` (measure-command.test.ts) read no
    // `gpu_minutes` after its batch committed; watched 2026-10-23.
    replaceMap(
      this.tables.directory.measureDefinitions.organizations,
      next.tables.directory.measureDefinitions.organizations,
    );
    replaceMap(this.tables.stepCatalogue.retirements, next.tables.stepCatalogue.retirements);
    // Proof: omission loses the staged alias replacement and added old-qa row
    // in the actual MemoryState owner (saved-identity-effect-alias-publication-v1).
    replaceMap(
      this.tables.stepCatalogue.identityHistory,
      next.tables.stepCatalogue.identityHistory,
    );
    replaceMap(this.tables.stepCatalogue.definitions, next.tables.stepCatalogue.definitions);
    replaceMap(this.tables.stepCatalogue.bindings, next.tables.stepCatalogue.bindings);
    replaceMap(this.tables.stepCatalogue.packageValues, next.tables.stepCatalogue.packageValues);
    replaceArray(this.tables.steps.rows, next.tables.steps.rows);
    replaceArray(this.tables.dependencies.rows, next.tables.dependencies.rows);
    // Proof: omitting this copy left `commits all mixed-store writes together`
    // with no committed typed row; watched failing 2026-09-27.
    replaceArray(this.tables.typedDependencies.rows, next.tables.typedDependencies.rows);
    // Proof: omission lost the creation receipt for a typed row committed through the real source UoW, 2026-10-22.
    replaceMap(this.tables.typedDependencies.creation, next.tables.typedDependencies.creation);
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
    // Proof: removing this copy failed the work-package-seeded fact transaction test
    // after commit left the old fact in place; watched 2026-10-13.
    replaceArray(this.tables.blockages.rows, next.tables.blockages.rows);
    // Proof: copy removed; source commit assertion lost the real authored fact (memory-commit.txt), 2026-10-15.
    replaceArray(this.tables.stepParallels.rows, next.tables.stepParallels.rows);
    replaceArray(this.tables.attempts.issued, next.tables.attempts.issued);
    // Proof: with this copy removed, eight cases of claim-command.test.ts lost
    // their committed claims; watched 2026-10-19.
    replaceArray(this.tables.claims.rows, next.tables.claims.rows);
    // Proof: with this copy removed, `acquires the declared demand and reads it
    // per work package and per resource` (resource-occupancy.db.test.ts, memory) read
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
      this.tables.organizationLimits.workPackageOrganization,
      next.tables.organizationLimits.workPackageOrganization,
    );
  }
}

function catalogueContextOf(state: MemoryState): MemoryStepCatalogueContext {
  return {
    usage: {
      workItems: state.tables.workItems,
      estimates: state.tables.estimates,
      actuals: state.tables.actuals,
      progress: state.tables.progress,
      measures: state.tables.measures,
      measureEstimates: state.tables.measureEstimates,
      attempts: state.tables.attempts,
      assignments: state.tables.directory.assignments,
      claims: state.tables.claims,
      blockages: state.tables.blockages,
      parallels: state.tables.stepParallels,
      dependencies: state.tables.typedDependencies,
      people: state.tables.directory.people,
      users: state.tables.users.byId,
      personOrganization: state.tables.directory.organizationOf,
    },
    organizations: state.tables.directory.measureDefinitions.organizations,
    spaces: state.tables.spaces,
    projects: state.tables.workPackages.creation.projects,
    packages: state.tables.workPackages.workPackages,
    packageOrganization: state.tables.organizationLimits.workPackageOrganization,
    packageOwnership: state.tables.workPackages.owning,
    types: state.tables.directory.workItemTypes,
    typeOrganization: state.tables.directory.organizationOf,
  };
}

function requireBirthEntry<Key, Value>(
  rows: ReadonlyMap<Key, Value>,
  key: Key,
  label: string,
): Value {
  const entry = rows.get(key);
  if (entry === undefined) throw new Error('prepared package birth has no ' + label);
  return entry;
}

/** Publishes only the newborn's prepared entries; unrelated staged writes and all existing package overrides remain untouched. */
function publishPackageBirth(
  state: MemoryState,
  prepared: MemoryState,
  workPackageId: string,
  creatorGrant: WorkPackageCreatorGrant | null,
): void {
  const packages = state.tables.workPackages,
    staged = prepared.tables.workPackages;
  const retained = structuredClone({
    workPackage: requireBirthEntry(staged.workPackages, workPackageId, 'package'),
    starting: requireBirthEntry(staged.steps, workPackageId, 'starting steps'),
    organizationId: requireBirthEntry(staged.owning, workPackageId, 'package ownership'),
    mapping: requireBirthEntry(
      prepared.tables.organizationLimits.workPackageOrganization,
      workPackageId,
      'organization mapping',
    ),
    creator: requireBirthEntry(staged.creation.creators, workPackageId, 'creator'),
    values: requireBirthEntry(
      prepared.tables.stepCatalogue.packageValues,
      workPackageId,
      'explicit catalogue values',
    ),
    settings: [...prepared.tables.settings.values].filter(
      ([, row]) => row.scope.level === 'work_package' && row.scope.id === workPackageId,
    ),
  });
  const authority =
    creatorGrant === null
      ? null
      : structuredClone({
          grantId: creatorGrant.id,
          auditId: creatorGrant.auditId,
          grant: requireBirthEntry(staged.creation.grants, creatorGrant.id, 'creator grant'),
          audit: requireBirthEntry(staged.creation.audits, creatorGrant.auditId, 'creator audit'),
        });
  if (
    packages.workPackages.has(workPackageId) ||
    packages.steps.has(workPackageId) ||
    packages.owning.has(workPackageId) ||
    state.tables.organizationLimits.workPackageOrganization.has(workPackageId) ||
    packages.creation.creators.has(workPackageId) ||
    (creatorGrant !== null &&
      (packages.creation.grants.has(creatorGrant.id) ||
        packages.creation.audits.has(creatorGrant.auditId))) ||
    state.tables.stepCatalogue.packageValues.has(workPackageId) ||
    [...state.tables.settings.values.values()].some(
      (row) => row.scope.level === 'work_package' && row.scope.id === workPackageId,
    )
  )
    throw new Error('package birth identity became occupied before publication');
  packages.workPackages.set(workPackageId, retained.workPackage);
  packages.steps.set(workPackageId, retained.starting);
  packages.owning.set(workPackageId, retained.organizationId);
  state.tables.organizationLimits.workPackageOrganization.set(workPackageId, retained.mapping);
  packages.creation.creators.set(workPackageId, retained.creator);
  // Proof: omitting both authority publications failed the current empty-package
  // birth's creator grant count (birth-effect-scoped-authority-v1).
  if (authority !== null) {
    packages.creation.grants.set(authority.grantId, authority.grant);
    packages.creation.audits.set(authority.auditId, authority.audit);
  }
  // Proof: omitting this publication raised WorkPackageStepMissing in the real
  // legacy Source birth read (birth-effect-explicit-values-v1).
  state.tables.stepCatalogue.packageValues.set(workPackageId, retained.values);
  for (const [key, row] of retained.settings) state.tables.settings.values.set(key, row);
}

/**
 * Retains pre-activation creation under its actual Source loan. Legacy starting rows do
 * not define the current catalogue: explicit package values come from the freshly captured
 * organization/project union. Only newborn rows publish after all raw settings awaits.
 */
function createLegacyMemoryBirthSnapshotIn(
  state: MemoryState,
  assertOpen: () => void,
): (
  ...args: Parameters<WorkPackageStore['create']>
) => Promise<WorkPackageWithSteps | WorkPackageCreationRefusal> {
  return async (workPackage, starting, stamp) => {
    assertOpen();
    const retained = structuredClone({ workPackage, steps: [...starting], stamp });
    const preparation = state.clone();
    const birth = inMemoryWorkPackages(
      inMemoryUsers(preparation.tables.users),
      preparation.tables.workPackages,
      {
        users: preparation.tables.users.byId,
        organizations: preparation.tables.directory.measureDefinitions.organizations,
        memberships: preparation.tables.directory.organizationMembers,
        ownership: preparation.tables.organizationLimits.workPackageOrganization,
      },
    );
    const written = await birth.create(retained.workPackage, retained.steps, retained.stamp);
    assertOpen();
    if (typeof written === 'string') return written;
    // Proof: restoring the pre-await definitions/bindings here raised
    // WorkPackageStepMissing for the late binding in the real same-loan read
    // (birth-effect-fresh-catalogue-v1).
    const prepared = state.clone();
    if (prepared.tables.workPackages.workPackages.has(retained.workPackage.id))
      throw new Error('duplicate package identity');
    const current = createMemoryWorkPackageIn(
      retained.workPackage,
      retained.steps,
      null,
      prepared.tables.workPackages,
      {
        users: prepared.tables.users.byId,
        organizations: prepared.tables.directory.measureDefinitions.organizations,
        memberships: prepared.tables.directory.organizationMembers,
        ownership: prepared.tables.organizationLimits.workPackageOrganization,
      },
    );
    if (typeof current === 'string') return current;
    const organizationId = requireBirthEntry(
      prepared.tables.workPackages.owning,
      current.id,
      'package ownership',
    );
    prepared.tables.organizationLimits.workPackageOrganization.set(current.id, organizationId);
    prepared.tables.workPackages.creation.creators.set(current.id, retained.stamp.by);
    for (const [key, row] of preparation.tables.settings.values) {
      if (row.scope.level === 'work_package' && row.scope.id === current.id)
        prepared.tables.settings.values.set(key, structuredClone(row));
    }
    const chain = materializeMemoryPackageStepsIn(
      prepared.tables.stepCatalogue,
      catalogueContextOf(prepared),
      organizationId,
      current.id,
    );
    const snapshot = captureMemorySettingsIn(prepared.tables.settings, chain, () =>
      [...prepared.tables.calendarMarkers.held.values()].map(({ scope, ...marker }) => ({
        scope,
        marker,
      })),
    );
    const returned = {
      workPackage: {
        ...structuredClone(current),
        pertWeights: resolveSetting(chain, 'pertWeights', snapshot).value,
        budgetFactor: resolveSetting(chain, 'budgetFactor', snapshot).value,
      },
      // Proof: memory-legacy-reply substitutes []; authored and coherence service
      // owners lose their captured identities (two failures).
      steps: readMemoryPackageStepsIn(
        prepared.tables.stepCatalogue,
        catalogueContextOf(prepared),
        current.id,
      ),
    };
    assertOpen();
    publishPackageBirth(state, prepared, current.id, null);
    return returned;
  };
}

/**
 * Binds scoped birth to its actual Source/repair loan. The required callback is
 * checked at entry, after raw asynchronous settings preparation, and immediately
 * before publication. No lifetime default or replacement owner exists.
 * The final current-chain/catalogue capture and newborn publication are synchronous.
 */
function createMemoryBirthSnapshotIn(
  state: MemoryState,
  assertOpen: () => void,
): (
  ...args: Parameters<WorkPackageStore['createInOrganization']>
) => Promise<WorkPackageWithSteps | WorkPackageCreationRefusal> {
  return async (workPackage, starting, stamp, organizationId, creatorGrant) => {
    assertOpen();
    const retained = retainWorkPackageCreation(
      workPackage,
      starting,
      stamp,
      organizationId,
      creatorGrant,
    );
    const preparation = state.clone();
    const birth = inMemoryWorkPackages(
      inMemoryUsers(preparation.tables.users),
      preparation.tables.workPackages,
      {
        users: preparation.tables.users.byId,
        organizations: preparation.tables.directory.measureDefinitions.organizations,
        memberships: preparation.tables.directory.organizationMembers,
        ownership: preparation.tables.organizationLimits.workPackageOrganization,
      },
    );
    const written = await birth.createInOrganization(
      retained.workPackage,
      retained.steps,
      retained.stamp,
      retained.organizationId,
      retained.creatorGrant,
    );
    assertOpen();
    if (typeof written === 'string') return written;
    // Read the current same-loan graph only after the raw birth's real settings/project awaits settle.
    const prepared = state.clone();
    if (prepared.tables.workPackages.workPackages.has(retained.workPackage.id))
      throw new Error('duplicate package identity');
    const creation = {
      users: prepared.tables.users.byId,
      organizations: prepared.tables.directory.measureDefinitions.organizations,
      memberships: prepared.tables.directory.organizationMembers,
      ownership: prepared.tables.organizationLimits.workPackageOrganization,
    };
    const current = createMemoryWorkPackageIn(
      retained.workPackage,
      retained.steps,
      retained.organizationId,
      prepared.tables.workPackages,
      creation,
    );
    if (typeof current === 'string') return current;
    prepared.tables.workPackages.creation.creators.set(current.id, retained.stamp.by);
    prepared.tables.organizationLimits.workPackageOrganization.set(
      current.id,
      retained.organizationId,
    );
    writePackageCreatorGrantIn(
      prepared.tables.workPackages.creation,
      creation,
      retained.organizationId,
      current.id,
      retained.stamp,
      retained.creatorGrant,
    );
    // Only the supplied package's validated own setting rows are retained; current ancestors stay in the fresh graph.
    for (const [key, row] of preparation.tables.settings.values) {
      if (row.scope.level === 'work_package' && row.scope.id === current.id)
        prepared.tables.settings.values.set(key, structuredClone(row));
    }
    const chain = materializeMemoryPackageStepsIn(
      prepared.tables.stepCatalogue,
      catalogueContextOf(prepared),
      retained.organizationId,
      current.id,
    );
    const snapshot = captureMemorySettingsIn(prepared.tables.settings, chain, () =>
      [...prepared.tables.calendarMarkers.held.values()].map(({ scope, ...marker }) => ({
        scope,
        marker,
      })),
    );
    const returned = {
      workPackage: {
        ...structuredClone(current),
        pertWeights: resolveSetting(chain, 'pertWeights', snapshot).value,
        budgetFactor: resolveSetting(chain, 'budgetFactor', snapshot).value,
      },
      // Proof: memory-scoped-reply substitutes []; the actual scoped typed-step
      // owner fails before its later queue tail (one failure).
      steps: readMemoryPackageStepsIn(
        prepared.tables.stepCatalogue,
        catalogueContextOf(prepared),
        current.id,
      ),
    };
    assertOpen();
    publishPackageBirth(state, prepared, current.id, retained.creatorGrant);
    return returned;
  };
}

/** Header-only compatibility projection of the actual same-owner legacy birth snapshot. */
export function createLegacyMemoryPackageBirthIn(
  state: MemoryState,
  assertOpen: () => void,
): WorkPackageStore['create'] {
  const create = createLegacyMemoryBirthSnapshotIn(state, assertOpen);
  return async (...args) => {
    const born = await create(...args);
    assertOpen();
    return typeof born === 'string' ? born : born.workPackage;
  };
}

/** Header-only compatibility projection of the actual same-owner scoped birth snapshot. */
export function createMemoryPackageBirthIn(
  state: MemoryState,
  assertOpen: () => void,
): WorkPackageStore['createInOrganization'] {
  const create = createMemoryBirthSnapshotIn(state, assertOpen);
  return async (...args) => {
    const born = await create(...args);
    assertOpen();
    return typeof born === 'string' ? born : born.workPackage;
  };
}

/** Retains the complete current act and captures its reply before the prepared state publishes. */
export function createMemoryPackageWithStepsIn(
  state: MemoryState,
  assertOpen: () => void,
): WorkPackageStore['createWithSteps'] {
  const legacy = createLegacyMemoryBirthSnapshotIn(state, assertOpen),
    scoped = createMemoryBirthSnapshotIn(state, assertOpen);
  return async (workPackage, stamp, scope) => {
    assertOpen();
    const born =
      scope.kind === 'legacy'
        ? await legacy(workPackage, [], stamp)
        : await scoped(workPackage, [], stamp, scope.organizationId, scope.creatorGrant);
    assertOpen();
    return born;
  };
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
): TransactionalStores & { readonly spaces: SpaceStore } {
  const users = inMemoryUsers(state.tables.users);
  let workItems: TransactionalStores['workItems'] | null = null;
  const fixtureDirectory = inMemoryDirectory(
    (workPackageId) => {
      if (workItems === null) throw new Error('work-item table was read before it was bound');
      return workItems.listByWorkPackage(workPackageId);
    },
    state.tables.directory,
    state.tables.users.byId,
  );
  const measureOwnership = {
    workPackageOrganization: state.tables.organizationLimits.workPackageOrganization,
    definitions: state.tables.directory.measureDefinitions,
  };
  const claimsOf = (personId: string) =>
    claimsTakenWith(state.tables.claims, personId).map(
      ({ workItemId, stepId, personId: holder }) => ({ workItemId, stepId, personId: holder }),
    );
  /** Space member sets are sparse; deleting a root changes only spaces that actually held that identity. */
  const removeSpaceMemberships = (kind: 'person' | 'team', id: string): void => {
    const links = kind === 'person' ? state.tables.spacePeople : state.tables.spaceTeams;
    for (const space of state.tables.spaces.values()) {
      // Proof: omitting this predicate revised an unrelated surviving space (space-directory-fault-unrelated-space-v1).
      if (links.get(space.id)?.delete(id) !== true) continue;
      state.tables.spaces.set(space.id, { ...space, revision: space.revision + 1 });
    }
  };
  const teamWorkItems = (teamId: string) =>
    [...state.tables.workItems.byId.values()].flatMap((row) => {
      const teamIds = state.tables.workItems.teamsOf.get(row.id);
      return teamIds?.includes(teamId) === true ? [{ ...row, teamIds: [...teamIds] }] : [];
    });
  const directory: TransactionalStores['directory'] = {
    ...fixtureDirectory,
    /** Mirrors SQLite's pre-activation type root bridge on this actual Source state; idempotent adds do not remap an existing root. */
    addWorkItemType(toAdd, stamp) {
      const retained = structuredClone(toAdd);
      const existing = [...state.tables.directory.workItemTypes.values()].find(
        (type) => type.name === retained.name,
      );
      if (existing !== undefined) return Promise.resolve({ ...existing });
      const activation = readMemoryOrganizationActivation(
        state.tables.workPackages.creation.activation,
      );
      const legacy = [...state.tables.directory.measureDefinitions.organizations].find(
        ([, organization]) => organization.legacy,
      );
      const pending = fixtureDirectory.addWorkItemType(retained, stamp);
      // Proof: dropping ownership publication made the original complete import fail on actual type ownership (catalogue-import-fault-memory-type-v1).
      if (activation === 'pre_activation' && legacy !== undefined)
        state.tables.directory.organizationOf.set(retained.id, legacy[0]);
      return pending;
    },
    async renameTag(tagId, name, stamp) {
      const written = await fixtureDirectory.renameTag(tagId, name, stamp);
      if (!written.ok) return written;
      // Proof: the coherent capture RED received workPackageIds: [] after the real
      // attached tag rename; source-owned relations must supply its touched work package.
      const workPackageIds = [
        ...new Set(
          [...state.tables.workItems.byId.values()]
            .filter((row) => state.tables.workItems.tagsOf.get(row.id)?.includes(tagId) === true)
            .map((row) => row.workPackageId),
        ),
      ].sort();
      return { ...written, workPackageIds };
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
      // Proof: omitting this cleanup retained the deleted person's membership (space-directory-fault-person-links-v1).
      removeSpaceMemberships('person', personId);
      state.tables.directory.organizationOf.delete(personId);
      cascadeClaims(state.tables.claims, (each) => each.personId === personId);
      // Proof: without the claims' work items here, the memory
      // `directory.removePerson:delegated-claims` case found the worker's work
      // item missing from the removal; watched 2026-10-20.
      const workItemIds = [
        ...new Set([...removed.removal.workItemIds, ...claimed.map((each) => each.workItemId)]),
      ];
      return { ...removed, removal: { ...removed.removal, workItemIds } };
    },
    /** Captures the same full-package usage and current catalogue labels as SQLite, including secondary team membership. */
    async usageOfTeam(teamId) {
      const pending = fixtureDirectory.usageOfTeam(teamId);
      const packageIds = new Set(teamWorkItems(teamId).map((row) => row.workPackageId));
      // Proof: bypassing these reads let both actual usage and removal answer with missing configured values (space-directory-fault-usage-values-v1).
      const steps = [
        ...new Map(
          [...packageIds].flatMap((id) =>
            readMemoryPackageStepsIn(state.tables.stepCatalogue, catalogueContextOf(state), id).map(
              ({ id, name }) => [id, { id, name }] as const,
            ),
          ),
        ).values(),
      ];
      const workItems = [...packageIds].flatMap((id) =>
        readMemoryWorkItemRowsIn(state.tables.workItems, id),
      );
      const rowIds = new Set(workItems.map((row) => row.id));
      const assignments = [...state.tables.directory.assignments.values()].filter((row) =>
        rowIds.has(row.workItemId),
      );
      const personIds = new Set(assignments.map((row) => row.personId));
      const capacityOf = new Map<string, number>();
      for (const id of packageIds) {
        const size = state.tables.capacity.held.get(id)?.get(teamId);
        if (size !== undefined) capacityOf.set(id, size);
      }
      return {
        ...(await pending),
        workItems,
        assignments,
        steps,
        capacityOf,
        workPackages: [...state.tables.workPackages.workPackages.values()]
          .filter((row) => packageIds.has(row.id))
          .map(({ id, name }) => ({ id, name })),
        people: [...state.tables.directory.people.values()].filter((row) => personIds.has(row.id)),
      };
    },
    async removeTeam(teamId, cascade, stamp) {
      const labelled = teamWorkItems(teamId);
      const usage = await directory.usageOfTeam(teamId);
      // Proof: independently omitting member/label consent admitted each unconfirmed removal (space-directory-fault-{member,label}-consent-v1).
      if (!cascade && (labelled.length > 0 || usage.members.length > 0)) {
        return { ok: false, reason: 'in_use', usage };
      }
      const removed = await fixtureDirectory.removeTeam(teamId, cascade, stamp);
      if (!removed.ok) return removed;
      // Proof: omitting this cleanup retained the deleted team's memberships (space-directory-fault-team-links-v1).
      removeSpaceMemberships('team', teamId);
      state.tables.directory.organizationOf.delete(teamId);
      // Proof: omitting this delete attached old service links to a recreated team (space-directory-fault-service-links-v1).
      state.tables.directory.owned.delete(teamId);
      for (const { teamIds, ...row } of labelled) {
        state.tables.workItems.teamsOf.set(
          row.id,
          teamIds.filter((id) => id !== teamId),
        );
        state.tables.workItems.byId.set(row.id, {
          ...row,
          serviceTeamId: row.serviceTeamId === teamId ? null : row.serviceTeamId,
          revision: row.revision + 1,
        });
      }
      // Proof: omitting this delete retained the removed team's pool constraint (space-directory-fault-capacity-links-v1).
      for (const capacities of state.tables.capacity.held.values()) capacities.delete(teamId);
      return {
        ok: true,
        removal: {
          workItemIds: labelled.map((row) => row.id),
          workPackageIds: [...new Set(labelled.map((row) => row.workPackageId))],
        },
      };
    },
    // The fixture's resource answers, with the work packages a demand sits in read
    // off the source's own work items, which the fixture cannot see.
    async patchResource(resourceId, patch, stamp) {
      const written = await fixtureDirectory.patchResource(resourceId, patch, stamp);
      if (!written.ok) return written;
      return {
        ...written,
        workPackageIds: [
          ...new Set([...written.workPackageIds, ...demandWorkPackagesOf(resourceId)]),
        ].sort(),
      };
    },
    async setResourceProvider(resourceId, providerId, organizationId, stamp) {
      const written = await fixtureDirectory.setResourceProvider(
        resourceId,
        providerId,
        organizationId,
        stamp,
      );
      if (!written.ok) return written;
      return {
        ...written,
        workPackageIds: [
          ...new Set([...written.workPackageIds, ...demandWorkPackagesOf(resourceId)]),
        ].sort(),
      };
    },
    // SQLite's twin over the ownership this source keeps: every id not the
    // organization's, an unowned work package included.
    // Proof: with this override removed, the scoped directory capacity write
    // of directory-capacity.test.ts threw `the in-memory directory has
    // no work package ownership` (2 pass, 2 fail); watched 2026-10-25.
    workPackagesOutside(workPackageIds, organizationId) {
      return Promise.resolve(
        workPackageIds.filter(
          (id) =>
            state.tables.organizationLimits.workPackageOrganization.get(id) !== organizationId,
        ),
      );
    },
    // The announce set is SQLite's: the work packages that demand, state or hold
    // the resource, a holder only in the resource's own organization (review S3-1).
    // Proof: with the holders left out, the memory certification's
    // `directory.setDirectoryCapacity:state-clear-remove` read `[]`; watched 2026-11-01.
    async setDirectoryCapacity(resourceId, units, act) {
      const written = await fixtureDirectory.setDirectoryCapacity(resourceId, units, act);
      if (!written.ok) return written;
      const holding = occupyingWorkPackagesOf(resourceId).filter(
        (id) =>
          state.tables.organizationLimits.workPackageOrganization.get(id) ===
          written.organizationId,
      );
      return {
        ...written,
        workPackageIds: [
          ...new Set([...written.workPackageIds, ...demandWorkPackagesOf(resourceId), ...holding]),
        ].sort(),
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
      const workPackageIds = demandWorkPackagesOf(resourceId);
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
      // Read before the cascade takes the occupancy: a work package whose only link
      // is a standing claim's units is told too.
      // Proof: with this left out, `refuses deleting a resource a claim holds,
      // counting it, and cascades on confirmation` (resource-occupancy.db.test.ts)
      // announced no work package on memory; watched 2026-10-20.
      const occupying = occupyingWorkPackagesOf(resourceId);
      cascadeOccupancy(state.tables.claims, resourceId);
      return {
        ok: true,
        removal: {
          ...removed.removal,
          workPackageIds: [
            ...new Set([...removed.removal.workPackageIds, ...workPackageIds, ...occupying]),
          ].sort(),
        },
      };
    },
  };
  /** The work packages whose claims hold units of the resource. */
  const occupyingWorkPackagesOf = (resourceId: string): string[] => {
    const workPackageOfClaim = new Map(
      state.tables.claims.rows.map(({ id, workItemId }) => {
        const workPackageId = state.tables.workItems.byId.get(workItemId)?.workPackageId;
        if (workPackageId === undefined)
          throw new Error(`claim ${id} names absent work item ${workItemId}`);
        return [id, workPackageId] as const;
      }),
    );
    return [
      ...new Set(
        state.tables.claims.occupancy
          .filter((row) => row.resourceId === resourceId)
          .map(({ claimId }) => {
            const workPackageId = workPackageOfClaim.get(claimId);
            if (workPackageId === undefined)
              throw new Error(`occupancy names absent claim ${claimId}`);
            return workPackageId;
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
  /** The work packages whose work items demand the resource. */
  const demandWorkPackagesOf = (resourceId: string): string[] => {
    const workPackageOf = new Map(
      [...state.tables.workItems.byId.values()].map((row) => [row.id, row.workPackageId]),
    );
    return [
      ...new Set(
        [...state.tables.directory.resources.demands.values()]
          .filter((each) => each.resourceId === resourceId)
          .flatMap((each) => {
            const workPackageId = workPackageOf.get(each.workItemId);
            if (workPackageId === undefined)
              throw new Error(`demand names absent work item ${each.workItemId}`);
            return [workPackageId];
          }),
      ),
    ].sort();
  };
  /** A usage's rows for the demanding work packages: their labelled work items and names. */
  const demandRowsOf = async (resourceId: string) => {
    if (workItems === null) throw new Error('work-item table was read before it was bound');
    const bound = workItems;
    const workPackageIds = demandWorkPackagesOf(resourceId);
    const rows = await Promise.all(
      workPackageIds.map((workPackageId) => bound.listByWorkPackage(workPackageId)),
    );
    return {
      assignments: [],
      steps: [],
      people: [],
      members: [],
      claims: [],
      machineCredentials: 0,
      capacityOf: new Map<string, number>(),
      workItems: rows.flat(),
      workPackages: workPackageIds.map((id) => {
        const workPackage = state.tables.workPackages.workPackages.get(id);
        if (workPackage === undefined) throw new Error(`demand names absent work package ${id}`);
        return { id, name: workPackage.name };
      }),
    };
  };
  workItems = inMemoryWorkItems(directory, state.tables.workItems);
  const dependencies = inMemoryDependencies([], state.tables.dependencies, workItems);
  const typedFixture = inMemoryTypedDependencies([], state.tables.typedDependencies);
  const typedDependencies = {
    ...typedFixture,
    // Proof: replacing this projection with [] rejected the real catalogue-only
    // receipt restore (incident-effect-current-step-reader-v1).
    incidents: bindIncidentDependencies(typedFixture.incidents, state, (workPackageId) =>
      readMemoryPackageStepsIn(
        state.tables.stepCatalogue,
        catalogueContextOf(state),
        workPackageId,
      ),
    ),
  };
  // Proof: a separate parallel table let source removal erase the step; mixed rollback tests failed, 2026-10-17.
  const tableSteps = inMemorySteps([], state.tables.steps, state.tables.estimates, {
    table: state.tables.stepParallels,
    workItems,
  });
  // A removed step leaves the work package's own step list too, as SQLite's one
  // `step` table does: the work-item service reads `workPackages.stepsOf`, and a
  // step still listed there after its removal let a replay restore rows onto it.
  // Proof: with this removal skipped, `refuses an undo of a delete once a step
  // its claims and progress name was removed` (resource-occupancy.db.test.ts)
  // answered the undo ok on memory; watched 2026-10-20.
  const steps: typeof tableSteps = {
    ...tableSteps,
    async listByWorkPackage(workPackageId) {
      return await Promise.resolve(
        readMemoryPackageStepsIn(
          state.tables.stepCatalogue,
          catalogueContextOf(state),
          workPackageId,
        ),
      );
    },
    async remove(workPackageId, stepId, cascade, stamp) {
      const removed = await tableSteps.remove(workPackageId, stepId, cascade, stamp);
      if (removed.ok) {
        const listed = state.tables.workPackages.steps.get(workPackageId);
        if (listed !== undefined)
          state.tables.workPackages.steps.set(
            workPackageId,
            listed.filter(({ id }) => id !== stepId),
          );
      }
      return removed;
    },
  };
  const tableWorkPackages = inMemoryWorkPackages(users, state.tables.workPackages, {
    users: state.tables.users.byId,
    organizations: state.tables.directory.measureDefinitions.organizations,
    memberships: state.tables.directory.organizationMembers,
    ownership: state.tables.organizationLimits.workPackageOrganization,
  });
  const workPackages: WorkPackageStore = {
    ...tableWorkPackages,
    /** Current per-package unit write over the actual state owned by this composition. */
    async setStepUnit(workPackageId, stepId, unit, _stamp): Promise<StepUnitWritten> {
      const selected = readMemoryPackageStepsIn(
        state.tables.stepCatalogue,
        catalogueContextOf(state),
        workPackageId,
      ).find((entry) => entry.id === stepId);
      if (selected === undefined) return await Promise.resolve({ ok: false, reason: 'not_found' });
      const values = state.tables.stepCatalogue.packageValues.get(workPackageId);
      const held = values?.get(stepId);
      if (values === undefined || held === undefined)
        throw new WorkPackageStepMissing(workPackageId, stepId);
      const before = readPackageStepValues(held, workPackageId, stepId);
      if (before.estimateUnit === unit) return await Promise.resolve({ ok: true, step: selected });
      const holdings = state.tables.estimates.rows.filter(
        (row) =>
          row.stepId === stepId &&
          state.tables.workItems.byId.get(row.workItemId)?.workPackageId === workPackageId,
      ).length;
      if (holdings > 0)
        return await Promise.resolve({ ok: false, reason: 'estimates_present', count: holdings });
      const owner = state.tables.workPackages.workPackages.get(workPackageId);
      if (owner === undefined) throw new Error('unit package vanished inside its Source turn');
      const written = { ...held, estimateUnit: unit };
      const after = readPackageStepValues(written, workPackageId, stepId);
      values.set(stepId, written);
      state.tables.workPackages.workPackages.set(workPackageId, {
        ...owner,
        revision: owner.revision + 1,
      });
      return await Promise.resolve({
        ok: true,
        step: { ...selected, estimateUnit: after.estimateUnit },
      });
    },
    /** Synchronous under the actual Source turn: update only explicit package values and its revision. */
    async setStepAllowance(workPackageId, stepId, allowancePercent, _stamp) {
      const selected = readMemoryPackageStepsIn(
        state.tables.stepCatalogue,
        catalogueContextOf(state),
        workPackageId,
      ).find((entry) => entry.id === stepId);
      if (selected === undefined) return await Promise.resolve({ ok: false, reason: 'not_found' });
      const values = state.tables.stepCatalogue.packageValues.get(workPackageId);
      const held = values?.get(stepId);
      if (values === undefined || held === undefined)
        throw new WorkPackageStepMissing(workPackageId, stepId);
      const before = readPackageStepValues(held, workPackageId, stepId);
      const allowanceBps = allowanceHundredthsOf(allowancePercent);
      const written = { ...held, allowanceBps, allowanceRevision: before.allowanceRevision + 1 };
      const after = readPackageStepValues(written, workPackageId, stepId);
      const owner = state.tables.workPackages.workPackages.get(workPackageId);
      if (owner === undefined) throw new Error('allowance package vanished inside its Source turn');
      values.set(stepId, written);
      state.tables.workPackages.workPackages.set(workPackageId, {
        ...owner,
        revision: owner.revision + 1,
      });
      return await Promise.resolve({
        ok: true,
        step: { ...selected, allowancePercent: after.allowancePercent },
        previousPercent: before.allowancePercent,
        revision: after.allowanceRevision,
      });
    },
    /** Current package members only; retained unbound rows cannot make a stale journal replayable. */
    async stepAllowanceRevisions(workPackageId) {
      const selected = readMemoryPackageStepsIn(
        state.tables.stepCatalogue,
        catalogueContextOf(state),
        workPackageId,
      );
      return await Promise.resolve(
        new Map(
          selected.map((entry) => {
            const row = state.tables.stepCatalogue.packageValues.get(workPackageId)?.get(entry.id);
            if (row === undefined) throw new WorkPackageStepMissing(workPackageId, entry.id);
            return [
              entry.id,
              readPackageStepValues(row, workPackageId, entry.id).allowanceRevision,
            ];
          }),
        ),
      );
    },
    async stepsOf(workPackageId) {
      return await Promise.resolve(
        readMemoryPackageStepsIn(
          state.tables.stepCatalogue,
          catalogueContextOf(state),
          workPackageId,
        ),
      );
    },
  };
  const estimates = inMemoryEstimates(
    workItems,
    {
      catalogue: state.tables.stepCatalogue,
      scope: catalogueContextOf(state),
      workItems: state.tables.workItems,
    },
    state.tables.estimates,
  );
  const actuals = ownMemoryActualReads(
    inMemoryActuals(
      workItems,
      {
        catalogue: state.tables.stepCatalogue,
        scope: catalogueContextOf(state),
        workItems: state.tables.workItems,
      },
      state.tables.actuals,
    ),
    state.tables.actuals,
    () => ({
      catalogue: state.tables.stepCatalogue,
      scope: catalogueContextOf(state),
      workItems: state.tables.workItems,
    }),
  );
  // The memory twin of `work_package_organization` joined to `measure`: the
  // owning organization's definitions, or none for an unowned work package.
  const measures = ownMemoryMeasureReads(
    inMemoryMeasures(
      workItems,
      {
        ...{
          catalogue: state.tables.stepCatalogue,
          scope: catalogueContextOf(state),
          workItems: state.tables.workItems,
        },
        measureDefinitions: state.tables.directory.measureDefinitions,
      },
      state.tables.measures,
      (workPackageId) => definitionsOfWorkPackage(measureOwnership, workPackageId),
      state.tables.measureEstimates,
    ),
    state.tables.measures,
    () => ({
      catalogue: state.tables.stepCatalogue,
      scope: catalogueContextOf(state),
      workItems: state.tables.workItems,
      measureDefinitions: state.tables.directory.measureDefinitions,
    }),
  );
  const measureEstimates = ownMemoryMeasureEstimateReads(
    inMemoryMeasureEstimates(
      workItems,
      state.tables.measures,
      state.tables.measureEstimates,
      steps,
      (workPackageId) => definitionsOfWorkPackage(measureOwnership, workPackageId),
    ),
    state.tables.measureEstimates,
    state.tables.measures,
    () => ({
      catalogue: state.tables.stepCatalogue,
      scope: catalogueContextOf(state),
      workItems: state.tables.workItems,
      measureDefinitions: state.tables.directory.measureDefinitions,
    }),
  );
  const progress = ownMemoryProgressReads(
    inMemoryProgress(
      workItems,
      {
        catalogue: state.tables.stepCatalogue,
        scope: catalogueContextOf(state),
        workItems: state.tables.workItems,
      },
      state.tables.progress,
    ),
    state.tables.progress,
    () => ({
      catalogue: state.tables.stepCatalogue,
      scope: catalogueContextOf(state),
      workItems: state.tables.workItems,
    }),
  );
  const attempts = ownMemoryAttemptReads(
    inMemoryAttempts(workItems, state.tables.attempts, steps, progress),
    state.tables.attempts,
    () => ({
      catalogue: state.tables.stepCatalogue,
      scope: catalogueContextOf(state),
      workItems: state.tables.workItems,
      measureDefinitions: state.tables.directory.measureDefinitions,
    }),
  );
  const sparseContext = {
    catalogue: state.tables.stepCatalogue,
    scope: catalogueContextOf(state),
    workItems: state.tables.workItems,
  };
  const blockages = createCurrentBlockageStore(sparseContext, state.tables.blockages);
  const stepParallels = createCurrentParallelStore(sparseContext, state.tables.stepParallels);
  const rowsOnlyWorkItems = workItems;
  workItems = {
    ...rowsOnlyWorkItems,
    async resolveStepOrders(workPackageId, projection) {
      const retained = structuredClone(projection);
      const captured = readMemoryStepOrderProjectionIn(sparseContext, workPackageId, retained);
      return await Promise.resolve(captured);
    },
    listTreeByWorkPackage(workPackageId) {
      const rows = readMemoryWorkItemRowsIn(state.tables.workItems, workPackageId);
      return Promise.resolve(
        structuredClone(readMemoryTreeRowsIn(sparseContext, workPackageId, rows)),
      );
    },
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
  const settings = inMemorySettings(state.tables.settings, {
    organizationExists: (id) => state.tables.directory.measureDefinitions.organizations.has(id),
    readSpace: (id) => state.tables.spaces.get(id) ?? null,
    readProject: (id) => state.tables.workPackages.creation.projects.get(id) ?? null,
    readPackage: (id) => {
      const row = state.tables.workPackages.workPackages.get(id);
      return row === undefined
        ? null
        : {
            projectId: row.projectId,
            restricted: row.restricted,
            organizationId: state.tables.organizationLimits.workPackageOrganization.get(id) ?? null,
          };
    },
    packageIds: () => [...state.tables.workPackages.workPackages.keys()],
    touchPackage: (id, _stamp) => {
      const row = state.tables.workPackages.workPackages.get(id);
      if (row === undefined) throw new Error('settings descendant package is absent');
      state.tables.workPackages.workPackages.set(id, { ...row, revision: row.revision + 1 });
      return {
        workPackageId: id,
        event: {
          type: 'work_package_settings_changed',
          optimizationEnabled: row.optimizationEnabled,
          scheduleEngine: row.scheduleEngine,
          scheduleObjective: row.scheduleObjective,
        },
      };
    },
    readMarkers: () =>
      [...state.tables.calendarMarkers.held.values()].map(({ scope, ...marker }) => ({
        scope,
        marker,
      })),
  });
  const capacity = inMemoryCapacity({}, state.tables.capacity);
  const priorityBands = inMemoryPriorityBands({}, state.tables.priorityBands);
  const stores: TransactionalStores & { readonly spaces: SpaceStore } = {
    spaces: inMemorySpaces({
      spaces: state.tables.spaces,
      settings: state.tables.settings,
      markers: state.tables.calendarMarkers,
      projects: state.tables.workPackages.creation.projects,
      personOrganization: {
        // Proof: replacing the kind predicate by true admitted a team as a person (space-membership-fault-person-kind-v1).
        get: (id) =>
          state.tables.directory.people.has(id)
            ? state.tables.directory.organizationOf.get(id)
            : undefined,
      },
      teamOrganization: {
        // Proof: replacing the kind predicate by true admitted a person as a team (space-membership-fault-team-kind-v1).
        get: (id) =>
          state.tables.directory.teams.has(id)
            ? state.tables.directory.organizationOf.get(id)
            : undefined,
      },
      people: state.tables.spacePeople,
      teams: state.tables.spaceTeams,
      organizations: state.tables.directory.measureDefinitions.organizations,
    }),
    settings,
    runtimeCommands: inMemoryRuntimeCommands(state.tables.runtime),
    users,
    workPackages,
    directory,
    steps,
    stepCatalogue: inMemoryStepCatalogue(state.tables.stepCatalogue, catalogueContextOf(state)),
    workItems,
    estimates,
    actuals,
    measures,
    measureEstimates,
    budgets: inMemoryBudgets(workItems, state.tables.budgets, (workPackageId) =>
      definitionsOfWorkPackage(measureOwnership, workPackageId),
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
      {
        workPackages: state.tables.workPackages,
        workItems: state.tables.workItems,
        people: state.tables.directory.people,
        workPackageOrganization: state.tables.organizationLimits.workPackageOrganization,
        resourceOrganization: state.tables.directory.organizationOf,
      },
      (workPackageId, claims) =>
        readMemoryClaimStepsIn(
          {
            catalogue: state.tables.stepCatalogue,
            scope: catalogueContextOf(state),
            workItems: state.tables.workItems,
          },
          workPackageId,
          claims,
        ),
      (...args) => Promise.resolve(mayReadMemoryWorkPackage(state, ...args)),
    ),
    dependencies,
    typedDependencies,
    externalDependencyAuthoring: INACTIVE_EXTERNAL_DEPENDENCIES,
    capacity: {
      ...capacity,
      /** Both references are decided on this actual writer, including a null clear. */
      set(workPackageId, serviceTeamId, size, stamp) {
        // Proof: omitting this check admitted absent/project addresses in actual
        // public and borrowed Source writes (memory-configuration-fault-capacity-package-v1).
        if (!state.tables.workPackages.workPackages.has(workPackageId))
          return Promise.resolve({ ok: false, reason: 'not_found' });
        // Proof: omitting this check admitted an absent team in both owners and
        // after its real removal before queued admission (memory-configuration-fault-capacity-team-v1).
        if (!state.tables.directory.teams.has(serviceTeamId))
          return Promise.resolve({ ok: false, reason: 'not_found' });
        return capacity.set(workPackageId, serviceTeamId, size, stamp);
      },
    },
    resourceCapacity: inMemoryResourceCapacity(state.tables.directory.resources, (workPackageId) =>
      Promise.resolve(state.tables.workPackages.workPackages.has(workPackageId)),
    ),
    demands,
    priorityBands: {
      ...priorityBands,
      /** A project address cannot stand in for the actual package whose ladder is replaced. */
      replace(workPackageId, bands, stamp) {
        // Proof: omitting this check accepted absent/project addresses through
        // actual public and borrowed Source owners (memory-configuration-fault-priority-package-v1).
        if (!state.tables.workPackages.workPackages.has(workPackageId))
          return Promise.resolve({ ok: false, reason: 'not_found' });
        return priorityBands.replace(workPackageId, bands, stamp);
      },
    },
    calendarMarkers: {
      ...inMemoryCalendarMarkers([], state.tables.calendarMarkers),
      async listFor(id) {
        const target = await settings.readTarget({ level: 'work_package', id }, null);
        if (target === null) return [];
        return resolveSetting(target.chain, 'calendarMarkers', await settings.capture(target)).map(
          ({ marker }) => ({ ...marker, workPackageId: id }),
        );
      },
    },
    planEvents: inMemoryPlanEvents([], { held: state.tables.journal.events }),
    eventLog: inMemoryEventLog(state.tables.eventLog),
    journal: inMemoryCommandJournal(state.tables.journal, (journalEventIds) => {
      // Proof: omitting this forwarding failed `runs every Task 5.1 journal case`
      // when the expected late rollback case did not pass (2026-10-16).
      lateWrite.reach('journal-history-insert', { journalEventIds });
    }),
    subtrees: {
      async inspectFirstChild(write, stamp) {
        const kept = retainFirstChildWrite(write, stamp);
        return await Promise.resolve(
          applyMemoryFirstChildIn(state, catalogueContextOf(state), kept.write, 'inspect'),
        );
      },
      writeMove() {
        return Promise.reject(new Error('owned move requires the actual Memory Source stage'));
      },
      writeFirstChild: async (write, stamp) =>
        await Promise.resolve(writeMemoryFirstChild(state, write, stamp)),
      ...inMemorySubtrees(
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
    },
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

/**
 * Actual Source-only method stage. Retained inputs precede any queue/yield; a
 * fresh clone is captured AFTER that suspension and transformed synchronously.
 * Existing Source/loan assertions fence entry, publication and exposed return.
 */
export function createMemorySubtreeStore(
  state: MemoryState,
  assertActive: () => void,
  lateWrite: MemoryLateWriteSeam,
): SubtreeStore {
  return {
    async inspectFirstChild(write, stamp) {
      const kept = retainFirstChildWrite(write, stamp);
      assertActive();
      const decision = applyMemoryFirstChildIn(
        state,
        catalogueContextOf(state),
        kept.write,
        'inspect',
      );
      await Promise.resolve();
      assertActive();
      return decision;
    },
    async writeMove(write, stamp): Promise<MoveWriteOutcome> {
      const kept = retainMoveWrite(write, stamp);
      assertActive();
      return await Promise.resolve().then(() => {
        assertActive();
        // Proof: using the live loan instead failed the late-fault same-writer comparison after destination clears and the row move.
        const prepared = state.clone();
        const written = applyMemoryMoveIn(prepared, catalogueContextOf(prepared), kept.write);
        if (written.kind !== 'written') return written;
        lateWrite.reach('move-final-row');
        assertActive();
        state.replaceWith(prepared);
        return written;
      });
    },
    writeFirstChild(write, stamp): Promise<FirstChildWriteOutcome> {
      const kept = retainFirstChildWrite(write, stamp);
      assertActive();
      return Promise.resolve().then(() => {
        assertActive();
        const prepared = state.clone();
        const written = applyMemoryFirstChildIn(prepared, catalogueContextOf(prepared), kept.write);
        if (written.kind !== 'written') return written;
        assertActive();
        state.replaceWith(prepared);
        return written;
      });
    },
    insertSubtree(copy, stamp): Promise<SubtreeWriteOutcome> {
      const kept = retainSubtreeWrite(copy, stamp);
      assertActive();
      return Promise.resolve().then<SubtreeWriteOutcome>(() => {
        assertActive();
        const prepared = state.clone();
        const outcome = applyMemorySubtreeIn(
          prepared,
          {
            catalogue: prepared.tables.stepCatalogue,
            scope: catalogueContextOf(prepared),
            workItems: prepared.tables.workItems,
          },
          kept.copy,
        );
        // Proof: MEM_LOCAL omitted this return; borrowed-subtree-refusal-keeps-commit kept its refusal but leaked the candidate row after COMMIT (0/1/28); exact restoration passed 1/0/34, 2026-11-18.
        // Proof: BULK_MEM_LOCAL_POINT omitted only this local rollback dependency.
        // The modeled refusal still passed after the unrelated actual outer COMMIT;
        // the next graph equality exposed the added restored row. Restoration passed.
        if (outcome !== 'written') return outcome;
        const satelliteKeys = kept.copy.estimates.map(
          ({ workItemId, stepId }) => workItemId + ':' + stepId,
        );
        lateWrite.reach('subtree-final-satellite', { satelliteKeys });
        assertActive();
        state.replaceWith(prepared);
        return outcome;
      });
    },
  };
}

/** Raw fixture state transformation; actual Source wrappers supply their own queue and lifetime fences. */
function writeMemoryFirstChild(
  state: MemoryState,
  write: FirstChildWrite,
  stamp: WriteStamp,
): FirstChildWriteOutcome {
  const kept = retainFirstChildWrite(write, stamp);
  const prepared = state.clone();
  const written = applyMemoryFirstChildIn(prepared, catalogueContextOf(prepared), kept.write);
  if (written.kind === 'written') state.replaceWith(prepared);
  return written;
}
