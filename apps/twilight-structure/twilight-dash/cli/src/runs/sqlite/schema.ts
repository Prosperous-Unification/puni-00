import { Database } from 'bun:sqlite';

import {
  DOWN_HASH,
  FORMAT3_IDENTITY,
  FORMAT4_IDENTITY,
  MIGRATION_HASH,
  MIGRATIONS,
  type SqliteFormatIdentity,
} from './format';
import { readHistoryForFormat } from './read-history';
import { readRuntimeCatalogForFormat } from './read-runtime';
import { decodeMeta } from './row-codecs';
export {
  DOWN,
  DOWN_HASH,
  FORMAT_HASH,
  MIGRATION,
  MIGRATION_HASH,
  MIGRATIONS,
  SCHEMA_VERSION,
} from './format';

interface SchemaEntry {
  readonly type: 'table' | 'index';
  readonly name: string;
  readonly tbl_name: string;
  readonly sql: string | null;
}

/** SQLite owns these column types; stored CREATE statements retain every declared constraint and index predicate. */
function readSchema(database: Database): readonly SchemaEntry[] {
  return database
    .query<SchemaEntry, []>(
      "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index') ORDER BY type,name",
    )
    .all();
}

/** Derives the required physical declarations from the migration rather than a second hand-maintained schema. */
function readRequiredSchema(
  migrations: readonly (typeof MIGRATIONS)[number][],
): readonly SchemaEntry[] {
  const reference = new Database(':memory:', { strict: true });
  try {
    for (const migration of migrations)
      // Proof: F53c restored whole-script reference SQL and accepted an intermediate CHECK failure; 'physical reference refuses an intermediate' failed and exact restoration passed.
      for (const statement of migration.forwardStatements) reference.run(statement);
    return readSchema(reference);
  } finally {
    reference.close();
  }
}
/** Adapter-private descriptors select a complete compiled artifact set; ordinary opens and mutations always use CURRENT_FORMAT. Explicit transitions select named format descriptors. */
export interface FormatDescriptor {
  readonly identity: SqliteFormatIdentity;
  readonly schema: readonly SchemaEntry[];
  readonly tables: ReadonlySet<string>;
}
function describeFormat(
  identity: SqliteFormatIdentity,
  migrations: readonly (typeof MIGRATIONS)[number][],
): FormatDescriptor {
  const schema = readRequiredSchema(migrations);
  return {
    identity,
    schema,
    tables: new Set(schema.filter((entry) => entry.type === 'table').map((entry) => entry.name)),
  };
}
export const FORMAT3 = describeFormat(FORMAT3_IDENTITY, MIGRATIONS.slice(0, 3));
export const FORMAT4 = describeFormat(FORMAT4_IDENTITY, MIGRATIONS.slice(0, 4));
export const PREDECESSOR_FORMAT = FORMAT3;
// Proof: T3M1 the ordinary current opener admitted genuine format3 when its new descriptor dependency was replaced with the predecessor; exact restoration passed.
export const CURRENT_FORMAT = FORMAT4;

/** Requires exact compiled table/index declarations, including empty families. Additional triggers and unrelated tables are outside comparison. */
function validatePhysicalSchema(database: Database, format: FormatDescriptor): void {
  // Proof: predecessor-only filtering let an empty successor declaration reach DDL; the partial-successor upgrade test observed transition_failed instead of corrupt.
  const installed = readSchema(database).filter((entry) =>
    CURRENT_FORMAT.tables.has(entry.tbl_name),
  );
  // Proof: bypassing this comparison accepted all ten empty-store column, constraint and active-index corruptions in open-stores.db.test.ts.
  if (JSON.stringify(installed) !== JSON.stringify(format.schema))
    throw new Error('corrupt sqlite physical schema');
}

