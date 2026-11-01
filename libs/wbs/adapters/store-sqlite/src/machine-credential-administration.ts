import {
  type ApiKeyDraft,
  type AuditedAct,
  MACHINE_ROTATION_WINDOW_MS,
  type MachineCredentialActorRefusal,
  type MachineCredentialAdministration,
  type MachineCredentialSummary,
  type MachineSecretSummary,
  type OidcCredentialDraft,
} from '@wbs/core';
import type { MachineCredentialSource, OrganizationRole } from '@wbs/domain';
import { and, asc, eq, gt, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { endLeasesOfUncredentialed } from './claim';
import type { Gate } from './gate';
import { type ImmediateTransaction, writeImmediately } from './immediate-write';
import { roleIn } from './organization';
import { readOrganizationActivation } from './organization-activation';
import { appendOrganizationAudit } from './organization-audit-log';
import {
  MACHINE_CREDENTIAL_SOURCES,
  machineCredential,
  type MachineCredentialRow,
  machineCredentialSecret,
  organizationTrustedIssuer,
  person,
  personOrganization,
} from './schema';

type Transaction = ImmediateTransaction;

const DIGEST = /^[0-9a-f]{64}$/;

/** Whether a secret admits at `at`: no expiry yet, or one after `at`. */
const unexpired = (at: number) =>
  or(isNull(machineCredentialSecret.expiresAt), gt(machineCredentialSecret.expiresAt, at));

/**
 * The actor's role when it may administer credentials of `organizationId`
 * now, or why not: `inactive` before activation, `forbidden` for a viewer or
 * a non-member. Read inside the caller's transaction.
 */
function administeringRole(
  tx: Transaction,
  organizationId: string,
  actorId: string,
): OrganizationRole | MachineCredentialActorRefusal {
  if (readOrganizationActivation(tx) !== 'activated') return 'inactive';
  const role = roleIn(tx, organizationId, actorId);
  // Proof: with viewers admitted here, `refuses a viewer every credential
  // route` in `machine-credential-admin.controller.db.test.ts` answered the
  // viewer's list 200 with the credential; watched 2026-10-22.
  if (role === null || role === 'viewer') return 'forbidden';
  return role;
}

/** Whether `role` reaches only agent persons bound to the actor's own account (A7). */
const isOwnAgentsOnly = (role: OrganizationRole): boolean => role === 'member';

/**
 * The credentials of `organizationId` an actor with `role` may administer:
 * every one for an admin, for a member only those whose person is bound to
 * the actor's account now.
 */
function reachable(organizationId: string, actorId: string, role: OrganizationRole): SQL {
  const inOrganization = eq(machineCredential.organizationId, organizationId);
  // Proof: with the own-account predicate dropped, `refuses a member the
  // credentials of another account's agent` and `narrows a member to their
  // own agents' credentials …` in `machine-credential-admin.controller.db.test.ts`
  // listed the strangers' credentials to the member; watched 2026-10-22.
  if (!isOwnAgentsOnly(role)) return inOrganization;
  const own = and(inOrganization, eq(person.accountId, actorId));
  // `and` of two conditions always answers one; an absent one would silently
  // widen the member's reach to the whole organization.
  if (own === undefined) throw new Error('the own-account predicate could not be built');
  return own;
}

/** @throws on a malformed stored source or time. */
function checkedSource(row: MachineCredentialRow): MachineCredentialSource {
  const known: readonly string[] = MACHINE_CREDENTIAL_SOURCES;
  if (!known.includes(row.source))
    throw new Error(`machine credential ${row.id} has a malformed source`);
  return row.source;
}

/** @throws on a time that is not a safe integer. */
function checkedTime(value: number | null, id: string): number | null {
  if (value !== null && !Number.isSafeInteger(value))
    throw new Error(`machine credential ${id} has a malformed time`);
  return value;
}

/** The secrets of `credentialIds` live at `at`, oldest first, by credential. */
export function liveMachineSecretsOf(
  tx: Transaction,
  credentialIds: readonly string[],
  at: number,
): Map<string, MachineSecretSummary[]> {
  const byCredential = new Map<string, MachineSecretSummary[]>();
  if (credentialIds.length === 0) return byCredential;
  const rows = tx
    .select({
      id: machineCredentialSecret.id,
      credentialId: machineCredentialSecret.credentialId,
      createdAt: machineCredentialSecret.createdAt,
      expiresAt: machineCredentialSecret.expiresAt,
    })
    .from(machineCredentialSecret)
    .where(and(inArray(machineCredentialSecret.credentialId, [...credentialIds]), unexpired(at)))
    .orderBy(asc(machineCredentialSecret.createdAt), asc(machineCredentialSecret.id))
    .all();
  for (const row of rows) {
    checkedTime(row.expiresAt, row.credentialId);
    byCredential.set(row.credentialId, [
      ...(byCredential.get(row.credentialId) ?? []),
      { id: row.id, createdAt: row.createdAt, expiresAt: row.expiresAt },
    ]);
  }
  return byCredential;
}

/** A stored credential as listed, with its live secrets: never a digest. */
export function machineCredentialSummaryOf(
  row: MachineCredentialRow,
  secrets: readonly MachineSecretSummary[],
): MachineCredentialSummary {
  const windows = secrets.flatMap((secret) =>
    secret.expiresAt === null ? [] : [secret.expiresAt],
  );
  return {
    id: row.id,
    source: checkedSource(row),
    name: row.name,
    personId: row.personId,
    issuedBy: row.issuedBy,
    issuer: row.issuer,
    subject: row.subject,
    createdAt: row.createdAt,
    lastUsedAt: checkedTime(row.lastUsedAt, row.id),
    revokedAt: checkedTime(row.revokedAt, row.id),
    rotationEndsAt: windows.length === 0 ? null : Math.max(...windows),
    secrets,
  };
}

/**
 * The audit detail of a credential act: never a secret, a digest or a subject
 * (A17), and never the free-text name, which the subject id already
 * identifies.
 */
export function machineCredentialAuditDetail(row: MachineCredentialRow, secretId: string | null) {
  return {
    source: row.source,
    personId: row.personId,
    issuedBy: row.issuedBy,
    issuer: row.issuer,
    ...(secretId === null ? {} : { secretId }),
  };
}

/** {@link MachineCredentialAdministration} over the shared database. */
export class MachineCredentialAdministrationRepository implements MachineCredentialAdministration {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  async list(
    organizationId: string,
    actorId: string,
    filter: { readonly personId?: string; readonly includeRevoked: boolean },
    at: number,
  ): Promise<readonly MachineCredentialSummary[] | MachineCredentialActorRefusal> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      const role = administeringRole(tx, organizationId, actorId);
      if (role === 'inactive' || role === 'forbidden') return role;
      const conditions: SQL[] = [reachable(organizationId, actorId, role)];
      if (filter.personId !== undefined)
        conditions.push(eq(machineCredential.personId, filter.personId));
      if (!filter.includeRevoked) conditions.push(isNull(machineCredential.revokedAt));
      const rows = tx
        .select({ credential: machineCredential })
        .from(machineCredential)
        .innerJoin(person, eq(person.id, machineCredential.personId))
        .where(and(...conditions))
        .orderBy(asc(machineCredential.createdAt), asc(machineCredential.id))
        .all()
        .map(({ credential }) => credential);
      const secrets = liveMachineSecretsOf(
        tx,
        rows.filter((row) => row.source === 'api_key').map((row) => row.id),
        at,
      );
      return rows.map((row) => machineCredentialSummaryOf(row, secrets.get(row.id) ?? []));
    });
  }

  /**
   * Proof: with the audit row appended in a second transaction after this
   * one committed, `stores nothing when the audit row cannot be written` in
   * `machine-credential-admin.controller.db.test.ts` answered 201 instead of
   * 500; watched 2026-10-22.
   */
  createApiKey(
    organizationId: string,
    actorId: string,
    draft: ApiKeyDraft,
    act: AuditedAct,
  ): ReturnType<MachineCredentialAdministration['createApiKey']> {
    if (!DIGEST.test(draft.digest)) throw new Error('machine credential digest is malformed');
    return this.write((tx) => {
      const role = administeringRole(tx, organizationId, actorId);
      if (role === 'inactive' || role === 'forbidden') return { kind: role };
      const refused = pinRefusal(tx, organizationId, actorId, role, draft);
      if (refused !== null) return { kind: refused };
      tx.insert(machineCredential)
        .values({
          id: draft.id,
          organizationId,
          personId: draft.personId,
          issuedBy: actorId,
          source: 'api_key',
          name: draft.name,
          ...auditOnCreate(act.stamp),
        })
        .run();
      tx.insert(machineCredentialSecret)
        .values({
          id: draft.secretId,
          credentialId: draft.id,
          digest: draft.digest,
          ...auditOnCreate(act.stamp),
        })
        .run();
      const row = credentialRow(tx, draft.id);
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'machine_credential_created',
        subjectKind: 'machine_credential',
        subjectId: draft.id,
        detail: machineCredentialAuditDetail(row, draft.secretId),
        at: act.stamp.at,
      });
      return {
        kind: 'created',
        credential: machineCredentialSummaryOf(row, [
          { id: draft.secretId, createdAt: act.stamp.at, expiresAt: null },
        ]),
      } as const;
    });
  }

  /**
   * As {@link createApiKey}, with no secret: the pair is the trusted issuer's
   * URL, read within this organization, and `draft.subject`.
   *
   * Proof: with the audit append's failure caught and dropped, `stores no
   * OIDC credential when the audit row cannot be written` in
   * `oidc-credential.controller.db.test.ts` answered 201 instead of 500;
   * watched 2026-10-22.
   */
  createOidc(
    organizationId: string,
    actorId: string,
    draft: OidcCredentialDraft,
    act: AuditedAct,
  ): ReturnType<MachineCredentialAdministration['createOidc']> {
    return this.write((tx) => {
      const role = administeringRole(tx, organizationId, actorId);
      if (role === 'inactive' || role === 'forbidden') return { kind: role };
      const refused = pinRefusal(tx, organizationId, actorId, role, draft);
      if (refused !== null) return { kind: refused };
      const trusted = tx
        .select({ issuer: organizationTrustedIssuer.issuer })
        .from(organizationTrustedIssuer)
        .where(
          and(
            eq(organizationTrustedIssuer.id, draft.trustedIssuerId),
            // Proof: with this predicate removed, `refuses another
            // organization's trusted issuer, writing nothing` in
            // `oidc-credential.controller.db.test.ts` created A's credential
            // on B's issuer; watched 2026-10-22.
            eq(organizationTrustedIssuer.organizationId, organizationId),
          ),
        )
        .get();
      if (trusted === undefined) return { kind: 'unknown_trusted_issuer' };
      const paired = tx
        .select({ id: machineCredential.id })
        .from(machineCredential)
        .where(
          and(
            eq(machineCredential.source, 'oidc'),
            // Proof: with this predicate replaced by the issuer URL, `binds one
            // subject in two organizations through one shared issuer URL` in
            // `oidc-credential.controller.db.test.ts` answered B 409
            // subject_taken: a cross-tenant oracle; watched 2026-10-22.
            eq(machineCredential.trustedIssuerId, draft.trustedIssuerId),
            eq(machineCredential.subject, draft.subject),
          ),
        )
        .get();
      if (paired !== undefined) return { kind: 'subject_taken' };
      tx.insert(machineCredential)
        .values({
          id: draft.id,
          organizationId,
          personId: draft.personId,
          issuedBy: actorId,
          source: 'oidc',
          name: draft.name,
          issuer: trusted.issuer,
          subject: draft.subject,
          audience: draft.audience,
          trustedIssuerId: draft.trustedIssuerId,
          ...auditOnCreate(act.stamp),
        })
        .run();
      const row = credentialRow(tx, draft.id);
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'machine_credential_created',
        subjectKind: 'machine_credential',
        subjectId: draft.id,
        detail: machineCredentialAuditDetail(row, null),
        at: act.stamp.at,
      });
      return { kind: 'created', credential: machineCredentialSummaryOf(row, []) } as const;
    });
  }

  rotateApiKey(
    organizationId: string,
    actorId: string,
    credentialId: string,
    successor: { readonly secretId: string; readonly digest: string },
    act: AuditedAct,
  ): ReturnType<MachineCredentialAdministration['rotateApiKey']> {
    if (!DIGEST.test(successor.digest)) throw new Error('machine credential digest is malformed');
    return this.write((tx) => {
      const role = administeringRole(tx, organizationId, actorId);
      if (role === 'inactive' || role === 'forbidden') return { kind: role };
      const row = liveReachable(tx, organizationId, actorId, role, credentialId);
      if (row === undefined) return { kind: 'not_found' };
      // Proof: with this check removed, `refuses rotation of a consent
      // credential at the issuer, changing nothing` answered 201; watched
      // 2026-10-22.
      if (row.source !== 'api_key') return { kind: 'rotation_at_issuer' };
      const at = act.stamp.at;
      const open = tx
        .select({ id: machineCredentialSecret.id })
        .from(machineCredentialSecret)
        .where(
          and(
            eq(machineCredentialSecret.credentialId, credentialId),
            gt(machineCredentialSecret.expiresAt, at),
          ),
        )
        .get();
      // Proof: with this check removed, `refuses a second rotation inside the
      // window, and allows one after it` answered 201; watched 2026-10-22.
      if (open !== undefined) return { kind: 'rotation_in_progress' };
      const previousExpiresAt = at + MACHINE_ROTATION_WINDOW_MS;
      tx.update(machineCredentialSecret)
        .set({ expiresAt: previousExpiresAt, ...auditOnUpdate(act.stamp) })
        .where(
          and(
            eq(machineCredentialSecret.credentialId, credentialId),
            isNull(machineCredentialSecret.expiresAt),
          ),
        )
        .run();
      tx.insert(machineCredentialSecret)
        .values({
          id: successor.secretId,
          credentialId,
          digest: successor.digest,
          ...auditOnCreate(act.stamp),
        })
        .run();
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'machine_credential_rotated',
        subjectKind: 'machine_credential',
        subjectId: credentialId,
        detail: { ...machineCredentialAuditDetail(row, successor.secretId), previousExpiresAt },
        at,
      });
      return { kind: 'rotated', previousExpiresAt } as const;
    });
  }

  revoke(
    organizationId: string,
    actorId: string,
    credentialId: string,
    act: AuditedAct,
  ): Promise<'revoked' | MachineCredentialActorRefusal | 'not_found'> {
    return this.write((tx) => {
      const role = administeringRole(tx, organizationId, actorId);
      if (role === 'inactive' || role === 'forbidden') return role;
      const row = liveReachable(tx, organizationId, actorId, role, credentialId);
      if (row === undefined) return 'not_found';
      const at = act.stamp.at;
      tx.update(machineCredential)
        .set({ revokedAt: at, ...auditOnUpdate(act.stamp) })
        .where(eq(machineCredential.id, credentialId))
        .run();
      // Every secret ends with its credential, so no row read alone ever
      // looks live again; the admission decision refuses on `revoked_at`.
      tx.update(machineCredentialSecret)
        .set({ expiresAt: at, ...auditOnUpdate(act.stamp) })
        .where(and(eq(machineCredentialSecret.credentialId, credentialId), unexpired(at)))
        .run();
      // The person's last live credential takes its claim leases with it
      // (`wbs-claim-leases` L8); the sweep releases the claims.
      // Proof: with this call removed, `keeps the leases when one of two keys
      // is revoked, and ends them with the last` (claim-lease.db.test.ts) kept
      // them in force (9 pass, 1 fail); watched 2026-10-23.
      endLeasesOfUncredentialed(tx, row.personId, at);
      appendOrganizationAudit(tx, {
        id: act.auditId,
        organizationId,
        actorId: act.actor,
        action: 'machine_credential_revoked',
        subjectKind: 'machine_credential',
        subjectId: credentialId,
        detail: machineCredentialAuditDetail(row, null),
        at,
      });
      return 'revoked' as const;
    });
  }

  private write<T>(work: (tx: Transaction) => T): Promise<T> {
    return writeImmediately(this.db, this.gate, work);
  }
}

