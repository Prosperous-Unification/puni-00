import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ChatTurn, ProposalStatus, SubmissionView } from '@website/contracts';
import { Database } from 'bun:sqlite';

import { busyTimeoutMilliseconds } from './checked-database';
import {
  admitConversationOperation,
  completeConversationOperation,
  completeDeclinedConversationOperation,
  type ConversationAdmission,
  type ConversationAdmissionRequest,
  conversationAllowance,
  type ConversationOperationRecord,
  type ConversationRecord,
  type ConversationRefusal,
  type ConversationTurn,
  findConversation,
  findConversationOperation,
  findLatestConversationOperation,
  handOffConversation,
  listConversationTurns,
  markConversationOperationUnknown,
  readSourceSalt,
  recordConversationGeneration,
  recoverConversationOperations,
} from './conversation-store';
import {
  clearSourceLoginFailures,
  countDraft,
  countProposal,
  DraftCapReached,
  type DraftCapRefusal,
  findOpenInferencePause,
  type GuardrailOverview,
  hashEmailKey,
  type InferencePause,
  openInferencePause,
  ProposalCapReached,
  type ProposalCapRefusal,
  readGuardrailOverview,
  readLoginLock,
  readLoginLocks,
  recordLoginFailure,
  resumeInferencePause,
  tripInferencePause,
  utcDayOf,
} from './guardrail-store';
import { websiteMigrations } from './migration-catalogue';
import {
  anchorRequestContent,
  backfillRetentionSubjects,
  insertRetentionSubject,
} from './request-retention';
export type {
  ConversationAdmission,
  ConversationAdmissionRequest,
  ConversationOperationRecord,
  ConversationPricing,
  ConversationRecord,
  ConversationRefusal,
  ConversationTurn,
} from './conversation-store';
export { conversationAllowance } from './conversation-store';
export type { DraftCleanupOutcome, DraftCleanupPlan } from './draft-retention';
export { inspectExpiredDrafts, purgeExpiredDrafts } from './draft-retention';
export type {
  DraftCapRefusal,
  GuardrailAlert,
  GuardrailOverview,
  InferencePause,
  ProposalCapRefusal,
} from './guardrail-store';
export { guardrailAllowance } from './guardrail-store';
export type {
  AmbiguousRetentionSubject,
  AnchorResolution,
  RetentionAmbiguity,
  RetentionReport,
  RetentionSubjectCounts,
  RetentionSubjectKind,
} from './request-retention';
export {
  addUtcMonths,
  assertRetentionCoverage,
  inspectRequestRetention,
  listAmbiguousRetentionSubjects,
  resolveRetentionAnchor,
} from './request-retention';

interface DraftRow {
  id: string;
  description: string;
  brief: string;
  claim_hash: string;
  expires_at: number;
  consumed_at: number | null;
}

interface ReplayRow {
  body_hash: string;
  receipt: string;
}

interface SessionRow {
  csrf_hash: string;
  expires_at: number;
  mode?: 'demo' | 'oidc';
}

interface AccountRow {
  id: string;
  email: string;
}

interface StatusRow {
  status: ProposalStatus;
}

interface MigrationRow {
  checksum: string;
}

interface SubmissionRow {
  id: string;
  description: string;
  brief: string;
  email: string;
  status: ProposalStatus;
  created_at: number;
  updated_at: number;
}

interface TurnRow {
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
}

interface ChatOperationRow {
  id: string;
  body_hash: string;
  state: 'inflight' | 'completed' | 'unknown';
  reply: string | null;
  provider_call_id: string | null;
}

export type ChatAdmission =
  | { kind: 'started'; id: string }
  | { kind: 'completed'; reply: string }
  | { kind: 'paused'; openedPauseId: string | null }
  | {
      kind:
        | 'inflight'
        | 'unknown'
        | 'conflict'
        | 'turn_limit'
        | 'budget'
        | 'request_unavailable'
        | 'provider_unavailable';
    };

export interface DraftRecord {
  id: string;
  description: string;
  brief: string;
  expiresAt: number;
}

/** The outcome of {@link WebsiteStore.reserveProviderCall}. */
export type ProviderReservation =
  | { kind: 'reserved'; id: string }
  | { kind: 'refused' }
  | { kind: 'paused'; openedPauseId: string | null };

/** `siteCount` is the day's site-wide proposal count including this one. */
export type SubmitOutcome =
  | { kind: 'created'; receipt: string; siteCount: number }
  | { kind: 'replayed'; receipt: string }
  | { kind: 'conflict' }
  | { kind: 'unavailable' }
  | { kind: 'limited'; code: ProposalCapRefusal };

/** `siteCount` is the day's site-wide draft count including this one. */
export type DraftCreation = { kind: 'created'; siteCount: number } | { kind: DraftCapRefusal };

/**
 * Owns the independent website SQLite database and refuses an edited applied migration.
 * Startup records a retention subject for any request or standalone submission that lacks one
 * ({@link backfillRetentionSubjects}); content writes anchor a blank request's deadline.
 */
