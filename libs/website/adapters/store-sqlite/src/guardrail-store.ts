import { createHash } from 'node:crypto';

import type { Database } from 'bun:sqlite';

/**
 * Guardrail figures beside `conversationAllowance`; the rationale for each lives in the
 * `website-abuse-guardrails` design. Daily caps count per UTC day; login windows and locks are in
 * milliseconds; the pause and the half-spend alert are micro-USD of the site-day ceiling.
 */
export const guardrailAllowance = {
  draftSourceDay: 20,
  draftSiteDay: 2_000,
  proposalSourceDay: 5,
  proposalEmailDay: 3,
  proposalSiteDay: 200,
  sourceLoginFailures: 5,
  sourceLoginWindowMilliseconds: 15 * 60_000,
  sourceLockMilliseconds: 15 * 60_000,
  accountLoginFailures: 20,
  accountLoginWindowMilliseconds: 60 * 60_000,
  accountLockMilliseconds: 60 * 60_000,
  /** 80% of `conversationAllowance.siteDayMicroUsd`; a literal so the modules stay acyclic. */
  pauseMicroUsd: 8_000_000,
  /** 50% of `conversationAllowance.siteDayMicroUsd`. */
  halfSpendMicroUsd: 5_000_000,
} as const;

/** A UTC-day counter in `admission_count`; `*` is the site-wide key. */
export type AdmissionScope =
  'draft:source' | 'draft:site' | 'proposal:source' | 'proposal:email' | 'proposal:site';

/** Why an intake draft was not created; both refusals write nothing. */
export type DraftCapRefusal = 'draft_source_limit' | 'draft_site_limit';

/** Why a proposal request was not created; every refusal writes nothing. */
export type ProposalCapRefusal =
  'proposal_source_limit' | 'proposal_email_limit' | 'proposal_site_limit';

/**
 * Thrown inside a counting transaction so the refused increment and everything written before
 * it roll back together; caught only by the store method that opened the transaction.
 */
export class DraftCapReached extends Error {
  constructor(readonly code: DraftCapRefusal) {
    super(code);
  }
}

/** As {@link DraftCapReached}, for proposal requests. */
export class ProposalCapReached extends Error {
  constructor(readonly code: ProposalCapRefusal) {
    super(code);
  }
}

export function utcDayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Adds one to a UTC-day counter unless it already holds `cap`, as one conditional upsert, and
 * returns the new count, or null when refused. Call inside the transaction that creates the
 * counted row, so a refusal (thrown as {@link DraftCapReached} or {@link ProposalCapReached}) rolls that row back and two
 * processes on one database can never both take the last slot.
 */
export function countAdmission(
  database: Database,
  scope: AdmissionScope,
  keyHash: string,
  utcDay: string,
  cap: number,
): number | null {
  // Proof: dropping `WHERE count < ?4` inserted the 21st draft in the twenty-first-draft store test.
  const row = database
    .query<{ count: number }, [string, string, string, number]>(
      'INSERT INTO admission_count (scope, key_hash, utc_day, count) VALUES (?1, ?2, ?3, 1) ON CONFLICT(scope, key_hash, utc_day) DO UPDATE SET count = count + 1 WHERE count < ?4 RETURNING count',
    )
    .get(scope, keyHash, utcDay, cap);
  return row?.count ?? null;
}

/** Deletes counters older than `previousDay`; runs with the day-salt sweep. */
export function sweepAdmissionCounts(database: Database, previousDay: string): void {
  database.query('DELETE FROM admission_count WHERE utc_day < ?').run(previousDay);
}

/**
 * The `proposal:email` key: SHA-256 of the day salt and the normalized email, so the counter is
 * pseudonymous and cannot be linked to the address once the day's salt is deleted. Normalizing
 * lower-cases the address and drops a `+tag` from the local part, so tagged variants share one
 * cap; dots stay as written, because only some providers (Gmail) ignore them.
 */
export function hashEmailKey(daySalt: Uint8Array, email: string): string {
  const lowered = email.toLowerCase();
  const at = lowered.lastIndexOf('@');
  const local = lowered.slice(0, at);
  const plus = local.indexOf('+');
  // Proof: hashing the lower-cased address without dropping the tag admitted a fourth tagged variant.
  const normalized = `${plus < 0 ? local : local.slice(0, plus)}${lowered.slice(at)}`;
  return createHash('sha256').update(daySalt).update(normalized).digest('hex');
}

