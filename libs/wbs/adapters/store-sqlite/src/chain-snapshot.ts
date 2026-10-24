import type {
  CapturedScheduleAsk,
  ChainAccess,
  ChainSnapshot,
  ChainSnapshotStore,
  ConnectedPlanCapture,
  LivePlanAggregate,
  LivePlanRead,
  LivePlanStore,
  OptimizedScheduleAdapter,
  OrganizationPrincipal,
  PlanInputReads,
  Project,
  ResourceAccess,
  Scheduler,
  ScheduleRead,
  SharedPeopleRead,
  StoredAttempt,
} from '@wbs/core';
import { deriveConnectedPlan, deriveConnectedReadiness, readChain } from '@wbs/core';
import { eq } from 'drizzle-orm';

import { CalendarMarkerRepository } from './calendar-marker';
import type { CaptureReadSeam } from './capture-read-seam';
import type { CapturedOptimizationReaderOptions } from './captured-optimization-reader';
import { capturedSchedulerIn, type ConnectedCaptureOptions } from './captured-scheduler';
import { captureConnectedPlanIn, discoverConnectedTopologyIn } from './connected-plan-capture';
import {
  type Connection,
  type Drizzle,
  drizzleReadTransaction,
  openReadOnlyConnection,
} from './db';
import { DirectoryRepository } from './directory';
import { DrizzleEventLogStore } from './event-log';
import { readExecutionIn } from './execution-read';
import { OPEN } from './gate';
import { MeasureEstimateRepository } from './measure-estimate';
import {
  type ActiveOrganizationOf,
  currentMembershipAccess,
  SqliteOrganizationAccess,
} from './organization-access';
import { readOrganizationActivation } from './organization-activation';
import { ProjectRepository } from './project';
import { ProjectRankRepository } from './project-rank';
import { createReadSnapshotLifetime, type ReadSnapshotLifetime } from './read-snapshot-lifetime';
import { DemandRepository, ResourceCapacityRepository } from './resource';
import { readPlanInputIn } from './saved-plan-capture';
import { incomingCalendarHash, scheduleInputHash } from './schedule-input-hash';
import { projectOrganization } from './schema';
import { readCapacityMode } from './shared-people-mode';
import { StepBlockageRepository } from './step-blockage';
import { StepMeasureRepository } from './step-measure';
import { StepNodeAttemptRepository } from './step-node-attempt';
import { StepParallelRepository } from './step-parallel';
import { WorkItemRepository } from './work-item';
import { WorkItemBudgetRepository } from './work-item-budget';

export interface ChainSnapshotOptions {
  /** Optional diagnostic seam; it never substitutes captured values or authority. */
  readonly captureRead?: CaptureReadSeam;
  /** A dedicated openReadOnlyConnection, closed on every outcome. */
  readonly openConnection: () => Connection;
  /** Binds session/binding reads to the same connection as membership and rank. */
  readonly activeOrganizationOf: (db: Drizzle) => ActiveOrganizationOf;
  /** Builds capture-mode scheduling around this snapshot's optimized cache reader. */
  readonly schedulerOf: (
    readCaptured: OptimizedScheduleAdapter['readCaptured'] | undefined,
  ) => Scheduler;
  readonly optimization?: CapturedOptimizationReaderOptions;
  /** The reading service's injected clock, for the session policy at admission. */
  readonly now: () => number;
}

/** Private derivation options; only explicit fixtures opt in before coordinator integration. */
type LiveCaptureOptions = Pick<
  ChainSnapshotOptions,
  'schedulerOf' | 'optimization' | 'captureRead'
> & {
  readonly connected?: ConnectedCaptureOptions;
};

/**
 * Owns one snapshot through current authorization, rank, assignments, required plan capture,
 * cache selection and application scheduling. Returned values borrow no database capability.
 */
export class ChainSnapshotRepository implements ChainSnapshotStore {
  constructor(
    private readonly options: ChainSnapshotOptions,
    private readonly captureRead?: CaptureReadSeam,
  ) {}

