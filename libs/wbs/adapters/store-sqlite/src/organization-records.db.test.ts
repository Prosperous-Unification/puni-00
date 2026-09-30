import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DomainVerificationSnapshot, WriteStamp } from '@wbs/core';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';

import { messagesOf } from './constraint';
import { type Connection, openConnection, openDatabase } from './db';
import { DomainClaimRepository } from './domain-claim';
import { ExternalIdentityRepository } from './external-identity';
import { OPEN, WriteCoordinator } from './gate';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { OrganizationRepository } from './organization';
import { UserRepository } from './user';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const ORGANIZATION_RECORDS = '20260927120000_add_organization_records';
/**
 * The ownership side tables `organization-ownership-and-access`
 * adds, stamped after {@link ORGANIZATION_RECORDS} and reversed before it.
 */
const ORGANIZATION_OWNERSHIP = '20260927130000_add_organization_ownership';
/**
 * The durable activation marker, stamped after main's step code column and
 * reversed before it.
 */
const ORGANIZATION_ACTIVATION = '20260927180000_add_organization_activation';
/** The step code column `address-step-nodes` adds, reversed first. */
const STEP_CODE = '20260927150000_add_step_code';
/** The step allowance column `add-project-step-estimate-allowances` adds, stamped after {@link STEP_CODE}. */
const STEP_ALLOWANCE = '20260927170000_add_step_allowance';
/**
 * The legacy bridge triggers, stamped after
 * {@link ORGANIZATION_ACTIVATION} and reversed before it.
 */
const ORGANIZATION_BRIDGE = '20260927190000_add_organization_bridge';
/**
 * The newest: the triggers that freeze organization ownership, stamped after
 * {@link ORGANIZATION_BRIDGE} and reversed before it.
 */
