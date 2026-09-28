import { OnboardingRepository } from '@wbs/store-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OPEN } from '../repository/gate';
import { OrganizationHarness } from '../testing/organization-harness';

/** Mounted onboarding over the same file and route adapter as be-01. */
describe('onboarding routes', () => {
  let harness: OrganizationHarness;
  beforeEach(async () => {
    harness = OrganizationHarness.open();
    await harness.register('ada');
  });
  afterEach(() => {
    harness.close();
  });

  function verified(email = 'ada@example.org') {
    harness.sqlite.run('UPDATE users SET email = ?, email_verified = 1 WHERE id = ?', [
      email,
      harness.userId('ada'),
    ]);
  }
  function claim(domain = 'example.org', status = 'verified', organizationId = 'org-a') {
    harness.organization(organizationId);
    harness.sqlite.run(
      'INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, created_at) VALUES (?, ?, ?, ?, ?, 1, 1)',
      [crypto.randomUUID(), organizationId, domain, status, 'proof'],
    );
  }

  it('refuses an unauthenticated discovery and forged user field', async () => {
    expect(await harness.callWith('none', 'GET', '/api/onboarding')).toEqual({
      status: 401,
      body: { error: 'unauthenticated' },
    });
    harness.activate();
    verified();
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/organizations', {
        name: 'A',
        userId: 'forged',
      }),
    ).toEqual({ status: 400, body: { error: 'invalid_body' } });
  });

  it('is inert before activation and throws on a broken marker', async () => {
    expect(await harness.call('ada', 'GET', '/api/onboarding')).toEqual({
      status: 403,
      body: { error: 'onboarding_inactive' },
    });
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/organizations', { name: 'A' }),
    ).toEqual({ status: 403, body: { error: 'onboarding_inactive' } });
    expect(harness.sqlite.query('SELECT id FROM organization').all()).toEqual([]);
    harness.sqlite.run('DROP TABLE organization_activation');
    expect((await harness.call('ada', 'GET', '/api/onboarding')).status).toBe(500);
  });

  it('throws on a malformed activation marker', async () => {
    harness.sqlite.run('PRAGMA ignore_check_constraints = ON');
    harness.sqlite.run("UPDATE organization_activation SET state = 'broken'");
    expect((await harness.call('ada', 'GET', '/api/onboarding')).status).toBe(500);
    expect(
      (await harness.call('ada', 'POST', '/api/onboarding/organizations', { name: 'A' })).status,
    ).toBe(500);
    expect(harness.sqlite.query('SELECT id FROM organization').all()).toEqual([]);
  });

  it('requires durable verified email for creation', async () => {
    harness.activate();
    harness.sqlite.run('UPDATE users SET email = ? WHERE id = ?', [
      'ada@example.org',
      harness.userId('ada'),
    ]);
    expect(await harness.call('ada', 'GET', '/api/onboarding')).toEqual({
      status: 200,
      body: { state: 'verification_required' },
    });
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/organizations', { name: 'A' }),
    ).toEqual({ status: 403, body: { error: 'email_verification_required' } });
  });

  it('refuses a foreign origin and malformed or authority-bearing bodies', async () => {
    harness.activate();
    verified();
    expect(
      await harness.callWith(
        harness.token('ada'),
        'POST',
        '/api/onboarding/organizations',
        { name: 'A' },
        { origin: 'https://foreign.example' },
      ),
    ).toEqual({ status: 403, body: { error: 'invalid_origin' } });
    for (const body of [
      { name: 'A', role: 'super_admin' },
      { name: 'A', email: 'ada@example.org' },
      { name: '' },
    ]) {
      expect(await harness.call('ada', 'POST', '/api/onboarding/organizations', body)).toEqual({
        status: 400,
        body: { error: 'invalid_body' },
      });
    }
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/join-requests', {
        organizationId: 'x',
        userId: harness.userId('ada'),
      }),
    ).toEqual({ status: 400, body: { error: 'invalid_body' } });
    expect(harness.sqlite.query('SELECT id FROM organization').all()).toEqual([]);
  });

  it('creates the organization with its first super-admin together', async () => {
    harness.activate();
    verified();
    expect(await harness.call('ada', 'GET', '/api/onboarding')).toEqual({
      status: 200,
      body: { state: 'create_organization' },
    });
    const created = await harness.call('ada', 'POST', '/api/onboarding/organizations', {
      name: 'A',
    });
    expect(created.status).toBe(201);
    expect(harness.sqlite.query('SELECT role FROM organization_membership').all()).toEqual([
      { role: 'super_admin' },
    ]);
    expect((await harness.call('ada', 'GET', '/api/onboarding')).body).toMatchObject({
      state: 'selection_required',
    });
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/organizations', { name: 'Again' }),
    ).toEqual({ status: 409, body: { error: 'already_member' } });
  });

  it('routes exact verified domain but not subdomain or suspended claim', async () => {
    harness.activate();
    verified();
    claim();
    expect((await harness.call('ada', 'GET', '/api/onboarding')).body).toMatchObject({
      state: 'join_organization',
      organization: { id: 'org-a' },
      pending: false,
    });
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/organizations', { name: 'B' }),
    ).toEqual({ status: 409, body: { error: 'domain_matched' } });
    verified('ada@sub.example.org');
    expect((await harness.call('ada', 'GET', '/api/onboarding')).body).toEqual({
      state: 'create_organization',
    });
    verified();
    harness.sqlite.run("UPDATE organization_domain_claim SET status = 'suspended'");
    expect((await harness.call('ada', 'GET', '/api/onboarding')).body).toEqual({
      state: 'create_organization',
    });
  });

  it('submits a pending request with no membership and refuses a duplicate', async () => {
    harness.activate();
    verified();
    claim();
    const submitted = await harness.call('ada', 'POST', '/api/onboarding/join-requests', {
      organizationId: 'org-a',
    });
    expect(submitted.status).toBe(201);
    expect(harness.sqlite.query('SELECT user_id FROM organization_membership').all()).toEqual([]);
    expect((await harness.call('ada', 'GET', '/api/onboarding')).body).toMatchObject({
      state: 'join_organization',
      pending: true,
    });
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/join-requests', {
        organizationId: 'org-a',
      }),
    ).toEqual({ status: 409, body: { error: 'join_request_pending' } });
  });

  it('uses one not-found answer for absent, mismatched, and suspended targets', async () => {
    harness.activate();
    verified();
    claim();
    const absent = await harness.call('ada', 'POST', '/api/onboarding/join-requests', {
      organizationId: 'missing',
    });
    verified('ada@else.org');
    const mismatched = await harness.call('ada', 'POST', '/api/onboarding/join-requests', {
      organizationId: 'org-a',
    });
    verified();
    harness.sqlite.run("UPDATE organization_domain_claim SET status = 'suspended'");
    const suspended = await harness.call('ada', 'POST', '/api/onboarding/join-requests', {
      organizationId: 'org-a',
    });
    expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(mismatched).toEqual(absent);
    expect(suspended).toEqual(absent);
  });

  it('rolls back organization creation when membership insert fails', async () => {
    harness.activate();
    verified();
    harness.sqlite.run(
      "CREATE TRIGGER membership_refused BEFORE INSERT ON organization_membership BEGIN SELECT RAISE(ABORT, 'membership refused'); END",
    );
    expect(
      (await harness.call('ada', 'POST', '/api/onboarding/organizations', { name: 'A' })).status,
    ).toBe(500);
    expect(harness.sqlite.query('SELECT id FROM organization').all()).toEqual([]);
  });

  it('lets a public-email user create without matching a claim', async () => {
    harness.activate();
    verified('ada@gmail.com');
    claim('gmail.com');
    expect((await harness.call('ada', 'GET', '/api/onboarding')).body).toEqual({
      state: 'create_organization',
    });
    expect(
      (await harness.call('ada', 'POST', '/api/onboarding/organizations', { name: 'Public' }))
        .status,
    ).toBe(201);
  });

  it('lets only one of two connections create for the same user', async () => {
    harness.activate();
    verified();
    const first = new OnboardingRepository(harness.secondConnection(), OPEN);
    const second = new OnboardingRepository(harness.secondConnection(), OPEN);
    // Both clients address one WAL file. Separate processes would add process
    // scheduling, but the immediate transactions and recheck are identical.
    const outcomes = await Promise.all([
      first.createOrganization(harness.userId('ada'), 'First', {
        at: 1,
        by: harness.userId('ada'),
      }),
      second.createOrganization(harness.userId('ada'), 'Second', {
        at: 1,
        by: harness.userId('ada'),
      }),
    ]);
    expect(outcomes.filter((answer) => answer.ok)).toHaveLength(1);
    expect(outcomes.filter((answer) => !answer.ok)).toEqual([
      { ok: false, refusal: 'already_member' },
    ]);
    expect(harness.sqlite.query('SELECT id FROM organization').all()).toHaveLength(1);
  });
});
