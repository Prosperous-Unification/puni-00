import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { messagesOf } from './constraint';
import { type Connection, openConnection, openDatabase } from './db';
import { DomainClaimRepository } from './domain-claim';
import { ExternalIdentityRepository } from './external-identity';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { OrganizationRepository } from './organization';
import { UserRepository } from './user';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const ORGANIZATION_RECORDS = '20260927120000_add_organization_records';
/** The newest folder before this one; named so a later folder is a red test here. */
const WORK_ITEM_FACTS = '20260912120000_add_work_item_facts';
const ORGANIZATION_TABLES = [
  'external_identity',
  'organization',
  'organization_domain_claim',
  'organization_invitation',
  'organization_join_request',
  'organization_membership',
];

const stamp = (by: string, at = 10): WriteStamp => ({ at, by });

let dir: string;
let path: string;
let connection: Connection;

async function seedUsers(ids: readonly string[]): Promise<void> {
  const users = new UserRepository(connection.db, OPEN);
  for (const id of ids)
    await users.create({ id, username: id, passwordHash: 'x', createdAt: 1 }, { at: 1, by: id });
}

function tableNames(): string[] {
  const db = openDatabase(path);
  try {
    return db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-organization-records-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  connection = openConnection(path);
  await seedUsers(['u-a', 'u-b', 'u-c']);
});

