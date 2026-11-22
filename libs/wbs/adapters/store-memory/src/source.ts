import type { EstimateStore } from '@wbs/core';
import type {
  JournalEntry,
  OrganizationLimitGauge,
  PackageStepRecord,
  PlanEvent,
  PlanInputReads,
  Project,
  SavedPlanHoldingRow,
  SavedPlanRow,
  SavedPlanStore,
  SavedPlanWrite,
  SavedPlanWriteOutcome,
  ScopedSavedPlanWrite,
  Source,
  StoredActual,
  StoredDependency,
  StoredEstimate,
  StoredMeasure,
  StoredProgress,
  StoredSavedPlan,
  StoredSavedPlanBytes,
  TransactionalStores,
  UnitOfWork,
} from '@wbs/core';
import type { CapturedScheduler, LivePlanExportRead, ResourceAccess } from '@wbs/core';
import { guardSpaceStore, guardTreeReads } from '@wbs/core';
import { retainPackageUnitWrites } from '@wbs/core';
import { guardClaimObservation } from '@wbs/core';
import { retainMoveWrite } from '@wbs/core';
import { retainFirstChildWrite } from '@wbs/core';
import {
  guardAttemptReads,
  guardMeasureEstimateReads,
  guardMeasureReads,
  guardSparseStepReads,
} from '@wbs/core';
import { guardSubtreeWrites, retainSubtreeWrite } from '@wbs/core';
import {
  captureLocalTypedDependency,
  guardEstimateReads,
  guardStepCatalogue,
  guardStepFactReads,
} from '@wbs/core';
import {
  type AccessGrantRecord,
  type OrganizationAuditRecord,
  retainWorkPackageCreation,
} from '@wbs/core';
import { previewCapacity } from '@wbs/core/module/work-item/capacity-preview';
import { readResourceOccupancy } from '@wbs/core/module/work-item/resource-occupancy';
import type { ResourceOccupancyStore } from '@wbs/core/ports/chain-snapshot-store';
import type { PlanExportReader } from '@wbs/core/ports/plan-export-reader';
import {
  type LegacySavedPlanTouch,
  retainSavedPlanTouch,
  type SavedPlanTouchMutation,
  type SavedPlanTouchOutcome,
} from '@wbs/core/ports/saved-plan-store';
import type { WorkPackageReportSnapshot } from '@wbs/core/ports/work-package-report-store';
import { readSharedPeople } from '@wbs/core/service/shared-people';
import type { OrganizationLimitValues } from '@wbs/domain';
import {
  type AccessObjectKind,
  captureLeafStepOrders,
  type ResolvedPlanInputReads,
} from '@wbs/domain';
import { scheduleResourceIdsOf } from '@wbs/domain';

import { type CaptureReadSeam, inertMemoryCaptureReadSeam } from './capture-read-seam';
import { endMemoryLeases } from './claim-fixture';
import { inertMemoryLateWriteSeam, type MemoryLateWriteSeam } from './late-write-seam';
import { seedMemoryOrganization } from './measure-definition-fixture';
import { createMemorySubtreeStore } from './memory-stores';
import {
  bindStores,
  createLegacyMemoryPackageBirthIn,
  createMemoryPackageBirthIn,
  createMemoryPackageWithStepsIn,
  MemoryState,
  replaceMap,
} from './memory-stores';
import {
  checkedOrganizationLimits,
  inMemoryOrganizationLimitGauge,
} from './organization-limits-fixture';
import { readMemoryOrganizationActivation } from './package-creation-fixture';
import type { MemoryStepDefinition } from './step-catalogue';
import { type MemoryStepAlias, readMemoryStepIdentityIn } from './step-identity';
import {
  mayReadMemoryWorkPackage,
  memoryDirectoryRead,
  memoryExportReadable,
} from './work-package-visibility';

export { MemoryState } from './memory-stores';

class MemoryCoordinator {
  private turn = Promise.resolve();

  async run<T>(act: () => Promise<T>): Promise<T> {
    const prior = this.turn;
    let release = (): void => undefined;
    this.turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    try {
      return await act();
    } finally {
      release();
    }
  }
}

function coordinatedStore<T extends object>(
  store: T,
  writes: readonly PropertyKey[],
  coordinator: MemoryCoordinator,
): T {
  const guarded = new Set(writes);
  return new Proxy(store, {
    get(target, key, receiver) {
      const member: unknown = Reflect.get(target, key, receiver);
      if (typeof member !== 'function') return member;
      const invoke = (...args: unknown[]): unknown => {
        const outcome: unknown = Reflect.apply(member, target, args);
        return outcome;
      };
      if (!guarded.has(key)) return invoke;
      return (...args: unknown[]) =>
        coordinator.run(async () => await Promise.resolve(invoke(...args)));
    },
  });
}

/** Captures this value-only request before the public coordinator queues it; no capability-bearing store arguments are cloned. */
function retainEstimateWrites(store: EstimateStore): EstimateStore {
  return {
    readTarget: (workItemId, stepId) => store.readTarget(workItemId, stepId),
    listByWorkPackage: (workPackageId) => store.listByWorkPackage(workPackageId),
    listByWorkItems: (workPackageId, ids) => store.listByWorkItems(workPackageId, ids),
    listPlacements: (workPackageId, ids) => store.listPlacements(workPackageId, ids),
    async set(value, stamp) {
      const retained = structuredClone(value),
        act = { ...stamp };
      return await store.set(retained, act);
    },
    remove: (workItemId, stepId, stamp) => store.remove(workItemId, stepId, stamp),
    moveAll: (fromWorkItemId, toWorkItemId, stamp) =>
      store.moveAll(fromWorkItemId, toWorkItemId, stamp),
  };
}

type PointStores = Pick<TransactionalStores, 'actuals' | 'progress' | 'measures'>;

/**
 * Retains only the point value and its stamp, before this boundary can suspend.
 * The required callback is the existing Source or loan assertion. Public writes
 * bind this boundary outside the coordinator for caller retention and inside it
 * for admission when the turn starts; loans bind their own active lifetime.
 * The factory completes applicability and mutation synchronously before returning
 * its promise. Admission therefore belongs at entry, not after settlement: a
 * later Source close does not cancel or roll back an already admitted write.
 * Other methods delegate with the original receiver and retain their existing
 * ownership rules.
 */
function ownPointWrites(stores: PointStores, assertOpen: () => void): PointStores {
  return {
    actuals: {
      listByWorkPackage: (workPackageId) => stores.actuals.listByWorkPackage(workPackageId),
      listByWorkItems: (workPackageId, ids) => stores.actuals.listByWorkItems(workPackageId, ids),
      listPlacements: (workPackageId, ids) => stores.actuals.listPlacements(workPackageId, ids),
      async set(value, stamp) {
        assertOpen();
        const retained = structuredClone(value),
          act = { ...stamp };
        return await stores.actuals.set(retained, act);
      },
      remove: (workItemId, stepId, stamp) => stores.actuals.remove(workItemId, stepId, stamp),
      moveAll: (fromWorkItemId, toWorkItemId, stamp) =>
        stores.actuals.moveAll(fromWorkItemId, toWorkItemId, stamp),
    },
    progress: {
      listByWorkPackage: (workPackageId) => stores.progress.listByWorkPackage(workPackageId),
      listByWorkItems: (workPackageId, ids) => stores.progress.listByWorkItems(workPackageId, ids),
      listPlacements: (workPackageId, ids) => stores.progress.listPlacements(workPackageId, ids),
      async set(value, stamp) {
        assertOpen();
        const retained = structuredClone(value),
          act = { ...stamp };
        return await stores.progress.set(retained, act);
      },
      remove: (workItemId, stepId, stamp) => stores.progress.remove(workItemId, stepId, stamp),
      moveAll: (fromWorkItemId, toWorkItemId, stamp) =>
        stores.progress.moveAll(fromWorkItemId, toWorkItemId, stamp),
    },
    measures: {
      listByWorkPackage: (workPackageId) => stores.measures.listByWorkPackage(workPackageId),
      listByWorkItems: (workPackageId, ids) => stores.measures.listByWorkItems(workPackageId, ids),
      listPlacements: (workPackageId, ids) => stores.measures.listPlacements(workPackageId, ids),
      definitionsFor: (workPackageId) => stores.measures.definitionsFor(workPackageId),
      async set(value, stamp) {
        assertOpen();
        const retained = structuredClone(value),
          act = { ...stamp };
        return await stores.measures.set(retained, act);
      },
      remove: (workItemId, stepId, metric, stamp) =>
        stores.measures.remove(workItemId, stepId, metric, stamp),
      moveAll: (fromWorkItemId, toWorkItemId, stamp) =>
        stores.measures.moveAll(fromWorkItemId, toWorkItemId, stamp),
    },
  };
}

function coordinatedStores(
  stores: ReturnType<typeof bindStores>,
  coordinator: MemoryCoordinator,
): TransactionalStores {
  return {
    stepCatalogue: stores.stepCatalogue,
    settings: coordinatedStore(stores.settings, ['write', 'touchPackages'], coordinator),
    spaces: coordinatedStore(
      stores.spaces,
      [
        'create',
        'rename',
        'remove',
        'addProject',
        'removeProject',
        'moveProject',
        'addPerson',
        'removePerson',
        'addTeam',
        'removeTeam',
      ],
      coordinator,
    ),
    externalDependencyAuthoring: stores.externalDependencyAuthoring,
    runtimeCommands: coordinatedStore(
      stores.runtimeCommands,
      ['compareAuthority', 'insertBinding', 'insertAcceptance'],
      coordinator,
    ),
    users: coordinatedStore(stores.users, ['create', 'resolveOidcIdentity'], coordinator),
    workPackages: {
      ...coordinatedStore(
        stores.workPackages,
        ['recordOpen', 'update', 'setStepAllowance', 'setStepUnit'],
        coordinator,
      ),
      async create(workPackage, steps, stamp) {
        const retained = structuredClone({ workPackage, steps: [...steps], stamp });
        return await coordinator.run(() =>
          stores.workPackages.create(retained.workPackage, retained.steps, retained.stamp),
        );
      },
      async createInOrganization(workPackage, steps, stamp, organizationId, creatorGrant) {
        const retained = retainWorkPackageCreation(
          workPackage,
          steps,
          stamp,
          organizationId,
          creatorGrant,
        );
        return await coordinator.run(() =>
          stores.workPackages.createInOrganization(
            retained.workPackage,
            retained.steps,
            retained.stamp,
            retained.organizationId,
            retained.creatorGrant,
          ),
        );
      },
    },
    directory: coordinatedStore(
      stores.directory,
      [
        'addTag',
        'renameTag',
        'removeTag',
        'addWorkItemType',
        'addExternalSystem',
        'renameWorkItemType',
        'removeWorkItemType',
        'addService',
        'renameService',
        'removeService',
        'addTeam',
        'patchTeam',
        'addPerson',
        'patchPerson',
        'removePerson',
        'removeTeam',
        'assign',
        'addResource',
        'patchResource',
        'setResourceProvider',
        'setDirectoryCapacity',
        'removeResource',
      ],
      coordinator,
    ),
    capacity: coordinatedStore(stores.capacity, ['set'], coordinator),
    resourceCapacity: coordinatedStore(stores.resourceCapacity, ['set'], coordinator),
    priorityBands: coordinatedStore(stores.priorityBands, ['replace'], coordinator),
    calendarMarkers: coordinatedStore(
      stores.calendarMarkers,
      ['create', 'rename', 'recolor', 'remove'],
      coordinator,
    ),
    eventLog: coordinatedStore(stores.eventLog, ['recordEvent', 'pruneBeyond'], coordinator),
    planEvents: coordinatedStore(stores.planEvents, ['pruneOlderThan'], coordinator),
    steps: coordinatedStore(stores.steps, ['add', 'rename', 'patchUnit', 'remove'], coordinator),
    workItems: coordinatedStore(
      stores.workItems,
      ['insert', 'patch', 'move', 'setPositions', 'setFrozenNumbers', 'remove'],
      coordinator,
    ),
    estimates: coordinatedStore(stores.estimates, ['set', 'remove', 'moveAll'], coordinator),
    actuals: coordinatedStore(stores.actuals, ['set', 'remove', 'moveAll'], coordinator),
    measures: coordinatedStore(stores.measures, ['set', 'remove', 'moveAll'], coordinator),
    measureEstimates: coordinatedStore(
      stores.measureEstimates,
      ['set', 'remove', 'moveAll'],
      coordinator,
    ),
    budgets: coordinatedStore(stores.budgets, ['set', 'remove'], coordinator),
    progress: coordinatedStore(stores.progress, ['set', 'remove', 'moveAll'], coordinator),
    attempts: coordinatedStore(
      stores.attempts,
      ['start', 'end', 'remove', 'restore', 'raiseIssued', 'moveAll'],
      coordinator,
    ),
    blockages: coordinatedStore(stores.blockages, ['set', 'remove', 'moveAll'], coordinator),
    stepParallels: coordinatedStore(stores.stepParallels, ['set', 'remove'], coordinator),
    claims: coordinatedStore(stores.claims, ['add', 'remove'], coordinator),
    demands: coordinatedStore(stores.demands, ['set'], coordinator),
    dependencies: coordinatedStore(
      stores.dependencies,
      ['add', 'remove', 'removeAllFor'],
      coordinator,
    ),
    typedDependencies: coordinatedStore(
      {
        ...stores.typedDependencies,
        incidents: coordinatedStore(
          stores.typedDependencies.incidents,
          ['detach', 'restore'],
          coordinator,
        ),
      },
      ['add', 'update', 'remove', 'removeAllFor'],
      coordinator,
    ),
    subtrees: coordinatedStore(stores.subtrees, ['insertSubtree', 'writeFirstChild'], coordinator),
    journal: coordinatedStore(
      stores.journal,
      ['append', 'flip', 'restamp', 'discard'],
      coordinator,
    ),
  };
}

