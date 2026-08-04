import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { openDatabase } from './db';

/**
 * A row of drizzle's `__drizzle_migrations` bookkeeping table. `name` is the
 * migration folder and `hash` the sha256 of its `migration.sql`, both written
 * by the migrator (drizzle-orm/migrator.js, readMigrationFiles).
 */
export interface AppliedMigration {
  id: number;
  hash: string;
  created_at: number;
  name: string | null;
}

/** A migration folder on disk, paired with the down script that reverses it. */
export interface MigrationFolder {
  name: string;
  hash: string;
  downSql: string;
}

export const ROLLBACK_ALL = 'none';

/**
 * Which applied migrations to reverse to get back to `target`, newest first.
 *
 * `target` is the migration that was the newest applied one *before* the
 * deploy — so rolling back means undoing everything applied after it.
 * `ROLLBACK_ALL` means there was no baseline: undo all of them.
 *
 * Pure, and separate from the SQL, because this is the part that decides how
 * much of production's schema to unwind. It is ordered by `created_at`
 * descending rather than by insertion id: the id is an autoincrement that
 * says when a row was written, and a re-applied migration would order wrongly.
 */
export function migrationsToRollback(
  applied: readonly AppliedMigration[],
  target: string,
): AppliedMigration[] {
  const byNewest = [...applied].sort((a, b) => b.created_at - a.created_at);
  if (target === ROLLBACK_ALL) return byNewest;

  const baseline = applied.find((m) => m.name === target);
  if (baseline === undefined) {
    // The baseline is not in the table, so "everything after it" has no
    // meaning. Refusing beats guessing: the alternative readings are "roll
    // back nothing" and "roll back everything", and they differ by the whole
    // database.
    throw new Error(
      `cannot roll back to ${target}: it is not recorded as applied. ` +
        `Applied: ${applied.map((m) => m.name ?? '(unnamed)').join(', ') || '(none)'}`,
    );
  }
  return byNewest.filter((m) => m.created_at > baseline.created_at);
}

/**
 * Reads the migration folders the same way drizzle's migrator does — a
 * subdirectory containing `migration.sql`, hashed over the whole file — and
 * pairs each with its `down.sql`.
 *
 * A missing or empty `down.sql` throws here rather than at rollback time, so
 * `migrate-lint` and this runner agree on what a complete migration is.
 */
export function readMigrationFolders(migrationsFolder: string): MigrationFolder[] {
  const out: MigrationFolder[] = [];
  for (const name of readdirSync(migrationsFolder).sort()) {
    const up = join(migrationsFolder, name, 'migration.sql');
    if (!existsSync(up)) continue;
    const down = join(migrationsFolder, name, 'down.sql');
    if (!existsSync(down)) {
      throw new Error(`${name} has no down.sql, so it cannot be rolled back`);
    }
    const downSql = readFileSync(down, 'utf8');
    if (downSql.trim() === '') {
      throw new Error(`${name}/down.sql is empty, so it cannot be rolled back`);
    }
    out.push({
      name,
      hash: createHash('sha256').update(readFileSync(up).toString()).digest('hex'),
      downSql,
    });
  }
  return out;
}

/**
 * Reverses every migration applied after `target`, newest first, and removes
 * its bookkeeping row.
 *
 * Each migration's down script and its row deletion share one transaction, so
 * a failure cannot leave the schema reversed while the table still claims the
 * migration is applied — which would make the next deploy skip re-applying it.
 *
 * Returns the names rolled back, in the order they were reversed.
 */
export function rollbackTo(dbPath: string, migrationsFolder: string, target: string): string[] {
  const folders = new Map(readMigrationFolders(migrationsFolder).map((f) => [f.name, f]));
  const db = openDatabase(dbPath);
  try {
    const applied = db
      .query<AppliedMigration, []>('SELECT id, hash, created_at, name FROM __drizzle_migrations')
      .all();
    const doomed = migrationsToRollback(applied, target);
    const reversed: string[] = [];

    for (const row of doomed) {
      if (row.name === null) {
        throw new Error(
          `a migration applied at ${String(row.created_at)} has no name recorded, ` +
            'so the down script that reverses it cannot be identified',
        );
      }
      const folder = folders.get(row.name);
      if (folder === undefined) {
        throw new Error(`${row.name} is applied but no longer exists on disk`);
      }
      if (folder.hash !== row.hash) {
        // The file changed after it was applied, so its down.sql describes a
        // different forward migration than the one in the database.
        throw new Error(
          `${row.name} on disk does not match what was applied (hash differs); ` +
            'its down.sql cannot be trusted to reverse it',
        );
      }
      db.run('BEGIN');
      try {
        for (const statement of folder.downSql.split('--> statement-breakpoint')) {
          if (statement.trim() === '') continue;
          db.run(statement);
        }
        db.run('DELETE FROM __drizzle_migrations WHERE id = ?', [row.id]);
        db.run('COMMIT');
      } catch (e: unknown) {
        db.run('ROLLBACK');
        throw new Error(
          `rolling back ${row.name} failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      reversed.push(row.name);
    }
    return reversed;
  } finally {
    db.close();
  }
}
