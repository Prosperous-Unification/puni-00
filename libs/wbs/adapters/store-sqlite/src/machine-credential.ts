import {
  LAST_USED_RESOLUTION_MS,
  type LastUseOutcome,
  type MachineCredentials,
  type OidcCredentialRecord,
  type TrustedIssuerRegistration,
} from '@wbs/core';
import type { MachineCredentialRecord, MachineCredentialSource } from '@wbs/domain';
import { and, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnUpdate } from './audit';
import type { Gate } from './gate';
import { writeImmediately } from './immediate-write';
import {
  MACHINE_CREDENTIAL_SOURCES,
  machineCredential,
  type MachineCredentialRow,
  machineCredentialSecret,
  organizationTrustedIssuer,
  person,
} from './schema';

const DIGEST = /^[0-9a-f]{64}$/;

/** {@link MachineCredentials} over the shared database. */
export class MachineCredentialRepository implements MachineCredentials {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /**
   * One read of the credential joined to its person's current binding, and
   * one of its secrets. Nothing here filters revoked credentials or expired
   * secrets: {@link admitMachineCredential} decides, so one decision covers
   * every source.
   *
   * @throws on a malformed stored source, time or digest.
   *
   * Proof: each of the three shape checks removed in turn made its case of
   * `fails as a server error on a malformed stored …` in
   * `machine-credential.controller.db.test.ts` fail; watched 2026-10-22.
   */
  async findById(id: string): Promise<MachineCredentialRecord | null> {
    await Promise.resolve();
    const row = this.db
      .select({ credential: machineCredential, boundAccountId: person.accountId })
      .from(machineCredential)
      .innerJoin(person, eq(person.id, machineCredential.personId))
      .where(eq(machineCredential.id, id))
      .get();
    if (row === undefined) return null;
    const secrets = this.db
      .select({
        digest: machineCredentialSecret.digest,
        expiresAt: machineCredentialSecret.expiresAt,
      })
      .from(machineCredentialSecret)
      .where(eq(machineCredentialSecret.credentialId, id))
      .all();
    for (const secret of secrets)
      if (
        !DIGEST.test(secret.digest) ||
        (secret.expiresAt !== null && !Number.isSafeInteger(secret.expiresAt))
      )
        throw new Error(`a secret of machine credential ${id} is malformed`);
    return {
      id,
      organizationId: row.credential.organizationId,
      personId: row.credential.personId,
      source: checkedSource(row.credential),
      boundAccountId: row.boundAccountId,
      revokedAt: checkedTime(row.credential.revokedAt, id),
      trustedIssuerId: row.credential.trustedIssuerId,
      mcpFamilyId: row.credential.mcpFamilyId,
      secrets,
    };
  }

  /**
   * @throws when a registration's audience is null, which its triggers
   * refuse (trusted state).
   */
  async trustedRegistrationsOf(issuer: string): Promise<readonly TrustedIssuerRegistration[]> {
    await Promise.resolve();
    return this.db
      .select({
        id: organizationTrustedIssuer.id,
        organizationId: organizationTrustedIssuer.organizationId,
        audience: organizationTrustedIssuer.defaultAudience,
        jwksUri: organizationTrustedIssuer.jwksUri,
      })
      .from(organizationTrustedIssuer)
      .where(eq(organizationTrustedIssuer.issuer, issuer))
      .orderBy(organizationTrustedIssuer.id)
      .all()
      .map((row) => {
        if (row.audience === null) throw new Error(`trusted issuer ${row.id} has no audience`);
        return { ...row, audience: row.audience };
      });
  }