/**
 * Counts one proposal request against the source, email and site caps of its UTC day and returns
 * the site count. Call inside the submitting transaction.
 *
 * @throws ProposalCapReached with the first refused cap's code.
 */
export function countProposal(
  database: Database,
  sourceHash: string,
  emailKey: string,
  now: number,
): number {
  const utcDay = utcDayOf(now);
  if (
    countAdmission(
      database,
      'proposal:source',
      sourceHash,
      utcDay,
      guardrailAllowance.proposalSourceDay,
    ) === null
  )
    throw new ProposalCapReached('proposal_source_limit');
  if (
    countAdmission(
      database,
      'proposal:email',
      emailKey,
      utcDay,
      guardrailAllowance.proposalEmailDay,
    ) === null
  )
    throw new ProposalCapReached('proposal_email_limit');
  const site = countAdmission(
    database,
    'proposal:site',
    '*',
    utcDay,
    guardrailAllowance.proposalSiteDay,
  );
  if (site === null) throw new ProposalCapReached('proposal_site_limit');
  return site;
}

/**
 * Counts one intake draft against the source and site caps of its UTC day and returns the site
 * count. Call inside the creating transaction.
 *
 * @throws DraftCapReached with the first refused cap's code.
 */
export function countDraft(database: Database, sourceHash: string, now: number): number {
  const utcDay = utcDayOf(now);
  if (
    countAdmission(
      database,
      'draft:source',
      sourceHash,
      utcDay,
      guardrailAllowance.draftSourceDay,
    ) === null
  )
    throw new DraftCapReached('draft_source_limit');
  const site = countAdmission(database, 'draft:site', '*', utcDay, guardrailAllowance.draftSiteDay);
  if (site === null) throw new DraftCapReached('draft_site_limit');
  return site;
}

/** The single operator credential's account key in `login_failure`. */
const operatorAccountKey = 'operator';

interface LoginFailureRow {
  failures: number;
  window_opened_at: number;
  locked_until: number | null;
}

/**
 * The end of the latest lock that applies to `sourceHash` or to the operator account at `now`,
 * or null when neither is locked. Read before any password verification.
 */
export function readLoginLock(database: Database, sourceHash: string, now: number): number | null {
  const row = database
    .query<{ until: number | null }, [string, string, number]>(
      "SELECT MAX(locked_until) AS until FROM login_failure WHERE ((scope = 'source' AND key_hash = ?1) OR (scope = 'account' AND key_hash = ?2)) AND locked_until > ?3",
    )
    .get(sourceHash, operatorAccountKey, now);
  return row?.until ?? null;
}

function recordScopeFailure(
  database: Database,
  scope: 'source' | 'account',
  keyHash: string,
  now: number,
  limits: { failures: number; windowMilliseconds: number; lockMilliseconds: number },
): { lockOpened: boolean; windowOpenedAt: number } {
  const current = database
    .query<LoginFailureRow, [string, string]>(
      'SELECT failures, window_opened_at, locked_until FROM login_failure WHERE scope = ? AND key_hash = ?',
    )
    .get(scope, keyHash);
  // Proof: never resetting the window locked the source in the sixteen-minute window-reset test.
  const isFresh = !current || now - current.window_opened_at >= limits.windowMilliseconds;
  const failures = isFresh ? 1 : current.failures + 1;
  const windowOpenedAt = isFresh ? now : current.window_opened_at;
  const wasLocked = !isFresh && current.locked_until !== null;
  const lockedUntil =
    failures >= limits.failures
      ? wasLocked
        ? current.locked_until
        : now + limits.lockMilliseconds
      : null;
  database
    .query(
      'INSERT INTO login_failure (scope, key_hash, failures, window_opened_at, locked_until) VALUES (?, ?, ?, ?, ?) ON CONFLICT(scope, key_hash) DO UPDATE SET failures = excluded.failures, window_opened_at = excluded.window_opened_at, locked_until = excluded.locked_until',
    )
    .run(scope, keyHash, failures, windowOpenedAt, lockedUntil);
  return { lockOpened: lockedUntil !== null && !wasLocked, windowOpenedAt };
}

