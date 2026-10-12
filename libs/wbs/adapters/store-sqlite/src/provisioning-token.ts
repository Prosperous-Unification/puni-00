import {
  type AuditedAct,
  type AuthenticatedProvisioning,
  MOST_LIVE_PROVISIONING_TOKENS,
  PROVISIONING_ROTATION_OVERLAP_MS,
  type ProvisioningTokens,
  type ProvisioningTokenSummary,
} from '@wbs/core';
import { and, asc, count, eq, gt, isNotNull, isNull, or } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { superAdminRefusal } from './enterprise-connection';
import type { Gate } from './gate';
import { type ImmediateTransaction, writeImmediately } from './immediate-write';
import { readOrganizationActivation } from './organization-activation';
import { appendOrganizationAudit } from './organization-audit-log';
import { organizationScimToken, organizationSsoConnection } from './schema';

type Transaction = ImmediateTransaction;
type Reader = Pick<SQLiteBunDatabase, 'select'>;

const live = (at: number) =>
  and(
    isNull(organizationScimToken.revokedAt),
    or(isNull(organizationScimToken.expiresAt), gt(organizationScimToken.expiresAt, at)),
  );

function liveCount(tx: Reader, organizationId: string, at: number): number {
  const counted = tx
    .select({ n: count() })
    .from(organizationScimToken)
    .where(and(eq(organizationScimToken.organizationId, organizationId), live(at)))
    .get();
  if (counted === undefined) throw new Error('provisioning token count returned no row');
  return counted.n;
}

function hasProvenConnection(tx: Reader, organizationId: string): boolean {
  return (
    tx
      .select({ id: organizationSsoConnection.id })
      .from(organizationSsoConnection)
      .where(
        and(
          eq(organizationSsoConnection.organizationId, organizationId),
          isNotNull(organizationSsoConnection.provenAt),
        ),
      )
      .get() !== undefined
  );
}