  async withSnapshot(
    principal: OrganizationPrincipal,
    projectId: string,
    read: (snapshot: ChainSnapshot) => SharedPeopleRead | Promise<SharedPeopleRead>,
  ) {
    const connection = this.options.openConnection();
    const lifetime = createReadSnapshotLifetime();
    try {
      const db = connection.db;
      // Proof: removing the transaction made rank/assignment/date read 2 instead of 3; connected predecessor/cache tests saw edited/failed within the first observation.
      const transaction = drizzleReadTransaction(db);
      transaction.begin();
      try {
        const resolved = await new SqliteOrganizationAccess(
          db,
          this.options.activeOrganizationOf(db),
          this.options.now,
        ).resolve(principal);
        if (!resolved.ok) {
          lifetime.expire();
          transaction.commit();
          return resolved;
        }
        const access = resolved.access;
        const projects = new ProjectRepository(db, OPEN);
        // Proof: reading mode on a fresh connection failed the authority-bound concurrent-mode test.
        const mode =
          access.kind === 'legacy' ? 'isolated' : readCapacityMode(db, access.scope.organizationId);
        let readable: readonly Project[];
        // Proof: removing target selection failed `never materializes upstream assignments for isolated or legacy targets`.
        if (mode === 'isolated') {
          const project =
            access.kind === 'scoped'
              ? await projects.findInOrganization(projectId, access.scope.organizationId)
              : await projects.findById(projectId);
          readable = project === null ? [] : [project];
        } else {
          readable =
            access.kind === 'scoped'
              ? await projects.listForInOrganization(principal.id, access.scope.organizationId)
              : await projects.listFor(principal.id);
        }
        const value = await read(
          await readChainSnapshotIn(
            db,
            access,
            readable,
            projectId,
            this.options,
            lifetime,
            this.captureRead ?? this.options.captureRead,
          ),
        );
        lifetime.expire();
        transaction.commit();
        return { ok: true as const, value };
      } catch (failure) {
        lifetime.expire();
        transaction.rollback();
        throw failure;
      }
    } finally {
      // Proof: omitting close left the capture-throw negative at zero closes instead of one.
      lifetime.expire();
      connection.close();
    }
  }
  async withProjectSnapshot(
    projectId: string,
    read: (snapshot: ChainSnapshot) => SharedPeopleRead | Promise<SharedPeopleRead>,
  ): Promise<SharedPeopleRead> {
    const connection = this.options.openConnection();
    const lifetime = createReadSnapshotLifetime();
    try {
      const db = connection.db;
      // Proof: a no-op transaction failed the background concurrent-mode/assignment/date test (2 instead of 3).
      const transaction = drizzleReadTransaction(db);
      transaction.begin();
      try {
        const projects = new ProjectRepository(db, OPEN);
        const target = await projects.findById(projectId);
        let value: SharedPeopleRead;
        if (target === null) value = { kind: 'not_found' };
        else {
          const activation = readOrganizationActivation(db);
          const owner = db
            .select({ organizationId: projectOrganization.organizationId })
            .from(projectOrganization)
            .where(eq(projectOrganization.resourceId, projectId))
            .get();
          const access: ChainAccess =
            activation === 'pre_activation'
              ? { kind: 'legacy' }
              : { kind: 'scoped', scope: { organizationId: requireOwnership(owner) } };
          const mode =
            access.kind === 'legacy'
              ? 'isolated'
              : readCapacityMode(db, access.scope.organizationId);
          // Proof: disabling target selection failed `never lists organization projects or ranks for isolated or legacy targets` after the human read succeeded.
          const readable =
            mode === 'isolated'
              ? [target]
              : await Promise.all(
                  (await new ProjectRankRepository(db, OPEN).orderIn(requireOwnership(owner))).map(
                    async (each) => {
                      const project = await projects.findInOrganization(
                        each.projectId,
                        requireOwnership(owner),
                      );
                      // Proof: removing this guard failed `refuses a broken project-owned readable dependency`.
                      if (project === null) throw new Error('rank names an unreadable project');
                      return project;
                    },
                  ),
                );
          value = await read(
            await readChainSnapshotIn(
              db,
              access,
              readable,
              projectId,
              this.options,
              lifetime,
              this.captureRead ?? this.options.captureRead,
            ),
          );
        }
        // Proof: omitting commit failed the background lifecycle test at the close-time nested BEGIN.
        lifetime.expire();
        transaction.commit();
        return value;
      } catch (failure) {
        lifetime.expire();
        transaction.rollback();
        throw failure;
      }
    } finally {
      // Proof: omitting close failed the background lifecycle test (0 instead of 1 closes).
      lifetime.expire();
      connection.close();
    }
  }
}