/** Configures each connection and rejects a driver/filesystem that cannot honor durability settings. */
export function configureDatabase(database: Database): void {
  database.run('PRAGMA busy_timeout=0');
  database.run('PRAGMA foreign_keys=ON');
  database.run('PRAGMA journal_mode=WAL');
  database.run('PRAGMA synchronous=FULL');
  const foreign = database.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get();
  const journal = database.query<{ journal_mode: string }, []>('PRAGMA journal_mode').get();
  const synchronous = database.query<{ synchronous: number }, []>('PRAGMA synchronous').get();
  // Proof: bypassing selected-mode verification accepted real injected foreign_keys OFF, journal DELETE and synchronous OFF settings.
  if (
    foreign?.foreign_keys !== 1 ||
    journal?.journal_mode !== 'wal' ||
    synchronous?.synchronous !== 2
  )
    throw new Error('sqlite required foreign_keys WAL FULL settings unavailable');
}
/** Reads required metadata rather than inventing an empty store. */
export function readMeta(database: Database) {
  return decodeMeta(
    database
      .query(
        'SELECT schema_version,migration_hash,down_hash,ownership,capacity,lease_milliseconds,last_observed_at FROM run_meta WHERE singleton=1',
      )
      .get(),
  );
}
/** Verifies the compiled physical schema and metadata identity before any predecessor witness conversion; performs no history reads or migration. */
export function validateSchemaIdentity(database: Database): void {
  validateFormatSchema(database, CURRENT_FORMAT);
}
/** Explicit transition validation only; the descriptor never comes from stored metadata or operator options. */
export function validateFormatSchema(database: Database, format: FormatDescriptor): void {
  // Proof: removing this dispatch accepted the same ten altered empty stores before row validation could detect them.
  // Proof: F23 bypassed physical schema validation for an empty runtime table; 'empty run_runtime_scope declaration' failed and exact restoration passed.
  validatePhysicalSchema(database, format);
  const meta = readMeta(database);
  // Proof: independently bypassing version, migration hash and down hash checks accepted each corresponding persisted alteration.
  if (
    meta.schema_version !== format.identity.version ||
    meta.migration_hash !== MIGRATION_HASH ||
    meta.down_hash !== DOWN_HASH
  )
    throw new Error('incompatible sqlite schema version or migration hash');
}

/** Validates the published store, including every portable record and relational invariant. No migration runs here. */
export function validateDatabase(database: Database): void {
  validateDatabaseForFormat(database, CURRENT_FORMAT);
}
/** Performs every original history/capacity/integrity audit against the required transition descriptor under its caller transaction. */
export function validateDatabaseForFormat(database: Database, format: FormatDescriptor): void {
  validateFormatSchema(database, format);
  const meta = readMeta(database);
  // Proof: F63 omitted runtime audit on reopen; 'trusted runtime scope ledger' failed and exact restoration passed.
  readRuntimeCatalogForFormat(database, meta.ownership, format);
  // Proof: bypassing this diagnostic accepted an injected non-ok SQLite integrity response through the real open path.
  if (database.query<{ quick_check: string }, []>('PRAGMA quick_check').get()?.quick_check !== 'ok')
    throw new Error('corrupt sqlite database');
  // Proof: bypassing this check accepted a real orphan reservation inserted with foreign keys disabled.
  if (database.query('PRAGMA foreign_key_check').all().length !== 0)
    throw new Error('corrupt sqlite foreign key references');
  // Proof: F211 removed this delegation; open with a missing pending outbox lost its required corruption rejection. Exact restoration passed the eight-case group.
  readHistoryForFormat(database, format);
  // Proof: bypassing this route failed `open rejects valid-shaped corrupt missing reservation`.
  readCapacity(database, meta.capacity);
}

/** Reads global capacity only when every held attempt has exactly its reservation and no settled or absent attempt has one. Call inside the caller's read snapshot or write transaction, before changing attempts. Corrupt correspondence is never repaired by a release. */
export function readCapacity(database: Database, limit: number) {
  // Proof: independently omitting missing-held, settled-reserved or orphan selection failed all six corresponding `rejects global` public-operation tests.
  const broken = database
    .query(
      `SELECT a.attempt_id FROM run_attempt a LEFT JOIN run_reservation r ON r.attempt_id=a.attempt_id WHERE json_extract(a.record,'$.holdsCapacity') IS NOT (r.attempt_id IS NOT NULL)
       UNION ALL
       SELECT r.attempt_id FROM run_reservation r LEFT JOIN run_attempt a ON a.attempt_id=r.attempt_id WHERE a.attempt_id IS NULL`,
    )
    .all();
  const reservations = database
    .query<{ count: number }, []>('SELECT count(*) AS count FROM run_reservation')
    .get();
  // Proof: bypassing correspondence enforcement failed all 18 `rejects global` tests; removing the ceiling failed `reservation counts above persisted capacity throw during reads and reopen`.
  if (
    broken.length !== 0 ||
    reservations === null ||
    !Number.isSafeInteger(reservations.count) ||
    reservations.count < 0 ||
    reservations.count > limit
  )
    throw new Error('corrupt sqlite capacity reservations');
  return { limit, reserved: reservations.count };
}

/** Inspects compatibility before any mode-changing connection configuration. Older formats remain byte-for-byte untouched. */
export function assertCompatibleFormat(database: Database): void {
  assertFormatCompatibility(database, CURRENT_FORMAT);
}
/** Readonly preflight for the explicit transition boundary. */
export function assertFormatCompatibility(database: Database, format: FormatDescriptor): void {
  const meta = readMeta(database);
  if (
    meta.schema_version !== format.identity.version ||
    meta.migration_hash !== MIGRATION_HASH ||
    meta.down_hash !== DOWN_HASH
  )
    throw new Error('incompatible sqlite schema version or migration hash');
}
