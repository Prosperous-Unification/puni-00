import { Database, SQLiteError } from 'bun:sqlite';

import {
  ACTIVATED_CREDENTIAL_EPOCH,
  assertMcpStoreCurrent,
  McpStoreRefused,
  readCredentialEpoch,
} from './store-migrations';

/** Another connection, normally a running mcp-01, has the store open; nothing was changed. */
export class McpStoreInUse extends Error {}

/** What advancing to the activated epoch revoked, or would revoke in a dry run. */
export interface EpochRevocation {
  readonly from: 0;
  readonly to: typeof ACTIVATED_CREDENTIAL_EPOCH;
  readonly revokedFamilies: number;
  readonly removedSessions: number;
}

export type CredentialEpochAdvance =
  | ({ readonly outcome: 'planned' | 'advanced' } & EpochRevocation)
  | { readonly outcome: 'already_activated'; readonly epoch: typeof ACTIVATED_CREDENTIAL_EPOCH };

/**
 * Advances the MCP store at `path` from epoch 0 to {@link ACTIVATED_CREDENTIAL_EPOCH} in one
 * IMMEDIATE transaction: every unrevoked epoch-0 refresh family gets `revoked_at = now`, every
 * epoch-0 session is deleted (as `revokeFamily` does), and the epoch row moves to 1. Without
 * `isApplied` the same transaction runs and is rolled back, so the counts are what an apply at
 * this instant would revoke. At epoch 1 it changes nothing and says so. Epoch 1 is one-way: the
 * epoch triggers refuse a decrease, and the store rollback refuses any epoch but 0.
 *
 * The connection uses `locking_mode = EXCLUSIVE` with no busy wait. On a WAL store a
 * connection holds a shared lock from its first statement until it closes, idle or not, so the
 * first write lock fails with `SQLITE_BUSY` while any process on this host has read or written
 * the store through a still-open connection. A connection that was opened but never used holds
 * nothing and is not seen. `McpSessionStore`'s constructor always runs statements
 * (pragmas, migration, epoch read), so a running mcp-01 is always seen, and an mcp-01 that
 * starts during the advance cannot read the store until the advance ends.
 * This proves the store has no live writer at that instant; it does not stop a later restart
 * of an organization-unaware release, which the advanced epoch itself refuses at startup.
 * The store must be WAL (mcp-01 always switches it), because a rollback-journal connection
 * holds no lock while idle and the guard could not see it.
 *
 * @throws {McpStoreInUse} when another connection holds the store.
 * @throws {McpStoreRefused} when the store is not exactly this release's schema, is not WAL,
 *   or holds an epoch other than 0 or 1.
 * Opening an absent or unreadable path throws SQLite's own error; the path is never created.
 */
export function advanceCredentialEpoch(
  path: string,
  now: number,
  isApplied: boolean,
): CredentialEpochAdvance {
  const db = new Database(path, { create: false, readwrite: true, strict: true });
  try {
    db.run('PRAGMA busy_timeout = 0');
    // Proof: 2026-10-21, without exclusive locking `refuses while an mcp-01 process has the
    // store open` (credential-epoch.test.ts) advanced the epoch under the running child process.
    db.run('PRAGMA locking_mode = EXCLUSIVE');
    try {
      db.run('BEGIN IMMEDIATE');
    } catch (cause) {
      if (cause instanceof SQLiteError && cause.code === 'SQLITE_BUSY')
        throw new McpStoreInUse(`MCP store ${path} is open in another process; drain mcp-01`, {
          cause,
        });
      throw cause;
    }
    try {
      const advance = advanceInTransaction(db, now);
      db.run(isApplied && advance.outcome === 'planned' ? 'COMMIT' : 'ROLLBACK');
      return isApplied && advance.outcome === 'planned'
        ? { ...advance, outcome: 'advanced' }
        : advance;
    } catch (cause) {
      db.run('ROLLBACK');
      throw cause;
    }
  } finally {
    db.close();
  }
}

function advanceInTransaction(db: Database, now: number): CredentialEpochAdvance {
  const journal = db.query<{ journal_mode: string }, []>('PRAGMA journal_mode').get();
  // Proof: 2026-10-21, without this refusal `refuses a store that is not in WAL mode`
  // (credential-epoch.test.ts) advanced a rollback-journal store.
  if (journal?.journal_mode !== 'wal')
    throw new McpStoreRefused(
      `MCP store journal mode is ${String(journal?.journal_mode)}, not wal; the in-use guard needs WAL`,
    );
  // Proof: 2026-10-21, without this check `refuses a store this release has not migrated`
  // (credential-epoch.test.ts) advanced a store missing the client migration.
  assertMcpStoreCurrent(db);
  const epoch = readCredentialEpoch(db);
  if (epoch === ACTIVATED_CREDENTIAL_EPOCH)
    return { outcome: 'already_activated', epoch: ACTIVATED_CREDENTIAL_EPOCH };
  // Proof: 2026-10-21, without this refusal `refuses an epoch it does not know`
  // (credential-epoch.test.ts) threw the epoch trigger's `cannot decrease`, not McpStoreRefused.
  if (epoch !== 0) throw new McpStoreRefused(`MCP credential epoch ${String(epoch)} is not 0 or 1`);
  const revokedFamilies = db
    .query('UPDATE mcp_family SET revoked_at = ? WHERE credential_epoch = 0 AND revoked_at IS NULL')
    .run(now).changes;
  // Proof: 2026-10-21, skipping this delete and the revocation above in turn made `revokes every
  // pre-activation family and session` and the CLI's `dry-runs, applies once…` case
  // (credential-epoch.test.ts) fail. Not proof: with both skipped, the Red case `refuses access
  // and refresh after the epoch advance, …` still passes, because the per-query epoch
  // comparison in session-store.ts refuses those credentials on its own. The revocation is
  // proven by the two state tests only, and kept because the spec requires durable revocation.
  const removedSessions = db
    .query('DELETE FROM mcp_session WHERE credential_epoch = 0')
    .run().changes;
  db.query('UPDATE mcp_credential_epoch SET epoch = ? WHERE singleton = 1').run(
    ACTIVATED_CREDENTIAL_EPOCH,
  );
  return {
    outcome: 'planned',
    from: 0,
    to: ACTIVATED_CREDENTIAL_EPOCH,
    revokedFamilies,
    removedSessions,
  };
}
