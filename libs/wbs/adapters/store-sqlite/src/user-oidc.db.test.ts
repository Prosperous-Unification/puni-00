import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { UserRepository } from './user';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;

let dir: string;
let users: UserRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-user-oidc-'));
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  users = new UserRepository(openDrizzle(path), OPEN);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * An account authors its own row: a signup has nobody else to attribute the
 * write to, and neither does the id a first federated login would mint.
 */
const selfMade = (id: string, at: number): WriteStamp => ({ at, by: id });

const identity = {
  issuer: 'https://issuer.example',
  subject: 'subject-1',
  email: 'DANY@PUNI.SHOW',
  emailVerified: true,
};

describe('UserRepository.resolveOidcIdentity', () => {
  it('returns the issuer-subject account before considering a changed email', async () => {
    await users.create(
      {
        id: 'existing',
        username: 'dany-oidc',
        passwordHash: null,
        email: 'old@puni.show',
        idpIssuer: identity.issuer,
        idpSub: identity.subject,
        createdAt: 1,
      },
      selfMade('existing', 1),
    );
    await users.create(
      {
        id: 'legacy',
        username: 'dany@puni.show',
        passwordHash: 'local-hash',
        createdAt: 2,
      },
      selfMade('legacy', 2),
    );

    const resolved = await users.resolveOidcIdentity(identity, { id: 'new' }, selfMade('new', 3));

    expect(resolved?.id).toBe('existing');
    expect((await users.findById('legacy'))?.idpSub).toBeNull();
  });

  it('links a verified email-shaped legacy username without dropping its password', async () => {
    await users.create(
      {
        id: 'legacy',
        username: 'dany@puni.show',
        passwordHash: 'local-hash',
        createdAt: 1,
      },
      selfMade('legacy', 1),
    );

    const resolved = await users.resolveOidcIdentity(identity, { id: 'new' }, selfMade('new', 2));

    expect(resolved).toMatchObject({
      id: 'legacy',
      username: 'dany@puni.show',
      passwordHash: 'local-hash',
      email: 'dany@puni.show',
      idpIssuer: identity.issuer,
      idpSub: identity.subject,
    });
  });

  it('does not let an unverified email capture a legacy account', async () => {
    await users.create(
      {
        id: 'legacy',
        username: 'dany@puni.show',
        passwordHash: 'local-hash',
        createdAt: 1,
      },
      selfMade('legacy', 1),
    );

    const resolved = await users.resolveOidcIdentity(
      { ...identity, emailVerified: false },
      { id: 'new' },
      selfMade('new', 2),
    );

    expect(resolved).toMatchObject({ id: 'new', passwordHash: null, email: null });
    expect(resolved?.username).toMatch(/^dany-[a-f0-9]+$/);
    expect((await users.findById('legacy'))?.idpSub).toBeNull();
  });

  it('leaves non-email legacy usernames local and creates a deterministic OIDC username', async () => {
    await users.create(
      {
        id: 'legacy',
        username: 'dany',
        passwordHash: 'local-hash',
        createdAt: 1,
      },
      selfMade('legacy', 1),
    );

    const first = await users.resolveOidcIdentity(identity, { id: 'new' }, selfMade('new', 2));
    const again = await users.resolveOidcIdentity(identity, { id: 'other' }, selfMade('other', 3));

    expect(first).toMatchObject({ id: 'new', email: 'dany@puni.show', passwordHash: null });
    expect(first?.username).toMatch(/^dany-[a-f0-9]+$/);
    expect(again).toEqual(first);
    expect((await users.findById('legacy'))?.idpSub).toBeNull();
  });

  it('refuses to reassign a verified email already owned by another OIDC identity', async () => {
    await users.create(
      {
        id: 'existing',
        username: 'other-oidc',
        passwordHash: null,
        email: 'dany@puni.show',
        idpIssuer: 'https://other-issuer.example',
        idpSub: 'other-subject',
        createdAt: 1,
      },
      selfMade('existing', 1),
    );

    expect(await users.resolveOidcIdentity(identity, { id: 'new' }, selfMade('new', 2))).toBeNull();
    expect(await users.findById('new')).toBeNull();
  });
});

