import type { Database } from 'bun:sqlite';

import { busyTimeoutMilliseconds } from './checked-database';
import { eraseConversationContent } from './conversation-store';
import type { RetentionSubjectKind } from './request-retention';

/** A typed retention identity; see the website CONTEXT glossary. */
export interface RetentionSubjectRef {
  kind: RetentionSubjectKind;
  id: string;
}

/** The SQLite trigger message every content fence in migration 010 raises. */
export const contentFenceMessage = 'retention: subject content is fenced';

/** True for the ABORT a migration-010 content fence raises; any other error is unexpected. */
export function isContentFence(error: unknown): boolean {
  return error instanceof Error && error.message.includes(contentFenceMessage);
}

/** The subject cannot be erased without touching another subject's content. */
export class ErasureRefusedError extends Error {
  override readonly name = 'ErasureRefusedError';

  constructor(
    readonly subject: RetentionSubjectRef,
    readonly reason: 'shared_draft_lineage' | 'not_fenceable' | 'missing_subject',
    detail: string,
  ) {
    super(`Retention erasure of ${subject.kind} ${subject.id} refused: ${detail}`);
  }
}

function nonblank(expression: string): string {
  return `(trim(${expression}, char(9, 10, 11, 12, 13, 32)) <> '')`;
}

interface RequestLineage {
  id: string;
  account_id: string;
  draft_id: string | null;
  created_at: number;
  claim_hash: string | null;
}

interface SubmissionLineage {
  id: string;
  draft_id: string;
  claim_hash: string;
}

/**
 * True when software request `?1` still holds nonblank text in any current table that belongs
 * to it: description, brief, chat, operations, preview, its draft, conversation or submission.
 * Empty `ensureBlankRequest` rows and migration 004 placeholders hold none.
 */
const requestRetainsContent = `(
  SELECT ${nonblank('request.description')} OR ${nonblank('request.brief')}
    OR EXISTS (SELECT 1 FROM chat_turn WHERE request_id = request.id AND ${nonblank('content')})
    OR EXISTS (SELECT 1 FROM chat_operation WHERE request_id = request.id
      AND (${nonblank('message')} OR ${nonblank("coalesce(reply, '')")}))
    OR EXISTS (SELECT 1 FROM request_concept_preview WHERE request_id = request.id AND ${nonblank('body')})
    OR EXISTS (SELECT 1 FROM intake_draft WHERE id = request.draft_id
      AND (${nonblank('description')} OR ${nonblank('brief')}))
    OR EXISTS (SELECT 1 FROM proposal_submission WHERE draft_id = request.draft_id
      AND (${nonblank('brief')} OR ${nonblank('email')}))
    OR EXISTS (SELECT 1 FROM conversation AS talk JOIN conversation_turn AS turn ON turn.conversation_id = talk.id
      WHERE talk.draft_id = request.draft_id AND ${nonblank('turn.content')})
    OR EXISTS (SELECT 1 FROM conversation AS talk JOIN conversation_operation AS step ON step.conversation_id = talk.id
      WHERE talk.draft_id = request.draft_id
        AND (${nonblank('step.message')} OR ${nonblank("coalesce(step.reply, '')")}))
  FROM software_request AS request WHERE request.id = ?1)`;

function subjectState(
  database: Database,
  subject: RetentionSubjectRef,
): { erasure_state: 'none' | 'fenced' | 'erased'; classification: string } | null {
  return database
    .query<
      { erasure_state: 'none' | 'fenced' | 'erased'; classification: string },
      [string, string]
    >(
      'SELECT erasure_state, classification FROM retention_subject WHERE subject_kind = ? AND subject_id = ?',
    )
    .get(subject.kind, subject.id);
}