afterEach(() => {
  connection.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('ExternalIdentityRepository', () => {
  it('maps a verified issuer/subject to one local user and refuses a second user', async () => {
    // Proof: with `external_identity_issuer_subject` made a plain index in the
    // migration, this case and the next failed on `SQLiteError: ON CONFLICT
    // clause does not match any PRIMARY KEY or UNIQUE constraint` — the
    // repository cannot map at all without the uniqueness. Observed 2026-09-27.
    const identities = new ExternalIdentityRepository(connection.db, OPEN);
    const pair = { issuer: 'https://tenant.auth0.com/', subject: 'auth0|1' };

    expect(await identities.map({ id: 'x1', userId: 'u-a', ...pair }, stamp('u-a'))).toEqual({
      kind: 'mapped',
    });
    expect(await identities.map({ id: 'x2', userId: 'u-b', ...pair }, stamp('u-b'))).toEqual({
      kind: 'collision',
      userId: 'u-a',
    });
    expect(await identities.findUserId(pair)).toBe('u-a');
  });

  it('treats remapping the same pair to the same user as already mapped', async () => {
    const identities = new ExternalIdentityRepository(connection.db, OPEN);
    const pair = { issuer: 'https://tenant.auth0.com/', subject: 'auth0|2' };
    await identities.map({ id: 'x1', userId: 'u-a', ...pair }, stamp('u-a'));

    expect(await identities.map({ id: 'x2', userId: 'u-a', ...pair }, stamp('u-a'))).toEqual({
      kind: 'mapped',
    });
  });

  it('answers null for an unmapped pair', async () => {
    const identities = new ExternalIdentityRepository(connection.db, OPEN);
    expect(await identities.findUserId({ issuer: 'https://x/', subject: 'none' })).toBeNull();
  });
});

describe('OrganizationRepository', () => {
  it('commits the organization and its first super-admin together', async () => {
    const organizations = new OrganizationRepository(connection.db, OPEN);

    expect(
      await organizations.createForUnaffiliatedUser(
        { id: 'org-a', name: 'A' },
        'u-a',
        stamp('u-a'),
      ),
    ).toBe('created');
    expect(await organizations.listMemberships('u-a')).toEqual([
      { organizationId: 'org-a', role: 'super_admin' },
    ]);
  });

  it('refuses concurrent creation by one user, leaving exactly one organization', async () => {
    // Two connections, as blue and green would hold. The immediate transaction
    // re-reads membership after taking the write lock, so the loser sees the
    // winner's row.
    // Proof: with `if (held.n > 0) return 'already-member'` removed from
    // `createForUnaffiliatedUser`, this case failed on the `toEqual` of the two
    // outcomes (both `created`). Observed 2026-09-27.
    const other = openConnection(path);
    try {
      const outcomes = await Promise.all([
        new OrganizationRepository(connection.db, OPEN).createForUnaffiliatedUser(
          { id: 'org-1', name: 'One' },
          'u-a',
          stamp('u-a'),
        ),
        new OrganizationRepository(other.db, OPEN).createForUnaffiliatedUser(
          { id: 'org-2', name: 'Two' },
          'u-a',
          stamp('u-a'),
        ),
      ]);
      expect([...outcomes].sort()).toEqual(['already-member', 'created']);
      const db = openDatabase(path);
      try {
        expect(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM organization').get()?.n).toBe(
          1,
        );
      } finally {
        db.close();
      }
    } finally {
      other.close();
    }
  });

  it('refuses demoting or removing the final super-admin and keeps the role', async () => {
    // Proof: with `guardFinalSuperAdmin` returning null instead of reading the
    // remaining super-admin count, this case failed on
    // `Expected: "last-super-admin"`, `Received: "changed"`. Observed 2026-09-27.
    const organizations = new OrganizationRepository(connection.db, OPEN);
    await organizations.createForUnaffiliatedUser({ id: 'org-a', name: 'A' }, 'u-a', stamp('u-a'));

    expect(await organizations.changeRole('org-a', 'u-a', 'admin', stamp('u-a'))).toBe(
      'last-super-admin',
    );
    expect(await organizations.removeMember('org-a', 'u-a')).toBe('last-super-admin');
    expect(await organizations.listMemberships('u-a')).toEqual([
      { organizationId: 'org-a', role: 'super_admin' },
    ]);
  });

  it('lets one of two super-admins step down, and adds and removes ordinary members', async () => {
    const organizations = new OrganizationRepository(connection.db, OPEN);
    await organizations.createForUnaffiliatedUser({ id: 'org-a', name: 'A' }, 'u-a', stamp('u-a'));
    await organizations.addMember('org-a', 'u-b', 'super_admin', stamp('u-a'));
    await organizations.addMember('org-a', 'u-c', 'viewer', stamp('u-a'));

    expect(await organizations.changeRole('org-a', 'u-a', 'member', stamp('u-b'))).toBe('changed');
    expect(await organizations.removeMember('org-a', 'u-c')).toBe('removed');
    expect(await organizations.removeMember('org-a', 'u-c')).toBe('not-member');
    expect(await organizations.changeRole('org-a', 'u-c', 'member', stamp('u-b'))).toBe(
      'not-member',
    );
    expect(await organizations.listMemberships('u-a')).toEqual([
      { organizationId: 'org-a', role: 'member' },
    ]);
  });
});

describe('DomainClaimRepository', () => {
  async function twoOrganizationsClaiming(domain: string): Promise<DomainClaimRepository> {
    const organizations = new OrganizationRepository(connection.db, OPEN);
    await organizations.createForUnaffiliatedUser({ id: 'org-a', name: 'A' }, 'u-a', stamp('u-a'));
    await organizations.createForUnaffiliatedUser({ id: 'org-b', name: 'B' }, 'u-b', stamp('u-b'));
    const claims = new DomainClaimRepository(connection.db, OPEN);
    for (const [id, organizationId, by] of [
      ['c-a', 'org-a', 'u-a'],
      ['c-b', 'org-b', 'u-b'],
    ] as const)
      await claims.open(
        { id, organizationId, domain, challengeDigest: `digest-${id}`, challengeExpiresAt: 1000 },
        stamp(by),
      );
    return claims;
  }

  it('lets exactly one organization own a verified domain', async () => {
    // Proof: with `organization_domain_claim_owner` made a plain non-partial
    // index in the migration, this case failed on `Expected: "taken"`,
    // `Received: "verified"`. Observed 2026-09-27.
    const claims = await twoOrganizationsClaiming('example.org');

    expect(await claims.promote('c-a', 'digest-c-a', stamp('u-a', 20))).toBe('verified');
    expect(await claims.promote('c-b', 'digest-c-b', stamp('u-b', 20))).toBe('taken');
    expect(await claims.ownerOf('example.org')).toBe('org-a');
  });

  it('refuses promotion with a stale or expired challenge', async () => {
    const claims = await twoOrganizationsClaiming('example.org');

    expect(await claims.promote('c-a', 'digest-old', stamp('u-a', 20))).toBe('stale');
    expect(await claims.promote('c-a', 'digest-c-a', stamp('u-a', 1000))).toBe('stale');
    expect(await claims.ownerOf('example.org')).toBeNull();
  });
});

describe('20260927120000_add_organization_records', () => {
  it("refuses a join request pointing at another organization's invitation", () => {
    const db = openDatabase(path);
    try {
      db.run(
        "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1), ('org-b', 'B', 1)",
      );
      db.run(
        `INSERT INTO organization_invitation (id, organization_id, recipient_email, role, token_digest, expires_at, created_at)
         VALUES ('inv-b', 'org-b', 'x@example.org', 'member', 'd', 5, 1)`,
      );
      // Proof: with the composite foreign key replaced by a single-column
      // reference to `organization_invitation(id)`, this case failed on
      // `Received function did not throw`. Observed 2026-09-27.
      expect(() =>
        db.run(
          `INSERT INTO organization_join_request (id, organization_id, user_id, email, status, resolved_at, resolved_by, invitation_id, created_at)
           VALUES ('jr', 'org-a', 'u-c', 'x@example.org', 'approved', 2, 'u-a', 'inv-b', 1)`,
        ),
      ).toThrow('FOREIGN KEY constraint failed');
    } finally {
      db.close();
    }
  });

  it('refuses an invitation that offers super-admin', () => {
    const db = openDatabase(path);
    try {
      db.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
      let refusal: unknown;
      try {
        db.run(
          `INSERT INTO organization_invitation (id, organization_id, recipient_email, role, token_digest, expires_at, created_at)
           VALUES ('inv', 'org-a', 'x@example.org', 'super_admin', 'd', 5, 1)`,
        );
      } catch (err) {
        refusal = err;
      }
      expect(messagesOf(refusal).join(' ')).toContain('CHECK constraint failed');
    } finally {
      db.close();
    }
  });

  it('rolls back before activation, taking only its tables and keeping users', async () => {
    const organizations = new OrganizationRepository(connection.db, OPEN);
    await organizations.createForUnaffiliatedUser({ id: 'org-a', name: 'A' }, 'u-a', stamp('u-a'));
    const withTables = tableNames();
    for (const table of ORGANIZATION_TABLES) expect(withTables).toContain(table);
    connection.close();

    expect(rollbackTo(path, FOLDER, WORK_ITEM_FACTS)).toEqual([ORGANIZATION_RECORDS]);

    expect(tableNames()).toEqual(withTables.filter((name) => !ORGANIZATION_TABLES.includes(name)));
    const db = openDatabase(path);
    try {
      expect(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM users').get()?.n).toBe(3);
    } finally {
      db.close();
    }
    connection = openConnection(path);
  });
});
