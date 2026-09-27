import { createHash } from 'node:crypto';

import { Database } from 'bun:sqlite';

import refreshFamilyDown from '../drizzle/20260921090000_mcp_refresh_family/down.sql' with { type: 'text' };
import refreshFamilyUp from '../drizzle/20260921090000_mcp_refresh_family/migration.sql' with { type: 'text' };
import credentialBindingDown from '../drizzle/20260927120000_mcp_credential_binding/down.sql' with { type: 'text' };
import credentialBindingUp from '../drizzle/20260927120000_mcp_credential_binding/migration.sql' with { type: 'text' };

/**
 * One paired migration of the durable MCP store. `preflightDown` runs inside the rollback's
 * IMMEDIATE transaction before `down` and throws to refuse the reversal.
 */
export interface McpStoreMigration {
  readonly name: string;
  readonly up: string;
  readonly down: string;
  readonly preflightDown?: (db: Database, now: number) => void;
}

/** A store whose schema, ledger or epoch this code cannot trust; startup and rollback stop. */
export class McpStoreRefused extends Error {}

/** The newest credential epoch this organization-unaware release understands. */
export const SUPPORTED_CREDENTIAL_EPOCH = 0;

const BASELINE = '20260921090000_mcp_refresh_family';
const LEDGER = `CREATE TABLE mcp_migration (
  name TEXT PRIMARY KEY,
  up_sha256 TEXT NOT NULL,
  down_sha256 TEXT NOT NULL,
  applied_at INTEGER NOT NULL
)`;

/**
 * Refuses the binding migration's reversal while a new-format credential could still be used:
 * an advanced epoch, a usable bound family (checked on its own, because a family without
 * sessions still holds a refresh token), or a live bound session of an unrevoked family.
 */
function preflightCredentialBindingDown(db: Database, now: number): void {
  const epoch = readCredentialEpoch(db);
  // Proof: 2026-09-27, each of these three checks removed in turn made its `MCP store rollback`
  // test (advanced epoch, bound family without sessions, live bound session) roll back.
  if (epoch !== 0)
    throw new McpStoreRefused(`MCP store rollback refused: credential epoch is ${String(epoch)}`);
  const newFormat = `(organization_id IS NOT NULL OR user_id IS NOT NULL OR issuer IS NOT NULL
    OR credential_epoch > 0)`;
  const usableFamilies = db
    .query<{ n: number }, [number, number]>(
      `SELECT COUNT(*) AS n FROM mcp_family WHERE ${newFormat} AND revoked_at IS NULL
        AND idle_expires_at > ? AND absolute_expires_at > ?`,
    )
    .get(now, now)?.n;
  const liveSessions = db
    .query<{ n: number }, [number]>(
      `SELECT COUNT(*) AS n FROM mcp_session s JOIN mcp_family f USING (family_id)
        WHERE (s.organization_id IS NOT NULL OR s.user_id IS NOT NULL OR s.issuer IS NOT NULL
          OR s.credential_epoch > 0) AND s.expires_at > ? AND f.revoked_at IS NULL`,
    )
    .get(now)?.n;
  if (usableFamilies !== 0 || liveSessions !== 0)
    throw new McpStoreRefused(
      `MCP store rollback refused: ${String(usableFamilies)} usable bound families and ` +
        `${String(liveSessions)} live bound sessions must be revoked or expire first`,
    );
}

/** The ordered, bundled manifest; history on disk must be an exact prefix of it. */
export const MCP_STORE_MIGRATIONS: readonly McpStoreMigration[] = [
  { name: BASELINE, up: refreshFamilyUp, down: refreshFamilyDown },
  {
    name: '20260927120000_mcp_credential_binding',
    up: credentialBindingUp,
    down: credentialBindingDown,
    preflightDown: preflightCredentialBindingDown,
  },
];

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

interface SchemaObject {
  readonly type: string;
  readonly name: string;
  readonly sql: string;
}

