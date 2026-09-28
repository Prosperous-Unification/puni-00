import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { backfillExternalIdentities, ExternalIdentityRepository } from './external-identity';
import { OPEN } from './gate';
import { runMigrations } from './migrate';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;

describe('backfillExternalIdentities', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-external-identity-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const raw = (statement: string, params: (string | number | null)[] = []) => {
    const db = openDatabase(path);
    try {
      db.run(statement, params);
    } finally {
      db.close();
    }
  };
  const mappings = () => {
    const db = openDatabase(path);
    try {
      return db
        .query('SELECT user_id, issuer, subject FROM external_identity ORDER BY user_id')
        .all();
    } finally {
      db.close();
    }
  };
  const user = (id: string, issuer: string | null, subject: string | null) => {
    raw(
      'INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES (?, ?, NULL, ?, ?, 1)',
      [id, id, issuer, subject],
    );
  };
  const backfill = () => openDrizzle(path).transaction((tx) => backfillExternalIdentities(tx, 2));

  it('maps every legacy pair to its own user, once, and skips password-only users', () => {
    user('ada', 'https://issuer', 'sub-ada');
    user('sam', 'https://issuer', 'sub-sam');
    user('pat', null, null);

    expect(backfill()).toBe(2);
    expect(backfill()).toBe(0);
    expect(mappings()).toEqual([
      { user_id: 'ada', issuer: 'https://issuer', subject: 'sub-ada' },
      { user_id: 'sam', issuer: 'https://issuer', subject: 'sub-sam' },
    ]);
  });

  it('refuses a half, empty or non-text legacy pair, mapping nothing', () => {
    user('ada', 'https://issuer', 'sub-ada');
    user('half', 'https://issuer', null);
    expect(backfill).toThrow('partial or empty legacy identity pair');
    raw("UPDATE users SET idp_sub = '' WHERE id = 'half'");
    expect(backfill).toThrow('partial or empty legacy identity pair');
    raw("UPDATE users SET idp_sub = x'616263' WHERE id = 'half'");
    expect(backfill).toThrow('partial or empty legacy identity pair');
    expect(mappings()).toEqual([]);
  });

  it('refuses a pair already mapped to another user, mapping nothing', () => {
    user('ada', 'https://issuer', 'sub-ada');
    user('sam', 'https://issuer', 'sub-sam');
    raw(
      "INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('m1', 'sam', 'https://issuer', 'sub-ada', 1)",
    );

    expect(backfill).toThrow('is mapped to sam');
    expect(mappings()).toEqual([{ user_id: 'sam', issuer: 'https://issuer', subject: 'sub-ada' }]);
  });
});

