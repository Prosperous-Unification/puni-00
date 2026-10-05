import type {
  ChainSnapshot,
  ChainSnapshotStore,
  OptimizedScheduleAdapter,
  OrganizationPrincipal,
  PlanInputReads,
  Scheduler,
  SharedPeopleRead,
} from '@wbs/core';

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
import { ProjectRepository } from './project';
import { ProjectRankRepository } from './project-rank';
import { readPlanInputIn } from './saved-plan-capture';

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
        const directory = new DirectoryRepository(db, OPEN);
        const readable =
          access.kind === 'scoped'
            ? await projects.listForInOrganization(principal.id, access.scope.organizationId)
            : await projects.listFor(principal.id);
        const order =
          access.kind === 'scoped'
            ? (await new ProjectRankRepository(db, OPEN).orderIn(access.scope.organizationId)).map(
                (each) => each.projectId,
              )
            : readable.map((each) => each.id);
        const visible = new Map(readable.map((each) => [each.id, each]));
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
        const value = await read({
          access,
          projects: candidates,
          capturePlan: async (projectId) => {
            // Proof: removing this guard failed the borrowed foreign-project capture negative.
            if (!visible.has(projectId))
              throw new Error('chain capture names an unreadable project');
            const captured = await readPlanInputIn(db, projectId, this.captureRead, access);
            // Proof: removing this guard made the missing captured-project negative lose its trusted-state refusal.
            if (captured === null)
              throw new Error('ranked project disappeared inside its snapshot');
            return captured;
          },
          scheduler: this.options.schedulerOf(
            this.options.optimization === undefined
              ? undefined
              : capturedOptimizationReaderOf(db, this.options.optimization),
          ),
        });
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