function userSchema(db: Database): SchemaObject[] {
  return db
    .query<{ type: string; name: string; sql: string | null }, []>(
      `SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
    )
    .all()
    .map((row) => ({
      type: row.type,
      name: row.name,
      sql: (row.sql ?? '')
        .replace(/\bIF NOT EXISTS\b/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    }));
}

/**
 * True only when `db` holds exactly the objects `migrations` create, plus the ledger when
 * `withLedger`: every table, column, constraint, index and trigger, and nothing else. The
 * pre-ledger constructor created the baseline with `IF NOT EXISTS`; SQLite drops that clause
 * from `sqlite_master` (the dev store confirms it), and stripping it too is a harmless guard.
 */
function matchesMigrations(
  db: Database,
  migrations: readonly McpStoreMigration[],
  withLedger: boolean,
): boolean {
  const reference = new Database(':memory:');
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- multi-statement migration text
    if (withLedger) reference.exec(LEDGER);
    for (const migration of migrations) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- multi-statement migration text
      reference.exec(migration.up);
    }
    return JSON.stringify(userSchema(db)) === JSON.stringify(userSchema(reference));
  } finally {
    reference.close();
  }
}

/** Refuses a ledgered store whose objects differ from what its recorded migrations create. */
function assertSchemaMatchesHistory(
  db: Database,
  migrations: readonly McpStoreMigration[],
  applied: number,
): void {
  // Proof: 2026-09-27, with this check removed `refuses a ledgered store whose schema drifted`
  // opened a store without mcp_refresh and one with an unconstrained epoch table.
  if (!matchesMigrations(db, migrations.slice(0, applied), true))
    throw new McpStoreRefused('MCP store schema differs from the migrations its ledger records');
}

interface LedgerRow {
  readonly name: string;
  readonly up_sha256: string;
  readonly down_sha256: string;
}

function hasLedger(db: Database): boolean {
  return (
    db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'mcp_migration'",
      )
      .get()?.n === 1
  );
}

/** Applied history, verified to be an exact, unedited prefix of `migrations`. */
function verifiedHistory(
  db: Database,
  migrations: readonly McpStoreMigration[],
): readonly LedgerRow[] {
  const rows = db
    .query<LedgerRow, []>('SELECT name, up_sha256, down_sha256 FROM mcp_migration ORDER BY name')
    .all();
  for (const [index, row] of rows.entries()) {
    const expected = migrations.at(index);
    // Proof: 2026-09-27, both checks removed in turn made `refuses edited SQL and unknown history`
    // fail: an edited migration opened, and a longer history crashed instead of refusing.
    if (expected?.name !== row.name)
      throw new McpStoreRefused(
        `MCP store history is not a prefix of this release's migrations at ${row.name}`,
      );
    if (row.up_sha256 !== sha256(expected.up) || row.down_sha256 !== sha256(expected.down))
      throw new McpStoreRefused(`MCP store migration ${row.name} was edited after it was applied`);
  }
  return rows;
}

function record(db: Database, migration: McpStoreMigration): void {
  db.query(
    'INSERT INTO mcp_migration (name, up_sha256, down_sha256, applied_at) VALUES (?, ?, ?, ?)',
  ).run(migration.name, sha256(migration.up), sha256(migration.down), Date.now());
}

/**
 * Brings the store to the newest migration under one IMMEDIATE transaction, so concurrent
 * startups apply each migration once and a failed statement leaves neither schema nor ledger
 * changes. Only a file this startup `created` may be built from nothing: an existing empty file
 * is a partial store (or another initializer's unfinished one) and refuses rather than being
 * reinitialized. A pre-ledger store is adopted only when it is exactly the baseline. Unknown
 * history, an edited migration or a partial schema throws.
 *
 * Creating an absent store is a pre-activation compatibility exception (task 1.6); activation
 * work must withdraw it before the credential epoch advances.
 *
 * @throws {McpStoreRefused} when the store cannot be trusted as a prefix of `migrations`.
 */
