import type {
  AuditedAct,
  MachineCredentialActorRefusal,
  TrustedIssuerAdministration,
  TrustedIssuerDraft,
  TrustedIssuerRegistrationRefusal,
  TrustedIssuerSummary,
} from '@wbs/core';
import { and, asc, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate } from './audit';
import type { Gate } from './gate';
import { type ImmediateTransaction, writeImmediately } from './immediate-write';
import { roleIn } from './organization';
import { readOrganizationActivation } from './organization-activation';
import { appendOrganizationAudit } from './organization-audit-log';
import {
  machineCredential,
  machineCredentialSecret,
  organizationSsoConnection,
  organizationTrustedIssuer,
} from './schema';

type Transaction = ImmediateTransaction;
type TrustedIssuerRow = typeof organizationTrustedIssuer.$inferSelect;

/**
 * Whether the actor may administer trusted issuers of `organizationId` now:
 * `inactive` before activation, `forbidden` for a member, a viewer or a
 * non-member (A16: an issuer admits subjects for every person, so only an
 * admin or super-admin registers one).
 */
function administering(
  tx: Transaction,
  organizationId: string,
  actorId: string,
): MachineCredentialActorRefusal | 'admin' {
  if (readOrganizationActivation(tx) !== 'activated') return 'inactive';
  const role = roleIn(tx, organizationId, actorId);
  // Proof: with members admitted here, `refuses a member and a viewer every
  // trusted issuer route` in `trusted-issuer.controller.db.test.ts` answered
  // the member's list 200; watched 2026-10-22.
  if (role !== 'admin' && role !== 'super_admin') return 'forbidden';
  return 'admin';
}

/** Unrevoked credentials naming each of `ids`. */
function liveCredentialCounts(tx: Transaction, ids: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  for (const row of tx
    .select({ trustedIssuerId: machineCredential.trustedIssuerId, n: count() })
    .from(machineCredential)
    .where(
      and(
        inArray(machineCredential.trustedIssuerId, [...ids]),
        isNull(machineCredential.revokedAt),
      ),
    )
    .groupBy(machineCredential.trustedIssuerId)
    .all())
    if (row.trustedIssuerId !== null) counts.set(row.trustedIssuerId, row.n);
  return counts;
}

function summaryOf(row: TrustedIssuerRow, machineCredentials: number): TrustedIssuerSummary {
  return {
    id: row.id,
    issuer: row.issuer,
    jwksUri: row.jwksUri,
    defaultAudience: row.defaultAudience,
    ssoConnectionId: row.ssoConnectionId,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    machineCredentials,
  };
}

/** The registration refusal the organization's records give `issuer` now, or null. */
function registrationRefusal(
  tx: Transaction,
  organizationId: string,
  actorId: string,
  issuer: string,
  ssoConnectionId: string | null,
): TrustedIssuerRegistrationRefusal | null {
  const role = administering(tx, organizationId, actorId);
  if (role !== 'admin') return role;
  if (ssoConnectionId !== null) {
    const connection = tx
      .select({
        strategy: organizationSsoConnection.strategy,
        provenAt: organizationSsoConnection.provenAt,
      })
      .from(organizationSsoConnection)
      .where(
        and(
          eq(organizationSsoConnection.id, ssoConnectionId),
          eq(organizationSsoConnection.organizationId, organizationId),
        ),
      )
      .get();
    // Proof: with the organization predicate dropped, `refuses another
    // organization's connection` in `trusted-issuer.controller.db.test.ts`
    // registered on B's proven connection; watched 2026-10-22.
    if (connection === undefined) return 'unknown_sso_connection';
    // Proof: with this check removed, `refuses a SAML connection as the
    // gate` registered; watched 2026-10-22.
    if (connection.strategy !== 'oidc') return 'issuer_not_oidc';
    // Proof: with this check removed, `refuses an unproven connection as the
    // gate` registered; watched 2026-10-22.
    if (connection.provenAt === null) return 'sso_connection_unproven';
  }
  const taken = tx
    .select({ id: organizationTrustedIssuer.id })
    .from(organizationTrustedIssuer)
    .where(
      and(
        eq(organizationTrustedIssuer.organizationId, organizationId),
        eq(organizationTrustedIssuer.issuer, issuer),
      ),
    )
    .get();
  return taken === undefined ? null : 'issuer_taken';
}

/** The audit detail of a trusted issuer act: its URLs, never a subject (A17). */
function auditDetail(row: TrustedIssuerRow) {
  return {
    issuer: row.issuer,
    jwksUri: row.jwksUri,
    defaultAudience: row.defaultAudience,
    ssoConnectionId: row.ssoConnectionId,
  };
}

