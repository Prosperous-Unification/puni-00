import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { Database } from 'bun:sqlite';

const VERSION = 1;
const NONCE_BYTES = 12;
type Row = Record<string, string | number | Uint8Array | null>;

export interface FamilyInput {
  readonly familyId: string;
  readonly clientId: string;
  readonly subject: string;
  readonly scope: string;
  readonly upstreamAccessToken: string;
  readonly upstreamRefreshToken?: string;
  readonly upstreamExpiresAt: number;
  readonly idleExpiresAt: number;
  readonly absoluteExpiresAt: number;
}
export interface FamilyRecord extends FamilyInput {
  readonly upstreamRefreshedAt: number | null;
  readonly revokedAt: number | null;
  readonly leaseOwner: string | null;
  readonly leaseUntil: number | null;
  readonly version: number;
}
export type RefreshResult =
  | { readonly outcome: 'ok'; readonly family: FamilyRecord }
  | { readonly outcome: 'invalid' | 'reuse' };

/** Durable, process-shared authority for MCP refresh families and sessions. */
export class McpSessionStore {
  private readonly db: Database;

  constructor(
    path: string,
    private readonly keys: readonly Buffer[],
  ) {
    if (keys.length === 0 || keys.some((key) => key.length !== 32))
      throw new Error('MCP_STORE_KEY_CURRENT must decode to exactly 32 bytes');
    try {
      this.db = new Database(path, { create: true, strict: true });
      this.db.run('PRAGMA busy_timeout = 5000');
      this.db.run('PRAGMA journal_mode = WAL');
      this.db.run('PRAGMA foreign_keys = ON');
      this.db.run('PRAGMA synchronous = FULL');
      // Bun deprecates exec, but run accepts one statement and this startup migration is intentionally atomic text.
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- multi-statement schema boundary
      this.db.exec(SCHEMA);
    } catch (cause) {
      throw new Error(`MCP_STORE_PATH is unreadable or corrupt: ${path}`, { cause });
    }
  }

  close(): void {
    this.db.close();
  }