export function migrateMcpStore(
  db: Database,
  created: boolean,
  migrations: readonly McpStoreMigration[] = MCP_STORE_MIGRATIONS,
): void {
  const baseline = migrations.at(0);
  if (baseline === undefined) throw new Error('MCP store manifest is empty');
  db.transaction(() => {
    if (!hasLedger(db)) {
      const empty = userSchema(db).length === 0;
      // Proof: 2026-09-27, with this guard removed `refuses an existing zero-byte file instead of
      // initializing it` failed: the constructor initialized the existing empty file.
      if (empty && !created)
        throw new McpStoreRefused(
          'MCP store exists but is empty; it was not created by this start',
        );
      // Proof: 2026-09-27, with the comparison removed `refuses a partial pre-ledger store` failed:
      // the partial store was adopted and only the later history check refused it, as drift.
      if (!empty && !matchesMigrations(db, [baseline], false))
        throw new McpStoreRefused(
          'MCP store has no migration ledger and is not exactly the baseline schema',
        );
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- multi-statement DDL
      db.exec(LEDGER);
      if (empty) {
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- multi-statement DDL
        db.exec(baseline.up);
      }
      record(db, baseline);
    }
    const applied = verifiedHistory(db, migrations).length;
    assertSchemaMatchesHistory(db, migrations, applied);
    for (const migration of migrations.slice(applied)) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- multi-statement DDL
      db.exec(migration.up);
      record(db, migration);
    }
  }).immediate();
}

/**
 * Reverses every migration after `to`, newest first, under one IMMEDIATE transaction: history
 * and checksums are verified, each migration's preflight runs before its `down`, and ledger
 * removal commits with the reversal. Callers must fence mcp-01 startup while this runs.
 *
 * @throws {McpStoreRefused} when history is untrusted, `to` is unknown or a preflight refuses.
 */
export function rollbackMcpStore(
  db: Database,
  to: string,
  now: number,
  migrations: readonly McpStoreMigration[] = MCP_STORE_MIGRATIONS,
): readonly string[] {
  return db
    .transaction(() => {
      if (!hasLedger(db)) throw new McpStoreRefused('MCP store has no migration ledger');
      const applied = verifiedHistory(db, migrations);
      assertSchemaMatchesHistory(db, migrations, applied.length);
      const keep = applied.findIndex((row) => row.name === to);
      if (keep === -1) throw new McpStoreRefused(`MCP store has not applied ${to}`);
      const reversed: string[] = [];
      for (const migration of migrations.slice(keep + 1, applied.length).reverse()) {
        migration.preflightDown?.(db, now);
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- multi-statement DDL
        db.exec(migration.down);
        db.query('DELETE FROM mcp_migration WHERE name = ?').run(migration.name);
        reversed.push(migration.name);
      }
      return reversed;
    })
    .immediate();
}

/**
 * Reads the durable credential epoch. Organization-aware code must call this again at code
 * exchange, tool calls and refresh; startup validation alone does not cover a running process.
 *
 * @throws {McpStoreRefused} when the table or its single row is missing, unreadable or malformed.
 */
export function readCredentialEpoch(db: Database): number {
  let rows: { singleton: unknown; epoch: unknown; kind: string }[];
  try {
    rows = db
      .query<{ singleton: unknown; epoch: unknown; kind: string }, []>(
        'SELECT singleton, epoch, typeof(epoch) AS kind FROM mcp_credential_epoch',
      )
      .all();
  } catch (cause) {
    // Proof: 2026-09-27, returning 0 here made `refuses an unreadable epoch table instead of
    // defaulting it` read epoch 0 from a database without the table.
    throw new McpStoreRefused('MCP credential epoch is unreadable', { cause });
  }
  const row = rows.at(0);
  // Proof: 2026-09-27, dropping this throw made `refuses startup on a malformed value without
  // reseeding` fail with the unsupported-epoch message for epoch 'zero' instead.
  if (
    rows.length !== 1 ||
    row?.singleton !== 1 ||
    row.kind !== 'integer' ||
    typeof row.epoch !== 'number' ||
    !Number.isSafeInteger(row.epoch) ||
    row.epoch < 0
  )
    throw new McpStoreRefused('MCP credential epoch is missing or malformed');
  return row.epoch;
}
