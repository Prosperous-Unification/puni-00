import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ProposalStatus, SubmissionView } from '@website/contracts';
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
  countDeclinedCompletions,
  countDraft,
  countProposal,
  DraftCapReached,
  type DraftCapRefusal,
  findOpenInferencePause,
  type GuardrailOverview,
  hashEmailKey,
  type InferencePause,
  markAlertDelivery,
  openInferencePause,
  ProposalCapReached,
  type ProposalCapRefusal,
  readGuardrailOverview,
  readLoginLocks,
  readSiteSpend,
  recordGuardrailAlert,
  reserveLoginAttempt,
  resumeInferencePause,
  settleLoginSuccess,
  utcDayOf,
} from './guardrail-store';
import { websiteMigrations } from './migration-catalogue';
import { backfillRetentionSubjects, insertRetentionSubject } from './request-retention';
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

export interface DraftRecord {
  id: string;
  description: string;
  brief: string;
  expiresAt: number;
}

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
 * ({@link backfillRetentionSubjects}). The account tables (`prospect_*`, `software_request`,
 * `chat_*`, `provider_call`, `request_concept_preview`) are legacy since prospect sign-in was
 * retired (ADR 0039): no route writes them, retention still covers their rows, and the site-day
 * spend still sums `provider_call`.
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

  close(): void {
    this.database.close();
  }

  /** See {@link readGuardrailOverview}; the ceiling is `conversationAllowance.siteDayMicroUsd`. */
  readGuardrailOverview(now: number): GuardrailOverview {
    return readGuardrailOverview(this.database, now, conversationAllowance.siteDayMicroUsd);
  }

  /** See {@link recordGuardrailAlert}. */
  recordGuardrailAlert(
    kind: string,
    dedupeKey: string,
    detail: string,
    now: number,
  ): { kind: 'inserted'; id: string } | { kind: 'duplicate' } {
    return recordGuardrailAlert(this.database, kind, dedupeKey, detail, now);
  }

  /** See {@link markAlertDelivery}. */
  markAlertDelivery(id: string, delivery: 'sent' | 'failed', now: number): void {
    markAlertDelivery(this.database, id, delivery, now);
  }

  /** See {@link countDeclinedCompletions}; the UTC day of `now`. */
  countDeclinedCompletions(now: number): number {
    return countDeclinedCompletions(this.database, utcDayOf(now));
  }

  /** See {@link readSiteSpend}; the UTC day of `now`. */
  readSiteSpend(now: number): number {
    return readSiteSpend(this.database, utcDayOf(now));
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

  /** See {@link reserveLoginAttempt}. */
  reserveLoginAttempt(
    sourceHash: string,
    now: number,
  ):
    | { kind: 'locked'; lockedUntil: number }
    | { kind: 'reserved'; accountLockOpenedAt: number | null } {
    return reserveLoginAttempt(this.database, sourceHash, now);
  }

  /** See {@link settleLoginSuccess}. */
  settleLoginSuccess(sourceHash: string): void {
    settleLoginSuccess(this.database, sourceHash);
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
   * A consumed draft belongs to a submission or a legacy account request and is never discarded.
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

  private draftCreatedAt(draftId: string): number {
    const draft = this.database
      .query<{ created_at: number }, [string]>('SELECT created_at FROM intake_draft WHERE id = ?')
      .get(draftId);
    if (!draft) throw new Error('Intake draft disappeared during its transaction');
    return draft.created_at;
  }
}