/** Concrete Source-owned export capability; generic Source/history capabilities remain unchanged. */
export interface MemorySource extends Source<TransactionalStores> {
  createPlanExports(scheduler: CapturedScheduler): PlanExportReader;
}

/** Opens a staged in-memory source with no ambient runtime dependencies. */
export function openMemorySource(): MemorySource {
  return openMemorySourceWithSeams(inertMemoryLateWriteSeam, inertMemoryCaptureReadSeam).source;
}

/**
 * Conformance-only source fixture with a reader for the journal's own history table.
 *
 * @internal
 */
export interface MemorySourceFixture {
  /** One-way modeled activation under both actual source write owners. */
  activateOrganizationIsolation(): Promise<void>;
  /** Seeds an actual parent row used by the staged package creation owner. */
  seedPackageParent(project: Project): void;
  /** Current Source membership rows for creation controls, without a synthetic permission decision. */
  setPackageCreationMembers(organizationId: string, userIds: readonly string[]): void;
  /** Detached actual committed tables and raw fact/value rows for catalogue conformance; not a public runtime port. */
  stepCatalogueEvidence(): {
    readonly snapshot: unknown;
    readonly tuples: ReturnType<typeof readMemoryTupleEvidence>;
    readonly estimates: readonly StoredEstimate[];
    readonly actuals: readonly Readonly<Record<keyof StoredActual, unknown>>[];
    readonly progress: readonly Readonly<Record<keyof StoredProgress, unknown>>[];
    readonly packageValues: readonly PackageStepRecord[];
  };
  /**
   * Removes one actual committed explicit-value set for a bounded corruption
   * control and returns its original row count. This is fixture-only storage
   * access, not a current authoring operation. Closed Source or absent set throws.
   */
  removePackageStepValues(workPackageId: string): number;
  /** Fixture-only physical identity row injection, detached from caller input; restore before releasing this Source. */
  injectStepAlias(alias: MemoryStepAlias): () => void;
  /** Fixture-only raw physical definition injection; supplies no migration provenance or authoring authority. Restore before releasing the Source. */
  injectStepDefinition(id: string, definition: MemoryStepDefinition): () => void;
  /** Exact existing point-field corruption for read controls, with an explicit restoration owner; no public authoring authority. */
  corruptStepFact(
    corruption:
      | {
          readonly kind: 'estimate_field';
          readonly workItemId: string;
          readonly stepId: string;
          readonly column: keyof StoredEstimate;
          readonly value: unknown;
        }
      | {
          readonly kind: 'actual_field';
          readonly workItemId: string;
          readonly stepId: string;
          readonly column: keyof StoredActual;
          readonly value: unknown;
        }
      | {
          readonly kind: 'progress_field';
          readonly workItemId: string;
          readonly stepId: string;
          readonly column: keyof StoredProgress;
          readonly value: unknown;
        }
      | {
          readonly kind: 'measure_field';
          readonly workItemId: string;
          readonly stepId: string;
          readonly column: keyof StoredMeasure;
          readonly value: unknown;
        }
      | {
          readonly kind: 'actual_days';
          readonly workItemId: string;
          readonly stepId: string;
          readonly value: number;
        }
      | {
          readonly kind: 'progress_time';
          readonly workItemId: string;
          readonly stepId: string;
          readonly value: string;
        }
      | {
          readonly kind: 'actual_step';
          readonly workItemId: string;
          readonly stepId: string;
          readonly value: string;
        }
      | {
          readonly kind: 'progress_step';
          readonly workItemId: string;
          readonly stepId: string;
          readonly value: string;
        },
  ): () => void;
  /** Detached actual grant/audit state owned by this Source. */
  packageCreationEvidence(): {
    grants: readonly AccessGrantRecord[];
    audits: readonly OrganizationAuditRecord[];
  };
  /** Seeds exact persisted grants for export subject/catalog controls, without supplying a permission answer. */
  seedPackageExportGrant(grant: AccessGrantRecord): void;
  /** Removes one actual persisted grant; unknown identities throw. */
  removePackageExportGrant(id: string): void;
  /** Models corruption of an existing finite catalogue kind. */
  replacePackageExportRoleKind(id: string, kind: AccessObjectKind): void;
  /** Changes the actual named parent metadata for capture-coherence controls. */
  renamePackageExportParent(id: string, name: string): void;
  /** Removes one actual existing parent only for corrupt trusted capture-state controls. */
  removePackageCaptureParent(id: string): void;
  /** Replaces an actual existing parent row only for capture correspondence controls. */
  replacePackageCaptureParent(parent: Project): void;
  /** Models a missing trusted built-in creation role. */
  removePackageCreationRole(): void;
  /** Seeds an actual persisted event for a late duplicate audit write control. */
  seedPackageCreationAudit(audit: OrganizationAuditRecord): void;
  readonly source: MemorySource;
  /** Runs capture and directory writes in one forbidden staged owner, then rolls it back. */
  captureWithStagedDirectoryRollback(
    workPackageId: string,
    stamp: { readonly at: number; readonly by: string },
    observe: (evidence: {
      readonly workPackage: PlanInputReads['workPackage'];
      readonly tag: Awaited<ReturnType<TransactionalStores['directory']['renameTag']>>;
      readonly person: Awaited<ReturnType<TransactionalStores['directory']['patchPerson']>>;
      readonly tags: Awaited<ReturnType<TransactionalStores['directory']['listTags']>>;
      readonly people: Awaited<ReturnType<TransactionalStores['directory']['listPeople']>>;
    }) => void,
  ): Promise<never>;
  /** Reproduces forbidden ID-keyed dependency uniqueness in source-owned state. */
  storeDependencyById(dependency: StoredDependency): void;
  /**
   * Gives a person an owning organization and that organization its members,
   * the side-table and membership rows SQLite holds and no memory port writes,
   * so a conformance case can bind an owned person.
   */
  ownPersonInOrganization(
    personId: string,
    organizationId: string,
    memberIds: readonly string[],
  ): void;
  /**
   * Ends every lease of a person at `at`, as revoking its last machine
   * credential does on SQLite (`endLeasesOfUncredentialed`); the memory
   * source holds no machine credentials, so no memory port revokes one.
   * Answers how many leases it ended.
   */
  endLeasesOf(personId: string, at: number): number;
  /**
   * Gives a work package an owning organization, the `work_package_organization` row
   * SQLite holds and no memory port writes, so the limits gauge counts its claims.
   */
  ownWorkPackageInOrganization(workPackageId: string, organizationId: string): void;
  /** Removes both actual package organization mappings for the retained orphan-holder refusal control. */
  removeWorkPackageOrganization(workPackageId: string): void;
  /**
   * Gives a resource an owning organization, the `resource_organization` row
   * SQLite holds, so the limits gauge sums its stated capacity.
   */
  ownResourceInOrganization(resourceId: string, organizationId: string): void;
  /** Seeds the actual type ownership table for scoped catalogue conformance; supplies no permission answer. */
  ownWorkItemTypeInOrganization(typeId: string, organizationId: string): void;
  /**
   * Adds an organization with its five seeded measure definitions, the
   * `organization` row and the seed its trigger writes on SQLite
   * (`wbs-measure-budgets`); `legacy` marks the one legacy access reads.
   *
   * @throws when the organization exists or a second would be legacy.
   */
  addOrganization(organizationId: string, options: { legacy: boolean }): void;
  /**
   * Writes an organization's own caps, the `organization_limits` row the
   * operator CLI writes on SQLite.
   *
   * @throws when any cap is outside the bounds an organization may hold.
   */
  setOrganizationLimits(organizationId: string, limits: OrganizationLimitValues): void;
  /**
   * The limits gauge over the committed state with `defaults`, as the scopes
   * this source's unit of work admits carry it; for conformance reads only.
   */
  organizationLimitGauge(defaults: OrganizationLimitValues): OrganizationLimitGauge;
  /** Reproduces the forbidden retained-row sequence derivation in source-owned state. */
  deriveNextEventSeqFromRetained(subscription: string): void;
  /**
   * Moves one committed journal event into adapter-owned disconnected storage.
   * @throws Error when the committed journal has no event with `eventId`.
   */
  routeJournalEventToIndependent(eventId: string): PlanEvent;
  /** Reads the fixture's disconnected journal-event storage as detached records. */
  independentJournalHistoryFor(): Promise<PlanEvent[]>;
  journalHistoryFor(workPackageId: string): Promise<PlanEvent[]>;
  /**
   * Fixture-only physical restore of decoded predecessor journal/event records, after actual current metadata/fact setup.
   * Retains queued input and publishes a complete stage under this Source's writer; bodies, sequences and undone flags stay exact.
   * @throws for a closed Source, missing current package/organization, foreign or unknown actors, duplicate identities/sequences,
   * existing target history or a late write fault. No authoring permission or SQLite migration admission is supplied.
   */
  restoreCommandHistory(checkpoint: {
    readonly workPackageId: string;
    readonly entries: readonly JournalEntry[];
    readonly events: readonly PlanEvent[];
  }): Promise<void>;
  /** Reproduces UTF-16 counts in adapter-owned history state. @throws When the plan is missing. */
  setSavedPlanByteCounts(savedPlanId: string, inputBytes: number, scheduleBytes: number): void;
  /** Reproduces a header whose bodies were lost. @throws When the plan or either body is missing. */
  removeSavedPlanBodies(savedPlanId: string): void;
  /** Reproduces altered input bytes. @throws When the plan or input body is missing. */
  replaceSavedPlanInputBody(savedPlanId: string, bytes: string): void;
  /** Reproduces an altered schedule hash. @throws When the plan or schedule hash is missing. */
  replaceSavedPlanScheduleHash(savedPlanId: string, sha256: string): void;
  /** Models split/omitted saved-plan body persistence at the real history owner. */
  writeSavedPlanSplit<Refusal>(
    plan: SavedPlanWrite,
    check: (holding: SavedPlanHoldingRow, incomingBytes: number) => Promise<Refusal | null>,
    includeInput: boolean,
    observeBoundary?: (stored: StoredSavedPlanBytes) => void,
  ): Promise<never>;
  /** Routes one history write through the forbidden command coordinator. */
  writeSavedPlanThroughCommandCoordinator<Refusal>(
    plan: SavedPlanWrite,
    check: (holding: SavedPlanHoldingRow, incomingBytes: number) => Promise<Refusal | null>,
  ): Promise<SavedPlanWriteOutcome<Refusal>>;
  /** Runs the real quota callback but suppresses the target state replacement. */
  claimSavedPlanWriteWithoutState<Refusal>(
    plan: SavedPlanWrite,
    check: (holding: SavedPlanHoldingRow, incomingBytes: number) => Promise<Refusal | null>,
  ): Promise<SavedPlanWriteOutcome<Refusal>>;
  /** Activates a history state owned by the current command stage. */
  activateCommandHistoryStage(): void;
  /** Discards the forbidden command-owned history state. */
  discardCommandHistoryStage(): void;
  /** History port backed by the active command-owned stage. */
  readonly commandStagedSavedPlans: SavedPlanStore;
}

