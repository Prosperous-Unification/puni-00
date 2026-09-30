import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';

import { Database } from 'bun:sqlite';

import { existingDatabasePath, validateDatabase } from './checked-database';

interface CandidateRow {
  id: string;
  expires_at: number;
}

export interface DraftCleanupPlan {
  cutoff: number;
  eligibleDrafts: number;
  fingerprint: string;
}

const candidateQuery = `
  SELECT draft.id, draft.expires_at
  FROM intake_draft AS draft
  WHERE draft.expires_at <= ? AND draft.consumed_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM proposal_submission WHERE draft_id = draft.id)
    AND NOT EXISTS (SELECT 1 FROM software_request WHERE draft_id = draft.id)
    AND NOT EXISTS (SELECT 1 FROM account_request WHERE draft_id = draft.id)
    AND NOT EXISTS (SELECT 1 FROM submission_replay WHERE claim_hash = draft.claim_hash)
  ORDER BY draft.id`;

function eligibleCandidates(database: Database, cutoff: number): CandidateRow[] {
  // Proof: mixed-cohort fixtures fail independently when expiry or any one association exclusion is removed.
  return database.query<CandidateRow, [number]>(candidateQuery).all(cutoff);
}

function planFor(
  database: Database,
  databasePath: string,
  cutoff: number,
): {
  plan: DraftCleanupPlan;
  candidates: CandidateRow[];
} {
  validateDatabase(database, 'Draft retention');
  const candidates = eligibleCandidates(database, cutoff);
  const identity = statSync(databasePath);
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify([
        databasePath,
        identity.dev,
        identity.ino,
        cutoff,
        candidates.map(({ id, expires_at }) => [id, expires_at]),
      ]),
    )
    .digest('hex');
  return { plan: { cutoff, eligibleDrafts: candidates.length, fingerprint }, candidates };
}

/** Inspects an existing website database without migrating or recovering any chat operation. */
export function inspectExpiredDrafts(databasePath: string, cutoff: number): DraftCleanupPlan {
  const path = existingDatabasePath(databasePath, false, 'Draft retention');
  const database = new Database(path, { readonly: true });
  try {
    return planFor(database, path, cutoff).plan;
  } finally {
    database.close();
  }
}

/** Applies one reviewed cohort atomically; a changed plan leaves the database untouched. */
export function purgeExpiredDrafts(
  databasePath: string,
  cutoff: number,
  expectedFingerprint: string,
  now: number,
): { deletedDrafts: number } {
  // Proof: the future-cutoff fixture fails when this guard is removed and then deletes a live draft.
  if (cutoff > now) throw new Error('Draft retention cutoff is in the future');
  const path = existingDatabasePath(databasePath, true, 'Draft retention');
  const database = new Database(path, { readwrite: true });
  try {
    database.run('PRAGMA foreign_keys = ON');
    database.run('BEGIN IMMEDIATE');
    try {
      const { plan, candidates } = planFor(database, path, cutoff);
      // Proof: changed-cohort and different-database fixtures fail when this comparison is removed.
      if (plan.fingerprint !== expectedFingerprint)
        throw new Error('Draft retention plan changed; inspect again');
      const remove = database.query('DELETE FROM intake_draft WHERE id = ?');
      for (const candidate of candidates) {
        const deletion = remove.run(candidate.id);
        // Proof: a patched second statement returning zero changes fails this guard and rolls back the first deletion.
        if (deletion.changes !== 1) throw new Error('Draft retention deletion count changed');
      }
      // Proof: a second-delete statement fault leaves both drafts after rollback; removing BEGIN/ROLLBACK leaves the first deleted.
      database.run('COMMIT');
      return { deletedDrafts: candidates.length };
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  } finally {
    database.close();
  }
}
