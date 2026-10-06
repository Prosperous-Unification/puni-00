import type {
  ChainAccess,
  ChainSnapshot,
  ChainSnapshotStore,
  LivePlanAggregate,
  LivePlanRead,
  LivePlanStore,
  OptimizedScheduleAdapter,
  OrganizationPrincipal,
  PlanInputReads,
  Project,
  ResourceAccess,
  Scheduler,
  SharedPeopleRead,
} from '@wbs/core';
import { readChain } from '@wbs/core';
import { eq } from 'drizzle-orm';

import { CalendarMarkerRepository } from './calendar-marker';
import type { CaptureReadSeam } from './capture-read-seam';
import {
  capturedOptimizationReaderOf,
  type CapturedOptimizationReaderOptions,
} from './captured-optimization-reader';
import {
  type Connection,
  type Drizzle,
  drizzleReadTransaction,
  openReadOnlyConnection,
} from './db';
import { DirectoryRepository } from './directory';
import { DrizzleEventLogStore } from './event-log';
import { OPEN } from './gate';
import { type ActiveOrganizationOf, SqliteOrganizationAccess } from './organization-access';
import { readOrganizationActivation } from './organization-activation';
import { ProjectRepository } from './project';
import { ProjectRankRepository } from './project-rank';
import { readPlanInputIn } from './saved-plan-capture';
import { incomingCalendarHash, scheduleInputHash } from './schedule-input-hash';
import { projectOrganization } from './schema';
import { readCapacityMode } from './shared-people-mode';
import { WorkItemRepository } from './work-item';

export interface ChainSnapshotOptions {
  /** A dedicated openReadOnlyConnection, closed on every outcome. */
  readonly openConnection: () => Connection;
  /** Binds session/binding reads to the same connection as membership and rank. */
  readonly activeOrganizationOf: (db: Drizzle) => ActiveOrganizationOf;
  /** Builds capture-mode scheduling around this snapshot's optimized cache reader. */
  readonly schedulerOf: (
    readCaptured: OptimizedScheduleAdapter['readCaptured'] | undefined,
  ) => Scheduler;
  readonly optimization?: CapturedOptimizationReaderOptions;
}

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
    try {
      const db = connection.db;
      // Proof: removing the transaction made the concurrent rank/assignment/date negative read 2 instead of 3.
      const transaction = drizzleReadTransaction(db);
      transaction.begin();
      try {
        const resolved = await new SqliteOrganizationAccess(
          db,
          this.options.activeOrganizationOf(db),
        ).resolve(principal);
        if (!resolved.ok) {
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
            this.captureRead,
          ),
        );
        transaction.commit();
        return { ok: true as const, value };
      } catch (failure) {
        transaction.rollback();
        throw failure;
      }
    } finally {
      // Proof: omitting close left the capture-throw negative at zero closes instead of one.
      connection.close();
    }
  }
  async withProjectSnapshot(
    projectId: string,
    read: (snapshot: ChainSnapshot) => SharedPeopleRead | Promise<SharedPeopleRead>,
  ): Promise<SharedPeopleRead> {
    const connection = this.options.openConnection();
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
              this.captureRead,
            ),
          );
        }
        // Proof: omitting commit failed the background lifecycle test at the close-time nested BEGIN.
        transaction.commit();
        return value;
      } catch (failure) {
        transaction.rollback();
        throw failure;
      }
    } finally {
      // Proof: omitting close failed the background lifecycle test (0 instead of 1 closes).
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
  options: Pick<ChainSnapshotOptions, 'schedulerOf' | 'optimization'>,
  captureRead?: CaptureReadSeam,
): Promise<ChainSnapshot> {
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
  const candidates: ChainSnapshot['projects'][number][] = [];
  for (const projectId of order) {
    const project = visible.get(projectId);
    // Proof: removing this check made the broken readable-list negative accept inconsistent rank.
    if (project === undefined) throw new Error('rank names an unreadable project');
    candidates.push({
      project,
      assignments: (await directory.assignmentsInProject(projectId)).assignments,
    });
  }
  return {
    access,
    mode,
    projects: candidates,
    capturePlan: async (projectId) => {
      // Proof: removing this guard failed the borrowed foreign-project capture negative.
      if (!visible.has(projectId)) throw new Error('chain capture names an unreadable project');
      const captured = await readPlanInputIn(db, projectId, captureRead, access);
      // Proof: removing this guard made the missing captured-project negative lose its trusted-state refusal.
      if (captured === null) throw new Error('ranked project disappeared inside its snapshot');
      return captured;
    },
    scheduler: options.schedulerOf(
      options.optimization === undefined
        ? undefined
        : capturedOptimizationReaderOf(db, options.optimization),
    ),
  };
}

