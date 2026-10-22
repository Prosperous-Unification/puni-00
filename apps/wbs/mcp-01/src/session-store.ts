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
/**
 * The durable epoch as a scalar subquery. Comparing a family's epoch with it at every session
 * read and refresh retires older credentials in a running process, not only at startup; a
 * missing row reads NULL and matches nothing.
 */
const DURABLE_EPOCH = '(SELECT epoch FROM mcp_credential_epoch WHERE singleton = 1)';
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
  /**
   * The agent person a bound consent acts as and the be-01 `mcp_consent` credential it rides on
   * (`wbs-machine-credentials` A20); omitted when the human authorized as themself.
   */
  readonly consent?: ConsentBinding;
}

/** The agent person and consent credential of a family that acts as an agent person. */
export interface ConsentBinding {
  readonly personId: string;
  readonly credentialId: string;
}

/**
 * A consent credential whose family ended, or whose code expired unexchanged, and whose end
 * be-01 has not yet acknowledged.
 */
export interface EndedConsent {
  readonly familyId: string;
  readonly credentialId: string;
}

/** The pending consent of `familyId` was gone or expired when its code was exchanged. */
export class McpConsentPendingGone extends Error {}
export interface FamilyRecord extends FamilyInput {
  readonly credentialEpoch: number;
  readonly upstreamRefreshedAt: number | null;
  readonly revokedAt: number | null;
  readonly leaseOwner: string | null;
  readonly leaseUntil: number | null;
  readonly version: number;
}
export class McpRefreshFamilyCorrupt extends Error {}

/**
 * A dynamically registered public OAuth client. `expiresAt` is the sliding lifetime cleanup
 * enforces; `unprovenExpiresAt` caps how far authorization may extend a client that has not yet
 * completed a token exchange (`proven`).
 */
export interface RegisteredClient {
  readonly clientId: string;
  readonly source: string;
  readonly redirectUris: readonly string[];
  readonly proven: boolean;
  readonly expiresAt: number;
  readonly unprovenExpiresAt: number;
}

/** The live clients a registration is admitted against: all of them, and its source's. */
export interface ClientCensus {
  readonly total: number;
  readonly fromSource: readonly RegisteredClient[];
}

export type RefreshOutcome =
  | { readonly outcome: 'ok'; readonly family: FamilyRecord }
  | { readonly outcome: 'invalid' | 'reuse' };

