import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readMigrationFiles } from 'drizzle-orm/migrator';

import { type Drizzle, openConnection } from './db';
import { HISTORICAL_DEPENDENCY_MIGRATION } from './dependency-bootstrap-history';
import { runMigrations } from './migrate';

const AUTHORITY_MIGRATION = '20261022212000_add_cross_project_dependency_activation';
const DELAYED_MIGRATIONS = new Set([
  '20261022210000_add_project_abbreviations',
  '20261022211000_add_external_dependencies',
  AUTHORITY_MIGRATION,
  '20261022213000_add_optimization_boundary_certificates',
]);
/** Pins every sorted name/hash from main acfdc02c7f0acc98606c87312a694ed2b89302ea. */
const MAIN_LEDGER_SHA256 = '68eb1ad31c377b493d20da473c6d3d18d842914f8d9179c4888f1f2b1e0123b1';
/** Pins the same complete set with only the traced original dependency migration hash. */
const HISTORICAL_MAIN_LEDGER_SHA256 =
  'dc311f3427af09351bf67673a43bcca065a2dc385185a95b85e04faf995c937a';
const SCHEMA = 'SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name';

/**
 * Classifies migration bootstrap without repairing the source. Fresh means no schema
 * objects at all. Historical means an exact known pre-authority ledger prefix or the pinned
 * 103-migration main acfdc02c set with all four delayed dependency additions absent,
 * plus the complete schema reproduced by that set. The separately pinned original
 * dependency migration history replays its retained original SQL in scratch only;
 * it never rewrites the source ledger, schema or current migration files. Data-dependent schema changes or
 * operator schema extensions require attended upgrade, rather than an inferred repair.
 *
 * Once the ledger reaches past the authority migration, the certificate covers only the
 * ledger's prefix: disk migrations named at or before the ledger's last name, minus the four
 * delayed dependency additions. Pending forward migrations named after the ledger's end are
 * excluded because the ordinary startup migrator applies them right after this check and no
 * pin can know them in advance; an unknown migration sorting inside the ledger range stays in
 * the certified set and refuses through the {@link MAIN_LEDGER_SHA256} pin.
 *
 * Historical certification replays only the finite certified migration set
 * in a disposable scratch database, never the source; IO and replay failures throw.
 * Existing authority objects receive strict semantic inspection by the caller;
 * incomplete migration identities or schema refuse certification before mutation.
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
  const hasLaterMigrations = ledger.some(
    (row) => typeof row.name === 'string' && row.name >= AUTHORITY_MIGRATION,
  );
  const known = readMigrationFiles({ migrationsFolder });
  const ledgerEnd = ledger.at(-1)?.name;
  if (hasLaterMigrations && typeof ledgerEnd !== 'string')
    throw new Error('uncertified dependency authority history');
  // Proof: dropping the ledgerEnd bound refused the current-main store with one trailing
  // pending forward migration (uncertified dependency authority migration set) in
  // "boots the exact current-main store with a trailing pending forward migration" (2026-11-08).
  let certifiedMigrations = hasLaterMigrations
    ? known.filter(
        (migration) =>
          !DELAYED_MIGRATIONS.has(migration.name) &&
          typeof ledgerEnd === 'string' &&
          migration.name <= ledgerEnd,
      )
    : known.slice(0, ledger.length);
  let usesHistoricalDependency = false;
  if (hasLaterMigrations) {
    const identities = certifiedMigrations.map(({ name, hash }) => ({ name, hash }));
    // Proof: omitting this pin admitted matching altered disk/ledger SQL identities through
    // actual boot; the owning refusal failed (0 pass/1 fail), then restored passed (2026-11-08).
    if (
      createHash('sha256').update(JSON.stringify(identities)).digest('hex') !== MAIN_LEDGER_SHA256
    )
      throw new Error('uncertified dependency authority migration set');
    usesHistoricalDependency =
      createHash('sha256').update(JSON.stringify(ledger)).digest('hex') ===
      HISTORICAL_MAIN_LEDGER_SHA256;
    if (usesHistoricalDependency)
      certifiedMigrations = certifiedMigrations.map((migration) =>
        migration.name === HISTORICAL_DEPENDENCY_MIGRATION.name
          ? { ...migration, hash: HISTORICAL_DEPENDENCY_MIGRATION.hash }
          : migration,
      );
  }
  // Proof: removing prefix identity validation admitted the altered historical hash
  // through the mounted boot with a pending migration (2026-10-23).
  // Proof: omitting this identity boundary admitted an altered current-main hash through
  // actual boot (0 pass/1 fail); the exact restored refusal passed (2026-11-08).
  if (
    ledger.length === 0 ||
    certifiedMigrations.length !== ledger.length ||
    certifiedMigrations.some(
      (migration, index) =>
        (!hasLaterMigrations && migration.name >= AUTHORITY_MIGRATION) ||
        migration.name !== ledger[index]?.name ||
        migration.hash !== ledger[index]?.hash,
    )
  )
    throw new Error('uncertified dependency authority history');
  const scratch = mkdtempSync(join(tmpdir(), 'wbs-dependency-history-certificate-'));
  try {
    const staged = join(scratch, 'migrations');
    mkdirSync(staged);
    for (const migration of certifiedMigrations)
      cpSync(join(migrationsFolder, migration.name), join(staged, migration.name), {
        recursive: true,
      });
    if (usesHistoricalDependency)
      writeFileSync(
        join(staged, HISTORICAL_DEPENDENCY_MIGRATION.name, 'migration.sql'),
        HISTORICAL_DEPENDENCY_MIGRATION.sql,
      );
    const path = join(scratch, 'certificate.db');
    runMigrations(path, staged);
    const certificate = openConnection(path);
    try {
      // Proof: removing this comparison admitted a partial historical schema
      // through mounted boot before a pending migration (2026-10-23).
      // Proof: omitting this comparison admitted a dropped current-main index and a historical
      // hash paired with cascading schema (0 pass/2 fail); restored both passed (2026-11-08).
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
