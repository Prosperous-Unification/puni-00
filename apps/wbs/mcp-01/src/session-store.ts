import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';

import { Database, SQLiteError } from 'bun:sqlite';

import {
  McpStoreRefused,
  migrateMcpStore,
  readCredentialEpoch,
  SUPPORTED_CREDENTIAL_EPOCH,
} from './store-migrations';

const VERSION = 1;
const NONCE_BYTES = 12;
type Row = Record<string, string | number | Uint8Array | null>;

/** The organization a credential acts for, with the stable WBS user and upstream issuer. */
export interface CredentialBinding {
  readonly organizationId: string;
  readonly userId: string;
  readonly issuer: string;
}

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
  /** Omitted for legacy epoch-0 issuance; the store stamps the durable epoch either way. */
  readonly binding?: CredentialBinding;
}
export interface FamilyRecord extends FamilyInput {
  readonly credentialEpoch: number;
  readonly upstreamRefreshedAt: number | null;
  readonly revokedAt: number | null;
  readonly leaseOwner: string | null;
  readonly leaseUntil: number | null;
  readonly version: number;
}
export class McpRefreshFamilyCorrupt extends Error {}

export type RefreshOutcome =
  | { readonly outcome: 'ok'; readonly family: FamilyRecord }
  | { readonly outcome: 'invalid' | 'reuse' };

/** Durable, process-shared authority for MCP refresh families and sessions. */
export class McpSessionStore {
  private readonly db: Database;