/** Opens a dedicated read-only chain snapshot; shared-mode installation remains a caller decision. */
export function createChainSnapshotStore(
  options: Omit<ChainSnapshotOptions, 'openConnection'> & { readonly dbPath: string },
): ChainSnapshotStore {
  return new ChainSnapshotRepository({
    ...options,
    // Proof: a writable connection made the production-factory negative commit the injected unsafe rename.
    openConnection: () => openReadOnlyConnection(options.dbPath),
  });
}

/** Borrows an authorized transaction including staged writes; never begins, commits or closes it. */
export async function readChainSnapshotIn(
  db: Drizzle,
  access: ChainAccess,
  readable: readonly Project[],
  projectId: string,
  options: LiveCaptureOptions,
  lifetime: ReadSnapshotLifetime,
  captureRead?: CaptureReadSeam,
): Promise<ChainSnapshot> {
  // Proof: omitted acquisition check issued one mode query in the retained transaction snapshot test.
  lifetime.assertOpen();
  const directory = new DirectoryRepository(db, OPEN);
  const mode =
    access.kind === 'legacy' ? 'isolated' : readCapacityMode(db, access.scope.organizationId);
  // Proof: bypassing isolated rank selection failed `never lists organization projects or ranks for isolated or legacy targets`.
  const order =
    mode === 'shared' && access.kind === 'scoped'
      ? (await new ProjectRankRepository(db, OPEN).orderIn(access.scope.organizationId)).map(
          (each) => each.projectId,
        )
      : readable.filter((each) => each.id === projectId).map((each) => each.id);
  const visible = new Map(
    readable
      .filter((each) => mode === 'shared' || each.id === projectId)
      .map((each) => [each.id, each]),
  );
  const connected = new Map<string, ConnectedPlanCapture>();
  let capturing: Promise<ConnectedPlanCapture> | undefined;
  const candidates: ChainSnapshot['projects'][number][] = [];
  for (const projectId of order) {
    lifetime.assertOpen();
    const project = visible.get(projectId);
    // Proof: removing this check made the broken readable-list negative accept inconsistent rank.
    if (project === undefined) throw new Error('rank names an unreadable project');
    candidates.push({
      project,
      assignments: (await directory.assignmentsInProject(projectId)).assignments,
    });
  }
  lifetime.assertOpen();
  const { scheduler } = capturedSchedulerIn(db, options, lifetime);
  return {
    access,
    mode,
    projects: candidates,
    captureConnected: async (targetId) => {
      lifetime.assertOpen();
      // Proof: concurrent component requests read a1/a2 twice without serialization.
      while (capturing !== undefined) {
        await capturing;
        lifetime.assertOpen();
      }
      const held = connected.get(targetId);
      if (held !== undefined) return held;
      const fresh = captureConnectedPlanIn(db, access, targetId, lifetime, captureRead);
      capturing = fresh;
      try {
        const captured = await fresh;
        lifetime.assertOpen();
        for (const project of captured.projects) connected.set(project.projectId, captured);
        return captured;
      } finally {
        capturing = undefined;
      }
    },
    capturePlan: async (projectId) => {
      lifetime.assertOpen();
      // Proof: removing this guard failed the borrowed foreign-project capture negative.
      if (!visible.has(projectId)) throw new Error('chain capture names an unreadable project');
      const captured = await readPlanInputIn(db, projectId, lifetime, captureRead, access);
      lifetime.assertOpen();
      // Proof: removing this guard made the missing captured-project negative lose its trusted-state refusal.
      if (captured === null) throw new Error('ranked project disappeared inside its snapshot');
      return captured;
    },
    scheduler,
  };
}

