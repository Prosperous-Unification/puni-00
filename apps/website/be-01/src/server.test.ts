import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebsiteStore } from '@website/store-sqlite';
import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { createWebsiteApi } from './server';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'puni-website-'));
  directories.push(directory);
  const config = {
    databasePath: join(directory, 'website.sqlite'),
    apiBindHost: '127.0.0.1',
    publicOrigin: 'http://localhost:4321',
    appOrigin: 'http://localhost:4201',
    appManualUrl: 'http://localhost:4201/manual',
    operatorPassword: 'local-test-secret',
    secureCookies: false,
  };
  return { api: createWebsiteApi(config), config };
}

function request(
  url: string,
  method: string,
  origin: string,
  body?: unknown,
  cookie?: string,
  csrf?: string,
) {
  return new Request(`http://localhost:3101${url}`, {
    method,
    headers: {
      origin,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-puni-csrf': csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function beginDraft(api: ReturnType<typeof createWebsiteApi>) {
  const intake = await api.fetch(
    request('/intakes', 'POST', 'http://localhost:4321', {
      description: 'A booking tool for a local studio',
    }),
  );
  expect(intake.status).toBe(201);
  const cookie = intake.headers.get('set-cookie')?.split(';')[0];
  expect(cookie).toBeTruthy();
  const draft = await api.fetch(
    request('/draft', 'GET', 'http://localhost:4201', undefined, cookie),
  );
  expect(draft.status).toBe(200);
  const fields = (await draft.json()) as { description: string; csrfToken: string };
  return { cookie: cookie!, csrf: fields.csrfToken, draft: fields };
}

test('anonymous manual request persists, consumes its claim and replays one receipt', async () => {
  const { api, config } = fixture();
  const { cookie, csrf, draft } = await beginDraft(api);
  expect(draft.description).toBe('A booking tool for a local studio');
  const edited = await api.fetch(
    request('/brief', 'PATCH', config.appOrigin, { brief: 'Calendar and payments' }, cookie, csrf),
  );
  expect(edited.status).toBe(200);
  const payload = {
    email: 'owner@example.test',
    brief: 'Calendar and payments',
    idempotencyKey: 'submit-12345',
  };
  const first = await api.fetch(
    request('/proposals', 'POST', config.appOrigin, payload, cookie, csrf),
  );
  expect(first.status).toBe(201);
  // Proof: clearing the claim cookie here made the lost-response replay return 401.
  expect(first.headers.get('set-cookie')).toBeNull();
  const receipt = ((await first.json()) as { receipt: string }).receipt;
  expect(receipt).toMatch(/^[a-f0-9]{32}$/);
  const retry = await api.fetch(
    request('/proposals', 'POST', config.appOrigin, payload, cookie, csrf),
  );
  expect(retry.status).toBe(200);
  expect(((await retry.json()) as { receipt: string }).receipt).toBe(receipt);
  expect(
    (await api.fetch(request('/draft', 'GET', config.appOrigin, undefined, cookie))).status,
  ).toBe(401);
  expect(
    (
      await api.fetch(
        request('/brief', 'PATCH', config.appOrigin, { brief: 'Overwrite' }, cookie, csrf),
      )
    ).status,
  ).toBe(401);
  const database = new Database(config.databasePath);
  database.query('UPDATE submission_replay SET expires_at = 0 WHERE receipt = ?').run(receipt);
  database.close();
  // Proof: omitting the replay expiry predicate returned the receipt after its 24-hour authority ended.
  expect(
    (await api.fetch(request('/proposals', 'POST', config.appOrigin, payload, cookie, csrf)))
      .status,
  ).toBe(401);
  const reopened = createWebsiteApi(config);
  const login = await reopened.fetch(
    request('/operator/session', 'POST', config.appOrigin, { password: config.operatorPassword }),
  );
  expect(login.status).toBe(201);
  const operatorCookie = login.headers.get('set-cookie')?.split(';')[0];
  const inbox = await reopened.fetch(
    request('/operator/submissions', 'GET', config.appOrigin, undefined, operatorCookie),
  );
  expect(inbox.status).toBe(200);
  const submissions = (
    (await inbox.json()) as {
      submissions: { description: string; brief: string; email: string }[];
    }
  ).submissions;
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({
    description: draft.description,
    brief: payload.brief,
    email: payload.email,
  });
  reopened.close();
  api.close();
});

test('anonymous receipt replay survives a new intake without changing its active draft', async () => {
  const { api, config } = fixture();
  const first = await beginDraft(api);
  const oldPayload = {
    email: 'owner@example.test',
    brief: 'Booking calendar',
    idempotencyKey: 'anonymous-first-123',
  };
  const submission = await api.fetch(
    request('/proposals', 'POST', config.appOrigin, oldPayload, first.cookie, first.csrf),
  );
  expect(submission.status).toBe(201);
  const oldReceipt = ((await submission.json()) as { receipt: string }).receipt;
  const next = await api.fetch(
    request(
      '/intakes',
      'POST',
      config.publicOrigin,
      { description: 'A stock dashboard for the studio' },
      first.cookie,
    ),
  );
  expect(next.status).toBe(201);
  const cookies = next.headers.getSetCookie().map((line) => line.split(';')[0]);
  const nextClaim = cookies.find((line) => line.startsWith('puni_draft='));
  const replayClaim = cookies.find((line) => line.startsWith('puni_replay='));
  expect(nextClaim).toBeTruthy();
  expect(replayClaim).toBeTruthy();
  const browserCookies = `${String(nextClaim)}; ${String(replayClaim)}`;
  // Proof: without the replay-only cookie, this old-key retry returned 403 after B replaced A's draft claim.
  const replay = await api.fetch(
    request('/proposals', 'POST', config.appOrigin, oldPayload, browserCookies, first.csrf),
  );
  expect(replay.status).toBe(200);
  expect(((await replay.json()) as { receipt: string }).receipt).toBe(oldReceipt);
  expect(
    (
      await api.fetch(
        request(
          '/proposals',
          'POST',
          config.appOrigin,
          { ...oldPayload, brief: 'Changed after submission' },
          browserCookies,
          first.csrf,
        ),
      )
    ).status,
  ).toBe(409);
  expect(
    (await api.fetch(request('/draft', 'GET', config.appOrigin, undefined, replayClaim))).status,
  ).toBe(401);
  expect(
    (
      await api.fetch(
        request(
          '/brief',
          'PATCH',
          config.appOrigin,
          { brief: 'No access' },
          replayClaim,
          first.csrf,
        ),
      )
    ).status,
  ).toBe(401);
  const nextDraft = await api.fetch(
    request('/draft', 'GET', config.appOrigin, undefined, browserCookies),
  );
  expect(nextDraft.status).toBe(200);
  const fields = (await nextDraft.json()) as { description: string; csrfToken: string };
  expect(fields.description).toBe('A stock dashboard for the studio');
  // Proof: accepting either CSRF token for either claim let the old claim submit B's new key.
  expect(
    (
      await api.fetch(
        request(
          '/proposals',
          'POST',
          config.appOrigin,
          {
            email: oldPayload.email,
            brief: 'Stock counts',
            idempotencyKey: 'anonymous-second-123',
          },
          browserCookies,
          first.csrf,
        ),
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await api.fetch(
        request(
          '/proposals',
          'POST',
          config.appOrigin,
          oldPayload,
          browserCookies,
          fields.csrfToken,
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await api.fetch(
        request(
          '/brief',
          'PATCH',
          config.appOrigin,
          { brief: 'Stock counts' },
          browserCookies,
          fields.csrfToken,
        ),
      )
    ).status,
  ).toBe(200);
  const nextSubmission = await api.fetch(
    request(
      '/proposals',
      'POST',
      config.appOrigin,
      { email: oldPayload.email, brief: 'Stock counts', idempotencyKey: 'anonymous-second-123' },
      browserCookies,
      fields.csrfToken,
    ),
  );
  expect(nextSubmission.status).toBe(201);
  expect(((await nextSubmission.json()) as { receipt: string }).receipt).not.toBe(oldReceipt);
  api.close();
});

test('forged origin and overlong description create no draft', async () => {
  const { api, config } = fixture();
  const forged = await api.fetch(
    request('/intakes', 'POST', 'https://attacker.example', { description: 'private request' }),
  );
  const oversized = await api.fetch(
    request('/intakes', 'POST', config.publicOrigin, { description: 'x'.repeat(2001) }),
  );
  expect(forged.status).toBe(403);
  expect(oversized.status).toBe(400);
  expect(forged.headers.get('set-cookie')).toBeNull();
  expect(oversized.headers.get('set-cookie')).toBeNull();
  api.close();
});

test('foreign browser, missing CSRF and changed replay cannot expose or alter a request', async () => {
  const { api, config } = fixture();
  const { cookie, csrf } = await beginDraft(api);
  expect((await api.fetch(request('/draft', 'GET', config.appOrigin))).status).toBe(401);
  expect(
    (await api.fetch(request('/brief', 'PATCH', config.appOrigin, { brief: 'Forged' }, cookie)))
      .status,
  ).toBe(403);
  const payload = {
    email: 'owner@example.test',
    brief: 'Real brief',
    idempotencyKey: 'submit-98765',
  };
  expect(
    (await api.fetch(request('/proposals', 'POST', config.appOrigin, payload, cookie, csrf)))
      .status,
  ).toBe(201);
  expect(
    (
      await api.fetch(
        request(
          '/proposals',
          'POST',
          config.appOrigin,
          { ...payload, brief: 'Changed' },
          cookie,
          csrf,
        ),
      )
    ).status,
  ).toBe(409);
  expect(
    (await api.fetch(request('/operator/submissions', 'GET', config.appOrigin, undefined, cookie)))
      .status,
  ).toBe(401);
  api.close();
});

test('operator session reload and ordered status changes require operator CSRF', async () => {
  const { api, config } = fixture();
  const { cookie, csrf } = await beginDraft(api);
  const proposal = await api.fetch(
    request(
      '/proposals',
      'POST',
      config.appOrigin,
      { email: 'owner@example.test', brief: 'Calendar', idempotencyKey: 'submit-operator-1' },
      cookie,
      csrf,
    ),
  );
  expect(proposal.status).toBe(201);
  const login = await api.fetch(
    request('/operator/session', 'POST', config.appOrigin, { password: config.operatorPassword }),
  );
  const operatorCookie = login.headers.get('set-cookie')?.split(';')[0];
  const session = await api.fetch(
    request('/operator/session', 'GET', config.appOrigin, undefined, operatorCookie),
  );
  expect(session.status).toBe(200);
  const operatorCsrf = ((await session.json()) as { csrfToken: string }).csrfToken;
  const inbox = await api.fetch(
    request('/operator/submissions', 'GET', config.appOrigin, undefined, operatorCookie),
  );
  const submissionId = ((await inbox.json()) as { submissions: { id: string }[] }).submissions[0]
    .id;
  expect(
    (
      await api.fetch(
        request(
          `/operator/submissions/${submissionId}`,
          'PATCH',
          config.appOrigin,
          { status: 'reviewing' },
          operatorCookie,
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await api.fetch(
        request(
          `/operator/submissions/${submissionId}`,
          'PATCH',
          config.appOrigin,
          { status: 'closed' },
          operatorCookie,
          operatorCsrf,
        ),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await api.fetch(
        request(
          `/operator/submissions/${submissionId}`,
          'PATCH',
          config.appOrigin,
          { status: 'reviewing' },
          operatorCookie,
          operatorCsrf,
        ),
      )
    ).status,
  ).toBe(200);
  api.close();
});

test('explicit local demo session persists bounded chat and concept without paid inference', async () => {
  const { config } = fixture();
  const api = createWebsiteApi({ ...config, demoAuth: true });
  const login = await api.fetch(
    request('/session/demo', 'POST', config.appOrigin, { email: 'prospect@example.test' }),
  );
  expect(login.status).toBe(201);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const session = await api.fetch(request('/session', 'GET', config.appOrigin, undefined, cookie));
  expect(session.status).toBe(200);
  const sessionBody = (await session.json()) as {
    account: { email: string };
    csrfToken: string;
    mode: string;
  };
  expect(sessionBody).toMatchObject({ account: { email: 'prospect@example.test' }, mode: 'demo' });
  const reply = await api.fetch(
    request(
      '/chat',
      'POST',
      config.appOrigin,
      { message: 'We need online booking' },
      cookie,
      sessionBody.csrfToken,
    ),
  );
  expect(reply.status).toBe(200);
  expect(((await reply.json()) as { provider: string; reply: string }).provider).toBe('demo');
  const history = await api.fetch(request('/chat', 'GET', config.appOrigin, undefined, cookie));
  expect(((await history.json()) as { turns: unknown[] }).turns).toHaveLength(2);
  const concept = await api.fetch(
    request('/concept', 'POST', config.appOrigin, {}, cookie, sessionBody.csrfToken),
  );
  expect(concept.status, await concept.clone().text()).toBe(200);
  api.close();
});

test('paid provider call requires verified configuration and sends privacy controls', async () => {
  const { config } = fixture();
  let calls = 0;
  const api = createWebsiteApi({
    ...config,
    demoAuth: true,
    openRouterEnabled: true,
    openRouterKey: 'test-key',
    openRouterModel: 'example/model',
    openRouterProvider: 'ExampleProvider',
    openRouterInputUsdPerMillion: 1,
    openRouterOutputUsdPerMillion: 2,
    openRouterPrivacyVerified: true,
    providerFetch: (_input, init) => {
      calls += 1;
      if (typeof init.body !== 'string') throw new Error('Expected JSON request body');
      const sent = JSON.parse(init.body) as {
        model: string;
        provider: { zdr: boolean; data_collection: string; only: string[] };
        max_tokens: number;
        tools?: unknown;
      };
      expect(sent.model).toBe('example/model');
      expect(sent.provider).toEqual({
        zdr: true,
        data_collection: 'deny',
        only: ['ExampleProvider'],
      });
      expect(sent.max_tokens).toBe(1024);
      expect(sent.tools).toBeUndefined();
      return Response.json({
        id: 'gen-test',
        choices: [{ message: { content: 'Start with a simple booking flow.' } }],
        usage: { prompt_tokens: 200, completion_tokens: 30 },
      });
    },
  });
  const login = await api.fetch(
    request('/session/demo', 'POST', config.appOrigin, { email: 'prospect@example.test' }),
  );
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  const reply = await api.fetch(
    request('/chat', 'POST', config.appOrigin, { message: 'Booking app' }, cookie, csrf),
  );
  expect(reply.status).toBe(200);
  expect(((await reply.json()) as { provider: string }).provider).toBe('openrouter');
  expect(calls).toBe(1);
  api.close();
});

test('missing provider usage retains reservation and blocks further paid calls', async () => {
  const { config } = fixture();
  let calls = 0;
  const api = createWebsiteApi({
    ...config,
    demoAuth: true,
    openRouterEnabled: true,
    openRouterKey: 'test-key',
    openRouterModel: 'example/model',
    openRouterProvider: 'ExampleProvider',
    openRouterInputUsdPerMillion: 1,
    openRouterOutputUsdPerMillion: 2,
    openRouterPrivacyVerified: true,
    providerFetch: () => {
      calls += 1;
      return Response.json({
        id: 'gen-test',
        choices: [{ message: { content: 'Possibly billed' } }],
      });
    },
  });
  const login = await api.fetch(
    request('/session/demo', 'POST', config.appOrigin, { email: 'prospect@example.test' }),
  );
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  expect(
    (
      await api.fetch(
        request('/chat', 'POST', config.appOrigin, { message: 'First' }, cookie, csrf),
      )
    ).status,
  ).toBe(502);
  expect(
    (
      await api.fetch(
        request('/chat', 'POST', config.appOrigin, { message: 'Second' }, cookie, csrf),
      )
    ).status,
  ).toBe(429);
  expect(calls).toBe(1);
  api.close();
});

test('configured OIDC starts PKCE and refuses a forged callback state before token exchange', async () => {
  const { config } = fixture();
  let exchanges = 0;
  const issuer = 'https://identity.example.test';
  const api = createWebsiteApi({
    ...config,
    oidcIssuer: issuer,
    oidcClientId: 'puni-website',
    oidcRedirectUri: 'http://localhost:3101/session/oidc/callback',
    oidcFetch: (input) => {
      if (input.endsWith('/.well-known/openid-configuration'))
        return Response.json({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/keys`,
        });
      exchanges += 1;
      return Response.json({ id_token: 'unexpected' });
    },
  });
  const start = await api.fetch(request('/session/oidc/start', 'GET', config.appOrigin));
  expect(start.status).toBe(302);
  const target = new URL(start.headers.get('location') ?? '');
  expect(target.origin).toBe(issuer);
  expect(target.searchParams.get('code_challenge_method')).toBe('S256');
  expect(target.searchParams.get('code_challenge')).toBeTruthy();
  const oidcCookie = start.headers.get('set-cookie')?.split(';')[0];
  const forged = await api.fetch(
    request(
      '/session/oidc/callback?code=test-code&state=forged',
      'GET',
      config.appOrigin,
      undefined,
      oidcCookie,
    ),
  );
  expect(forged.status).toBe(403);
  expect(exchanges).toBe(0);
  api.close();
});

test('demo auth refuses a non-loopback server bind even when Host says localhost', () => {
  const { config } = fixture();
  expect(() => createWebsiteApi({ ...config, demoAuth: true, apiBindHost: '0.0.0.0' })).toThrow(
    'Demo auth requires loopback',
  );
  expect(() =>
    createWebsiteApi({
      ...config,
      demoAuth: true,
      appOrigin: 'https://app.example.test',
      appManualUrl: 'https://app.example.test/manual',
    }),
  ).toThrow('Demo auth requires loopback');
});

test('OIDC callback verifies signed identity and issues independent prospect session', async () => {
  const { api: unusedApi, config } = fixture();
  unusedApi.close();
  const issuer = 'https://identity.example.test';
  const keys = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const publicKey = await crypto.subtle.exportKey('jwk', keys.publicKey);
  let nonce = '';
  const api = createWebsiteApi({
    ...config,
    oidcIssuer: issuer,
    oidcClientId: 'puni-website',
    oidcRedirectUri: 'http://localhost:3101/session/oidc/callback',
    oidcFetch: async (input, init) => {
      if (input.endsWith('/.well-known/openid-configuration'))
        return Response.json({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/keys`,
        });
      if (input.endsWith('/keys'))
        return Response.json({ keys: [{ ...publicKey, kid: 'test-key' }] });
      expect(input).toBe(`${issuer}/token`);
      if (!(init.body instanceof URLSearchParams)) throw new Error('Expected form request body');
      const form = init.body;
      expect(form.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString(
        'base64url',
      );
      const claims = Buffer.from(
        JSON.stringify({
          iss: issuer,
          aud: 'puni-website',
          nonce,
          sub: 'user-123',
          email: 'verified@example.test',
          email_verified: true,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      ).toString('base64url');
      const content = `${header}.${claims}`;
      const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        keys.privateKey,
        new TextEncoder().encode(content),
      );
      return Response.json({
        id_token: `${content}.${Buffer.from(signature).toString('base64url')}`,
      });
    },
  });
  const start = await api.fetch(request('/session/oidc/start', 'GET', config.appOrigin));
  const target = new URL(start.headers.get('location') ?? '');
  nonce = target.searchParams.get('nonce') ?? '';
  const state = target.searchParams.get('state');
  const oidcCookie = start.headers.get('set-cookie')?.split(';')[0];
  const callback = await api.fetch(
    request(
      `/session/oidc/callback?code=valid-code&state=${String(state)}`,
      'GET',
      config.appOrigin,
      undefined,
      oidcCookie,
    ),
  );
  expect(callback.status).toBe(303);
  const prospectCookie = /puni_session=[a-f0-9]{64}/.exec(
    callback.headers.get('set-cookie') ?? '',
  )?.[0];
  expect(prospectCookie).toBeTruthy();
  const session = await api.fetch(
    request('/session', 'GET', config.appOrigin, undefined, prospectCookie),
  );
  expect(await session.json()).toMatchObject({
    mode: 'oidc',
    account: { email: 'verified@example.test' },
  });
  api.close();
});

test('chunked intake body stops reading after its byte cap', async () => {
  const { api, config } = fixture();
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1;
        if (pulls === 1) controller.enqueue(new TextEncoder().encode('x'.repeat(12_001)));
        else throw new Error('body should not be read beyond the cap');
      },
    },
    { highWaterMark: 0 },
  );
  const intakeInit: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: { origin: config.publicOrigin, 'content-type': 'application/json' },
    body: stream,
    duplex: 'half',
  };
  const intake = new Request('http://localhost:3101/intakes', intakeInit);
  const response = await api.fetch(intake);
  expect(response.status).toBe(400);
  expect(pulls).toBe(1);
  api.close();
});

test('signed-in owner can edit and submit the claimed draft after chat', async () => {
  const { config } = fixture();
  const api = createWebsiteApi({ ...config, demoAuth: true });
  const { cookie: draftCookie } = await beginDraft(api);
  const login = await api.fetch(
    request(
      '/session/demo',
      'POST',
      config.appOrigin,
      { email: 'prospect@example.test' },
      draftCookie,
    ),
  );
  expect(login.status).toBe(201);
  const sessionCookie = login.headers.get('set-cookie')?.split(';')[0];
  const sessionCsrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  const draft = await api.fetch(
    request('/draft', 'GET', config.appOrigin, undefined, sessionCookie),
  );
  expect(draft.status).toBe(200);
  expect(((await draft.json()) as { description: string }).description).toBe(
    'A booking tool for a local studio',
  );
  expect(
    (
      await api.fetch(
        request(
          '/chat',
          'POST',
          config.appOrigin,
          { message: 'Include calendar reminders' },
          sessionCookie,
          sessionCsrf,
        ),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await api.fetch(
        request(
          '/brief',
          'PATCH',
          config.appOrigin,
          { brief: 'Calendar and reminders' },
          sessionCookie,
          sessionCsrf,
        ),
      )
    ).status,
  ).toBe(200);
  const payload = {
    email: 'prospect@example.test',
    brief: 'Calendar and reminders',
    idempotencyKey: 'account-submit-123',
  };
  const first = await api.fetch(
    request('/proposals', 'POST', config.appOrigin, payload, sessionCookie, sessionCsrf),
  );
  expect(first.status).toBe(201);
  const receipt = ((await first.json()) as { receipt: string }).receipt;
  const retry = await api.fetch(
    request('/proposals', 'POST', config.appOrigin, payload, sessionCookie, sessionCsrf),
  );
  expect(retry.status).toBe(200);
  expect(((await retry.json()) as { receipt: string }).receipt).toBe(receipt);
  api.close();
});

test('concept selects a fixed template and allows one saved revision', async () => {
  const { config } = fixture();
  const api = createWebsiteApi({ ...config, demoAuth: true });
  const { cookie: draftCookie } = await beginDraft(api);
  const login = await api.fetch(
    request(
      '/session/demo',
      'POST',
      config.appOrigin,
      { email: 'designer@example.test' },
      draftCookie,
    ),
  );
  const sessionCookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  const concept = await api.fetch(
    request('/concept', 'POST', config.appOrigin, {}, sessionCookie, csrf),
  );
  const first = (await concept.json()) as {
    template: string;
    sections: unknown[];
    simulated: boolean;
    revision: number;
  };
  expect(first).toMatchObject({ template: 'booking', simulated: true, revision: 0 });
  expect(first.sections).toHaveLength(3);
  const revision = await api.fetch(
    request(
      '/concept/revision',
      'POST',
      config.appOrigin,
      { feedback: 'Show the booking calendar first' },
      sessionCookie,
      csrf,
    ),
  );
  expect(revision.status).toBe(200);
  expect(((await revision.json()) as { revision: number }).revision).toBe(1);
  expect(
    (
      await api.fetch(
        request(
          '/concept/revision',
          'POST',
          config.appOrigin,
          { feedback: 'Again' },
          sessionCookie,
          csrf,
        ),
      )
    ).status,
  ).toBe(429);
  const reloaded = await api.fetch(
    request('/concept', 'GET', config.appOrigin, undefined, sessionCookie),
  );
  expect(((await reloaded.json()) as { revision: number }).revision).toBe(1);
  api.close();
});

test('paid provider mode refuses demo concept generation', async () => {
  const { config } = fixture();
  const api = createWebsiteApi({ ...config, demoAuth: true, openRouterEnabled: true });
  const login = await api.fetch(
    request('/session/demo', 'POST', config.appOrigin, { email: 'designer@example.test' }),
  );
  const sessionCookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  expect(
    (await api.fetch(request('/concept', 'POST', config.appOrigin, {}, sessionCookie, csrf)))
      .status,
  ).toBe(503);
  api.close();
});

test('demo concept carries a safe request subject into its fixed template', async () => {
  const { config } = fixture();
  const api = createWebsiteApi({ ...config, demoAuth: true });
  const intake = await api.fetch(
    request('/intakes', 'POST', config.publicOrigin, {
      description:
        'Booking appointments for my pottery studio <script>alert(1)</script> https://bad.example',
    }),
  );
  const draftCookie = intake.headers.get('set-cookie')?.split(';')[0];
  const login = await api.fetch(
    request(
      '/session/demo',
      'POST',
      config.appOrigin,
      { email: 'owner@example.test' },
      draftCookie,
    ),
  );
  const sessionCookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  const concept = await api.fetch(
    request('/concept', 'POST', config.appOrigin, {}, sessionCookie, csrf),
  );
  const view = (await concept.json()) as { subject: string; summary: string };
  expect(view.subject).toContain('pottery studio');
  expect(JSON.stringify(view)).not.toMatch(/<script|https:\/\//i);
  api.close();
});

test('configured provider concept validates bounded JSON and shares paid reservation', async () => {
  const { config } = fixture();
  let calls = 0;
  const api = createWebsiteApi({
    ...config,
    demoAuth: true,
    openRouterEnabled: true,
    openRouterKey: 'test-key',
    openRouterModel: 'example/model',
    openRouterProvider: 'ExampleProvider',
    openRouterInputUsdPerMillion: 1,
    openRouterOutputUsdPerMillion: 2,
    openRouterPrivacyVerified: true,
    providerFetch: () => {
      calls += 1;
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                template: 'booking',
                title: 'Studio booking',
                summary: 'Choose an appointment.',
                sections: [{ title: 'Calendar', body: 'Choose a free slot.' }],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 100 },
      });
    },
  });
  const login = await api.fetch(
    request('/session/demo', 'POST', config.appOrigin, { email: 'owner@example.test' }),
  );
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  const chat = await api.fetch(
    request(
      '/chat',
      'POST',
      config.appOrigin,
      { message: 'Appointment booking for a pottery studio' },
      cookie,
      csrf,
    ),
  );
  expect(chat.status).toBe(200);
  const concept = await api.fetch(request('/concept', 'POST', config.appOrigin, {}, cookie, csrf));
  expect(concept.status).toBe(200);
  expect(await concept.json()).toMatchObject({
    template: 'booking',
    provider: 'openrouter',
    simulated: true,
  });
  expect(calls).toBe(2);
  api.close();
});

test('provider concept refuses remote URLs and executable markup', async () => {
  const { config } = fixture();
  const api = createWebsiteApi({
    ...config,
    demoAuth: true,
    openRouterEnabled: true,
    openRouterKey: 'test-key',
    openRouterModel: 'example/model',
    openRouterProvider: 'ExampleProvider',
    openRouterInputUsdPerMillion: 1,
    openRouterOutputUsdPerMillion: 2,
    openRouterPrivacyVerified: true,
    providerFetch: () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                template: 'workflow',
                title: '<script>alert(1)</script>',
                summary: 'https://evil.example',
                sections: [{ title: 'Unsafe', body: 'Remote asset' }],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 100 },
      }),
  });
  const login = await api.fetch(
    request('/session/demo', 'POST', config.appOrigin, { email: 'owner@example.test' }),
  );
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  expect(
    (await api.fetch(request('/concept', 'POST', config.appOrigin, {}, cookie, csrf))).status,
  ).toBe(502);
  api.close();
});

test('signed-in draft writes require the session CSRF token', async () => {
  const { config } = fixture();
  const api = createWebsiteApi({ ...config, demoAuth: true });
  const { cookie: draftCookie } = await beginDraft(api);
  const login = await api.fetch(
    request(
      '/session/demo',
      'POST',
      config.appOrigin,
      { email: 'owner@example.test' },
      draftCookie,
    ),
  );
  const sessionCookie = login.headers.get('set-cookie')?.split(';')[0];
  expect(
    (
      await api.fetch(
        request('/brief', 'PATCH', config.appOrigin, { brief: 'Forged' }, sessionCookie),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await api.fetch(
        request(
          '/proposals',
          'POST',
          config.appOrigin,
          { email: 'owner@example.test', brief: 'Forged', idempotencyKey: 'forged-12345' },
          sessionCookie,
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (await api.fetch(request('/draft', 'GET', config.appOrigin, undefined, sessionCookie))).status,
  ).toBe(200);
  api.close();
});

test('OIDC callback refuses a valid state paired with another browser cookie', async () => {
  const { config } = fixture();
  const issuer = 'https://identity.example.test';
  let tokenCalls = 0;
  const api = createWebsiteApi({
    ...config,
    oidcIssuer: issuer,
    oidcClientId: 'puni-website',
    oidcRedirectUri: 'http://localhost:3101/session/oidc/callback',
    oidcFetch: (input) => {
      if (input.endsWith('/.well-known/openid-configuration'))
        return Response.json({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/keys`,
        });
      tokenCalls += 1;
      return Response.json({ id_token: 'unexpected' });
    },
  });
  const first = await api.fetch(request('/session/oidc/start', 'GET', config.appOrigin));
  const second = await api.fetch(request('/session/oidc/start', 'GET', config.appOrigin));
  const firstState = new URL(first.headers.get('location') ?? '').searchParams.get('state');
  const otherCookie = second.headers.get('set-cookie')?.split(';')[0];
  const callback = await api.fetch(
    request(
      `/session/oidc/callback?code=test-code&state=${String(firstState)}`,
      'GET',
      config.appOrigin,
      undefined,
      otherCookie,
    ),
  );
  expect(callback.status).toBe(403);
  expect(tokenCalls).toBe(0);
  api.close();
});

test('enabled inference without vetted rate or privacy configuration never calls provider', async () => {
  const { config } = fixture();
  let calls = 0;
  const api = createWebsiteApi({
    ...config,
    demoAuth: true,
    openRouterEnabled: true,
    openRouterKey: 'test-key',
    openRouterModel: 'example/model',
    providerFetch: () => {
      calls += 1;
      return Response.json({});
    },
  });
  const login = await api.fetch(
    request('/session/demo', 'POST', config.appOrigin, { email: 'owner@example.test' }),
  );
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  expect(
    (
      await api.fetch(
        request('/chat', 'POST', config.appOrigin, { message: 'Need booking' }, cookie, csrf),
      )
    ).status,
  ).toBe(503);
  expect(calls).toBe(0);
  api.close();
});

test('edited applied website migration refuses startup', () => {
  const { api, config } = fixture();
  api.close();
  const database = new Database(config.databasePath);
  database
    .query('UPDATE schema_migration SET checksum = ? WHERE name = ?')
    .run('changed', '001_initial');
  database.close();
  expect(() => createWebsiteApi(config)).toThrow(
    'Website migration 001_initial changed after application',
  );
});

test('returning signed-in prospect starts a fresh request without reviving old chat or concept', async () => {
  const { config } = fixture();
  const api = createWebsiteApi({ ...config, demoAuth: true });
  const firstIntake = await api.fetch(
    request('/intakes', 'POST', config.publicOrigin, {
      description: 'Appointment booking for pottery studio',
    }),
  );
  const firstDraftCookie = firstIntake.headers.get('set-cookie')?.split(';')[0];
  const login = await api.fetch(
    request(
      '/session/demo',
      'POST',
      config.appOrigin,
      { email: 'returning@example.test' },
      firstDraftCookie,
    ),
  );
  const sessionCookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  expect(
    (
      await api.fetch(
        request(
          '/chat',
          'POST',
          config.appOrigin,
          { message: 'Need booking reminders' },
          sessionCookie,
          csrf,
        ),
      )
    ).status,
  ).toBe(200);
  expect(
    (await api.fetch(request('/concept', 'POST', config.appOrigin, {}, sessionCookie, csrf)))
      .status,
  ).toBe(200);
  const firstProposal = await api.fetch(
    request(
      '/proposals',
      'POST',
      config.appOrigin,
      {
        email: 'returning@example.test',
        brief: 'Booking reminders',
        idempotencyKey: 'return-first-123',
      },
      sessionCookie,
      csrf,
    ),
  );
  expect(firstProposal.status).toBe(201);
  const firstReceipt = ((await firstProposal.json()) as { receipt: string }).receipt;
  const secondIntake = await api.fetch(
    request(
      '/intakes',
      'POST',
      config.publicOrigin,
      { description: 'Analytics dashboard for pottery sales' },
      sessionCookie,
    ),
  );
  expect(secondIntake.status).toBe(201);
  const oldPayload = {
    email: 'returning@example.test',
    brief: 'Booking reminders',
    idempotencyKey: 'return-first-123',
  };
  // Proof: looking up only the active request's replay made this return 201 and submit request B.
  const oldRetry = await api.fetch(
    request('/proposals', 'POST', config.appOrigin, oldPayload, sessionCookie, csrf),
  );
  expect(oldRetry.status).toBe(200);
  expect(((await oldRetry.json()) as { receipt: string }).receipt).toBe(firstReceipt);
  expect(
    (
      await api.fetch(
        request(
          '/proposals',
          'POST',
          config.appOrigin,
          { ...oldPayload, brief: 'Changed old brief' },
          sessionCookie,
          csrf,
        ),
      )
    ).status,
  ).toBe(409);
  const session = await api.fetch(
    request('/session', 'GET', config.appOrigin, undefined, sessionCookie),
  );
  expect(((await session.json()) as { draft: { description: string } }).draft.description).toBe(
    'Analytics dashboard for pottery sales',
  );
  expect(
    (
      (await api
        .fetch(request('/chat', 'GET', config.appOrigin, undefined, sessionCookie))
        .then((response) => response.json())) as { turns: unknown[] }
    ).turns,
  ).toHaveLength(0);
  expect(
    (await api.fetch(request('/concept', 'GET', config.appOrigin, undefined, sessionCookie)))
      .status,
  ).toBe(404);
  const secondProposal = await api.fetch(
    request(
      '/proposals',
      'POST',
      config.appOrigin,
      {
        email: 'returning@example.test',
        brief: 'Sales dashboard',
        idempotencyKey: 'return-second-123',
      },
      sessionCookie,
      csrf,
    ),
  );
  expect(secondProposal.status).toBe(201);
  expect(((await secondProposal.json()) as { receipt: string }).receipt).not.toBe(firstReceipt);
  const database = new Database(config.databasePath);
  database.query('UPDATE submission_replay SET expires_at = 0 WHERE receipt = ?').run(firstReceipt);
  database.close();
  // Proof: removing account replay's expiry predicate returned an old receipt after its authority ended.
  expect(
    (
      await api.fetch(
        request('/proposals', 'POST', config.appOrigin, oldPayload, sessionCookie, csrf),
      )
    ).status,
  ).toBe(401);
  const operator = await api.fetch(
    request('/operator/session', 'POST', config.appOrigin, { password: config.operatorPassword }),
  );
  const operatorCookie = operator.headers.get('set-cookie')?.split(';')[0];
  const inbox = await api.fetch(
    request('/operator/submissions', 'GET', config.appOrigin, undefined, operatorCookie),
  );
  const submissions = ((await inbox.json()) as { submissions: { description: string }[] })
    .submissions;
  expect(submissions).toHaveLength(2);
  expect(submissions.map((submission) => submission.description).sort()).toEqual([
    'Analytics dashboard for pottery sales',
    'Appointment booking for pottery studio',
  ]);
  api.close();
});

test('provider brief allowance resets for a second request while account-day spend remains', async () => {
  const { config } = fixture();
  let calls = 0;
  const api = createWebsiteApi({
    ...config,
    demoAuth: true,
    openRouterEnabled: true,
    openRouterKey: 'test-key',
    openRouterModel: 'example/model',
    openRouterProvider: 'ExampleProvider',
    openRouterInputUsdPerMillion: 100,
    openRouterOutputUsdPerMillion: 100,
    openRouterPrivacyVerified: true,
    providerFetch: () => {
      calls += 1;
      return Response.json({
        choices: [{ message: { content: 'Who will use the first release?' } }],
        usage: { prompt_tokens: 2000, completion_tokens: 1000 },
      });
    },
  });
  const first = await api.fetch(
    request('/intakes', 'POST', config.publicOrigin, { description: 'First booking request' }),
  );
  const draftCookie = first.headers.get('set-cookie')?.split(';')[0];
  const login = await api.fetch(
    request(
      '/session/demo',
      'POST',
      config.appOrigin,
      { email: 'owner@example.test' },
      draftCookie,
    ),
  );
  const sessionCookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  expect(
    (
      await api.fetch(
        request(
          '/chat',
          'POST',
          config.appOrigin,
          { message: 'Booking calendar' },
          sessionCookie,
          csrf,
        ),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await api.fetch(
        request(
          '/proposals',
          'POST',
          config.appOrigin,
          { email: 'owner@example.test', brief: 'Calendar', idempotencyKey: 'budget-first-123' },
          sessionCookie,
          csrf,
        ),
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await api.fetch(
        request(
          '/intakes',
          'POST',
          config.publicOrigin,
          { description: 'Second dashboard request' },
          sessionCookie,
        ),
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await api.fetch(
        request(
          '/chat',
          'POST',
          config.appOrigin,
          { message: 'Sales dashboard' },
          sessionCookie,
          csrf,
        ),
      )
    ).status,
  ).toBe(200);
  expect(calls).toBe(2);
  api.close();
});

test('OIDC issuer and subject own identity even when email changes or is reused', () => {
  const { config } = fixture();
  const store = new WebsiteStore(config.databasePath);
  const first = store.createOidcAccount(
    'https://identity.example.test',
    'subject-one',
    'first@example.test',
    Date.now(),
  );
  expect(first).not.toBeNull();
  expect(
    store.createOidcAccount(
      'https://identity.example.test',
      'subject-one',
      'changed@example.test',
      Date.now(),
    )?.id,
  ).toBe(first?.id);
  expect(
    store.createOidcAccount(
      'https://identity.example.test',
      'subject-two',
      'first@example.test',
      Date.now(),
    ),
  ).toBeNull();
  store.close();
});

test('existing session claims a new intake on draft resume when public POST lacked the session cookie', async () => {
  const { config } = fixture();
  const api = createWebsiteApi({ ...config, demoAuth: true });
  const first = await api.fetch(
    request('/intakes', 'POST', config.publicOrigin, { description: 'First booking request' }),
  );
  const firstClaim = first.headers.get('set-cookie')?.split(';')[0];
  const login = await api.fetch(
    request('/session/demo', 'POST', config.appOrigin, { email: 'owner@example.test' }, firstClaim),
  );
  const sessionCookie = login.headers.get('set-cookie')?.split(';')[0];
  const second = await api.fetch(
    request('/intakes', 'POST', config.publicOrigin, { description: 'Second dashboard request' }),
  );
  const secondClaim = second.headers.get('set-cookie')?.split(';')[0];
  const resumed = await api.fetch(
    request(
      '/draft',
      'GET',
      config.appOrigin,
      undefined,
      `${String(sessionCookie)}; ${String(secondClaim)}`,
    ),
  );
  expect(resumed.status).toBe(200);
  expect(((await resumed.json()) as { description: string }).description).toBe(
    'Second dashboard request',
  );
  api.close();
});