/** @throws on a malformed stored digest or time. */
function checkedSummary(row: typeof organizationScimToken.$inferSelect): ProvisioningTokenSummary {
  if (
    !/^[0-9a-f]{64}$/.test(row.digest) ||
    !Number.isSafeInteger(row.createdAt) ||
    (row.expiresAt !== null && !Number.isSafeInteger(row.expiresAt)) ||
    (row.revokedAt !== null && !Number.isSafeInteger(row.revokedAt))
  )
    throw new Error(`provisioning token ${row.id} is malformed`);
  return {
    id: row.id,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

/** {@link ProvisioningTokens} over the shared database. */
export class ProvisioningTokenRepository implements ProvisioningTokens {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  async list(
    organizationId: string,
    actorId: string,
  ): Promise<readonly ProvisioningTokenSummary[] | 'inactive' | 'forbidden'> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      const refusal = superAdminRefusal(tx, organizationId, actorId);
      if (refusal !== null) return refusal;
      return tx
        .select()
        .from(organizationScimToken)
        .where(eq(organizationScimToken.organizationId, organizationId))
        .orderBy(asc(organizationScimToken.createdAt), asc(organizationScimToken.id))
        .all()
        .map(checkedSummary);
    });
  }

  /**
   * Proof, each watched 2026-10-12 in `enterprise-sso-stores.db.test.ts`:
   * dropping the live-count check made `stores only a digest, lists no
   * secret, and refuses a third live token` store a third; dropping the
   * proven-connection check made `refuses a token without a proven
   * connection` store one.
   */
  issue(
    organizationId: string,
    actorId: string,
    id: string,
    digest: string,
    act: AuditedAct,
  ): ReturnType<ProvisioningTokens['issue']> {
    return this.write((tx) => {
      const refusal = superAdminRefusal(tx, organizationId, actorId);
      if (refusal !== null) return { kind: refusal };
      if (!hasProvenConnection(tx, organizationId)) return { kind: 'sso_connection_unproven' };
      if (liveCount(tx, organizationId, act.stamp.at) >= MOST_LIVE_PROVISIONING_TOKENS)
        return { kind: 'token_limit' };
      const token = insertToken(tx, organizationId, id, digest, act);
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'provisioning_token_issued',
        subjectKind: 'provisioning_token',
        subjectId: id,
        detail: {},
        at: act.stamp.at,
      });
      return { kind: 'issued', token } as const;
    });
  }

  rotate(
    organizationId: string,
    actorId: string,
    tokenId: string,
    successorId: string,
    successorDigest: string,
    act: AuditedAct,
  ): ReturnType<ProvisioningTokens['rotate']> {
    return this.write((tx) => {
      const refusal = superAdminRefusal(tx, organizationId, actorId);
      if (refusal !== null) return { kind: refusal };
      const at = act.stamp.at;
      const current = tx
        .select({ id: organizationScimToken.id, expiresAt: organizationScimToken.expiresAt })
        .from(organizationScimToken)
        .where(
          and(
            eq(organizationScimToken.id, tokenId),
            eq(organizationScimToken.organizationId, organizationId),
            live(at),
          ),
        )
        .get();
      // A token already in its rotation overlap was rotated once; rotating it
      // again would extend its life, so it is no longer rotatable.
      if (current?.expiresAt !== null) return { kind: 'not_found' };
      if (!hasProvenConnection(tx, organizationId)) return { kind: 'sso_connection_unproven' };
      if (liveCount(tx, organizationId, at) + 1 > MOST_LIVE_PROVISIONING_TOKENS)
        return { kind: 'token_limit' };
      tx.update(organizationScimToken)
        .set({ expiresAt: at + PROVISIONING_ROTATION_OVERLAP_MS, ...auditOnUpdate(act.stamp) })
        .where(eq(organizationScimToken.id, tokenId))
        .run();
      const token = insertToken(tx, organizationId, successorId, successorDigest, act);
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'provisioning_token_rotated',
        subjectKind: 'provisioning_token',
        subjectId: tokenId,
        detail: {
          successor: successorId,
          previousExpiresAt: at + PROVISIONING_ROTATION_OVERLAP_MS,
        },
        at,
      });
      return { kind: 'rotated', token } as const;
    });
  }

  revoke(
    organizationId: string,
    actorId: string,
    tokenId: string,
    act: AuditedAct,
  ): Promise<'revoked' | 'inactive' | 'forbidden' | 'not_found'> {
    return this.write((tx) => {
      const refusal = superAdminRefusal(tx, organizationId, actorId);
      if (refusal !== null) return refusal;
      const revoked = tx
        .update(organizationScimToken)
        .set({ revokedAt: act.stamp.at, ...auditOnUpdate(act.stamp) })
        .where(
          and(
            eq(organizationScimToken.id, tokenId),
            eq(organizationScimToken.organizationId, organizationId),
            live(act.stamp.at),
          ),
        )
        .run();
      if (revoked.changes === 0) return 'not_found';
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'provisioning_token_revoked',
        subjectKind: 'provisioning_token',
        subjectId: tokenId,
        detail: {},
        at: act.stamp.at,
      });
      return 'revoked' as const;
    });
  }

  /**
   * One answer, null, for an unknown, expired or revoked digest and for a
   * deployment before activation, so a caller cannot tell them apart.
   *
   * Proof: dropping the revocation predicate from `live` made `answers null
   * for a revoked, unknown or malformed token` in
   * `enterprise-sso-stores.db.test.ts` return the organization; watched
   * 2026-10-12. The same fault made mounted `replays a revoked token on
   * every verb with the unknown-token 401, changing nothing`
   * (`scim-authentication.controller.db.test.ts`) answer the replay 200;
   * watched 2026-10-12.
   */
  async authenticate(digest: string, at: number): Promise<AuthenticatedProvisioning | null> {
    await Promise.resolve();
    if (!/^[0-9a-f]{64}$/.test(digest)) return null;
    return this.db.transaction((tx) => {
      if (readOrganizationActivation(tx) !== 'activated') return null;
      const row = tx
        .select()
        .from(organizationScimToken)
        .where(and(eq(organizationScimToken.digest, digest), live(at)))
        .get();
      if (row === undefined) return null;
      checkedSummary(row);
      if (row.createdBy === null)
        throw new Error(`provisioning token ${row.id} names no issuing super-admin`);
      return { tokenId: row.id, organizationId: row.organizationId, issuedBy: row.createdBy };
    });
  }

  private write<T>(work: (tx: Transaction) => T): Promise<T> {
    return writeImmediately(this.db, this.gate, work);
  }
}

function insertToken(
  tx: Transaction,
  organizationId: string,
  id: string,
  digest: string,
  act: AuditedAct,
): ProvisioningTokenSummary {
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error('provisioning token digest is malformed');
  tx.insert(organizationScimToken)
    .values({ id, organizationId, digest, ...auditOnCreate(act.stamp) })
    .run();
  return { id, createdAt: act.stamp.at, expiresAt: null, revokedAt: null };
}