function requireOwnership(owner: { organizationId: string } | undefined): string {
  // Proof: removing this guard failed `refuses corrupt mode and broken background ownership`.
  if (owner === undefined) throw new Error('project ownership is absent');
  return owner.organizationId;
}

/** Binds both reader lifetimes to one scheduling configuration without exposing connections to core. */
export function createLivePlanStore(
  options: LiveCaptureOptions &
    (
      | { readonly kind: 'owned'; readonly openConnection: () => Connection }
      | { readonly kind: 'borrowed'; readonly db: Drizzle; readonly lifetime: ReadSnapshotLifetime }
    ),
): LivePlanStore {
  // Proof: omitted acquisition check returned a new reader for the expired-scope factory test.
  if (options.kind === 'borrowed') options.lifetime.assertOpen();
  async function observe<T>(
    read: (db: Drizzle, lifetime: ReadSnapshotLifetime) => Promise<T>,
  ): Promise<T> {
    if (options.kind === 'borrowed') {
      // Proof: a fresh connection also made borrowed shared aggregate miss its staged edge (connected became shared).
      // Proof: replacing this borrowed db with a fresh snapshot fails mounted staged arrangement/preflight.
      // Proof: fresh borrowed connection observed failed instead of idle in `borrowed isolated real selection excludes a rival publication`.
      // Proof: omitted entry check issued 22 SQL reads through expired source readers.
      options.lifetime.assertOpen();
      const observed = await read(options.db, options.lifetime);
      options.lifetime.assertOpen();
      return observed;
    }
    const connection = options.openConnection();
    const lifetime = createReadSnapshotLifetime();
    try {
      const transaction = drizzleReadTransaction(connection.db);
      // Proof: removing the transaction made shared aggregate capture see Next remote in the first old observation.
      // Proof: no-op transaction methods observed failed instead of idle in `owned isolated real selection excludes a rival publication`.
      // Proof: v11-export/observation-transaction.txt: no-op BEGIN exposed Next remote in the first connected export.
      // Proof: omitting the transaction failed mounted metadata/cache cases by observing newer writes in the first response.
      // Proof: no-op owned transaction methods made mounted execution observation
      // mix old FS completion with new claim/occupancy and admit later SS attempts;
      // both returned HTTP 200 before first-response equality failed (2026-10-23).
      transaction.begin();
      try {
        const captured = await read(connection.db, lifetime);
        lifetime.expire();
        // Proof: omitting commit failed owned success/refusal close-time BEGIN assertions (transaction still active).
        transaction.commit();
        return captured;
      } catch (failure) {
        lifetime.expire();
        // Proof: omitting rollback failed owned dependency-failure close-time BEGIN assertion.
        // Proof: rollback removal recorded zero against one required rollback for unreadable foreign rows in both mounted save modes (mounted-save-refusal/owned-rollback.log).
        transaction.rollback();
        throw failure;
      }
    } finally {
      // Proof: omitting close failed all three owned lifecycle cases and the
      // mounted admission check saw one open snapshot at both launch handoffs.
      lifetime.expire();
      // Proof: omitting close recorded zero against one required close in both mounted unreadable-row saves (mounted-save-refusal/owned-close.log).
      connection.close();
    }
  }
  return {
    readExecution: (projectId, access, teamId) =>
      observe((db, lifetime) => readExecutionIn(db, projectId, access, teamId, lifetime)),
    read: (projectId, access) =>
      observe((db, lifetime) => readLivePlanIn(db, projectId, access, options, lifetime)),
    // Proof: bypassing this observation transaction for aggregate reads made the mounted
    // concurrent-write test combine A's old start with B's new chain (10-05/10-05).
    readAggregate: (actorId, access) =>
      observe((db, lifetime) => readLiveAggregateIn(db, actorId, access, options, lifetime)),
    readExport: (projectId, access) =>
      observe(async (db, lifetime) => {
        const captured = await readLivePlanIn(db, projectId, access, options, lifetime);
        // Proof: removing this check made `export sequence continuation` issue 13 expired SQL queries.
        lifetime.assertOpen();
        if (captured.kind !== 'shared' && captured.kind !== 'connected') return captured;
        const organizationId =
          captured.kind === 'shared'
            ? captured.organizationId
            : captured.projection.capture.organizationId;
        const directory = new DirectoryRepository(db, OPEN);
        // Proof: separate post-snapshot directory and marker rereads each failed mounted structured-export coherence.
        const [
          teams,
          people,
          tags,
          services,
          types,
          externalSystems,
          markers,
          stepParallels,
          resources,
          capacities,
          demands,
          definitions,
          facts,
          estimates,
          budgets,
        ] = await Promise.all([
          directory.listInOrganization('teams', organizationId),
          directory.listInOrganization('people', organizationId),
          directory.listInOrganization('tags', organizationId),
          directory.listInOrganization('services', organizationId),
          directory.listInOrganization('workItemTypes', organizationId),
          directory.listInOrganization('externalSystems', organizationId),
          new CalendarMarkerRepository(db, OPEN).listFor(projectId),
          // Proof: empty/omitted capture failed mounted shared exports; post-snapshot reread failed both concurrent races (mutation-capture-{empty,missing}.txt and mutation-post-snapshot-reread.txt).
          new StepParallelRepository(db, OPEN).listByProject(projectId),
          // Read in the same snapshot as the tree, so the document's demands
          // and capacities name the rows and resources it carries.
          directory.listInOrganization('resources', organizationId),
          new ResourceCapacityRepository(db, OPEN).listFor(projectId),
          new DemandRepository(db, OPEN).listByProject(projectId),
          // The measures version 11 carries, on the tree's snapshot
          // (`wbs-measure-budgets` design D63).
          // Proof: with these four read as empty, the shared `round-trips a
          // version-11 plan byte for byte into an organization lacking a
          // measure` (measure-export.controller.db.test.ts) failed; watched
          // 2026-10-23.
          new StepMeasureRepository(db, OPEN).definitionsFor(projectId),
          new StepMeasureRepository(db, OPEN).listByProject(projectId),
          new MeasureEstimateRepository(db, OPEN).listByProject(projectId),
          new WorkItemBudgetRepository(db, OPEN).listByProject(projectId),
        ]);
        return {
          ...captured,
          projectId,
          document: {
            directory: { teams, people, tags, services, types, externalSystems },
            markers,
            // Proof: aliasing adapter rows failed copies-sparse-adapter after retained-row mutation (mutation-capture-alias.txt, 2026-10-17).
            stepParallels: stepParallels.map(({ workItemId, stepId, maxParallel }) => ({
              workItemId,
              stepId,
              maxParallel,
            })),
            resources: { resources, capacities, demands },
            measures: { definitions, facts, estimates, budgets },
          },
        };
      }),
    readProject: (projectId) =>
      observe((db, lifetime) => readLiveProjectIn(db, projectId, undefined, options, lifetime)),
  };
}