/** What a memory source is opened with beyond its seams. */
export interface MemorySourceOptions {
  /**
   * The deployment default organization limits. Given, the scopes the unit of
   * work admits carry the limits gauge and only they, as on SQLite; absent, an
   * acquisition under scoped access throws rather than admitting uncapped.
   */
  readonly organizationDefaultLimits?: OrganizationLimitValues;
}

/** Physical fact arrays only, in raw identity order; does not invoke a production reader or derive mirrored trios. */
function readMemoryTupleEvidence(state: MemoryState) {
  const compareIds = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
  const comparePair = (
    left: { readonly workItemId: string; readonly stepId: string },
    right: { readonly workItemId: string; readonly stepId: string },
  ) => compareIds(left.workItemId, right.workItemId) || compareIds(left.stepId, right.stepId);
  return {
    measures: state.tables.measures.rows
      .map(({ basis, ...row }) => ({
        ...row,
        currency: basis?.currency ?? null,
        rateCardDigest: basis?.rateCardDigest ?? null,
      }))
      .sort((left, right) => comparePair(left, right) || compareIds(left.metric, right.metric)),
    measureEstimates: state.tables.measureEstimates.rows
      .map(({ basis, ...row }) => ({
        ...row,
        currency: basis?.currency ?? null,
        rateCardDigest: basis?.rateCardDigest ?? null,
      }))
      .sort((left, right) => comparePair(left, right) || compareIds(left.key, right.key)),
    attempts: state.tables.attempts.rows
      .map((row) => ({ ...row }))
      .sort((left, right) => comparePair(left, right) || left.attemptNumber - right.attemptNumber),
    issued: state.tables.attempts.issued.map((row) => ({ ...row })).sort(comparePair),
  };
}

/** Opens the conformance fixture with access to adapter-owned persistence seams. @internal */
export function openMemorySourceFixture(options: MemorySourceOptions = {}): MemorySourceFixture {
  return openMemorySourceWithSeams(inertMemoryLateWriteSeam, inertMemoryCaptureReadSeam, options);
}

/** @internal */
export function openMemorySourceWithLateWriteSeam(
  lateWrite: MemoryLateWriteSeam,
): MemorySourceFixture {
  return openMemorySourceWithSeams(lateWrite, inertMemoryCaptureReadSeam);
}

/** @internal */
export function openMemorySourceWithCaptureReadSeam(
  captureRead: CaptureReadSeam,
): MemorySourceFixture {
  return openMemorySourceWithSeams(inertMemoryLateWriteSeam, captureRead);
}