describe('explicit Auth0 link', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-auth0-link-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const db = openDatabase(path);
    db.run(
      "UPDATE organization_activation SET state = 'activated', activated_at = 1 WHERE singleton = 1",
    );
    db.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u', 'password_user', 'hash', 1), ('v', 'other_user', 'hash', 1)",
    );
    db.close();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('links a verified pair to the proved password user without changing local IDs', async () => {
    const store = new ExternalIdentityRepository(openDrizzle(path), OPEN);
    expect(
      await store.linkPasswordIdentity(
        'u',
        { issuer: 'https://idp.test', subject: 's', email: 'u@test.example', emailVerified: true },
        { at: 2, by: 'u' },
      ),
    ).toEqual({ kind: 'linked' });
    const db = openDatabase(path);
    expect(db.query("SELECT user_id FROM external_identity WHERE subject = 's'").get()).toEqual({
      user_id: 'u',
    });
    expect(db.query("SELECT id, email, email_verified FROM users WHERE id = 'u'").get()).toEqual({
      id: 'u',
      email: 'u@test.example',
      email_verified: 1,
    });
    db.close();
  });

  it('refuses an existing pair or email belonging to another user without changing either account', async () => {
    const db = openDatabase(path);
    db.run(
      "INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('m', 'v', 'https://idp.test', 'owned', 1)",
    );
    db.run("UPDATE users SET email = 'owned@test.example', email_verified = 1 WHERE id = 'v'");
    db.close();
    const store = new ExternalIdentityRepository(openDrizzle(path), OPEN);
    expect(
      await store.linkPasswordIdentity(
        'u',
        {
          issuer: 'https://idp.test',
          subject: 'owned',
          email: 'u@test.example',
          emailVerified: true,
        },
        { at: 2, by: 'u' },
      ),
    ).toEqual({ kind: 'identity_collision' });
    expect(
      await store.linkPasswordIdentity(
        'u',
        {
          issuer: 'https://idp.test',
          subject: 'new',
          email: 'owned@test.example',
          emailVerified: true,
        },
        { at: 2, by: 'u' },
      ),
    ).toEqual({ kind: 'email_collision' });
    const check = openDatabase(path);
    expect(check.query("SELECT email FROM users WHERE id = 'u'").get()).toEqual({ email: null });
    expect(check.query('SELECT COUNT(*) AS count FROM external_identity').get()).toEqual({
      count: 1,
    });
    check.close();
  });

  it('refuses unverified identity and an inactive marker without creating a mapping', async () => {
    const store = new ExternalIdentityRepository(openDrizzle(path), OPEN);
    expect(
      await store.linkPasswordIdentity(
        'u',
        { issuer: 'https://idp.test', subject: 's', email: 'u@test.example', emailVerified: false },
        { at: 2, by: 'u' },
      ),
    ).toEqual({ kind: 'unverified' });
    const db = openDatabase(path);
    db.run('DROP TRIGGER organization_activation_no_revert');
    db.run(
      "UPDATE organization_activation SET state = 'pre_activation', activated_at = NULL WHERE singleton = 1",
    );
    db.close();
    expect(
      await store.linkPasswordIdentity(
        'u',
        { issuer: 'https://idp.test', subject: 's', email: 'u@test.example', emailVerified: true },
        { at: 2, by: 'u' },
      ),
    ).toEqual({ kind: 'inactive' });
    const check = openDatabase(path);
    expect(check.query('SELECT COUNT(*) AS count FROM external_identity').get()).toEqual({
      count: 0,
    });
    check.close();
  });

  it('refuses a link after the password credential is removed', async () => {
    const db = openDatabase(path);
    db.run("UPDATE users SET password_hash = NULL WHERE id = 'u'");
    db.close();
    const store = new ExternalIdentityRepository(openDrizzle(path), OPEN);
    expect(
      await store.linkPasswordIdentity(
        'u',
        { issuer: 'https://idp.test', subject: 's', email: 'u@test.example', emailVerified: true },
        { at: 2, by: 'u' },
      ),
    ).toEqual({ kind: 'invalid_account' });
    const check = openDatabase(path);
    expect(check.query('SELECT COUNT(*) AS count FROM external_identity').get()).toEqual({
      count: 0,
    });
    check.close();
  });

  it('refuses a new pair on an account with a different legacy OIDC pair', async () => {
    const db = openDatabase(path);
    db.run("UPDATE users SET idp_issuer = 'https://old.test', idp_sub = 'old' WHERE id = 'u'");
    db.close();
    const store = new ExternalIdentityRepository(openDrizzle(path), OPEN);
    expect(
      await store.linkPasswordIdentity(
        'u',
        {
          issuer: 'https://idp.test',
          subject: 'new',
          email: 'u@test.example',
          emailVerified: true,
        },
        { at: 2, by: 'u' },
      ),
    ).toEqual({ kind: 'identity_collision' });
    const check = openDatabase(path);
    expect(check.query('SELECT COUNT(*) AS count FROM external_identity').get()).toEqual({
      count: 0,
    });
    check.close();
  });

  it('throws on a partial legacy identity pair before linking', () => {
    const db = openDatabase(path);
    db.run("UPDATE users SET idp_issuer = 'https://old.test' WHERE id = 'u'");
    db.close();
    const store = new ExternalIdentityRepository(openDrizzle(path), OPEN);
    expect(
      store.linkPasswordIdentity(
        'u',
        {
          issuer: 'https://idp.test',
          subject: 'new',
          email: 'u@test.example',
          emailVerified: true,
        },
        { at: 2, by: 'u' },
      ),
    ).rejects.toThrow('partial legacy identity pair');
    const check = openDatabase(path);
    expect(check.query('SELECT COUNT(*) AS count FROM external_identity').get()).toEqual({
      count: 0,
    });
    check.close();
  });

  it('throws when activation left the account legacy pair unmapped', () => {
    const db = openDatabase(path);
    db.run("UPDATE users SET idp_issuer = 'https://idp.test', idp_sub = 'new' WHERE id = 'u'");
    db.close();
    const store = new ExternalIdentityRepository(openDrizzle(path), OPEN);
    expect(
      store.linkPasswordIdentity(
        'u',
        {
          issuer: 'https://idp.test',
          subject: 'new',
          email: 'u@test.example',
          emailVerified: true,
        },
        { at: 2, by: 'u' },
      ),
    ).rejects.toThrow('legacy pair has no mapping');
    const check = openDatabase(path);
    expect(check.query('SELECT COUNT(*) AS count FROM external_identity').get()).toEqual({
      count: 0,
    });
    check.close();
  });

  it('throws when another account holds an unmapped legacy pair', () => {
    const db = openDatabase(path);
    db.run("UPDATE users SET idp_issuer = 'https://idp.test', idp_sub = 'new' WHERE id = 'v'");
    db.close();
    const store = new ExternalIdentityRepository(openDrizzle(path), OPEN);
    expect(
      store.linkPasswordIdentity(
        'u',
        {
          issuer: 'https://idp.test',
          subject: 'new',
          email: 'u@test.example',
          emailVerified: true,
        },
        { at: 2, by: 'u' },
      ),
    ).rejects.toThrow('legacy pair has no mapping');
    const check = openDatabase(path);
    expect(check.query('SELECT COUNT(*) AS count FROM external_identity').get()).toEqual({
      count: 0,
    });
    check.close();
  });

  it('throws when a mapped pair belongs to another legacy account', () => {
    const db = openDatabase(path);
    db.run("UPDATE users SET idp_issuer = 'https://idp.test', idp_sub = 'new' WHERE id = 'v'");
    db.run(
      "INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('m', 'u', 'https://idp.test', 'new', 1)",
    );
    db.close();
    const store = new ExternalIdentityRepository(openDrizzle(path), OPEN);
    expect(
      store.linkPasswordIdentity(
        'u',
        {
          issuer: 'https://idp.test',
          subject: 'new',
          email: 'u@test.example',
          emailVerified: true,
        },
        { at: 2, by: 'u' },
      ),
    ).rejects.toThrow('legacy pair disagrees with mapping');
    const check = openDatabase(path);
    expect(check.query("SELECT email FROM users WHERE id = 'u'").get()).toEqual({ email: null });
    check.close();
  });
});
