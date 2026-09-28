import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

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

  afterEach(() => {
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

  it('accepts once for the current verified recipient and refuses a concurrent replay', async () => {
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