const ORGANIZATION_FROZEN = '20260927200000_freeze_organization_ownership';
const TYPED_DEPENDENCY = '20260927213000_add_typed_dependency';
/** The newest folder before this one; named so a later folder is a red test here. */
const WORK_ITEM_FACTS = '20260912120000_add_work_item_facts';
const ORGANIZATION_TABLES = [
  'organization_activation',
  'external_system_organization',
  'person_organization',
  'project_organization',
  'saved_plan_organization',
  'organization_audit',
  'project_solution',
  'delegation_use',
  'service_organization',
  'service_team_organization',
  'tag_organization',
  'work_item_type_organization',
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
    const identities = new ExternalIdentityRepository(connection.db, OPEN);
    const pair = { issuer: 'https://tenant.auth0.com/', subject: 'auth0|1' };

    expect(
      await identities.mapIdentity({ id: 'x1', userId: 'u-a', ...pair }, stamp('u-a')),
    ).toEqual({
      kind: 'mapped',
    });
    expect(
      await identities.mapIdentity({ id: 'x2', userId: 'u-b', ...pair }, stamp('u-b')),
    ).toEqual({
      kind: 'collision',
      userId: 'u-a',
    });
    expect(await identities.findUserId(pair)).toBe('u-a');
  });

  it('treats remapping the same pair to the same user as already mapped', async () => {
    const identities = new ExternalIdentityRepository(connection.db, OPEN);
    const pair = { issuer: 'https://tenant.auth0.com/', subject: 'auth0|2' };
    await identities.mapIdentity({ id: 'x1', userId: 'u-a', ...pair }, stamp('u-a'));

    expect(
      await identities.mapIdentity({ id: 'x2', userId: 'u-a', ...pair }, stamp('u-a')),
    ).toEqual({
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

  it('leaves no organization behind when the first membership cannot be written', async () => {
    const organizations = new OrganizationRepository(connection.db, OPEN);

    let refusal: unknown;
    try {
      await organizations.createForUnaffiliatedUser(
        { id: 'org-x', name: 'X' },
        'no-such-user',
        stamp('u-a'),
      );
    } catch (err) {
      refusal = err;
    }
    expect(messagesOf(refusal).join(' ')).toContain('FOREIGN KEY constraint failed');
    const db = openDatabase(path);
    try {
      expect(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM organization').get()?.n).toBe(
        0,
      );
    } finally {
      db.close();
    }
  });

  it('refuses a second creation by one user across two connections', async () => {
    // Two connections, as blue and green would hold. bun:sqlite runs each
    // transaction to completion synchronously, so these serialize rather than
    // interleave: this watches the recheck, not lock contention. Contention
    // cannot create a duplicate either way — a deferred loser would fail its
    // lock upgrade with SQLITE_BUSY — and `immediate` turns that error into
    // the modeled refusal. The cross-process onboarding race is task 4.3's.
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

describe('OrganizationRepository.administer', () => {
  /** org-a with u-a and u-b as super-admins and u-c as a member; u-c is also a member of org-b. */
  async function seeded(): Promise<OrganizationRepository> {
    const organizations = new OrganizationRepository(connection.db, OPEN);
    await organizations.createForUnaffiliatedUser({ id: 'org-a', name: 'A' }, 'u-a', stamp('u-a'));
    await organizations.addMember('org-a', 'u-b', 'super_admin', stamp('u-a'));
    await organizations.addMember('org-a', 'u-c', 'member', stamp('u-a'));
    const db = openDatabase(path);
    try {
      db.run("INSERT INTO organization (id, name, legacy, created_at) VALUES ('org-b', 'B', 0, 1)");
      db.run(
        "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-b', 'u-c', 'member', 1)",
      );
    } finally {
      db.close();
    }
    return organizations;
  }

  it('lets exactly one of two super-admins leave when both try across two connections', async () => {
    // bun:sqlite runs each immediate transaction to completion, so these
    // serialize: this watches the recheck inside the transaction, which is
    // what refuses the second leaver.
    const organizations = await seeded();
    const other = openConnection(path);
    try {
      const outcomes = await Promise.all([
        organizations.administer('org-a', 'u-a', 'u-a', null, stamp('u-a')),
        new OrganizationRepository(other.db, OPEN).administer(
          'org-a',
          'u-b',
          'u-b',
          null,
          stamp('u-b'),
        ),
      ]);
      expect(outcomes.map((each) => (each.ok ? 'removed' : each.refusal)).sort()).toEqual([
        'last_super_admin',
        'removed',
      ]);
    } finally {
      other.close();
    }
  });

  it("refuses an actor demoted on another connection after the request's access resolved", async () => {
    const organizations = await seeded();
    const other = openConnection(path);
    try {
      await new OrganizationRepository(other.db, OPEN).administer(
        'org-a',
        'u-b',
        'u-a',
        'member',
        stamp('u-b'),
      );
      expect(await organizations.administer('org-a', 'u-a', 'u-c', 'viewer', stamp('u-a'))).toEqual(
        { ok: false, refusal: 'forbidden' },
      );
    } finally {
      other.close();
    }
  });

  it('changes and removes only the membership in the given organization', async () => {
    const organizations = await seeded();
    expect((await organizations.administer('org-a', 'u-a', 'u-c', 'viewer', stamp('u-a'))).ok).toBe(
      true,
    );
    expect(await organizations.listMemberships('u-c')).toEqual([
      { organizationId: 'org-a', role: 'viewer' },
      { organizationId: 'org-b', role: 'member' },
    ]);
    expect((await organizations.administer('org-a', 'u-a', 'u-c', null, stamp('u-a'))).ok).toBe(
      true,
    );
    expect(await organizations.listMemberships('u-c')).toEqual([
      { organizationId: 'org-b', role: 'member' },
    ]);
  });
});

describe('DomainClaimRepository', () => {
  it('types pending snapshots with a required expiry and rotation snapshots with a previous deadline', () => {
    type PendingWithoutExpiry = {
      kind: 'initial';
      phase: 'pending';
      id: string;
      domain: string;
      challengeDigest: string;
      challengeExpiresAt: null;
      previousProofDigest: null;
      previousProofValidUntil: null;
    } extends DomainVerificationSnapshot
      ? true
      : false;
    type RotationWithoutDeadline = {
      kind: 'rotation';
      phase: 'rotation';
      id: string;
      domain: string;
      challengeDigest: string;
      challengeExpiresAt: null;
      previousProofDigest: string;
      previousProofValidUntil: null;
    } extends DomainVerificationSnapshot
      ? true
      : false;
    const acceptsPendingWithoutExpiry: PendingWithoutExpiry = false;
    const acceptsRotationWithoutDeadline: RotationWithoutDeadline = false;
    expect([acceptsPendingWithoutExpiry, acceptsRotationWithoutDeadline]).toEqual([false, false]);
  });
  it('refuses a challenge that expires while verification waits for the write gate', async () => {
    await twoOrganizationsClaiming('example.org');
    connection.db.run(
      sql`UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1`,
    );
    const gate = new WriteCoordinator();
    const claims = new DomainClaimRepository(connection.db, gate);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const batch = gate.enter(async () => {
      entered.resolve(undefined);
      await release.promise;
    });
    await entered.promise;
    let now = 100;
    const verification = claims.verifyClaim(
      'org-a',
      'u-a',
      {
        id: 'c-a',
        domain: 'example.org',
        challengeDigest: 'digest-c-a',
        challengeExpiresAt: 1000,
        phase: 'pending',
      },
      'digest-c-a',
      stamp('u-a', now),
      () => now,
    );
    now = 1000;
    release.resolve(undefined);
    await batch;
    expect(await verification).toBe('stale');
    expect(
      connection.db.all(
        sql`SELECT status, challenge_digest FROM organization_domain_claim WHERE id = 'c-a'`,
      ),
    ).toEqual([{ status: 'pending', challenge_digest: 'digest-c-a' }]);
  });
  it('keeps both verification phases inert before activation', async () => {
    const organizations = new OrganizationRepository(connection.db, OPEN);
    await organizations.createForUnaffiliatedUser({ id: 'org-a', name: 'A' }, 'u-a', stamp('u-a'));
    const claims = new DomainClaimRepository(connection.db, OPEN);
    await claims.openClaim(
      {
        id: 'c-a',
        organizationId: 'org-a',
        domain: 'example.org',
        challengeDigest: 'digest-c-a',
        challengeExpiresAt: 1000,
      },
      stamp('u-a'),
    );
    expect(await claims.readClaimForVerification('org-a', 'u-a', 'c-a')).toBe('inactive');
    expect(
      await claims.verifyClaim(
        'org-a',
        'u-a',
        {
          id: 'c-a',
          domain: 'example.org',
          challengeDigest: 'digest-c-a',
          challengeExpiresAt: 1000,
          phase: 'pending',
        },
        'digest-c-a',
        stamp('u-a', 20),
        () => 20,
      ),
    ).toBe('inactive');
  });
  async function twoOrganizationsClaiming(domain: string): Promise<DomainClaimRepository> {
    const organizations = new OrganizationRepository(connection.db, OPEN);
    await organizations.createForUnaffiliatedUser({ id: 'org-a', name: 'A' }, 'u-a', stamp('u-a'));
    await organizations.createForUnaffiliatedUser({ id: 'org-b', name: 'B' }, 'u-b', stamp('u-b'));
    const claims = new DomainClaimRepository(connection.db, OPEN);
    for (const [id, organizationId, by] of [
      ['c-a', 'org-a', 'u-a'],
      ['c-b', 'org-b', 'u-b'],
    ] as const)
      await claims.openClaim(
        { id, organizationId, domain, challengeDigest: `digest-${id}`, challengeExpiresAt: 1000 },
        stamp(by),
      );
    return claims;
  }

  it('lets exactly one organization own a verified domain', async () => {
    const claims = await twoOrganizationsClaiming('example.org');

    expect(await claims.promoteClaim('c-a', 'digest-c-a', stamp('u-a', 20))).toBe('verified');
    expect(await claims.promoteClaim('c-b', 'digest-c-b', stamp('u-b', 20))).toBe('taken');
    expect(await claims.findOwner('example.org')).toBe('org-a');
  });

  it('never opens or promotes a claim on a public domain', async () => {
    const claims = await twoOrganizationsClaiming('example.org');

    expect(
      await claims.openClaim(
        {
          id: 'c-gmail',
          organizationId: 'org-a',
          domain: 'gmail.com',
          challengeDigest: 'digest-gmail',
          challengeExpiresAt: 1000,
        },
        stamp('u-a'),
      ),
    ).toBe('unclaimable');
    const db = openDatabase(path);
    try {
      expect(
        db.query("SELECT id FROM organization_domain_claim WHERE id = 'c-gmail'").all(),
      ).toEqual([]);
      db.run(
        `INSERT INTO organization_domain_claim (id, organization_id, domain, status, challenge_digest, challenge_expires_at, created_at)
         VALUES ('c-planted', 'org-a', 'outlook.com', 'pending', 'digest-planted', 1000, 1)`,
      );
    } finally {
      db.close();
    }
    expect(await claims.promoteClaim('c-planted', 'digest-planted', stamp('u-a', 20))).toBe(
      'unclaimable',
    );
    expect(await claims.findOwner('outlook.com')).toBeNull();
  });

  it('refuses promotion with a stale or expired challenge', async () => {
    const claims = await twoOrganizationsClaiming('example.org');

    expect(await claims.promoteClaim('c-a', 'digest-old', stamp('u-a', 20))).toBe('stale');
    expect(await claims.promoteClaim('c-a', 'digest-c-a', stamp('u-a', 1000))).toBe('stale');
    expect(await claims.findOwner('example.org')).toBeNull();
  });

  it('reissues a pending claim in place and invalidates its old digest', async () => {
    const claims = await twoOrganizationsClaiming('example.org');
    const marker = openDatabase(path);
    marker.run(
      "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
    );
    marker.close();
    expect(
      await claims.reissueClaim(
        'org-a',
        'u-a',
        'example.org',
        'digest-new',
        2000,
        stamp('u-a', 20),
      ),
    ).toEqual({ kind: 'issued', id: 'c-a' });
    expect(await claims.promoteClaim('c-a', 'digest-c-a', stamp('u-a', 21))).toBe('stale');
    expect(await claims.promoteClaim('c-a', 'digest-new', stamp('u-a', 21))).toBe('verified');
  });

  it('does not issue a challenge before activation', async () => {
    const claims = await twoOrganizationsClaiming('example.org');
    expect(
      await claims.reissueClaim(
        'org-a',
        'u-a',
        'example.org',
        'digest-new',
        2000,
        stamp('u-a', 20),
      ),
    ).toEqual({ kind: 'inactive' });
  });

  it('waits for a batch rollback before issuing a durable challenge', async () => {
    await twoOrganizationsClaiming('example.org');
    const marker = openDatabase(path);
    marker.run(
      "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
    );
    marker.close();
    const gate = new WriteCoordinator();
    const claims = new DomainClaimRepository(connection.db, gate);
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const batch = gate.enter(async () => {
      connection.db.run(sql`BEGIN IMMEDIATE`);
      entered.resolve(undefined);
      await release.promise;
      connection.db.run(sql`ROLLBACK`);
    });
    await entered.promise;
    let settled = false;
    const issuance = claims
      .reissueClaim('org-a', 'u-a', 'example.org', 'digest-after', 2000, stamp('u-a', 20))
      .then((issued) => {
        settled = true;
        return issued;
      });
    let settledBeforeRollback: boolean;
    try {
      for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
      settledBeforeRollback = settled;
    } finally {
      release.resolve(undefined);
      await batch;
    }
    expect(await issuance).toEqual({ kind: 'issued', id: 'c-a' });
    expect(
      connection.db.all(
        sql`SELECT challenge_digest FROM organization_domain_claim WHERE id = 'c-a'`,
      ),
    ).toEqual([{ challenge_digest: 'digest-after' }]);
    expect(settledBeforeRollback).toBe(false);
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

  /**
   * Each constraint the migration adds, refused through the migrated database.
   * One row per constraint, so removing any one of them fails exactly its row.
   */
  const refusals: readonly { constraint: string; setup: readonly string[]; write: string }[] = [
    {
      constraint: 'organization_one_legacy',
      setup: ["INSERT INTO organization (id, name, legacy, created_at) VALUES ('l1', 'L', 1, 1)"],
      write: "INSERT INTO organization (id, name, legacy, created_at) VALUES ('l2', 'L', 1, 1)",
    },
    {
      constraint: 'organization_invitation expiry',
      setup: [],
      write: `INSERT INTO organization_invitation (id, organization_id, recipient_email, role, token_digest, expires_at, created_at)
              VALUES ('inv', 'org-a', 'x@example.org', 'member', 'd', 1, 1)`,
    },
    {
      constraint: 'organization_invitation consumption',
      setup: [],
      write: `INSERT INTO organization_invitation (id, organization_id, recipient_email, role, token_digest, expires_at, consumed_at, created_at)
              VALUES ('inv', 'org-a', 'x@example.org', 'member', 'd', 5, 2, 1)`,
    },
    {
      constraint: 'organization_join_request_one_pending',
      setup: [
        `INSERT INTO organization_join_request (id, organization_id, user_id, email, status, created_at)
         VALUES ('jr1', 'org-a', 'u-c', 'c@example.org', 'pending', 1)`,
      ],
      write: `INSERT INTO organization_join_request (id, organization_id, user_id, email, status, created_at)
              VALUES ('jr2', 'org-a', 'u-c', 'c@example.org', 'pending', 1)`,
    },
    {
      constraint: 'organization_join_request resolution',
      setup: [],
      write: `INSERT INTO organization_join_request (id, organization_id, user_id, email, status, resolved_at, created_at)
              VALUES ('jr', 'org-a', 'u-c', 'c@example.org', 'pending', 2, 1)`,
    },
    {
      constraint: 'organization_domain_claim challenge pair',
      setup: [],
      write: `INSERT INTO organization_domain_claim (id, organization_id, domain, status, challenge_digest, created_at)
              VALUES ('c', 'org-a', 'example.org', 'pending', 'd', 1)`,
    },
    {
      constraint: 'organization_domain_claim previous proof pair',
      setup: [],
      write: `INSERT INTO organization_domain_claim (id, organization_id, domain, status, previous_proof_digest, created_at)
              VALUES ('c', 'org-a', 'example.org', 'pending', 'd', 1)`,
    },
    {
      constraint: 'organization_domain_claim owned proof',
      setup: [],
      write: `INSERT INTO organization_domain_claim (id, organization_id, domain, status, created_at)
              VALUES ('c', 'org-a', 'example.org', 'verified', 1)`,
    },
  ];

  for (const refusal of refusals)
    it(`refuses a row that breaks ${refusal.constraint}`, () => {
      const db = openDatabase(path);
      try {
        db.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
        for (const statement of refusal.setup) db.run(statement);
        expect(() => db.run(refusal.write)).toThrow(/constraint failed/);
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

    expect(rollbackTo(path, FOLDER, WORK_ITEM_FACTS)).toEqual([
      '20260928030000_add_delegation_use',
      '20260928020000_add_email_verification',
      '20260928010000_add_project_solution',
      '20260927220000_add_organization_audit',
      TYPED_DEPENDENCY,
      ORGANIZATION_FROZEN,
      ORGANIZATION_BRIDGE,
      ORGANIZATION_ACTIVATION,
      STEP_ALLOWANCE,
      STEP_CODE,
      ORGANIZATION_OWNERSHIP,
      ORGANIZATION_RECORDS,
    ]);

    expect(tableNames()).toEqual(
      withTables.filter(
        (name) => name !== 'typed_dependency' && !ORGANIZATION_TABLES.includes(name),
      ),
    );
    const db = openDatabase(path);
    try {
      expect(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM users').get()?.n).toBe(3);
    } finally {
      db.close();
    }
    connection = openConnection(path);
  });
});
