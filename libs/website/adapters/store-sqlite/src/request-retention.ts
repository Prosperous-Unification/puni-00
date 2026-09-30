import { Database } from 'bun:sqlite';

import { existingDatabasePath, validateDatabase } from './checked-database';

/** The two typed identities that own a retention deadline; see the website CONTEXT glossary. */
export type RetentionSubjectKind = 'software_request' | 'proposal_submission';

/** Why backfill refused to guess a first-content anchor. */
export type RetentionAmbiguity =
  'unanchored_content' | 'content_predates_anchor' | 'overlapping_lineage';

/** Non-client retention period, counted in UTC calendar months from first stored content. */
export const retentionMonths = 12;

type RetentionState =
  | { resolution: 'pending_content' }
  | { resolution: 'anchored'; anchorAt: number; source: 'draft' | 'first_write' }
  | { resolution: 'ambiguous'; ambiguity: RetentionAmbiguity };

export interface RetentionSubjectCounts {
  anchored: number;
  due: number;
  dueHeld: number;
  client: number;
  pendingContent: number;
  ambiguous: number;
  uncovered: number;
  unanchoredContent: number;
}

/** Count-only due-work report; it never carries content, email or subject identifiers. */
export interface RetentionReport {
  asOf: number;
  deletion: 'disabled';
  activation: 'ready' | 'refused';
  softwareRequest: RetentionSubjectCounts;
  proposalSubmission: RetentionSubjectCounts;
}

/** A typed identity awaiting operator adjudication; it carries no content. */
export interface AmbiguousRetentionSubject {
  kind: RetentionSubjectKind;
  subjectId: string;
  reason: RetentionAmbiguity;
}

export interface AnchorResolution {
  kind: RetentionSubjectKind;
  subjectId: string;
  anchorAt: number;
  evidenceReference: string;
  actor: string;
}

interface RequestLineageRow {
  id: string;
  draft_id: string | null;
  draft_created_at: number | null;
  has_content: number;
  earliest_content_at: number | null;
  foreign_legacy: number;
  foreign_submission: number;
}

interface SubmissionLineageRow {
  id: string;
  draft_created_at: number;
  legacy_account_link: number;
}

const purpose = 'Request retention';
const requestHasContent = `(
  trim(request.description) <> '' OR trim(request.brief) <> ''
  OR EXISTS (SELECT 1 FROM chat_turn WHERE request_id = request.id)
  OR EXISTS (SELECT 1 FROM chat_operation WHERE request_id = request.id)
  OR EXISTS (SELECT 1 FROM request_concept_preview WHERE request_id = request.id)
  OR EXISTS (SELECT 1 FROM proposal_submission WHERE draft_id = request.draft_id))`;
const requestEarliestContent = `(
  SELECT min(created_at) FROM (
    SELECT created_at FROM chat_turn WHERE request_id = request.id
    UNION ALL SELECT created_at FROM chat_operation WHERE request_id = request.id
    UNION ALL SELECT created_at FROM request_concept_preview WHERE request_id = request.id))`;
const untrackedRequests = `
  SELECT request.id, request.draft_id, draft.created_at AS draft_created_at,
    ${requestHasContent} AS has_content,
    ${requestEarliestContent} AS earliest_content_at,
    EXISTS (SELECT 1 FROM account_request AS legacy
      WHERE legacy.draft_id = request.draft_id AND legacy.account_id <> request.account_id) AS foreign_legacy,
    EXISTS (SELECT 1 FROM proposal_submission AS submission
      WHERE submission.draft_id = request.draft_id
        AND (request.submitted_at IS NULL OR submission.created_at <> request.submitted_at)) AS foreign_submission
  FROM software_request AS request
  LEFT JOIN intake_draft AS draft ON draft.id = request.draft_id
  WHERE NOT EXISTS (SELECT 1 FROM retention_subject
    WHERE subject_kind = 'software_request' AND subject_id = request.id)
  ORDER BY request.id`;
// Proof: without the software_request exclusion, the overlapping account-submission test found a second subject.
const untrackedSubmissions = `
  SELECT submission.id, draft.created_at AS draft_created_at,
    EXISTS (SELECT 1 FROM account_request WHERE draft_id = submission.draft_id) AS legacy_account_link
  FROM proposal_submission AS submission
  JOIN intake_draft AS draft ON draft.id = submission.draft_id
  WHERE NOT EXISTS (SELECT 1 FROM software_request WHERE draft_id = submission.draft_id)
    AND NOT EXISTS (SELECT 1 FROM retention_subject
      WHERE subject_kind = 'proposal_submission' AND subject_id = submission.id)
  ORDER BY submission.id`;