describe('UserRepository.resolveOidcIdentity after activation', () => {
  /** Runs raw SQL against the test database, the way activation (task 7.1) would. */
  const raw = (statement: string, params: (string | number)[] = []) => {
    const db = openDatabase(join(dir, 'test.db'));
    try {
      db.run(statement, params);
    } finally {
      db.close();
    }
  };
  const rows = (statement: string) => {
    const db = openDatabase(join(dir, 'test.db'));
    try {
      return db.query(statement).all();
    } finally {
      db.close();
    }
  };
  const activate = () => {
    raw(
      "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
    );
  };
  const map = (userId: string, issuer = identity.issuer, subject = identity.subject) => {
    raw(
      'INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES (?, ?, ?, ?, 1)',
      [`map-${userId}-${subject}`, userId, issuer, subject],
    );
  };
  const federated = (id: string, email: string | null = null) =>
    users.create(
      {
        id,
        username: `${id}-oidc`,
        passwordHash: null,
        email,
        idpIssuer: identity.issuer,
        idpSub: identity.subject,
        createdAt: 1,
      },
      selfMade(id, 1),
    );
  const resolve = (overrides: Partial<typeof identity> = {}) =>
    users.resolveOidcIdentity({ ...identity, ...overrides }, { id: 'new' }, selfMade('new', 9));
  const failureOf = (answer: Promise<unknown>) =>
    answer.then(
      () => null,
      (error: unknown) => String(error),
    );

  it('answers the mapped user whatever email the token now carries', async () => {
    await federated('existing', 'old@puni.show');
    map('existing');
    activate();

    expect(await resolve({ email: 'someone@else.show' })).toMatchObject({ id: 'existing' });
  });

  it('refuses an unmapped identity whose verified email an account holds, changing nothing', async () => {
    await users.create(
      { id: 'legacy', username: 'dany@puni.show', passwordHash: 'local-hash', createdAt: 1 },
      selfMade('legacy', 1),
    );
    activate();
    const before = rows('SELECT * FROM users');

    expect(await resolve()).toBeNull();
    expect(rows('SELECT * FROM users')).toEqual(before);
    expect(rows('SELECT * FROM external_identity')).toEqual([]);
  });

  it('creates a new identity and its mapping together', async () => {
    activate();

    expect(await resolve()).toMatchObject({ id: 'new', email: 'dany@puni.show' });
    expect(rows('SELECT user_id, issuer, subject FROM external_identity')).toEqual([
      { user_id: 'new', issuer: identity.issuer, subject: identity.subject },
    ]);
    expect(await resolve()).toMatchObject({ id: 'new' });
  });

  // Proof: dropping the unmapped-legacy check made this create a second
  // account instead of throwing; watched 2026-09-28.
  it('throws on a legacy pair activation never mapped', async () => {
    await federated('existing');
    activate();

    expect(await failureOf(resolve())).toContain('was never mapped at activation');
  });

  // Proof: skipping the owner check made this read `undefined` as the user;
  // watched 2026-09-28.
  it('throws on a mapping to no user and on one its user disagrees with', async () => {
    await federated('existing');
    map('existing');
    raw(
      "PRAGMA foreign_keys = OFF; INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('map-ghost', 'ghost', 'https://issuer.example', 'subject-ghost', 1)",
    );
    activate();

    expect(await failureOf(resolve({ subject: 'subject-ghost' }))).toContain('maps to no user');
    map('existing', identity.issuer, 'subject-2');
    expect(await failureOf(resolve({ subject: 'subject-2' }))).toContain('disagrees');
  });

  it('throws on an empty issuer or subject', async () => {
    activate();

    expect(await failureOf(resolve({ subject: '' }))).toContain('empty issuer or subject');
    expect(await failureOf(resolve({ issuer: '' }))).toContain('empty issuer or subject');
  });

  it('reads the marker on every call, so activation needs no restart', async () => {
    expect(await resolve({ subject: 'before' })).toMatchObject({ id: 'new' });
    activate();

    await users.resolveOidcIdentity(
      { ...identity, subject: 'after', email: null },
      { id: 'later' },
      selfMade('later', 10),
    );

    expect(rows('SELECT user_id, subject FROM external_identity')).toEqual([
      { user_id: 'later', subject: 'after' },
    ]);
  });

  it('throws on a broken marker instead of resolving as before activation', async () => {
    raw('DROP TABLE organization_activation');

    expect(await failureOf(resolve())).toContain('marker is absent');
  });
});
