import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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
    harness.sqlite.run("UPDATE users SET email = 'ada@example.org', updated_at = 1 WHERE id = ?", [
      userId,
    ]);
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
      harness.sqlite
        .query('SELECT id, email, email_verified, updated_at FROM users WHERE id = ?')
        .get(userId),
    ).toMatchObject({ id: userId, email: 'ada@example.org', email_verified: 1 });
    expect(
      harness.sqlite
        .query<{ updated_at: number }, [string]>('SELECT updated_at FROM users WHERE id = ?')
        .get(userId)?.updated_at,
    ).toBeGreaterThan(1);
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
    for (const route of [
      '/api/onboarding/email-challenges',
      '/api/onboarding/email-challenges/confirm',
    ]) {
      for (const email of ['étienne@example.org', '用户@example.org'])
        expect(
          await harness.call('ada', 'POST', route, {
            email,
            ...(route.endsWith('/confirm') ? { token: 'invalid' } : {}),
          }),
        ).toEqual({ status: 400, body: { error: 'unsupported_email' } });
      for (const email of ['ada@xn--a.example', 'ada@-bad.example', 'ada@a\u200db.example'])
        expect(
          await harness.call('ada', 'POST', route, {
            email,
            ...(route.endsWith('/confirm') ? { token: 'invalid' } : {}),
          }),
        ).toEqual({ status: 400, body: { error: 'invalid_body' } });
    }
    expect(harness.sqlite.query('SELECT id FROM email_challenge').all()).toHaveLength(0);
  });

  it('verifies an internationalized domain as A-labels with a byte-exact local part', async () => {
    harness.activate();
    expect(
      (
        await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
          email: 'Ada.Lovelace+wbs@Bücher.example',
        })
      ).status,
    ).toBe(201);
    const token = harness.deliveredEmailToken('Ada.Lovelace+wbs@xn--bcher-kva.example');
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'Ada.Lovelace+wbs@BU\u0308CHER.example',
        token,
      }),
    ).toEqual({
      status: 200,
      body: { email: 'Ada.Lovelace+wbs@xn--bcher-kva.example', verified: true },
    });
    expect(
      harness.sqlite.query('SELECT email FROM users WHERE id = ?').get(harness.userId('ada')),
    ).toEqual({ email: 'Ada.Lovelace+wbs@xn--bcher-kva.example' });
    expect(
      (
        await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
          email: 'ada@faß.de',
        })
      ).status,
    ).toBe(201);
    expect(harness.deliveredEmailToken('ada@xn--fa-hia.de')).toBeString();
  });

  it('confirms only the byte-exact local part the challenge was issued for', async () => {
    harness.activate();
    await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
      email: 'Ada@example.org',
    });
    const token = harness.deliveredEmailToken('Ada@example.org');
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'ada@example.org',
        token,
      }),
    ).toEqual({ status: 409, body: { error: 'challenge_invalid' } });
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'Ada@EXAMPLE.org',
        token,
      }),
    ).toEqual({ status: 200, body: { email: 'Ada@example.org', verified: true } });
  });

  it('refuses a case variant of an address another account holds', async () => {
    harness.activate();
    await harness.register('bea');
    await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
      email: 'Ada@Bücher.example',
    });
    const token = harness.deliveredEmailToken('Ada@xn--bcher-kva.example');
    harness.sqlite.run("UPDATE users SET email = 'ada@xn--bcher-kva.example' WHERE id = ?", [
      harness.userId('bea'),
    ]);
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'Ada@Bücher.example',
        token,
      }),
    ).toEqual({ status: 409, body: { error: 'address_conflict' } });
    harness.sqlite.run('DELETE FROM email_challenge');
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
        email: 'Ada@Bücher.example',
      }),
    ).toEqual({ status: 409, body: { error: 'address_conflict' } });
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

  it('refuses pending delivery, expiry, wrong account, and sequential replay', async () => {
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

  it('serializes competing address confirmations across processes', async () => {
    harness.activate();
    await harness.register('bea');
    const address = 'shared@example.org';
    await harness.call('ada', 'POST', '/api/onboarding/email-challenges', { email: address });
    const adaToken = harness.deliveredEmailToken(address);
    await harness.call('bea', 'POST', '/api/onboarding/email-challenges', { email: address });
    const beaToken = harness.deliveredEmailToken(address);
    const folder = dirname(harness.databasePath());
    const release = join(folder, 'confirm-release');
    const spawnConfirmation = (name: 'ada' | 'bea', token: string) => {
      const ready = join(folder, `confirm-${name}-ready`);
      const child = Bun.spawn({
        cmd: [
          process.execPath,
          '-e',
          `
          import { createHash } from 'node:crypto';
          import { existsSync, writeFileSync } from 'node:fs';
          import { openDrizzle } from '@wbs/store-sqlite/db';
          import { EmailVerificationRepository } from '@wbs/store-sqlite';
          import { OPEN } from '@wbs/store-sqlite/gate';
          const verification = new EmailVerificationRepository(openDrizzle(${JSON.stringify(harness.databasePath())}), OPEN);
          writeFileSync(${JSON.stringify(ready)}, '');
          const started = Date.now();
          while (!existsSync(${JSON.stringify(release)})) {
            if (Date.now() - started > 10000) throw new Error('confirmation was never released');
            Bun.sleepSync(5);
          }
          const answer = await verification.confirm(
            ${JSON.stringify(harness.userId(name))}, ${JSON.stringify(address)},
            createHash('sha256').update(${JSON.stringify(token)}).digest('hex'), Date.now,
          );
          process.stdout.write(JSON.stringify(answer));
        `,
        ],
        stdout: 'pipe',
        stderr: 'pipe',
      });
      return { child, ready };
    };
    const workers = [spawnConfirmation('ada', adaToken), spawnConfirmation('bea', beaToken)];
    const started = Date.now();
    while (workers.some(({ ready }) => !existsSync(ready))) {
      if (Date.now() - started > 10_000) throw new Error('confirmation worker did not start');
      await Bun.sleep(5);
    }
    writeFileSync(release, 'go');
    const answers = await Promise.all(
      workers.map(async ({ child }) => {
        const output = await new Response(child.stdout).text();
        const errors = await new Response(child.stderr).text();
        expect(await child.exited).toBe(0);
        expect(errors).toBe('');
        return JSON.parse(output) as { ok: boolean; refusal?: string };
      }),
    );
    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.filter((answer) => !answer.ok)).toEqual([
      { ok: false, refusal: 'address_conflict' },
    ]);
    const loser = answers[0]?.ok ? 'bea' : 'ada';
    expect(
      harness.sqlite
        .query('SELECT email, email_verified FROM users WHERE id = ?')
        .get(harness.userId(loser)),
    ).toEqual({ email: null, email_verified: 0 });
    expect(
      harness.sqlite
        .query('SELECT consumed_at FROM email_challenge WHERE user_id = ?')
        .get(harness.userId(loser)),
    ).toEqual({ consumed_at: null });
  });

  it('refuses a challenge that expires while confirmation waits for a separate writer', async () => {
    harness.activate();
    await harness.call('ada', 'POST', '/api/onboarding/email-challenges', {
      email: 'ada@example.org',
    });
    const token = harness.deliveredEmailToken('ada@example.org');
    const ready = join(dirname(harness.databasePath()), 'expiry-lock-ready');
    const holder = Bun.spawn({
      cmd: [
        process.execPath,
        '-e',
        `
        import { Database } from 'bun:sqlite';
        import { writeFileSync } from 'node:fs';
        const sqlite = new Database(${JSON.stringify(harness.databasePath())});
        sqlite.run('PRAGMA busy_timeout = 5000');
        sqlite.run('BEGIN IMMEDIATE');
        sqlite.run('UPDATE email_challenge SET expires_at = ?', [Date.now() + 150]);
        writeFileSync(${JSON.stringify(ready)}, '');
        Bun.sleepSync(500);
        sqlite.run('COMMIT');
      `,
      ],
      stderr: 'pipe',
    });
    const started = Date.now();
    while (!existsSync(ready)) {
      if (Date.now() - started > 10_000)
        throw new Error(`writer did not lock: ${await new Response(holder.stderr).text()}`);
      await Bun.sleep(5);
    }
    expect(
      await harness.call('ada', 'POST', '/api/onboarding/email-challenges/confirm', {
        email: 'ada@example.org',
        token,
      }),
    ).toEqual({ status: 409, body: { error: 'challenge_invalid' } });
    expect(await holder.exited).toBe(0);
    expect(harness.sqlite.query('SELECT consumed_at FROM email_challenge').get()).toEqual({
      consumed_at: null,
    });
    expect(
      harness.sqlite
        .query('SELECT email_verified FROM users WHERE id = ?')
        .get(harness.userId('ada')),
    ).toEqual({ email_verified: 0 });
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
