import type { Database } from 'bun:sqlite';

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
 * Reads the durable marker `20260927140000_add_organization_activation` seeds. Absent,
 * unreadable and malformed state each throw their own {@link OrganizationActivationRefused};
 * none defaults to `pre_activation`, because a lost marker would otherwise reopen an
 * organization-unaware downgrade after activation.
 *
 * @throws {OrganizationActivationRefused} `absent` when the table does not exist, `unreadable`
 * when SQLite cannot read the schema or the table, `malformed` unless exactly one consistent row.
 */
export function readOrganizationActivation(db: Database): OrganizationActivation {
  let tables: number | undefined;
  try {
    tables = db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'organization_activation'",
      )
      .get()?.n;
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
    rows = db
      .query<MarkerRow, []>(
        `SELECT singleton, state, activated_at, typeof(activated_at) AS activated_at_type
          FROM organization_activation`,
      )
      .all();
  } catch (cause) {
    // Proof: 2026-09-27, returning 'pre_activation' here made `refuses an unreadable marker
    // table` read a table whose columns are gone as not activated.
    throw new OrganizationActivationRefused(
      'unreadable',
      'organization activation marker is unreadable',
      { cause },
    );
  }
  const state = consistentState(rows);
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
function consistentState(rows: readonly MarkerRow[]): OrganizationActivation | undefined {
  const row = rows.at(0);
  if (rows.length !== 1 || row?.singleton !== 1) return undefined;
  if (row.state === 'pre_activation' && row.activated_at_type === 'null') return 'pre_activation';
  if (row.state === 'activated' && row.activated_at_type === 'integer') return 'activated';
  return undefined;
}
