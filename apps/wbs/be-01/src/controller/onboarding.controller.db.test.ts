import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { SecurityPrincipal } from '@wbs/core/ports/security-principal';
import { openConnection } from '@wbs/store-sqlite/db';
import { OPEN, WriteCoordinator } from '@wbs/store-sqlite/gate';
import { OnboardingRepository } from '@wbs/store-sqlite/onboarding';
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

  it('bootstraps the creator direct grant and creation audit in the organization owner', async () => {
    harness.activate();
    verified();
    const created = await harness.call('ada', 'POST', '/api/onboarding/organizations', {
      name: 'Creator access',
    });
    expect(created.status).toBe(201);
    const organizationId = (created.body as { organization: { id: string } }).organization.id;
    expect(
      harness.sqlite
        .query(
          'SELECT scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_by FROM access_grant WHERE organization_id=?',
        )
        .all(organizationId),
    ).toEqual([
      {
        scope_kind: 'organization',
        scope_id: organizationId,
        subject_kind: 'user',
        subject_id: harness.userId('ada'),
        role_id: 'org-super-admin',
        origin: 'creation',
        created_by: harness.userId('ada'),
      },
    ]);
    expect(
      harness.sqlite
        .query(
          "SELECT actor_id,action,json_extract(detail,'$.origin') AS origin FROM organization_audit WHERE organization_id=?",
        )
        .all(organizationId),
    ).toEqual([{ actor_id: harness.userId('ada'), action: 'access_granted', origin: 'creation' }]);
    harness.bind('ada', organizationId);
    expect((await harness.call('ada', 'GET', '/api/organization/members')).status).toBe(200);
  });

  it('rolls creator organization membership and grant back on a late access audit fault', async () => {
    harness.activate();
    verified();
    harness.sqlite.run(
      "CREATE TRIGGER fail_creator_access_audit BEFORE INSERT ON organization_audit WHEN NEW.action='access_granted' BEGIN SELECT RAISE(ABORT,'creator access audit unavailable');END",
    );
    expect(
      (
        await harness.call('ada', 'POST', '/api/onboarding/organizations', {
          name: 'Must roll back',
        })
      ).status,
    ).toBe(500);
    expect(harness.sqlite.query('SELECT * FROM organization').all()).toEqual([]);
    expect(harness.sqlite.query('SELECT * FROM organization_membership').all()).toEqual([]);
    expect(harness.sqlite.query('SELECT * FROM access_grant').all()).toEqual([]);
    expect(harness.sqlite.query('SELECT * FROM organization_audit').all()).toEqual([]);
  });

  it('refuses a creator grant lost after audit before committing the bootstrap', async () => {
    harness.activate();
    verified();
    harness.sqlite.run(
      "CREATE TRIGGER lose_creator_grant AFTER INSERT ON organization_audit WHEN NEW.action='access_granted' BEGIN DELETE FROM access_grant WHERE id=NEW.subject_id;END",
    );
    expect(
      (await harness.call('ada', 'POST', '/api/onboarding/organizations', { name: 'Lost creator' }))
        .status,
    ).toBe(500);
    for (const table of [
      'organization',
      'organization_membership',
      'access_grant',
      'organization_audit',
    ])
      expect(harness.sqlite.query('SELECT * FROM ' + table).all()).toEqual([]);
  });

  it('throws rather than committing partial bootstrap when the seeded creator role is missing', async () => {
    harness.activate();
    verified();
    harness.sqlite.run("DELETE FROM access_role_permission WHERE role_id='org-super-admin'");
    harness.sqlite.run("DELETE FROM access_role WHERE id='org-super-admin'");
    const connection = openConnection(harness.databasePath());
    const actor = harness.userId('ada');
    try {
      expect(
        (
          await readRejection(
            new OnboardingRepository(connection.db, OPEN).createOrganization(
              { id: actor },
              'Missing role',
              { actor, stamp: { at: 100, by: actor }, auditId: 'missing-creator-role' },
            ),
          )
        ).message,
      ).toContain('creator grant refused: unknown_role');
    } finally {
      connection.close();
    }
    for (const table of [
      'organization',
      'organization_membership',
      'access_grant',
      'organization_audit',
    ])
      expect(harness.sqlite.query('SELECT * FROM ' + table).all()).toEqual([]);
  });

  it('rejects corrupt creator role permissions before bootstrap commits', async () => {
    harness.activate();
    verified();
    harness.sqlite.run("DELETE FROM access_role_permission WHERE role_id='org-super-admin'");
    expect(
      (
        await harness.call('ada', 'POST', '/api/onboarding/organizations', {
          name: 'Empty creator role',
        })
      ).status,
    ).toBe(500);
    for (const table of [
      'organization',
      'organization_membership',
      'access_grant',
      'organization_audit',
    ])
      expect(harness.sqlite.query('SELECT * FROM ' + table).all()).toEqual([]);
  });

  for (const kind of ['delegated', 'machine', 'consent'] as const) {
    it('enforces personal-only creator admission at the direct port for ' + kind, async () => {
      harness.activate();
      verified();
      const actor = harness.userId('ada');
      const principal: SecurityPrincipal =
        kind === 'delegated'
          ? { id: actor, delegation: { organizationId: 'org-other', audience: 'wbs-be-01/direct' } }
          : kind === 'machine'
            ? {
                id: actor,
                authentication: { kind: 'machine', credentialId: 'key', personId: 'agent' },
              }
            : {
                id: actor,
                authentication: {
                  kind: 'consent',
                  credentialId: 'consent',
                  personId: 'agent',
                  issuer: 'https://issuer.test',
                  subject: 'subject',
                },
              };
      const connection = openConnection(harness.databasePath());
      try {
        expect(
          await new OnboardingRepository(connection.db, OPEN).createOrganization(
            principal,
            'Personal only',
            { actor, stamp: { at: 100, by: actor }, auditId: 'personal-creator' },
          ),
        ).toEqual({ ok: false, refusal: 'insufficient_scope' });
      } finally {
        connection.close();
      }
      for (const table of [
        'organization',
        'organization_membership',
        'access_grant',
        'organization_audit',
      ])
        expect(harness.sqlite.query('SELECT * FROM ' + table).all()).toEqual([]);
    });
  }

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
  it('retains the creator audited act before its queued owner', async () => {
    harness.activate();
    verified();
    await harness.register('substitute');
    const substitute = harness.userId('substitute');
    const connection = openConnection(harness.databasePath());
    const gate = new WriteCoordinator();
    const release = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await release.promise;
    });
    await entered.promise;
    const actor = harness.userId('ada');
    const principal = { id: actor };
    const act = { actor, stamp: { at: 100, by: actor }, auditId: 'retained-creator' };
    const pending = new OnboardingRepository(connection.db, gate).createOrganization(
      principal,
      'Retained creator',
      act,
    );
    principal.id = substitute;
    Object.assign(act, { actor: substitute, auditId: 'replacement' });
    Object.assign(act.stamp, { at: 999, by: substitute });
    release.resolve(undefined);
    await blocker;
    try {
      expect((await pending).ok).toBe(true);
      expect(
        harness.sqlite.query('SELECT actor_id,created_at,id FROM organization_audit').get(),
      ).toEqual({ actor_id: actor, created_at: 100, id: 'retained-creator' });
      expect(harness.sqlite.query('SELECT subject_id,created_by FROM access_grant').get()).toEqual({
        subject_id: actor,
        created_by: actor,
      });
    } finally {
      connection.close();
    }
  });
  for (const fault of ['actor', 'stamp'] as const) {
    it('rejects creator identity mismatch before the queued owner at ' + fault, async () => {
      const actor = harness.userId('ada');
      const act = { actor, stamp: { at: 100, by: actor }, auditId: 'creator-mismatch' };
      if (fault === 'actor') act.actor = 'replacement';
      else act.stamp.by = 'replacement';
      const connection = openConnection(harness.databasePath());
      const gate = {
        enter: () => {
          throw new Error('unexpected creator owner entry');
        },
      };
      try {
        expect(
          (
            await readRejection(
              new OnboardingRepository(connection.db, gate).createOrganization(
                { id: actor },
                'Mismatch',
                act,
              ),
            )
          ).message,
        ).toContain('security principal differs from the audited actor');
      } finally {
        connection.close();
      }
    });
  }
});

async function readRejection(pending: Promise<unknown>): Promise<Error> {
  const failure: unknown = await pending.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  if (!(failure instanceof Error))
    throw new Error('Expected the production operation to reject', { cause: failure });
  return failure;
}