const subjectCounts = `
  SELECT
    coalesce(sum(resolution = 'anchored'), 0) AS anchored,
    coalesce(sum(resolution = 'anchored' AND deadline_at <= ?1 AND classification = 'non_client'), 0) AS due,
    coalesce(sum(resolution = 'anchored' AND deadline_at <= ?1 AND classification = 'hold'), 0) AS dueHeld,
    coalesce(sum(classification = 'client'), 0) AS client,
    coalesce(sum(resolution = 'pending_content'), 0) AS pendingContent,
    coalesce(sum(resolution = 'ambiguous'), 0) AS ambiguous
  FROM retention_subject WHERE subject_kind = ?2`;
const uncoveredRequestCount = `
  SELECT count(*) AS count FROM software_request AS request
  WHERE ${requestHasContent}
    AND NOT EXISTS (SELECT 1 FROM retention_subject
      WHERE subject_kind = 'software_request' AND subject_id = request.id)`;
const unanchoredRequestCount = `
  SELECT count(*) AS count FROM software_request AS request
  JOIN retention_subject ON subject_kind = 'software_request' AND subject_id = request.id
  WHERE resolution = 'pending_content' AND ${requestHasContent}`;
// A submission is covered by its own subject or, for an account submission, by its request's subject.
const uncoveredSubmissionCount = `
  SELECT count(*) AS count FROM proposal_submission AS submission
  WHERE NOT EXISTS (SELECT 1 FROM retention_subject
      WHERE subject_kind = 'proposal_submission' AND subject_id = submission.id)
    AND NOT EXISTS (SELECT 1 FROM software_request AS request
      JOIN retention_subject ON subject_kind = 'software_request' AND subject_id = request.id
      WHERE request.draft_id = submission.draft_id)`;
const survivingContentBound = {
  software_request: `
    SELECT min(created_at) AS bound FROM (
      SELECT created_at FROM chat_turn WHERE request_id = ?1
      UNION ALL SELECT created_at FROM chat_operation WHERE request_id = ?1
      UNION ALL SELECT created_at FROM request_concept_preview WHERE request_id = ?1
      UNION ALL SELECT draft.created_at FROM software_request AS request
        JOIN intake_draft AS draft ON draft.id = request.draft_id WHERE request.id = ?1
      UNION ALL SELECT submission.created_at FROM software_request AS request
        JOIN proposal_submission AS submission ON submission.draft_id = request.draft_id
        WHERE request.id = ?1)`,
  proposal_submission: `
    SELECT min(created_at) AS bound FROM (
      SELECT submission.created_at FROM proposal_submission AS submission WHERE submission.id = ?1
      UNION ALL SELECT draft.created_at FROM proposal_submission AS submission
        JOIN intake_draft AS draft ON draft.id = submission.draft_id WHERE submission.id = ?1)`,
} as const;

/**
 * Adds UTC calendar months, keeping the UTC time of day and clamping the day to the target
 * month's last day (2024-02-29 plus 12 months is 2025-02-28).
 *
 * @throws when `instant` is not integral UTC epoch milliseconds.
 */
export function addUtcMonths(instant: number, months: number): number {
  if (!Number.isSafeInteger(instant) || !Number.isSafeInteger(months))
    throw new Error('Month addition requires integral UTC epoch milliseconds');
  const start = new Date(instant);
  const monthIndex = start.getUTCFullYear() * 12 + start.getUTCMonth() + months;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex - year * 12;
  const lastDay = new Date(0);
  lastDay.setUTCFullYear(year, month + 1, 0);
  const target = new Date(instant);
  target.setUTCFullYear(year, month, Math.min(start.getUTCDate(), lastDay.getUTCDate()));
  return target.getTime();
}