function markOperationsUnknown(database: Database, subject: RetentionSubjectRef): void {
  const draftId =
    subject.kind === 'software_request'
      ? database
          .query<{ draft_id: string | null }, [string]>(
            'SELECT draft_id FROM software_request WHERE id = ?',
          )
          .get(subject.id)?.draft_id
      : database
          .query<{ draft_id: string }, [string]>(
            'SELECT draft_id FROM proposal_submission WHERE id = ?',
          )
          .get(subject.id)?.draft_id;
  if (subject.kind === 'software_request')
    // Proof: removing this update left `unknown provider usage keeps its reservation` with the operation `inflight`.
    database
      .query(
        "UPDATE chat_operation SET state = 'unknown' WHERE request_id = ? AND state = 'inflight'",
      )
      .run(subject.id);
  if (draftId !== null && draftId !== undefined)
    database
      .query(
        "UPDATE conversation_operation SET state = 'unknown', settlement = 'reserved_ceiling', settled_micro_usd = reserved_micro_usd WHERE state = 'inflight' AND conversation_id IN (SELECT id FROM conversation WHERE draft_id = ?)",
      )
      .run(draftId);
}

/**
 * Starts an erasure (design D§7 step 1): moves a `non_client` subject from `none` to `fenced`
 * and makes its in-flight chat and conversation operations `unknown`, keeping each provider
 * reservation unsettled. From here the migration-010 triggers refuse every content write.
 *
 * @throws ErasureRefusedError when the subject is absent, not `non_client` or not `none`.
 */
export function fenceSubject(database: Database, subject: RetentionSubjectRef): void {
  database
    .transaction(() => {
      const state = subjectState(database, subject);
      if (!state) throw new ErasureRefusedError(subject, 'missing_subject', 'no retention subject');
      // Proof: dropping the classification condition made `fencing refuses a client or held subject` fence both.
      if (state.classification !== 'non_client' || state.erasure_state !== 'none')
        throw new ErasureRefusedError(
          subject,
          'not_fenceable',
          `classification ${state.classification}, erasure ${state.erasure_state}`,
        );
      database
        .query(
          "UPDATE retention_subject SET erasure_state = 'fenced' WHERE subject_kind = ? AND subject_id = ? AND erasure_state = 'none'",
        )
        .run(subject.kind, subject.id);
      markOperationsUnknown(database, subject);
    })
    .immediate();
}

/** Undoes {@link fenceSubject} when the journal refused the erasure; content was never touched. */
export function releaseFence(database: Database, subject: RetentionSubjectRef): void {
  database
    .query(
      "UPDATE retention_subject SET erasure_state = 'none' WHERE subject_kind = ? AND subject_id = ? AND erasure_state = 'fenced'",
    )
    .run(subject.kind, subject.id);
}

function refuseSharedRequestDraft(database: Database, request: RequestLineage): void {
  if (request.draft_id === null) return;
  const shared = database
    .query<{ count: number }, [string, string]>(
      `SELECT
        (SELECT count(*) FROM account_request WHERE draft_id = ?1 AND account_id <> ?2)
        + (SELECT count(*) FROM retention_subject AS subject JOIN proposal_submission AS submission
            ON subject.subject_kind = 'proposal_submission' AND subject.subject_id = submission.id
            WHERE submission.draft_id = ?1) AS count`,
    )
    .get(request.draft_id, request.account_id);
  // Proof: skipping this refusal made `shared draft lineage is refused, not erased` erase the request instead of throwing.
  if ((shared?.count ?? 0) > 0)
    throw new ErasureRefusedError(
      { kind: 'software_request', id: request.id },
      'shared_draft_lineage',
      'another subject names its draft',
    );
}