  createFamily(
    input: FamilyInput,
    jti: string,
    sessionExpiresAt: number,
    refreshToken: string,
  ): void {
    this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO mcp_family (
        family_id, client_id, subject, scope, upstream_access_ct, upstream_refresh_ct,
        upstream_expires_at, idle_expires_at, absolute_expires_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        )
        .run(
          input.familyId,
          input.clientId,
          input.subject,
          input.scope,
          this.encrypt(input.familyId, 'upstream_access_ct', input.upstreamAccessToken),
          input.upstreamRefreshToken === undefined
            ? null
            : this.encrypt(input.familyId, 'upstream_refresh_ct', input.upstreamRefreshToken),
          input.upstreamExpiresAt,
          input.idleExpiresAt,
          input.absoluteExpiresAt,
        );
      this.insertSession(jti, input.familyId, sessionExpiresAt);
      this.insertRefresh(refreshToken, input.familyId, input.absoluteExpiresAt);
    })();
  }

  familyForSession(jti: string, now: number): FamilyRecord | null {
    const row = this.db
      .query(
        `SELECT f.* FROM mcp_session s JOIN mcp_family f USING (family_id)
      WHERE s.jti = ? AND s.expires_at > ? AND f.revoked_at IS NULL
        AND f.idle_expires_at > ? AND f.absolute_expires_at > ?`,
      )
      .get(jti, now, now, now) as Row | null;
    return row === null ? null : this.familyOf(row);
  }

  consumeRefresh(
    token: string,
    clientId: string,
    successor: string,
    jti: string,
    sessionExpiresAt: number,
    idleExpiresAt: number,
    now: number,
  ): RefreshResult {
    const result = this.db.transaction(() => {
      const digest = digestOf(token);
      const row = this.db
        .query(
          `SELECT r.family_id, r.consumed_at, r.expires_at, f.*
        FROM mcp_refresh r JOIN mcp_family f USING (family_id) WHERE r.token_digest = ?`,
        )
        .get(digest) as Row | null;
      if (row === null) return { outcome: 'invalid' as const };
      const familyId = String(row['family_id']);
      if (String(row['client_id']) !== clientId) return { outcome: 'invalid' as const };
      if (row['consumed_at'] !== null) {
        this.revokeFamily(familyId, now);
        return { outcome: 'reuse' as const };
      }
      if (
        Number(row['expires_at']) <= now ||
        row['revoked_at'] !== null ||
        Number(row['idle_expires_at']) <= now ||
        Number(row['absolute_expires_at']) <= now
      )
        return { outcome: 'invalid' as const };
      this.db
        .query('UPDATE mcp_refresh SET consumed_at = ? WHERE token_digest = ?')
        .run(now, digest);
      const boundedIdle = Math.min(idleExpiresAt, Number(row['absolute_expires_at']));
      this.db
        .query('UPDATE mcp_family SET idle_expires_at = ? WHERE family_id = ?')
        .run(boundedIdle, familyId);
      this.insertRefresh(successor, familyId, Number(row['absolute_expires_at']));
      this.insertSession(
        jti,
        familyId,
        Math.min(sessionExpiresAt, Number(row['absolute_expires_at'])),
      );
      return {
        outcome: 'row' as const,
        row: { ...row, idle_expires_at: boundedIdle },
      };
    })();
    if (result.outcome !== 'row') return result;
    // Decrypt only after the write transaction commits. If authentication fails,
    // familyOf's revocation must survive instead of being rolled back with it.
    return { outcome: 'ok', family: this.familyOf(result.row) };
  }

  prepareRefresh(token: string, clientId: string, now: number): RefreshResult {
    const row = this.db
      .query(
        `SELECT r.family_id, r.consumed_at, r.expires_at, f.*
        FROM mcp_refresh r JOIN mcp_family f USING (family_id) WHERE r.token_digest = ?`,
      )
      .get(digestOf(token)) as Row | null;
    if (row === null || String(row['client_id']) !== clientId)
      return { outcome: 'invalid' };
    const familyId = String(row['family_id']);
    if (row['consumed_at'] !== null) {
      this.revokeFamily(familyId, now);
      return { outcome: 'reuse' };
    }
    if (
      Number(row['expires_at']) <= now ||
      row['revoked_at'] !== null ||
      Number(row['idle_expires_at']) <= now ||
      Number(row['absolute_expires_at']) <= now
    )
      return { outcome: 'invalid' };
    return { outcome: 'ok', family: this.familyOf(row) };
  }

  sessionCount(now: number): number {
    this.db.query('DELETE FROM mcp_session WHERE expires_at <= ?').run(now);
    const row = this.db.query('SELECT COUNT(*) AS count FROM mcp_session').get() as {
      count: number;
    };
    return row.count;
  }

  endSession(jti: string): void {
    this.db.query('DELETE FROM mcp_session WHERE jti = ?').run(jti);
  }

  revokeSessionFamily(jti: string, now: number): void {
    const row = this.db
      .query('SELECT family_id FROM mcp_session WHERE jti = ?')
      .get(jti) as { family_id: string } | null;
    if (row !== null) this.revokeFamily(row.family_id, now);
  }

  revokeFamily(familyId: string, now: number): void {
    this.db.transaction(() => {
      this.db
        .query('UPDATE mcp_family SET revoked_at = COALESCE(revoked_at, ?) WHERE family_id = ?')
        .run(now, familyId);
      this.db.query('DELETE FROM mcp_session WHERE family_id = ?').run(familyId);
    })();
  }

  acquireRefreshLease(
    familyId: string,
    expectedVersion: number,
    owner: string,
    now: number,
    until: number,
  ): FamilyRecord | null {
    const row = this.db.transaction(() => {
      const current = this.db
        .query('SELECT * FROM mcp_family WHERE family_id = ?')
        .get(familyId) as Row | null;
      if (current === null) return null;
      if (current['revoked_at'] !== null) return null;
      const changed = this.db
        .query(
          `UPDATE mcp_family SET lease_owner = ?, lease_until = ?, version = version + 1
        WHERE family_id = ? AND version = ? AND (lease_until IS NULL OR lease_until < ?)`,
        )
        .run(owner, until, familyId, expectedVersion, now);
      return changed.changes === 1
        ? this.db.query('SELECT * FROM mcp_family WHERE family_id = ?').get(familyId)
        : null;
    })() as Row | null;
    return row === null ? null : this.familyOf(row);
  }

  finishRefreshLease(
    familyId: string,
    owner: string,
    accessToken: string,
    refreshToken: string | undefined,
    expiresAt: number,
    refreshedAt: number,
  ): boolean {
    const current = this.db
      .query('SELECT upstream_refresh_ct FROM mcp_family WHERE family_id = ?')
      .get(familyId) as Row | null;
    if (current === null) return false;
    const refreshCiphertext =
      refreshToken === undefined
        ? current['upstream_refresh_ct']
        : this.encrypt(familyId, 'upstream_refresh_ct', refreshToken);
    const changed = this.db
      .query(
        `UPDATE mcp_family SET upstream_access_ct = ?, upstream_refresh_ct = ?,
      upstream_expires_at = ?, upstream_refreshed_at = ?, lease_owner = NULL, lease_until = NULL,
      version = version + 1 WHERE family_id = ? AND lease_owner = ? AND revoked_at IS NULL`,
      )
      .run(
        this.encrypt(familyId, 'upstream_access_ct', accessToken),
        refreshCiphertext,
        expiresAt,
        refreshedAt,
        familyId,
        owner,
      );
    return changed.changes === 1;
  }

  family(familyId: string): FamilyRecord | null {
    const row = this.db
      .query('SELECT * FROM mcp_family WHERE family_id = ?')
      .get(familyId) as Row | null;
    return row === null ? null : this.familyOf(row);
  }

  private insertSession(jti: string, familyId: string, expiresAt: number): void {
    this.db
      .query('INSERT INTO mcp_session (jti, family_id, expires_at) VALUES (?, ?, ?)')
      .run(jti, familyId, expiresAt);
  }
  private insertRefresh(token: string, familyId: string, expiresAt: number): void {
    this.db
      .query('INSERT INTO mcp_refresh (token_digest, family_id, expires_at) VALUES (?, ?, ?)')
      .run(digestOf(token), familyId, expiresAt);
  }

  private encrypt(familyId: string, column: string, plaintext: string): Buffer {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.keys[0], nonce);
    cipher.setAAD(Buffer.from(`${familyId}\0${column}`));
    return Buffer.concat([
      Buffer.from([VERSION]),
      nonce,
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
  }

  private decrypt(familyId: string, column: string, stored: unknown): string {
    if (!(stored instanceof Uint8Array)) throw new Error(`${column} is not encrypted bytes`);
    const blob = Buffer.from(stored);
    if (blob[0] !== VERSION) throw new Error(`${column} has unknown encryption version`);
    const nonce = blob.subarray(1, 1 + NONCE_BYTES);
    const ciphertext = blob.subarray(1 + NONCE_BYTES, -16);
    const tag = blob.subarray(-16);
    for (const key of this.keys) {
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, nonce);
        decipher.setAAD(Buffer.from(`${familyId}\0${column}`));
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      } catch {
        /* try the previous rotation key */
      }
    }
    throw new Error(`${column} authentication failed`);
  }

  private familyOf(row: Row): FamilyRecord {
    const familyId = String(row['family_id']);
    try {
      return {
        familyId,
        clientId: String(row['client_id']),
        subject: String(row['subject']),
        scope: String(row['scope']),
        upstreamAccessToken: this.decrypt(
          familyId,
          'upstream_access_ct',
          row['upstream_access_ct'],
        ),
        ...(row['upstream_refresh_ct'] === null
          ? {}
          : {
              upstreamRefreshToken: this.decrypt(
                familyId,
                'upstream_refresh_ct',
                row['upstream_refresh_ct'],
              ),
            }),
        upstreamExpiresAt: Number(row['upstream_expires_at']),
        upstreamRefreshedAt:
          row['upstream_refreshed_at'] === null ? null : Number(row['upstream_refreshed_at']),
        idleExpiresAt: Number(row['idle_expires_at']),
        absoluteExpiresAt: Number(row['absolute_expires_at']),
        revokedAt: row['revoked_at'] === null ? null : Number(row['revoked_at']),
        leaseOwner: row['lease_owner'] === null ? null : String(row['lease_owner']),
        leaseUntil: row['lease_until'] === null ? null : Number(row['lease_until']),
        version: Number(row['version']),
      };
    } catch (cause) {
      this.revokeFamily(familyId, Date.now());
      throw new Error(`MCP refresh family ${familyId} failed authenticated decryption`, { cause });
    }
  }
}

function digestOf(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS mcp_family (family_id TEXT PRIMARY KEY, client_id TEXT NOT NULL, subject TEXT NOT NULL, scope TEXT NOT NULL, upstream_access_ct BLOB NOT NULL, upstream_refresh_ct BLOB, upstream_expires_at INTEGER NOT NULL, upstream_refreshed_at INTEGER, idle_expires_at INTEGER NOT NULL, absolute_expires_at INTEGER NOT NULL, revoked_at INTEGER, lease_owner TEXT, lease_until INTEGER, version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mcp_session (jti TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES mcp_family(family_id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mcp_refresh (token_digest BLOB PRIMARY KEY, family_id TEXT NOT NULL REFERENCES mcp_family(family_id) ON DELETE CASCADE, consumed_at INTEGER, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS mcp_session_family ON mcp_session(family_id);
CREATE INDEX IF NOT EXISTS mcp_refresh_family ON mcp_refresh(family_id);`;