/**
 * Admits one operator password attempt in a single immediate transaction: the lock is read and,
 * when neither the caller's source nor the account is locked, the attempt is counted as a failure
 * in both scopes before any password verification, so a concurrent burst cannot reach the
 * verifier more often than the caps allow (five per source per 15 minutes, twenty per account per
 * hour). A success then calls {@link settleLoginSuccess}. Returns the latest lock end when
 * refused, or the account window's start when this attempt opened the account lock.
 */
export function reserveLoginAttempt(
  database: Database,
  sourceHash: string,
  now: number,
):
  | { kind: 'locked'; lockedUntil: number }
  | { kind: 'reserved'; accountLockOpenedAt: number | null } {
  return database
    .transaction(() => {
      const lockedUntil = readLoginLock(database, sourceHash, now);
      if (lockedUntil !== null) return { kind: 'locked' as const, lockedUntil };
      recordScopeFailure(database, 'source', sourceHash, now, {
        failures: guardrailAllowance.sourceLoginFailures,
        windowMilliseconds: guardrailAllowance.sourceLoginWindowMilliseconds,
        lockMilliseconds: guardrailAllowance.sourceLockMilliseconds,
      });
      // Proof: skipping the account scope let the 21st guess from a fresh source in the twenty-source test answer 201.
      const account = recordScopeFailure(database, 'account', operatorAccountKey, now, {
        failures: guardrailAllowance.accountLoginFailures,
        windowMilliseconds: guardrailAllowance.accountLoginWindowMilliseconds,
        lockMilliseconds: guardrailAllowance.accountLockMilliseconds,
      });
      return {
        kind: 'reserved' as const,
        accountLockOpenedAt: account.lockOpened ? account.windowOpenedAt : null,
      };
    })
    .immediate();
}

/**
 * A verified login: the source's failures are forgotten and the attempt reserved on the account
 * is refunded; a lock the refund brings back under the cap is lifted. An account lock that other
 * failures still justify stays.
 */
export function settleLoginSuccess(database: Database, sourceHash: string): void {
  database.transaction(() => {
    database
      .query("DELETE FROM login_failure WHERE scope = 'source' AND key_hash = ?")
      .run(sourceHash);
    database
      .query(
        "UPDATE login_failure SET failures = failures - 1, locked_until = CASE WHEN failures - 1 < ? THEN NULL ELSE locked_until END WHERE scope = 'account' AND key_hash = ? AND failures > 1",
      )
      .run(guardrailAllowance.accountLoginFailures, operatorAccountKey);
    database
      .query("DELETE FROM login_failure WHERE scope = 'account' AND key_hash = ? AND failures = 1")
      .run(operatorAccountKey);
  })();
}

/** The operator account lock's end and the number of locked sources at `now`. */
export function readLoginLocks(
  database: Database,
  now: number,
): { accountLockedUntil: number | null; lockedSources: number } {
  const account = database
    .query<{ locked_until: number | null }, [string, number]>(
      "SELECT locked_until FROM login_failure WHERE scope = 'account' AND key_hash = ? AND locked_until > ?",
    )
    .get(operatorAccountKey, now);
  const sources = database
    .query<{ count: number }, [number]>(
      "SELECT count(*) AS count FROM login_failure WHERE scope = 'source' AND locked_until > ?",
    )
    .get(now);
  if (!sources) throw new Error('Source lock count query returned no row');
  return { accountLockedUntil: account?.locked_until ?? null, lockedSources: sources.count };
}

export interface InferencePause {
  id: string;
  pausedAt: number;
  reason: 'site_spend' | 'operator';
  pausedBy: 'system' | 'operator';
}

/** The open inference pause, or null; at most one exists (the `inference_pause_open` index). */
export function findOpenInferencePause(database: Database): InferencePause | null {
  const row = database
    .query<
      {
        id: string;
        paused_at: number;
        reason: InferencePause['reason'];
        paused_by: InferencePause['pausedBy'];
      },
      []
    >('SELECT id, paused_at, reason, paused_by FROM inference_pause WHERE resumed_at IS NULL')
    .get();
  return row
    ? { id: row.id, pausedAt: row.paused_at, reason: row.reason, pausedBy: row.paused_by }
    : null;
}

