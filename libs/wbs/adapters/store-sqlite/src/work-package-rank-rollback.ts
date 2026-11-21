import { and, asc, eq, inArray } from 'drizzle-orm';

import type { Drizzle } from './db';
import { users, workPackageOrganization, workPackageRank } from './schema';

type Reader = Pick<Drizzle, 'select'>;

interface SavedRankFacts {
  organizationId: string;
  position: number;
  createdAt: number;
  updatedAt: number | null;
  createdBy: string;
}

/** Every current work_package_rank column, separate from its versioned file identity. */
export interface SavedWorkPackageRank extends SavedRankFacts {
  workPackageId: string;
}

/** Frozen project-rank-save1 row; its owner spelling participates in historical backup digests. */
export interface SavedProjectRank extends SavedRankFacts {
  projectId: string;
}

export interface LegacySavedWorkPackageRanks {
  format: 'project-rank-save';
  version: 1;
  ranks: SavedProjectRank[];
}

/**
 * Current file written before rollback past historical 20260929180000_add_project_rank.
 * That immutable migration's down.sql refuses while any rank exists.
 * See docs/runbook-prod-deploy.md#work-package-rank-rollback.
 */
export interface CurrentSavedWorkPackageRanks {
  format: 'work-package-rank-save';
  version: 2;
  ranks: SavedWorkPackageRank[];
}

export type SavedWorkPackageRanks = LegacySavedWorkPackageRanks | CurrentSavedWorkPackageRanks;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const isString = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isInteger = (value: unknown): value is number => Number.isSafeInteger(value);
function invalid(): never {
  throw new Error('invalid work package rank save');
}
function readRankFacts(candidate: Record<string, unknown>): SavedRankFacts {
  const { organizationId, position, createdAt, updatedAt, createdBy } = candidate;
  if (
    // Proof: backup-rank-fact-organizationId. Omitting this validator changes the named invalid-save diagnostic to the later absent-organization error; that relation still refuses (diagnostic-only).
    // Observed test: refuses legacy1 invalid rank fact organizationId.
    // Observed test: refuses current2 invalid rank fact organizationId.
    !isString(organizationId) ||
    // Proof: backup-rank-fact-position. Omitting position validation accepts fractional rank position in both generations.
    // Observed test: refuses legacy1 invalid rank fact position.
    // Observed test: refuses current2 invalid rank fact position.
    !isInteger(position) ||
    // Proof: backup-rank-fact-createdAt. Omitting createdAt validation accepts fractional creation time in both generations.
    // Observed test: refuses legacy1 invalid rank fact createdAt.
    // Observed test: refuses current2 invalid rank fact createdAt.
    !isInteger(createdAt) ||
    // Proof: backup-rank-fact-updatedAt. Omitting updatedAt validation accepts false in both generations.
    // Observed test: refuses legacy1 invalid rank fact updatedAt.
    // Observed test: refuses current2 invalid rank fact updatedAt.
    !(updatedAt === null || isInteger(updatedAt)) ||
    // Proof: backup-rank-fact-createdBy. Omitting createdBy validation accepts an empty author in both generations.
    // Observed test: refuses legacy1 invalid rank fact createdBy.
    // Observed test: refuses current2 invalid rank fact createdBy.
    !isString(createdBy)
  )
    invalid();
  return { organizationId, position, createdAt, updatedAt, createdBy };
}
function readProjectRank(candidate: unknown): SavedProjectRank {
  if (
    !isRecord(candidate) ||
    // Proof: backup-legacy1-rank-fields. Omitting the closed legacy row field count accepts an undeclared rank field.
    // Observed test: refuses legacy1 undeclared rank fields.
    Object.keys(candidate).length !== 6 ||
    // Proof: backup-legacy1-owner-key. Omitting the legacy owner check accepts a legacy row carrying only the current owner spelling.
    // Observed test: retained recovery backup wire identity > refuses shared backup mixed owner spelling and unknown declared generations.
    // Observed test: retained recovery backup wire identity > refuses unshipped standalone format1 and every mixed format-version-owner pair.
    !isString(candidate['projectId'])
  )
    invalid();
  // Proof: backup-legacy1-rank-detachment. Returning the caller legacy rank aliases retained createdBy after caller mutation.
  // Observed test: detaches legacy1 full canonical facts from caller aliases.
  return { projectId: candidate['projectId'], ...readRankFacts(candidate) };
}
function readWorkPackageRank(candidate: unknown): SavedWorkPackageRank {
  if (
    !isRecord(candidate) ||
    // Proof: backup-current2-rank-fields. Omitting the closed current row field count accepts an undeclared rank field.
    // Observed test: refuses current2 undeclared rank fields.
    Object.keys(candidate).length !== 6 ||
    // Proof: backup-current2-owner-key. Omitting the current owner check accepts a current row carrying only the legacy owner spelling.
    // Observed test: retained recovery backup wire identity > refuses shared backup mixed owner spelling and unknown declared generations.
    // Observed test: retained recovery backup wire identity > refuses unshipped standalone format1 and every mixed format-version-owner pair.
    !isString(candidate['workPackageId'])
  )
    invalid();
  // Proof: backup-current2-rank-detachment. Returning the caller current rank aliases retained createdBy after caller mutation.
  // Observed test: detaches current2 full canonical facts from caller aliases.
  return { workPackageId: candidate['workPackageId'], ...readRankFacts(candidate) };
}

