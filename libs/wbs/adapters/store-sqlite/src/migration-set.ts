import { existsSync } from 'node:fs';

import { z } from 'zod';

import { openDatabase, openReadOnlyDatabase } from './db';
import { type AppliedMigration, readMigrationFolders, rollbackAppliedRows } from './migrate-down';

const migrationIdentity = z.object({
  name: z.string().min(1),
  // Proof: removing the sha256 shape check made the malformed-hash CLI test
  // reach script preflight instead of refusing the capture as malformed.
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});
const pendingIdentity = migrationIdentity.extend({ downHash: z.string().regex(/^[0-9a-f]{64}$/) });
const captureSchema = z.object({
  format: z.literal('applied-migration-set'),
  version: z.literal(1),
  target: z.string().min(1),
  attempt: z.string().min(1),
  candidate: z.string().min(1),
  applied: z.array(migrationIdentity),
  pending: z.array(pendingIdentity),
});

export type MigrationSetCapture = z.infer<typeof captureSchema>;
export type MigrationSetIdentity = Pick<MigrationSetCapture, 'target' | 'attempt' | 'candidate'>;

function appliedRows(db: ReturnType<typeof openDatabase>): AppliedMigration[] {
  const ledger = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .all();
  // Proof: throwing for the missing ledger table made the real CLI empty-capture test exit 1;
  // an existing empty database must record an explicit empty applied set.
  if (ledger.length === 0) return [];
  const rows = db
    .query<AppliedMigration, []>(
      'SELECT id, name, hash, created_at FROM __drizzle_migrations ORDER BY created_at, name',
    )
    .all();
  const names = new Set<string | null>();
  for (const row of rows) {
    // Proof: removing this guard let capture emit a duplicate baseline and let the
    // baseline/pending duplicate restore tests reverse additions before final refusal.
    if (names.has(row.name)) throw new Error(`duplicate applied migration ${String(row.name)}`);
    names.add(row.name);
  }
  return rows;
}

/** Capture the full applied set and the candidate's ordered migration scripts without writing SQLite. */
export function captureAppliedMigrationSet(
  dbPath: string,
  migrationsFolder: string,
  identity: MigrationSetIdentity,
): MigrationSetCapture {
  const folders = readMigrationFolders(migrationsFolder);
  const byName = new Map(folders.map((folder) => [folder.name, folder]));
  // Proof: replacing this with the creating writer made the absent-database CLI test
  // exit 0 and create absent.db instead of refusing capture.
  const connection = openReadOnlyDatabase(dbPath);
  try {
    const rows = appliedRows(connection);
    const applied = rows.map((row) => {
      if (row.name === null) throw new Error('applied migration has no name');
      const folder = byName.get(row.name);
      if (folder?.hash !== row.hash) {
        throw new Error(`applied migration ${row.name} is absent or changed in candidate`);
      }
      return { name: row.name, hash: row.hash };
    });
    const appliedNames = new Set(applied.map((entry) => entry.name));
    // Proof: adding a timestamp cutoff here made the advertised-protocol CLI test
    // omit both older candidate migrations after its newer captured baseline.
    const pending = folders
      .filter((folder) => !appliedNames.has(folder.name))
      .map(({ name, hash, downHash }) => ({ name, hash, downHash }));
    return captureSchema.parse({
      format: 'applied-migration-set',
      version: 1,
      ...identity,
      applied,
      pending,
    });
  } finally {
    connection.close();
  }
}

/** Validate external capture and caller identity before any down script executes. */
export function parseMigrationSetCapture(
  raw: unknown,
  identity: MigrationSetIdentity,
): MigrationSetCapture {
  // Proof: bypassing schema validation let the unsupported-version CLI test exit 0.
  const capture = captureSchema.parse(raw);
  // Proof: removing caller-identity comparison let the target, attempt and candidate
  // mismatch CLI cases each exit 0 and reverse both additions.
  if (
    capture.target !== identity.target ||
    capture.attempt !== identity.attempt ||
    capture.candidate !== identity.candidate
  ) {
    throw new Error('migration capture belongs to another target, attempt or candidate');
  }
  const names = [...capture.applied, ...capture.pending].map((entry) => entry.name);
  // Proof: without this guard, the duplicate-identity CLI test reversed both additions
  // before final equality refused the now-duplicated baseline set.
  if (new Set(names).size !== names.length)
    throw new Error('migration capture has duplicate names');
  const pendingOrder = capture.pending.map((entry) => entry.name);
  const forwardOrder = [...pendingOrder].sort();
  // Proof: without this check, the reordered-pending real CLI test committed the first
  // down script, then failed the second, leaving one candidate ledger row and partial schema.
  if (pendingOrder.some((name, index) => name !== forwardOrder[index])) {
    throw new Error('pending migration order differs from forward runner order');
  }
  return capture;
}