/**
 * Opens a pause unless one is already open, and returns its id, or null when one was open.
 * A pause never clears by itself: not at UTC midnight and not on restart.
 */
export function openInferencePause(
  database: Database,
  reason: InferencePause['reason'],
  pausedBy: InferencePause['pausedBy'],
  now: number,
): string | null {
  return database.transaction(() => {
    if (findOpenInferencePause(database)) return null;
    const id = crypto.randomUUID();
    database
      .query('INSERT INTO inference_pause (id, paused_at, reason, paused_by) VALUES (?, ?, ?, ?)')
      .run(id, now, reason, pausedBy);
    return id;
  })();
}

/** Closes the open pause as the operator; false, writing nothing, when none is open. */
export function resumeInferencePause(database: Database, now: number): boolean {
  return (
    database
      .query(
        "UPDATE inference_pause SET resumed_at = ?, resumed_by = 'operator' WHERE resumed_at IS NULL",
      )
      .run(now).changes === 1
  );
}

/**
 * The pause rule inside a paid admission transaction, after the site's UTC-day spend is summed:
 * an open pause refuses (`openedPauseId` null); a reservation that brings the spend to
 * {@link guardrailAllowance.pauseMicroUsd} or above opens a `site_spend` pause and refuses,
 * unless a `site_spend` pause was already opened this UTC day. So after an operator resumes, the
 * day continues to the hard ceiling instead of re-pausing on the next reservation, and the next
 * day's spend trips it again; the pause itself survives midnight and restarts.
 * Returns null when the reservation may proceed.
 */
export function tripInferencePause(
  database: Database,
  siteSpendMicroUsd: number,
  reservedMicroUsd: number,
  now: number,
): { openedPauseId: string | null } | null {
  if (findOpenInferencePause(database)) return { openedPauseId: null };
  // Proof: comparing against the full ceiling instead of the 80% mark admitted the operation in the $7.99 + $0.02 trip test.
  if (siteSpendMicroUsd + reservedMicroUsd < guardrailAllowance.pauseMicroUsd) return null;
  const dayStart = Date.parse(`${utcDayOf(now)}T00:00:00.000Z`);
  const trippedToday = database
    .query<{ found: number }, [number]>(
      "SELECT 1 AS found FROM inference_pause WHERE reason = 'site_spend' AND paused_at >= ? LIMIT 1",
    )
    .get(dayStart);
  // Proof: ignoring today's resumed pause re-paused the first admission after the resume in the trip test.
  if (trippedToday) return null;
  return { openedPauseId: openInferencePause(database, 'site_spend', 'system', now) };
}

/** One `guardrail_alert` row as the operator page shows it. */
export interface GuardrailAlert {
  kind: string;
  detail: string;
  createdAt: number;
  delivery: 'recorded' | 'sent' | 'failed';
  deliveredAt: number | null;
}

/** `GET /operator/guardrails`: counts and states only, never an address, hash or email. */
export interface GuardrailOverview {
  pause: InferencePause | null;
  siteSpendMicroUsd: number;
  siteCeilingMicroUsd: number;
  draftsToday: number;
  proposalsToday: number;
  accountLockedUntil: number | null;
  lockedSources: number;
  /** See {@link readCeilingSettled}: how far today's recorded spend may over-count. */
  ceilingSettledToday: CeilingSettled;
  alerts: GuardrailAlert[];
}

/** Operations settled at their full reservation, and the micro-USD that settlement recorded. */
export interface CeilingSettled {
  count: number;
  microUsd: number;
}

/**
 * The `unknown` conversation operations of one UTC day: usage never arrived (stop, disconnect,
 * timeout, stream error, restart), so each was settled at its full reservation. Recorded spend
 * may over-count by up to this amount and never under-counts.
 */
export function readCeilingSettled(database: Database, utcDay: string): CeilingSettled {
  const row = database
    .query<{ count: number; micro_usd: number }, [string]>(
      "SELECT count(*) AS count, COALESCE(SUM(settled_micro_usd), 0) AS micro_usd FROM conversation_operation WHERE state = 'unknown' AND utc_day = ?",
    )
    .get(utcDay);
  if (!row) throw new Error('Ceiling-settled count query returned no row');
  return { count: row.count, microUsd: row.micro_usd };
}