/**
 * Validates exactly the published project/1 or current work-package/2 file before any owner.
 * Returns the declared wire generation without projecting historical identity or accepting aliases.
 * @throws for mixed spellings, unsupported format/version pairs or malformed complete rank rows.
 */
export function readSavedWorkPackageRanks(saved: unknown): SavedWorkPackageRanks {
  // Proof: backup-standalone-root-fields. Omitting the standalone root field count admits an extra root field; the actual fixture removal returns5 instead of refusing.
  // Observed test: rolling back the work package rank > refuses a malformed save before touching the database.
  if (!isRecord(saved) || Object.keys(saved).length !== 3 || !Array.isArray(saved['ranks']))
    invalid();
  // Proof: backup-standalone-legacy-pair. Dropping the legacy version discriminator admits project-rank-save paired with version2.
  // Observed test: retained recovery backup wire identity > refuses unshipped standalone format1 and every mixed format-version-owner pair.
  if (saved['format'] === 'project-rank-save' && saved['version'] === 1)
    return { format: 'project-rank-save', version: 1, ranks: saved['ranks'].map(readProjectRank) };
  // Proof: backup-standalone-current-pair. Dropping the current version discriminator admits the unshipped work-package-rank-save1 pair.
  // Observed test: retained recovery backup wire identity > refuses unshipped standalone format1 and every mixed format-version-owner pair.
  if (saved['format'] === 'work-package-rank-save' && saved['version'] === 2)
    return {
      format: 'work-package-rank-save',
      version: 2,
      ranks: saved['ranks'].map(readWorkPackageRank),
    };
  invalid();
}

/** Projects already validated rank facts for current storage; never replaces the retained file/digest. */
export function projectSavedWorkPackageRanks(saved: SavedWorkPackageRanks): SavedWorkPackageRank[] {
  return saved.version === 1
    ? // Proof: backup-standalone-legacy-projection. Retargeting the projected owner to foreign makes legacy removal fail its exact stored-rank comparison; this is required-projection evidence.
      // Observed test: removes and restores historical project-rank-save1 through explicit current-row projection.
      saved.ranks.map(({ projectId, ...facts }) => ({ workPackageId: projectId, ...facts }))
    : saved.ranks.map((rank) => ({ ...rank }));
}

function currentRanks(db: Reader): SavedWorkPackageRank[] {
  return db
    .select({
      workPackageId: workPackageRank.workPackageId,
      organizationId: workPackageRank.organizationId,
      position: workPackageRank.position,
      createdAt: workPackageRank.createdAt,
      updatedAt: workPackageRank.updatedAt,
      createdBy: workPackageRank.createdBy,
    })
    .from(workPackageRank)
    .orderBy(asc(workPackageRank.workPackageId))
    .all();
}

