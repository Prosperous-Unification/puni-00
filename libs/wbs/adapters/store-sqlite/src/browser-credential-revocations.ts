import type { VerifiedOrganizationCredential } from '@wbs/contracts';
import { sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { Gate } from './gate';

interface StoredRevocation {
  readonly expires_at: number;
  readonly revoked_at: number;
}

function keyOf(credential: VerifiedOrganizationCredential): VerifiedOrganizationCredential {
  const kind: unknown = credential.kind;
  if (
    (kind !== 'native' && kind !== 'oidc') ||
    credential.userId.length === 0 ||
    !/^[0-9a-f]{64}$/.test(credential.digest) ||
    !Number.isSafeInteger(credential.expiresAt) ||
    credential.expiresAt < 0
  )
    throw new Error('verified browser credential key is malformed');
  return credential;
}

function storedExpiry(row: StoredRevocation): number {
  if (
    !Number.isSafeInteger(row.expires_at) ||
    row.expires_at < 0 ||
    !Number.isSafeInteger(row.revoked_at) ||
    row.revoked_at < 0
  )
    throw new Error('stored browser credential revocation is malformed');
  return row.expires_at;
}

/**
 * Shared, monotonic authority for one exact verified browser credential.
 * Reads never use a process-local negative cache; absence means unrevoked only
 * after the migrated table answers successfully. Rows are never pruned.
 */
export class SqliteBrowserCredentialRevocations {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** Commits once; repeat revocations preserve the original timestamp. */
  async revoke(credential: VerifiedOrganizationCredential, revokedAt: number): Promise<void> {
    const key = keyOf(credential);
    if (!Number.isSafeInteger(revokedAt) || revokedAt < 0)
      throw new Error('browser credential revocation time is malformed');
    // Proof: replacing this committed write with a return made the read-only
    // connection test acknowledge a revocation it could not persist.
    await this.gate.enter(() => {
      this.db.transaction((tx) => {
        // Proof: replacing the insert with a no-op made the read-after-write
        // cross-connection test accept an old credential; watched 2026-10-01.
        tx.run(sql`INSERT INTO browser_credential_revocations
            (kind, user_id, credential_digest, expires_at, revoked_at)
            VALUES (${key.kind}, ${key.userId}, ${key.digest}, ${key.expiresAt}, ${revokedAt})
            ON CONFLICT (kind, user_id, credential_digest) DO NOTHING`);
        const rows = tx.all<StoredRevocation>(sql`SELECT expires_at, revoked_at
            FROM browser_credential_revocations
            WHERE kind = ${key.kind} AND user_id = ${key.userId}
              AND credential_digest = ${key.digest}`);
        if (rows.length !== 1 || storedExpiry(rows[0]) !== key.expiresAt)
          throw new Error('browser credential revocation disagrees with verified expiry');
      });
      return Promise.resolve();
    });
  }

  /** Checks shared storage on every call; store faults propagate. */
  isRevoked(credential: VerifiedOrganizationCredential): Promise<boolean> {
    const key = keyOf(credential);
    return Promise.resolve().then(() => {
      // Proof: widening this lookup to user_id made the distinct-digest
      // credential in the cross-connection test look revoked; watched
      // 2026-10-01. Returning false without reading made the mounted old
      // pair answer 200, and the missing-table test lose its 500.
      const rows = this.db.all<StoredRevocation>(sql`SELECT expires_at, revoked_at
        FROM browser_credential_revocations
        WHERE kind = ${key.kind} AND user_id = ${key.userId}
          AND credential_digest = ${key.digest}`);
      if (rows.length === 0) return false;
      if (rows.length !== 1 || storedExpiry(rows[0]) !== key.expiresAt)
        throw new Error('browser credential revocation disagrees with verified expiry');
      return true;
    });
  }
}