// Proof: omitting the chat_turn or account_request update made `a due account request is blanked in every current and
// legacy table` name that column; omitting the claim replay update failed the manual-proposal test on submission_replay.
function eraseRequestContent(database: Database, request: RequestLineage): void {
  refuseSharedRequestDraft(database, request);
  database
    .query("UPDATE software_request SET description = '', brief = '' WHERE id = ?")
    .run(request.id);
  database.query("UPDATE chat_turn SET content = '' WHERE request_id = ?").run(request.id);
  database
    .query(
      "UPDATE chat_operation SET message = '', reply = CASE WHEN reply IS NULL THEN NULL ELSE '' END WHERE request_id = ?",
    )
    .run(request.id);
  database
    .query("UPDATE request_concept_preview SET body = '' WHERE request_id = ?")
    .run(request.id);
  database
    .query(
      "UPDATE submission_replay SET receipt = '', body_hash = '' WHERE request_id = ?1 OR (?2 IS NOT NULL AND claim_hash = ?2)",
    )
    .run(request.id, request.claim_hash);
  // Migration 004 copied account_request into software_request with the same draft, or with
  // the same created_at when it had no draft; concept_preview went to the latest request.
  database
    .query(
      `UPDATE account_request SET description = '', brief = ''
       WHERE account_id = ?1 AND (draft_id = ?2 OR (draft_id IS NULL AND ?2 IS NULL AND created_at = ?3))`,
    )
    .run(request.account_id, request.draft_id, request.created_at);
  database
    .query(
      `UPDATE concept_preview SET body = '' WHERE account_id = ?1
       AND (created_at IN (SELECT created_at FROM request_concept_preview WHERE request_id = ?2)
         OR NOT EXISTS (SELECT 1 FROM software_request WHERE account_id = ?1 AND id <> ?2))`,
    )
    .run(request.account_id, request.id);
  if (request.draft_id === null) return;
  database
    .query("UPDATE intake_draft SET description = '', brief = '' WHERE id = ?")
    .run(request.draft_id);
  database
    .query("UPDATE proposal_submission SET brief = '', email = '' WHERE draft_id = ?")
    .run(request.draft_id);
  eraseConversationContent(database, request.draft_id);
}

function eraseSubmissionContent(database: Database, submission: SubmissionLineage): void {
  const shared = database
    .query<{ count: number }, [string]>(
      `SELECT (SELECT count(*) FROM software_request WHERE draft_id = ?1)
        + (SELECT count(*) FROM account_request WHERE draft_id = ?1) AS count`,
    )
    .get(submission.draft_id);
  // Proof: skipping this refusal made `shared draft lineage is refused, not erased` erase the proposal instead of throwing.
  if ((shared?.count ?? 0) > 0)
    throw new ErasureRefusedError(
      { kind: 'proposal_submission', id: submission.id },
      'shared_draft_lineage',
      'a software request or legacy account row names its draft',
    );
  database
    .query("UPDATE intake_draft SET description = '', brief = '' WHERE id = ?")
    .run(submission.draft_id);
  database
    .query("UPDATE proposal_submission SET brief = '', email = '' WHERE id = ?")
    .run(submission.id);
  database
    .query("UPDATE submission_replay SET receipt = '', body_hash = '' WHERE claim_hash = ?")
    .run(submission.claim_hash);
  eraseConversationContent(database, submission.draft_id);
}

/**
 * Removes the account's email, OIDC links and sessions unless another of its requests still
 * holds content and is not erased (design D§7 step 4). The email becomes `erased:<id>` because
 * the column is `NOT NULL UNIQUE`; the account id stays for provider accounting.
 *
 * @returns whether the identity was erased by this call.
 */
export function eraseAccountIdentityIfUnneeded(
  database: Database,
  accountId: string,
  erasedRequestId: string,
): boolean {
  const others = database
    .query<{ id: string }, [string, string]>(
      `SELECT request.id FROM software_request AS request
       LEFT JOIN retention_subject AS subject
         ON subject.subject_kind = 'software_request' AND subject.subject_id = request.id
       WHERE request.account_id = ? AND request.id <> ? AND coalesce(subject.erasure_state, 'none') <> 'erased'`,
    )
    .all(accountId, erasedRequestId);
  const retains = database.query<{ retains: number }, [string]>(
    `SELECT ${requestRetainsContent} AS retains`,
  );
  // Proof: skipping this check erased the shared email in `two due requests sharing an account keep the email while one is held`.
  if (others.some(({ id }) => retains.get(id)?.retains === 1)) return false;
  const account = database
    .query<{ email: string }, [string]>('SELECT email FROM prospect_account WHERE id = ?')
    .get(accountId);
  if (!account) throw new Error('Erased request names a missing prospect account');
  if (account.email === `erased:${accountId}`) return false;
  database.query("UPDATE prospect_account SET email = 'erased:' || id WHERE id = ?").run(accountId);
  database.query('DELETE FROM oidc_identity WHERE account_id = ?').run(accountId);
  database.query('DELETE FROM prospect_session WHERE account_id = ?').run(accountId);
  return true;
}

