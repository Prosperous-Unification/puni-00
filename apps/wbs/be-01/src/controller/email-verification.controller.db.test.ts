import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

describe('password email verification', () => {
  let harness: OrganizationHarness;
  beforeEach(async () => {
    harness = OrganizationHarness.open();
    await harness.register('ada');
  });
  afterEach(() => {
    harness.close();
  });

  it('keeps the password account ID after a delivered single-use challenge', async () => {
    harness.activate();
    const userId = harness.userId('ada');
    harness.sqlite.run("UPDATE users SET email = 'ada@example.org' WHERE id = ?", [userId]);
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/organizations', { name: 'Before' }),
    ).toEqual({ status: 403, body: { error: 'email_verification_required' } });
    const issued = await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
      email: 'ada@example.org',
    });
    expect(issued.status).toBe(201);
    expect(issued.body).toHaveProperty('expiresAt');
    const token = harness.deliveredEmailToken('ada@example.org');
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'other@example.org',
        token,
      }),
    ).toEqual({ status: 409, body: { error: 'challenge_invalid' } });
    expect(harness.sqlite.query('SELECT token_digest FROM email_challenge').get()).not.toEqual({
      token_digest: token,
    });
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'ada@example.org',
        token,
      }),
    ).toEqual({ status: 200, body: { email: 'ada@example.org', verified: true } });
    expect(
      harness.sqlite.query('SELECT id, email, email_verified FROM users WHERE id = ?').get(userId),
    ).toEqual({ id: userId, email: 'ada@example.org', email_verified: 1 });
    expect(
      (await harness.call('ada', 'POST', '/api/onboarding/organizations', { name: 'After' }))
        .status,
    ).toBe(201);
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'ada@example.org',
        token,
      }),
    ).toEqual({ status: 409, body: { error: 'challenge_invalid' } });
  });

  it('refuses inactive writes and unauthenticated or delegated callers', async () => {
    expect(
      (
        await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
          email: 'ada@example.org',
        })
      ).body,
    ).toEqual({ error: 'onboarding_inactive' });
    harness.activate();
    expect(
      (
        await harness.callWith('wrong', 'POST', '/api/onboarding/email-challenges', {
          email: 'ada@example.org',
        })
      ).status,
    ).toBe(401);
    expect(harness.sqlite.query('SELECT id FROM email_challenge').all()).toHaveLength(0);
  });

  it('rejects malformed addresses at both HTTP boundaries', async () => {
    harness.activate();
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
        email: 'missing-at',
      }),
    ).toEqual({ status: 400, body: { error: 'invalid_body' } });
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'missing-at',
        token: 'invalid',
      }),
    ).toEqual({ status: 400, body: { error: 'invalid_body' } });
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
        email: 'étienne@example.org',
      }),
    ).toEqual({ status: 400, body: { error: 'invalid_body' } });
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'étienne@example.org',
        token: 'invalid',
      }),
    ).toEqual({ status: 400, body: { error: 'invalid_body' } });
    expect(harness.sqlite.query('SELECT id FROM email_challenge').all()).toHaveLength(0);
  });

  it.each(['absent', 'malformed'] as const)('throws on %s activation state', async (fault) => {
    if (fault === 'absent') harness.sqlite.run('DROP TABLE organization_activation');
    else {
      harness.sqlite.run('PRAGMA ignore_check_constraints = ON');
      harness.sqlite.run("UPDATE organization_activation SET state = 'broken'");
    }
    expect(
      (
        await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
          email: 'ada@example.org',
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
          email: 'ada@example.org',
          token: 'invalid',
        })
      ).status,
    ).toBe(500);
  });

  it('refuses pending delivery, expiry, wrong account, and concurrent replay', async () => {
    harness.activate();
    await harness.register('bea');
    await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
      email: 'ada@example.org',
    });
    const token = harness.deliveredEmailToken('ada@example.org');
    expect(
      (
        await harness.call('bea', 'POST', '/api/onboarding/email-challenges/confirm', {
          email: 'ada@example.org',
          token,
        })
      ).body,
    ).toEqual({ error: 'challenge_invalid' });
    harness.sqlite.run("UPDATE email_challenge SET delivery_state = 'pending'");
    expect(
      (
        await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
          email: 'ada@example.org',
          token,
        })
      ).body,
    ).toEqual({ error: 'challenge_invalid' });
    harness.sqlite.run("UPDATE email_challenge SET delivery_state = 'delivered', expires_at = 0");
    expect(
      (
        await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
          email: 'ada@example.org',
          token,
        })
      ).body,
    ).toEqual({ error: 'challenge_invalid' });
    harness.sqlite.run('UPDATE email_challenge SET expires_at = 9999999999999');
    const confirmations = await Promise.all([
      harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'ada@example.org',
        token,
      }),
      harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'ada@example.org',
        token,
      }),
    ]);
    expect(confirmations.map((answer) => answer.status).sort()).toEqual([200, 409]);
  });

  it('refuses failed delivery and address conflict without verifying either account', async () => {
    harness.activate();
    await harness.register('bea');
    harness.failEmailDelivery();
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
        email: 'ada@example.org',
      }),
    ).toEqual({ status: 503, body: { error: 'delivery_failed' } });
    expect(harness.sqlite.query('SELECT delivery_state FROM email_challenge').get()).toEqual({
      delivery_state: 'failed',
    });
    harness.sqlite.run("UPDATE users SET email = 'ADA@EXAMPLE.ORG' WHERE id = ?", [
      harness.userId('bea'),
    ]);
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
        email: 'ada@example.org',
      }),
    ).toEqual({ status: 409, body: { error: 'address_conflict' } });
    expect(
      harness.sqlite
        .query('SELECT email_verified FROM users WHERE id = ?')
        .get(harness.userId('ada')),
    ).toEqual({ email_verified: 0 });
  });

  it('rechecks address ownership when confirming after another account adopts it', async () => {
    harness.activate();
    await harness.register('bea');
    await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
      email: 'ada@example.org',
    });
    const token = harness.deliveredEmailToken('ada@example.org');
    harness.sqlite.run(
      "UPDATE users SET email = 'ADA@EXAMPLE.ORG', email_verified = 1 WHERE id = ?",
      [harness.userId('bea')],
    );
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'ada@example.org',
        token,
      }),
    ).toEqual({ status: 409, body: { error: 'address_conflict' } });
    expect(
      harness.sqlite
        .query('SELECT email_verified FROM users WHERE id = ?')
        .get(harness.userId('ada')),
    ).toEqual({ email_verified: 0 });
    expect(harness.sqlite.query('SELECT consumed_at FROM email_challenge').get()).toEqual({
      consumed_at: null,
    });
  });

  it('requires a password account and checks activation on confirmation', async () => {
    const inactiveToken = 'injected-only-in-test';
    const digest = createHash('sha256').update(inactiveToken).digest('hex');
    harness.sqlite.run(
      "INSERT INTO email_challenge (id, user_id, email, token_digest, expires_at, delivery_state, created_at) VALUES ('c', ?, 'ada@example.org', ?, 9999999999999, 'delivered', 1)",
      [harness.userId('ada'), digest],
    );
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'ada@example.org',
        token: inactiveToken,
      }),
    ).toEqual({ status: 403, body: { error: 'onboarding_inactive' } });
    harness.sqlite.run("DELETE FROM email_challenge WHERE id = 'c'");
    harness.activate();
    await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
      email: 'ada@example.org',
    });
    const token = harness.deliveredEmailToken('ada@example.org');
    harness.sqlite.run('UPDATE users SET password_hash = NULL WHERE id = ?', [
      harness.userId('ada'),
    ]);
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'ada@example.org',
        token,
      }),
    ).toEqual({ status: 403, body: { error: 'password_account_required' } });
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
        email: 'new@example.org',
      }),
    ).toEqual({ status: 403, body: { error: 'password_account_required' } });
    harness.sqlite.run('UPDATE users SET password_hash = ? WHERE id = ?', [
      'test-only-hash-not-used-for-login',
      harness.userId('ada'),
    ]);
    harness.sqlite.run(
      "INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('mapped', ?, 'https://idp.test', 'subject', 1)",
      [harness.userId('ada')],
    );
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
        email: 'new@example.org',
      }),
    ).toEqual({ status: 403, body: { error: 'password_account_required' } });
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'ada@example.org',
        token,
      }),
    ).toEqual({ status: 403, body: { error: 'password_account_required' } });
  });

  it('revokes an earlier challenge when another is issued', async () => {
    harness.activate();
    await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
      email: 'one@example.org',
    });
    const first = harness.deliveredEmailToken('one@example.org');
    await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
      email: 'two@example.org',
    });
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'one@example.org',
        token: first,
      }),
    ).toEqual({ status: 409, body: { error: 'challenge_invalid' } });
    expect(
      harness.sqlite.query('SELECT email FROM users WHERE id = ?').get(harness.userId('ada')),
    ).toEqual({ email: null });
  });

  it('rolls challenge consumption back when the account update aborts', async () => {
    harness.activate();
    await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
      email: 'ada@example.org',
    });
    const token = harness.deliveredEmailToken('ada@example.org');
    harness.sqlite.run(
      "CREATE TRIGGER reject_email_update BEFORE UPDATE OF email ON users BEGIN SELECT RAISE(ABORT, 'injected email update failure'); END",
    );
    expect(
      (
        await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
          email: 'ada@example.org',
          token,
        })
      ).status,
    ).toBe(500);
    expect(harness.sqlite.query('SELECT consumed_at FROM email_challenge').get()).toEqual({
      consumed_at: null,
    });
  });

  it('throws when the pending challenge disappears during injected delivery', async () => {
    harness.activate();
    harness.removeChallengeBeforeDelivery();
    expect(
      (
        await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
          email: 'ada@example.org',
        })
      ).status,
    ).toBe(500);
    expect(harness.sqlite.query('SELECT id FROM email_challenge').all()).toHaveLength(0);
  });
});
