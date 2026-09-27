import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ChatTurn, ProposalStatus, SubmissionView } from '@website/contracts';
import { Database } from 'bun:sqlite';

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

export interface DraftRecord {
  id: string;
  description: string;
  brief: string;
  expiresAt: number;
}

export type SubmitOutcome =
  | { kind: 'created' | 'replayed'; receipt: string }
  | { kind: 'conflict' }
  | { kind: 'unavailable' };

/** Owns the independent website SQLite database and refuses an edited applied migration. */
export class WebsiteStore {
  private readonly database: Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new Database(path, { create: true });
    this.database.run('PRAGMA foreign_keys = ON');
    this.database.run(
      'CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)',
    );
    const migrations = [
      { name: '001_initial', directory: import.meta.dir },
      { name: '002_m2', directory: join(import.meta.dir, 'migrations/002_m2') },
      {
        name: '003_account_submission',
        directory: join(import.meta.dir, 'migrations/003_account_submission'),
      },
      {
        name: '004_request_scope',
        directory: join(import.meta.dir, 'migrations/004_request_scope'),
      },
    ];
    for (const migration of migrations) {
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
  }

  close(): void {
    this.database.close();
  }

  createDraft(
    id: string,
    description: string,
    claimHash: string,
    now: number,
    expiresAt: number,
  ): void {
    this.database
      .query(
        'INSERT INTO intake_draft (id, description, claim_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, description, claimHash, now, expiresAt);
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

  submit(
    claimHash: string,
    idempotencyKey: string,
    bodyHash: string,
    email: string,
    brief: string,
    receipt: string,
    now: number,
  ): SubmitOutcome {
    return this.database.transaction((): SubmitOutcome => {
      const replay = this.replaySubmission(claimHash, idempotencyKey, bodyHash, now);
      if (replay.kind !== 'unavailable') return replay;
      const draft = this.findDraft(claimHash, now);
      if (!draft) return { kind: 'unavailable' };
      const id = crypto.randomUUID();
      this.database
        .query(
          'INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(id, draft.id, email, brief, receipt, 'submitted', now, now);
      const consumed = this.database
        .query('UPDATE intake_draft SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL')
        .run(now, draft.id);
      if (consumed.changes !== 1) throw new Error('Draft consumption was not atomic');
      this.database
        .query(
          'INSERT INTO submission_replay (claim_hash, idempotency_key, body_hash, receipt, expires_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(claimHash, idempotencyKey, bodyHash, receipt, now + 24 * 60 * 60 * 1000);
      return { kind: 'created', receipt };
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

  createOidcLogin(stateHash: string, verifier: string, nonce: string, expiresAt: number): void {
    this.database
      .query('INSERT INTO oidc_login (state_hash, verifier, nonce, expires_at) VALUES (?, ?, ?, ?)')
      .run(stateHash, verifier, nonce, expiresAt);
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

  reserveProviderCall(
    accountId: string,
    requestId: string,
    reservedMicroUsd: number,
    now: number,
  ): string | null {
    return this.database.transaction(() => {
      const utcDay = new Date(now).toISOString().slice(0, 10);
      const activeAccount = this.database
        .query<{ count: number }, [string]>(
          'SELECT count(*) AS count FROM provider_call WHERE account_id = ? AND settled_micro_usd IS NULL',
        )
        .get(accountId);
      const activeSite = this.database
        .query<{ count: number }, []>(
          'SELECT count(*) AS count FROM provider_call WHERE settled_micro_usd IS NULL',
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
      const siteDay = this.database
        .query<{ total: number }, [string]>(
          'SELECT COALESCE(SUM(COALESCE(settled_micro_usd, reserved_micro_usd)), 0) AS total FROM provider_call WHERE utc_day = ?',
        )
        .get(utcDay);
      if (!activeAccount || !activeSite || !brief || !accountDay || !siteDay)
        throw new Error('Provider reservation query failed');
      if (
        activeAccount.count >= 1 ||
        activeSite.count >= 4 ||
        brief.total + reservedMicroUsd > 500_000 ||
        accountDay.total + reservedMicroUsd > 1_000_000 ||
        siteDay.total + reservedMicroUsd > 10_000_000
      )
        return null;
      const id = crypto.randomUUID();
      this.database
        .query(
          'INSERT INTO provider_call (id, account_id, request_id, utc_day, reserved_micro_usd, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(id, accountId, requestId, utcDay, reservedMicroUsd, now);
      return id;
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
      this.database
        .query(
          'INSERT INTO software_request (id, account_id, draft_id, description, brief, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(crypto.randomUUID(), accountId, draft.id, draft.description, draft.brief, now);
      const consumed = this.database
        .query('UPDATE intake_draft SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL')
        .run(now, draft.id);
      if (consumed.changes !== 1) throw new Error('Draft attachment was not atomic');
      return true;
    })();
  }

  ensureBlankRequest(accountId: string, now: number): void {
    if (this.findAccountRequest(accountId)) return;
    this.database
      .query(
        'INSERT INTO software_request (id, account_id, description, brief, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(crypto.randomUUID(), accountId, '', '', now);
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

  updateAccountBrief(accountId: string, brief: string): boolean {
    const write = this.database
      .query(
        'UPDATE software_request SET brief = ? WHERE account_id = ? AND submitted_at IS NULL AND inactive_at IS NULL',
      )
      .run(brief, accountId);
    return write.changes === 1;
  }

  submitAccount(
    accountId: string,
    idempotencyKey: string,
    bodyHash: string,
    email: string,
    brief: string,
    receipt: string,
    now: number,
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
      return { kind: 'created', receipt };
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
    this.database
      .query(
        'INSERT OR IGNORE INTO request_concept_preview (request_id, body, created_at) VALUES (?, ?, ?)',
      )
      .run(requestId, body, now);
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
    this.database
      .query(
        'INSERT INTO chat_turn (id, account_id, request_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(crypto.randomUUID(), accountId, requestId, role, content, now);
  }
}
