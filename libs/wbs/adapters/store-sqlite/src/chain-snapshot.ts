import type {
  ChainAccess,
  ChainSnapshot,
  ChainSnapshotStore,
  OptimizedScheduleAdapter,
  OrganizationPrincipal,
  PlanInputReads,
  Scheduler,
  SharedPeopleRead,
} from '@wbs/core';
import { eq } from 'drizzle-orm';

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
import { OPEN } from './gate';
import { type ActiveOrganizationOf, SqliteOrganizationAccess } from './organization-access';
import { readOrganizationActivation } from './organization-activation';
import { ProjectRepository } from './project';
import { ProjectRankRepository } from './project-rank';
import { readPlanInputIn } from './saved-plan-capture';
import { projectOrganization } from './schema';
import { readCapacityMode } from './shared-people-mode';

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
        let readable: readonly PlanInputReads['project'][];
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
  readable: readonly PlanInputReads['project'][],
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
  const candidates: Pick<PlanInputReads, 'project' | 'assignments'>[] = [];
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