/** Settled and reserved spend of one UTC day across conversations and account calls. */
export function readSiteSpend(database: Database, utcDay: string): number {
  const spent = 'COALESCE(SUM(COALESCE(settled_micro_usd, reserved_micro_usd)), 0)';
  const row = database
    .query<{ total: number }, [string]>(
      `SELECT (SELECT ${spent} FROM provider_call WHERE utc_day = ?1) + (SELECT ${spent} FROM conversation_operation WHERE utc_day = ?1) AS total`,
    )
    .get(utcDay);
  if (!row) throw new Error('Site spend query returned no row');
  return row.total;
}

function readSiteCount(database: Database, scope: 'draft:site' | 'proposal:site', utcDay: string) {
  return (
    database
      .query<{ count: number }, [string, string]>(
        "SELECT count FROM admission_count WHERE scope = ? AND key_hash = '*' AND utc_day = ?",
      )
      .get(scope, utcDay)?.count ?? 0
  );
}

/** The most recent alerts, newest first. */
export function listRecentAlerts(database: Database, limit: number): GuardrailAlert[] {
  return database
    .query<
      {
        kind: string;
        detail: string;
        created_at: number;
        delivery: GuardrailAlert['delivery'];
        delivered_at: number | null;
      },
      [number]
    >(
      'SELECT kind, detail, created_at, delivery, delivered_at FROM guardrail_alert ORDER BY created_at DESC, rowid DESC LIMIT ?',
    )
    .all(limit)
    .map((row) => ({
      kind: row.kind,
      detail: row.detail,
      createdAt: row.created_at,
      delivery: row.delivery,
      deliveredAt: row.delivered_at,
    }));
}

/** Everything the operator's Guardrails panel shows for the UTC day of `now`. */
export function readGuardrailOverview(
  database: Database,
  now: number,
  siteCeilingMicroUsd: number,
): GuardrailOverview {
  const utcDay = utcDayOf(now);
  const locks = readLoginLocks(database, now);
  return {
    pause: findOpenInferencePause(database),
    siteSpendMicroUsd: readSiteSpend(database, utcDay),
    siteCeilingMicroUsd,
    draftsToday: readSiteCount(database, 'draft:site', utcDay),
    proposalsToday: readSiteCount(database, 'proposal:site', utcDay),
    accountLockedUntil: locks.accountLockedUntil,
    lockedSources: locks.lockedSources,
    ceilingSettledToday: readCeilingSettled(database, utcDay),
    alerts: listRecentAlerts(database, 50),
  };
}

/**
 * Records one alert under its dedupe key before any delivery attempt, as `recorded`. A key
 * already present writes nothing and returns `duplicate`, so blue and green raise each alert once.
 */
export function recordGuardrailAlert(
  database: Database,
  kind: string,
  dedupeKey: string,
  detail: string,
  now: number,
): { kind: 'inserted'; id: string } | { kind: 'duplicate' } {
  const id = crypto.randomUUID();
  const write = database
    .query(
      "INSERT OR IGNORE INTO guardrail_alert (id, kind, dedupe_key, detail, created_at, delivery) VALUES (?, ?, ?, ?, ?, 'recorded')",
    )
    .run(id, kind, dedupeKey, detail, now);
  return write.changes === 1 ? { kind: 'inserted', id } : { kind: 'duplicate' };
}

/** Records the one webhook attempt's outcome on a recorded alert. */
export function markAlertDelivery(
  database: Database,
  id: string,
  delivery: 'sent' | 'failed',
  now: number,
): void {
  const write = database
    .query(
      "UPDATE guardrail_alert SET delivery = ?, delivered_at = ? WHERE id = ? AND delivery = 'recorded'",
    )
    .run(delivery, now, id);
  if (write.changes !== 1) throw new Error('Guardrail alert delivery was recorded twice');
}

/** Declined (`content_filter` or `provider_refusal`) conversation completions of one UTC day. */
export function countDeclinedCompletions(database: Database, utcDay: string): number {
  const row = database
    .query<{ count: number }, [string]>(
      'SELECT count(*) AS count FROM conversation_operation WHERE refusal IS NOT NULL AND utc_day = ?',
    )
    .get(utcDay);
  if (!row) throw new Error('Declined completion count query returned no row');
  return row.count;
}