const isSameRank = (left: SavedWorkPackageRank, right: SavedWorkPackageRank): boolean =>
  left.workPackageId === right.workPackageId &&
  left.organizationId === right.organizationId &&
  left.position === right.position &&
  left.createdAt === right.createdAt &&
  left.updatedAt === right.updatedAt &&
  left.createdBy === right.createdBy;

/** Captures every rank row in work package id order. */
export function saveWorkPackageRanks(db: Reader): CurrentSavedWorkPackageRanks {
  // Proof: backup-standalone-writer2. Emitting version1 fails the actual writer version2 assertion; later owner-key assertions are not credited.
  // Observed test: new standalone rank saves emit only work-package-rank-save2 with current owner fields.
  return { format: 'work-package-rank-save', version: 2, ranks: currentRanks(db) };
}

/**
 * Deletes every rank in one transaction, refusing unless the save still equals
 * everything stored: a rank moved after the save would otherwise be lost with
 * no copy anywhere. Answers the number removed.
 *
 * Proof, observed 2026-09-29: reduced to comparing counts, `refuses to remove
 * a save that no longer matches, deleting nothing` in
 * `work-package-rank.db.test.ts` deleted every rank instead of throwing.
 */
export function removeSavedWorkPackageRanks(
  db: Pick<Drizzle, 'transaction'>,
  saved: unknown,
): number {
  const ranks = projectSavedWorkPackageRanks(readSavedWorkPackageRanks(saved));
  return db.transaction(
    (tx) => {
      const current = currentRanks(tx);
      const expected = [...ranks].sort((left, right) =>
        left.workPackageId < right.workPackageId
          ? -1
          : left.workPackageId > right.workPackageId
            ? 1
            : 0,
      );
      if (
        current.length !== expected.length ||
        current.some((row, index) => !isSameRank(row, expected[index]))
      ) {
        throw new Error('work package rank save does not match the stored ranks; save again first');
      }
      tx.delete(workPackageRank)
        .where(
          inArray(
            workPackageRank.workPackageId,
            current.map(({ workPackageId }) => workPackageId),
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
 * saved work package its organization no longer owns, or an author who is no longer
 * a user, refuses the whole restore naming it; the references would refuse it
 * too, but without saying which.
 */
export function restoreWorkPackageRanks(db: Pick<Drizzle, 'transaction'>, saved: unknown): number {
  const checked = readSavedWorkPackageRanks(saved);
  return db.transaction(
    // Proof: backup-standalone-legacy-restore-consumer. Passing raw legacy rows into the current borrowed restore loses the owner and reaches the named undefined-owner refusal.
    // Observed test: removes and restores historical project-rank-save1 through explicit current-row projection.
    (tx) => restoreWorkPackageRanksIn(tx, projectSavedWorkPackageRanks(checked)),
    {
      behavior: 'immediate',
    },
  );
}

/**
 * Restores already validated historical ranks on the caller-owned writer.
 * References and authors are rechecked before insertion; no nested native owner is opened.
 * @throws on missing ownership, missing authors or SQLite failure; the caller must roll back.
 */
export function restoreWorkPackageRanksIn(
  tx: Pick<Drizzle, 'select' | 'insert'>,
  ranks: readonly SavedWorkPackageRank[],
): number {
  for (const rank of ranks) {
    const owned = tx
      .select({ id: workPackageOrganization.resourceId })
      .from(workPackageOrganization)
      .where(
        and(
          eq(workPackageOrganization.resourceId, rank.workPackageId),
          eq(workPackageOrganization.organizationId, rank.organizationId),
        ),
      )
      .get();
    // Proof, observed 2026-09-29: with this read skipped, `refuses the
    // whole restore when a saved work package is gone` in
    // `work-package-rank.db.test.ts` threw drizzle's `Failed query: insert into
    // "work_package_rank"` instead of naming the workPackage.
    if (owned === undefined) {
      throw new Error(
        `saved rank of work package ${rank.workPackageId}: organization ${rank.organizationId} no longer owns it`,
      );
    }
    const author = tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, rank.createdBy))
      .get();
    if (author === undefined) {
      throw new Error(
        `saved rank of work package ${rank.workPackageId} was written by ${rank.createdBy}, who is no longer a user`,
      );
    }
    tx.insert(workPackageRank).values(rank).run();
  }
  return ranks.length;
}
