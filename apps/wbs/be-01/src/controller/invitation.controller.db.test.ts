import { createHash } from 'node:crypto';

import { type Gate, InvitationRepository, openConnection } from '@wbs/store-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { LaneProcess } from '../testing/lane-process';
import { OrganizationHarness } from '../testing/organization-harness';

describe('organization invitations', () => {
  let harness: OrganizationHarness;

  beforeEach(async () => {
    harness = OrganizationHarness.open();
    await harness.register('owner');
    await harness.register('recipient');
    await harness.register('other');
    harness.organization('org');
    harness.member('org', 'owner', 'super_admin');
    harness.bind('owner', 'org');
    harness.sqlite.run(
      "UPDATE users SET email = 'recipient@example.org', email_verified = 1 WHERE id = ?",
      [harness.userId('recipient')],
    );
    harness.sqlite.run(
      "UPDATE users SET email = 'other@example.org', email_verified = 1 WHERE id = ?",
      [harness.userId('other')],
    );
  });

  afterEach(async () => {
    await LaneProcess.stopAll();
    harness.close();
  });

  it('is inert before activation and issues a digest-only invitation after activation', async () => {
    expect(
      await harness.call('owner', 'POST', '/api/organization/invitations', {
        email: 'recipient@example.org',
        role: 'member',
      }),
    ).toEqual({ status: 403, body: { error: 'no_active_organization' } });
    harness.activate();
    expect(
      (
        await harness.call('owner', 'POST', '/api/organization/invitations', {
          email: 'RECIPIENT@EXAMPLE.ORG',
          role: 'member',
        })
      ).status,
    ).toBe(201);
    const token = harness.deliveredEmailToken('recipient@example.org');
    expect(
      harness.sqlite
        .query('SELECT recipient_email, token_digest FROM organization_invitation')
        .get(),
    ).toEqual({
      recipient_email: 'recipient@example.org',
      token_digest: createHash('sha256').update(token).digest('hex'),
    });
    expect(
      JSON.stringify(harness.sqlite.query('SELECT * FROM organization_invitation').get()),
    ).not.toContain(token);
  });

  it('accepts once for the current verified recipient and refuses a serialized replay', async () => {
    harness.activate();
    await harness.call('owner', 'POST', '/api/organization/invitations', {
      email: 'recipient@example.org',
      role: 'member',
    });
    const token = harness.deliveredEmailToken('recipient@example.org');
    expect(
      await harness.call('other', 'POST', '/api/onboarding/invitations/accept', { token }),
    ).toEqual({
      status: 403,
      body: { error: 'recipient_mismatch' },
    });
    const accepted = await Promise.all([
      harness.call('recipient', 'POST', '/api/onboarding/invitations/accept', { token }),
      harness.call('recipient', 'POST', '/api/onboarding/invitations/accept', { token }),
    ]);
    expect(accepted.map((answer) => answer.status).sort()).toEqual([200, 409]);
    expect(
      harness.sqlite
        .query('SELECT role FROM organization_membership WHERE user_id = ?')
        .get(harness.userId('recipient')),
    ).toEqual({ role: 'member' });
  });

  it('refuses an invitation that expires while acceptance waits for the write gate', async () => {
    harness.activate();
    await harness.call('owner', 'POST', '/api/organization/invitations', {
      email: 'recipient@example.org',
      role: 'member',
    });
    const digest = createHash('sha256')
      .update(harness.deliveredEmailToken('recipient@example.org'))
      .digest('hex');
    harness.sqlite.run('UPDATE organization_invitation SET created_at = 1, expires_at = 200');
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gate: Gate = { enter: (work) => waiting.then(work) };
    const connection = openConnection(harness.databasePath());
    try {
      let now = 100;
      const acceptance = new InvitationRepository(connection.db, gate).accept(
        harness.userId('recipient'),
        digest,
        harness.userId('recipient'),
        () => now,
      );
      now = 300;
      release();
      expect(await acceptance).toEqual({ ok: false, refusal: 'invitation_invalid' });
      expect(harness.sqlite.query('SELECT consumed_at FROM organization_invitation').get()).toEqual(
        {
          consumed_at: null,
        },
      );
    } finally {
      release();
      connection.close();
    }
  });

  it('records acceptance at the time the write gate opens', async () => {
    harness.activate();
    await harness.call('owner', 'POST', '/api/organization/invitations', {
      email: 'recipient@example.org',
      role: 'member',
    });
    const digest = createHash('sha256')
      .update(harness.deliveredEmailToken('recipient@example.org'))
      .digest('hex');
    harness.sqlite.run('UPDATE organization_invitation SET created_at = 1, expires_at = 500');
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gate: Gate = { enter: (work) => waiting.then(work) };
    const connection = openConnection(harness.databasePath());
    try {
      let now = 100;
      const acceptance = new InvitationRepository(connection.db, gate).accept(
        harness.userId('recipient'),
        digest,
        harness.userId('recipient'),
        () => now,
      );
      now = 300;
      release();
      expect(await acceptance).toEqual({
        ok: true,
        value: { organizationId: 'org', role: 'member' },
      });
      expect(
        harness.sqlite.query('SELECT consumed_at, updated_at FROM organization_invitation').get(),
      ).toEqual({
        consumed_at: 300,
        updated_at: 300,
      });
    } finally {
      release();
      connection.close();
    }
  });

  it('lists only invitations in the active organization', async () => {
    harness.activate();
    await harness.call('owner', 'POST', '/api/organization/invitations', {
      email: 'recipient@example.org',
      role: 'viewer',
    });
    harness.organization('foreign');
    harness.member('foreign', 'other', 'super_admin');
    harness.bind('other', 'foreign');
    await harness.call('other', 'POST', '/api/organization/invitations', {
      email: 'other@example.org',
      role: 'member',
    });
    const listed = await harness.call('owner', 'GET', '/api/organization/invitations');
    expect(listed.status).toBe(200);
    expect(
      (listed.body as { invitations: { email: string }[] }).invitations.map((offer) => offer.email),
    ).toEqual(['recipient@example.org']);
  });

  // Its own budget (docs/test-budgets.md): two cold Bun children import the
  // store, and on a loaded host that alone overran be-01's 10 s at the budget.
  // By the rule, twice the overrun budget: 20 s. The race itself takes < 0.5 s.
  it('consumes once across independent SQLite processes', async () => {
    // Started before the invitation exists, so their cold start overlaps the
    // parent's own setup instead of adding to it.
    const workerPath = new URL('../testing/invitation-accept.worker.ts', import.meta.url).pathname;
    const workers = ['0', '1'].map(() =>
      LaneProcess.spawn([process.execPath, workerPath, harness.databasePath()]),
    );
    harness.activate();
    await harness.call('owner', 'POST', '/api/organization/invitations', {
      email: 'recipient@example.org',
      role: 'member',
    });
    const digest = createHash('sha256')
      .update(harness.deliveredEmailToken('recipient@example.org'))
      .digest('hex');
    // Proof: 2026-09-29, a worker that threw before printing `ready` failed
    // this wait at once with its stderr, instead of after a fixed poll budget.
    await Promise.all(workers.map((worker) => worker.expectLine('ready')));
    const release = JSON.stringify({ userId: harness.userId('recipient'), digest });
    await Promise.all(workers.map((worker) => worker.send(release)));
    const answers = await Promise.all(
      workers.map(async (worker) => {
        const exit = await worker.finish();
        expect(exit.code, exit.errors).toBe(0);
        expect(exit.errors).toBe('');
        return JSON.parse(exit.answer) as { ok: boolean; refusal?: string };
      }),
    );
    // Proof: 2026-09-29 (WBS 080.12), dropping the consumedAt check from
    // InvitationRepository.accept made both released workers answer ok here.
    // Under 16 busy loops and 24 concurrent copies at load 115-164, the
    // stdin release and 20 s budget passed 12/12; the file-poll version 9/12.
    expect(answers.map((answer) => answer.ok).sort()).toEqual([false, true]);
    expect(answers.find((answer) => !answer.ok)?.refusal).toBe('invitation_invalid');
    expect(
      harness.sqlite
        .query('SELECT COUNT(*) AS count FROM organization_membership WHERE user_id = ?')
        .get(harness.userId('recipient')),
    ).toEqual({ count: 1 });
  }, 20_000);

  it("refuses an admin's admin invitation and a removed issuer", async () => {
    harness.activate();
    harness.member('org', 'other', 'admin');
    harness.bind('other', 'org');
    expect(
      await harness.call('other', 'POST', '/api/organization/invitations', {
        email: 'recipient@example.org',
        role: 'admin',
      }),
    ).toEqual({ status: 403, body: { error: 'forbidden' } });
    harness.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [
      harness.userId('other'),
    ]);
    expect(
      await harness.call('other', 'POST', '/api/organization/invitations', {
        email: 'recipient@example.org',
        role: 'viewer',
      }),
    ).toEqual({ status: 403, body: { error: 'not_a_member' } });
    expect(harness.sqlite.query('SELECT id FROM organization_invitation').all()).toHaveLength(0);
  });

  it('rejects malformed recipient addresses and a super-admin offer', async () => {
    harness.activate();
    for (const email of ['missing-at', 'étienne@example.org', `${'a'.repeat(250)}@x.org`]) {
      expect(
        await harness.call('owner', 'POST', '/api/organization/invitations', {
          email,
          role: 'viewer',
        }),
      ).toEqual({ status: 400, body: { error: 'invalid_body' } });
    }
    expect(
      await harness.call('owner', 'POST', '/api/organization/invitations', {
        email: 'recipient@example.org',
        role: 'super_admin',
      }),
    ).toEqual({ status: 400, body: { error: 'invalid_body' } });
    expect(harness.sqlite.query('SELECT id FROM organization_invitation').all()).toHaveLength(0);
  });

  it('limits listing and revocation to the current administrator role', async () => {
    harness.activate();
    await harness.call('owner', 'POST', '/api/organization/invitations', {
      email: 'recipient@example.org',
      role: 'admin',
    });
    const id = (
      harness.sqlite.query('SELECT id FROM organization_invitation').get() as { id: string }
    ).id;
    await harness.call('owner', 'POST', '/api/organization/invitations', {
      email: 'other@example.org',
      role: 'viewer',
    });
    const viewerId = (
      harness.sqlite
        .query("SELECT id FROM organization_invitation WHERE role = 'viewer'")
        .get() as { id: string }
    ).id;
    harness.member('org', 'other', 'viewer');
    harness.bind('other', 'org');
    expect((await harness.call('other', 'GET', '/api/organization/invitations')).status).toBe(403);
    expect(
      (await harness.call('other', 'DELETE', `/api/organization/invitations/${id}`)).status,
    ).toBe(403);
    expect(
      (await harness.call('other', 'DELETE', `/api/organization/invitations/${viewerId}`)).status,
    ).toBe(403);
    expect(
      (await harness.call('other', 'DELETE', '/api/organization/invitations/missing')).status,
    ).toBe(403);
    harness.sqlite.run("UPDATE organization_membership SET role = 'admin' WHERE user_id = ?", [
      harness.userId('other'),
    ]);
    expect((await harness.call('other', 'GET', '/api/organization/invitations')).status).toBe(200);
    expect(
      (await harness.call('other', 'DELETE', `/api/organization/invitations/${id}`)).status,
    ).toBe(403);
    expect(harness.sqlite.query('SELECT revoked_at FROM organization_invitation').get()).toEqual({
      revoked_at: null,
    });
  });

  it('refuses an unverified or changed recipient without consuming', async () => {
    harness.activate();
    await harness.call('owner', 'POST', '/api/organization/invitations', {
      email: 'recipient@example.org',
      role: 'viewer',
    });
    const token = harness.deliveredEmailToken('recipient@example.org');
    harness.sqlite.run('UPDATE users SET email_verified = 0 WHERE id = ?', [
      harness.userId('recipient'),
    ]);
    expect(
      await harness.call('recipient', 'POST', '/api/onboarding/invitations/accept', { token }),
    ).toEqual({
      status: 403,
      body: { error: 'email_verification_required' },
    });
    harness.sqlite.run(
      "UPDATE users SET email = 'changed@example.org', email_verified = 1 WHERE id = ?",
      [harness.userId('recipient')],
    );
    expect(
      await harness.call('recipient', 'POST', '/api/onboarding/invitations/accept', { token }),
    ).toEqual({
      status: 403,
      body: { error: 'recipient_mismatch' },
    });
    expect(harness.sqlite.query('SELECT consumed_at FROM organization_invitation').get()).toEqual({
      consumed_at: null,
    });
  });

  it('refuses expired, revoked and replayed invitations', async () => {
    harness.activate();
    await harness.call('owner', 'POST', '/api/organization/invitations', {
      email: 'recipient@example.org',
      role: 'member',
    });
    const token = harness.deliveredEmailToken('recipient@example.org');
    harness.sqlite.run('UPDATE organization_invitation SET created_at = 1, expires_at = 2');
    expect(
      (await harness.call('recipient', 'POST', '/api/onboarding/invitations/accept', { token }))
        .status,
    ).toBe(409);
    harness.sqlite.run('UPDATE organization_invitation SET expires_at = 9999999999999');
    const listed = await harness.call('owner', 'GET', '/api/organization/invitations');
    expect(listed.status).toBe(200);
    const id = (listed.body as { invitations: { id?: string }[] }).invitations[0]?.id;
    if (id === undefined) throw new Error('missing invitation');
    expect(await harness.call('owner', 'DELETE', `/api/organization/invitations/${id}`)).toEqual({
      status: 204,
      body: null,
    });
    expect(
      (await harness.call('recipient', 'POST', '/api/onboarding/invitations/accept', { token }))
        .status,
    ).toBe(409);
    expect(
      (await harness.call('owner', 'DELETE', `/api/organization/invitations/${id}`)).status,
    ).toBe(409);
  });

  it('gives identical 404 for missing and foreign revocation', async () => {
    harness.activate();
    harness.organization('foreign');
    harness.member('foreign', 'other', 'super_admin');
    harness.bind('other', 'foreign');
    await harness.call('other', 'POST', '/api/organization/invitations', {
      email: 'recipient@example.org',
      role: 'viewer',
    });
    const id = (
      harness.sqlite.query('SELECT id FROM organization_invitation').get() as { id: string }
    ).id;
    expect(await harness.call('owner', 'DELETE', `/api/organization/invitations/${id}`)).toEqual(
      await harness.call('owner', 'DELETE', '/api/organization/invitations/missing'),
    );
  });

  it('rolls consumption back when membership insertion fails', async () => {
    harness.activate();
    await harness.call('owner', 'POST', '/api/organization/invitations', {
      email: 'recipient@example.org',
      role: 'viewer',
    });
    const token = harness.deliveredEmailToken('recipient@example.org');
    harness.sqlite.run(
      "CREATE TRIGGER reject_invited_membership BEFORE INSERT ON organization_membership BEGIN SELECT RAISE(ABORT, 'injected membership failure'); END",
    );
    expect(
      (await harness.call('recipient', 'POST', '/api/onboarding/invitations/accept', { token }))
        .status,
    ).toBe(500);
    expect(harness.sqlite.query('SELECT consumed_at FROM organization_invitation').get()).toEqual({
      consumed_at: null,
    });
  });

  it('retains an existing membership without upgrading it', async () => {
    harness.activate();
    harness.member('org', 'recipient', 'viewer');
    await harness.call('owner', 'POST', '/api/organization/invitations', {
      email: 'recipient@example.org',
      role: 'admin',
    });
    const token = harness.deliveredEmailToken('recipient@example.org');
    expect(
      await harness.call('recipient', 'POST', '/api/onboarding/invitations/accept', { token }),
    ).toEqual({
      status: 200,
      body: { membership: { organizationId: 'org', role: 'viewer' } },
    });
    expect(
      harness.sqlite
        .query('SELECT role FROM organization_membership WHERE user_id = ?')
        .get(harness.userId('recipient')),
    ).toEqual({ role: 'viewer' });
  });

  it('revokes an invitation when the injected mail sink rejects delivery', async () => {
    harness.activate();
    harness.failEmailDelivery();
    expect(
      await harness.call('owner', 'POST', '/api/organization/invitations', {
        email: 'recipient@example.org',
        role: 'viewer',
      }),
    ).toEqual({ status: 503, body: { error: 'delivery_failed' } });
    expect(
      harness.sqlite
        .query('SELECT revoked_at IS NOT NULL AS revoked FROM organization_invitation')
        .get(),
    ).toEqual({ revoked: 1 });
  });

  it('checks activation during acceptance, even with a planted valid offer', async () => {
    const token = 'test-only-token';
    const digest = new Bun.CryptoHasher('sha256').update(token).digest('hex');
    harness.sqlite.run(
      "INSERT INTO organization_invitation (id, organization_id, recipient_email, role, token_digest, expires_at, created_at) VALUES ('planted', 'org', 'recipient@example.org', 'viewer', ?, 9999999999999, 1)",
      [digest],
    );
    expect(
      await harness.call('recipient', 'POST', '/api/onboarding/invitations/accept', { token }),
    ).toEqual({
      status: 403,
      body: { error: 'onboarding_inactive' },
    });
    expect(harness.sqlite.query('SELECT consumed_at FROM organization_invitation').get()).toEqual({
      consumed_at: null,
    });
  });

  it.each(['absent', 'unreadable', 'malformed'] as const)(
    'throws for an %s activation marker during acceptance',
    async (fault) => {
      if (fault === 'absent') harness.sqlite.run('DROP TABLE organization_activation');
      else if (fault === 'unreadable') {
        harness.sqlite.run('ALTER TABLE organization_activation RENAME COLUMN state TO lost_state');
      } else {
        harness.sqlite.run('PRAGMA ignore_check_constraints = ON');
        harness.sqlite.run("UPDATE organization_activation SET state = 'broken'");
      }
      expect(
        (
          await harness.call('recipient', 'POST', '/api/onboarding/invitations/accept', {
            token: 'unknown',
          })
        ).status,
      ).toBe(500);
    },
  );

  it('throws if the invitation disappears before failed delivery is recorded', async () => {
    harness.activate();
    harness.removeInvitationBeforeDelivery();
    harness.failEmailDelivery();
    expect(
      (
        await harness.call('owner', 'POST', '/api/organization/invitations', {
          email: 'recipient@example.org',
          role: 'viewer',
        })
      ).status,
    ).toBe(500);
  });
});