function requireOwnership(owner: { organizationId: string } | undefined): string {
  // Proof: removing this guard failed `refuses corrupt mode and broken background ownership`.
  if (owner === undefined) throw new Error('project ownership is absent');
  return owner.organizationId;
}

/** Binds both reader lifetimes to one scheduling configuration without exposing connections to core. */
export function createLivePlanStore(
  options: Pick<ChainSnapshotOptions, 'schedulerOf' | 'optimization'> &
    (
      | { readonly kind: 'owned'; readonly openConnection: () => Connection }
      | { readonly kind: 'borrowed'; readonly db: Drizzle }
    ),
): LivePlanStore {
  async function observe<T>(read: (db: Drizzle) => Promise<T>): Promise<T> {
    if (options.kind === 'borrowed') {
      // Proof: replacing this borrowed db with a fresh snapshot fails mounted staged arrangement/preflight.
      return read(options.db);
    }
    const connection = options.openConnection();
    try {
      const transaction = drizzleReadTransaction(connection.db);
      // Proof: omitting the transaction failed mounted metadata/cache cases by observing newer writes in the first response.
      transaction.begin();
      try {
        const captured = await read(connection.db);
        // Proof: omitting commit failed owned success/refusal close-time BEGIN assertions (transaction still active).
        transaction.commit();
        return captured;
      } catch (failure) {
        // Proof: omitting rollback failed owned dependency-failure close-time BEGIN assertion.
        transaction.rollback();
        throw failure;
      }
    } finally {
      // Proof: omitting close failed all three owned lifecycle cases and the
      // mounted admission check saw one open snapshot at both launch handoffs.
      connection.close();
    }
  }
  return {
    read: (projectId, access) => observe((db) => readLivePlanIn(db, projectId, access, options)),
    // Proof: bypassing this observation transaction for aggregate reads made the mounted
    // concurrent-write test combine A's old start with B's new chain (10-05/10-05).
    readAggregate: (actorId, access) =>
      observe((db) => readLiveAggregateIn(db, actorId, access, options)),
    readExport: (projectId, access) =>
      observe(async (db) => {
        const captured = await readLivePlanIn(db, projectId, access, options);
        if (captured.kind !== 'shared') return captured;
        const directory = new DirectoryRepository(db, OPEN);
        // Proof: separate post-snapshot directory and marker rereads each failed mounted structured-export coherence.
        const [teams, people, tags, services, types, externalSystems, markers] = await Promise.all([
          directory.listInOrganization('teams', captured.organizationId),
          directory.listInOrganization('people', captured.organizationId),
          directory.listInOrganization('tags', captured.organizationId),
          directory.listInOrganization('services', captured.organizationId),
          directory.listInOrganization('workItemTypes', captured.organizationId),
          directory.listInOrganization('externalSystems', captured.organizationId),
          new CalendarMarkerRepository(db, OPEN).listFor(projectId),
        ]);
        return {
          ...captured,
          document: {
            directory: { teams, people, tags, services, types, externalSystems },
            markers,
          },
        };
      }),
    readProject: (projectId) =>
      observe((db) => readLiveProjectIn(db, projectId, undefined, options)),
  };
}

