import type {
  OrganizationLimitGauge,
  PlanEvent,
  PlanInputReads,
  SavedPlanHoldingRow,
  SavedPlanRow,
  SavedPlanStore,
  SavedPlanWrite,
  SavedPlanWriteOutcome,
  ScopedSavedPlanWrite,
  Source,
  StoredDependency,
  StoredSavedPlan,
  TransactionalStores,
} from '@wbs/core';
import type { OrganizationLimitValues } from '@wbs/domain';

import { type CaptureReadSeam, inertMemoryCaptureReadSeam } from './capture-read-seam';
import { endMemoryLeases } from './claim-fixture';
import { inertMemoryLateWriteSeam, type MemoryLateWriteSeam } from './late-write-seam';
import { seedMemoryOrganization } from './measure-definition-fixture';
import { bindStores, MemoryState, replaceMap } from './memory-stores';
import {
  checkedOrganizationLimits,
  inMemoryOrganizationLimitGauge,
} from './organization-limits-fixture';

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

function coordinatedStores(
  stores: TransactionalStores,
  coordinator: MemoryCoordinator,
): TransactionalStores {
  return {
    runtimeCommands: coordinatedStore(
      stores.runtimeCommands,
      ['compareAuthority', 'insertBinding', 'insertAcceptance'],
      coordinator,
    ),
    users: coordinatedStore(stores.users, ['create', 'resolveOidcIdentity'], coordinator),
    projects: coordinatedStore(
      stores.projects,
      ['create', 'recordOpen', 'update', 'setStepAllowance'],
      coordinator,
    ),
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
      stores.typedDependencies,
      ['add', 'update', 'remove', 'removeAllFor'],
      coordinator,
    ),
    subtrees: coordinatedStore(stores.subtrees, ['insertSubtree'], coordinator),
    journal: coordinatedStore(
      stores.journal,
      ['append', 'flip', 'restamp', 'discard'],
      coordinator,
    ),
  };
}

/** Opens a staged in-memory source with no ambient runtime dependencies. */
export function openMemorySource(): Source<TransactionalStores> {
  return openMemorySourceWithSeams(inertMemoryLateWriteSeam, inertMemoryCaptureReadSeam).source;
}

/**
 * Conformance-only source fixture with a reader for the journal's own history table.
 *
 * @internal
 */
