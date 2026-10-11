import { createHash } from 'node:crypto';

import type { VerifiedOrganizationCredential } from '@wbs/contracts';
import { sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { Gate } from './gate';

type OidcCredential = VerifiedOrganizationCredential & { readonly kind: 'oidc' };

/** A proved browser lifecycle cannot accept this stale or mismatched request. */
export class BrowserLifecycleRefusedError extends Error {}

interface StoredLifecycle {
  readonly user_id: string;
  readonly generation: number;
  readonly state: string;
  readonly current_kind: string;
  readonly current_digest: string;
  readonly current_expires_at: number;
}

interface StoredAssociation {
  readonly generation: number;
  readonly kind: string;
  readonly credential_digest: string;
  readonly expires_at: number;
}

interface StoredRevocation {
  readonly expires_at: number;
  readonly revoked_at: number;
}

function isStoredRevoked(rows: readonly StoredRevocation[], expectedExpiry: number): boolean {
  if (rows.length === 0) return false;
  const revocation = rows[0];
  // Proof: treating any matching row as a valid revocation made malformed
  // revoked_at=0.5 look like a typed stale credential (401) instead of a
  // storage fault (500); watched 2026-10-01.
  if (
    rows.length !== 1 ||
    !Number.isSafeInteger(revocation.expires_at) ||
    revocation.expires_at !== expectedExpiry ||
    !Number.isSafeInteger(revocation.revoked_at) ||
    revocation.revoked_at < 0
  )
    throw new Error('matching browser credential revocation is malformed');
  return true;
}

function sessionDigest(correlation: string): string {
  if (correlation.length === 0) throw new Error('OIDC browser correlation is empty');
  return createHash('sha256').update(correlation, 'utf8').digest('hex');
}

function credentialKey(credential: VerifiedOrganizationCredential): OidcCredential {
  if (
    credential.kind !== 'oidc' ||
    credential.userId.length === 0 ||
    !/^[0-9a-f]{64}$/.test(credential.digest) ||
    !Number.isSafeInteger(credential.expiresAt) ||
    credential.expiresAt < 0
  )
    throw new Error('OIDC browser credential is malformed');
  return { ...credential, kind: 'oidc' };
}

function checkedTime(revokedAt: number): number {
  if (!Number.isSafeInteger(revokedAt) || revokedAt < 0)
    throw new Error('browser credential revocation time is malformed');
  return revokedAt;
}

function checkedLifecycle(rows: readonly StoredLifecycle[]): StoredLifecycle {
  // Proof: treating zero rows as a generic storage fault made the absent
  // correlation test lose its typed authentication refusal; watched
  // 2026-10-01. Missing table still throws from SQLite before this branch.
  if (rows.length === 0) throw new BrowserLifecycleRefusedError('OIDC browser lifecycle is absent');
  const lifecycle = rows[0];
  if (
    rows.length !== 1 ||
    lifecycle.user_id.length === 0 ||
    !Number.isSafeInteger(lifecycle.generation) ||
    lifecycle.generation < 1 ||
    (lifecycle.state !== 'active' && lifecycle.state !== 'closed') ||
    lifecycle.current_kind !== 'oidc' ||
    !/^[0-9a-f]{64}$/.test(lifecycle.current_digest) ||
    !Number.isSafeInteger(lifecycle.current_expires_at) ||
    lifecycle.current_expires_at < 0
  )
    throw new Error('OIDC browser lifecycle is missing or malformed');
  return lifecycle;
}

function checkedAssociation(rows: readonly StoredAssociation[], lifecycle: StoredLifecycle): void {
  const association = rows[0];
  if (
    rows.length !== 1 ||
    association.generation !== lifecycle.generation ||
    association.kind !== lifecycle.current_kind ||
    association.credential_digest !== lifecycle.current_digest ||
    association.expires_at !== lifecycle.current_expires_at
  )
    throw new Error('current OIDC browser association is missing or malformed');
}

function checkedHistory(
  rows: readonly StoredAssociation[],
  lifecycle: StoredLifecycle,
  presentedDigest: string,
): void {
  // Proof: conflating malformed retained rows with absent history made the
  // corrupt-expiry test receive BrowserLifecycleRefusedError (401) instead
  // of a storage fault (500); watched 2026-10-01.
  if (rows.length === 0)
    throw new BrowserLifecycleRefusedError(
      'presented OIDC credential is not associated with lifecycle',
    );
  const history = rows[0];
  if (
    rows.length !== 1 ||
    !Number.isSafeInteger(history.generation) ||
    history.generation < 1 ||
    history.generation > lifecycle.generation ||
    history.kind !== 'oidc' ||
    history.credential_digest !== presentedDigest ||
    !Number.isSafeInteger(history.expires_at) ||
    history.expires_at < 0
  )
    throw new Error('stored historical OIDC browser association is malformed');
}

function matchesCredential(lifecycle: StoredLifecycle, credential: OidcCredential): boolean {
  return (
    lifecycle.user_id === credential.userId &&
    lifecycle.current_kind === credential.kind &&
    lifecycle.current_digest === credential.digest &&
    lifecycle.current_expires_at === credential.expiresAt
  );
}

/**
 * Durable OIDC browser authority. A caller supplies only verified credential
 * metadata and the opaque browser correlation; this adapter persists its hash.
 * Every transition reads and writes one SQLite transaction, including B1
 * revocation, so a losing refresh cannot republish a closed credential.
 */
export interface BrowserAuthLifecycle {
  open(correlation: string, credential: VerifiedOrganizationCredential): Promise<number>;
  generation(correlation: string): Promise<{
    readonly generation: number;
    readonly current: VerifiedOrganizationCredential;
  }>;
  proveAssociation(
    correlation: string,
    presented: { readonly kind: 'oidc'; readonly digest: string },
  ): Promise<void>;
  replace(
    correlation: string,
    expectedGeneration: number,
    predecessor: VerifiedOrganizationCredential,
    successor: VerifiedOrganizationCredential,
    revokedAt: number,
  ): Promise<number>;
  close(
    correlation: string,
    presented: { readonly kind: 'oidc'; readonly digest: string },
    revokedAt: number,
  ): Promise<'closed' | 'already_closed'>;
}

/** SQLite implementation of {@link BrowserAuthLifecycle}. */
export class SqliteBrowserAuthLifecycle implements BrowserAuthLifecycle {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** Opens one new correlation and retains its first exact credential tuple. */
  open(correlation: string, credential: VerifiedOrganizationCredential): Promise<number> {
    const digest = sessionDigest(correlation);
    const key = credentialKey(credential);
    return this.gate.enter(() => {
      this.db.transaction(
        (tx) => {
          const prior = tx.all<StoredRevocation>(sql`SELECT expires_at, revoked_at
          FROM browser_credential_revocations
          WHERE kind = ${key.kind} AND user_id = ${key.userId}
            AND credential_digest = ${key.digest}`);
          if (isStoredRevoked(prior, key.expiresAt))
            throw new BrowserLifecycleRefusedError('OIDC browser credential was already revoked');
          tx.run(sql`INSERT INTO browser_auth_lifecycle
          (session_digest, user_id, generation, state, current_kind, current_digest, current_expires_at)
          VALUES (${digest}, ${key.userId}, 1, 'active', ${key.kind}, ${key.digest}, ${key.expiresAt})`);
          tx.run(sql`INSERT INTO browser_auth_association
          (session_digest, generation, kind, credential_digest, expires_at)
          VALUES (${digest}, 1, ${key.kind}, ${key.digest}, ${key.expiresAt})`);
        },
        { behavior: 'immediate' },
      );
      return Promise.resolve(1);
    });
  }

  /** Reads the active generation and retained verified tuple without decoding expired claims. */
  generation(correlation: string): Promise<{
    readonly generation: number;
    readonly current: VerifiedOrganizationCredential;
  }> {
    const digest = sessionDigest(correlation);
    return Promise.resolve().then(() => {
      const lifecycle = checkedLifecycle(
        this.db.all<StoredLifecycle>(sql`SELECT user_id, generation, state, current_kind,
          current_digest, current_expires_at FROM browser_auth_lifecycle
          WHERE session_digest = ${digest}`),
      );
      // Proof: bypassing the active-state admission let a closed correlation
      // capture a generation in the store negative test.
      if (lifecycle.state !== 'active')
        throw new BrowserLifecycleRefusedError('OIDC browser lifecycle is not active');
      checkedAssociation(
        this.db.all<StoredAssociation>(sql`SELECT generation, kind, credential_digest, expires_at
          FROM browser_auth_association WHERE session_digest = ${digest}
            AND generation = ${lifecycle.generation}`),
        lifecycle,
      );
      const revoked = this.db.all<StoredRevocation>(sql`SELECT expires_at, revoked_at
        FROM browser_credential_revocations
        WHERE kind = ${lifecycle.current_kind} AND user_id = ${lifecycle.user_id}
          AND credential_digest = ${lifecycle.current_digest}`);
      // Proof: valid independent B1 revocation originally threw a plain Error;
      // the generation test expected typed stale-session refusal and failed.
      if (isStoredRevoked(revoked, lifecycle.current_expires_at))
        throw new BrowserLifecycleRefusedError('active OIDC browser credential is already revoked');
      return {
        generation: lifecycle.generation,
        current: {
          kind: 'oidc',
          userId: lifecycle.user_id,
          digest: lifecycle.current_digest,
          expiresAt: lifecycle.current_expires_at,
        },
      };
    });
  }

  /** Proves presented bytes belong to this active correlation, even after their expiry. */
  proveAssociation(
    correlation: string,
    presented: { readonly kind: 'oidc'; readonly digest: string },
  ): Promise<void> {
    const digest = sessionDigest(correlation);
    if (!/^[0-9a-f]{64}$/.test(presented.digest))
      throw new Error('presented OIDC credential digest is malformed');
    return Promise.resolve().then(() => {
      const lifecycle = checkedLifecycle(
        this.db.all<StoredLifecycle>(sql`SELECT user_id, generation, state, current_kind,
          current_digest, current_expires_at FROM browser_auth_lifecycle
          WHERE session_digest = ${digest}`),
      );
      if (lifecycle.state !== 'active')
        throw new BrowserLifecycleRefusedError('OIDC browser lifecycle is closed');
      checkedAssociation(
        this.db.all<StoredAssociation>(sql`SELECT generation, kind, credential_digest, expires_at
          FROM browser_auth_association WHERE session_digest = ${digest}
            AND generation = ${lifecycle.generation}`),
        lifecycle,
      );
      // Proof: dropping the session_digest condition made a same-user foreign
      // access/correlation pair pass this exact-association negative.
      const history = this.db.all<StoredAssociation>(sql`SELECT generation, kind,
        credential_digest, expires_at FROM browser_auth_association
        WHERE session_digest = ${digest} AND kind = ${presented.kind}
          AND credential_digest = ${presented.digest}`);
      checkedHistory(history, lifecycle, presented.digest);
    });
  }

  /** CAS-replaces an active tuple and revokes its predecessor atomically. */
  replace(
    correlation: string,
    expectedGeneration: number,
    predecessor: VerifiedOrganizationCredential,
    successor: VerifiedOrganizationCredential,
    revokedAt: number,
  ): Promise<number> {
    const digest = sessionDigest(correlation);
    const oldKey = credentialKey(predecessor);
    const newKey = credentialKey(successor);
    const time = checkedTime(revokedAt);
    if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 1)
      throw new Error('expected browser lifecycle generation is malformed');
    // Proof: identical bytes and a foreign replacement user originally threw
    // plain Error; the typed-refusal assertions failed, watched 2026-10-01.
    if (oldKey.userId !== newKey.userId || oldKey.digest === newKey.digest)
      throw new BrowserLifecycleRefusedError(
        'replacement credential is not distinct for the same user',
      );
    return this.gate.enter(() => {
      const advanced = this.db.transaction(
        (tx) => {
          const lifecycle = checkedLifecycle(
            tx.all<StoredLifecycle>(sql`SELECT user_id, generation, state, current_kind,
            current_digest, current_expires_at FROM browser_auth_lifecycle
            WHERE session_digest = ${digest}`),
          );
          // Proof: removing the generation/state comparison made a stale second
          // refresh commit in the CAS negative instead of throwing.
          if (
            lifecycle.state !== 'active' ||
            lifecycle.generation !== expectedGeneration ||
            !matchesCredential(lifecycle, oldKey)
          )
            throw new BrowserLifecycleRefusedError('OIDC browser lifecycle generation is stale');
          checkedAssociation(
            tx.all<StoredAssociation>(sql`SELECT generation, kind, credential_digest, expires_at
            FROM browser_auth_association WHERE session_digest = ${digest}
              AND generation = ${lifecycle.generation}`),
            lifecycle,
          );
          // Proof: removing this B1 read made the independently revoked
          // predecessor test commit a successor; watched 2026-10-01.
          const revokedPredecessor = tx.all<StoredRevocation>(sql`SELECT expires_at, revoked_at
          FROM browser_credential_revocations
          WHERE kind = ${oldKey.kind} AND user_id = ${oldKey.userId}
            AND credential_digest = ${oldKey.digest}`);
          if (isStoredRevoked(revokedPredecessor, oldKey.expiresAt))
            throw new BrowserLifecycleRefusedError('predecessor OIDC credential is revoked');
          const revokedSuccessor = tx.all<StoredRevocation>(sql`SELECT expires_at, revoked_at
          FROM browser_credential_revocations
          WHERE kind = ${newKey.kind} AND user_id = ${newKey.userId}
            AND credential_digest = ${newKey.digest}`);
          if (isStoredRevoked(revokedSuccessor, newKey.expiresAt))
            throw new BrowserLifecycleRefusedError(
              'replacement OIDC browser credential was already revoked',
            );
          this.revokeCurrent(tx, lifecycle, time);
          const next = expectedGeneration + 1;
          if (!Number.isSafeInteger(next)) throw new Error('browser lifecycle generation overflow');
          tx.run(sql`INSERT INTO browser_auth_association
          (session_digest, generation, kind, credential_digest, expires_at)
          VALUES (${digest}, ${next}, ${newKey.kind}, ${newKey.digest}, ${newKey.expiresAt})`);
          const updated = tx.run(sql`UPDATE browser_auth_lifecycle
          SET generation = ${next}, current_kind = ${newKey.kind},
            current_digest = ${newKey.digest}, current_expires_at = ${newKey.expiresAt}
          WHERE session_digest = ${digest} AND generation = ${expectedGeneration}
            AND state = 'active'`);
          if (updated.changes !== 1) throw new Error('OIDC browser lifecycle CAS failed');
          return next;
          // Proof: replacing BEGIN IMMEDIATE with a deferred transaction made
          // two real Bun processes that captured generation 1 fail with
          // SQLITE_BUSY on read-to-write upgrade; watched 2026-10-01.
        },
        { behavior: 'immediate' },
      );
      return Promise.resolve(advanced);
    });
  }

  /** Proves any retained exact association, then closes and revokes the current tuple. */
  close(
    correlation: string,
    presented: { readonly kind: 'oidc'; readonly digest: string },
    revokedAt: number,
  ): Promise<'closed' | 'already_closed'> {
    const digest = sessionDigest(correlation);
    const time = checkedTime(revokedAt);
    if (!/^[0-9a-f]{64}$/.test(presented.digest))
      throw new Error('presented OIDC credential digest is malformed');
    return this.gate.enter(() => {
      const closure = this.db.transaction(
        (tx): 'closed' | 'already_closed' => {
          const lifecycle = checkedLifecycle(
            tx.all<StoredLifecycle>(sql`SELECT user_id, generation, state, current_kind,
            current_digest, current_expires_at FROM browser_auth_lifecycle
            WHERE session_digest = ${digest}`),
          );
          // Proof: removing this historical association check let a foreign
          // digest close an unrelated lifecycle in the store negative test.
          const history = tx.all<StoredAssociation>(sql`SELECT generation, kind, credential_digest,
          expires_at FROM browser_auth_association
          WHERE session_digest = ${digest} AND kind = ${presented.kind}
            AND credential_digest = ${presented.digest}`);
          // Proof: omitting expiry/generation validation made the corrupted
          // historical-association test close an active successor; watched
          // 2026-10-01.
          checkedHistory(history, lifecycle, presented.digest);
          checkedAssociation(
            tx.all<StoredAssociation>(sql`SELECT generation, kind, credential_digest, expires_at
            FROM browser_auth_association WHERE session_digest = ${digest}
              AND generation = ${lifecycle.generation}`),
            lifecycle,
          );
          if (lifecycle.state === 'closed') {
            // Proof: returning here without this B1 read made a retry report
            // success after the revocation table was dropped; watched
            // 2026-10-01.
            const revoked = tx.all<StoredRevocation>(sql`SELECT expires_at, revoked_at
            FROM browser_credential_revocations
            WHERE kind = ${lifecycle.current_kind} AND user_id = ${lifecycle.user_id}
              AND credential_digest = ${lifecycle.current_digest}`);
            if (!isStoredRevoked(revoked, lifecycle.current_expires_at))
              throw new Error('closed OIDC browser credential revocation is missing or malformed');
            return 'already_closed';
          }
          this.revokeCurrent(tx, lifecycle, time);
          const updated = tx.run(sql`UPDATE browser_auth_lifecycle SET state = 'closed'
          WHERE session_digest = ${digest} AND generation = ${lifecycle.generation}
            AND state = 'active'`);
          if (updated.changes !== 1) throw new Error('OIDC browser lifecycle close CAS failed');
          return 'closed';
        },
        { behavior: 'immediate' },
      );
      return Promise.resolve(closure);
    });
  }

  private revokeCurrent(
    tx: Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0],
    lifecycle: StoredLifecycle,
    revokedAt: number,
  ): void {
    // Proof: removing this insert let replacement/closure return success while
    // the old/current exact credential remained usable across connections.
    tx.run(sql`INSERT INTO browser_credential_revocations
      (kind, user_id, credential_digest, expires_at, revoked_at)
      VALUES (${lifecycle.current_kind}, ${lifecycle.user_id}, ${lifecycle.current_digest},
        ${lifecycle.current_expires_at}, ${revokedAt})
      ON CONFLICT (kind, user_id, credential_digest) DO NOTHING`);
    const rows = tx.all<StoredRevocation>(sql`SELECT expires_at, revoked_at
      FROM browser_credential_revocations
      WHERE kind = ${lifecycle.current_kind} AND user_id = ${lifecycle.user_id}
        AND credential_digest = ${lifecycle.current_digest}`);
    if (
      rows.length !== 1 ||
      rows[0].expires_at !== lifecycle.current_expires_at ||
      !Number.isSafeInteger(rows[0].revoked_at) ||
      rows[0].revoked_at < 0
    )
      throw new Error('current OIDC credential revocation was not committed');
  }
}