function openMemorySourceWithSeams(
  lateWrite: MemoryLateWriteSeam,
  captureRead: CaptureReadSeam,
  options: MemorySourceOptions = {},
): MemorySourceFixture {
  const limits = options.organizationDefaultLimits;
  const committed = new MemoryState();
  const coordinator = new MemoryCoordinator();
  const historyCoordinator = new MemoryCoordinator();
  const historyState: HistoryState = { plans: new Map() };
  let commandHistoryState: HistoryState | null = null;
  const independentJournalEvents: PlanEvent[] = [];
  const readActivation = () =>
    readMemoryOrganizationActivation(committed.tables.workPackages.creation.activation);
  const history = memoryHistory(
    readActivation,
    historyState,
    // Proof: neutralizing this shared capture-owner dependency let the actual in-flight capture
    // answer after Source close. Individual redundant continuation layers are uncredited (2026-11-20).
    () => {
      assertSourceOpen();
    },
    () => {
      assertSourceOpen();
      return committed.clone();
    },
    async (act) => await historyCoordinator.run(act),
    undefined,
    lateWrite,
    captureRead,
  );
  let closed = false;
  const assertSourceOpen = (): void => {
    // Proof: OWNER_SOURCE_CLOSED neutralized this whole shared dependency.
    // All three closed point-setter owners resolved; exact restoration passed.
    // This does not separately prove necessity of each redundant public layer.
    // Proof: REORDER_SOURCE_CLOSED broke this shared dependency; actual closed and queued-before-close reorders resolved. Exact restore passed both; individual redundant layers are not separate proofs (verification-reorder-lifetime-20261119.json).
    // Proof: disabling this shared dependency resolves two closed alias-fixture
    // operations and both known/missing saved reads (fixture-closure and
    // saved-read-closure effects); no separate per-call guard claim.
    // Proof: neutralizing this shared dependency admitted closed and queued historical fixture restores (memory-history-fault-closure-v1); no per-layer necessity claim.
    if (closed) throw new Error('memory source is closed');
  };
  const uow: UnitOfWork<TransactionalStores> = {
    run: (act) =>
      coordinator.run(async () => {
        assertSourceOpen();
        const staged = committed.clone();
        const borrowed = bindStores(staged, lateWrite, limits);
        let isActive = true;
        const assertLoanOpen = (): void => {
          assertSourceOpen();
          if (!isActive) throw new Error('memory catalogue loan is closed');
        };
        const pointWrites = ownPointWrites(borrowed, assertLoanOpen);
        const decision = await (async () => {
          try {
            return await act({
              stores: {
                ...borrowed,
                // Proof: bypassing this binding answered retained commit/rollback loans after expiry (space-membership-fault-memory-loans-v1).
                spaces: guardSpaceStore(borrowed.spaces, assertLoanOpen),
                // Proof: bypassing this tree binding admitted the actual committed owner (current-step-tree.test.ts).
                workItems: guardTreeReads(borrowed.workItems, {
                  kind: 'borrowed',
                  assertOpen: assertLoanOpen,
                }),
                // Proof: OWNER_LOAN_MEASURE bypassed this ordinary loan binding.
                // The matching expired-committed-loan owner resolved instead of rejecting;
                // exact restoration passed. Later fault state/no-revival tails were unreached.
                measures: guardMeasureReads(pointWrites.measures, {
                  kind: 'borrowed',
                  assertOpen: assertLoanOpen,
                }),
                measureEstimates: guardMeasureEstimateReads(borrowed.measureEstimates, {
                  kind: 'borrowed',
                  assertOpen: assertLoanOpen,
                }),
                attempts: guardAttemptReads(borrowed.attempts, {
                  kind: 'borrowed',
                  assertOpen: assertLoanOpen,
                }),
                blockages: guardSparseStepReads(borrowed.blockages, {
                  kind: 'borrowed',
                  assertOpen: assertLoanOpen,
                }),
                stepParallels: guardSparseStepReads(borrowed.stepParallels, {
                  kind: 'borrowed',
                  assertOpen: assertLoanOpen,
                }),
                subtrees: guardSubtreeWrites(
                  createMemorySubtreeStore(staged, assertLoanOpen, lateWrite),
                  assertLoanOpen,
                ),
                estimates: guardEstimateReads(borrowed.estimates, {
                  kind: 'borrowed',
                  assertOpen: assertLoanOpen,
                }),
                // Proof: OWNER_LOAN_ACTUAL bypassed this ordinary loan binding.
                // The matching expired-committed-loan owner resolved instead of rejecting;
                // exact restoration passed. Later fault state/no-revival tails were unreached.
                actuals: guardStepFactReads(pointWrites.actuals, {
                  kind: 'borrowed',
                  assertOpen: assertLoanOpen,
                }),
                // Proof: OWNER_LOAN_PROGRESS bypassed this ordinary loan binding.
                // The matching expired-committed-loan owner resolved instead of rejecting;
                // exact restoration passed. Later fault state/no-revival tails were unreached.
                progress: guardStepFactReads(pointWrites.progress, {
                  kind: 'borrowed',
                  assertOpen: assertLoanOpen,
                }),
                workPackages: {
                  ...retainPackageUnitWrites(borrowed.workPackages, assertLoanOpen),
                  // Proof: memory-ordinary-owner breaks this shared assertion dependency;
                  // both retained ordinary birth owners answer after expiry.
                  createWithSteps: createMemoryPackageWithStepsIn(staged, assertLoanOpen),
                  // Proof: disconnecting this loan callback let expired create
                  // return and a mid-preparation Source close still return a birth
                  // (birth-final-effect-ordinary-loan-v1 and
                  // birth-final-effect-close-during-preparation-v1).
                  create: createLegacyMemoryPackageBirthIn(staged, assertLoanOpen),
                  createInOrganization: createMemoryPackageBirthIn(staged, assertLoanOpen),
                },
                stepCatalogue: guardStepCatalogue(borrowed.stepCatalogue, assertLoanOpen),
                // Proof: memory-ordinary bypasses this binding; both commit and
                // rollback retained known-package observations answer after expiry.
                claims: guardClaimObservation(borrowed.claims, {
                  kind: 'borrowed',
                  assertOpen: assertLoanOpen,
                }),
              },
            });
          } finally {
            isActive = false;
          }
        })();
        // Proof: unconditional commit injected; sparse override replacement/removal rollback negative failed (memory-rollback.txt), 2026-10-15.
        assertSourceOpen();
        if (decision.commit) committed.replaceWith(staged);
        else if (decision.afterRollback !== undefined) {
          const repair = bindStores(committed, lateWrite, limits);
          let isRepairActive = true;
          try {
            const assertRepairOpen = (): void => {
              assertSourceOpen();
              if (!isRepairActive) throw new Error('memory catalogue repair loan is closed');
            };
            const pointWrites = ownPointWrites(repair, assertRepairOpen);
            await decision.afterRollback({
              stores: {
                ...repair,
                // Proof: bypassing this repair binding answered after repair settlement (space-membership-fault-memory-repair-v2).
                spaces: guardSpaceStore(repair.spaces, assertRepairOpen),
                // Proof: bypassing this tree binding admitted the actual repair owner (current-step-tree.test.ts).
                workItems: guardTreeReads(repair.workItems, {
                  kind: 'borrowed',
                  assertOpen: assertRepairOpen,
                }),
                measures: guardMeasureReads(pointWrites.measures, {
                  kind: 'borrowed',
                  assertOpen: assertRepairOpen,
                }),
                measureEstimates: guardMeasureEstimateReads(repair.measureEstimates, {
                  kind: 'borrowed',
                  assertOpen: assertRepairOpen,
                }),
                attempts: guardAttemptReads(repair.attempts, {
                  kind: 'borrowed',
                  assertOpen: assertRepairOpen,
                }),
                blockages: guardSparseStepReads(repair.blockages, {
                  kind: 'borrowed',
                  assertOpen: assertRepairOpen,
                }),
                stepParallels: guardSparseStepReads(repair.stepParallels, {
                  kind: 'borrowed',
                  assertOpen: assertRepairOpen,
                }),
                subtrees: guardSubtreeWrites(
                  createMemorySubtreeStore(committed, assertRepairOpen, lateWrite),
                  assertRepairOpen,
                ),
                // Proof: L_MEM_REPAIR omits this binding; target-plain-repair-expiry resolves after repair.
                estimates: guardEstimateReads(repair.estimates, {
                  kind: 'borrowed',
                  assertOpen: assertRepairOpen,
                }),
                actuals: guardStepFactReads(pointWrites.actuals, {
                  kind: 'borrowed',
                  assertOpen: assertRepairOpen,
                }),
                progress: guardStepFactReads(pointWrites.progress, {
                  kind: 'borrowed',
                  assertOpen: assertRepairOpen,
                }),
                workPackages: {
                  ...retainPackageUnitWrites(repair.workPackages, assertRepairOpen),
                  // Proof: memory-repair-owner breaks this callback dependency;
                  // the retained repair birth answers after expiry.
                  createWithSteps: createMemoryPackageWithStepsIn(committed, assertRepairOpen),
                  // Proof: disconnecting this repair callback let expired create
                  // return in the repair test (birth-final-effect-repair-loan-v1).
                  create: createLegacyMemoryPackageBirthIn(committed, assertRepairOpen),
                  createInOrganization: createMemoryPackageBirthIn(committed, assertRepairOpen),
                },
                stepCatalogue: guardStepCatalogue(repair.stepCatalogue, assertRepairOpen),
                // Proof: memory-repair bypasses this binding; the retained
                // known-package observation answers after repair expiry.
                claims: guardClaimObservation(repair.claims, {
                  kind: 'borrowed',
                  assertOpen: assertRepairOpen,
                }),
              },
            });
          } finally {
            isRepairActive = false;
          }
        }
        return decision.value;
      }),
  };
  const publicStores = bindStores(committed, lateWrite);
  const coordinated = coordinatedStores(
    {
      ...publicStores,
      spaces: guardSpaceStore(publicStores.spaces, assertSourceOpen),
      ...ownPointWrites(publicStores, assertSourceOpen),
      workPackages: retainPackageUnitWrites(publicStores.workPackages, assertSourceOpen),
    },
    coordinator,
  );
  const pointWrites = ownPointWrites(coordinated, assertSourceOpen);
  const stores: TransactionalStores = {
    ...coordinated,
    spaces: guardSpaceStore(coordinated.spaces, assertSourceOpen),
    // Proof: bypassing this tree binding admitted the actual public closed Source owner (current-step-tree.test.ts).
    workItems: guardTreeReads(coordinated.workItems, {
      kind: 'public',
      assertOpen: assertSourceOpen,
    }),
    // Proof: memory-public bypasses this binding; the retained known-package
    // observation answers after Source close. Later loop assertions are uncredited.
    claims: guardClaimObservation(coordinated.claims, {
      kind: 'public',
      assertOpen: assertSourceOpen,
    }),
    // Proof: OWNER_QUEUE_MEASURE bypassed this public retaining wrapper.
    // The matching actual queue owner stored the alternate address/value instead
    // of the original; restoring this binding passed the same selected owner.
    measures: guardMeasureReads(pointWrites.measures, {
      kind: 'public',
      assertOpen: assertSourceOpen,
    }),
    measureEstimates: guardMeasureEstimateReads(coordinated.measureEstimates, {
      kind: 'public',
      assertOpen: assertSourceOpen,
    }),
    attempts: guardAttemptReads(coordinated.attempts, {
      kind: 'public',
      assertOpen: assertSourceOpen,
    }),
    blockages: guardSparseStepReads(coordinated.blockages, {
      kind: 'public',
      assertOpen: assertSourceOpen,
    }),
    stepParallels: guardSparseStepReads(coordinated.stepParallels, {
      kind: 'public',
      assertOpen: assertSourceOpen,
    }),
    subtrees: {
      async inspectFirstChild(write, stamp) {
        assertSourceOpen();
        const kept = retainFirstChildWrite(write, stamp);
        const decision = await coordinator.run(() =>
          createMemorySubtreeStore(committed, assertSourceOpen, lateWrite).inspectFirstChild(
            kept.write,
            kept.stamp,
          ),
        );
        assertSourceOpen();
        return decision;
      },
      async writeMove(write, stamp) {
        assertSourceOpen();
        // Proof: retaining references instead failed the actual public queued-input case after caller mutation.
        const kept = retainMoveWrite(write, stamp);
        const written = await coordinator.run(() =>
          createMemorySubtreeStore(committed, assertSourceOpen, lateWrite).writeMove(
            kept.write,
            kept.stamp,
          ),
        );
        assertSourceOpen();
        return written;
      },
      async writeFirstChild(write, stamp) {
        assertSourceOpen();
        const kept = retainFirstChildWrite(write, stamp);
        const written = await coordinator.run(() =>
          createMemorySubtreeStore(committed, assertSourceOpen, lateWrite).writeFirstChild(
            kept.write,
            kept.stamp,
          ),
        );
        assertSourceOpen();
        return written;
      },
      async insertSubtree(copy, stamp) {
        assertSourceOpen();
        const kept = retainSubtreeWrite(copy, stamp);
        const written = await coordinator.run(() =>
          createMemorySubtreeStore(committed, assertSourceOpen, lateWrite).insertSubtree(
            kept.copy,
            kept.stamp,
          ),
        );
        assertSourceOpen();
        return written;
      },
    },
    estimates: guardEstimateReads(retainEstimateWrites(coordinated.estimates), {
      kind: 'public',
      assertOpen: assertSourceOpen,
    }),
    // Proof: OWNER_QUEUE_ACTUAL bypassed this public retaining wrapper.
    // The matching actual queue owner stored the alternate address/value instead
    // of the original; restoring this binding passed the same selected owner.
    actuals: guardStepFactReads(pointWrites.actuals, {
      kind: 'public',
      assertOpen: assertSourceOpen,
    }),
    // Proof: OWNER_QUEUE_PROGRESS bypassed this public retaining wrapper.
    // The matching actual queue owner stored the alternate address/value instead
    // of the original; restoring this binding passed the same selected owner.
    progress: guardStepFactReads(pointWrites.progress, {
      kind: 'public',
      assertOpen: assertSourceOpen,
    }),
    workPackages: {
      ...retainPackageUnitWrites(coordinated.workPackages, assertSourceOpen),
      async createWithSteps(workPackage, stamp, scope) {
        // Proof: memory-source-closed breaks the shared Source assertion; the
        // retained public birth answers after close. Redundant layers are one proof.
        assertSourceOpen();
        // Proof: memory-queue-retention omits this clone; actual legacy/scoped
        // queue owners consume changed caller metadata (two failures, group only).
        const retained = structuredClone({ workPackage, stamp, scope });
        return await uow.run(async ({ stores: borrowed }) => {
          const born = await borrowed.workPackages.createWithSteps(
            retained.workPackage,
            retained.stamp,
            retained.scope,
          );
          return { commit: typeof born !== 'string', value: born };
        });
      },
      async create(workPackage, starting, stamp) {
        assertSourceOpen();
        // Proof: retaining caller references here let a queued mutation reach
        // the creator-account boundary (birth-effect-queued-retention-v1).
        const retained = structuredClone({ workPackage, steps: [...starting], stamp });
        return await uow.run(async ({ stores: borrowed }) => {
          const written = await borrowed.workPackages.create(
            retained.workPackage,
            retained.steps,
            retained.stamp,
          );
          return { commit: typeof written !== 'string', value: written };
        });
      },
      async createInOrganization(workPackage, starting, stamp, organizationId, creatorGrant) {
        assertSourceOpen();
        const retained = retainWorkPackageCreation(
          workPackage,
          starting,
          stamp,
          organizationId,
          creatorGrant,
        );
        return await uow.run(async ({ stores: borrowed }) => {
          const written = await borrowed.workPackages.createInOrganization(
            retained.workPackage,
            retained.steps,
            retained.stamp,
            retained.organizationId,
            retained.creatorGrant,
          );
          return { commit: typeof written !== 'string', value: written };
        });
      },
    },
    stepCatalogue: {
      async reorderBindings(organizationId, scope, ids, stamp, beforeWrite) {
        assertSourceOpen();
        // Proof: REORDER_MEMORY_RETAIN omitted this clone; all three actual queued scope/IDs/audit cases failed, then exact restore passed (verification-reorder-lifetime-20261119.json).
        const kept = structuredClone({ organizationId, scope, ids, stamp });
        return await uow.run(async ({ stores: borrowed }) => {
          const written = await borrowed.stepCatalogue.reorderBindings(
            kept.organizationId,
            kept.scope,
            kept.ids,
            kept.stamp,
            beforeWrite,
          );
          return { commit: written.ok, value: written };
        });
      },
      async patchStepDefinition(organizationId, stepId, patch, stamp, beforeWrite) {
        assertSourceOpen();
        const kept = structuredClone({ organizationId, stepId, patch, stamp });
        return await uow.run(async ({ stores: borrowed }) => {
          const written = await borrowed.stepCatalogue.patchStepDefinition(
            kept.organizationId,
            kept.stepId,
            kept.patch,
            kept.stamp,
            beforeWrite,
          );
          return { commit: written.ok, value: written };
        });
      },
      async retireStepDefinition(organizationId, stepId, stamp) {
        assertSourceOpen();
        const kept = structuredClone({ organizationId, stepId, stamp });
        return await uow.run(async ({ stores: borrowed }) => {
          const written = await borrowed.stepCatalogue.retireStepDefinition(
            kept.organizationId,
            kept.stepId,
            kept.stamp,
          );
          return { commit: written.ok, value: written };
        });
      },
      readUsage(organizationId) {
        assertSourceOpen();
        return bindStores(committed.clone(), lateWrite).stepCatalogue.readUsage(organizationId);
      },
      readManifest(organizationId, projectId) {
        assertSourceOpen();
        return bindStores(committed.clone(), lateWrite).stepCatalogue.readManifest(
          organizationId,
          projectId,
        );
      },
      readRetiredCodes(organizationId) {
        assertSourceOpen();
        return bindStores(committed.clone(), lateWrite).stepCatalogue.readRetiredCodes(
          organizationId,
        );
      },
      readCatalogue(organizationId) {
        assertSourceOpen();
        return bindStores(committed.clone(), lateWrite).stepCatalogue.readCatalogue(organizationId);
      },
      readPackage(organizationId, workPackageId) {
        assertSourceOpen();
        return bindStores(committed.clone(), lateWrite).stepCatalogue.readPackage(
          organizationId,
          workPackageId,
        );
      },
      async defineAndBindStep(organizationId, definition, binding, stamp, beforeWrite) {
        assertSourceOpen();
        const retained = structuredClone({ organizationId, definition, binding, stamp });
        return await uow.run(async ({ stores: borrowed }) => {
          const written = await borrowed.stepCatalogue.defineAndBindStep(
            retained.organizationId,
            retained.definition,
            retained.binding,
            retained.stamp,
            beforeWrite,
          );
          return { commit: written.ok, value: written };
        });
      },
      async bindStep(organizationId, binding, stamp, beforeWrite) {
        assertSourceOpen();
        const retained = structuredClone({ organizationId, binding, stamp });
        return await uow.run(async ({ stores: borrowed }) => {
          const written = await borrowed.stepCatalogue.bindStep(
            retained.organizationId,
            retained.binding,
            retained.stamp,
            beforeWrite,
          );
          return { commit: written.ok, value: written };
        });
      },
      async unbindStep(organizationId, bindingId, options, stamp, beforeWrite) {
        assertSourceOpen();
        const retained = structuredClone({ organizationId, bindingId, options, stamp });
        return await uow.run(async ({ stores: borrowed }) => {
          const written = await borrowed.stepCatalogue.unbindStep(
            retained.organizationId,
            retained.bindingId,
            retained.options,
            retained.stamp,
            beforeWrite,
          );
          return { commit: written.kind === 'unbound', value: written };
        });
      },
    },
  };
  const committedSnapshot = async () => {
    assertSourceOpen();
    return coordinator.run(() => {
      assertSourceOpen();
      return Promise.resolve(committed.clone());
    });
  };
  const workPackageReportSnapshot: WorkPackageReportSnapshot = async (access, read) => {
    const epoch = await committedSnapshot();
    const snapshot = bindStores(epoch);
    const observe = {
      ...snapshot,
      access: snapshot.claims,
      workPackages: {
        ...snapshot.workPackages,
        async findInOrganization(id: string, organizationId: string) {
          if (access.kind !== 'scoped' || access.scope.organizationId !== organizationId)
            return null;
          if (epoch.tables.organizationLimits.workPackageOrganization.get(id) !== organizationId)
            return null;
          if (!mayReadMemoryWorkPackage(epoch, { id, organizationId }, access.scope.userId, access))
            return null;
          return snapshot.workPackages.findInOrganization(id, organizationId);
        },
      },
    };
    const projection = await read(observe);
    assertSourceOpen();
    return projection;
  };
  const resourceOccupancy: ResourceOccupancyStore = {
    async readResourceOccupancyWithin(resourceId, actorId, access) {
      assertSourceOpen();
      const retained = structuredClone(access);
      const actual = memoryDirectoryRead(committed, actorId, retained);
      if (!actual.ok) return actual;
      const epoch = await committedSnapshot();
      const admitted = memoryDirectoryRead(epoch, actorId, retained);
      if (!admitted.ok) return admitted;
      const snapshot = bindStores(epoch);
      const read = await readResourceOccupancy(
        () => ({
          ...snapshot,
          workPackages: {
            findInOrganization: (...args) => snapshot.workPackages.findInOrganization(...args),
            mayReadWorkPackageWithin: (...args) =>
              snapshot.claims.mayReadWorkPackageWithin(...args),
          },
        }),
        resourceId,
        actorId,
        retained,
      );
      assertSourceOpen();
      return read;
    },
  };
  const capacityPreview: NonNullable<Source['capacityPreview']> = {
    async previewDirectoryCapacityWithin(resourceId, units, actorId, access) {
      assertSourceOpen();
      const retained = structuredClone(access);
      // A refusal must not wait on a write turn. An admission is rechecked against the cloned epoch.
      const actual = memoryDirectoryRead(committed, actorId, retained);
      if (!actual.ok) return actual;
      const epoch = await committedSnapshot();
      const admitted = memoryDirectoryRead(epoch, actorId, retained);
      if (!admitted.ok) return admitted;
      const snapshot = bindStores(epoch, lateWrite, limits);
      const read = await previewCapacity(
        () => ({
          claims: snapshot.claims,
          workPackages: {
            findInOrganization: (...args) => snapshot.workPackages.findInOrganization(...args),
            mayReadWorkPackageWithin: (...args) =>
              snapshot.claims.mayReadWorkPackageWithin(...args),
          },
          directory: snapshot.directory,
          limits: snapshot.organizationLimits,
        }),
        resourceId,
        units,
        actorId,
        retained,
      );
      assertSourceOpen();
      return read;
    },
  };
  const activeCommandHistory = (): SavedPlanStore => {
    if (commandHistoryState === null) throw new Error('command history stage is not active');
    return memorySavedPlans(
      readActivation,
      commandHistoryState,
      () => {
        assertSourceOpen();
        return committed.clone();
      },
      () => bindStores(committed.clone(), lateWrite),
      async (act) => await act(),
      lateWrite,
    );
  };
  const commandStagedSavedPlans: SavedPlanStore = {
    write: (plan, check, scoped) => activeCommandHistory().write(plan, check, scoped),
    readOf: (id) => activeCommandHistory().readOf(id),
    listOf: (workPackageId) => activeCommandHistory().listOf(workPackageId),
    principalsOf: (id) => activeCommandHistory().principalsOf(id),
    renameTo: (id, name, scoped) => activeCommandHistory().renameTo(id, name, scoped),
    deleteOf: (id, scoped) => activeCommandHistory().deleteOf(id, scoped),
  };

  return {
    commandStagedSavedPlans,
    async activateOrganizationIsolation() {
      await coordinator.run(async () => {
        await historyCoordinator.run(() => {
          if (readActivation() !== 'pre_activation')
            throw new Error('organization isolation is already activated');
          committed.tables.workPackages.creation.activation.state = 'activated';
          return Promise.resolve();
        });
      });
    },
    seedPackageParent(project) {
      if (!committed.tables.directory.measureDefinitions.organizations.has(project.organizationId))
        throw new Error('package parent organization is absent');
      if (committed.tables.workPackages.creation.projects.has(project.id))
        throw new Error('duplicate package parent');
      committed.tables.workPackages.creation.projects.set(project.id, structuredClone(project));
    },
    setPackageCreationMembers(organizationId, userIds) {
      if (!committed.tables.directory.measureDefinitions.organizations.has(organizationId))
        throw new Error('package creation organization is absent');
      for (const id of userIds)
        if (!committed.tables.users.byId.has(id))
          throw new Error('package creation member account is absent');
      committed.tables.directory.organizationMembers.set(organizationId, new Set(userIds));
    },
    injectStepDefinition(id, definition) {
      assertSourceOpen();
      const held = committed.tables.stepCatalogue.definitions.get(id);
      committed.tables.stepCatalogue.definitions.set(id, structuredClone(definition));
      return () => {
        assertSourceOpen();
        if (held === undefined) committed.tables.stepCatalogue.definitions.delete(id);
        else committed.tables.stepCatalogue.definitions.set(id, held);
      };
    },
    injectStepAlias(alias) {
      assertSourceOpen();
      // Proof: retaining the caller object lets its later mutation corrupt the
      // actual saved read (saved-identity-effect-fixture-retention-v1).
      const retained = { ...alias };
      const held = committed.tables.stepCatalogue.identityHistory.get(retained.oldStepId);
      committed.tables.stepCatalogue.identityHistory.set(retained.oldStepId, retained);
      return () => {
        assertSourceOpen();
        if (held === undefined)
          committed.tables.stepCatalogue.identityHistory.delete(retained.oldStepId);
        else committed.tables.stepCatalogue.identityHistory.set(retained.oldStepId, held);
      };
    },
    stepCatalogueEvidence() {
      return structuredClone({
        snapshot: committed.tables,
        tuples: readMemoryTupleEvidence(committed),
        estimates: [...committed.tables.estimates.rows].sort((left, right) =>
          left.workItemId < right.workItemId
            ? -1
            : left.workItemId > right.workItemId
              ? 1
              : left.stepId < right.stepId
                ? -1
                : left.stepId > right.stepId
                  ? 1
                  : 0,
        ),
        actuals: [...committed.tables.actuals.rows].sort((left, right) =>
          left.workItemId < right.workItemId
            ? -1
            : left.workItemId > right.workItemId
              ? 1
              : left.stepId < right.stepId
                ? -1
                : left.stepId > right.stepId
                  ? 1
                  : 0,
        ),
        progress: [...committed.tables.progress.rows].sort((left, right) =>
          left.workItemId < right.workItemId
            ? -1
            : left.workItemId > right.workItemId
              ? 1
              : left.stepId < right.stepId
                ? -1
                : left.stepId > right.stepId
                  ? 1
                  : 0,
        ),
        packageValues: [...committed.tables.stepCatalogue.packageValues.values()].flatMap(
          (held) => [...held.values()],
        ),
      });
    },
    removePackageStepValues(workPackageId) {
      // Proof: omitting this guard allowed mutation after close in the actual
      // fixture owner (creation-effect-fixture-closed-owner-v1).
      assertSourceOpen();
      const values = committed.tables.stepCatalogue.packageValues.get(workPackageId);
      // Proof: omission changed the named absent-set failure into a values.size
      // TypeError (creation-effect-fixture-absence-diagnostic-v1); classification only.
      if (values === undefined) throw new Error('memory package explicit values set is absent');
      // Proof: omission made the birth fault assertion-passed instead of observed
      // (creation-effect-memory-physical-removal-v1).
      committed.tables.stepCatalogue.packageValues.delete(workPackageId);
      return values.size;
    },
    corruptStepFact(corruption) {
      if (
        corruption.kind === 'estimate_field' ||
        corruption.kind === 'actual_field' ||
        corruption.kind === 'progress_field' ||
        corruption.kind === 'measure_field'
      ) {
        const rows =
          corruption.kind === 'estimate_field'
            ? committed.tables.estimates.rows
            : corruption.kind === 'actual_field'
              ? committed.tables.actuals.rows
              : corruption.kind === 'progress_field'
                ? committed.tables.progress.rows
                : committed.tables.measures.rows;
        const row = rows.find(
          (row) => row.workItemId === corruption.workItemId && row.stepId === corruption.stepId,
        );
        // Proof: removing this fixture check replaced its absence diagnostic with Reflect.get TypeError (memory-current-fault-fixture-target-v1); diagnostic-only.
        if (row === undefined) throw new Error('point corruption target is absent');
        const original: unknown = Reflect.get(row, corruption.column);
        // Fixture-only erased persisted-column boundary; readers must decode it before returning facts.
        Reflect.set(row, corruption.column, corruption.value);
        return () => {
          Reflect.set(row, corruption.column, original);
        };
      }
      if (corruption.kind === 'actual_days' || corruption.kind === 'actual_step') {
        const row = committed.tables.actuals.rows.find(
          (row) => row.workItemId === corruption.workItemId && row.stepId === corruption.stepId,
        );
        if (row === undefined) throw new Error('actual point corruption target is absent');
        const column = corruption.kind === 'actual_days' ? 'days' : 'stepId';
        const original = row[column];
        Reflect.set(row, column, corruption.value);
        return () => {
          Reflect.set(row, column, original);
        };
      }
      const row = committed.tables.progress.rows.find(
        (row) => row.workItemId === corruption.workItemId && row.stepId === corruption.stepId,
      );
      if (row === undefined) throw new Error('progress point corruption target is absent');
      const column = corruption.kind === 'progress_time' ? 'statedAt' : 'stepId';
      const original = row[column];
      // Fixture-only untyped persisted-column corruption; the actual public store is unchanged.
      Reflect.set(row, column, corruption.value);
      return () => {
        Reflect.set(row, column, original);
      };
    },
    packageCreationEvidence() {
      return structuredClone({
        grants: [...committed.tables.workPackages.creation.grants.values()],
        audits: [...committed.tables.workPackages.creation.audits.values()],
      });
    },
    seedPackageExportGrant(grant) {
      const grants = committed.tables.workPackages.creation.grants;
      if (grants.has(grant.id)) throw new Error('duplicate export grant identity');
      grants.set(grant.id, structuredClone(grant));
    },
    removePackageExportGrant(id) {
      if (!committed.tables.workPackages.creation.grants.delete(id))
        throw new Error('export grant is absent');
    },
    replacePackageExportRoleKind(id, kind) {
      const roles = committed.tables.workPackages.creation.roles;
      if (!roles.has(id)) throw new Error('export role is absent');
      roles.set(id, kind);
    },
    renamePackageExportParent(id, name) {
      const projects = committed.tables.workPackages.creation.projects,
        parent = projects.get(id);
      if (parent === undefined) throw new Error('export parent is absent');
      projects.set(id, { ...parent, name });
    },
    removePackageCaptureParent(id) {
      if (!committed.tables.workPackages.creation.projects.delete(id))
        throw new Error('capture parent is absent');
    },
    replacePackageCaptureParent(parent) {
      const parents = committed.tables.workPackages.creation.projects;
      if (!parents.has(parent.id)) throw new Error('capture parent is absent');
      parents.set(parent.id, structuredClone(parent));
    },
    removePackageCreationRole() {
      committed.tables.workPackages.creation.roles.delete('package-manager');
    },
    seedPackageCreationAudit(audit) {
      committed.tables.workPackages.creation.audits.set(audit.id, structuredClone(audit));
    },
    activateCommandHistoryStage() {
      if (commandHistoryState !== null) throw new Error('command history stage activated twice');
      commandHistoryState = { plans: structuredClone(historyState.plans) };
    },
    discardCommandHistoryStage() {
      commandHistoryState = null;
    },
    writeSavedPlanThroughCommandCoordinator: (plan, check) =>
      coordinator.run(async () => await history.savedPlans.write(plan, check)),
    claimSavedPlanWriteWithoutState: async (plan, check) => {
      const rows = [...historyState.plans.values()].filter(
        (stored) => stored.header.workPackageId === plan.workPackageId,
      );
      const holding = {
        plans: rows.length,
        bytes: rows.reduce(
          (sum, stored) => sum + stored.header.inputBytes + (stored.header.scheduleBytes ?? 0),
          0,
        ),
      };
      const incomingBytes =
        new TextEncoder().encode(plan.input.bytes).byteLength +
        (plan.schedule.present ? new TextEncoder().encode(plan.schedule.body.bytes).byteLength : 0);
      const refusal = await check(holding, incomingBytes);
      return refusal === null ? { outcome: 'written' } : { outcome: 'refused', refusal };
    },
    captureWithStagedDirectoryRollback(workPackageId, stamp, observe) {
      return coordinator.run(async () => {
        const staged = committed.clone();
        const stagedStores = bindStores(staged, lateWrite);
        await capturePlanInput(
          staged,
          workPackageId,
          {
            async afterFirstRead({ workPackage }) {
              const tag = await stagedStores.directory.renameTag(
                'tag-a',
                'Tag after interleave',
                stamp,
              );
              const person = await stagedStores.directory.patchPerson(
                'capture-person-unassigned',
                { teamIds: ['team-a'] },
                stamp,
              );
              const [tags, people] = await Promise.all([
                stagedStores.directory.listTags(),
                stagedStores.directory.listPeople(),
              ]);
              observe({ workPackage, tag, person, tags, people });
              throw new Error('injected staged-owner capture rollback');
            },
          },
          lateWrite,
        );
        throw new Error('staged-owner capture fault did not reject');
      });
    },
    writeSavedPlanSplit: (plan, check, includeInput, observeBoundary) => {
      // Proof: changing the canonical request ID before this adapter boundary used to
      // exercise the split writer for an unrelated record and certify its failure.
      if (plan.id !== 'late-target')
        return Promise.reject(new Error('saved-plan split target must be late-target'));
      const expectedPlan = structuredClone(plan);
      return historyCoordinator.run(async () => {
        const rows = [...historyState.plans.values()].filter(
          (stored) => stored.header.workPackageId === plan.workPackageId,
        );
        const holding = {
          plans: rows.length,
          bytes: rows.reduce(
            (sum, stored) => sum + stored.header.inputBytes + (stored.header.scheduleBytes ?? 0),
            0,
          ),
        };
        const incomingBytes =
          new TextEncoder().encode(plan.input.bytes).byteLength +
          (plan.schedule.present
            ? new TextEncoder().encode(plan.schedule.body.bytes).byteLength
            : 0);
        const refusal = await check(holding, incomingBytes);
        if (refusal !== null) throw new Error('split saved-plan fault was unexpectedly refused');
        historyState.plans.set(plan.id, {
          header: savedPlanRow(plan),
          bodies: { input: includeInput ? plan.input.bytes : null, schedule: null },
        });
        const partial = historyState.plans.get(plan.id);
        if (partial !== undefined) observeBoundary?.(structuredClone(partial));
        if (partial !== undefined)
          lateWrite.observeBoundary?.('saved-plan-schedule-body', {
            savedPlan: structuredClone(partial),
          });
        assertSavedPlanScheduleBoundary(expectedPlan, partial);
        if (partial.bodies.schedule !== null)
          throw new Error('split saved-plan fault persisted schedule too early');
        lateWrite.reach('saved-plan-schedule-body', {
          savedPlan: structuredClone(partial),
        });
        throw new Error('split saved-plan fault control did not reject');
      });
    },
    setSavedPlanByteCounts(savedPlanId, inputBytes, scheduleBytes) {
      const stored = historyState.plans.get(savedPlanId);
      // Proof: removing this guard made the regression fail later with
      // `undefined is not an object (evaluating 'stored.header')`.
      if (stored === undefined) throw new Error(`no saved plan ${savedPlanId}`);
      historyState.plans.set(savedPlanId, {
        ...stored,
        header: { ...stored.header, inputBytes, scheduleBytes },
      });
    },
    removeSavedPlanBodies(savedPlanId) {
      const stored = historyState.plans.get(savedPlanId);
      // Proof: removing this guard made the missing-seam regression receive
      // `undefined is not an object (evaluating 'stored.bodies')`.
      if (stored === undefined) throw new Error(`no saved plan ${savedPlanId}`);
      // Proof: removing this guard made `refuses saved-plan persistence mutations
      // without their exact target state` receive undefined from a call expected to throw.
      if (stored.bodies.input === null || stored.bodies.schedule === null)
        throw new Error(`saved plan ${savedPlanId} does not have both bodies`);
      historyState.plans.set(savedPlanId, {
        ...stored,
        bodies: { input: null, schedule: null },
      });
    },
    replaceSavedPlanInputBody(savedPlanId, bytes) {
      const stored = historyState.plans.get(savedPlanId);
      // Proof: removing this guard made the missing-seam regression receive
      // `undefined is not an object (evaluating 'stored.bodies')`.
      if (stored === undefined) throw new Error(`no saved plan ${savedPlanId}`);
      // Proof: removing this guard made `refuses saved-plan persistence mutations
      // without their exact target state` receive undefined from a call expected to throw.
      if (stored.bodies.input === null)
        throw new Error(`saved plan ${savedPlanId} has no input body`);
      historyState.plans.set(savedPlanId, {
        ...stored,
        bodies: { ...stored.bodies, input: bytes },
      });
    },
    replaceSavedPlanScheduleHash(savedPlanId, sha256) {
      const stored = historyState.plans.get(savedPlanId);
      // Proof: removing this guard made the missing-seam regression receive
      // `undefined is not an object (evaluating 'stored.header')`.
      if (stored === undefined) throw new Error(`no saved plan ${savedPlanId}`);
      // Proof: removing this guard made `refuses saved-plan persistence mutations
      // without their exact target state` receive undefined from a call expected to throw.
      if (stored.header.scheduleSha256 === null)
        throw new Error(`saved plan ${savedPlanId} has no schedule hash`);
      historyState.plans.set(savedPlanId, {
        ...stored,
        header: { ...stored.header, scheduleSha256: sha256 },
      });
    },
    storeDependencyById(toAdd) {
      if (committed.tables.dependencies.rows.some(({ id }) => id === toAdd.id)) return;
      committed.tables.dependencies.rows.push(structuredClone(toAdd));
    },
    deriveNextEventSeqFromRetained(subscription) {
      const retained = committed.tables.eventLog.rows.get(subscription) ?? [];
      committed.tables.eventLog.nextSeq.set(subscription, (retained.at(-1)?.seq ?? -1) + 1);
    },
    addOrganization(organizationId, options) {
      seedMemoryOrganization(
        committed.tables.directory.measureDefinitions,
        organizationId,
        options.legacy,
      );
    },
    endLeasesOf: (personId, at) => endMemoryLeases(committed.tables.claims, personId, at),
    ownWorkPackageInOrganization(workPackageId, organizationId) {
      committed.tables.organizationLimits.workPackageOrganization.set(
        workPackageId,
        organizationId,
      );
    },
    removeWorkPackageOrganization(workPackageId) {
      const organizationMappings = committed.tables.organizationLimits.workPackageOrganization;
      const packageMappings = committed.tables.workPackages.owning;
      if (!organizationMappings.has(workPackageId) || !packageMappings.has(workPackageId))
        throw new Error('memory package organization mapping is absent');
      organizationMappings.delete(workPackageId);
      packageMappings.delete(workPackageId);
    },
    ownWorkItemTypeInOrganization(typeId, organizationId) {
      if (!committed.tables.directory.workItemTypes.has(typeId))
        throw new Error('catalogue fixture type is absent');
      if (!committed.tables.directory.measureDefinitions.organizations.has(organizationId))
        throw new Error('catalogue fixture type organization is absent');
      if (committed.tables.directory.organizationOf.has(typeId))
        throw new Error('catalogue fixture type is already mapped');
      committed.tables.directory.organizationOf.set(typeId, organizationId);
    },
    ownResourceInOrganization(resourceId, organizationId) {
      committed.tables.directory.organizationOf.set(resourceId, organizationId);
    },
    setOrganizationLimits(organizationId, caps) {
      committed.tables.organizationLimits.caps.set(
        organizationId,
        checkedOrganizationLimits(caps, `organization ${organizationId}`),
      );
    },
    organizationLimitGauge(defaults) {
      return inMemoryOrganizationLimitGauge(
        {
          limits: committed.tables.organizationLimits,
          directory: committed.tables.directory,
          claims: committed.tables.claims,
          workItems: committed.tables.workItems,
        },
        defaults,
      );
    },
    ownPersonInOrganization(personId, organizationId, memberIds) {
      committed.tables.directory.organizationOf.set(personId, organizationId);
      committed.tables.directory.organizationMembers.set(organizationId, new Set(memberIds));
    },
    restoreCommandHistory(checkpoint) {
      assertSourceOpen();
      // Proof: retaining caller aliases changed the queued admission target (memory-history-fault-retention-v1).
      const retained = structuredClone(checkpoint);
      return coordinator.run(() => {
        assertSourceOpen();
        // Proof: aliasing committed state leaked genuine entries/events after the late fault (memory-history-fault-stage-v1).
        const staged = committed.clone();
        // Proof: omitting this guard admitted absent packages and absent organization mappings (memory-history-fault-target-v1).
        if (
          !staged.tables.workPackages.workPackages.has(retained.workPackageId) ||
          !staged.tables.workPackages.owning.has(retained.workPackageId)
        )
          throw new Error('historical journal target package or organization is absent');
        const { journal, users } = staged.tables;
        // Proof: omitting this guard admitted foreign entry/event scopes and unknown actors (memory-history-fault-scope-v1).
        if (
          retained.entries.some(
            (entry) =>
              entry.workPackageId !== retained.workPackageId || !users.byId.has(entry.userId),
          ) ||
          retained.events.some(
            (event) =>
              event.workPackageId !== retained.workPackageId || !users.byId.has(event.userId),
          )
        )
          throw new Error('historical journal row does not belong to the current package/account');
        // Proof: omitting this guard admitted restores over actual current journal and history-only records (memory-history-fault-occupied-v1).
        if (
          journal.entries.some((entry) => entry.workPackageId === retained.workPackageId) ||
          journal.events.some((event) => event.workPackageId === retained.workPackageId)
        )
          throw new Error('historical journal target already has recorded history');
        // Proof: ignoring existing IDs admitted a collision with another package's actual command (memory-history-fault-entry-seed-v1).
        const entryIds = new Set(journal.entries.map(({ id }) => id));
        // Proof: ignoring existing IDs admitted a collision with another package's recorded event (memory-history-fault-event-seed-v1).
        const eventIds = new Set(journal.events.map(({ id }) => id));
        const sequences = new Set<string>();
        for (const entry of retained.entries) {
          const sequence = JSON.stringify([entry.userId, entry.personId, entry.seq]);
          // Proof: omitting this guard admitted duplicate IDs/sequences and zero, fractional or unsafe sequences (memory-history-fault-entries-v1).
          if (
            entryIds.has(entry.id) ||
            sequences.has(sequence) ||
            !Number.isSafeInteger(entry.seq) ||
            entry.seq < 1
          )
            throw new Error('historical journal entry identity or sequence is inconsistent');
          entryIds.add(entry.id);
          sequences.add(sequence);
        }
        for (const event of retained.events) {
          // Proof: omitting this guard admitted duplicate recorded event IDs (memory-history-fault-events-v1).
          if (eventIds.has(event.id)) throw new Error('historical event identity is inconsistent');
          eventIds.add(event.id);
        }
        journal.entries.push(...retained.entries);
        journal.events.push(...retained.events);
        // Proof: omitting this dependency resolved the actual late-failure control (memory-history-fault-late-dependency-v1).
        lateWrite.reach('journal-history-insert', {
          journalEventIds: retained.events.map(({ id }) => id),
        });
        committed.replaceWith(staged);
        return Promise.resolve();
      });
    },
    routeJournalEventToIndependent(eventId) {
      const index = committed.tables.journal.events.findIndex(({ id }) => id === eventId);
      // Proof: removing this guard made the real-fixture missing-route test fail
      // with `Received function did not throw; Received value: undefined`.
      if (index < 0) throw new Error(`no journal event ${eventId}`);
      const found = committed.tables.journal.events[index];
      committed.tables.journal.events.splice(index, 1);
      const moved = structuredClone(found);
      independentJournalEvents.push(moved);
      return structuredClone(moved);
    },
    independentJournalHistoryFor() {
      return Promise.resolve(structuredClone(independentJournalEvents));
    },
    journalHistoryFor(workPackageId) {
      return Promise.resolve(
        committed.tables.journal.events
          .filter((event) => event.workPackageId === workPackageId)
          .map((event) => structuredClone(event)),
      );
    },
    source: {
      createPlanExports(scheduler) {
        return {
          async readExport(workPackageId, caller) {
            const access = structuredClone(caller);
            const epoch = await coordinator.run(() => Promise.resolve(committed.clone()));
            return await readMemoryExport(
              epoch,
              workPackageId,
              access,
              scheduler,
              lateWrite,
              captureRead,
            );
          },
        };
      },
      stores,
      history,
      resourceOccupancy,
      capacityPreview,
      workPackageReportSnapshot,
      uow,
      health: () => Promise.resolve({ ok: true }),
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    },
  };
}

