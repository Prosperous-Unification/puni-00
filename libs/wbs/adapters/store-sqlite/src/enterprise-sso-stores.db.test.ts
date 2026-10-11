import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AuditedAct, OrganizationAuditDetail } from '@wbs/core';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { EnterpriseConnectionRepository } from './enterprise-connection';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { SqliteOrganizationAuditLog } from './organization-audit-log';
import { ProvisioningTokenRepository } from './provisioning-token';
import { ScimUserRepository } from './scim-user';
import { SessionPolicyRepository } from './session-policy';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const DAY = 24 * 60 * 60 * 1000;
/** The audit insert the injected trigger refuses, as drizzle reports it. */
const AUDIT_FAILED = /Failed query: insert into "organization_audit"/;
const digest = (seed: string) => seed.repeat(64).slice(0, 64);

/**
 * The enterprise SSO stores (`organization-enterprise-sso` task 1.2): each
 * write rechecks activation and super-admin authority and writes exactly one
 * audit row in its own transaction; refused acts write none; an audit that
 * cannot be written rolls the act back; missing or malformed trusted state
 * throws.
 */
describe('the enterprise SSO stores', () => {
  let dir: string;
  let path: string;
  let ids: number;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-enterprise-sso-stores-'));
    path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    ids = 0;
    sql(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('ada', 'ada', 'x', 1), ('sam', 'sam', 'x', 1), ('bob', 'bob', 'x', 1), ('carol', 'carol', 'x', 1)",
    );
    sql(
      "INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1), ('org-b', 'B', 1)",
    );
    sql(
      `INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES
        ('org-a', 'ada', 'super_admin', 1), ('org-a', 'sam', 'admin', 1), ('org-b', 'bob', 'super_admin', 1)`,
    );
    sql(
      `INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at) VALUES
        ('claim-a', 'org-a', 'acme.test', 'verified', '${digest('a')}', 1, 1),
        ('claim-s', 'org-a', 'susp.test', 'suspended', '${digest('a')}', 1, 1),
        ('claim-b', 'org-b', 'b.test', 'verified', '${digest('b')}', 1, 1)`,
    );
    sql(
      "INSERT INTO organization_domain_claim (id, organization_id, domain, status, challenge_digest, challenge_expires_at, created_at) VALUES ('claim-p', 'org-a', 'pending.test', 'pending', 'c', 9, 1)",
    );
    sql("UPDATE organization_activation SET state = 'activated', activated_at = 1");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function sql(statement: string): number {
    const db = openDatabase(path);
    try {
      return db.run(statement).changes;
    } finally {
      db.close();
    }
  }

  function rows(statement: string): unknown[] {
    const db = openDatabase(path);
    try {
      return db.query(statement).all();
    } finally {
      db.close();
    }
  }

  const act = (actor: string, at = 10): AuditedAct => ({
    stamp: { at, by: actor.startsWith('scim:') ? 'ada' : actor },
    actor,
    auditId: `audit-${String(++ids)}`,
  });
  const audits = () => rows('SELECT action, actor_id, subject_id FROM organization_audit');
  const connections = () => new EnterpriseConnectionRepository(openDrizzle(path), OPEN);
  const tokens = () => new ProvisioningTokenRepository(openDrizzle(path), OPEN);
  const scim = () => new ScimUserRepository(openDrizzle(path), OPEN);
  const policies = () => new SessionPolicyRepository(openDrizzle(path), OPEN);
  const draft = {
    domainClaimId: 'claim-a',
    auth0Connection: 'acme-saml',
    strategy: 'samlp',
    loginSlug: 'acme',
  } as const;

  async function provenConnection(): Promise<void> {
    expect((await connections().create('org-a', 'ada', draft, 'conn-a', act('ada'))).kind).toBe(
      'created',
    );
    sql(
      "UPDATE organization_sso_connection SET proven_at = 5, proven_by = 'ada' WHERE id = 'conn-a'",
    );
  }

  /** Every audit insert fails from now on, as a full disk or a broken table would. */
  const breakAudit = () =>
    sql(
      "CREATE TRIGGER audit_unavailable BEFORE INSERT ON organization_audit BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END",
    );

  describe('connections', () => {
    it('records one unproven, unenforced connection with one audit row', async () => {
      const created = await connections().create('org-a', 'ada', draft, 'conn-a', act('ada'));
      expect(created).toEqual({
        kind: 'created',
        connection: {
          id: 'conn-a',
          organizationId: 'org-a',
          domainClaimId: 'claim-a',
          domain: 'acme.test',
          auth0Connection: 'acme-saml',
          strategy: 'samlp',
          loginSlug: 'acme',
          enforced: false,
          provenAt: null,
          provenBy: null,
          lastPrefixMismatchAt: null,
        },
      });
      expect(audits()).toEqual([
        { action: 'sso_connection_created', actor_id: 'ada', subject_id: 'conn-a' },
      ]);
    });

    // Proof: dropping the claim-status recheck made this store a connection
    // on the pending and suspended claims; watched 2026-10-12.
    it('refuses a pending or suspended claim', async () => {
      for (const domainClaimId of ['claim-p', 'claim-s'])
        expect(
          await connections().create(
            'org-a',
            'ada',
            { ...draft, domainClaimId, loginSlug: `x-${domainClaimId}` },
            `c-${domainClaimId}`,
            act('ada'),
          ),
        ).toEqual({ kind: 'domain_not_verified' });
      expect(rows('SELECT id FROM organization_sso_connection')).toEqual([]);
      expect(audits()).toEqual([]);
    });

    // Proof: dropping the organization predicate on the claim made this store
    // a connection on B's claim; watched 2026-10-12.
    it('answers a foreign claim as absent', async () => {
      expect(
        await connections().create(
          'org-a',
          'ada',
          { ...draft, domainClaimId: 'claim-b' },
          'c-x',
          act('ada'),
        ),
      ).toEqual({ kind: 'not_found' });
      expect(audits()).toEqual([]);
    });

    it('refuses a second connection on a claim, a taken slug, an admin and before activation', async () => {
      await connections().create('org-a', 'ada', draft, 'conn-a', act('ada'));
      expect(
        await connections().create(
          'org-a',
          'ada',
          { ...draft, loginSlug: 'other' },
          'c-2',
          act('ada'),
        ),
      ).toEqual({ kind: 'sso_connection_exists' });
      expect(
        await connections().create(
          'org-b',
          'bob',
          { ...draft, domainClaimId: 'claim-b' },
          'c-3',
          act('bob'),
        ),
      ).toEqual({ kind: 'login_slug_taken' });
      expect(
        await connections().create(
          'org-b',
          'sam',
          { ...draft, domainClaimId: 'claim-b', loginSlug: 'bee' },
          'c-4',
          act('sam'),
        ),
      ).toEqual({ kind: 'forbidden' });
      expect(await connections().list('org-a', 'sam')).toBe('forbidden');
      expect(audits()).toHaveLength(1);
    });

    it('refuses enforcement unproven or locking out its actor, and audits the change', async () => {
      await connections().create('org-a', 'ada', draft, 'conn-a', act('ada'));
      expect(
        await connections().setEnforced(
          'org-a',
          'ada',
          'conn-a',
          true,
          'samlp|acme-saml|ada',
          act('ada'),
        ),
      ).toEqual({ kind: 'sso_connection_unproven' });
      sql(
        "UPDATE organization_sso_connection SET proven_at = 5, proven_by = 'ada' WHERE id = 'conn-a'",
      );
      // Proof: dropping the actor-subject check made each of these enforce;
      // watched 2026-10-12.
      for (const subject of ['google-oauth2|1', null, 'samlp|acme-saml-2|ada'])
        expect(
          await connections().setEnforced('org-a', 'ada', 'conn-a', true, subject, act('ada')),
        ).toEqual({ kind: 'enforcement_would_lock_out_actor' });
      expect(
        (
          await connections().setEnforced(
            'org-a',
            'ada',
            'conn-a',
            true,
            'samlp|acme-saml|ada',
            act('ada'),
          )
        ).kind,
      ).toBe('changed');
      expect(rows('SELECT enforced FROM organization_sso_connection')).toEqual([{ enforced: 1 }]);
      expect(audits()).toEqual([
        { action: 'sso_connection_created', actor_id: 'ada', subject_id: 'conn-a' },
        { action: 'sso_enforcement_changed', actor_id: 'ada', subject_id: 'conn-a' },
      ]);
      expect(rows("SELECT detail FROM organization_audit WHERE id = 'audit-6'")).toEqual([
        { detail: '{"enforced":true,"prefix":"samlp|acme-saml|"}' },
      ]);
    });

    it('clears proof and enforcement when the prefix changes', async () => {
      await provenConnection();
      sql("UPDATE organization_sso_connection SET enforced = 1 WHERE id = 'conn-a'");
      const updated = await connections().update(
        'org-a',
        'ada',
        'conn-a',
        { auth0Connection: 'acme-saml-v2' },
        act('ada'),
      );
      expect(updated).toMatchObject({
        kind: 'updated',
        connection: { auth0Connection: 'acme-saml-v2', provenAt: null, enforced: false },
      });
    });

    it('refuses deletion while provisioning is live, then deletes', async () => {
      await provenConnection();
      expect(
        (await tokens().issue('org-a', 'ada', 'tok-1', digest('d'), act('ada', 10))).kind,
      ).toBe('issued');
      expect(await connections().remove('org-a', 'ada', 'conn-a', act('ada', 11))).toBe(
        'provisioning_active',
      );
      expect(await tokens().revoke('org-a', 'ada', 'tok-1', act('ada', 12))).toBe('revoked');
      expect(await connections().remove('org-a', 'ada', 'conn-a', act('ada', 13))).toBe('deleted');
      expect(rows('SELECT id FROM organization_sso_connection')).toEqual([]);
    });

    it('routes by slug whatever the claim status, and by domain only when verified', async () => {
      await connections().create('org-a', 'ada', draft, 'conn-a', act('ada'));
      expect(await connections().routeBySlug('acme')).toEqual({
        organizationId: 'org-a',
        auth0Connection: 'acme-saml',
      });
      expect(await connections().routeByDomain('acme.test')).toEqual({
        organizationId: 'org-a',
        auth0Connection: 'acme-saml',
      });
      sql("UPDATE organization_domain_claim SET status = 'suspended' WHERE id = 'claim-a'");
      expect(await connections().routeByDomain('acme.test')).toBeNull();
      expect(await connections().routeBySlug('acme')).not.toBeNull();
      expect(await connections().routeBySlug('nope')).toBeNull();
    });

    it('finds the proven connection only for its whole prefix', async () => {
      await connections().create('org-a', 'ada', draft, 'conn-a', act('ada'));
      expect(await connections().provenFor('samlp|acme-saml|alice@acme.test')).toBeNull();
      sql(
        "UPDATE organization_sso_connection SET proven_at = 5, proven_by = 'ada' WHERE id = 'conn-a'",
      );
      expect(await connections().provenFor('samlp|acme-saml|alice@acme.test')).toEqual({
        connectionId: 'conn-a',
        organizationId: 'org-a',
        domain: 'acme.test',
        prefix: 'samlp|acme-saml|',
      });
      for (const subject of [
        'samlp|acme-saml-2|alice@acme.test',
        'oidc|acme-saml|alice@acme.test',
        'samlp|alice@acme.test',
        'google-oauth2|1',
      ])
        expect(await connections().provenFor(subject)).toBeNull();
    });

    it('throws on a missing table and on a malformed record', async () => {
      await connections().create('org-a', 'ada', draft, 'conn-a', act('ada'));
      const db = openDatabase(path);
      try {
        db.run('PRAGMA ignore_check_constraints = ON');
        db.run("UPDATE organization_sso_connection SET strategy = 'kerberos'");
      } finally {
        db.close();
      }
      expect(connections().list('org-a', 'ada')).rejects.toThrow(/malformed/);
      sql('DROP TABLE organization_session_policy');
      expect(policies().read('org-a', 'ada')).rejects.toThrow(
        /Failed query: select .* from "organization_session_policy"/,
      );
    });
  });

  describe('provisioning tokens', () => {
    it('refuses a token without a proven connection', async () => {
      // Proof: dropping the proven-connection check made this store a token;
      // watched 2026-10-12.
      expect(await tokens().issue('org-a', 'ada', 'tok-1', digest('d'), act('ada'))).toEqual({
        kind: 'sso_connection_unproven',
      });
      expect(rows('SELECT id FROM organization_scim_token')).toEqual([]);
    });

    it('stores only a digest, lists no secret, and refuses a third live token', async () => {
      await provenConnection();
      expect(await tokens().issue('org-a', 'ada', 'tok-1', digest('d'), act('ada'))).toEqual({
        kind: 'issued',
        token: { id: 'tok-1', createdAt: 10, expiresAt: null, revokedAt: null },
      });
      await tokens().issue('org-a', 'ada', 'tok-2', digest('e'), act('ada'));
      // Proof: dropping the live-count check made this store a third token;
      // watched 2026-10-12.
      expect(await tokens().issue('org-a', 'ada', 'tok-3', digest('f'), act('ada'))).toEqual({
        kind: 'token_limit',
      });
      expect(await tokens().list('org-a', 'ada')).toEqual([
        { id: 'tok-1', createdAt: 10, expiresAt: null, revokedAt: null },
        { id: 'tok-2', createdAt: 10, expiresAt: null, revokedAt: null },
      ]);
      expect(await tokens().list('org-a', 'sam')).toBe('forbidden');
    });

    it('keeps a rotated token for exactly the overlap', async () => {
      await provenConnection();
      await tokens().issue('org-a', 'ada', 'tok-1', digest('d'), act('ada', 100));
      expect(
        await tokens().rotate('org-a', 'ada', 'tok-1', 'tok-2', digest('e'), act('ada', 200)),
      ).toEqual({
        kind: 'rotated',
        token: { id: 'tok-2', createdAt: 200, expiresAt: null, revokedAt: null },
      });
      expect(await tokens().authenticate(digest('d'), 200 + DAY - 1)).toEqual({
        tokenId: 'tok-1',
        organizationId: 'org-a',
        issuedBy: 'ada',
      });
      expect(await tokens().authenticate(digest('d'), 200 + DAY)).toBeNull();
      expect(await tokens().authenticate(digest('e'), 200 + DAY)).not.toBeNull();
      expect(
        await tokens().rotate('org-a', 'ada', 'tok-1', 'tok-3', digest('f'), act('ada', 300)),
      ).toEqual({ kind: 'not_found' });
    });

    // Proof: dropping the revocation predicate from `live` made this return
    // the organization; watched 2026-10-12.
    it('answers null for a revoked, unknown or malformed token', async () => {
      await provenConnection();
      await tokens().issue('org-a', 'ada', 'tok-1', digest('d'), act('ada', 100));
      expect(await tokens().revoke('org-a', 'ada', 'tok-1', act('ada', 150))).toBe('revoked');
      expect(await tokens().authenticate(digest('d'), 151)).toBeNull();
      expect(await tokens().authenticate(digest('9'), 151)).toBeNull();
      expect(await tokens().authenticate('wbs_scim_raw', 151)).toBeNull();
      expect(await tokens().revoke('org-a', 'ada', 'tok-1', act('ada', 152))).toBe('not_found');
      expect(audits().map((row) => (row as { action: string }).action)).toEqual([
        'sso_connection_created',
        'provisioning_token_issued',
        'provisioning_token_revoked',
      ]);
    });
  });

  describe('SCIM users', () => {
    const scimAct = () => act('scim:tok-1');

    beforeEach(async () => {
      await provenConnection();
    });

    it('provisions a pending membership and refuses off-domain and duplicate names', async () => {
      const provisioned = await scim().provision(
        'org-a',
        'u-1',
        { userName: 'carol@acme.test', externalId: 'ext-1', active: true },
        scimAct(),
      );
      expect(provisioned).toMatchObject({
        kind: 'provisioned',
        user: { id: 'u-1', userName: 'carol@acme.test', active: true, userId: null },
      });
      expect(
        await scim().provision(
          'org-a',
          'u-2',
          { userName: 'dave@other.test', externalId: null, active: true },
          scimAct(),
        ),
      ).toEqual({ kind: 'invalid_value' });
      expect(
        await scim().provision(
          'org-a',
          'u-3',
          { userName: 'carol@acme.test', externalId: null, active: true },
          scimAct(),
        ),
      ).toEqual({ kind: 'uniqueness' });
      expect(rows("SELECT role FROM organization_membership WHERE user_id = 'carol'")).toEqual([]);
      expect(
        rows("SELECT actor_id FROM organization_audit WHERE action = 'scim_user_provisioned'"),
      ).toEqual([{ actor_id: 'scim:tok-1' }]);
      expect(
        await scim().list('org-a', { attribute: 'userName', value: 'carol@acme.test' }),
      ).toHaveLength(1);
      expect(await scim().list('org-a', { attribute: 'externalId', value: 'ext-1' })).toHaveLength(
        1,
      );
      expect(await scim().list('org-a', { attribute: 'externalId', value: 'nope' })).toEqual([]);
    });

    it('activates only through the proven connection prefix and the record domain', async () => {
      await scim().provision(
        'org-a',
        'u-1',
        { userName: 'carol@acme.test', externalId: null, active: true },
        scimAct(),
      );
      const activationAct = {
        stamp: { at: 20, by: 'carol' },
        actor: 'carol',
        auditIds: () => `audit-${String(++ids)}`,
      };
      expect(
        await scim().activate(
          'carol',
          { issuer: 'https://idp.test/', subject: 'google-oauth2|5' },
          'carol@acme.test',
          activationAct,
        ),
      ).toEqual([]);
      expect(
        await scim().activate(
          'carol',
          { issuer: 'https://idp.test/', subject: 'samlp|acme-saml|carol' },
          'carol@other.test',
          activationAct,
        ),
      ).toEqual([]);
      expect(
        await scim().activate(
          'carol',
          { issuer: 'https://idp.test/', subject: 'samlp|acme-saml|carol' },
          'carol@acme.test',
          activationAct,
        ),
      ).toEqual([{ organizationId: 'org-a', scimUserId: 'u-1' }]);
      expect(rows("SELECT role FROM organization_membership WHERE user_id = 'carol'")).toEqual([
        { role: 'member' },
      ]);
      expect(rows("SELECT user_id, subject FROM organization_scim_user WHERE id = 'u-1'")).toEqual([
        { user_id: 'carol', subject: 'samlp|acme-saml|carol' },
      ]);
      expect(
        rows(
          "SELECT actor_id FROM organization_audit WHERE action = 'pending_membership_activated'",
        ),
      ).toEqual([{ actor_id: 'carol' }]);
    });

    it('keeps an existing role when it activates', async () => {
      await scim().provision(
        'org-a',
        'u-1',
        { userName: 'sam@acme.test', externalId: null, active: true },
        scimAct(),
      );
      await scim().activate(
        'sam',
        { issuer: 'https://idp.test/', subject: 'samlp|acme-saml|sam' },
        'sam@acme.test',
        { stamp: { at: 20, by: 'sam' }, actor: 'sam', auditIds: () => 'audit-act' },
      );
      expect(rows("SELECT role FROM organization_membership WHERE user_id = 'sam'")).toEqual([
        { role: 'admin' },
      ]);
    });

    async function boundCarol(): Promise<void> {
      await scim().provision(
        'org-a',
        'u-1',
        { userName: 'carol@acme.test', externalId: null, active: true },
        scimAct(),
      );
      await scim().activate(
        'carol',
        { issuer: 'https://idp.test/', subject: 'samlp|acme-saml|carol' },
        'carol@acme.test',
        { stamp: { at: 20, by: 'carol' }, actor: 'carol', auditIds: () => 'audit-act' },
      );
      sql(
        "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-b', 'carol', 'member', 1)",
      );
    }

    it('deprovisions one organization only, and reactivation leaves a pending membership', async () => {
      await boundCarol();
      expect(await scim().update('org-a', 'u-1', { active: false }, scimAct())).toMatchObject({
        kind: 'updated',
        user: { active: false, userId: 'carol' },
      });
      expect(
        rows("SELECT organization_id FROM organization_membership WHERE user_id = 'carol'"),
      ).toEqual([{ organization_id: 'org-b' }]);
      expect(await scim().update('org-a', 'u-1', { active: true }, scimAct())).toMatchObject({
        kind: 'updated',
        user: { active: true, userId: null },
      });
      expect(
        rows("SELECT organization_id FROM organization_membership WHERE user_id = 'carol'"),
      ).toEqual([{ organization_id: 'org-b' }]);
      expect(
        rows(
          "SELECT action FROM organization_audit WHERE action LIKE 'scim_user_%' ORDER BY created_at, id",
        ),
      ).toEqual([
        { action: 'scim_user_provisioned' },
        { action: 'scim_user_deprovisioned' },
        { action: 'scim_user_updated' },
      ]);
    });

    it('refuses to deprovision the last super-admin, changing nothing', async () => {
      await scim().provision(
        'org-a',
        'u-1',
        { userName: 'ada@acme.test', externalId: null, active: true },
        scimAct(),
      );
      await scim().activate(
        'ada',
        { issuer: 'https://idp.test/', subject: 'samlp|acme-saml|ada' },
        'ada@acme.test',
        { stamp: { at: 20, by: 'ada' }, actor: 'ada', auditIds: () => 'audit-act' },
      );
      const before = audits();
      expect(await scim().update('org-a', 'u-1', { active: false }, scimAct())).toEqual({
        kind: 'last_super_admin',
      });
      expect(await scim().remove('org-a', 'u-1', scimAct())).toBe('last_super_admin');
      expect(rows("SELECT role FROM organization_membership WHERE user_id = 'ada'")).toEqual([
        { role: 'super_admin' },
      ]);
      expect(audits()).toEqual(before);
    });

    it("answers another organization's user as absent, changing nothing", async () => {
      await boundCarol();
      expect(await scim().find('org-b', 'u-1')).toBeNull();
      expect(await scim().update('org-b', 'u-1', { active: false }, act('scim:tok-b'))).toEqual({
        kind: 'not_found',
      });
      expect(await scim().remove('org-b', 'u-1', act('scim:tok-b'))).toBe('not_found');
      expect(rows("SELECT active FROM organization_scim_user WHERE id = 'u-1'")).toEqual([
        { active: 1 },
      ]);
    });

    it('refuses a user name change once bound, and deletes a record', async () => {
      await boundCarol();
      expect(await scim().update('org-a', 'u-1', { userName: 'c2@acme.test' }, scimAct())).toEqual({
        kind: 'mutability',
      });
      expect(await scim().remove('org-a', 'u-1', scimAct())).toBe('deleted');
      expect(await scim().find('org-a', 'u-1')).toBeNull();
      expect(
        rows("SELECT organization_id FROM organization_membership WHERE user_id = 'carol'"),
      ).toEqual([{ organization_id: 'org-b' }]);
    });
  });

  describe('session policies', () => {
    it('sets, keeps and clears a policy, auditing each change', async () => {
      const policy = { maxSessionSeconds: 28_800, reauthenticateAfterSeconds: 3_600 };
      expect(await policies().set('org-a', 'ada', policy, act('ada'))).toBe('set');
      expect(await policies().set('org-a', 'ada', policy, act('ada'))).toBe('unchanged');
      expect(await policies().read('org-a', 'ada')).toEqual(policy);
      expect(
        await policies().set(
          'org-a',
          'ada',
          { maxSessionSeconds: null, reauthenticateAfterSeconds: null },
          act('ada'),
        ),
      ).toBe('cleared');
      expect(await policies().read('org-a', 'ada')).toBeNull();
      expect(await policies().set('org-a', 'sam', policy, act('sam'))).toBe('forbidden');
      expect(audits()).toEqual([
        { action: 'session_policy_changed', actor_id: 'ada', subject_id: 'org-a' },
        { action: 'session_policy_changed', actor_id: 'ada', subject_id: 'org-a' },
      ]);
    });
  });

  describe('the audit', () => {
    // Proof: appending `SessionPolicyRepository.set`'s audit row in its own
    // transaction after the policy committed made `set` resolve instead of
    // rejecting, the policy surviving the failed audit; watched 2026-10-12.
    it('rolls every act back when its audit row cannot be written', async () => {
      await provenConnection();
      await scim().provision(
        'org-a',
        'u-1',
        { userName: 'carol@acme.test', externalId: null, active: true },
        act('scim:tok-1'),
      );
      await scim().activate(
        'carol',
        { issuer: 'https://idp.test/', subject: 'samlp|acme-saml|carol' },
        'carol@acme.test',
        { stamp: { at: 20, by: 'carol' }, actor: 'carol', auditIds: () => 'audit-act' },
      );
      const tables = () => ({
        connections: rows('SELECT * FROM organization_sso_connection ORDER BY id'),
        tokens: rows('SELECT * FROM organization_scim_token ORDER BY id'),
        users: rows('SELECT * FROM organization_scim_user ORDER BY id'),
        policies: rows('SELECT * FROM organization_session_policy'),
        memberships: rows(
          'SELECT * FROM organization_membership ORDER BY organization_id, user_id',
        ),
        audits: audits(),
      });
      breakAudit();
      const before = tables();
      const policy = { maxSessionSeconds: 28_800, reauthenticateAfterSeconds: null };
      expect(policies().set('org-a', 'ada', policy, act('ada'))).rejects.toThrow(AUDIT_FAILED);
      expect(
        connections().create(
          'org-a',
          'ada',
          { ...draft, domainClaimId: 'claim-b', loginSlug: 'zz' },
          'c-x',
          act('ada'),
        ),
      ).resolves.toEqual({ kind: 'not_found' });
      expect(
        connections().setEnforced(
          'org-a',
          'ada',
          'conn-a',
          true,
          'samlp|acme-saml|ada',
          act('ada'),
        ),
      ).rejects.toThrow(AUDIT_FAILED);
      expect(tokens().issue('org-a', 'ada', 'tok-9', digest('9'), act('ada'))).rejects.toThrow(
        AUDIT_FAILED,
      );
      expect(scim().update('org-a', 'u-1', { active: false }, act('scim:tok-1'))).rejects.toThrow(
        AUDIT_FAILED,
      );
      expect(scim().remove('org-a', 'u-1', act('scim:tok-1'))).rejects.toThrow(AUDIT_FAILED);
      expect(tables()).toEqual(before);
    });

    // Proof: skipping the secret check made this store the row; watched
    // 2026-10-12.
    it('refuses a detail carrying a token, digest or full subject', async () => {
      const { appendOrganizationAudit } = await import('./organization-audit-log');
      const db = openDrizzle(path);
      const details: OrganizationAuditDetail[] = [
        { token: 'wbs_scim_abc' },
        { digest: digest('d') },
        { subject: 'samlp|acme-saml|carol' },
        { subjects: ['google-oauth2|1'] },
      ];
      for (const detail of details)
        expect(() => {
          db.transaction((tx) => {
            appendOrganizationAudit(tx, {
              id: `x-${String(++ids)}`,
              organizationId: 'org-a',
              actorId: 'ada',
              action: 'sso_connection_updated',
              subjectKind: 'sso_connection',
              subjectId: 'c',
              detail,
              at: 1,
            });
          });
        }).toThrow(/secret or a full subject/);
      expect(audits()).toEqual([]);
      expect(await new SqliteOrganizationAuditLog(db).list('org-a')).toEqual([]);
    });
  });
});