/** Records a new subject; the primary key refuses a duplicate typed identity. */
export function insertRetentionSubject(
  database: Database,
  kind: RetentionSubjectKind,
  subjectId: string,
  state: RetentionState,
): void {
  const insert = database.query(
    'INSERT INTO retention_subject (subject_kind, subject_id, resolution, ambiguity, anchor_at, deadline_at, anchor_source) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  if (state.resolution === 'anchored')
    insert.run(
      kind,
      subjectId,
      state.resolution,
      null,
      state.anchorAt,
      addUtcMonths(state.anchorAt, retentionMonths),
      state.source,
    );
  else
    insert.run(
      kind,
      subjectId,
      state.resolution,
      state.resolution === 'ambiguous' ? state.ambiguity : null,
      null,
      null,
      null,
    );
}

/**
 * Anchors a blank software request on its first nonempty content write. Only a
 * `pending_content` subject changes, so later edits and a concurrent writer that commits second
 * keep the first anchor. A request with no subject row was created by an older API process; it
 * stays uncovered in the report rather than receiving a guessed anchor here.
 */
export function anchorRequestContent(database: Database, requestId: string, now: number): void {
  database
    .query(
      // Proof: dropping the pending_content predicate failed the later-edits and concurrent-writer tests with "retention anchor is immutable".
      "UPDATE retention_subject SET resolution = 'anchored', anchor_at = ?, deadline_at = ?, anchor_source = 'first_write' WHERE subject_kind = 'software_request' AND subject_id = ? AND resolution = 'pending_content'",
    )
    .run(now, addUtcMonths(now, retentionMonths), requestId);
}

function classifyRequest(row: RequestLineageRow): RetentionState {
  if (row.draft_id === null)
    // Proof: returning pending_content here made the backfill test accept legacy typed content as blank.
    return row.has_content === 1
      ? { resolution: 'ambiguous', ambiguity: 'unanchored_content' }
      : { resolution: 'pending_content' };
  if (row.draft_created_at === null)
    throw new Error('Software request links a missing intake draft');
  // Proof: removing either flag anchored its overlapping-lineage fixture (backfill or account-submission test) from the draft.
  if (row.foreign_legacy === 1 || row.foreign_submission === 1)
    return { resolution: 'ambiguous', ambiguity: 'overlapping_lineage' };
  // Proof: removing this comparison anchored the pre-draft chat fixture at the later draft time.
  if (row.earliest_content_at !== null && row.earliest_content_at < row.draft_created_at)
    return { resolution: 'ambiguous', ambiguity: 'content_predates_anchor' };
  return { resolution: 'anchored', anchorAt: row.draft_created_at, source: 'draft' };
}

/**
 * Records a subject for every software request and standalone proposal submission that lacks
 * one, anchoring only from a linked draft's creation time. Existing subjects are never updated,
 * so repeated runs are idempotent. Migration 004's copied `created_at` and its empty
 * placeholders are never treated as first-content evidence.
 */
export function backfillRetentionSubjects(database: Database): void {
  database.transaction(() => {
    for (const row of database.query<RequestLineageRow, []>(untrackedRequests).all())
      insertRetentionSubject(database, 'software_request', row.id, classifyRequest(row));
    for (const row of database.query<SubmissionLineageRow, []>(untrackedSubmissions).all())
      insertRetentionSubject(
        database,
        'proposal_submission',
        row.id,
        row.legacy_account_link === 1
          ? { resolution: 'ambiguous', ambiguity: 'overlapping_lineage' }
          : { resolution: 'anchored', anchorAt: row.draft_created_at, source: 'draft' },
      );
  })();
}

function count(database: Database, sql: string): number {
  const row = database.query<{ count: number }, []>(sql).get();
  if (!row) throw new Error('Retention count query returned no row');
  return row.count;
}

function countSubjects(
  database: Database,
  kind: RetentionSubjectKind,
  now: number,
): Omit<RetentionSubjectCounts, 'uncovered' | 'unanchoredContent'> {
  const row = database
    .query<Omit<RetentionSubjectCounts, 'uncovered' | 'unanchoredContent'>, [number, string]>(
      subjectCounts,
    )
    .get(now, kind);
  if (!row) throw new Error('Retention subject count query returned no row');
  return row;
}

function reportRetention(database: Database, now: number): RetentionReport {
  const softwareRequest = {
    ...countSubjects(database, 'software_request', now),
    uncovered: count(database, uncoveredRequestCount),
    unanchoredContent: count(database, unanchoredRequestCount),
  };
  const proposalSubmission = {
    ...countSubjects(database, 'proposal_submission', now),
    // Proof: returning 0 here let the omitted accountless proposal pass activation coverage.
    uncovered: count(database, uncoveredSubmissionCount),
    unanchoredContent: 0,
  };
  const blocked = [softwareRequest, proposalSubmission].some(
    (counts) => counts.ambiguous + counts.uncovered + counts.unanchoredContent > 0,
  );
  return {
    asOf: now,
    deletion: 'disabled',
    activation: blocked ? 'refused' : 'ready',
    softwareRequest,
    proposalSubmission,
  };
}

function withReadonlyDatabase<T>(databasePath: string, read: (database: Database) => T): T {
  const path = existingDatabasePath(databasePath, false, purpose);
  const database = new Database(path, { readonly: true });
  try {
    validateDatabase(database, purpose);
    return read(database);
  } finally {
    database.close();
  }
}

/** Reports due and unresolved counts for both subject kinds without migrating or changing data. */
export function inspectRequestRetention(databasePath: string, now: number): RetentionReport {
  return withReadonlyDatabase(databasePath, (database) => reportRetention(database, now));
}

/** Lists ambiguous typed identities for operator adjudication, without content. */
export function listAmbiguousRetentionSubjects(databasePath: string): AmbiguousRetentionSubject[] {
  return withReadonlyDatabase(databasePath, (database) =>
    database
      .query<AmbiguousRetentionSubject, []>(
        "SELECT subject_kind AS kind, subject_id AS subjectId, ambiguity AS reason FROM retention_subject WHERE resolution = 'ambiguous' ORDER BY subject_kind, subject_id",
      )
      .all(),
  );
}

/**
 * Proves every content-bearing subject has an unambiguous anchor before cleanup may activate.
 * Deletion stays disabled in this release; the check is the activation precondition.
 *
 * @throws naming the uncovered, ambiguous and unanchored counts when coverage is incomplete.
 */
export function assertRetentionCoverage(databasePath: string, now: number): RetentionReport {
  const report = inspectRequestRetention(databasePath, now);
  const gaps = (
    [
      ['softwareRequest', 'software request'],
      ['proposalSubmission', 'proposal submission'],
    ] as const
  ).flatMap(([key, label]) => {
    const counts = report[key];
    return [
      [counts.uncovered, `uncovered ${label}`],
      [counts.ambiguous, `ambiguous ${label}`],
      [counts.unanchoredContent, `unanchored ${label}`],
    ] as const;
  });
  const refusals = gaps
    .filter(([total]) => total > 0)
    .map(([total, label]) => `${String(total)} ${label}`);
  // Proof: skipping this refusal let the omitted accountless proposal and ambiguous subject tests pass as ready.
  if (refusals.length > 0) throw new Error(`Retention activation refused: ${refusals.join(', ')}`);
  return report;
}

/**
 * Anchors one ambiguous subject from operator-supplied evidence. The evidence reference is an
 * opaque pointer (ticket or record ID), never free text or an email, and the anchor cannot be
 * later than any surviving content timestamp because first content precedes all of it.
 *
 * @throws for malformed evidence or actor, an anchor after `now` or surviving content, or a
 * subject that is not currently ambiguous.
 */
export function resolveRetentionAnchor(
  databasePath: string,
  resolution: AnchorResolution,
  now: number,
): { deadlineAt: number } {
  // Proof: removing this check accepted blank, email and free-text evidence in the operator-resolution test.
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,199}$/.test(resolution.evidenceReference))
    throw new Error('Evidence reference must be an opaque reference without spaces or email');
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(resolution.actor))
    throw new Error('Actor must be a lowercase operator identifier');
  if (!Number.isSafeInteger(resolution.anchorAt) || resolution.anchorAt < 0)
    throw new Error('Anchor must be UTC epoch milliseconds');
  if (resolution.anchorAt > now) throw new Error('Anchor cannot be later than now');
  const path = existingDatabasePath(databasePath, true, purpose);
  const database = new Database(path, { readwrite: true });
  try {
    database.run('BEGIN IMMEDIATE');
    try {
      validateDatabase(database, purpose);
      const bound = database
        .query<{ bound: number | null }, [string]>(survivingContentBound[resolution.kind])
        .get(resolution.subjectId);
      if (!bound) throw new Error('Retention content bound query returned no row');
      // Proof: removing this bound accepted an anchor after the pre-draft chat turn.
      if (bound.bound !== null && resolution.anchorAt > bound.bound)
        throw new Error('Anchor cannot be later than surviving content');
      const deadlineAt = addUtcMonths(resolution.anchorAt, retentionMonths);
      const update = database
        .query(
          "UPDATE retention_subject SET resolution = 'anchored', anchor_at = ?, deadline_at = ?, anchor_source = 'operator', evidence_reference = ?, resolved_by = ?, resolved_at = ? WHERE subject_kind = ? AND subject_id = ? AND resolution = 'ambiguous'",
        )
        .run(
          resolution.anchorAt,
          deadlineAt,
          resolution.evidenceReference,
          resolution.actor,
          now,
          resolution.kind,
          resolution.subjectId,
        );
      if (update.changes !== 1) throw new Error('Retention subject is not an ambiguous anchor');
      database.run('COMMIT');
      return { deadlineAt };
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  } finally {
    database.close();
  }
}
