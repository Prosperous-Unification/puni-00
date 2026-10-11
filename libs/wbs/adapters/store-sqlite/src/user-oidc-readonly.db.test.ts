import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { UserRepository } from './user';

const MIGRATIONS = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const pair = { issuer: 'https://issuer.example', subject: 'subject-1' };
let folder: string;
let path: string;
let users: UserRepository;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'wbs-oidc-readonly-'));
  path = join(folder, 'test.db');
  runMigrations(path, MIGRATIONS);
  users = new UserRepository(openDrizzle(path), OPEN);
});
afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

async function failureOf(operation: () => Promise<unknown>): Promise<string | null> {
  try {
    await operation();
    return null;
  } catch (cause) {
    return String(cause);
  }
}

function query(statement: string): unknown[] {
  const db = openDatabase(path);
  try {
    return db.query(statement).all();
  } finally {
    db.close();
  }
}

function run(statement: string): void {
  const db = openDatabase(path);
  try {
    db.run(statement);
  } finally {
    db.close();
  }
}

test('preactivation read-only lookup returns only an exact issuer and subject', async () => {
  await users.create(
    { id: 'local', username: 'dany@puni.show', passwordHash: 'hash', createdAt: 1 },
    { at: 1, by: 'local' },
  );
  const before = query('SELECT id, idp_issuer, idp_sub, updated_at FROM users');
  expect(await users.findExistingOidcIdentity(pair)).toBeNull();
  expect(
    await users.findExistingOidcIdentity({ issuer: pair.issuer, subject: 'different-subject' }),
  ).toBeNull();
  expect(query('SELECT id, idp_issuer, idp_sub, updated_at FROM users')).toEqual(before);
  await users.create(
    {
      id: 'federated',
      username: 'federated',
      passwordHash: null,
      idpIssuer: pair.issuer,
      idpSub: pair.subject,
      createdAt: 2,
    },
    { at: 2, by: 'federated' },
  );
  expect((await users.findExistingOidcIdentity(pair))?.id).toBe('federated');
});

test('activated read-only lookup follows only the exact durable mapping without writing', async () => {
  await users.create(
    { id: 'mapped', username: 'mapped', passwordHash: null, createdAt: 1 },
    { at: 1, by: 'mapped' },
  );
  run(
    "INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('mapping', 'mapped', 'https://issuer.example', 'subject-1', 1)",
  );
  run(
    "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
  );
  const before = query('SELECT id, email, email_verified, updated_at FROM users');
  expect((await users.findExistingOidcIdentity(pair))?.id).toBe('mapped');
  expect(
    await users.findExistingOidcIdentity({ issuer: pair.issuer, subject: 'other-subject' }),
  ).toBeNull();
  expect(query('SELECT id, email, email_verified, updated_at FROM users')).toEqual(before);
  expect(query('SELECT id FROM external_identity')).toEqual([{ id: 'mapping' }]);
});

test('activated read-only lookup throws on dangling and duplicate mapping state', async () => {
  run(
    "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
  );
  run(
    "PRAGMA foreign_keys = OFF; INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('dangling', 'absent', 'https://issuer.example', 'subject-1', 1)",
  );
  expect(await failureOf(() => users.findExistingOidcIdentity(pair))).toContain('maps to no user');
  run('DROP INDEX external_identity_issuer_subject');
  run(
    "PRAGMA foreign_keys = OFF; INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('duplicate', 'absent', 'https://issuer.example', 'subject-1', 1)",
  );
  expect(await failureOf(() => users.findExistingOidcIdentity(pair))).toContain('mapped 2 times');
});

test('activated read-only lookup refuses a legacy pair without its backfilled mapping', async () => {
  await users.create(
    {
      id: 'legacy',
      username: 'legacy',
      passwordHash: null,
      idpIssuer: pair.issuer,
      idpSub: pair.subject,
      createdAt: 1,
    },
    { at: 1, by: 'legacy' },
  );
  run(
    "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
  );
  expect(await failureOf(() => users.findExistingOidcIdentity(pair))).toContain(
    'was never mapped at activation',
  );
});