/** One read transaction owns access, rank, captures, cache selection and detached projections. */
async function readLiveAggregateIn(
  db: Drizzle,
  actorId: string,
  access: ResourceAccess,
  options: LiveCaptureOptions,
  lifetime: ReadSnapshotLifetime,
): Promise<LivePlanAggregate> {
  if (access.kind === 'legacy') {
    // Proof: omitting this check made a real aggregate read after activation
    // answer isolated rather than access_refused/no_active_organization.
    if (readOrganizationActivation(db) !== 'pre_activation')
      return { kind: 'access_refused', refusal: 'no_active_organization' };
    return { kind: 'isolated' };
  }
  // Proof: bypassing the aggregate activation recheck after an injected durable
  // marker reset returned 200 with dates instead of 403/no_active_organization.
  if (readOrganizationActivation(db) === 'pre_activation')
    return { kind: 'access_refused', refusal: 'no_active_organization' };
  const resolved = currentMembershipAccess(db, access.scope.organizationId, access.scope.userId);
  // Proof: bypassing this check made revocation between route admission and the
  // aggregate snapshot answer 200 with held dates instead of 403/not_a_member.
  if (!resolved.ok) return { kind: 'access_refused', refusal: resolved.refusal };
  if (readCapacityMode(db, access.scope.organizationId) === 'isolated') return { kind: 'isolated' };

  const projects = new ProjectRepository(db, OPEN);
  const readable = await projects.listForInOrganization(actorId, access.scope.organizationId);
  lifetime.assertOpen();
  const snapshot = await readChainSnapshotIn(
    db,
    access,
    readable,
    '',
    options,
    lifetime,
    options.captureRead,
  );
  const captures = new Map<string, PlanInputReads>();
  const scheduling = new Map<string, ScheduleRead>();
  function readSchedule(request: CapturedScheduleAsk): ScheduleRead {
    // Proof: removing this check made `aggregate cached schedule` return 1 cached value after expiry.
    lifetime.assertOpen();
    const key = `${request.projectId}:${scheduleInputHash(request.input)}:${request.engine}:${request.objective}:${String(request.enabled)}`;
    const held = scheduling.get(key);
    if (held !== undefined) return held;
    const scheduled = snapshot.scheduler.read(request);
    scheduling.set(key, scheduled);
    return scheduled;
  }
  const shared: ChainSnapshot = {
    ...snapshot,
    capturePlan: async (projectId) => {
      lifetime.assertOpen();
      const captured = captures.get(projectId);
      if (captured !== undefined) return captured;
      const fresh = await snapshot.capturePlan(projectId);
      captures.set(projectId, fresh);
      return fresh;
    },
    scheduler: {
      readResolvedFast: (input) => snapshot.scheduler.readResolvedFast(input),
      supports: (engine) => snapshot.scheduler.supports(engine),
      read: readSchedule,
    },
  };
  const connectedByProject = new Map<string, Extract<LivePlanRead, { kind: 'connected' }>>();
  const externalByProject = new Map<string, boolean>();
  const entries: Extract<LivePlanAggregate, { kind: 'shared' }>['entries'][number][] = [];
  for (const [index, { project }] of snapshot.projects.entries()) {
    // Proof: bypassing this component memo failed both aggregate capture-count tests.
    let connected = connectedByProject.get(project.id);
    if (connected === undefined) {
      let hasExternal = externalByProject.get(project.id);
      if (hasExternal === undefined) {
        const topology = discoverConnectedTopologyIn(db, project.id, 'shared', lifetime);
        hasExternal = topology.hasExternal;
        for (const memberId of topology.projects) externalByProject.set(memberId, hasExternal);
      }
      // Proof: forcing rank-only routing failed mounted warm-cache load with 500 instead of dependency dates.
      if (hasExternal) {
        connected = await readConnectedLivePlanIn(db, access, project.id, options, lifetime);
        for (const member of connected.projection.capture.projects)
          connectedByProject.set(member.projectId, connected);
      }
    }
    if (connected !== undefined) {
      // Proof: substituting the old empty-calendar basis failed mounted foreign-only refresh with stale target dates.
      entries.push({ projectId: project.id, rank: index + 1, basis: null, plan: connected });
      continue;
    }
    const chain = await readChain(shared, project.id);
    if (chain.kind === 'not_found')
      throw new Error('ranked target disappeared inside aggregate snapshot');
    const metadata = await readLiveMetadataIn(db, project.id, lifetime);
    entries.push({
      projectId: project.id,
      rank: index + 1,
      basis: chain.kind === 'scheduled' ? incomingCalendarHash(chain.input.elsewhere) : null,
      plan: {
        kind: 'shared',
        organizationId: access.scope.organizationId,
        chain,
        project,
        ...metadata,
      },
    });
  }
  return { kind: 'shared', entries };
}

