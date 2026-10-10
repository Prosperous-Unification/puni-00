import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';

import { Database } from 'bun:sqlite';

import { existingDatabasePath, validateDatabase } from './checked-database';
import { eraseConversationContent } from './conversation-store';

interface CandidateRow {
  id: string;
  expires_at: number;
  conversation_id: string | null;
  turns: number;
  completed_operations: number;
  retained_operations: number;
}

/**
 * Count-only plan for one expired-draft cohort. A draft whose conversation still holds an
 * operation that is not completed (`unknown`, or `inflight` in a live process), or any operation
 * on or after the cutoff's UTC day, is retained with its text blanked, so that day's spend stays
 * in the ceilings; every other candidate is deleted with its conversation, turns and completed
 * operations.
 */
export interface DraftCleanupPlan {
  cutoff: number;
  eligibleDrafts: number;
  retainedDrafts: number;
  conversations: number;
  conversationTurns: number;
  completedOperations: number;
  retainedOperations: number;
  fingerprint: string;
}

export interface DraftCleanupOutcome {
  deletedDrafts: number;
  retainedDrafts: number;
  deletedConversations: number;
  deletedConversationTurns: number;
  deletedConversationOperations: number;
  retainedOperations: number;
}

// A retained draft is blanked, and intake never stores a blank description, so `description <> ''`
// keeps an already-retained draft out of later cohorts.
const candidateQuery = `
  SELECT draft.id, draft.expires_at, talk.id AS conversation_id,
    (SELECT count(*) FROM conversation_turn WHERE conversation_id = talk.id) AS turns,
    (SELECT count(*) FROM conversation_operation
      WHERE conversation_id = talk.id AND state = 'completed' AND utc_day < ?2) AS completed_operations,
    (SELECT count(*) FROM conversation_operation
      WHERE conversation_id = talk.id AND (state <> 'completed' OR utc_day >= ?2)) AS retained_operations
  FROM intake_draft AS draft
  LEFT JOIN conversation AS talk ON talk.draft_id = draft.id
  WHERE draft.expires_at <= ?1 AND draft.consumed_at IS NULL AND draft.description <> ''
    AND NOT EXISTS (SELECT 1 FROM proposal_submission WHERE draft_id = draft.id)
    AND NOT EXISTS (SELECT 1 FROM software_request WHERE draft_id = draft.id)
    AND NOT EXISTS (SELECT 1 FROM account_request WHERE draft_id = draft.id)
    AND NOT EXISTS (SELECT 1 FROM submission_replay WHERE claim_hash = draft.claim_hash)
  ORDER BY draft.id`;

function eligibleCandidates(database: Database, cutoff: number): CandidateRow[] {
  // Proof: mixed-cohort fixtures fail independently when expiry or any one association exclusion is removed.
  // Proof: dropping `utc_day < ?2` made the same-day purge test plan that day's two completed operations for deletion.
  return database
    .query<CandidateRow, [number, string]>(candidateQuery)
    .all(cutoff, new Date(cutoff).toISOString().slice(0, 10));
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
        candidates.map((candidate) => [
          candidate.id,
          candidate.expires_at,
          candidate.turns,
          candidate.completed_operations,
          candidate.retained_operations,
        ]),
      ]),
    )
    .digest('hex');
  const total = (pick: (candidate: CandidateRow) => number) =>
    candidates.reduce((sum, candidate) => sum + pick(candidate), 0);
  const retained = candidates.filter((candidate) => candidate.retained_operations > 0);
  return {
    plan: {
      cutoff,
      eligibleDrafts: candidates.length,
      retainedDrafts: retained.length,
      conversations: candidates.filter(
        (candidate) => candidate.conversation_id !== null && candidate.retained_operations === 0,
      ).length,
      conversationTurns: total((candidate) => candidate.turns),
      completedOperations: total((candidate) => candidate.completed_operations),
      retainedOperations: total((candidate) => candidate.retained_operations),
      fingerprint,
    },
    candidates,
  };
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
): DraftCleanupOutcome {
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
      const removeTurns = database.query('DELETE FROM conversation_turn WHERE conversation_id = ?');
      const removeCompleted = database.query(
        "DELETE FROM conversation_operation WHERE conversation_id = ? AND state = 'completed' AND utc_day < ?",
      );
      const removeConversation = database.query('DELETE FROM conversation WHERE id = ?');
      const blankDraft = database.query(
        "UPDATE intake_draft SET description = '', brief = '' WHERE id = ?",
      );
      const outcome: DraftCleanupOutcome = {
        deletedDrafts: 0,
        retainedDrafts: 0,
        deletedConversations: 0,
        deletedConversationTurns: 0,
        deletedConversationOperations: 0,
        retainedOperations: 0,
      };
      for (const candidate of candidates) {
        if (candidate.conversation_id !== null) {
          outcome.deletedConversationTurns += removeTurns.run(candidate.conversation_id).changes;
          outcome.deletedConversationOperations += removeCompleted.run(
            candidate.conversation_id,
            new Date(cutoff).toISOString().slice(0, 10),
          ).changes;
          if (candidate.retained_operations > 0) {
            eraseConversationContent(database, candidate.id);
            blankDraft.run(candidate.id);
            outcome.retainedDrafts += 1;
            outcome.retainedOperations += candidate.retained_operations;
            continue;
          }
          outcome.deletedConversations += removeConversation.run(candidate.conversation_id).changes;
        }
        const deletion = remove.run(candidate.id);
        // Proof: a patched second statement returning zero changes fails this guard and rolls back the first deletion.
        if (deletion.changes !== 1) throw new Error('Draft retention deletion count changed');
        outcome.deletedDrafts += 1;
      }
      // Proof: deleting non-completed operations too made the conversation purge test fail here with
      // "Draft retention conversation counts changed"; with this guard also removed it reported 4
      // deleted operations against a plan of 3.
      if (
        outcome.deletedConversations !== plan.conversations ||
        outcome.deletedConversationTurns !== plan.conversationTurns ||
        outcome.deletedConversationOperations !== plan.completedOperations
      )
        throw new Error('Draft retention conversation counts changed');
      // Proof: a second-delete statement fault leaves both drafts after rollback; removing BEGIN/ROLLBACK leaves the first deleted.
      database.run('COMMIT');
      return outcome;
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  } finally {
    database.close();
  }
}
