import { LAST_USED_RESOLUTION_MS, type MachineCredentials } from '@wbs/core';
import type { MachineCredentialRecord, MachineCredentialSource } from '@wbs/domain';
import { and, eq, isNull, lte, or } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnUpdate } from './audit';
import type { Gate } from './gate';
import { writeImmediately } from './immediate-write';
import {
  MACHINE_CREDENTIAL_SOURCES,
  machineCredential,
  type MachineCredentialRow,
  machineCredentialSecret,
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
   * One conditional update, stamping `updated_at` like every update.
   *
   * Proof: with the age predicate reduced to `last_used_at <= at`, `records
   * its last use at most once a minute` in
   * `machine-credential.controller.db.test.ts` saw a use 20 s after the last
   * move `last_used_at`; watched 2026-10-22.
   */
  touchLastUsed(id: string, at: number): Promise<void> {
    return writeImmediately(this.db, this.gate, (tx) => {
      tx.update(machineCredential)
        .set({ lastUsedAt: at, ...auditOnUpdate({ at }) })
        .where(
          and(
            eq(machineCredential.id, id),
            or(
              isNull(machineCredential.lastUsedAt),
              lte(machineCredential.lastUsedAt, at - LAST_USED_RESOLUTION_MS),
            ),
          ),
        )
        .run();
    });
  }
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