/** Reads one coordinator-detached committed epoch; later writes cannot supply authority, parent or document facts. */
async function readMemoryExport(
  epoch: MemoryState,
  workPackageId: string,
  access: ResourceAccess,
  scheduler: CapturedScheduler,
  lateWrite: MemoryLateWriteSeam,
  captureRead: CaptureReadSeam,
): Promise<LivePlanExportRead> {
  const creation = epoch.tables.workPackages.creation,
    directory = epoch.tables.directory;
  const activation = readMemoryOrganizationActivation(creation.activation);
  if ((access.kind === 'legacy') !== (activation === 'pre_activation'))
    return { kind: 'access_refused', refusal: 'no_active_organization' };
  if (access.kind === 'scoped') {
    if (access.principal.id !== access.scope.userId)
      throw new Error('package permission principal differs from the acting account');
    if (!directory.measureDefinitions.organizations.has(access.scope.organizationId))
      return { kind: 'access_refused', refusal: 'not_a_member' };
    if (!directory.organizationMembers.get(access.scope.organizationId)?.has(access.scope.userId))
      return { kind: 'access_refused', refusal: 'not_a_member' };
    if (!epoch.tables.users.byId.has(access.scope.userId))
      throw new Error('memory export member account is absent');
  }
  const stores = bindStores(epoch, lateWrite),
    target = await stores.workPackages.findById(workPackageId);
  if (target === null) return { kind: 'not_found' };
  const organizationId = epoch.tables.organizationLimits.workPackageOrganization.get(workPackageId);
  if (access.kind === 'scoped' && organizationId !== access.scope.organizationId)
    return { kind: 'not_found' };
  if (
    organizationId === undefined ||
    epoch.tables.workPackages.owning.get(workPackageId) !== organizationId
  )
    throw new Error('memory export package organization is absent or inconsistent');
  const organization = directory.measureDefinitions.organizations.get(organizationId);
  if (organization === undefined)
    throw new Error('memory export legacy organization is absent or inconsistent');
  const parent = creation.projects.get(target.projectId);
  if (
    parent?.organizationId !== organizationId ||
    parent.id !== target.projectId ||
    typeof parent.name !== 'string' ||
    parent.name === ''
  )
    throw new Error('memory export parent is absent or malformed');
  if (access.kind === 'scoped' && !memoryExportReadable(epoch, access, target))
    return { kind: 'not_found' };
  const reads = await capturePlanInput(epoch, workPackageId, captureRead, lateWrite);
  if (reads === null) throw new Error('memory export target disappeared inside epoch');
  const chain = readSharedPeople([reads], workPackageId, scheduler);
  if (chain.kind === 'not_found') throw new Error('memory export target disappeared inside chain');
  const [
    steps,
    workItems,
    teams,
    people,
    tags,
    services,
    types,
    externalSystems,
    resources,
    markers,
    attempts,
    seq,
  ] = await Promise.all([
    stores.workPackages.stepsOf(workPackageId),
    // Proof: raw labelled rows failed the real import/export round trips with absent own leaf orders (import-source-contract-memory-v2).
    stores.workItems.listTreeByWorkPackage(workPackageId),
    access.kind === 'legacy'
      ? stores.directory.listTeams()
      : stores.directory.listInOrganization('teams', organizationId),
    access.kind === 'legacy'
      ? stores.directory.listPeople()
      : stores.directory.listInOrganization('people', organizationId),
    access.kind === 'legacy'
      ? stores.directory.listTags()
      : stores.directory.listInOrganization('tags', organizationId),
    access.kind === 'legacy'
      ? stores.directory.listServices()
      : stores.directory.listInOrganization('services', organizationId),
    access.kind === 'legacy'
      ? stores.directory.listWorkItemTypes()
      : stores.directory.listInOrganization('workItemTypes', organizationId),
    access.kind === 'legacy'
      ? stores.directory.listExternalSystems()
      : stores.directory.listInOrganization('externalSystems', organizationId),
    access.kind === 'legacy'
      ? stores.directory.listResources()
      : stores.directory.listInOrganization('resources', organizationId),
    stores.calendarMarkers.listFor(workPackageId),
    stores.attempts.listByWorkPackage(workPackageId),
    stores.eventLog.latestSeq('work-package:' + workPackageId),
  ]);
  return structuredClone({
    kind: 'local',
    organizationId,
    workPackage: target,
    chain,
    steps,
    workItems,
    attempts,
    blockages: reads.stepBlockages,
    seq,
    document: {
      project: { id: parent.id, name: parent.name },
      directory: { teams, people, tags, services, types, externalSystems },
      markers,
      stepParallels: reads.stepParallels,
      resources: { resources, capacities: reads.resourceCapacities, demands: reads.demands },
      measures: {
        definitions: reads.measureDefinitions,
        facts: reads.measures,
        estimates: reads.measureEstimates,
        budgets: reads.budgets,
      },
    },
  });
}