/** What one {@link eraseSubjectContent} call changed. */
export interface ErasureOutcome {
  /** `tombstone`: the subject is absent from this database (an older snapshot). */
  kind: 'erased' | 'already_erased' | 'tombstone';
  identityErased: boolean;
}

/**
 * Blanks every current and legacy content row of one subject, marks it `erased` with the
 * journal `sequence`, and erases the account identity when nothing else needs it (design D§7
 * steps 3–4). Call it inside the caller's primary transaction after the journal confirmed the
 * `erase` event, with `PRAGMA secure_delete = ON` on the connection. Ids, timestamps,
 * `provider_call`, operation state and settlement stay. Replaying it is idempotent.
 *
 * @throws ErasureRefusedError for shared draft lineage; the caller's transaction rolls back.
 */
export function eraseSubjectContent(
  database: Database,
  subject: RetentionSubjectRef,
  sequence: number,
  now: number,
): ErasureOutcome {
  let accountId: string | null = null;
  if (subject.kind === 'software_request') {
    const request = database
      .query<RequestLineage, [string]>(
        `SELECT request.id, request.account_id, request.draft_id, request.created_at, draft.claim_hash
         FROM software_request AS request LEFT JOIN intake_draft AS draft ON draft.id = request.draft_id
         WHERE request.id = ?`,
      )
      .get(subject.id);
    if (!request) return { kind: 'tombstone', identityErased: false };
    eraseRequestContent(database, request);
    accountId = request.account_id;
  } else {
    const submission = database
      .query<SubmissionLineage, [string]>(
        `SELECT submission.id, submission.draft_id, draft.claim_hash FROM proposal_submission AS submission
         JOIN intake_draft AS draft ON draft.id = submission.draft_id WHERE submission.id = ?`,
      )
      .get(subject.id);
    if (!submission) return { kind: 'tombstone', identityErased: false };
    eraseSubmissionContent(database, submission);
  }
  const state = subjectState(database, subject);
  if (!state) throw new ErasureRefusedError(subject, 'missing_subject', 'no retention subject');
  const already = state.erasure_state === 'erased';
  if (!already)
    database
      .query(
        "UPDATE retention_subject SET erasure_state = 'erased', erasure_sequence = ?, erased_at = ? WHERE subject_kind = ? AND subject_id = ?",
      )
      .run(sequence, now, subject.kind, subject.id);
  const identityErased =
    accountId !== null && eraseAccountIdentityIfUnneeded(database, accountId, subject.id);
  return { kind: already ? 'already_erased' : 'erased', identityErased };
}

/**
 * Enables `secure_delete` so freed pages are zeroed. Call it on the connection before the
 * first {@link eraseSubjectContent} of a run.
 */
export function prepareErasureConnection(database: Database): void {
  database.run('PRAGMA secure_delete = ON');
  database.run(`PRAGMA busy_timeout = ${String(busyTimeoutMilliseconds)}`);
}

/**
 * Rewrites the database file after erasures so no blanked text survives in free pages or
 * unused cell space. `VACUUM` waits out the connection's busy timeout, then throws.
 */
export function compactAfterErasure(database: Database): void {
  // Proof: removing this VACUUM together with `secure_delete` let the byte grep find the sentinel in the file in
  // `erased text is absent from the database file and a fresh VACUUM INTO backup`; either one alone cleared that fixture.
  database.run('VACUUM');
}
