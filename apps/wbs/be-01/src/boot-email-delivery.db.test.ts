import { afterEach, expect, test } from 'bun:test';

import { BOOTED_ORIGIN, BootedBrowserProcess } from './testing/booted-browser-process';
import { type RelayMode, startSmtpRelay } from './testing/smtp-relay';

const opened: BootedBrowserProcess[] = [];
const relays: Awaited<ReturnType<typeof startSmtpRelay>>[] = [];
afterEach(async () => {
  for (const be of opened.splice(0)) await be.close();
  for (const relay of relays.splice(0)) await relay.close();
});
async function boot(mode: RelayMode = 'accept') {
  const relay = await startSmtpRelay(mode);
  relays.push(relay);
  const be = await BootedBrowserProcess.open(
    'enabled',
    undefined,
    BOOTED_ORIGIN,
    undefined,
    relay.config,
  );
  opened.push(be);
  await be.register('owner');
  return { be, relay };
}
function call(
  be: BootedBrowserProcess,
  username: string,
  path: string,
  body: unknown,
  organizationCookie?: string,
): Promise<Response> {
  return Promise.resolve(
    be.app.handle(
      new Request(`${BOOTED_ORIGIN}${path}`, {
        method: 'POST',
        headers: {
          origin: BOOTED_ORIGIN,
          'content-type': 'application/json',
          ...(organizationCookie === undefined
            ? { authorization: `Bearer ${be.token(username)}` }
            : {
                cookie: `__Host-wbs_access=${be.token(username)}; ${organizationCookie}`,
                'X-WBS-Expected-Organization': 'org',
              }),
        },
        body: JSON.stringify(body),
      }),
    ),
  );
}
function capturedToken(body: string | undefined): string {
  const token = body === undefined ? undefined : /\r\n([a-f0-9]{64})\r\n/.exec(body)?.at(1);
  if (token === undefined) throw new Error('verification message has no captured token');
  return token;
}
async function organization(be: BootedBrowserProcess): Promise<string> {
  be.organization('org');
  be.member('org', 'owner', 'super_admin');
  const selected = await call(be, 'owner', '/api/organization/active', { organizationId: 'org' });
  const cookie = selected.headers.get('set-cookie')?.split(';').at(0);
  if (selected.status !== 200 || cookie === undefined)
    throw new Error('fixture organization was not selected');
  return cookie;
}

test('boot binds configured SMTP to a delivered challenge and single-use verification', async () => {
  const { be, relay } = await boot();
  be.activate();
  const id = be.userId('owner');
  const issued = await call(be, 'owner', '/api/onboarding/email-challenges', {
    email: 'owner@example.test',
  });
  const issuedText = await issued.text();
  expect(issued.status).toBe(201);
  const token = capturedToken(relay.observed.bodies.at(0));
  expect(issuedText).not.toContain(token);
  const stored = be.sqlite.query('SELECT token_digest, delivery_state FROM email_challenge').get();
  expect(stored).toHaveProperty('delivery_state', 'delivered');
  expect(JSON.stringify(stored)).not.toContain(token);
  const confirmed = await call(be, 'owner', '/api/onboarding/email-challenges/confirm', {
    email: 'owner@example.test',
    token,
  });
  expect(confirmed.status).toBe(200);
  expect(be.sqlite.query('SELECT id,email,email_verified FROM users WHERE id = ?').get(id)).toEqual(
    { id, email: 'owner@example.test', email_verified: 1 },
  );
  expect(
    (
      await call(be, 'owner', '/api/onboarding/email-challenges/confirm', {
        email: 'owner@example.test',
        token,
      })
    ).status,
  ).toBe(409);
});

for (const mode of ['reject', 'withhold'] as const)
  test(`boot ${mode} SMTP cannot leave a usable captured challenge`, async () => {
    const { be, relay } = await boot(mode);
    be.activate();
    const issued = await call(be, 'owner', '/api/onboarding/email-challenges', {
      email: 'owner@example.test',
    });
    expect(issued.status).toBe(503);
    expect(await issued.json()).toEqual({ error: 'delivery_failed' });
    const token = capturedToken(relay.observed.bodies.at(0));
    expect(
      (
        await call(be, 'owner', '/api/onboarding/email-challenges/confirm', {
          email: 'owner@example.test',
          token,
        })
      ).status,
    ).toBe(409);
    expect(be.sqlite.query('SELECT delivery_state FROM email_challenge').get()).toEqual({
      delivery_state: 'failed',
    });
    expect(
      be.sqlite.query('SELECT email_verified FROM users WHERE id = ?').get(be.userId('owner')),
    ).toEqual({ email_verified: 0 });
    expect(relay.observed.connections).toBe(1);
    // The9s submission cutoff is separate from bounded boot/migration/setup scheduling allowance.
  }, 30000);