interface HistoryState {
  readonly plans: Map<string, StoredSavedPlanBytes>;
}

/** Compose current identity evidence beside detached immutable bytes, independent of the stored body version. */
function readMemorySavedPlan(stored: StoredSavedPlanBytes, epoch: MemoryState): StoredSavedPlan {
  return {
    ...structuredClone(stored),
    stepIdentity: readMemoryStepIdentityIn(epoch, stored.header.workPackageId),
  };
}

function savedPlanRow(plan: SavedPlanWrite): SavedPlanRow {
  return {
    id: plan.id,
    workPackageId: plan.workPackageId,
    name: plan.name,
    createdBy: plan.createdBy,
    createdById: plan.createdById,
    createdAt: plan.createdAt,
    inputSchemaVersion: plan.input.schemaVersion,
    inputBytes: new TextEncoder().encode(plan.input.bytes).byteLength,
    inputSha256: plan.input.sha256,
    scheduleSchemaVersion: plan.schedule.present ? plan.schedule.body.schemaVersion : null,
    scheduleBytes: plan.schedule.present
      ? new TextEncoder().encode(plan.schedule.body.bytes).byteLength
      : null,
    scheduleSha256: plan.schedule.present ? plan.schedule.body.sha256 : null,
    scheduleInputSha256: plan.schedule.present ? plan.schedule.inputSha256 : null,
    schedulerAlgorithmId: plan.schedule.present ? plan.schedule.algorithmId : null,
    scheduleAbsentReason: plan.schedule.present ? null : plan.schedule.absentReason,
  };
}