  /**
   * One read of the credential joined to its person's binding and to its
   * trusted issuer, which must be of the credential's own organization and
   * carry the credential's issuer URL (task 5.2a: no foreign key ties the two
   * organizations, so this read does).
   *
   * @throws on a malformed stored source or time.
   */
  async findOidcCredential(
    trustedIssuerId: string,
    subject: string,
  ): Promise<OidcCredentialRecord | null> {
    await Promise.resolve();
    const row = this.db
      .select({ credential: machineCredential, boundAccountId: person.accountId })
      .from(machineCredential)
      .innerJoin(person, eq(person.id, machineCredential.personId))
      .innerJoin(
        organizationTrustedIssuer,
        and(
          eq(organizationTrustedIssuer.id, machineCredential.trustedIssuerId),
          // Proof: with this predicate removed, `refuses a credential that
          // names another organization's trusted issuer` in
          // `oidc-credential.controller.db.test.ts` admitted B's credential
          // through A's trusted issuer; watched 2026-10-22.
          eq(organizationTrustedIssuer.organizationId, machineCredential.organizationId),
          eq(organizationTrustedIssuer.issuer, machineCredential.issuer),
        ),
      )
      .where(
        and(
          eq(machineCredential.source, 'oidc'),
          eq(machineCredential.trustedIssuerId, trustedIssuerId),
          eq(machineCredential.subject, subject),
        ),
      )
      .get();
    if (row === undefined) return null;
    const id = row.credential.id;
    return {
      credential: {
        id,
        organizationId: row.credential.organizationId,
        personId: row.credential.personId,
        source: checkedSource(row.credential),
        boundAccountId: row.boundAccountId,
        revokedAt: checkedTime(row.credential.revokedAt, id),
        trustedIssuerId: row.credential.trustedIssuerId,
        mcpFamilyId: row.credential.mcpFamilyId,
        secrets: [],
      },
      audience: row.credential.audience,
    };
  }

  /**
   * One read of `last_used_at` outside the write turn; only a use that is due
   * (absent, or at least {@link LAST_USED_RESOLUTION_MS} older) enters the
   * turn, reads again there (a racing due request may have recorded it, or a
   * removal deleted the credential) and updates, stamping `updated_at` like
   * every update. A fresh use takes no turn, so a long write elsewhere never
   * stalls an API-key read (#668).
   *
   * Proof: with the read-first early return removed (every use entering the
   * turn), `answers while another write holds the turn when its last use is
   * fresh` in `machine-credential.controller.db.test.ts` timed out;
   * watched 2026-10-23.
   */
  async touchLastUsed(id: string, at: number): Promise<LastUseOutcome> {
    await Promise.resolve();
    const seen = lastUseOf(
      this.db
        .select({ lastUsedAt: machineCredential.lastUsedAt })
        .from(machineCredential)
        .where(eq(machineCredential.id, id))
        .get(),
      at,
    );
    if (seen !== 'due') return seen;
    return writeImmediately(this.db, this.gate, (tx): LastUseOutcome => {
      const current = lastUseOf(
        tx
          .select({ lastUsedAt: machineCredential.lastUsedAt })
          .from(machineCredential)
          .where(eq(machineCredential.id, id))
          .get(),
        at,
      );
      if (current !== 'due') return current;
      tx.update(machineCredential)
        .set({ lastUsedAt: at, ...auditOnUpdate({ at }) })
        .where(eq(machineCredential.id, id))
        .run();
      return 'recorded';
    });
  }
}

/**
 * Whether a use at `at` is due given the stored row: `'absent'` with no row,
 * `'fresh'` within {@link LAST_USED_RESOLUTION_MS} of the last recorded use.
 *
 * Proof: with the age comparison reduced to `lastUsedAt > at` (a use read as
 * due once any time passed), `records its last use at most once a minute` in
 * `machine-credential.controller.db.test.ts` saw a use 20 s after the last
 * move `last_used_at`; watched 2026-10-23.
 */
function lastUseOf(
  row: { readonly lastUsedAt: number | null } | undefined,
  at: number,
): 'absent' | 'fresh' | 'due' {
  if (row === undefined) return 'absent';
  if (row.lastUsedAt !== null && row.lastUsedAt > at - LAST_USED_RESOLUTION_MS) return 'fresh';
  return 'due';
}

/** @throws on a source outside {@link MACHINE_CREDENTIAL_SOURCES}. */
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