async function readLivePlanIn(
  db: Drizzle,
  projectId: string,
  admitted: ResourceAccess,
  options: LiveCaptureOptions,
  lifetime: ReadSnapshotLifetime,
): Promise<LivePlanRead> {
  if (admitted.kind === 'legacy') {
    // Proof: bypassing this recheck failed mounted `refuses activation between legacy admission and snapshot` (403 became 200).
    if (readOrganizationActivation(db) !== 'pre_activation')
      return { kind: 'access_refused', refusal: 'no_active_organization' };
  } else {
    // Proof: bypassing this check failed mounted reset-marker-after-admission (403 became 200).
    if (readOrganizationActivation(db) === 'pre_activation')
      return { kind: 'access_refused', refusal: 'no_active_organization' };
    // Recheck the actual admitted human identity on this observation's connection.
    const resolved = currentMembershipAccess(
      db,
      admitted.scope.organizationId,
      admitted.scope.userId,
    );
    // Proof: ignoring this refusal failed mounted six-route revocation (403 became 200 with updated upstream rows).
    if (!resolved.ok) return { kind: 'access_refused', refusal: resolved.refusal };
  }
  return readLiveProjectIn(db, projectId, admitted, options, lifetime);
}

/** Captures and derives a whole component while borrowing the caller's observation. */
async function readConnectedLivePlanIn(
  db: Drizzle,
  access: Extract<ChainAccess, { kind: 'scoped' }>,
  projectId: string,
  options: LiveCaptureOptions,
  lifetime: ReadSnapshotLifetime,
): Promise<Extract<LivePlanRead, { kind: 'connected' }>> {
  const projects = new ProjectRepository(db, OPEN);
  const capture = await captureConnectedPlanIn(
    db,
    access,
    projectId,
    lifetime,
    options.captureRead,
  );
  lifetime.assertOpen();
  // Proof: omitting this binding failed both `private connected capture` modes (unavailable instead of scheduled).
  const { scheduler, connected } = capturedSchedulerIn(db, options, lifetime, options.connected);
  const projection = deriveConnectedPlan(
    capture,
    scheduler,
    (input) => {
      lifetime.assertOpen();
      return scheduler.readResolvedFast(input);
    },
    connected ?? null,
  );
  const metadataByProject = new Map<
    string,
    Awaited<ReturnType<typeof readLiveMetadataIn>> & { project: Project }
  >();
  const attemptsByProject = new Map<string, readonly StoredAttempt[]>();
  for (const member of capture.projects) {
    lifetime.assertOpen();
    const memberProject = await projects.findInOrganization(
      member.projectId,
      access.scope.organizationId,
    );
    if (memberProject === null)
      throw new Error(`connected project ${member.projectId} disappeared`);
    const metadata = await readLiveMetadataIn(db, member.projectId, lifetime);
    metadataByProject.set(member.projectId, { project: memberProject, ...metadata });
    attemptsByProject.set(member.projectId, metadata.attempts);
  }
  const readiness = deriveConnectedReadiness(capture, projection.authored, attemptsByProject);
  return { kind: 'connected', projection, readiness, metadataByProject };
}

