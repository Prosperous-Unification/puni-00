import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { LaneProcess } from '../testing/lane-process';
import { OrganizationHarness } from '../testing/organization-harness';

describe('password email verification', () => {
  let harness: OrganizationHarness;
  beforeEach(async () => {
    harness = OrganizationHarness.open();
    await harness.register('ada');
  });
  afterEach(async () => {
    await LaneProcess.stopAll();
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
    for (const route of [
      '/api/onboarding/email-challenges',
      '/api/onboarding/email-challenges/confirm',
    ]) {
      expect(
        await harness.call('ada', 'POST', route, {
          email: 'K@example.org',
          ...(route.endsWith('/confirm') ? { token: 'invalid' } : {}),
        }),
      ).toEqual({ status: 400, body: { error: 'invalid_body' } });
    }
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

  // Its own budget (docs/test-budgets.md): two cold Bun children import the
  // store, and on a loaded host that alone overran be-01's 10 s at the budget.
  // By the rule, twice the overrun budget: 20 s. The race itself takes < 0.5 s.
  it('serializes competing address confirmations across processes', async () => {
    // Started first, so their cold start overlaps the registration and the two
    // challenges below instead of adding to them. Each blocks on one stdin line
    // naming its account and token digest, which is also the release.
    const spawnConfirmation = () =>
      LaneProcess.spawn([
        process.execPath,
        '-e',
        `
          import { openDrizzle } from '@wbs/store-sqlite/db';
          import { EmailVerificationRepository } from '@wbs/store-sqlite/email-verification';
          import { OPEN } from '@wbs/store-sqlite/gate';
          const verification = new EmailVerificationRepository(openDrizzle(${JSON.stringify(harness.databasePath())}), OPEN);
          process.stdout.write('ready\\n');
          let release;
          for await (const line of console) {
            release = line;
            break;
          }
          if (release === undefined) throw new Error('stdin closed before the release line');
          const { userId, address, digest } = JSON.parse(release);
          const answer = await verification.confirm(userId, address, digest, Date.now);
          process.stdout.write(JSON.stringify(answer));
        `,
      ]);
    const workers = [spawnConfirmation(), spawnConfirmation()] as const;
    harness.activate();
    await harness.register('bea');
    const address = 'shared@example.org';
    await harness.call('ada', 'POST', '/api/onboarding/email-challenges', { email: address });
    const adaToken = harness.deliveredEmailToken(address);
    await harness.call('bea', 'POST', '/api/onboarding/email-challenges', { email: address });
    const beaToken = harness.deliveredEmailToken(address);
    const release = (name: 'ada' | 'bea', token: string) =>
      JSON.stringify({
        userId: harness.userId(name),
        address,
        digest: createHash('sha256').update(token).digest('hex'),
      });
    await Promise.all(workers.map((worker) => worker.expectLine('ready')));
    await Promise.all([
      workers[0].send(release('ada', adaToken)),
      workers[1].send(release('bea', beaToken)),
    ]);
    const answers = await Promise.all(
      workers.map(async (worker) => {
        const exit = await worker.finish();
        expect(exit.code, exit.errors).toBe(0);
        expect(exit.errors).toBe('');
        return JSON.parse(exit.answer) as { ok: boolean; refusal?: string };
      }),
    );
    // Proof: 2026-09-29 (WBS 080.12), making the confirm-time address collision
    // read never match let both workers confirm; the loser exited 1, failing the
    // exit-code check above. Under the same load as the invitation race, the
    // overlapped, stdin-released version passed 12/12; the file-poll one 3/12.
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
  }, 20_000);

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
