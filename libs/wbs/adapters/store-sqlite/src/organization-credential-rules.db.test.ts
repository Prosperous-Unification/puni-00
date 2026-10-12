import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { openDatabase, openDrizzle } from './db';
import { runMigrations } from './migrate';
import { SqliteOrganizationAccess } from './organization-access';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const DIGEST = 'c'.repeat(64);

/**
 * The credential rules inside {@link SqliteOrganizationAccess}: read in the
 * one membership query every resolution already made, so enforced SSO and a
 * session policy add no statement (`organization-session-policy`).
 */
describe('the organization access credential facts', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-credential-rules-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const db = openDatabase(path);
    try {
      db.run(
        "INSERT INTO users (id, username, password_hash, created_at) VALUES ('mia', 'mia', 'x', 1)",
      );
      db.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
      db.run(
        "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'mia', 'member', 1)",
      );
      db.run("UPDATE organization_activation SET state = 'activated', activated_at = 1");
      db.run(
        "INSERT INTO organization_session_policy (organization_id, max_session_seconds, created_at) VALUES ('org-a', 28800, 1)",
      );
      db.run(
        `INSERT INTO browser_auth_lifecycle (session_digest, user_id, generation, state, current_kind, current_digest, current_expires_at, opened_at)
         VALUES ('${'d'.repeat(64)}', 'mia', 1, 'active', 'oidc', '${DIGEST}', 9999999999999, 1000)`,
      );
      db.run(
        `INSERT INTO browser_auth_association (session_digest, generation, kind, credential_digest, expires_at)
         VALUES ('${'d'.repeat(64)}', 1, 'oidc', '${DIGEST}', 9999999999999)`,
      );
    } finally {
      db.close();
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** A drizzle handle that counts every statement the access issues through it. */
  function counted(db: SQLiteBunDatabase): { db: SQLiteBunDatabase; statements: () => number } {
    let statements = 0;
    const proxy = new Proxy(db, {
      get(target, property, receiver) {
        const value: unknown = Reflect.get(target, property, receiver);
        if (
          typeof value === 'function' &&
          ['all', 'get', 'run', 'values', 'select'].includes(String(property))
        )
          return (...args: unknown[]) => {
            statements++;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        return value;
      },
    });
    return { db: proxy, statements: () => statements };
  }

  const principal = {
    id: 'mia',
    authentication: { kind: 'upstream', issuer: 'https://idp.test/', subject: 'samlp|x|m' },
    organizationBinding: {
      credential: { kind: 'oidc', userId: 'mia', digest: DIGEST, expiresAt: 9_999_999_999_999 },
      cookie: 'selected',
    },
  } as const;

  // Proof: reading the policy in a second query made this count four
  // statements instead of three; watched 2026-10-12.
  it('reads the credential rules in the membership query', async () => {
    const { db, statements } = counted(openDrizzle(path));
    const access = new SqliteOrganizationAccess(
      db,
      () => Promise.resolve('org-a'),
      () => 1000,
    );
    expect((await access.resolve(principal)).ok).toBe(true);
    // The activation marker's two reads and the one joined membership read:
    // the same three statements a resolution made before the rules existed.
    expect(statements()).toBe(3);
  });

  it('applies the policy it read at the injected clock', async () => {
    const at = (now: number) =>
      new SqliteOrganizationAccess(
        openDrizzle(path),
        () => Promise.resolve('org-a'),
        () => now,
      );
    expect((await at(1000 + 28_800_000).resolve(principal)).ok).toBe(true);
    expect(await at(1000 + 28_800_001).resolve(principal)).toMatchObject({
      ok: false,
      refusal: 'reauthentication_required',
      reason: 'max_session',
    });
  });

  it('throws on a lifecycle belonging to another user', () => {
    const db = openDatabase(path);
    try {
      db.run(
        "INSERT INTO users (id, username, password_hash, created_at) VALUES ('eve', 'eve', 'x', 1)",
      );
      db.run('PRAGMA foreign_keys = OFF');
      db.run(`UPDATE browser_auth_lifecycle SET user_id = 'eve'`);
    } finally {
      db.close();
    }
    const access = new SqliteOrganizationAccess(
      openDrizzle(path),
      () => Promise.resolve('org-a'),
      () => 1000,
    );
    expect(access.resolve(principal)).rejects.toThrow(/belongs to another user/);
  });
});
