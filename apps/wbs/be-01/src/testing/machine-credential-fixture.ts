import { digestMachineSecret, newMachineKey } from '@wbs/core';
import type { Database } from 'bun:sqlite';

/** What {@link issueApiKey} stores: an API-key credential of `organizationId` pinned to `personId`. */
export interface ApiKeyFixture {
  readonly organizationId: string;
  readonly personId: string;
  readonly issuedBy: string;
  readonly name?: string;
}

/**
 * Stores an API-key credential and its first secret's digest straight into
 * SQLite, as slice 2's create route will, and answers its id and the whole
 * key. The key is minted at run time, never written into a source file: the
 * plaintext-secrets hook refuses a `wbs_mk_` key literal.
 */
export async function issueApiKey(
  sqlite: Database,
  fixture: ApiKeyFixture,
): Promise<{ readonly id: string; readonly key: string; readonly secretId: string }> {
  const id = crypto.randomUUID();
  const { key, secret } = newMachineKey(id);
  const secretId = crypto.randomUUID();
  sqlite.run(
    `INSERT INTO machine_credential (id, organization_id, person_id, issued_by, source, name, created_at, created_by)
     VALUES (?, ?, ?, ?, 'api_key', ?, 1, ?)`,
    [
      id,
      fixture.organizationId,
      fixture.personId,
      fixture.issuedBy,
      fixture.name ?? fixture.personId,
      fixture.issuedBy,
    ],
  );
  sqlite.run(
    `INSERT INTO machine_credential_secret (id, credential_id, digest, created_at, created_by)
     VALUES (?, ?, ?, 1, ?)`,
    [secretId, id, await digestMachineSecret(secret), fixture.issuedBy],
  );
  return { id, key, secretId };
}

/** Revokes credential `id` at `at`, as slice 2's revoke route will. */
export function revokeMachineCredential(sqlite: Database, id: string, at: number): void {
  sqlite.run('UPDATE machine_credential SET revoked_at = ? WHERE id = ?', [at, id]);
}

/** An agent person `id` of `organizationId`, bound to `accountId` or to nobody. */
export function addAgentPerson(
  sqlite: Database,
  id: string,
  organizationId: string,
  accountId: string | null,
): void {
  sqlite.run("INSERT INTO person (id, name, kind, account_id) VALUES (?, ?, 'agent', ?)", [
    id,
    `root-${id}`,
    accountId,
  ]);
  sqlite.run(
    'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
    [id, organizationId, id],
  );
}