/**
 * Why `draft` may not be pinned by an actor with `role`, or null: the
 * person-side refusals every source shares (A7, A12), then a live name.
 */
function pinRefusal(
  tx: Transaction,
  organizationId: string,
  actorId: string,
  role: OrganizationRole,
  draft: { readonly personId: string; readonly name: string },
):
  'unknown_person' | 'forbidden' | 'person_not_bound' | 'account_not_member' | 'name_taken' | null {
  const pinned = tx
    .select({ accountId: person.accountId })
    .from(person)
    .innerJoin(personOrganization, eq(personOrganization.resourceId, person.id))
    .where(
      and(
        eq(person.id, draft.personId),
        eq(personOrganization.organizationId, organizationId),
        eq(person.kind, 'agent'),
      ),
    )
    .get();
  // Proof: with the organization predicate dropped from this read, `refuses
  // a person of another organization or of kind person` reached B's agent
  // and answered 409 account_not_member instead of 404; watched 2026-10-22.
  if (pinned === undefined) return 'unknown_person';
  // Proof: with this check removed, `refuses a member another account's
  // agent, writing nothing` answered 201 for Dany's agent; watched
  // 2026-10-22.
  if (isOwnAgentsOnly(role) && pinned.accountId !== actorId) return 'forbidden';
  if (pinned.accountId === null) return 'person_not_bound';
  // Proof: with this check removed, `refuses an agent bound to an account
  // that is no member` created the credential; watched 2026-10-22.
  if (roleIn(tx, organizationId, pinned.accountId) === null) return 'account_not_member';
  const named = tx
    .select({ id: machineCredential.id })
    .from(machineCredential)
    .where(
      and(
        eq(machineCredential.organizationId, organizationId),
        eq(machineCredential.name, draft.name),
        isNull(machineCredential.revokedAt),
      ),
    )
    .get();
  return named === undefined ? null : 'name_taken';
}

/** The unrevoked credential `credentialId` when the actor reaches it, else undefined. */
function liveReachable(
  tx: Transaction,
  organizationId: string,
  actorId: string,
  role: OrganizationRole,
  credentialId: string,
): MachineCredentialRow | undefined {
  return tx
    .select({ credential: machineCredential })
    .from(machineCredential)
    .innerJoin(person, eq(person.id, machineCredential.personId))
    .where(
      and(
        eq(machineCredential.id, credentialId),
        isNull(machineCredential.revokedAt),
        reachable(organizationId, actorId, role),
      ),
    )
    .get()?.credential;
}

/** @throws when the row just written cannot be read back. */
function credentialRow(tx: Transaction, id: string): MachineCredentialRow {
  const row = tx.select().from(machineCredential).where(eq(machineCredential.id, id)).get();
  if (row === undefined) throw new Error(`machine credential ${id} vanished inside its write`);
  return row;
}
