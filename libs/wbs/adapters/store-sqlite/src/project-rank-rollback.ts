import { and, asc, eq, inArray } from 'drizzle-orm';

import type { Drizzle } from './db';
import { projectOrganization, projectRank, users } from './schema';

type Reader = Pick<Drizzle, 'select'>;

/** One saved rank row, every `project_rank` column. */
export interface SavedProjectRank {
  projectId: string;
  organizationId: string;
  position: number;
  createdAt: number;
  updatedAt: number | null;
  createdBy: string;
}

/**
 * The file `project-rank-rollback-cli.ts save` writes before a rollback past
 * `20260929180000_add_project_rank`, whose `down.sql` refuses while any rank
 * exists (docs/runbook-prod-deploy.md#project-rank-rollback).
 */
export interface SavedProjectRanks {
  format: 'project-rank-save';
  version: 1;
  ranks: SavedProjectRank[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isInteger = (value: unknown): value is number => Number.isSafeInteger(value);

function invalid(): never {
  throw new Error('invalid project rank save');
}

function readRank(candidate: unknown): SavedProjectRank {
  if (!isRecord(candidate) || Object.keys(candidate).length !== 6) invalid();
  const { projectId, organizationId, position, createdAt, updatedAt, createdBy } = candidate;
  if (
    !isString(projectId) ||
    !isString(organizationId) ||
    !isInteger(position) ||
    !isInteger(createdAt) ||
    !(updatedAt === null || isInteger(updatedAt)) ||
    !isString(createdBy)
  ) {
    invalid();
  }
  return { projectId, organizationId, position, createdAt, updatedAt, createdBy };
}

/** Validates the versioned file at the CLI boundary, before any transaction. */
function readSaved(saved: unknown): SavedProjectRanks {
  if (
    !isRecord(saved) ||
    saved['format'] !== 'project-rank-save' ||
    saved['version'] !== 1 ||
    Object.keys(saved).length !== 3 ||
    !Array.isArray(saved['ranks'])
  ) {
    invalid();
  }
  return { format: 'project-rank-save', version: 1, ranks: saved['ranks'].map(readRank) };
}

function currentRanks(db: Reader): SavedProjectRank[] {
  return db
    .select({
      projectId: projectRank.projectId,
      organizationId: projectRank.organizationId,
      position: projectRank.position,
      createdAt: projectRank.createdAt,
      updatedAt: projectRank.updatedAt,
      createdBy: projectRank.createdBy,
    })
    .from(projectRank)
    .orderBy(asc(projectRank.projectId))
    .all();
}

const isSameRank = (left: SavedProjectRank, right: SavedProjectRank): boolean =>
  left.projectId === right.projectId &&
  left.organizationId === right.organizationId &&
  left.position === right.position &&
  left.createdAt === right.createdAt &&
  left.updatedAt === right.updatedAt &&
  left.createdBy === right.createdBy;

/** Captures every rank row in project id order. */
export function saveProjectRanks(db: Drizzle): SavedProjectRanks {
  return { format: 'project-rank-save', version: 1, ranks: currentRanks(db) };
}

/**
 * Deletes every rank in one transaction, refusing unless the save still equals
 * everything stored: a rank moved after the save would otherwise be lost with
 * no copy anywhere. Answers the number removed.
 *
 * Proof, observed 2026-09-29: reduced to comparing counts, `refuses to remove
 * a save that no longer matches, deleting nothing` in
 * `project-rank.db.test.ts` deleted every rank instead of throwing.
 */
export function removeSavedProjectRanks(db: Drizzle, saved: unknown): number {
  const { ranks } = readSaved(saved);
  return db.transaction(
    (tx) => {
      const current = currentRanks(tx);
      const expected = [...ranks].sort((left, right) =>
        left.projectId < right.projectId ? -1 : left.projectId > right.projectId ? 1 : 0,
      );
      if (
        current.length !== expected.length ||
        current.some((row, index) => !isSameRank(row, expected[index]))
      ) {
        throw new Error('project rank save does not match the stored ranks; save again first');
      }
      tx.delete(projectRank)
        .where(
          inArray(
            projectRank.projectId,
            current.map(({ projectId }) => projectId),
          ),
        )
        .run();
      return current.length;
    },
    { behavior: 'immediate' },
  );
}

/**
 * Writes the saved ranks back after a later forward migration, all or none. A
 * saved project its organization no longer owns, or an author who is no longer
 * a user, refuses the whole restore naming it; the references would refuse it
 * too, but without saying which.
 */
export function restoreProjectRanks(db: Drizzle, saved: unknown): number {
  const { ranks } = readSaved(saved);
  return db.transaction(
    (tx) => {
      for (const rank of ranks) {
        const owned = tx
          .select({ id: projectOrganization.resourceId })
          .from(projectOrganization)
          .where(
            and(
              eq(projectOrganization.resourceId, rank.projectId),
              eq(projectOrganization.organizationId, rank.organizationId),
            ),
          )
          .get();
        // Proof, observed 2026-09-29: with this read skipped, `refuses the
        // whole restore when a saved project is gone` in
        // `project-rank.db.test.ts` threw drizzle's `Failed query: insert into
        // "project_rank"` instead of naming the project.
        if (owned === undefined) {
          throw new Error(
            `saved rank of project ${rank.projectId}: organization ${rank.organizationId} no longer owns it`,
          );
        }
        const author = tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, rank.createdBy))
          .get();
        if (author === undefined) {
          throw new Error(
            `saved rank of project ${rank.projectId} was written by ${rank.createdBy}, who is no longer a user`,
          );
        }
        tx.insert(projectRank).values(rank).run();
      }
      return ranks.length;
    },
    { behavior: 'immediate' },
  );
}