function assertSavedPlanScheduleBoundary(
  plan: SavedPlanWrite,
  stored: StoredSavedPlanBytes | undefined,
): asserts stored is StoredSavedPlanBytes {
  // Proof: removing this guard changed the adapter-owned missing-input proof
  // from `phase-failed` to `observed` after the invalid boundary reached.
  if (
    stored === undefined ||
    JSON.stringify(stored.header) !== JSON.stringify(savedPlanRow(plan)) ||
    stored.bodies.input !== plan.input.bytes
  )
    throw new Error('saved-plan schedule boundary lacks complete header and input');
}

/** A memory history source has no membership or durable audit to admit scoped writes. */
function refuseScopedSavedPlanWrite(scoped: ScopedSavedPlanWrite | undefined): void {
  // Proof: skipping this refusal on rename made `refuses scoped saved-plan
  // writes without a transactional membership source` receive a resolved
  // Promise instead of a throw; watched 2026-09-28.
  if (scoped !== undefined) throw new Error('memory saved plans cannot classify scoped writes');
}

function memorySavedPlans(
  readActivation: () => 'pre_activation' | 'activated',
  state: HistoryState,
  captureState: () => MemoryState,
  stores: () => TransactionalStores,
  writeTurn: <T>(act: () => Promise<T>) => Promise<T>,
  lateWrite: MemoryLateWriteSeam,
): SavedPlanStore {
  const touchLegacy = (
    savedPlanId: string,
    touch: LegacySavedPlanTouch,
    mutation: SavedPlanTouchMutation,
  ): SavedPlanTouchOutcome => {
    if (readActivation() !== 'pre_activation')
      return touch.source === 'human' ? 'organization_context_changed' : 'no_active_organization';
    const found = state.plans.get(savedPlanId);
    if (found === undefined) return 'no_such_plan';
    if (found.header.createdById !== touch.actorId) return 'forbidden';
    if (mutation.operation === 'delete') state.plans.delete(savedPlanId);
    else
      state.plans.set(savedPlanId, { ...found, header: { ...found.header, name: mutation.name } });
    return 'touched';
  };
  return {
    write: (plan, check, scoped) => {
      refuseScopedSavedPlanWrite(scoped);
      const expectedPlan = structuredClone(plan);
      return writeTurn(async () => {
        const rows = [...state.plans.values()].filter(
          (stored) => stored.header.workPackageId === plan.workPackageId,
        );
        const holding = {
          plans: rows.length,
          bytes: rows.reduce(
            (sum, stored) => sum + stored.header.inputBytes + (stored.header.scheduleBytes ?? 0),
            0,
          ),
        };
        const incoming =
          new TextEncoder().encode(plan.input.bytes).byteLength +
          (plan.schedule.present
            ? new TextEncoder().encode(plan.schedule.body.bytes).byteLength
            : 0);
        const refusal = await check(holding, incoming);
        if (refusal !== null) return { outcome: 'refused', refusal };
        const staged = structuredClone(state.plans);
        const pending: StoredSavedPlanBytes = {
          header: savedPlanRow(plan),
          bodies: {
            input: plan.input.bytes,
            schedule: null,
          },
        };
        staged.set(plan.id, pending);
        if (plan.schedule.present) {
          if (lateWrite.isActive?.('saved-plan-schedule-body') === true) {
            lateWrite.observeBoundary?.('saved-plan-schedule-body', {
              savedPlan: structuredClone(pending),
            });
            assertSavedPlanScheduleBoundary(expectedPlan, pending);
            lateWrite.reach('saved-plan-schedule-body', {
              savedPlan: structuredClone(pending),
            });
          } else lateWrite.reach('saved-plan-schedule-body');
          staged.set(plan.id, {
            ...pending,
            bodies: { ...pending.bodies, schedule: plan.schedule.body.bytes },
          });
        }
        replaceMap(state.plans, staged);
        return { outcome: 'written' };
      });
    },
    readOf(savedPlanId) {
      // The Source fence and current graph are acquired before absence can return null.
      const epoch = captureState();
      const found = state.plans.get(savedPlanId);
      return Promise.resolve(found === undefined ? null : readMemorySavedPlan(found, epoch));
    },
    listOf(workPackageId) {
      const rows = [...state.plans.values()]
        .filter((stored) => stored.header.workPackageId === workPackageId)
        .map((stored) => structuredClone(stored.header))
        .sort((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id));
      return Promise.resolve(rows);
    },
    async principalsOf(savedPlanId) {
      const found = state.plans.get(savedPlanId);
      if (found === undefined) return null;
      const workPackage = await stores().workPackages.findById(found.header.workPackageId);
      if (workPackage === null)
        throw new Error(`saved plan ${savedPlanId} names an absent work package`);
      return {
        savedPlanId,
        workPackageId: found.header.workPackageId,
        createdById: found.header.createdById,
      };
    },
    async renameTo(savedPlanId, name, touch) {
      touch = retainSavedPlanTouch(touch, 'rename', name);
      if (!('kind' in touch)) {
        refuseScopedSavedPlanWrite(touch);
        throw new Error('scoped memory touch was not refused');
      }
      const retained = touch;
      return await writeTurn(() =>
        Promise.resolve(touchLegacy(savedPlanId, retained, { operation: 'rename', name })),
      );
    },
    async deleteOf(savedPlanId, touch) {
      touch = retainSavedPlanTouch(touch, 'delete');
      if (!('kind' in touch)) {
        refuseScopedSavedPlanWrite(touch);
        throw new Error('scoped memory touch was not refused');
      }
      const retained = touch;
      return await writeTurn(() =>
        Promise.resolve(touchLegacy(savedPlanId, retained, { operation: 'delete' })),
      );
    },
  };
}

