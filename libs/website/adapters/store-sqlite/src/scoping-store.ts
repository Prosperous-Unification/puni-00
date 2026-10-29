import {
  isQuestionId,
  isStartingChoiceId,
  type QuestionId,
  type ScopingReply,
  type StartingChoiceId,
} from '@website/contracts';
import type { Database } from 'bun:sqlite';

/** New drafts retain explicit start intent independently of their opening description. */
export interface ScopingIntent {
  version: 1;
  startConversation: boolean;
  startingChoice: StartingChoiceId | null;
}

export interface ScopingState extends ScopingIntent {
  questionId: QuestionId | null;
  revision: number;
  references: string | null;
  candidateBrief: string | null;
  emailInvitationDeclined: boolean;
}

export type DraftScoping = { version: 'legacy' } | ScopingState;
export type ScopingEdit =
  | { kind: 'references'; references: string | null }
  | { kind: 'brief'; brief: string }
  | { kind: 'accept_candidate' }
  | { kind: 'decline_email' };
export type ScopingEditOutcome =
  | { kind: 'updated'; scoping: ScopingState }
  | { kind: 'stale'; scoping: ScopingState }
  | { kind: 'missing' | 'legacy' | 'no_candidate' };

interface ScopingRow {
  question_id: unknown;
  revision: unknown;
  reference_text: unknown;
  candidate_brief: unknown;
  email_invitation_declined: unknown;
  created_at: unknown;
  updated_at: unknown;
  first_content_at: unknown;
}

interface IntentRow {
  scoping_version: unknown;
  start_conversation: unknown;
  starting_choice: unknown;
}

function isOptionalText(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= 4000);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function readScopingFields(row: ScopingRow | null): Omit<ScopingState, keyof ScopingIntent> {
  // Proof: individually bypassing the question, revision, text, decline and timestamp checks failed
  // the corresponding malformed-state fixture; missing rows and missing content anchors failed too.
  if (
    !row ||
    (row.question_id !== null && !isQuestionId(row.question_id)) ||
    !isTimestamp(row.revision) ||
    !isOptionalText(row.reference_text) ||
    !isOptionalText(row.candidate_brief) ||
    (row.candidate_brief !== null && row.candidate_brief.trim().length === 0) ||
    ((row.reference_text !== null || row.candidate_brief !== null) &&
      row.first_content_at === null) ||
    (row.email_invitation_declined !== 0 && row.email_invitation_declined !== 1) ||
    !isTimestamp(row.created_at) ||
    !isTimestamp(row.updated_at) ||
    (row.first_content_at !== null && !isTimestamp(row.first_content_at))
  )
    throw new Error('Malformed scoping state');
  return {
    questionId: row.question_id,
    revision: row.revision,
    references: row.reference_text,
    candidateBrief: row.candidate_brief,
    emailInvitationDeclined: row.email_invitation_declined === 1,
  };
}

/** Reads trusted persisted state; absence is legacy only when every versioned field is absent. */
export function readDraftScoping(
  database: Database,
  draftId: string,
  intent: IntentRow,
): DraftScoping {
  const row = database
    .query<ScopingRow, [string]>('SELECT * FROM draft_scoping WHERE draft_id = ?')
    .get(draftId);
  if (intent.scoping_version === null) {
    // Proof: bypassing this check accepted the version-null state with a surviving scoping row.
    if (intent.start_conversation !== null || intent.starting_choice !== null || row !== null)
      throw new Error('Malformed legacy scoping state');
    return { version: 'legacy' };
  }
  // Proof: bypassing each version, start-intent or choice clause accepted its malformed-state fixture.
  if (
    intent.scoping_version !== 1 ||
    (intent.start_conversation !== 0 && intent.start_conversation !== 1) ||
    (intent.starting_choice !== null && !isStartingChoiceId(intent.starting_choice))
  )
    throw new Error('Malformed scoping intent');
  return {
    version: 1,
    startConversation: intent.start_conversation === 1,
    startingChoice: intent.starting_choice,
    ...readScopingFields(row),
  };
}

/** Creates state inside the draft admission transaction; failure rolls back the draft and its cap. */
export function createScopingState(
  database: Database,
  draftId: string,
  intent: ScopingIntent,
  now: number,
): void {
  database
    .query(
      'UPDATE intake_draft SET scoping_version = ?, start_conversation = ?, starting_choice = ? WHERE id = ?',
    )
    .run(intent.version, intent.startConversation ? 1 : 0, intent.startingChoice, draftId);
  database
    .query('INSERT INTO draft_scoping (draft_id, created_at, updated_at) VALUES (?, ?, ?)')
    .run(draftId, now, now);
  const stored = database
    .query<IntentRow, [string]>(
      'SELECT scoping_version, start_conversation, starting_choice FROM intake_draft WHERE id = ?',
    )
    .get(draftId);
  // Proof: removing this check lost the contextual refusal after an injected trigger deleted the draft.
  if (!stored) throw new Error('Scoping draft creation was not visible');
  readDraftScoping(database, draftId, stored);
}

