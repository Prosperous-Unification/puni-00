import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readMigrationFiles } from 'drizzle-orm/migrator';

import { type Drizzle, openConnection } from './db';
import { runMigrations } from './migrate';

const AUTHORITY_MIGRATION = '20261022212000_add_cross_project_dependency_activation';
const SCHEMA = 'SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name';

/**
 * Classifies migration bootstrap without repairing the source. Fresh means no schema
 * objects at all. Historical means an exact known pre-authority ledger prefix and
 * the complete schema reproduced by that prefix. Data-dependent schema changes or
 * operator schema extensions require attended upgrade, rather than an inferred repair.
 *
 * Historical certification replays at most the finite supplied pre-authority prefix
 * in a disposable scratch database, never the source; IO and replay failures throw.
 * Current or partial authority is returned for strict semantic inspection by the caller.
 */
export function inspectDependencyBootstrap(
  db: Drizzle,
  migrationsFolder: string,
): 'fresh' | 'historical' | 'authority' {
  const schema = db.all<{ type: string; name: string; tbl_name: string; sql: unknown }>(SCHEMA);
  // Proof: admitting nonempty schemas as fresh changed the complete database
  // certificate in the unrecorded-partial-schema mounted boot test (2026-10-23).
  if (schema.length === 0) return 'fresh';
  if (
    schema.some(
      (entry) =>
        entry.name.startsWith('cross_project_dependency_activation') ||
        entry.name.startsWith('external_dependency_admit_'),
    )
  )
    return 'authority';
  // An absent or unreadable ledger on a nonempty source throws at this boundary.
  const ledger = db.all<{ name: unknown; hash: unknown }>(
    'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
  );
  if (ledger.some((row) => typeof row.name === 'string' && row.name >= AUTHORITY_MIGRATION))
    return 'authority';
  const known = readMigrationFiles({ migrationsFolder });
  const prefix = known.slice(0, ledger.length);
  // Proof: removing prefix identity validation admitted the altered historical hash
  // through the mounted boot with a pending migration (2026-10-23).
  if (
    ledger.length === 0 ||
    prefix.length !== ledger.length ||
    prefix.some(
      (migration, index) =>
        migration.name >= AUTHORITY_MIGRATION ||
        migration.name !== ledger[index]?.name ||
        migration.hash !== ledger[index]?.hash,
    )
  )
    throw new Error('uncertified dependency authority history');
  const scratch = mkdtempSync(join(tmpdir(), 'wbs-dependency-history-certificate-'));
  try {
    const staged = join(scratch, 'migrations');
    mkdirSync(staged);
    for (const migration of prefix)
      cpSync(join(migrationsFolder, migration.name), join(staged, migration.name), {
        recursive: true,
      });
    const path = join(scratch, 'certificate.db');
    runMigrations(path, staged);
    const certificate = openConnection(path);
    try {
      // Proof: removing this comparison admitted a partial historical schema
      // through mounted boot before a pending migration (2026-10-23).
      if (JSON.stringify(schema) !== JSON.stringify(certificate.db.all(SCHEMA)))
        throw new Error('uncertified dependency authority schema');
    } finally {
      certificate.close();
    }
    return 'historical';
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