/** One read transaction owns access, rank, captures, cache selection and detached projections. */
async function readLiveAggregateIn(
  db: Drizzle,
  actorId: string,
  access: ResourceAccess,
  options: Pick<ChainSnapshotOptions, 'schedulerOf' | 'optimization'>,
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
  const resolved = await new SqliteOrganizationAccess(db, () =>
    Promise.resolve(access.scope.organizationId),
  ).resolve({ id: access.scope.userId });
  // Proof: bypassing this check made revocation between route admission and the
  // aggregate snapshot answer 200 with held dates instead of 403/not_a_member.
  if (!resolved.ok) return { kind: 'access_refused', refusal: resolved.refusal };
  if (readCapacityMode(db, access.scope.organizationId) === 'isolated') return { kind: 'isolated' };

  const projects = new ProjectRepository(db, OPEN);
  const readable = await projects.listForInOrganization(actorId, access.scope.organizationId);
  const snapshot = await readChainSnapshotIn(db, access, readable, '', options);
  const captures = new Map<string, PlanInputReads>();
  const scheduling = new Map<string, ReturnType<Scheduler['read']>>();
  const shared: ChainSnapshot = {
    ...snapshot,
    capturePlan: async (projectId) => {
      const captured = captures.get(projectId);
      if (captured !== undefined) return captured;
      const fresh = await snapshot.capturePlan(projectId);
      captures.set(projectId, fresh);
      return fresh;
    },
    scheduler: {
      supports: (engine) => snapshot.scheduler.supports(engine),
      read: (request) => {
        const key = `${request.projectId}:${scheduleInputHash(request.input)}:${request.engine}:${request.objective}:${String(request.enabled)}`;
        const held = scheduling.get(key);
        if (held !== undefined) return held;
        const scheduled = snapshot.scheduler.read(request);
        scheduling.set(key, scheduled);
        return scheduled;
      },
    },
  };
  const entries: Extract<LivePlanAggregate, { kind: 'shared' }>['entries'][number][] = [];
  for (const [index, { project }] of snapshot.projects.entries()) {
    const chain = await readChain(shared, project.id);
    if (chain.kind === 'not_found')
      throw new Error('ranked target disappeared inside aggregate snapshot');
    entries.push({
      rank: index + 1,
      basis: chain.kind === 'scheduled' ? incomingCalendarHash(chain.input.elsewhere) : null,
      plan: {
        kind: 'shared',
        organizationId: access.scope.organizationId,
        chain,
        project,
        steps: await projects.stepsOf(project.id),
        workItems: await new WorkItemRepository(db, OPEN).listByProject(project.id),
        seq: await new DrizzleEventLogStore(db, OPEN).latestSeq(`project:${project.id}`),
      },
    });
  }
  return { kind: 'shared', entries };
}

async function readLivePlanIn(
  db: Drizzle,
  projectId: string,
  admitted: ResourceAccess,
  options: Pick<ChainSnapshotOptions, 'schedulerOf' | 'optimization'>,
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
    const resolved = await new SqliteOrganizationAccess(db, () =>
      Promise.resolve(admitted.scope.organizationId),
    ).resolve({ id: admitted.scope.userId });
    // Proof: ignoring this refusal failed mounted six-route revocation (403 became 200 with updated upstream rows).
    if (!resolved.ok) return { kind: 'access_refused', refusal: resolved.refusal };
  }
  return readLiveProjectIn(db, projectId, admitted, options);
}

async function readLiveProjectIn(
  db: Drizzle,
  projectId: string,
  admitted: ChainAccess | undefined,
  options: Pick<ChainSnapshotOptions, 'schedulerOf' | 'optimization'>,
): Promise<Exclude<LivePlanRead, { kind: 'access_refused' }>> {
  const projects = new ProjectRepository(db, OPEN);
  const project = await projects.findById(projectId);
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
  if (owned === null) return { kind: 'not_found' };
  if (readCapacityMode(db, access.scope.organizationId) === 'isolated') return { kind: 'isolated' };
  const readable = await Promise.all(
    (await new ProjectRankRepository(db, OPEN).orderIn(access.scope.organizationId)).map(
      async (ranked) => {
        const visible = await projects.findInOrganization(
          ranked.projectId,
          access.scope.organizationId,
        );
        // Proof: removing this guard failed the broken ranked-project live read with an unrelated null dereference.
        if (visible === null) throw new Error('rank names an unreadable project');
        return visible;
      },
    ),
  );
  const snapshot = await readChainSnapshotIn(db, access, readable, projectId, options);
  const chain = await readChain(snapshot, projectId);
  // Proof: removing this guard made the omitted-target rank dependency resolve instead of rejecting trusted state.
  if (chain.kind === 'not_found') throw new Error('live target disappeared inside its snapshot');
  return {
    kind: 'shared',
    organizationId: access.scope.organizationId,
    chain,
    project: owned,
    steps: await projects.stepsOf(projectId),
    workItems: await new WorkItemRepository(db, OPEN).listByProject(projectId),
    // Proof: reading the bare project ID failed mounted metadata cases with seq -1 instead of 11.
    seq: await new DrizzleEventLogStore(db, OPEN).latestSeq(`project:${projectId}`),
  };
}