/** Captures current package facts only with actual same-epoch organization and parent correspondence. */
async function capturePlanInput(
  epoch: MemoryState,
  workPackageId: string,
  captureRead: CaptureReadSeam,
  lateWrite: MemoryLateWriteSeam,
): Promise<ResolvedPlanInputReads | null> {
  const stores = bindStores(epoch, lateWrite);
  const workPackage = await stores.workPackages.findById(workPackageId);
  if (workPackage === null) return null;
  const timezone = await stores.workPackages.timezoneOf(workPackageId);
  if (timezone === null) throw new Error(`work package "${workPackageId}" has no timezone`);
  await captureRead.afterFirstRead({ workPackageId, workPackage: { ...workPackage, timezone } });
  const organizationId = epoch.tables.organizationLimits.workPackageOrganization.get(workPackageId);
  if (
    organizationId === undefined ||
    organizationId === '' ||
    epoch.tables.workPackages.owning.get(workPackageId) !== organizationId ||
    !epoch.tables.directory.measureDefinitions.organizations.has(organizationId)
  )
    throw new Error('captured package organization is absent or inconsistent');
  if (typeof workPackage.projectId !== 'string' || workPackage.projectId === '')
    throw new Error('captured package parent identity is malformed');
  const parent = epoch.tables.workPackages.creation.projects.get(workPackage.projectId);
  if (parent?.id !== workPackage.projectId || parent.organizationId !== organizationId)
    throw new Error('captured package parent is absent or inconsistent');
  const [
    steps,
    workItems,
    estimates,
    actuals,
    progress,
    stepBlockages,
    stepParallels,
    measures,
    measureDefinitions,
    measureEstimates,
    budgets,
    dependencies,
    typedDependencies,
    assignmentRows,
    capacity,
    demands,
    resourceCapacities,
    resourceCatalog,
    priorityBands,
    people,
    teams,
    services,
    tags,
    workItemTypes,
    externalSystems,
  ] = await Promise.all([
    stores.workPackages.stepsOf(workPackageId),
    stores.workItems.listByWorkPackage(workPackageId),
    stores.estimates.listByWorkPackage(workPackageId),
    stores.actuals.listByWorkPackage(workPackageId),
    stores.progress.listByWorkPackage(workPackageId),
    // Proof: capture read replaced with empty; detached blockage capture test failed (memory-source.test.ts), 2026-10-14.
    stores.blockages.listByWorkPackage(workPackageId),
    // Proof: snapshot read replaced with empty; detached sparse capture failed (memory-read.txt), 2026-10-17.
    stores.stepParallels.listByWorkPackage(workPackageId),
    stores.measures.listByWorkPackage(workPackageId),
    stores.measures.definitionsFor(workPackageId),
    // Proof: either read replaced with `[]` made the memory run of the
    // conformance case `savedPlanCapture.readPlanInput:complete` capture none
    // (source-conformance.test.ts: 75 pass became 8 fail, verified by the
    // PR #681 review); watched 2026-10-23.
    stores.measureEstimates.listByWorkPackage(workPackageId),
    stores.budgets.listByWorkPackage(workPackageId),
    stores.dependencies.listByWorkPackage(workPackageId),
    stores.typedDependencies.listIncident([workPackageId]),
    stores.directory.assignmentsInWorkPackage(workPackageId),
    stores.capacity.slotsFor(workPackageId),
    stores.demands.listByWorkPackage(workPackageId),
    stores.resourceCapacity.listFor(workPackageId),
    stores.directory.listResources(),
    stores.priorityBands.listFor(workPackageId),
    stores.directory.listPeople(),
    stores.directory.listTeams(),
    stores.directory.listServices(),
    stores.directory.listTags(),
    stores.directory.listWorkItemTypes(),
    stores.directory.listExternalSystems(),
  ]);
  // Attach every batch rejection before the tree read, which can throw synchronously.
  // The earlier batched placement stranded a rejected step read in the missing-values control.
  // Proof: the ordinary-row handoff failed the actual current Memory capture on absent metadata;
  // retaining the mutable committed graph failed its rival type-edit snapshot control (2026-11-20).
  const resolvedRows = await stores.workItems.listTreeByWorkPackage(workPackageId);
  const resourceIds = scheduleResourceIdsOf(workItems, resourceCapacities, demands);
  // Proof: omitting the read made the competing-write memory capture test
  // lose the earlier 16-unit directory statement while retaining raw 32.
  const directoryCapacities =
    resourceIds.length === 0 ? [] : await stores.directory.directoryCapacitiesOf(resourceIds);
  return structuredClone({
    workPackage: { ...workPackage, timezone },
    steps,
    workItems,
    leafSteps: captureLeafStepOrders(workItems, resolvedRows),
    estimates,
    actuals,
    progress,
    stepBlockages,
    stepParallels,
    measures,
    measureDefinitions,
    measureEstimates,
    budgets,
    dependencies,
    typedDependencies: typedDependencies.map(captureLocalTypedDependency),
    assignments: assignmentRows.assignments,
    capacity,
    // Proof: both reads replaced with `[]` made `captures demands and resource
    // capacities detached from later memory writes` (memory-source.test.ts)
    // capture none; watched 2026-10-20.
    demands,
    resourceCapacities,
    directoryCapacities,
    resources: resourceCatalog,
    priorityBands,
    people,
    teams,
    services,
    tags,
    workItemTypes,
    externalSystems,
  });
}

function memoryHistory(
  readActivation: () => 'pre_activation' | 'activated',
  state: HistoryState,
  assertOpen: () => void,
  captureState: () => MemoryState,
  writeTurn: <T>(act: () => Promise<T>) => Promise<T>,
  captureTurn: <T>(act: () => Promise<T>) => Promise<T> = async (act) => await act(),
  lateWrite: MemoryLateWriteSeam = inertMemoryLateWriteSeam,
  captureRead: CaptureReadSeam = inertMemoryCaptureReadSeam,
): Source<TransactionalStores>['history'] {
  return {
    savedPlans: memorySavedPlans(
      readActivation,
      state,
      captureState,
      () => bindStores(captureState(), lateWrite),
      writeTurn,
      lateWrite,
    ),
    savedPlanCapture: {
      readPlanInput(workPackageId) {
        // Capture gets a detached committed graph before its first awaited read.
        const epoch = captureState();
        return captureTurn(async () => {
          const captured = await capturePlanInput(
            epoch,
            workPackageId,
            {
              async afterFirstRead(reading) {
                await captureRead.afterFirstRead(reading);
                assertOpen();
              },
            },
            lateWrite,
          );
          assertOpen();
          return captured;
        });
      },
    },
  };
}