  /**
   * Opens the store, migrates it and validates the credential epoch before anything is served.
   * Only an absent path is created (task 1.6's pre-activation exception); an existing empty,
   * partial, unreadable or corrupt file, and any epoch this release does not understand, throw.
   */
  constructor(
    path: string,
    private readonly keys: readonly Buffer[],
  ) {
    if (keys.length === 0 || keys.some((key) => key.length !== 32))
      throw new Error('MCP_STORE_KEY_CURRENT must decode to exactly 32 bytes');
    let db: Database | undefined;
    try {
      const created = path === ':memory:' || createdAbsent(path);
      db = new Database(path, { create: false, readwrite: true, strict: true });
      db.run('PRAGMA busy_timeout = 5000');
      switchToWal(db);
      db.run('PRAGMA foreign_keys = ON');
      db.run('PRAGMA synchronous = FULL');
      migrateMcpStore(db, created);
      const epoch = readCredentialEpoch(db);
      // Proof: 2026-09-27, with this check removed `refuses startup on a unsupported epoch without
      // reseeding` opened a store at epoch 1.
      if (epoch !== SUPPORTED_CREDENTIAL_EPOCH)
        throw new McpStoreRefused(
          `MCP credential epoch ${String(epoch)} needs organization-aware mcp-01`,
        );
    } catch (cause) {
      db?.close();
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`MCP_STORE_PATH is unreadable, corrupt or refused: ${path}: ${reason}`, {
        cause,
      });
    }
    this.db = db;
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
        upstream_expires_at, idle_expires_at, absolute_expires_at, version,
        organization_id, user_id, issuer, credential_epoch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?,
        (SELECT epoch FROM mcp_credential_epoch WHERE singleton = 1))`,
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
          input.binding?.organizationId ?? null,
          input.binding?.userId ?? null,
          input.binding?.issuer ?? null,
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
  ): RefreshOutcome {
    const transactionOutcome = this.db.transaction(() => {
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
    if (transactionOutcome.outcome !== 'row') return transactionOutcome;
    // Decrypt only after the write transaction commits. If authentication fails,
    // familyOf's revocation must survive instead of being rolled back with it.
    return { outcome: 'ok', family: this.familyOf(transactionOutcome.row) };
  }

  prepareRefresh(token: string, clientId: string, now: number): RefreshOutcome {
    const row = this.db
      .query(
        `SELECT r.family_id, r.consumed_at, r.expires_at, f.*
        FROM mcp_refresh r JOIN mcp_family f USING (family_id) WHERE r.token_digest = ?`,
      )
      .get(digestOf(token)) as Row | null;
    if (row === null || String(row['client_id']) !== clientId) return { outcome: 'invalid' };
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

  familyForSessionId(jti: string): FamilyRecord | null {
    const row = this.db
      .query('SELECT f.* FROM mcp_session s JOIN mcp_family f USING (family_id) WHERE s.jti = ?')
      .get(jti) as Row | null;
    return row === null ? null : this.familyOf(row);
  }

  familyForRefreshToken(token: string): FamilyRecord | null {
    const row = this.db
      .query(
        `SELECT f.* FROM mcp_refresh r JOIN mcp_family f USING (family_id)
        WHERE r.token_digest = ?`,
      )
      .get(digestOf(token)) as Row | null;
    return row === null ? null : this.familyOf(row);
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
    const row = this.db.query('SELECT family_id FROM mcp_session WHERE jti = ?').get(jti) as {
      family_id: string;
    } | null;
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

  releaseRefreshLease(familyId: string, owner: string, refreshToken?: string): void {
    this.db
      .query(
        `UPDATE mcp_family SET upstream_refresh_ct = COALESCE(?, upstream_refresh_ct),
        lease_owner = NULL, lease_until = NULL
        WHERE family_id = ? AND lease_owner = ?`,
      )
      .run(
        refreshToken === undefined
          ? null
          : this.encrypt(familyId, 'upstream_refresh_ct', refreshToken),
        familyId,
        owner,
      );
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
      .query(
        'SELECT upstream_refresh_ct, upstream_refreshed_at FROM mcp_family WHERE family_id = ?',
      )
      .get(familyId) as Row | null;
    if (current === null) return false;
    const refreshCiphertext =
      refreshToken === undefined
        ? current['upstream_refresh_ct']
        : this.encrypt(familyId, 'upstream_refresh_ct', refreshToken);
    const previousRefreshedAt = current['upstream_refreshed_at'];
    const monotonicRefreshedAt =
      previousRefreshedAt === null
        ? refreshedAt
        : Math.max(refreshedAt, Number(previousRefreshedAt) + 1);
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
        monotonicRefreshedAt,
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

  /** Copies the family's binding and epoch; the insert trigger rejects a stale epoch. */
  private insertSession(jti: string, familyId: string, expiresAt: number): void {
    const inserted = this.db
      .query(
        `INSERT INTO mcp_session (
        jti, family_id, expires_at, organization_id, user_id, issuer, credential_epoch
      ) SELECT ?, family_id, ?, organization_id, user_id, issuer, credential_epoch
        FROM mcp_family WHERE family_id = ?`,
      )
      .run(jti, expiresAt, familyId);
    if (inserted.changes !== 1) throw new Error(`MCP family ${familyId} vanished mid-transaction`);
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
        credentialEpoch: Number(row['credential_epoch']),
        ...bindingOf(row),
      };
    } catch (cause) {
      this.revokeFamily(familyId, Date.now());
      throw new McpRefreshFamilyCorrupt(
        `MCP refresh family ${familyId} failed authenticated decryption`,
        { cause },
      );
    }
  }
}

const WAL_SWITCH_ATTEMPTS = 100;
const WAL_SWITCH_PAUSE_MS = 50;

/**
 * Sets `journal_mode = WAL`, retrying `SQLITE_BUSY` for up to 100 attempts 50 ms apart.
 *
 * A read-to-write lock upgrade refuses at once, but an exclusive rival can make each attempt
 * wait for the configured `busy_timeout`. Disable that handler during this bounded retry and
 * restore its original setting even when the switch fails.
 * Two starts on one absent store collide exactly here: the creator refused with `database is
 * locked` while its rival refused the empty file as not its own, and the store stayed an empty
 * file that every later start refuses.
 *
 * @param db The store connection, outside any transaction.
 * @param pause Waits between attempts; a test passes one that releases its rival's lock.
 * @throws If the busy timeout cannot be read, the last `SQLITE_BUSY` when every attempt is
 * refused, or any other error at once.
 */
export function switchToWal(
  db: Database,
  pause: (ms: number) => void = (ms) => {
    Bun.sleepSync(ms);
  },
): void {
  const configured = db.query<{ timeout: number }, []>('PRAGMA busy_timeout').get();
  // Proof: a reader returning null made the malformed-timeout case refuse before any pragma.
  if (configured === null || !Number.isInteger(configured.timeout) || configured.timeout < 0) {
    throw new Error('SQLite did not report a valid busy timeout before the WAL switch');
  }
  // Proof: without this zero, an exclusive rival held the 20 ms handler for 100 attempts;
  // the browser-free store test observed 2051 ms against its 1000 ms bound.
  db.run('PRAGMA busy_timeout = 0');
  try {
    for (let attempt = 1; ; attempt += 1) {
      try {
        db.run('PRAGMA journal_mode = WAL');
        return;
      } catch (cause) {
        const busy = cause instanceof SQLiteError && cause.code === 'SQLITE_BUSY';
        // Proof: removing the non-BUSY branch made a read-only WAL switch pause 99 times
        // instead of throwing SQLITE_READONLY at once.
        if (!busy || attempt === WAL_SWITCH_ATTEMPTS) throw cause;
      }
      pause(WAL_SWITCH_PAUSE_MS);
    }
  } finally {
    // Proof: removing this restore made the rival-release case read 0 instead of 5000,
    // and the SQLITE_READONLY failure case read 0 instead of its caller's 1234.
    db.run(`PRAGMA busy_timeout = ${String(configured.timeout)}`);
  }
}

/**
 * Creates `path` only if it is absent, so this start alone may initialize it. A file that already
 * exists, even empty, belongs to an earlier or concurrent start and must be a valid store.
 */
function createdAbsent(path: string): boolean {
  try {
    closeSync(openSync(path, 'wx', 0o600));
    return true;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'EEXIST') return false;
    throw cause;
  }
}

/** Reads a row's binding; the table CHECK makes the three columns all null or all set. */
function bindingOf(row: Row): { binding?: CredentialBinding } {
  const organizationId = row['organization_id'];
  const userId = row['user_id'];
  const issuer = row['issuer'];
  if (organizationId === null && userId === null && issuer === null) return {};
  if (
    typeof organizationId !== 'string' ||
    typeof userId !== 'string' ||
    typeof issuer !== 'string'
  )
    throw new Error('MCP family binding is malformed');
  return { binding: { organizationId, userId, issuer } };
}

function digestOf(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
