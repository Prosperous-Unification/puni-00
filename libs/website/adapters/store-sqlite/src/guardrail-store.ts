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
 * The `proposal:email` key: SHA-256 of the day salt and the lower-cased email, so the counter is
 * pseudonymous and cannot be linked to the address once the day's salt is deleted.
 */
export function hashEmailKey(daySalt: Uint8Array, email: string): string {
  return createHash('sha256').update(daySalt).update(email.toLowerCase()).digest('hex');
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