export class WebsiteStore {
  private readonly database: Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new Database(path, { create: true });
    this.database.run('PRAGMA foreign_keys = ON');
    // Proof: without this timeout, the startup-under-a-write-lock test failed with "database is locked".
    this.database.run(`PRAGMA busy_timeout = ${String(busyTimeoutMilliseconds)}`);
    this.database.run(
      'CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)',
    );
    for (const migration of websiteMigrations()) {
      const forward = readFileSync(join(migration.directory, 'migration.sql'), 'utf8');
      readFileSync(join(migration.directory, 'down.sql'), 'utf8');
      const checksum = createHash('sha256').update(forward).digest('hex');
      const applied = this.database
        .query<MigrationRow, [string]>('SELECT checksum FROM schema_migration WHERE name = ?')
        .get(migration.name);
      // Proof: replacing this checksum guard with false made the edited-applied-migration test accept a changed migration.
      if (applied && applied.checksum !== checksum)
        throw new Error(`Website migration ${migration.name} changed after application`);
      if (!applied) {
        this.database.transaction(() => {
          this.database.run(forward);
          this.database
            .query('INSERT INTO schema_migration (name, checksum) VALUES (?, ?)')
            .run(migration.name, checksum);
        })();
      }
    }
    backfillRetentionSubjects(this.database);
    // Proof: removing this restart update made the paid in-flight restart test retain a resumable operation.
    // An interrupted server process cannot prove final provider usage or safely resume its old stream.
    this.database.run("UPDATE chat_operation SET state = 'unknown' WHERE state = 'inflight'");
    // Proof: deleting this recovery made the conversation restart test find `inflight`.
    recoverConversationOperations(this.database);
  }

  /** See {@link admitConversationOperation}. */
  admitConversationOperation(request: ConversationAdmissionRequest): ConversationAdmission {
    return admitConversationOperation(this.database, request);
  }

  /** See {@link completeConversationOperation}. */
  completeConversationOperation(
    id: string,
    reply: string,
    actualMicroUsd: number | null,
    now: number,
    truncated: boolean,
  ): boolean {
    return completeConversationOperation(this.database, id, reply, actualMicroUsd, now, truncated);
  }

  /** See {@link completeDeclinedConversationOperation}. */
  completeDeclinedConversationOperation(
    id: string,
    reply: string,
    actualMicroUsd: number,
    now: number,
    refusal: ConversationRefusal,
  ): boolean {
    return completeDeclinedConversationOperation(
      this.database,
      id,
      reply,
      actualMicroUsd,
      now,
      refusal,
    );
  }

  /** See {@link markConversationOperationUnknown}. */
  markConversationOperationUnknown(id: string): boolean {
    return markConversationOperationUnknown(this.database, id);
  }

  /** See {@link recordConversationGeneration}. */
  recordConversationGeneration(id: string, generationId: string): void {
    recordConversationGeneration(this.database, id, generationId);
  }

  /** See {@link readSourceSalt}. */
  readSourceSalt(utcDay: string): Uint8Array {
    return readSourceSalt(this.database, utcDay);
  }

  findConversation(draftId: string): ConversationRecord | null {
    return findConversation(this.database, draftId);
  }

  listConversationTurns(conversationId: string): ConversationTurn[] {
    return listConversationTurns(this.database, conversationId);
  }

  findConversationOperation(
    conversationId: string,
    idempotencyKey: string,
  ): ConversationOperationRecord | null {
    return findConversationOperation(this.database, conversationId, idempotencyKey);
  }

  findLatestConversationOperation(conversationId: string): ConversationOperationRecord | null {
    return findLatestConversationOperation(this.database, conversationId);
  }

  /** Admits one account-owned, request-scoped chat operation and its optional provider reservation. */
  admitChatOperation(
    accountId: string,
    requestId: string,
    idempotencyKey: string,
    bodyHash: string,
    message: string,
    initial: boolean,
    reservedMicroUsd: number | null,
    now: number,
    allowNew = true,
  ): ChatAdmission {
    return this.database.transaction((): ChatAdmission => {
      const active = this.database
        .query<{ id: string }, [string, string]>(
          'SELECT id FROM software_request WHERE id = ? AND account_id = ? AND submitted_at IS NULL AND inactive_at IS NULL',
        )
        .get(requestId, accountId);
      if (!active) return { kind: 'request_unavailable' };
      const existing = this.database
        .query<ChatOperationRow, [string, string]>(
          'SELECT id, body_hash, state, reply, provider_call_id FROM chat_operation WHERE request_id = ? AND idempotency_key = ?',
        )
        .get(requestId, idempotencyKey);
      if (existing) {
        // Proof: the changed-body replay test fails if the same key may authorize different text.
        if (existing.body_hash !== bodyHash) return { kind: 'conflict' };
        if (existing.state === 'completed') {
          if (existing.reply === null) throw new Error('Completed chat operation has no reply');
          return { kind: 'completed', reply: existing.reply };
        }
        return { kind: existing.state };
      }
      // Proof: a completed operation replays while a new paid operation is refused after provider disablement.
      if (!allowNew) return { kind: 'provider_unavailable' };
      const used = this.database
        .query<{ count: number }, [string]>(
          "SELECT count(*) AS count FROM chat_turn WHERE request_id = ? AND role = 'user'",
        )
        .get(requestId);
      if (!used) throw new Error('Chat turn count query failed');
      if (used.count >= 12 || (initial && used.count > 0)) return { kind: 'turn_limit' };
      const running = this.database
        .query<{ count: number }, [string]>(
          "SELECT count(*) AS count FROM chat_operation WHERE account_id = ? AND state = 'inflight'",
        )
        .get(accountId);
      if (!running) throw new Error('Chat operation count query failed');
      if (running.count > 0) return { kind: 'inflight' };
      const reservation =
        reservedMicroUsd === null
          ? null
          : this.reserveProviderCall(accountId, requestId, reservedMicroUsd, now);
      if (reservation?.kind === 'paused') return reservation;
      if (reservation?.kind === 'refused') return { kind: 'budget' };
      const providerCallId = reservation?.id ?? null;
      const id = crypto.randomUUID();
      anchorRequestContent(this.database, requestId, message, now);
      this.database
        .query(
          'INSERT INTO chat_operation (id, account_id, request_id, idempotency_key, body_hash, message, initial, state, provider_call_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          id,
          accountId,
          requestId,
          idempotencyKey,
          bodyHash,
          message,
          initial ? 1 : 0,
          'inflight',
          providerCallId,
          now,
        );
      return { kind: 'started', id };
    })();
  }

  /** Commits usage and both turns together; an unknown operation cannot be made successful later. */
  completeChatOperation(
    id: string,
    reply: string,
    actualMicroUsd: number | null,
    now: number,
    truncated = false,
  ): boolean {
    return this.database.transaction(() => {
      const operation = this.database
        .query<
          {
            account_id: string;
            request_id: string;
            message: string;
            state: string;
            provider_call_id: string | null;
          },
          [string]
        >(
          'SELECT account_id, request_id, message, state, provider_call_id FROM chat_operation WHERE id = ?',
        )
        .get(id);
      if (operation?.state !== 'inflight') return false;
      if (operation.provider_call_id !== null) {
        if (
          actualMicroUsd === null ||
          !this.settleProviderCall(operation.provider_call_id, actualMicroUsd)
        )
          return false;
      } else if (actualMicroUsd !== null) return false;
      this.addTurn(operation.account_id, operation.request_id, 'user', operation.message, now);
      this.addTurn(operation.account_id, operation.request_id, 'assistant', reply, now + 1);
      const updated = this.database
        .query(
          "UPDATE chat_operation SET state = 'completed', reply = ?, truncated = ? WHERE id = ? AND state = 'inflight'",
        )
        .run(reply, truncated ? 1 : 0, id);
      return updated.changes === 1;
    })();
  }

  markChatOperationUnknown(id: string): boolean {
    return (
      this.database
        .query("UPDATE chat_operation SET state = 'unknown' WHERE id = ? AND state = 'inflight'")
        .run(id).changes === 1
    );
  }

  findChatOperation(
    accountId: string,
    requestId: string,
    idempotencyKey: string,
  ): { id: string; state: 'inflight' | 'completed' | 'unknown'; truncated: boolean } | null {
    const operation = this.database
      .query<
        { id: string; state: 'inflight' | 'completed' | 'unknown'; truncated: number },
        [string, string, string]
      >(
        'SELECT id, state, truncated FROM chat_operation WHERE account_id = ? AND request_id = ? AND idempotency_key = ?',
      )
      .get(accountId, requestId, idempotencyKey);
    return operation
      ? { id: operation.id, state: operation.state, truncated: operation.truncated === 1 }
      : null;
  }

  findLatestChatOperation(
    accountId: string,
    requestId: string,
  ): {
    idempotencyKey: string;
    state: 'inflight' | 'completed' | 'unknown';
    truncated: boolean;
    message: string;
  } | null {
    const operation = this.database
      .query<
        {
          idempotency_key: string;
          state: 'inflight' | 'completed' | 'unknown';
          truncated: number;
          message: string;
        },
        [string, string]
      >(
        'SELECT idempotency_key, state, truncated, message FROM chat_operation WHERE account_id = ? AND request_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
      )
      .get(accountId, requestId);
    return operation
      ? {
          idempotencyKey: operation.idempotency_key,
          state: operation.state,
          truncated: operation.truncated === 1,
          message: operation.message,
        }
      : null;
  }

  hasActiveChatOperation(accountId: string): boolean {
    const active = this.database
      .query<{ count: number }, [string]>(
        "SELECT count(*) AS count FROM chat_operation WHERE account_id = ? AND state = 'inflight'",
      )
      .get(accountId);
    if (!active) throw new Error('Chat operation count query failed');
    return active.count > 0;
  }

  close(): void {
    this.database.close();
  }

  /** See {@link readGuardrailOverview}; the ceiling is `conversationAllowance.siteDayMicroUsd`. */
  readGuardrailOverview(now: number): GuardrailOverview {
    return readGuardrailOverview(this.database, now, conversationAllowance.siteDayMicroUsd);
  }

  /** See {@link findOpenInferencePause}. */
  findOpenInferencePause(): InferencePause | null {
    return findOpenInferencePause(this.database);
  }

  /** See {@link openInferencePause}. */
  openInferencePause(
    reason: InferencePause['reason'],
    pausedBy: InferencePause['pausedBy'],
    now: number,
  ): string | null {
    return openInferencePause(this.database, reason, pausedBy, now);
  }

  /** See {@link resumeInferencePause}. */
  resumeInferencePause(now: number): boolean {
    return resumeInferencePause(this.database, now);
  }

  /** See {@link readLoginLock}. */
  readLoginLock(sourceHash: string, now: number): number | null {
    return readLoginLock(this.database, sourceHash, now);
  }

  /** See {@link recordLoginFailure}. */
  recordLoginFailure(sourceHash: string, now: number): { accountLockOpenedAt: number | null } {
    return recordLoginFailure(this.database, sourceHash, now);
  }

  /** See {@link clearSourceLoginFailures}. */
  clearSourceLoginFailures(sourceHash: string): void {
    clearSourceLoginFailures(this.database, sourceHash);
  }

  /** See {@link readLoginLocks}. */
  readLoginLocks(now: number): { accountLockedUntil: number | null; lockedSources: number } {
    return readLoginLocks(this.database, now);
  }

  /**
   * Creates an intake draft counted against its source's and the site's UTC-day caps in the same
   * transaction ({@link countDraft}); a refused cap writes nothing.
   */
  createDraft(
    id: string,
    description: string,
    claimHash: string,
    now: number,
    expiresAt: number,
    sourceHash: string,
  ): DraftCreation {
    try {
      return this.database
        .transaction((): DraftCreation => {
          const siteCount = countDraft(this.database, sourceHash, now);
          this.database
            .query(
              'INSERT INTO intake_draft (id, description, claim_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
            )
            .run(id, description, claimHash, now, expiresAt);
          return { kind: 'created', siteCount };
        })
        .immediate();
    } catch (error) {
      if (error instanceof DraftCapReached) return { kind: error.code };
      throw error;
    }
  }

  /** The `proposal:email` key of {@link countProposal}, under the day salt of `now`. */
  private emailKey(email: string, now: number): string {
    return hashEmailKey(readSourceSalt(this.database, utcDayOf(now)), email);
  }

  findDraft(claimHash: string, now: number): DraftRecord | null {
    const draft = this.database
      .query<DraftRow, [string, number]>(
        'SELECT * FROM intake_draft WHERE claim_hash = ? AND expires_at > ? AND consumed_at IS NULL',
      )
      .get(claimHash, now);
    return draft
      ? {
          id: draft.id,
          description: draft.description,
          brief: draft.brief,
          expiresAt: draft.expires_at,
        }
      : null;
  }

  /**
   * Expires a live or already-expired draft at `now` so its claim stops granting access; the row
   * and its content stay for the normal expired-draft purge. Repeating it keeps the first expiry.
   * A consumed draft belongs to a submission or an account request and is never discarded.
   */
  discardDraft(claimHash: string, now: number): 'discarded' | 'consumed' | 'missing' {
    return this.database.transaction(() => {
      const draft = this.database
        .query<Pick<DraftRow, 'id' | 'expires_at' | 'consumed_at'>, [string]>(
          'SELECT id, expires_at, consumed_at FROM intake_draft WHERE claim_hash = ?',
        )
        .get(claimHash);
      if (!draft) return 'missing';
      if (draft.consumed_at !== null) return 'consumed';
      if (draft.expires_at > now)
        this.database
          .query('UPDATE intake_draft SET expires_at = ? WHERE id = ? AND consumed_at IS NULL')
          .run(now, draft.id);
      return 'discarded';
    })();
  }

  updateBrief(claimHash: string, brief: string, now: number): boolean {
    const write = this.database
      .query(
        'UPDATE intake_draft SET brief = ? WHERE claim_hash = ? AND expires_at > ? AND consumed_at IS NULL',
      )
      .run(brief, claimHash, now);
    return write.changes === 1;
  }

  /** A consumed draft claim can grant a bounded receipt replay without granting draft access. */
  hasReplayClaim(claimHash: string, now: number): boolean {
    return (
      this.database
        .query<{ found: number }, [string, number]>(
          'SELECT 1 AS found FROM submission_replay WHERE claim_hash = ? AND expires_at > ? LIMIT 1',
        )
        .get(claimHash, now) !== null
    );
  }

  replaySubmission(
    claimHash: string,
    idempotencyKey: string,
    bodyHash: string,
    now: number,
  ): SubmitOutcome {
    const replay = this.database
      .query<ReplayRow, [string, string, number]>(
        'SELECT body_hash, receipt FROM submission_replay WHERE claim_hash = ? AND idempotency_key = ? AND expires_at > ?',
      )
      .get(claimHash, idempotencyKey, now);
    if (!replay) return { kind: 'unavailable' };
    return replay.body_hash === bodyHash
      ? { kind: 'replayed', receipt: replay.receipt }
      : { kind: 'conflict' };
  }

  /**
   * Submits the claimed draft as a proposal request. A replay returns its receipt uncounted; a new
   * request is counted against the UTC-day caps ({@link countProposal}) in the same transaction,
   * so a refused cap leaves no submission, replay or retention-subject row.
   */
  submit(
    claimHash: string,
    idempotencyKey: string,
    bodyHash: string,
    email: string,
    brief: string,
    receipt: string,
    now: number,
    sourceHash: string,
  ): SubmitOutcome {
    try {
      return this.submitDraft(
        claimHash,
        idempotencyKey,
        bodyHash,
        email,
        brief,
        receipt,
        now,
        sourceHash,
      );
    } catch (error) {
      if (error instanceof ProposalCapReached) return { kind: 'limited', code: error.code };
      throw error;
    }
  }

  private submitDraft(
    claimHash: string,
    idempotencyKey: string,
    bodyHash: string,
    email: string,
    brief: string,
    receipt: string,
    now: number,
    sourceHash: string,
  ): SubmitOutcome {
    return this.database.transaction((): SubmitOutcome => {
      const replay = this.replaySubmission(claimHash, idempotencyKey, bodyHash, now);
      if (replay.kind !== 'unavailable') return replay;
      const draft = this.findDraft(claimHash, now);
      if (!draft) return { kind: 'unavailable' };
      // Proof: counting after this transaction committed left a proposal_submission row in the per-email cap test.
      const siteCount = countProposal(this.database, sourceHash, this.emailKey(email, now), now);
      const id = crypto.randomUUID();
      this.database
        .query(
          'INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(id, draft.id, email, brief, receipt, 'submitted', now, now);
      // Proof: removing this insert made the standalone manual proposal test find no subject.
      insertRetentionSubject(this.database, 'proposal_submission', id, {
        resolution: 'anchored',
        anchorAt: this.draftCreatedAt(draft.id),
        source: 'draft',
      });
      const consumed = this.database
        .query('UPDATE intake_draft SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL')
        .run(now, draft.id);
      if (consumed.changes !== 1) throw new Error('Draft consumption was not atomic');
      // Proof: removing this handoff left the conversation `open` in the handoff test.
      handOffConversation(this.database, draft.id);
      this.database
        .query(
          'INSERT INTO submission_replay (claim_hash, idempotency_key, body_hash, receipt, expires_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(claimHash, idempotencyKey, bodyHash, receipt, now + 24 * 60 * 60 * 1000);
      return { kind: 'created', receipt, siteCount };
    })();
  }

  createOperatorSession(tokenHash: string, csrfHash: string, expiresAt: number): void {
    this.database
      .query('INSERT INTO operator_session (token_hash, csrf_hash, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash, csrfHash, expiresAt);
  }

  findOperatorSession(tokenHash: string, now: number): SessionRow | null {
    return this.database
      .query<SessionRow, [string, number]>(
        'SELECT csrf_hash, expires_at FROM operator_session WHERE token_hash = ? AND expires_at > ?',
      )
      .get(tokenHash, now);
  }

  deleteOperatorSession(tokenHash: string): void {
    this.database.query('DELETE FROM operator_session WHERE token_hash = ?').run(tokenHash);
  }

  listSubmissions(): SubmissionView[] {
    const rows = this.database
      .query<SubmissionRow, []>(
        'SELECT proposal_submission.id, intake_draft.description, proposal_submission.brief, proposal_submission.email, proposal_submission.status, proposal_submission.created_at, proposal_submission.updated_at FROM proposal_submission JOIN intake_draft ON intake_draft.id = proposal_submission.draft_id ORDER BY proposal_submission.created_at DESC',
      )
      .all();
    return rows.map((row) => ({
      id: row.id,
      description: row.description,
      brief: row.brief,
      email: row.email,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }

  advanceSubmission(id: string, next: ProposalStatus, now: number): boolean {
    const row = this.database
      .query<StatusRow, [string]>('SELECT status FROM proposal_submission WHERE id = ?')
      .get(id);
    if (!row) return false;
    const order: ProposalStatus[] = ['submitted', 'reviewing', 'contacted', 'closed'];
    if (order.indexOf(next) !== order.indexOf(row.status) + 1) return false;
    const write = this.database
      .query(
        'UPDATE proposal_submission SET status = ?, updated_at = ?, updated_by = ? WHERE id = ? AND status = ?',
      )
      .run(next, now, 'local-operator', id, row.status);
    return write.changes === 1;
  }

  createProspect(email: string, now: number): AccountRow {
    const existing = this.database
      .query<AccountRow, [string]>('SELECT id, email FROM prospect_account WHERE email = ?')
      .get(email);
    if (existing) return existing;
    const account = { id: crypto.randomUUID(), email };
    this.database
      .query('INSERT INTO prospect_account (id, email, created_at) VALUES (?, ?, ?)')
      .run(account.id, account.email, now);
    return account;
  }

  createProspectSession(
    tokenHash: string,
    accountId: string,
    csrfHash: string,
    mode: 'demo' | 'oidc',
    expiresAt: number,
  ): void {
    this.database
      .query(
        'INSERT INTO prospect_session (token_hash, account_id, csrf_hash, mode, expires_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(tokenHash, accountId, csrfHash, mode, expiresAt);
  }

  findProspectSession(tokenHash: string, now: number): (SessionRow & AccountRow) | null {
    return this.database
      .query<SessionRow & AccountRow, [string, number]>(
        'SELECT prospect_session.csrf_hash, prospect_session.expires_at, prospect_session.mode, prospect_account.id, prospect_account.email FROM prospect_session JOIN prospect_account ON prospect_account.id = prospect_session.account_id WHERE prospect_session.token_hash = ? AND prospect_session.expires_at > ?',
      )
      .get(tokenHash, now);
  }

  /** Records one OIDC login and, in the same transaction, deletes every login expired at `now`. */
  createOidcLogin(
    stateHash: string,
    verifier: string,
    nonce: string,
    expiresAt: number,
    now: number,
  ): void {
    this.database.transaction(() => {
      // Proof: removing this sweep left two oidc_login rows in the eleven-minute OIDC test.
      this.database.query('DELETE FROM oidc_login WHERE expires_at <= ?').run(now);
      this.database
        .query(
          'INSERT INTO oidc_login (state_hash, verifier, nonce, expires_at) VALUES (?, ?, ?, ?)',
        )
        .run(stateHash, verifier, nonce, expiresAt);
    })();
  }

  consumeOidcLogin(stateHash: string, now: number): { verifier: string; nonce: string } | null {
    return this.database.transaction(() => {
      const login = this.database
        .query<{ verifier: string; nonce: string; expires_at: number }, [string]>(
          'SELECT verifier, nonce, expires_at FROM oidc_login WHERE state_hash = ?',
        )
        .get(stateHash);
      this.database.query('DELETE FROM oidc_login WHERE state_hash = ?').run(stateHash);
      return login && login.expires_at > now
        ? { verifier: login.verifier, nonce: login.nonce }
        : null;
    })();
  }

  createOidcAccount(
    issuer: string,
    subject: string,
    email: string,
    now: number,
  ): AccountRow | null {
    return this.database.transaction(() => {
      const existing = this.database
        .query<AccountRow, [string, string]>(
          'SELECT prospect_account.id, prospect_account.email FROM oidc_identity JOIN prospect_account ON prospect_account.id = oidc_identity.account_id WHERE oidc_identity.issuer = ? AND oidc_identity.subject = ?',
        )
        .get(issuer, subject);
      if (existing) return existing;
      const emailOwner = this.database
        .query<AccountRow, [string]>('SELECT id, email FROM prospect_account WHERE email = ?')
        .get(email);
      if (emailOwner) return null;
      const account = { id: crypto.randomUUID(), email };
      this.database
        .query('INSERT INTO prospect_account (id, email, created_at) VALUES (?, ?, ?)')
        .run(account.id, email, now);
      this.database
        .query('INSERT INTO oidc_identity (issuer, subject, account_id) VALUES (?, ?, ?)')
        .run(issuer, subject, account.id);
      return account;
    })();
  }

  /**
   * Reserves one account provider call against the account, brief and shared site-day ceilings
   * and the inference pause ({@link tripInferencePause}), in one transaction.
   */
  reserveProviderCall(
    accountId: string,
    requestId: string,
    reservedMicroUsd: number,
    now: number,
  ): ProviderReservation {
    return this.database.transaction((): ProviderReservation => {
      const utcDay = new Date(now).toISOString().slice(0, 10);
      const activeAccount = this.database
        .query<{ count: number }, [string]>(
          'SELECT count(*) AS count FROM provider_call WHERE account_id = ? AND settled_micro_usd IS NULL',
        )
        .get(accountId);
      const activeSite = this.database
        .query<{ count: number }, []>(
          // Proof: counting every non-completed conversation operation refused the account reservation in the stopped-operations test.
          "SELECT (SELECT count(*) FROM provider_call WHERE settled_micro_usd IS NULL) + (SELECT count(*) FROM conversation_operation WHERE state = 'inflight' AND reserved_micro_usd IS NOT NULL) AS count",
        )
        .get();
      // Proof: summing by account instead of request made the second-request allowance test fail.
      const brief = this.database
        .query<{ total: number }, [string]>(
          'SELECT COALESCE(SUM(COALESCE(settled_micro_usd, reserved_micro_usd)), 0) AS total FROM provider_call WHERE request_id = ?',
        )
        .get(requestId);
      const accountDay = this.database
        .query<{ total: number }, [string, string]>(
          'SELECT COALESCE(SUM(COALESCE(settled_micro_usd, reserved_micro_usd)), 0) AS total FROM provider_call WHERE account_id = ? AND utc_day = ?',
        )
        .get(accountId, utcDay);
      // The site-day ceiling is shared with anonymous conversation reservations.
      const siteDay = this.database
        .query<{ total: number }, [string]>(
          'SELECT (SELECT COALESCE(SUM(COALESCE(settled_micro_usd, reserved_micro_usd)), 0) FROM provider_call WHERE utc_day = ?1) + (SELECT COALESCE(SUM(COALESCE(settled_micro_usd, reserved_micro_usd)), 0) FROM conversation_operation WHERE utc_day = ?1) AS total',
        )
        .get(utcDay);
      if (!activeAccount || !activeSite || !brief || !accountDay || !siteDay)
        throw new Error('Provider reservation query failed');
      const pause = tripInferencePause(this.database, siteDay.total, reservedMicroUsd, now);
      if (pause) return { kind: 'paused', ...pause };
      if (
        activeAccount.count >= 1 ||
        activeSite.count >= conversationAllowance.siteUnsettledCalls ||
        brief.total + reservedMicroUsd > 500_000 ||
        accountDay.total + reservedMicroUsd > 1_000_000 ||
        siteDay.total + reservedMicroUsd > conversationAllowance.siteDayMicroUsd
      )
        return { kind: 'refused' };
      const id = crypto.randomUUID();
      this.database
        .query(
          'INSERT INTO provider_call (id, account_id, request_id, utc_day, reserved_micro_usd, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(id, accountId, requestId, utcDay, reservedMicroUsd, now);
      return { kind: 'reserved', id };
    })();
  }

  settleProviderCall(id: string, actualMicroUsd: number): boolean {
    const row = this.database
      .query<{ reserved_micro_usd: number }, [string]>(
        'SELECT reserved_micro_usd FROM provider_call WHERE id = ? AND settled_micro_usd IS NULL',
      )
      .get(id);
    if (!row || actualMicroUsd > row.reserved_micro_usd) return false;
    const write = this.database
      .query(
        'UPDATE provider_call SET settled_micro_usd = ? WHERE id = ? AND settled_micro_usd IS NULL',
      )
      .run(actualMicroUsd, id);
    return write.changes === 1;
  }

  /** Attaches a fresh browser claim to a new active request, preserving prior submitted requests. */
  attachDraft(accountId: string, claimHash: string, now: number): boolean {
    return this.database.transaction(() => {
      const draft = this.findDraft(claimHash, now);
      if (!draft) return false;
      const linked = this.database
        .query<{ account_id: string }, [string]>(
          'SELECT account_id FROM software_request WHERE draft_id = ?',
        )
        .get(draft.id);
      if (linked) return linked.account_id === accountId;
      this.database
        .query(
          'UPDATE software_request SET inactive_at = ? WHERE account_id = ? AND submitted_at IS NULL AND inactive_at IS NULL',
        )
        .run(now, accountId);
      const requestId = crypto.randomUUID();
      this.database
        .query(
          'INSERT INTO software_request (id, account_id, draft_id, description, brief, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(requestId, accountId, draft.id, draft.description, draft.brief, now);
      insertRetentionSubject(this.database, 'software_request', requestId, {
        resolution: 'anchored',
        anchorAt: this.draftCreatedAt(draft.id),
        source: 'draft',
      });
      const consumed = this.database
        .query('UPDATE intake_draft SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL')
        .run(now, draft.id);
      if (consumed.changes !== 1) throw new Error('Draft attachment was not atomic');
      return true;
    })();
  }

  /** A blank request has no deadline until its first nonempty content write. */
  ensureBlankRequest(accountId: string, now: number): void {
    this.database.transaction(() => {
      if (this.findAccountRequest(accountId)) return;
      const requestId = crypto.randomUUID();
      this.database
        .query(
          'INSERT INTO software_request (id, account_id, description, brief, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(requestId, accountId, '', '', now);
      insertRetentionSubject(this.database, 'software_request', requestId, {
        resolution: 'pending_content',
      });
    })();
  }

  private draftCreatedAt(draftId: string): number {
    const draft = this.database
      .query<{ created_at: number }, [string]>('SELECT created_at FROM intake_draft WHERE id = ?')
      .get(draftId);
    if (!draft) throw new Error('Intake draft disappeared during its transaction');
    return draft.created_at;
  }

  findAccountRequest(accountId: string): {
    id: string;
    description: string;
    brief: string;
    draft_id: string | null;
    submitted_at: number | null;
  } | null {
    return this.database
      .query<
        {
          id: string;
          description: string;
          brief: string;
          draft_id: string | null;
          submitted_at: number | null;
        },
        [string]
      >(
        'SELECT id, description, brief, draft_id, submitted_at FROM software_request WHERE account_id = ? AND submitted_at IS NULL AND inactive_at IS NULL',
      )
      .get(accountId);
  }

  /** A nonblank brief is first content for a blank request and anchors its deadline at `now`. */
  updateAccountBrief(accountId: string, brief: string, now: number): boolean {
    return this.database.transaction(() => {
      const active = this.findAccountRequest(accountId);
      if (!active) return false;
      anchorRequestContent(this.database, active.id, brief, now);
      const write = this.database
        .query(
          'UPDATE software_request SET brief = ? WHERE id = ? AND submitted_at IS NULL AND inactive_at IS NULL',
        )
        .run(brief, active.id);
      if (write.changes !== 1) throw new Error('Active request brief update was not atomic');
      return true;
    })();
  }

  /** As {@link submit} for the signed-in request; it is counted the same way. */
  submitAccount(
    accountId: string,
    idempotencyKey: string,
    bodyHash: string,
    email: string,
    brief: string,
    receipt: string,
    now: number,
    sourceHash: string,
  ): SubmitOutcome {
    try {
      return this.submitRequest(
        accountId,
        idempotencyKey,
        bodyHash,
        email,
        brief,
        receipt,
        now,
        sourceHash,
      );
    } catch (error) {
      if (error instanceof ProposalCapReached) return { kind: 'limited', code: error.code };
      throw error;
    }
  }

  private submitRequest(
    accountId: string,
    idempotencyKey: string,
    bodyHash: string,
    email: string,
    brief: string,
    receipt: string,
    now: number,
    sourceHash: string,
  ): SubmitOutcome {
    return this.database.transaction((): SubmitOutcome => {
      // Proof: selecting the active request before replay submitted request B while retrying A's lost response.
      const replay = this.database
        .query<ReplayRow, [string, string, number]>(
          'SELECT submission_replay.body_hash, submission_replay.receipt FROM submission_replay JOIN software_request ON software_request.id = submission_replay.request_id WHERE software_request.account_id = ? AND submission_replay.idempotency_key = ? AND submission_replay.expires_at > ? ORDER BY software_request.created_at DESC LIMIT 1',
        )
        .get(accountId, idempotencyKey, now);
      if (replay)
        return replay.body_hash === bodyHash
          ? { kind: 'replayed', receipt: replay.receipt }
          : { kind: 'conflict' };
      const active = this.findAccountRequest(accountId);
      if (!active?.draft_id) return { kind: 'unavailable' };
      const siteCount = countProposal(this.database, sourceHash, this.emailKey(email, now), now);
      this.database
        .query(
          'INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(crypto.randomUUID(), active.draft_id, email, brief, receipt, 'submitted', now, now);
      const consumed = this.database
        .query(
          'UPDATE software_request SET brief = ?, submitted_at = ? WHERE id = ? AND submitted_at IS NULL AND inactive_at IS NULL',
        )
        .run(brief, now, active.id);
      if (consumed.changes !== 1) throw new Error('Account submission was not atomic');
      const authorityHash = createHash('sha256').update(`request:${active.id}`).digest('hex');
      this.database
        .query(
          'INSERT INTO submission_replay (claim_hash, idempotency_key, body_hash, receipt, expires_at, request_id) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          authorityHash,
          idempotencyKey,
          bodyHash,
          receipt,
          now + 24 * 60 * 60 * 1000,
          active.id,
        );
      return { kind: 'created', receipt, siteCount };
    })();
  }

  /** Proof: querying concepts by account instead made the returning-user test disclose the first request's concept. */
  findConcept(requestId: string): string | null {
    const row = this.database
      .query<{ body: string }, [string]>(
        'SELECT body FROM request_concept_preview WHERE request_id = ?',
      )
      .get(requestId);
    return row?.body ?? null;
  }

  reviseConcept(requestId: string, body: string): boolean {
    const write = this.database
      .query(
        'UPDATE request_concept_preview SET body = ?, revisions = revisions + 1 WHERE request_id = ? AND revisions < 1',
      )
      .run(body, requestId);
    return write.changes === 1;
  }

  saveConcept(requestId: string, body: string, now: number): void {
    this.database.transaction(() => {
      anchorRequestContent(this.database, requestId, body, now);
      this.database
        .query(
          'INSERT OR IGNORE INTO request_concept_preview (request_id, body, created_at) VALUES (?, ?, ?)',
        )
        .run(requestId, body, now);
    })();
  }

  /** Proof: querying turns by account instead made the returning-user test revive the first request's chat. */
  listTurns(requestId: string): ChatTurn[] {
    return this.database
      .query<TurnRow, [string]>(
        'SELECT role, content, created_at FROM chat_turn WHERE request_id = ? ORDER BY created_at, rowid',
      )
      .all(requestId)
      .map((turn) => ({
        role: turn.role,
        content: turn.content,
        createdAt: new Date(turn.created_at).toISOString(),
      }));
  }

  addTurn(
    accountId: string,
    requestId: string,
    role: 'user' | 'assistant',
    content: string,
    now: number,
  ): void {
    this.database.transaction(() => {
      anchorRequestContent(this.database, requestId, content, now);
      this.database
        .query(
          'INSERT INTO chat_turn (id, account_id, request_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(crypto.randomUUID(), accountId, requestId, role, content, now);
    })();
  }
}
