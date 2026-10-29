import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import { hasTable, isMigrationApplied } from './migration-ledger';

/** Whether organization isolation was enabled on this database. */
export type OrganizationActivation = 'pre_activation' | 'activated';

/** Which way the trusted marker is broken; each needs a different operator response. */
export type BrokenActivationMarker = 'absent' | 'unreadable' | 'malformed';

/**
 * The activation marker cannot be trusted, so activation, bridge writes and routing decisions
 * that depend on it must stop. It never means "not activated".
 */
export class OrganizationActivationRefused extends Error {
  constructor(
    readonly marker: BrokenActivationMarker,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

interface MarkerRow {
  readonly singleton: unknown;
  readonly state: unknown;
  readonly activated_at: unknown;
  readonly activated_at_type: string;
}

/**
 * Reads the durable marker `20260927180000_add_organization_activation` seeds. Absent,
 * unreadable and malformed state each throw their own {@link OrganizationActivationRefused};
 * none defaults to `pre_activation`, because a lost marker would otherwise reopen an
 * organization-unaware downgrade after activation.
 *
 * @throws {OrganizationActivationRefused} `absent` when the table does not exist, `unreadable`
 * when SQLite cannot read the schema or the table, `malformed` unless exactly one consistent row.
 */
export function readOrganizationActivation(db: Pick<Drizzle, 'all'>): OrganizationActivation {
  let tables: number | undefined;
  try {
    tables = db
      .all<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'organization_activation'`,
      )
      .at(0)?.n;
  } catch (cause) {
    // Proof: 2026-09-27, returning 'pre_activation' here made `refuses an unreadable database`
    // read a file that is not SQLite as not activated.
    throw new OrganizationActivationRefused(
      'unreadable',
      'organization activation marker is unreadable: the schema cannot be read',
      { cause },
    );
  }
  // Proof: 2026-09-27, returning 'pre_activation' here made `refuses an absent marker table`
  // read a database without the table as not activated.
  if (tables !== 1)
    throw new OrganizationActivationRefused(
      'absent',
      'organization activation marker is absent: organization_activation does not exist',
    );
  let rows: MarkerRow[];
  try {
    rows = db.all<MarkerRow>(
      sql`SELECT singleton, state, activated_at, typeof(activated_at) AS activated_at_type
        FROM organization_activation`,
    );
  } catch (cause) {
    // Proof: 2026-09-27, returning 'pre_activation' here made `refuses an unreadable marker
    // table` read a table whose columns are gone as not activated.
    throw new OrganizationActivationRefused(
      'unreadable',
      'organization activation marker is unreadable',
      { cause },
    );
  }
  const state = parseActivationState(rows);
  // Proof: 2026-09-27, returning 'pre_activation' here failed all seven `refuses a malformed
  // marker` cases; removing the row-count, singleton, null-time or integer-time test alone failed
  // its own case (second row, wrong singleton, time before activation, text or missing time).
  if (state === undefined)
    throw new OrganizationActivationRefused(
      'malformed',
      `organization activation marker is malformed: ${String(rows.length)} rows, expected one consistent row`,
    );
  return state;
}

/** The state of exactly one row whose key, state and timestamp agree, else `undefined`. */
function parseActivationState(rows: readonly MarkerRow[]): OrganizationActivation | undefined {
  const row = rows.at(0);
  if (rows.length !== 1 || row?.singleton !== 1) return undefined;
  if (row.state === 'pre_activation' && row.activated_at_type === 'null') return 'pre_activation';
  if (row.state === 'activated' && row.activated_at_type === 'integer') return 'activated';
  return undefined;
}

/** The migration that creates and seeds the marker, by its ledger name. */
export const ORGANIZATION_ACTIVATION_MIGRATION = '20260927180000_add_organization_activation';

/**
 * The activation state of a store a deploy has not migrated yet: what
 * {@link readOrganizationActivation} reads, or `not_migrated` when the ledger
 * proves {@link ORGANIZATION_ACTIVATION_MIGRATION} never ran, so the migration
 * about to run seeds `pre_activation`. Only that proof reads as not activated.
 *
 * @throws {OrganizationActivationRefused} as {@link readOrganizationActivation}
 * does, including `absent` when the ledger records the migration but the
 * table is gone; and when the ledger itself is absent.
 */
export function readOrganizationActivationBeforeMigration(
  db: Pick<Drizzle, 'all'>,
): OrganizationActivation | 'not_migrated' {
  // Proof: with this whole condition replaced by `false`, `reads a store the
  // marker migration has not reached as not migrated`
  // (mcp-service-settings-check-cli.db.test.ts) exited with the absent-marker
  // refusal; with only the ledger test dropped, `refuses a ledger that names
  // the marker migration without its table` exited 0; watched 2026-10-28.
  if (
    !hasTable(db, 'organization_activation') &&
    !isMigrationApplied(db, ORGANIZATION_ACTIVATION_MIGRATION)
  )
    return 'not_migrated';
  return readOrganizationActivation(db);
}
