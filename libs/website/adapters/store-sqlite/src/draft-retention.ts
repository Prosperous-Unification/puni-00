import { createHash } from 'node:crypto';
import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';

import { websiteMigrations } from './migration-catalogue';

interface MigrationRow {
  name: string;
  checksum: string;
}

interface SchemaRow {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
}

interface CandidateRow {
  id: string;
  expires_at: number;
}

export interface DraftCleanupPlan {
  cutoff: number;
  eligibleDrafts: number;
  fingerprint: string;
}

const migrationTable =
  'CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)';
const schemaQuery =
  "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table', 'index', 'view', 'trigger') AND name NOT LIKE 'sqlite_%' ORDER BY type, name";
const candidateQuery = `
  SELECT draft.id, draft.expires_at
  FROM intake_draft AS draft
  WHERE draft.expires_at <= ? AND draft.consumed_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM proposal_submission WHERE draft_id = draft.id)
    AND NOT EXISTS (SELECT 1 FROM software_request WHERE draft_id = draft.id)
    AND NOT EXISTS (SELECT 1 FROM account_request WHERE draft_id = draft.id)
    AND NOT EXISTS (SELECT 1 FROM submission_replay WHERE claim_hash = draft.claim_hash)
  ORDER BY draft.id`;

/** Refuses absent or inaccessible database files without creating a path. */
function existingDatabasePath(databasePath: string, writable: boolean): string {
  const details = statSync(databasePath);
  // Proof: removing the file-kind or permission checks fails the directory, unreadable and unwritable fixtures.
  if (
    !details.isFile() ||
    (details.mode & 0o444) === 0 ||
    (writable && (details.mode & 0o222) === 0)
  )
    throw new Error('Draft retention requires a readable existing SQLite file');
  accessSync(databasePath, writable ? constants.R_OK | constants.W_OK : constants.R_OK);
  return realpathSync(databasePath);
}

/** Compares the selected database with all five applied migrations and their resulting core schema. */
function validateDatabase(database: Database): void {
  const integrity = database.query<{ integrity_check: string }, []>('PRAGMA integrity_check').get();
  // Proof: injecting a failed SQLite integrity result made inspection refuse the supported fixture.
  if (integrity?.integrity_check !== 'ok')
    throw new Error('Draft retention database integrity failed');

  const expected = new Database(':memory:');
  try {
    expected.run(migrationTable);
    const migrations = websiteMigrations();
    const applied = database
      .query<MigrationRow, []>('SELECT name, checksum FROM schema_migration ORDER BY name')
      .all();
    // Proof: unknown and edited migration fixtures fail when the count or checksum checks are removed.
    if (applied.length !== migrations.length)
      throw new Error('Draft retention requires the current website migrations');
    for (const migration of migrations) {
      const forward = readFileSync(join(migration.directory, 'migration.sql'), 'utf8');
      readFileSync(join(migration.directory, 'down.sql'), 'utf8');
      const checksum = createHash('sha256').update(forward).digest('hex');
      if (!applied.some((row) => row.name === migration.name && row.checksum === checksum))
        throw new Error('Draft retention found an unexpected or edited migration');
      expected.run(forward);
    }
    const actualSchema = database.query<SchemaRow, []>(schemaQuery).all();
    const expectedSchema = expected.query<SchemaRow, []>(schemaQuery).all();
    // Proof: extra tables and delete triggers are accepted if this schema comparison is removed.
    if (JSON.stringify(actualSchema) !== JSON.stringify(expectedSchema))
      throw new Error('Draft retention requires the current website schema');
  } finally {
    expected.close();
  }
}

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
  validateDatabase(database);
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
  const path = existingDatabasePath(databasePath, false);
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
  const path = existingDatabasePath(databasePath, true);
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