/** Restore exactly the captured applied identities, irrespective of migration timestamps. */
export function restoreAppliedMigrationSet(
  dbPath: string,
  migrationsFolder: string,
  capture: MigrationSetCapture,
): string[] {
  if (!existsSync(dbPath)) throw new Error(`migration database is absent: ${dbPath}`);
  const folders = new Map(
    readMigrationFolders(migrationsFolder).map((folder) => [folder.name, folder]),
  );
  for (const entry of [...capture.applied, ...capture.pending]) {
    const folder = folders.get(entry.name);
    // Proof: disabling this preflight let changed forward bytes reach the per-row guard
    // after the later migration had already committed its reversal in the real CLI test.
    if (folder?.hash !== entry.hash) {
      throw new Error(`migration script ${entry.name} is absent or changed`);
    }
    // Proof: disabling this comparison made the changed down.sql CLI test exit 0 and
    // reverse both additions despite the capture's different down-script hash.
    if ('downHash' in entry && folder.downHash !== entry.downHash) {
      throw new Error(`down script ${entry.name} is changed`);
    }
  }
  const db = openDatabase(dbPath);
  try {
    const observed = appliedRows(db);
    const applied = new Map(capture.applied.map((entry) => [entry.name, entry.hash]));
    const pending = new Map(capture.pending.map((entry) => [entry.name, entry.hash]));
    const observedByName = new Map(observed.map((row) => [row.name, row]));
    for (const [name, hash] of applied) {
      const row = observedByName.get(name);
      // Proof: removing this check let the missing-baseline CLI test reverse the
      // additions before final equality refused the incomplete ledger.
      if (row?.hash !== hash) throw new Error(`captured migration ${name} is absent or changed`);
    }
    for (const row of observed) {
      if (row.name === null) throw new Error('applied migration has no name');
      const expected = applied.get(row.name) ?? pending.get(row.name);
      // Proof: removing this check let the unexpected-addition CLI test reverse
      // captured candidates before final equality detected the unrelated row;
      // the changed-pending-hash test likewise reversed the later migration first.
      if (expected === undefined || row.hash !== expected) {
        throw new Error(`unexpected or changed migration ${row.name}`);
      }
    }
    // Proof: restoring the old timestamp cutoff skipped older lifecycle after shared_people;
    // the real CLI regression exited 1 with the candidate ledger row left behind.
    // Proof: including captured applied identities made the preservation CLI test exit
    // before reporting its new migration; the retained lifecycle row was targeted.
    const doomed = [...capture.pending].reverse().flatMap((entry) => {
      const row = observedByName.get(entry.name);
      // Proof: treating an absent pending row as still applied made the partial-forward
      // CLI recovery test fail instead of restoring and repeating as a no-op.
      return row === undefined ? [] : [row];
    });
    const reversed = rollbackAppliedRows(db, folders, doomed);
    const restored = appliedRows(db);
    const restoredIdentities = restored
      .map((row) => {
        if (row.name === null) throw new Error('restored migration has no name');
        return `${row.name}:${row.hash}`;
      })
      .sort();
    const capturedIdentities = capture.applied.map((entry) => `${entry.name}:${entry.hash}`).sort();
    // Proof: suppressing this comparison let the CLI report success after a ledger trigger
    // reinserted the candidate row; its production-path test observed exit 0 instead of refusal.
    if (JSON.stringify(restoredIdentities) !== JSON.stringify(capturedIdentities)) {
      throw new Error('migration ledger differs from captured applied set after rollback');
    }
    return reversed;
  } finally {
    db.close();
  }
}