async function readLiveProjectIn(
  db: Drizzle,
  projectId: string,
  admitted: ChainAccess | undefined,
  options: LiveCaptureOptions,
  lifetime: ReadSnapshotLifetime,
): Promise<Exclude<LivePlanRead, { kind: 'access_refused' }>> {
  const projects = new ProjectRepository(db, OPEN);
  const project = await projects.findById(projectId);
  // Proof: removing this check made `live project first response` issue 4 expired SQL queries.
  lifetime.assertOpen();
  if (project === null) return { kind: 'not_found' };
  const access: ChainAccess =
    admitted ??
    (readOrganizationActivation(db) === 'pre_activation'
      ? { kind: 'legacy' }
      : {
          kind: 'scoped',
          scope: {
            organizationId: requireOwnership(
              db
                .select({ organizationId: projectOrganization.organizationId })
                .from(projectOrganization)
                .where(eq(projectOrganization.resourceId, projectId))
                .get(),
            ),
          },
        });
  if (access.kind === 'legacy') return { kind: 'isolated' };
  const owned = await projects.findInOrganization(projectId, access.scope.organizationId);
  // Proof: removing this check made `project owned continuation` issue 2 expired SQL queries.
  lifetime.assertOpen();
  if (owned === null) return { kind: 'not_found' };
  const mode = readCapacityMode(db, access.scope.organizationId);
  // Proof: restoring the materializing listIncident scout made the mounted isolated
  // query-count test grow from 13 to 51 statements across 19 local edges.
  const topology = discoverConnectedTopologyIn(db, projectId, mode, lifetime);
  lifetime.assertOpen();
  // The legacy isolated path remains cheap when no foreign relationship exists.
  // Proof: bypassing this arm made `actual isolated live route captures remote readiness without a calendar`
  // return isolated, hiding the unfinished remote FS prerequisite.
  if (topology.hasExternal) {
    return readConnectedLivePlanIn(db, access, projectId, options, lifetime);
  }
  if (mode === 'isolated') return { kind: 'isolated' };
  const ranks = await new ProjectRankRepository(db, OPEN).orderIn(access.scope.organizationId);
  // Proof: removing this check made `project rank continuation` issue 4 expired SQL queries.
  lifetime.assertOpen();
  const readable = await Promise.all(
    ranks.map(async (ranked) => {
      const visible = await projects.findInOrganization(
        ranked.projectId,
        access.scope.organizationId,
      );
      // Proof: removing this guard failed the broken ranked-project live read with an unrelated null dereference.
      if (visible === null) throw new Error('rank names an unreadable project');
      return visible;
    }),
  );
  const snapshot = await readChainSnapshotIn(
    db,
    access,
    readable,
    projectId,
    options,
    lifetime,
    options.captureRead,
  );
  const chain = await readChain(snapshot, projectId);
  // Proof: removing this guard made the omitted-target rank dependency resolve instead of rejecting trusted state.
  if (chain.kind === 'not_found') throw new Error('live target disappeared inside its snapshot');
  const metadata = await readLiveMetadataIn(db, projectId, lifetime);
  return {
    kind: 'shared',
    organizationId: access.scope.organizationId,
    chain,
    project: owned,
    ...metadata,
  };
}

