import { existsSync } from 'node:fs';

import { openReadOnlyDatabase } from '@wbs/store-sqlite/db';

/**
 * The mcp-01 store migration that creates `mcp_credential_epoch`. be-01 cannot import mcp-01
 * (mcp-01 depends on be-01), so this name and the epoch semantics are mirrored from
 * `apps/wbs/mcp-01/src/store-migrations.ts`; a renamed migration there must be renamed here.
 */
export const MCP_EPOCH_MIGRATION = '20260927120000_mcp_credential_binding';

/** The epoch mcp-01's `credential-epoch-cli.ts` sets after revoking pre-activation credentials. */
export const ADVANCED_MCP_EPOCH = 1;

/** Why activation must wait for the MCP credential epoch advance (task 6.5). */
export interface McpEpochNotAdvanced {
  readonly refusal: 'mcp_epoch_not_advanced';
  readonly path: string;
  /** `absent`: no file; `unmigrated`: no ledger or no epoch migration; `epoch_0`: not advanced. */
  readonly reason: 'absent' | 'unmigrated' | 'epoch_0';
}

/**
 * Reads, without writing, whether the mcp-01 store at `path` has advanced its credential
 * epoch, which the organization activation must wait for. Returns `null` when the epoch is
 * {@link ADVANCED_MCP_EPOCH} or later. The epoch cannot decrease (mcp-01's store triggers), so a
 * store found advanced here stays advanced when the WBS marker commits afterwards. "Fully
 * migrated" is read as "holds the epoch migration": the epoch CLI refuses any store that is not
 * at its own release's newest migration, so an advanced epoch already implies that.
 *
 * @throws when the file exists but cannot be opened read-only, when the ledger records the
 *   epoch migration but the epoch table or its single row is missing, or when the epoch is not
 *   a non-negative integer. Trusted state is never read as a refusal or as advanced.
 */
export function readMcpEpochReadiness(path: string): McpEpochNotAdvanced | null {
  // Proof: 2026-10-22, without this branch `refuses an absent MCP store, writing nothing`
  // (organization-activation-cli.db.test.ts) exited 1 with SQLite's open error instead of 7.
  if (!existsSync(path)) return { refusal: 'mcp_epoch_not_advanced', path, reason: 'absent' };
  const db = openReadOnlyDatabase(path);
  try {
    const ledger = db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'mcp_migration'",
      )
      .get()?.n;
    const hasEpochMigration =
      ledger === 1 &&
      db
        .query<{ n: number }, [string]>('SELECT COUNT(*) AS n FROM mcp_migration WHERE name = ?')
        .get(MCP_EPOCH_MIGRATION)?.n === 1;
    // Proof: 2026-10-22, without this refusal `refuses an MCP store without the epoch migration`
    // (organization-activation-cli.db.test.ts) exited 1 on the missing epoch table instead of 7.
    if (!hasEpochMigration)
      return { refusal: 'mcp_epoch_not_advanced', path, reason: 'unmigrated' };
    const rows = db
      .query<{ singleton: unknown; epoch: unknown; kind: string }, []>(
        'SELECT singleton, epoch, typeof(epoch) AS kind FROM mcp_credential_epoch',
      )
      .all();
    const row = rows.at(0);
    // Proof: 2026-10-22, without this throw `throws on a malformed MCP epoch, writing nothing`
    // (organization-activation-cli.db.test.ts) activated over epoch 'one'.
    if (
      rows.length !== 1 ||
      row?.singleton !== 1 ||
      row.kind !== 'integer' ||
      typeof row.epoch !== 'number' ||
      !Number.isSafeInteger(row.epoch) ||
      row.epoch < 0
    )
      throw new Error(`MCP credential epoch in ${path} is missing or malformed`);
    // Proof: 2026-10-22, without this refusal `refuses activation while the MCP epoch is 0`
    // (organization-activation-cli.db.test.ts) activated and set the marker.
    return row.epoch < ADVANCED_MCP_EPOCH
      ? { refusal: 'mcp_epoch_not_advanced', path, reason: 'epoch_0' }
      : null;
  } finally {
    db.close();
  }
}