test('boot never contacts configured relay for inactive or non-password verification', async () => {
  const { be, relay } = await boot();
  expect(
    (await call(be, 'owner', '/api/onboarding/email-challenges', { email: 'owner@example.test' }))
      .status,
  ).toBe(403);
  be.activate();
  be.sqlite.run('UPDATE users SET password_hash = NULL WHERE id = ?', [be.userId('owner')]);
  expect(
    (await call(be, 'owner', '/api/onboarding/email-challenges', { email: 'owner@example.test' }))
      .status,
  ).toBe(403);
  expect(relay.observed.connections).toBe(0);
});

test('boot propagates a failed challenge compensation write as a server failure', async () => {
  const { be, relay } = await boot('reject');
  be.activate();
  be.sqlite.run(
    "CREATE TRIGGER refuse_delivery_compensation BEFORE UPDATE OF delivery_state ON email_challenge WHEN NEW.delivery_state = 'failed' BEGIN SELECT RAISE(ABORT, 'fixture compensation failure'); END",
  );
  const issued = await call(be, 'owner', '/api/onboarding/email-challenges', {
    email: 'owner@example.test',
  });
  expect(issued.status).toBe(500);
  const token = capturedToken(relay.observed.bodies.at(0));
  expect(
    (
      await call(be, 'owner', '/api/onboarding/email-challenges/confirm', {
        email: 'owner@example.test',
        token,
      })
    ).status,
  ).toBe(409);
});

test('boot configured verification SMTP still refuses invitations and compensates without traffic', async () => {
  const { be, relay } = await boot();
  be.activate();
  const cookie = await organization(be);
  const invited = await call(
    be,
    'owner',
    '/api/organization/invitations',
    { email: 'recipient@example.test', role: 'viewer' },
    cookie,
  );
  expect(invited.status).toBe(503);
  expect(await invited.json()).toEqual({ error: 'delivery_failed' });
  expect(
    be.sqlite.query('SELECT revoked_at IS NOT NULL AS revoked FROM organization_invitation').get(),
  ).toEqual({ revoked: 1 });
  expect(relay.observed.connections).toBe(0);
});

test('boot configured verification SMTP still refuses join invitation and reopens request', async () => {
  const { be, relay } = await boot();
  be.activate();
  await be.register('applicant');
  const cookie = await organization(be);
  be.sqlite.run(
    "UPDATE users SET email = 'applicant@example.org', email_verified = 1 WHERE id = ?",
    [be.userId('applicant')],
  );
  be.sqlite.run(
    "INSERT INTO organization_domain_claim (id,organization_id,domain,status,proof_digest,last_success_at,created_at) VALUES ('claim','org','example.org','verified','proof',1,1)",
  );
  const submitted = await call(be, 'applicant', '/api/onboarding/join-requests', {
    organizationId: 'org',
  });
  expect(submitted.status).toBe(201);
  const summary = (await submitted.json()) as { request: { id: string } };
  const approved = await call(
    be,
    'owner',
    `/api/organization/join-requests/${summary.request.id}/approve`,
    { role: 'viewer' },
    cookie,
  );
  expect(approved.status).toBe(503);
  expect(
    be.sqlite
      .query('SELECT status FROM organization_join_request WHERE id = ?')
      .get(summary.request.id),
  ).toEqual({ status: 'pending' });
  expect(
    be.sqlite.query('SELECT revoked_at IS NOT NULL AS revoked FROM organization_invitation').get(),
  ).toEqual({ revoked: 1 });
  expect(relay.observed.connections).toBe(0);
});

test('boot unsafe single-address syntax fails delivery before SMTP contact', async () => {
  const { be, relay } = await boot();
  be.activate();
  const issued = await call(be, 'owner', '/api/onboarding/email-challenges', {
    email: '<owner@example.test>',
  });
  expect(issued.status).toBe(503);
  expect(be.sqlite.query('SELECT delivery_state FROM email_challenge').get()).toEqual({
    delivery_state: 'failed',
  });
  expect(relay.observed.connections).toBe(0);
});
