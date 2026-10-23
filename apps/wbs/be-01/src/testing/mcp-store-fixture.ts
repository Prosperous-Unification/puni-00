import { openDatabase } from '@wbs/store-sqlite/db';

import { MCP_EPOCH_MIGRATION } from '../mcp-credential-epoch';

/**
 * Writes the part of an mcp-01 store that the activation CLI reads: the migration ledger with
 * the epoch migration and the singleton `mcp_credential_epoch` row at `epoch`. It is not a full
 * mcp-01 store; mcp-01's own tests (`credential-epoch.test.ts`) cover the real one.
 */
export function writeMcpStoreFixture(path: string, epoch: number | string = 1): void {
  const db = openDatabase(path);
  try {
    db.run(
      'CREATE TABLE mcp_migration (name TEXT PRIMARY KEY, up_sha256 TEXT NOT NULL, down_sha256 TEXT NOT NULL, applied_at INTEGER NOT NULL)',
    );
    db.run("INSERT INTO mcp_migration VALUES (?, 'fixture', 'fixture', 1)", [MCP_EPOCH_MIGRATION]);
    db.run('CREATE TABLE mcp_credential_epoch (singleton INTEGER PRIMARY KEY, epoch)');
    db.run('INSERT INTO mcp_credential_epoch (singleton, epoch) VALUES (1, ?)', [epoch]);
  } finally {
    db.close();
  }
}