/** Sequential live metadata reads refuse expiry before moving to the next repository. */
async function readLiveMetadataIn(db: Drizzle, projectId: string, lifetime: ReadSnapshotLifetime) {
  // Proof: removing this check made `project chain continuation` issue 1 expired SQL query.
  lifetime.assertOpen();
  const steps = await new ProjectRepository(db, OPEN).stepsOf(projectId);
  // Proof: removing this check made `project steps continuation` issue 6 expired SQL queries.
  lifetime.assertOpen();
  const workItems = await new WorkItemRepository(db, OPEN).listByProject(projectId);
  // Proof: removing this check made `project work-items continuation` issue 1 expired SQL query.
  lifetime.assertOpen();
  const attempts = await new StepNodeAttemptRepository(db, OPEN).listByProject(projectId);
  // Proof: removing this check made `project attempts continuation` issue 1 expired SQL query.
  lifetime.assertOpen();
  // Proof: replacing aggregate/direct blockage capture with [] failed their existing persisted blockage tests.
  const blockages = await new StepBlockageRepository(db, OPEN).listByProject(projectId);
  // Proof: removing this check made `project blockages continuation` issue 1 expired SQL query.
  lifetime.assertOpen();
  // Proof: reading the bare project ID failed mounted metadata cases with seq -1 instead of 11.
  const seq = await new DrizzleEventLogStore(db, OPEN).latestSeq(`project:${projectId}`);
  return { steps, workItems, attempts, blockages, seq };
}
