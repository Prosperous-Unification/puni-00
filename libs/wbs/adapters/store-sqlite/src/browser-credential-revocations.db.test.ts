import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { VerifiedOrganizationCredential } from '@wbs/contracts';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { SqliteBrowserCredentialRevocations } from './browser-credential-revocations';
import { openConnection, openReadOnlyConnection } from './db';
import { WriteCoordinator } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const MIGRATIONS = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const PREVIOUS = '20260929100000_add_spaces';
const credential: VerifiedOrganizationCredential = {
  kind: 'native',
  userId: 'ada',
  digest: 'a'.repeat(64),
  expiresAt: 2_000_000_000_000,
};
let folder: string;
let path: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'wbs-browser-revocation-'));
  path = join(folder, 'test.db');
  runMigrations(path, MIGRATIONS);
});
afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

async function failureOf(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
    return null;
  } catch (cause) {
    return cause;
  }
}

test('revokes exactly one credential durably across connections and preserves its first record', async () => {
  const first = openConnection(path);
  const second = openConnection(path);
  try {
    const writer = new SqliteBrowserCredentialRevocations(first.db, new WriteCoordinator());
    const reader = new SqliteBrowserCredentialRevocations(second.db, new WriteCoordinator());
    expect(await reader.isRevoked(credential)).toBe(false);
    await Promise.all([writer.revoke(credential, 1234), reader.revoke(credential, 1235)]);
    expect(await reader.isRevoked(credential)).toBe(true);
    expect(await reader.isRevoked({ ...credential, digest: 'b'.repeat(64) })).toBe(false);
    expect(await reader.isRevoked({ ...credential, userId: 'bob' })).toBe(false);
    expect(await reader.isRevoked({ ...credential, kind: 'oidc' })).toBe(false);
    const rows = first.db.all<{ revoked_at: number }>(
      sql`SELECT revoked_at FROM browser_credential_revocations`,
    );
    expect(rows).toHaveLength(1);
    expect([1234, 1235]).toContain(rows[0].revoked_at);
    await writer.revoke(credential, 9999);
    // Proof: replacing DO NOTHING with an upsert made this duplicate change
    // the first revocation timestamp to 9999; watched 2026-10-01.
    expect(
      first.db.all<{ revoked_at: number }>(
        sql`SELECT revoked_at FROM browser_credential_revocations`,
      ),
    ).toEqual(rows);
    expect(
      await failureOf(() =>
        writer.revoke({ ...credential, expiresAt: credential.expiresAt + 1 }, 1236),
      ),
    ).toBeInstanceOf(Error);
    expect(
      first.db.all<{ revoked_at: number }>(
        sql`SELECT revoked_at FROM browser_credential_revocations`,
      ),
    ).toEqual(rows);
  } finally {
    first.close();
    second.close();
  }
});

test('missing, malformed or unreadable authority fails rather than answering unrevoked', async () => {
  const connection = openConnection(path);
  try {
    connection.db.run(sql`DROP TABLE browser_credential_revocations`);
    expect(
      await failureOf(() =>
        new SqliteBrowserCredentialRevocations(connection.db, new WriteCoordinator()).isRevoked(
          credential,
        ),
      ),
    ).toBeInstanceOf(Error);
  } finally {
    connection.close();
  }
  const writable = openConnection(path);
  try {
    writable.db.run(
      sql`CREATE TABLE browser_credential_revocations (kind TEXT, user_id TEXT, credential_digest TEXT, expires_at TEXT, revoked_at TEXT)`,
    );
    writable.db.run(
      sql`INSERT INTO browser_credential_revocations VALUES ('native', 'ada', ${credential.digest}, 'broken', 'broken')`,
    );
    expect(
      await failureOf(() =>
        new SqliteBrowserCredentialRevocations(writable.db, new WriteCoordinator()).isRevoked(
          credential,
        ),
      ),
    ).toBeInstanceOf(Error);
  } finally {
    writable.close();
  }
});

test('failed write is not acknowledged', async () => {
  const connection = openReadOnlyConnection(path);
  try {
    expect(
      await failureOf(() =>
        new SqliteBrowserCredentialRevocations(connection.db, new WriteCoordinator()).revoke(
          credential,
          1234,
        ),
      ),
    ).toBeInstanceOf(Error);
  } finally {
    connection.close();
  }
});

test('an unreadable read over an intact revocation table throws instead of defaulting to unrevoked', async () => {
  const connection = openConnection(path);
  try {
    expect(
      connection.db.all<{ name: string }>(
        sql`SELECT name FROM main.sqlite_master WHERE name = 'browser_credential_revocations'`,
      ),
    ).toHaveLength(1);
    connection.db.run(
      sql`CREATE TEMP VIEW browser_credential_revocations AS SELECT * FROM unreadable_revocation_source`,
    );
    // Proof: returning false before the shared SELECT made this failed read
    // answer unrevoked even though the durable table was still present.
    expect(
      await failureOf(() =>
        new SqliteBrowserCredentialRevocations(connection.db, new WriteCoordinator()).isRevoked(
          credential,
        ),
      ),
    ).toBeInstanceOf(Error);
  } finally {
    connection.close();
  }
});

test('malformed verified-key input cannot be treated as an absent revocation', async () => {
  const connection = openConnection(path);
  try {
    const revocations = new SqliteBrowserCredentialRevocations(
      connection.db,
      new WriteCoordinator(),
    );
    // Proof: removing the digest validation made this lookup answer false for
    // malformed evidence, silently treating it as unrevoked; watched 2026-10-01.
    expect(
      await failureOf(() => revocations.isRevoked({ ...credential, digest: 'broken' })),
    ).toBeInstanceOf(Error);
    expect(
      await failureOf(() => revocations.isRevoked({ ...credential, expiresAt: Number.NaN })),
    ).toBeInstanceOf(Error);
  } finally {
    connection.close();
  }
});

test('rollback refuses even an expired row and preserves its ledger; empty rollback succeeds', async () => {
  const connection = openConnection(path);
  try {
    await new SqliteBrowserCredentialRevocations(connection.db, new WriteCoordinator()).revoke(
      { ...credential, expiresAt: 1 },
      2,
    );
    expect(() => rollbackTo(path, MIGRATIONS, PREVIOUS)).toThrow();
    expect(connection.db.all(sql`SELECT kind FROM browser_credential_revocations`)).toHaveLength(1);
    connection.db.run(sql`DELETE FROM browser_credential_revocations`);
    expect(rollbackTo(path, MIGRATIONS, PREVIOUS)).toContain(
      '20261001010000_add_browser_credential_revocations',
    );
  } finally {
    connection.close();
  }
});
