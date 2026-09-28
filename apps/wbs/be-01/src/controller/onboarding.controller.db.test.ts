import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

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

  it('offers an existing member selection without a verified email', async () => {
    harness.activate();
    harness.organization('org-a');
    harness.member('org-a', 'ada', 'member');
    expect(await harness.call('ada', 'GET', '/api/onboarding')).toEqual({
      status: 200,
      body: {
        state: 'selection_required',
        memberships: [{ organizationId: 'org-a', name: 'org-a', role: 'member' }],
      },
    });
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

  it.each(['creation', 'promotion'] as const)(
    'rechecks membership after a separate process commits %s under contention',
    async (priorWrite) => {
      harness.activate();
      verified();
      if (priorWrite === 'promotion') harness.organization('org-a');
      const ready = join(dirname(harness.databasePath()), `ready-${priorWrite}`);
      const organizationId = priorWrite === 'promotion' ? 'org-a' : 'org-first';
      const holder = Bun.spawn({
        cmd: [
          process.execPath,
          '-e',
          `
          import { Database } from 'bun:sqlite';
          import { writeFileSync } from 'node:fs';
          const sqlite = new Database(${JSON.stringify(harness.databasePath())});
          sqlite.run('PRAGMA busy_timeout = 5000');
          sqlite.run('PRAGMA foreign_keys = ON');
          sqlite.run('BEGIN IMMEDIATE');
          if (${JSON.stringify(priorWrite)} === 'creation')
            sqlite.run("INSERT INTO organization (id, name, created_at) VALUES ('org-first', 'First', 1)");
          sqlite.run('INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES (?, ?, ?, 1)', [${JSON.stringify(organizationId)}, ${JSON.stringify(harness.userId('ada'))}, 'member']);
          writeFileSync(${JSON.stringify(ready)}, '');
          Bun.sleepSync(350);
          sqlite.run('COMMIT');
        `,
        ],
        stderr: 'pipe',
      });
      const started = Date.now();
      while (!existsSync(ready)) {
        if (Date.now() - started > 10_000)
          throw new Error(
            `holder never took the lock: ${await new Response(holder.stderr).text()}`,
          );
        await Bun.sleep(5);
      }
      // Proof: 2026-09-28, moving the membership recheck before BEGIN IMMEDIATE
      // made this case create a second organization after the holder committed.
      expect(
        await harness.call('ada', 'POST', '/api/onboarding/organizations', { name: 'Second' }),
      ).toEqual({ status: 409, body: { error: 'already_member' } });
      expect(await holder.exited).toBe(0);
      expect(harness.sqlite.query('SELECT id FROM organization').all()).toHaveLength(1);
    },
  );

  it('keeps a first-owner creation when another process promotes membership afterward', async () => {
    harness.activate();
    verified();
    harness.organization('org-a');
    const ready = join(dirname(harness.databasePath()), 'promotion-ready');
    const release = join(dirname(harness.databasePath()), 'promotion-release');
    const promoter = Bun.spawn({
      cmd: [
        process.execPath,
        '-e',
        `
          import { Database } from 'bun:sqlite';
          import { writeFileSync, existsSync } from 'node:fs';
          writeFileSync(${JSON.stringify(ready)}, '');
          const started = Date.now();
          while (!existsSync(${JSON.stringify(release)})) {
            if (Date.now() - started > 10000) throw new Error('creation never released promotion');
            Bun.sleepSync(5);
          }
          const sqlite = new Database(${JSON.stringify(harness.databasePath())});
          sqlite.run('PRAGMA foreign_keys = ON');
          sqlite.run('BEGIN IMMEDIATE');
          sqlite.run('INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES (?, ?, ?, 1)', ['org-a', ${JSON.stringify(harness.userId('ada'))}, 'member']);
          sqlite.run('COMMIT');
        `,
      ],
      stderr: 'pipe',
    });
    const started = Date.now();
    while (!existsSync(ready)) {
      if (Date.now() - started > 10_000)
        throw new Error(`promoter did not start: ${await new Response(promoter.stderr).text()}`);
      await Bun.sleep(5);
    }
    const created = await harness.call('ada', 'POST', '/api/onboarding/organizations', {
      name: 'First',
    });
    expect(created.status).toBe(201);
    await Bun.write(release, 'go');
    expect(await promoter.exited).toBe(0);
    expect(
      harness.sqlite.query('SELECT role FROM organization_membership ORDER BY role').all(),
    ).toEqual([{ role: 'member' }, { role: 'super_admin' }]);
  });
});