/** Durable, process-shared authority for MCP registered clients, refresh families and sessions. */
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
      // Proof: 2026-10-21, with this check removed `refuses startup on a unsupported epoch without
      // reseeding` (store-migrations.test.ts) opened a store at epoch 2.
      if (epoch > SUPPORTED_CREDENTIAL_EPOCH)
        throw new McpStoreRefused(
          `MCP credential epoch ${String(epoch)} is newer than this mcp-01 understands`,
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

  /**
   * The durable credential epoch, read now rather than remembered from startup, so a running
   * process sees an advance at its next code issue or exchange.
   *
   * @throws {McpStoreRefused} when the epoch is missing, unreadable or malformed.
   */
  credentialEpoch(): number {
    return readCredentialEpoch(this.db);
  }

  /**
   * Creates the family with its first session and refresh token. A consent family also takes
   * over its pending consent ({@link recordPendingConsent}) in the same transaction.
   *
   * @throws {McpConsentPendingGone} when a consent family's pending row is gone or expired at
   *   `now`: its end may already be reported to be-01, so the family must not begin.
   */
  createFamily(
    input: FamilyInput,
    jti: string,
    sessionExpiresAt: number,
    refreshToken: string,
    now: number = Date.now(),
  ): void {
    this.db.transaction(() => {
      if (input.consent !== undefined) {
        const taken = this.db
          .query(
            `DELETE FROM mcp_consent_pending
            WHERE family_id = ? AND credential_id = ? AND expires_at > ?`,
          )
          .run(input.familyId, input.consent.credentialId, now);
        // Proof: 2026-10-22, with this refusal removed `refuses to exchange a consent code whose
        // pending consent was already reported ended` (store-migrations.test.ts) created the family.
        if (taken.changes !== 1)
          throw new McpConsentPendingGone(
            `MCP consent for family ${input.familyId} is no longer pending`,
          );
      }
      this.db
        .query(
          `INSERT INTO mcp_family (
        family_id, client_id, subject, scope, upstream_access_ct, upstream_refresh_ct,
        upstream_expires_at, idle_expires_at, absolute_expires_at, version,
        organization_id, user_id, issuer, credential_epoch, act_as_person_id, credential_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?,
        (SELECT epoch FROM mcp_credential_epoch WHERE singleton = 1), ?, ?)`,
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
          input.consent?.personId ?? null,
          input.consent?.credentialId ?? null,
        );
      this.insertSession(jti, input.familyId, sessionExpiresAt);
      this.insertRefresh(refreshToken, input.familyId, input.absoluteExpiresAt);
    })();
  }

  /**
   * Records, before be-01 is asked to mint it, a consent credential whose family does not exist
   * yet, so that a code never exchanged is still reported ended once it expires at `expiresAt`.
   */
  recordPendingConsent(familyId: string, credentialId: string, expiresAt: number): void {
    this.db
      .query(
        'INSERT INTO mcp_consent_pending (family_id, credential_id, expires_at) VALUES (?, ?, ?)',
      )
      .run(familyId, credentialId, expiresAt);
  }

  /** Forgets a pending consent be-01 refused to mint: nothing exists there to report ended. */
  forgetPendingConsent(familyId: string): void {
    this.db.query('DELETE FROM mcp_consent_pending WHERE family_id = ?').run(familyId);
  }

  /**
   * Consent credentials whose family has ended at `now` (revoked, idle or absolutely expired, or
   * of an older epoch than the durable one) or whose pending code expired unexchanged, and whose
   * end be-01 has not acknowledged; at most `limit`, earliest end first: a family by its
   * revocation time, else its earlier expiry; a pending consent by its code's expiry.
   */
  // Proof: 2026-10-22, dropping the epoch comparison made `reports a consent family retired by
  // the epoch advance, or by another writer` (credential-epoch.test.ts) report nothing for the
  // other writer; dropping the pending half made `reports a consent whose code was never
  // exchanged, once it expires` (organization-delegation.test.ts) report nothing.
  endedConsents(now: number, limit: number): EndedConsent[] {
    return this.db
      .query<{ family_id: string; credential_id: string }, [number, number, number, number]>(
        `SELECT family_id, credential_id,
            COALESCE(revoked_at, MIN(idle_expires_at, absolute_expires_at)) AS ended_at
          FROM mcp_family
          WHERE credential_id IS NOT NULL AND consent_ended_reported_at IS NULL
            AND (revoked_at IS NOT NULL OR idle_expires_at <= ? OR absolute_expires_at <= ?
              OR credential_epoch IS NOT ${DURABLE_EPOCH})
        UNION ALL
        SELECT family_id, credential_id, expires_at AS ended_at
          FROM mcp_consent_pending WHERE expires_at <= ?
        ORDER BY ended_at, family_id
        LIMIT ?`,
      )
      .all(now, now, now, limit)
      .map((row) => ({ familyId: row.family_id, credentialId: row.credential_id }));
  }

  /** Records that be-01 acknowledged the end of `ended`: it is never reported again. */
  acknowledgeConsentEnd(ended: EndedConsent, now: number): void {
    this.db.transaction(() => {
      this.db
        .query(
          `UPDATE mcp_family SET consent_ended_reported_at = ?
          WHERE family_id = ? AND credential_id = ? AND consent_ended_reported_at IS NULL`,
        )
        .run(now, ended.familyId, ended.credentialId);
      this.db
        .query('DELETE FROM mcp_consent_pending WHERE family_id = ? AND credential_id = ?')
        .run(ended.familyId, ended.credentialId);
    })();
  }

  /**
   * The live family behind session `jti`: unexpired, unrevoked and at the durable epoch, so a
   * session issued before an epoch advance reads as absent.
   */
  // Proof: 2026-10-21, without the epoch comparison `refuses an older-epoch session at every
  // use` (credential-epoch.test.ts) resolved the stale session's upstream token.
  familyForSession(jti: string, now: number): FamilyRecord | null {
    const row = this.db
      .query(
        `SELECT f.* FROM mcp_session s JOIN mcp_family f USING (family_id)
      WHERE s.jti = ? AND s.expires_at > ? AND f.revoked_at IS NULL
        AND f.idle_expires_at > ? AND f.absolute_expires_at > ?
        AND f.credential_epoch = ${DURABLE_EPOCH}`,
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
          `SELECT r.family_id, r.consumed_at, r.expires_at, f.*, ${DURABLE_EPOCH} AS durable_epoch
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
      // Proof: 2026-10-21, without the epoch comparison `refuses a refresh whose epoch advanced
      // during the provider refresh` (credential-epoch.test.ts) threw the session trigger's
      // SQLiteError instead of answering 400 invalid_grant.
      if (
        Number(row['expires_at']) <= now ||
        row['revoked_at'] !== null ||
        Number(row['idle_expires_at']) <= now ||
        Number(row['absolute_expires_at']) <= now ||
        row['credential_epoch'] !== row['durable_epoch']
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
        `SELECT r.family_id, r.consumed_at, r.expires_at, f.*, ${DURABLE_EPOCH} AS durable_epoch
        FROM mcp_refresh r JOIN mcp_family f USING (family_id) WHERE r.token_digest = ?`,
      )
      .get(digestOf(token)) as Row | null;
    if (row === null || String(row['client_id']) !== clientId) return { outcome: 'invalid' };
    const familyId = String(row['family_id']);
    if (row['consumed_at'] !== null) {
      this.revokeFamily(familyId, now);
      return { outcome: 'reuse' };
    }
    // Proof: 2026-10-21, without the epoch comparison `refuses an older-epoch refresh before any
    // provider work` (credential-epoch.test.ts) called the provider refresh.
    if (
      Number(row['expires_at']) <= now ||
      row['revoked_at'] !== null ||
      Number(row['idle_expires_at']) <= now ||
      Number(row['absolute_expires_at']) <= now ||
      row['credential_epoch'] !== row['durable_epoch']
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

  /**
   * Registers the client `create` builds when `admits` accepts the census of clients live at
   * `now`. Census and insert run in one IMMEDIATE transaction, which takes SQLite's write lock
   * first, so another writer on the store (blue and green mid-swap) cannot register between
   * them; no test exercises two processes here. `create` runs only once admitted, so a refused
   * registration consumes no client id.
   *
   * @returns the registered client, or `null` when `admits` refused.
   */
  admitClient(
    source: string,
    now: number,
    admits: (census: ClientCensus) => boolean,
    create: () => RegisteredClient,
  ): RegisteredClient | null {
    return this.db
      .transaction(() => {
        const total = this.db
          .query<{ n: number }, [number]>(
            'SELECT COUNT(*) AS n FROM mcp_client WHERE expires_at > ?',
          )
          .get(now)?.n;
        if (total === undefined) throw new Error('MCP client count returned no row');
        // Proof: 2026-10-21, a census of `total: 0` failed `counts clients registered before the
        // restart against the global and source limits` and `refuses registration at capacity
        // without evicting a live connector`; an empty `fromSource` failed the same restart case
        // and `keeps a promoted client proven and counted across the restart` (oauth.test.ts).
        if (!admits({ total, fromSource: this.clientsFromSource(source, now) })) return null;
        const client = create();
        // Proof: 2026-10-21, deleting every mcp_client row when the store opened made
        // `authorizes and exchanges a code for a client registered before the restart`
        // (oauth.test.ts) answer 400 instead of 302: the restart forgot the client (#607).
        this.db
          .query(
            `INSERT INTO mcp_client (
          client_id, source, redirect_uris, proven, expires_at, unproven_expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            client.clientId,
            client.source,
            JSON.stringify(client.redirectUris),
            client.proven ? 1 : 0,
            client.expiresAt,
            client.unprovenExpiresAt,
          );
        return client;
      })
      .immediate();
  }

  /**
   * The client registered as `clientId` and still live at `now`, or `null` when it was never
   * registered here or has expired.
   *
   * @throws when the stored row is malformed; trusted state is never read as an absent client.
   */
  // Proof: 2026-10-21, dropping the `expires_at > ?` filter from this read, from
  // `clientsFromSource` or from the census count, or turning `deleteExpiredClients` into a
  // SELECT, each failed `keeps a registered client across a reopen until it expires`
  // (store-migrations.test.ts).
  client(clientId: string, now: number): RegisteredClient | null {
    const row = this.db
      .query('SELECT * FROM mcp_client WHERE client_id = ? AND expires_at > ?')
      .get(clientId, now) as Row | null;
    return row === null ? null : clientOf(row);
  }

  /** The clients registered from `source` and still live at `now`. */
  clientsFromSource(source: string, now: number): RegisteredClient[] {
    return (
      this.db
        .query('SELECT * FROM mcp_client WHERE source = ? AND expires_at > ?')
        .all(source, now) as Row[]
    ).map(clientOf);
  }

  /**
   * Moves the client's sliding lifetime forward to `expiresAt`, never back, so an extension
   * computed before a concurrent promotion (another process) cannot shorten the promoted
   * lifetime. A vanished client stays absent.
   */
  extendClient(clientId: string, expiresAt: number): void {
    // Proof: 2026-10-21, `SET expires_at = ?` without MAX failed `never shortens a lifetime
    // when an extension follows a promotion` (store-migrations.test.ts).
    this.db
      .query('UPDATE mcp_client SET expires_at = MAX(expires_at, ?) WHERE client_id = ?')
      .run(expiresAt, clientId);
  }

  /** Marks the client proven after a code exchange and gives it the active lifetime. */
  promoteClient(clientId: string, expiresAt: number): void {
    this.db
      .query('UPDATE mcp_client SET proven = 1, expires_at = ? WHERE client_id = ?')
      .run(expiresAt, clientId);
  }

  /** Deletes every client whose lifetime ended at or before `now`. */
  deleteExpiredClients(now: number): void {
    this.db.query('DELETE FROM mcp_client WHERE expires_at <= ?').run(now);
  }

  /** Copies the family's binding, person and epoch; the insert trigger rejects a stale epoch. */
  private insertSession(jti: string, familyId: string, expiresAt: number): void {
    const inserted = this.db
      .query(
        `INSERT INTO mcp_session (
        jti, family_id, expires_at, organization_id, user_id, issuer, credential_epoch,
        act_as_person_id, credential_id
      ) SELECT ?, family_id, ?, organization_id, user_id, issuer, credential_epoch,
        act_as_person_id, credential_id
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
        ...consentOf(row),
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

/** Reads a row's consent person; the family CHECK makes the two columns both null or both set. */
function consentOf(row: Row): { consent?: ConsentBinding } {
  const personId = row['act_as_person_id'];
  const credentialId = row['credential_id'];
  if (personId === null && credentialId === null) return {};
  if (typeof personId !== 'string' || typeof credentialId !== 'string')
    throw new Error('MCP family consent person is malformed');
  return { consent: { personId, credentialId } };
}

/**
 * Reads a stored client row. The table has no CHECK constraints, so this is where a malformed
 * row (wrong types, an unparseable or empty redirect list, `proven` outside 0/1) refuses.
 *
 * @throws when any column is malformed.
 */
function clientOf(row: Row): RegisteredClient {
  // Proof: 2026-10-21, dropping the `proven` and `expires_at` checks failed the `proven outside 0
  // and 1` and `a text expiry` cases, dropping the redirect list checks failed the `empty
  // redirect list` and `non-string redirect` cases, and swallowing the JSON error failed the
  // `unparseable redirect_uris` case of `refuses a stored client with … instead of reading it
  // as absent` (store-migrations.test.ts).
  const clientId = row['client_id'];
  const source = row['source'];
  const encoded = row['redirect_uris'];
  const proven = row['proven'];
  const expiresAt = row['expires_at'];
  const unprovenExpiresAt = row['unproven_expires_at'];
  if (
    typeof clientId !== 'string' ||
    typeof source !== 'string' ||
    typeof encoded !== 'string' ||
    (proven !== 0 && proven !== 1) ||
    typeof expiresAt !== 'number' ||
    typeof unprovenExpiresAt !== 'number'
  )
    throw new Error(`MCP client row is malformed: ${String(clientId)}`);
  let redirectUris: unknown;
  try {
    redirectUris = JSON.parse(encoded);
  } catch (cause) {
    throw new Error(`MCP client ${clientId} redirect_uris is not JSON`, { cause });
  }
  const uris = Array.isArray(redirectUris)
    ? redirectUris.filter((uri): uri is string => typeof uri === 'string')
    : [];
  if (!Array.isArray(redirectUris) || uris.length === 0 || uris.length !== redirectUris.length)
    throw new Error(`MCP client ${clientId} redirect_uris is not a list of strings`);
  return {
    clientId,
    source,
    redirectUris: uris,
    proven: proven === 1,
    expiresAt,
    unprovenExpiresAt,
  };
}

function digestOf(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