export interface MemorySourceFixture {
  readonly source: Source<TransactionalStores>;
  /** Runs capture and directory writes in one forbidden staged owner, then rolls it back. */
  captureWithStagedDirectoryRollback(
    projectId: string,
    stamp: { readonly at: number; readonly by: string },
    observe: (evidence: {
      readonly project: PlanInputReads['project'];
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
   * Gives a project an owning organization, the `project_organization` row
   * SQLite holds and no memory port writes, so the limits gauge counts its claims.
   */
  ownProjectInOrganization(projectId: string, organizationId: string): void;
  /**
   * Gives a resource an owning organization, the `resource_organization` row
   * SQLite holds, so the limits gauge sums its stated capacity.
   */
  ownResourceInOrganization(resourceId: string, organizationId: string): void;
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
  journalHistoryFor(projectId: string): Promise<PlanEvent[]>;
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
    observeBoundary?: (stored: StoredSavedPlan) => void,
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
  const history = memoryHistory(
    historyState,
    () => bindStores(committed.clone(), lateWrite),
    async (act) => await historyCoordinator.run(act),
    undefined,
    lateWrite,
    captureRead,
  );
  const stores = coordinatedStores(bindStores(committed, lateWrite), coordinator);
  const activeCommandHistory = (): SavedPlanStore => {
    if (commandHistoryState === null) throw new Error('command history stage is not active');
    return memorySavedPlans(
      commandHistoryState,
      () => bindStores(committed.clone(), lateWrite),
      async (act) => await act(),
      lateWrite,
    );
  };
  const commandStagedSavedPlans: SavedPlanStore = {
    write: (plan, check, scoped) => activeCommandHistory().write(plan, check, scoped),
    readOf: (id) => activeCommandHistory().readOf(id),
    listOf: (projectId) => activeCommandHistory().listOf(projectId),
    principalsOf: (id) => activeCommandHistory().principalsOf(id),
    renameTo: (id, name, scoped) => activeCommandHistory().renameTo(id, name, scoped),
    deleteOf: (id, scoped) => activeCommandHistory().deleteOf(id, scoped),
  };

  return {
    commandStagedSavedPlans,
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
        (stored) => stored.header.projectId === plan.projectId,
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
    captureWithStagedDirectoryRollback(projectId, stamp, observe) {
      return coordinator.run(async () => {
        const staged = committed.clone();
        const stagedStores = bindStores(staged, lateWrite);
        await capturePlanInput(stagedStores, projectId, {
          async afterFirstRead({ project }) {
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
            observe({ project, tag, person, tags, people });
            throw new Error('injected staged-owner capture rollback');
          },
        });
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
          (stored) => stored.header.projectId === plan.projectId,
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
    ownProjectInOrganization(projectId, organizationId) {
      committed.tables.organizationLimits.projectOrganization.set(projectId, organizationId);
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
    journalHistoryFor(projectId) {
      return Promise.resolve(
        committed.tables.journal.events
          .filter((event) => event.projectId === projectId)
          .map((event) => structuredClone(event)),
      );
    },
    source: {
      stores,
      history,
      uow: {
        run: (act) =>
          coordinator.run(async () => {
            const staged = committed.clone();
            const decision = await act({ stores: bindStores(staged, lateWrite, limits) });
            // Proof: unconditional commit injected; sparse override replacement/removal rollback negative failed (memory-rollback.txt), 2026-10-15.
            if (decision.commit) committed.replaceWith(staged);
            else if (decision.afterRollback !== undefined) {
              await decision.afterRollback({ stores: bindStores(committed, lateWrite, limits) });
            }
            return decision.value;
          }),
      },
      health: () => Promise.resolve({ ok: true }),
      close: () => Promise.resolve(),
    },
  };
}

interface HistoryState {
  readonly plans: Map<string, StoredSavedPlan>;
}

function savedPlanRow(plan: SavedPlanWrite): SavedPlanRow {
  return {
    id: plan.id,
    projectId: plan.projectId,
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
  stored: StoredSavedPlan | undefined,
): asserts stored is StoredSavedPlan {
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
  state: HistoryState,
  stores: () => TransactionalStores,
  writeTurn: <T>(act: () => Promise<T>) => Promise<T>,
  lateWrite: MemoryLateWriteSeam,
): SavedPlanStore {
  return {
    write: (plan, check, scoped) => {
      refuseScopedSavedPlanWrite(scoped);
      const expectedPlan = structuredClone(plan);
      return writeTurn(async () => {
        const rows = [...state.plans.values()].filter(
          (stored) => stored.header.projectId === plan.projectId,
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
        const pending: StoredSavedPlan = {
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
      const found = state.plans.get(savedPlanId);
      return Promise.resolve(found === undefined ? null : structuredClone(found));
    },
    listOf(projectId) {
      const rows = [...state.plans.values()]
        .filter((stored) => stored.header.projectId === projectId)
        .map((stored) => structuredClone(stored.header))
        .sort((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id));
      return Promise.resolve(rows);
    },
    async principalsOf(savedPlanId) {
      const found = state.plans.get(savedPlanId);
      if (found === undefined) return null;
      const project = await stores().projects.findById(found.header.projectId);
      if (project === null) throw new Error(`saved plan ${savedPlanId} names an absent project`);
      return {
        savedPlanId,
        projectId: found.header.projectId,
        projectOwnerId: project.ownerId,
        createdById: found.header.createdById,
      };
    },
    renameTo(savedPlanId, name, scoped) {
      refuseScopedSavedPlanWrite(scoped);
      const found = state.plans.get(savedPlanId);
      if (found === undefined) return Promise.resolve('no_such_plan');
      state.plans.set(savedPlanId, {
        ...found,
        header: { ...found.header, name },
      });
      return Promise.resolve('touched');
    },
    deleteOf(savedPlanId, scoped) {
      refuseScopedSavedPlanWrite(scoped);
      return Promise.resolve(state.plans.delete(savedPlanId) ? 'touched' : 'no_such_plan');
    },
  };
}

async function capturePlanInput(
  stores: TransactionalStores,
  projectId: string,
  captureRead: CaptureReadSeam,
): Promise<PlanInputReads | null> {
  const project = await stores.projects.findById(projectId);
  if (project === null) return null;
  const timezone = await stores.projects.timezoneOf(projectId);
  if (timezone === null) throw new Error(`project "${projectId}" has no timezone`);
  await captureRead.afterFirstRead({ projectId, project: { ...project, timezone } });
  const [
    steps,
    workItems,
    estimates,
    actuals,
    progress,
    stepBlockages,
    stepParallels,
    measures,
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
    stores.projects.stepsOf(projectId),
    stores.workItems.listByProject(projectId),
    stores.estimates.listByProject(projectId),
    stores.actuals.listByProject(projectId),
    stores.progress.listByProject(projectId),
    // Proof: capture read replaced with empty; detached blockage capture test failed (memory-source.test.ts), 2026-10-14.
    stores.blockages.listByProject(projectId),
    // Proof: snapshot read replaced with empty; detached sparse capture failed (memory-read.txt), 2026-10-17.
    stores.stepParallels.listByProject(projectId),
    stores.measures.listByProject(projectId),
    // Proof: either read replaced with `[]` made the memory run of the
    // conformance case `savedPlanCapture.readPlanInput:complete` capture none
    // (source-conformance.test.ts: 75 pass became 8 fail, verified by the
    // PR #681 review); watched 2026-10-23.
    stores.measureEstimates.listByProject(projectId),
    stores.budgets.listByProject(projectId),
    stores.dependencies.listByProject(projectId),
    stores.typedDependencies.listByProject(projectId),
    stores.directory.assignmentsInProject(projectId),
    stores.capacity.slotsFor(projectId),
    stores.demands.listByProject(projectId),
    stores.resourceCapacity.listFor(projectId),
    stores.directory.listResources(),
    stores.priorityBands.listFor(projectId),
    stores.directory.listPeople(),
    stores.directory.listTeams(),
    stores.directory.listServices(),
    stores.directory.listTags(),
    stores.directory.listWorkItemTypes(),
    stores.directory.listExternalSystems(),
  ]);
  return structuredClone({
    project: { ...project, timezone },
    steps,
    workItems,
    estimates,
    actuals,
    progress,
    stepBlockages,
    stepParallels,
    measures,
    measureEstimates,
    budgets,
    dependencies,
    typedDependencies: typedDependencies.map(({ id, predecessor, successor, type }) => ({
      id,
      predecessor,
      successor,
      type,
    })),
    assignments: assignmentRows.assignments,
    capacity,
    // Proof: both reads replaced with `[]` made `captures demands and resource
    // capacities detached from later memory writes` (memory-source.test.ts)
    // capture none; watched 2026-10-20.
    demands,
    resourceCapacities,
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
  state: HistoryState,
  stores: () => TransactionalStores,
  writeTurn: <T>(act: () => Promise<T>) => Promise<T>,
  captureTurn: <T>(act: () => Promise<T>) => Promise<T> = async (act) => await act(),
  lateWrite: MemoryLateWriteSeam = inertMemoryLateWriteSeam,
  captureRead: CaptureReadSeam = inertMemoryCaptureReadSeam,
): Source<TransactionalStores>['history'] {
  return {
    savedPlans: memorySavedPlans(state, stores, writeTurn, lateWrite),
    savedPlanCapture: {
      readPlanInput(projectId) {
        // Capture gets a detached committed graph before its first awaited read.
        const epoch = stores();
        return captureTurn(async () => await capturePlanInput(epoch, projectId, captureRead));
      },
    },
  };
}