/** {@link TrustedIssuerAdministration} over the shared database. */
export class TrustedIssuerAdministrationRepository implements TrustedIssuerAdministration {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  async list(
    organizationId: string,
    actorId: string,
  ): Promise<readonly TrustedIssuerSummary[] | MachineCredentialActorRefusal> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      const role = administering(tx, organizationId, actorId);
      if (role !== 'admin') return role;
      const rows = tx
        .select()
        .from(organizationTrustedIssuer)
        .where(eq(organizationTrustedIssuer.organizationId, organizationId))
        .orderBy(asc(organizationTrustedIssuer.createdAt), asc(organizationTrustedIssuer.id))
        .all();
      const counts = liveCredentialCounts(
        tx,
        rows.map((row) => row.id),
      );
      return rows.map((row) => summaryOf(row, counts.get(row.id) ?? 0));
    });
  }

  async checkRegistration(
    organizationId: string,
    actorId: string,
    issuer: string,
    ssoConnectionId: string | null,
  ): Promise<TrustedIssuerRegistrationRefusal | 'ready'> {
    await Promise.resolve();
    return this.db.transaction(
      (tx) => registrationRefusal(tx, organizationId, actorId, issuer, ssoConnectionId) ?? 'ready',
    );
  }

  /**
   * Proof: with the audit append's failure caught and dropped, `stores no
   * trusted issuer when the audit row cannot be written` in
   * `trusted-issuer.controller.db.test.ts` answered 201 instead of 500;
   * watched 2026-10-22.
   */
  register(
    organizationId: string,
    actorId: string,
    draft: TrustedIssuerDraft,
    act: AuditedAct,
  ): ReturnType<TrustedIssuerAdministration['register']> {
    return writeImmediately(this.db, this.gate, (tx) => {
      const refused = registrationRefusal(
        tx,
        organizationId,
        actorId,
        draft.issuer,
        draft.ssoConnectionId,
      );
      if (refused !== null) return { kind: refused };
      tx.insert(organizationTrustedIssuer)
        .values({
          id: draft.id,
          organizationId,
          issuer: draft.issuer,
          jwksUri: draft.jwksUri,
          defaultAudience: draft.defaultAudience,
          ssoConnectionId: draft.ssoConnectionId,
          ...auditOnCreate(act.stamp),
        })
        .run();
      const row = tx
        .select()
        .from(organizationTrustedIssuer)
        .where(eq(organizationTrustedIssuer.id, draft.id))
        .get();
      if (row === undefined)
        throw new Error(`trusted issuer ${draft.id} vanished inside its write`);
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'trusted_issuer_registered',
        subjectKind: 'trusted_issuer',
        subjectId: draft.id,
        detail: auditDetail(row),
        at: act.stamp.at,
      });
      return { kind: 'registered', issuer: summaryOf(row, 0) } as const;
    });
  }

  remove(
    organizationId: string,
    actorId: string,
    id: string,
    act: AuditedAct,
  ): ReturnType<TrustedIssuerAdministration['remove']> {
    return writeImmediately(this.db, this.gate, (tx) => {
      const role = administering(tx, organizationId, actorId);
      if (role !== 'admin') return role;
      const row = tx
        .select()
        .from(organizationTrustedIssuer)
        .where(
          and(
            eq(organizationTrustedIssuer.id, id),
            eq(organizationTrustedIssuer.organizationId, organizationId),
          ),
        )
        .get();
      if (row === undefined) return 'not_found';
      const live = liveCredentialCounts(tx, [id]).get(id) ?? 0;
      // Proof: with this refusal removed, `refuses removing an issuer two
      // live credentials name` in `trusted-issuer.controller.db.test.ts`
      // failed on the foreign key with 500 instead of 409; watched 2026-10-22.
      if (live > 0) return { kind: 'in_use', machineCredentials: live } as const;
      // Revoked credentials naming it go with it: `trusted_issuer_id` has no
      // `ON DELETE`, and an OIDC row must name a trusted issuer. Their audit
      // rows keep their history. An OIDC credential holds no secret, but
      // its rows are cleared by id all the same.
      const revoked = tx
        .select({ id: machineCredential.id })
        .from(machineCredential)
        .where(
          and(eq(machineCredential.trustedIssuerId, id), isNotNull(machineCredential.revokedAt)),
        )
        .all()
        .map((each) => each.id);
      if (revoked.length > 0) {
        tx.delete(machineCredentialSecret)
          .where(inArray(machineCredentialSecret.credentialId, revoked))
          .run();
        tx.delete(machineCredential).where(inArray(machineCredential.id, revoked)).run();
      }
      tx.delete(organizationTrustedIssuer).where(eq(organizationTrustedIssuer.id, id)).run();
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'trusted_issuer_removed',
        subjectKind: 'trusted_issuer',
        subjectId: id,
        detail: { ...auditDetail(row), revokedCredentialsRemoved: revoked.length },
        at: act.stamp.at,
      });
      return 'removed' as const;
    });
  }
}