describe('the enterprise SSO stores before activation', () => {
  it('refuse every write and read as inactive', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wbs-enterprise-sso-inactive-'));
    try {
      const path = join(dir, 'test.db');
      runMigrations(path, FOLDER);
      const db = openDrizzle(path);
      const act = { stamp: { at: 1, by: 'ada' }, actor: 'ada', auditId: 'a' };
      expect(await new EnterpriseConnectionRepository(db, OPEN).list('org-a', 'ada')).toBe(
        'inactive',
      );
      expect(
        await new EnterpriseConnectionRepository(db, OPEN).create(
          'org-a',
          'ada',
          { domainClaimId: 'c', auth0Connection: 'x', strategy: 'samlp', loginSlug: 'xyz' },
          'c',
          act,
        ),
      ).toEqual({ kind: 'inactive' });
      expect(
        await new ProvisioningTokenRepository(db, OPEN).issue(
          'org-a',
          'ada',
          't',
          digest('d'),
          act,
        ),
      ).toEqual({ kind: 'inactive' });
      expect(
        await new SessionPolicyRepository(db, OPEN).set(
          'org-a',
          'ada',
          { maxSessionSeconds: 300, reauthenticateAfterSeconds: null },
          act,
        ),
      ).toBe('inactive');
      expect(
        await new ProvisioningTokenRepository(db, OPEN).authenticate(digest('d'), 1),
      ).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