function assertScopingWritable(database: Database, draftId: string): void {
  const fenced = database
    .query<{ subject_id: string }, [string]>(
      `SELECT subject_id FROM retention_subject AS fence WHERE erasure_state <> 'none'
    AND ((subject_kind = 'software_request' AND subject_id IN (SELECT id FROM software_request WHERE draft_id = ?1))
      OR (subject_kind = 'proposal_submission' AND subject_id IN (SELECT id FROM proposal_submission WHERE draft_id = ?1))) LIMIT 1`,
    )
    .get(draftId);
  // Proof: removing this check allowed email-decline and question-only writes on fenced ownership.
  if (fenced) throw new Error('retention: subject content is fenced');
}

/** Edits only a live claim's state; the immediate transaction compares and increments its revision. */
export function editScoping(
  database: Database,
  claimHash: string,
  revision: number,
  edit: ScopingEdit,
  now: number,
): ScopingEditOutcome {
  return database
    .transaction((): ScopingEditOutcome => {
      // Proof: bypassing claim, expiry or consumption independently failed the live-ownership fixture.
      const draft = database
        .query<IntentRow & { id: string }, [string, number]>(
          'SELECT id, scoping_version, start_conversation, starting_choice FROM intake_draft WHERE claim_hash = ? AND expires_at > ? AND consumed_at IS NULL',
        )
        .get(claimHash, now);
      if (!draft) return { kind: 'missing' };
      const scoping = readDraftScoping(database, draft.id, draft);
      if (scoping.version === 'legacy') return { kind: 'legacy' };
      assertScopingWritable(database, draft.id);
      // Proof: bypassing this match overwrote Visitor edit with Stale overwrite in the stale-edit fixture.
      if (scoping.revision !== revision) return { kind: 'stale', scoping };
      // Proof: bypassing this refusal made the absent-candidate fixture attempt a null canonical brief.
      if (edit.kind === 'accept_candidate' && scoping.candidateBrief === null)
        return { kind: 'no_candidate' };
      if (edit.kind === 'references')
        database
          .query(
            'UPDATE draft_scoping SET reference_text = ?, first_content_at = CASE WHEN ? IS NOT NULL THEN coalesce(first_content_at, ?) ELSE first_content_at END WHERE draft_id = ?',
          )
          .run(edit.references, edit.references, now, draft.id);
      if (edit.kind === 'decline_email')
        database
          .query('UPDATE draft_scoping SET email_invitation_declined = 1 WHERE draft_id = ?')
          .run(draft.id);
      if (edit.kind === 'brief' || edit.kind === 'accept_candidate')
        database
          .query('UPDATE intake_draft SET brief = ? WHERE id = ?')
          .run(edit.kind === 'brief' ? edit.brief : scoping.candidateBrief, draft.id);
      database
        .query(
          'UPDATE draft_scoping SET revision = revision + 1, updated_at = ? WHERE draft_id = ?',
        )
        .run(now, draft.id);
      const fields = database
        .query<ScopingRow, [string]>('SELECT * FROM draft_scoping WHERE draft_id = ?')
        .get(draft.id);
      return { kind: 'updated', scoping: { ...scoping, ...readScopingFields(fields) } };
    })
    .immediate();
}

/**
 * Applies a validated reply inside the caller's operation settlement transaction. Never opens or
 * commits a transaction: usage, turns, reply_version and this state must commit together. Uses
 * the latest revision, references and visitor brief, even when edited during inference. Returns
 * false for a missing, expired, consumed or legacy draft. Erasure fences throw and roll back.
 */
export function applyScopingReply(
  database: Database,
  draftId: string,
  reply: ScopingReply,
  now: number,
): boolean {
  // Proof: bypassing this guard let the reply fixture commit state outside its settlement transaction.
  if (!database.inTransaction)
    throw new Error('Scoping reply requires the operation settlement transaction');
  // Proof: bypassing expiry or consumption independently admitted the late-reply ownership fixture.
  const draft = database
    .query<IntentRow, [string, number]>(
      'SELECT scoping_version, start_conversation, starting_choice FROM intake_draft WHERE id = ? AND expires_at > ? AND consumed_at IS NULL',
    )
    .get(draftId, now);
  if (!draft) return false;
  const scoping = readDraftScoping(database, draftId, draft);
  if (scoping.version === 'legacy') return false;
  assertScopingWritable(database, draftId);
  database
    .query(
      'UPDATE draft_scoping SET question_id = ?, revision = revision + 1, candidate_brief = CASE WHEN ? IS NULL THEN candidate_brief ELSE ? END, updated_at = ?, first_content_at = CASE WHEN ? IS NULL THEN first_content_at ELSE coalesce(first_content_at, ?) END WHERE draft_id = ?',
    )
    .run(reply.nextQuestionId, reply.brief, reply.brief, now, reply.brief, now, draftId);
  // Proof: removing the first-candidate condition replaced a brief the visitor intentionally cleared;
  // removing the SQL empty-brief condition replaced the visitor brief saved during inference.
  if (reply.brief !== null && scoping.candidateBrief === null)
    database
      .query("UPDATE intake_draft SET brief = ? WHERE id = ? AND brief = ''")
      .run(reply.brief, draftId);
  return true;
}

/** Blanks draft-owned scoping text while preserving revision and retention/accounting lineage. */
export function eraseScopingContent(database: Database, draftId: string): void {
  // Proof: omitting either column left its SECRET sentinel in both request and submission erasure fixtures.
  database
    .query(
      'UPDATE draft_scoping SET reference_text = NULL, candidate_brief = NULL WHERE draft_id = ?',
    )
    .run(draftId);
}
