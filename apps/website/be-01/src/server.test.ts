import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebsiteStore } from '@website/store-sqlite';
import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { createWebsiteApi, type WebsiteApiConfig } from './server';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

/** Mounts the API as served from a loopback socket, which is the request source unless a test names one. */
function mountApi(config: WebsiteApiConfig): ReturnType<typeof createWebsiteApi> {
  const api = createWebsiteApi(config);
  return {
    fetch: (request, clientAddress = '127.0.0.1') => api.fetch(request, clientAddress),
    close: () => {
      api.close();
    },
  };
}

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
  return { api: mountApi(config), config };
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

test('entry distinguishes missing and expired claims and limits site reads to entry', async () => {
  const { api, config } = fixture();
  const missing = await api.fetch(request('/entry', 'GET', config.publicOrigin));
  expect(await missing.json()).toEqual({ available: false, reason: 'missing' });
  const { cookie } = await beginDraft(api);
  const available = await api.fetch(
    request('/entry', 'GET', config.publicOrigin, undefined, cookie),
  );
  expect(await available.json()).toEqual({ available: true, reason: null });
  expect(available.headers.get('cache-control')).toBe('no-store');
  expect(
    (await api.fetch(request('/entry', 'GET', 'https://foreign.example', undefined, cookie)))
      .status,
  ).toBe(403);
  expect(
    (await api.fetch(request('/draft', 'GET', config.publicOrigin, undefined, cookie))).status,
  ).toBe(403);
  expect(
    await (
      await api.fetch(
        request('/entry', 'GET', config.appOrigin, undefined, 'puni_draft=' + 'a'.repeat(64)),
      )
    ).json(),
  ).toEqual({ available: false, reason: 'expired' });
  api.close();
});

test('native intake uses fixed Build URL when configured', async () => {
  const { config } = fixture();
  const api = mountApi({ ...config, appBuildUrl: `${config.appOrigin}/studio` });
  const response = await api.fetch(
    new Request('http://localhost:3101/intakes', {
      method: 'POST',
      headers: {
        origin: config.publicOrigin,
        accept: 'text/html',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ description: 'Build a booking app' }),
    }),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe(`${config.appOrigin}/studio`);
  api.close();
});

test('streamed initial turn persists once and replays without another provider call', async () => {
  const { config } = fixture();
  let calls = 0;
  const api = mountApi({
    ...config,
    demoAuth: true,
    openRouterEnabled: true,
    openRouterKey: 'fixture-only',
    openRouterModel: 'fixture/model',
    openRouterProvider: 'Fixture',
    openRouterInputUsdPerMillion: 1,
    openRouterOutputUsdPerMillion: 2,
    openRouterPrivacyVerified: true,
    providerFetch: (_input, init) => {
      calls += 1;
      if (typeof init.body !== 'string') throw new Error('Expected JSON body');
      const sent = JSON.parse(init.body) as {
        stream: boolean;
        stream_options: { include_usage: boolean };
        provider: {
          only: string[];
          zdr: boolean;
          data_collection: string;
          allow_fallbacks: boolean;
          require_parameters: boolean;
          max_price: { prompt: number; completion: number; request: number };
        };
      };
      expect(sent.stream).toBe(true);
      expect(sent.stream_options.include_usage).toBe(true);
      expect(Reflect.get(sent, 'max_completion_tokens')).toBe(1024);
      // Proof: passing maxOutputTokens to streamText again put max_tokens on the wire and failed this.
      expect(Object.keys(sent)).not.toContain('max_tokens');
      expect(sent.provider).toEqual({
        only: ['Fixture'],
        zdr: true,
        data_collection: 'deny',
        allow_fallbacks: false,
        require_parameters: true,
        max_price: { prompt: 1, completion: 2, request: 0 },
      });
      const chunks = [
        {
          id: 'gen-1',
          model: 'fixture/model',
          choices: [
            { index: 0, delta: { role: 'assistant', content: 'Hello PUNI' }, finish_reason: null },
          ],
        },
        {
          id: 'gen-1',
          model: 'fixture/model',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 },
        },
      ];
      return new Response(
        chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      );
    },
  });
  const { cookie: draftCookie } = await beginDraft(api);
  const login = await api.fetch(
    request(
      '/session/demo',
      'POST',
      config.appOrigin,
      { email: 'builder@example.test' },
      draftCookie,
    ),
  );
  const sessionCookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  const history = (await (
    await api.fetch(request('/chat', 'GET', config.appOrigin, undefined, sessionCookie))
  ).json()) as { initialOperation: { idempotencyKey: string } };
  const payload = {
    message: 'Ignore this',
    initial: true,
    idempotencyKey: history.initialOperation.idempotencyKey,
  };
  const first = await api.fetch(
    request('/chat/stream', 'POST', config.appOrigin, payload, sessionCookie, csrf),
  );
  expect(first.status).toBe(200);
  expect(first.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1');
  expect(await first.text()).toContain('Hello PUNI');
  const replay = await api.fetch(
    request(
      '/chat/stream',
      'POST',
      config.appOrigin,
      { ...payload, idempotencyKey: 'browser-retry-987', message: 'Changed browser text' },
      sessionCookie,
      csrf,
    ),
  );
  expect(replay.status).toBe(200);
  expect(await replay.text()).toContain('Hello PUNI');
  const saved = (await (
    await api.fetch(request('/chat', 'GET', config.appOrigin, undefined, sessionCookie))
  ).json()) as { turns: { content: string }[]; initialOperation: { state: string } };
  expect(saved.turns.map((turn) => turn.content)).toEqual([
    'A booking tool for a local studio',
    'Hello PUNI',
  ]);
  expect(saved.initialOperation.state).toBe('completed');
  expect(calls).toBe(1);
  api.close();
  const unavailable = mountApi({ ...config, demoAuth: false, openRouterEnabled: false });
  const savedReplay = await unavailable.fetch(
    request('/chat/stream', 'POST', config.appOrigin, payload, sessionCookie, csrf),
  );
  // Proof: checking provider readiness before durable replay makes this saved answer return 503.
  expect(savedReplay.status).toBe(200);
  expect(await savedReplay.text()).toContain('Hello PUNI');
  expect(calls).toBe(1);
  expect(
    (
      await unavailable.fetch(
        request(
          '/chat/stream',
          'POST',
          config.appOrigin,
          { message: 'New work', idempotencyKey: 'new-work-123' },
          sessionCookie,
          csrf,
        ),
      )
    ).status,
  ).toBe(503);
  unavailable.close();
});

test('missing stream usage leaves reservation unsettled and blocks another paid turn', async () => {
  const { config } = fixture();
  let calls = 0;
  const api = mountApi({
    ...config,
    demoAuth: true,
    openRouterEnabled: true,
    openRouterKey: 'fixture-only',
    openRouterModel: 'fixture/model',
    openRouterProvider: 'Fixture',
    openRouterInputUsdPerMillion: 1,
    openRouterOutputUsdPerMillion: 2,
    openRouterPrivacyVerified: true,
    providerFetch: () => {
      calls += 1;
      const chunk = {
        id: 'gen-2',
        model: 'fixture/model',
        choices: [
          { index: 0, delta: { role: 'assistant', content: 'Unbilled?' }, finish_reason: 'stop' },
        ],
      };
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  });
  const login = await api.fetch(
    request('/session/demo', 'POST', config.appOrigin, { email: 'builder@example.test' }),
  );
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  const first = await api.fetch(
    request(
      '/chat/stream',
      'POST',
      config.appOrigin,
      { message: 'First', idempotencyKey: 'message-key-1' },
      cookie,
      csrf,
    ),
  );
  expect(first.status).toBe(200);
  const streamed = await first.text();
  expect(streamed).toContain('"type":"error"');
  const second = await api.fetch(
    request(
      '/chat/stream',
      'POST',
      config.appOrigin,
      { message: 'Second', idempotencyKey: 'message-key-2' },
      cookie,
      csrf,
    ),
  );
  expect(second.status).toBe(429);
  expect(calls).toBe(1);
  api.close();
});

test('output-limit finish with verified usage settles and records a truncated reply', async () => {
  const { config } = fixture();
  const api = mountApi({
    ...config,
    demoAuth: true,
    openRouterEnabled: true,
    openRouterKey: 'fixture-only',
    openRouterModel: 'fixture/model',
    openRouterProvider: 'Fixture',
    openRouterInputUsdPerMillion: 1,
    openRouterOutputUsdPerMillion: 2,
    openRouterPrivacyVerified: true,
    providerFetch: () => {
      const chunks = [
        {
          id: 'gen-limit',
          model: 'fixture/model',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'Partial answer' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'gen-limit',
          model: 'fixture/model',
          choices: [{ index: 0, delta: {}, finish_reason: 'length' }],
          usage: { prompt_tokens: 20, completion_tokens: 1024, total_tokens: 1044 },
        },
      ];
      return new Response(
        chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      );
    },
  });
  const login = await api.fetch(
    request('/session/demo', 'POST', config.appOrigin, { email: 'builder@example.test' }),
  );
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  const reply = await api.fetch(
    request(
      '/chat/stream',
      'POST',
      config.appOrigin,
      { message: 'Explain', idempotencyKey: 'limit-key-1' },
      cookie,
      csrf,
    ),
  );
  expect(reply.status).toBe(200);
  expect(await reply.text()).toContain('"type":"finish"');
  const history = (await (
    await api.fetch(request('/chat', 'GET', config.appOrigin, undefined, cookie))
  ).json()) as {
    turns: { content: string }[];
    latestOperation: { state: string; truncated: boolean };
  };
  // Proof: treating a known output-limit finish as unknown loses the paid reply despite verified usage.
  expect(history.turns.map((turn) => turn.content)).toEqual(['Explain', 'Partial answer']);
  expect(history.latestOperation).toMatchObject({ state: 'completed', truncated: true });
  api.close();
});

test('stream admission rejects missing CSRF, duplicate inflight and changed-body replay before another call', async () => {
  const { config } = fixture();
  let calls = 0;
  const api = mountApi({
    ...config,
    demoAuth: true,
    openRouterEnabled: true,
    openRouterKey: 'fixture-only',
    openRouterModel: 'fixture/model',
    openRouterProvider: 'Fixture',
    openRouterInputUsdPerMillion: 1,
    openRouterOutputUsdPerMillion: 2,
    openRouterPrivacyVerified: true,
    providerFetch: () => {
      calls += 1;
      return new Response(new ReadableStream(), {
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  });
  const login = await api.fetch(
    request('/session/demo', 'POST', config.appOrigin, { email: 'builder@example.test' }),
  );
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  const payload = { message: 'First', idempotencyKey: 'message-key-1' };
  // Proof: deleting the stream CSRF guard reserves a provider call on this forged request.
  expect(
    (await api.fetch(request('/chat/stream', 'POST', config.appOrigin, payload, cookie))).status,
  ).toBe(403);
  const first = await api.fetch(
    request('/chat/stream', 'POST', config.appOrigin, payload, cookie, csrf),
  );
  expect(first.status).toBe(200);
  expect(
    (await api.fetch(request('/chat/stream', 'POST', config.appOrigin, payload, cookie, csrf)))
      .status,
  ).toBe(409);
  // Proof: deleting the body-hash guard accepts this changed message under an existing operation key.
  const changed = await api.fetch(
    request(
      '/chat/stream',
      'POST',
      config.appOrigin,
      { ...payload, message: 'Changed' },
      cookie,
      csrf,
    ),
  );
  expect(changed.status).toBe(409);
  expect(await changed.json()).toEqual({ code: 'idempotency_conflict' });
  expect(
    (
      await api.fetch(
        request('/chat', 'POST', config.appOrigin, { message: 'Legacy' }, cookie, csrf),
      )
    ).status,
  ).toBe(409);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(calls).toBe(1);
  const otherLogin = await api.fetch(
    request('/session/demo', 'POST', config.appOrigin, { email: 'other@example.test' }),
  );
  const otherCookie = otherLogin.headers.get('set-cookie')?.split(';')[0];
  const otherCsrf = ((await otherLogin.json()) as { csrfToken: string }).csrfToken;
  // Proof: dropping the request/account lookup lets another prospect cancel this call.
  expect(
    (
      await api.fetch(
        request(
          '/chat/cancel',
          'POST',
          config.appOrigin,
          { idempotencyKey: payload.idempotencyKey },
          otherCookie,
          otherCsrf,
        ),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await api.fetch(
        request(
          '/chat/cancel',
          'POST',
          config.appOrigin,
          { idempotencyKey: payload.idempotencyKey },
          cookie,
        ),
      )
    ).status,
  ).toBe(403);
  // Proof: cancel must change the operation to unknown; otherwise a retry remains inflight.
  expect(
    (
      await api.fetch(
        request(
          '/chat/cancel',
          'POST',
          config.appOrigin,
          { idempotencyKey: payload.idempotencyKey },
          cookie,
          csrf,
        ),
      )
    ).status,
  ).toBe(200);
  expect(
    (await api.fetch(request('/chat/stream', 'POST', config.appOrigin, payload, cookie, csrf)))
      .status,
  ).toBe(409);
  await first.body?.cancel();
  api.close();
});

test('site JSON intake exposes its credentialed response only to the site origin', async () => {
  const { api, config } = fixture();
  const response = await api.fetch(
    request('/intakes', 'POST', config.publicOrigin, { description: 'New request' }),
  );
  expect(response.status).toBe(201);
  expect(response.headers.get('access-control-allow-origin')).toBe(config.publicOrigin);
  expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  const preflight = await api.fetch(request('/intakes', 'OPTIONS', config.publicOrigin));
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get('access-control-allow-origin')).toBe(config.publicOrigin);
  expect((await api.fetch(request('/intakes', 'OPTIONS', 'https://foreign.example'))).status).toBe(
    403,
  );
  api.close();
});

test('Build sign-in refuses a missing request before OIDC discovery', async () => {
  const { config } = fixture();
  let discoveries = 0;
  const api = mountApi({
    ...config,
    appBuildUrl: config.appOrigin,
    oidcIssuer: 'https://identity.example.test',
    oidcClientId: 'fixture-client',
    oidcRedirectUri: 'https://api.example.test/session/oidc/callback',
    oidcFetch: () => {
      discoveries += 1;
      return Response.json({});
    },
  });
  // Proof: removing the entry gate begins a login for a browser with no submitted request.
  expect((await api.fetch(request('/session/oidc/start', 'GET', config.appOrigin))).status).toBe(
    409,
  );
  expect(discoveries).toBe(0);
  api.close();
});

test('Build redirect rejects a foreign target', () => {
  const { config } = fixture();
  // Proof: relaxing the fixed Build URL guard allows a native intake to redirect off-site.
  expect(() => mountApi({ ...config, appBuildUrl: 'https://foreign.example/studio' })).toThrow(
    'Build redirect must be fixed',
  );
});

test('Google prefixed callback exchanges code with secret in form body', async () => {
  const { config } = fixture();
  let exchanged = false;
  const api = mountApi({
    ...config,
    oidcIssuer: 'https://accounts.google.com',
    oidcClientId: 'fixture-client',
    oidcClientSecret: 'fixture-secret',
    oidcRedirectUri: 'https://dev.puni.dev/api/session/oidc/callback',
    oidcFetch: (input, init) => {
      if (input.endsWith('/.well-known/openid-configuration'))
        return Response.json({
          issuer: 'https://accounts.google.com',
          authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
          token_endpoint: 'https://oauth2.googleapis.com/token',
          jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
        });
      if (input === 'https://oauth2.googleapis.com/token') {
        exchanged = true;
        if (!(init.body instanceof URLSearchParams)) throw new Error('Expected form body');
        // Proof: omitting Google's client_secret form field fails this token-boundary assertion.
        expect(init.body.get('client_secret')).toBe('fixture-secret');
        expect(init.body.get('redirect_uri')).toBe(
          'https://dev.puni.dev/api/session/oidc/callback',
        );
        return Response.json({ code: 'fixture-invalid-token' }, { status: 400 });
      }
      throw new Error(`Unexpected OIDC URL: ${input}`);
    },
  });
  const start = await api.fetch(request('/session/oidc/start', 'GET', config.appOrigin));
  expect(start.status).toBe(302);
  const state = new URL(start.headers.get('location') ?? '').searchParams.get('state');
  const oidcCookie = start.headers.get('set-cookie')?.split(';')[0];
  const callback = await api.fetch(
    request(
      `/api/session/oidc/callback?state=${String(state)}&code=fixture`,
      'GET',
      config.appOrigin,
      undefined,
      oidcCookie,
    ),
  );
  expect(callback.status).toBe(502);
  expect(exchanged).toBe(true);
  api.close();
});

test('Google sign-in without a web client secret stays unavailable', async () => {
  const { config } = fixture();
  let discoveries = 0;
  const api = mountApi({
    ...config,
    oidcIssuer: 'https://accounts.google.com',
    oidcClientId: 'fixture-client',
    oidcRedirectUri: 'https://dev.puni.dev/api/session/oidc/callback',
    oidcFetch: () => {
      discoveries += 1;
      return Response.json({});
    },
  });
  const session = await api.fetch(request('/session', 'GET', config.appOrigin));
  expect((await session.json()) as { configured: boolean }).toMatchObject({ configured: false });
  // Proof: omitting the Google-secret readiness guard advertises sign-in and starts discovery.
  expect((await api.fetch(request('/session/oidc/start', 'GET', config.appOrigin))).status).toBe(
    503,
  );
  expect(discoveries).toBe(0);
  api.close();
});

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
  const reopened = mountApi(config);
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

test('wrong operator password creates no session and the configured password still works', async () => {
  const { api, config } = fixture();
  const wrong = await api.fetch(
    request('/operator/session', 'POST', config.appOrigin, { password: 'incorrect-secret' }),
  );
  // Proof: bypassing the operator verifier made this mounted route issue a session for the wrong password.
  expect(wrong.status).toBe(401);
  expect(wrong.headers.get('set-cookie')).toBeNull();
  const correct = await api.fetch(
    request('/operator/session', 'POST', config.appOrigin, { password: config.operatorPassword }),
  );
  expect(correct.status).toBe(201);
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
  const api = mountApi({ ...config, demoAuth: true });
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
  const api = mountApi({
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
        provider: {
          zdr: boolean;
          data_collection: string;
          only: string[];
          allow_fallbacks: boolean;
          require_parameters: boolean;
          max_price: { prompt: number; completion: number; request: number };
        };
        max_completion_tokens: number;
        tools?: unknown;
      };
      expect(sent.model).toBe('example/model');
      expect(sent.provider).toEqual({
        zdr: true,
        data_collection: 'deny',
        only: ['ExampleProvider'],
        allow_fallbacks: false,
        require_parameters: true,
        max_price: { prompt: 1, completion: 2, request: 0 },
      });
      expect(sent.max_completion_tokens).toBe(1024);
      // Proof: restoring max_tokens in the direct JSON body failed this.
      expect(Object.keys(sent)).not.toContain('max_tokens');
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

for (const route of ['/chat', '/chat/stream'] as const) {
  test(`${route} sends excluded reasoning only when an effort is configured`, async () => {
    const sentReasoning: unknown[] = [];
    for (const openRouterReasoningEffort of ['minimal', undefined] as const) {
      const { api: initialApi, config } = fixture();
      initialApi.close();
      const website = mountApi({
        ...config,
        demoAuth: true,
        openRouterEnabled: true,
        openRouterKey: 'fixture-key',
        openRouterModel: 'fixture/model',
        openRouterProvider: 'Fixture',
        openRouterInputUsdPerMillion: 1,
        openRouterOutputUsdPerMillion: 2,
        openRouterPrivacyVerified: true,
        openRouterReasoningEffort,
        providerFetch: (_input, init) => {
          if (typeof init.body !== 'string') throw new Error('Expected JSON request body');
          const sent = JSON.parse(init.body) as Record<string, unknown>;
          sentReasoning.push('reasoning' in sent ? sent['reasoning'] : 'absent');
          // The signed-in caps stay 1,024; reasoning tokens count inside them.
          expect(sent['max_completion_tokens']).toBe(1024);
          expect(Object.keys(sent)).not.toContain('max_tokens');
          if (!sent['stream'])
            return Response.json({
              choices: [{ message: { content: 'A useful reply.' } }],
              usage: { prompt_tokens: 20, completion_tokens: 3 },
            });
          const chunks = [
            {
              id: 'reasoning',
              model: 'fixture/model',
              choices: [
                {
                  index: 0,
                  delta: { role: 'assistant', content: 'A useful reply.' },
                  finish_reason: null,
                },
              ],
            },
            {
              id: 'reasoning',
              model: 'fixture/model',
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 },
            },
          ];
          return new Response(
            chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') +
              'data: [DONE]\n\n',
            { headers: { 'content-type': 'text/event-stream' } },
          );
        },
      });
      const login = await website.fetch(
        request('/session/demo', 'POST', config.appOrigin, { email: 'reasoning@example.test' }),
      );
      const cookie = login.headers.get('set-cookie')?.split(';')[0];
      const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
      const response = await website.fetch(
        request(
          route,
          'POST',
          config.appOrigin,
          route === '/chat'
            ? { message: 'A booking tool' }
            : { message: 'A booking tool', idempotencyKey: 'reasoning-key-123' },
          cookie,
          csrf,
        ),
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('A useful reply.');
      website.close();
    }
    // Proof: dropping reasoningRequest from the direct JSON body failed the /chat case;
    // always sending it failed the unset case with a reasoning key.
    expect(sentReasoning).toEqual([{ effort: 'minimal', exclude: true }, 'absent']);
  });
}

for (const route of ['/chat', '/chat/stream'] as const) {
  test(`${route} keeps admitted rates through outbound ceiling and settlement`, async () => {
    const { api: initialApi, config } = fixture();
    initialApi.close();
    let outboundPrice: unknown;
    const paidConfig: WebsiteApiConfig = {
      ...config,
      demoAuth: true,
      openRouterEnabled: true,
      openRouterKey: 'fixture-key',
      openRouterModel: 'fixture/model',
      openRouterProvider: 'Fixture',
      openRouterInputUsdPerMillion: 1,
      openRouterOutputUsdPerMillion: 2,
      openRouterPrivacyVerified: true,
      providerFetch: (_input, init) => {
        if (typeof init.body !== 'string') throw new Error('Expected JSON request body');
        const sent = JSON.parse(init.body) as {
          provider?: { max_price?: unknown };
          stream?: boolean;
        };
        outboundPrice = sent.provider?.max_price;
        if (!sent.stream)
          return Response.json({
            choices: [{ message: { content: 'A useful reply.' } }],
            usage: { prompt_tokens: 20, completion_tokens: 3 },
          });
        const chunks = [
          {
            id: 'rate-snapshot',
            model: 'fixture/model',
            choices: [
              {
                index: 0,
                delta: { role: 'assistant', content: 'A useful reply.' },
                finish_reason: null,
              },
            ],
          },
          {
            id: 'rate-snapshot',
            model: 'fixture/model',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 },
          },
        ];
        return new Response(
          chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        );
      },
    };
    const website = mountApi(paidConfig);
    const login = await website.fetch(
      request('/session/demo', 'POST', config.appOrigin, { email: 'rates@example.test' }),
    );
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
    const admission = Reflect.get(WebsiteStore.prototype, 'admitChatOperation');
    WebsiteStore.prototype.admitChatOperation = function (...args: Parameters<typeof admission>) {
      const outcome = admission.apply(this, args);
      if (outcome.kind === 'started') {
        paidConfig.openRouterInputUsdPerMillion = undefined;
        paidConfig.openRouterOutputUsdPerMillion = undefined;
      }
      return outcome;
    };
    try {
      const response = await website.fetch(
        request(
          route,
          'POST',
          config.appOrigin,
          route === '/chat'
            ? { message: 'A booking tool' }
            : { message: 'A booking tool', idempotencyKey: 'rate-snapshot-123' },
          cookie,
          csrf,
        ),
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('A useful reply.');
      expect(outboundPrice).toEqual({ prompt: 1, completion: 2, request: 0 });
      const inspection = new Database(config.databasePath);
      try {
        const call = inspection
          .query<{ reserved_micro_usd: number; settled_micro_usd: number | null }, []>(
            'SELECT reserved_micro_usd, settled_micro_usd FROM provider_call LIMIT 1',
          )
          .get();
        const expectedReservation =
          Buffer.byteLength(JSON.stringify(['A booking tool']), 'utf8') + 2_000 + 1_024 * 2;
        expect(call?.reserved_micro_usd).toBe(expectedReservation);
        expect(call?.settled_micro_usd).toBe(26);
        expect(
          inspection.query<{ count: number }, []>('SELECT count(*) AS count FROM chat_turn').get()
            ?.count,
        ).toBe(2);
      } finally {
        inspection.close();
      }
    } finally {
      WebsiteStore.prototype.admitChatOperation = admission;
      website.close();
    }
  });
}

test('legacy paid chat leaves usage unsettled if saving its reply fails', async () => {
  const { config } = fixture();
  const api = mountApi({
    ...config,
    demoAuth: true,
    openRouterEnabled: true,
    openRouterKey: 'fixture-key',
    openRouterModel: 'fixture/model',
    openRouterProvider: 'Fixture',
    openRouterInputUsdPerMillion: 1,
    openRouterOutputUsdPerMillion: 2,
    openRouterPrivacyVerified: true,
    providerFetch: () =>
      Response.json({
        id: 'gen-fixture',
        choices: [{ message: { content: 'Save this reply.' } }],
        usage: { prompt_tokens: 20, completion_tokens: 4 },
      }),
  });
  const login = await api.fetch(
    request('/session/demo', 'POST', config.appOrigin, { email: 'atomic@example.test' }),
  );
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  const inspection = new Database(config.databasePath);
  inspection.run(
    "CREATE TRIGGER fail_assistant_turn BEFORE INSERT ON chat_turn WHEN NEW.role = 'assistant' BEGIN SELECT RAISE(ABORT, 'injected save failure'); END",
  );
  let failedSave: unknown;
  try {
    await api.fetch(request('/chat', 'POST', config.appOrigin, { message: 'First' }, cookie, csrf));
  } catch (error) {
    failedSave = error;
  }
  expect(failedSave).toMatchObject({ message: 'injected save failure' });
  const call = inspection
    .query<{ settled_micro_usd: number | null }, []>(
      'SELECT settled_micro_usd FROM provider_call LIMIT 1',
    )
    .get();
  // Proof: settling outside the turn transaction makes this injected save failure leave a paid receipt.
  expect(call?.settled_micro_usd).toBeNull();
  expect(
    inspection.query<{ count: number }, []>('SELECT count(*) AS count FROM chat_turn').get()?.count,
  ).toBe(0);
  inspection.close();
  api.close();
});

test('missing provider usage retains reservation and blocks further paid calls', async () => {
  const { config } = fixture();
  let calls = 0;
  const api = mountApi({
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
  const api = mountApi({
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
  expect(() => mountApi({ ...config, demoAuth: true, apiBindHost: '0.0.0.0' })).toThrow(
    'Demo auth requires loopback',
  );
  expect(() =>
    mountApi({
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
  const api = mountApi({
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
  const api = mountApi({ ...config, demoAuth: true });
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
  const api = mountApi({ ...config, demoAuth: true });
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
  const api = mountApi({ ...config, demoAuth: true, openRouterEnabled: true });
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
  const cases = [
    {
      description:
        'Booking appointments for my pottery studio <scr<script>ipt>alert(1)</scr<script>ipt> vbscript:msgbox(1) https://bad.example',
      subject: 'Booking appointments for my pottery studio',
    },
    { description: 'vbscript:msgbox(1) Booking appointments', subject: 'software request' },
    { description: 'https://bad.example/run Booking appointments', subject: 'software request' },
  ];
  for (const sample of cases) {
    const { config } = fixture();
    const api = mountApi({ ...config, demoAuth: true });
    const intake = await api.fetch(
      request('/intakes', 'POST', config.publicOrigin, { description: sample.description }),
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
    // Proof: returning the raw description from subjectFrom exposed nested markup and URL schemes in /concept.
    expect(view.subject).toBe(sample.subject);
    expect(JSON.stringify(view)).not.toMatch(/<|>|vbscript:|https:\/\//i);
    api.close();
  }
});

test('configured provider concept validates bounded JSON and shares paid reservation', async () => {
  const { config } = fixture();
  let calls = 0;
  const api = mountApi({
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
  const api = mountApi({
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
  const api = mountApi({ ...config, demoAuth: true });
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
  const api = mountApi({
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
  const api = mountApi({
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

for (const rateName of ['openRouterInputUsdPerMillion', 'openRouterOutputUsdPerMillion'] as const) {
  for (const invalidRate of [undefined, 0, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
    test(`paid admission rejects ${rateName} ${String(invalidRate)}`, async () => {
      const { config } = fixture();
      let calls = 0;
      const api = mountApi({
        ...config,
        demoAuth: true,
        openRouterEnabled: true,
        openRouterKey: 'fixture-key',
        openRouterModel: 'fixture/model',
        openRouterProvider: 'Fixture',
        openRouterPrivacyVerified: true,
        openRouterInputUsdPerMillion: 1,
        openRouterOutputUsdPerMillion: 2,
        [rateName]: invalidRate,
        providerFetch: () => {
          calls += 1;
          return Response.json({});
        },
      });
      const login = await api.fetch(
        request('/session/demo', 'POST', config.appOrigin, { email: 'invalid-rate@example.test' }),
      );
      const cookie = login.headers.get('set-cookie')?.split(';')[0];
      const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
      const response = await api.fetch(
        request('/chat', 'POST', config.appOrigin, { message: 'Booking app' }, cookie, csrf),
      );
      // Proof: bypassing readProviderRates validation makes this mounted admission test throw or call the provider.
      expect(response.status).toBe(503);
      expect(calls).toBe(0);
      const inspection = new Database(config.databasePath);
      expect(
        inspection.query<{ count: number }, []>('SELECT count(*) AS count FROM provider_call').get()
          ?.count,
      ).toBe(0);
      inspection.close();
      api.close();
    });
  }
}

test('unavailable stream refuses a broken store admission without contacting provider', async () => {
  const { config } = fixture();
  let calls = 0;
  const api = mountApi({
    ...config,
    demoAuth: true,
    openRouterEnabled: true,
    openRouterKey: 'fixture-key',
    openRouterModel: 'fixture/model',
    openRouterProvider: 'Fixture',
    openRouterPrivacyVerified: true,
    providerFetch: () => {
      calls += 1;
      return Response.json({});
    },
  });
  const login = await api.fetch(
    request('/session/demo', 'POST', config.appOrigin, { email: 'broken-store@example.test' }),
  );
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
  const admission = Reflect.get(WebsiteStore.prototype, 'admitChatOperation');
  let admissionCalls = 0;
  WebsiteStore.prototype.admitChatOperation = function (...args: Parameters<typeof admission>) {
    admissionCalls += 1;
    if (args[8] === false) return { kind: 'started', id: 'injected-invalid-admission' };
    return admission.apply(this, args);
  };
  try {
    // Proof: removing the unavailable-branch invariant lets the injected store result continue as a paid turn.
    expect(
      api.fetch(
        request(
          '/chat/stream',
          'POST',
          config.appOrigin,
          { message: 'Booking app', idempotencyKey: 'broken-store-123' },
          cookie,
          csrf,
        ),
      ),
    ).rejects.toThrow('Unavailable provider admitted a new chat operation');
    expect(admissionCalls).toBe(1);
    expect(calls).toBe(0);
  } finally {
    WebsiteStore.prototype.admitChatOperation = admission;
    api.close();
  }
});

test('edited applied website migration refuses startup', () => {
  const { api, config } = fixture();
  api.close();
  const database = new Database(config.databasePath);
  database
    .query('UPDATE schema_migration SET checksum = ? WHERE name = ?')
    .run('changed', '001_initial');
  database.close();
  expect(() => mountApi(config)).toThrow('Website migration 001_initial changed after application');
});

test('returning signed-in prospect starts a fresh request without reviving old chat or concept', async () => {
  const { config } = fixture();
  const api = mountApi({ ...config, demoAuth: true });
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
  const api = mountApi({
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
  const api = mountApi({ ...config, demoAuth: true });
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

test('GET /conversation reads only the claimed draft and reports the disabled provider', async () => {
  const { config } = fixture();
  // The OpenRouter flag without its key, pins, rates and privacy flag reports disabled, even with demo auth.
  const api = mountApi({ ...config, demoAuth: true, openRouterEnabled: true });
  const { cookie, csrf } = await beginDraft(api);
  const owner = await api.fetch(
    request('/conversation', 'GET', config.appOrigin, undefined, cookie),
  );
  expect(owner.status).toBe(200);
  expect(owner.headers.get('cache-control')).toBe('no-store');
  expect(owner.headers.get('set-cookie')).toBeNull();
  expect(await owner.json()).toEqual({
    stage: 'clarify',
    turns: [],
    visitorTurnsRemaining: 8,
    provider: 'disabled',
    brief: '',
    challenge: null,
    description: 'A booking tool for a local studio',
    csrfToken: csrf,
    initialOperation: {
      state: 'not-started',
      idempotencyKey: expect.stringMatching(/^initial:[0-9a-f-]{36}$/) as unknown as string,
      truncated: false,
    },
    latestOperation: null,
    exhaustedReason: null,
  });
  const foreignCookie = `${cookie.split('=')[0]}=${'b'.repeat(64)}`;
  const foreign = await api.fetch(
    request('/conversation', 'GET', config.appOrigin, undefined, foreignCookie),
  );
  expect(foreign.status).toBe(401);
  expect(await foreign.json()).toEqual({ code: 'draft_unavailable' });
  expect((await api.fetch(request('/conversation', 'GET', config.appOrigin))).status).toBe(401);
  // Proof: removing the app-origin guard in server.ts made this foreign-origin read return 200.
  const forged = await api.fetch(
    request('/conversation', 'GET', 'https://foreign.example', undefined, cookie),
  );
  expect(forged.status).toBe(403);
  expect(
    (await api.fetch(request('/conversation', 'GET', config.publicOrigin, undefined, cookie)))
      .status,
  ).toBe(403);
  api.close();
});

test('POST /draft/discard expires the claim and its cookie and is refused after submission', async () => {
  const { api, config } = fixture();
  const { cookie, csrf } = await beginDraft(api);
  const discarded = await api.fetch(
    request('/draft/discard', 'POST', config.appOrigin, {}, cookie, csrf),
  );
  expect(discarded.status).toBe(204);
  expect(discarded.headers.get('cache-control')).toBe('no-store');
  expect(discarded.headers.get('set-cookie')).toBe(
    `${cookie.split('=')[0]}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
  expect(
    (await api.fetch(request('/draft', 'GET', config.appOrigin, undefined, cookie))).status,
  ).toBe(401);
  expect(
    await (
      await api.fetch(request('/entry', 'GET', config.publicOrigin, undefined, cookie))
    ).json(),
  ).toEqual({ available: false, reason: 'expired' });
  const again = await api.fetch(
    request('/draft/discard', 'POST', config.appOrigin, {}, cookie, csrf),
  );
  expect(again.status).toBe(204);

  const submitted = await beginDraft(api);
  const proposal = await api.fetch(
    request(
      '/proposals',
      'POST',
      config.appOrigin,
      { email: 'owner@example.test', brief: 'Calendar', idempotencyKey: 'submit-discard' },
      submitted.cookie,
      submitted.csrf,
    ),
  );
  expect(proposal.status).toBe(201);
  const refused = await api.fetch(
    request('/draft/discard', 'POST', config.appOrigin, {}, submitted.cookie, submitted.csrf),
  );
  expect(refused.status).toBe(409);
  expect(await refused.json()).toEqual({ code: 'draft_consumed' });
  expect(refused.headers.get('set-cookie')).toBeNull();
  const replay = await api.fetch(
    request(
      '/proposals',
      'POST',
      config.appOrigin,
      { email: 'owner@example.test', brief: 'Calendar', idempotencyKey: 'submit-discard' },
      submitted.cookie,
      submitted.csrf,
    ),
  );
  expect(replay.status).toBe(200);
  expect(((await replay.json()) as { receipt: string }).receipt).toBe(
    ((await proposal.json()) as { receipt: string }).receipt,
  );
  api.close();
});

test('POST /draft/discard refuses a foreign origin, missing CSRF and a foreign claim without change', async () => {
  const { api, config } = fixture();
  const { cookie, csrf } = await beginDraft(api);
  const foreignCookie = `${cookie.split('=')[0]}=${'c'.repeat(64)}`;
  const foreignCsrf = createHash('sha256')
    .update(`draft-csrf:${'c'.repeat(64)}`)
    .digest('hex');
  const attempts = [
    // Proof: removing the app-origin guard in server.ts made this discard return 204.
    {
      response: request('/draft/discard', 'POST', 'https://foreign.example', {}, cookie, csrf),
      status: 403,
    },
    // Proof: removing the draft CSRF check in the discard route made this discard return 204.
    { response: request('/draft/discard', 'POST', config.appOrigin, {}, cookie), status: 403 },
    {
      response: request('/draft/discard', 'POST', config.appOrigin, {}, cookie, 'f'.repeat(64)),
      status: 403,
    },
    {
      response: request('/draft/discard', 'POST', config.appOrigin, {}, foreignCookie, csrf),
      status: 403,
    },
    {
      response: request('/draft/discard', 'POST', config.appOrigin, {}, foreignCookie, foreignCsrf),
      status: 401,
    },
    { response: request('/draft/discard', 'POST', config.appOrigin, {}), status: 401 },
  ];
  for (const attempt of attempts) {
    const refused = await api.fetch(attempt.response);
    expect(refused.status).toBe(attempt.status);
    expect(refused.headers.get('set-cookie')).toBeNull();
  }
  const draft = await api.fetch(request('/draft', 'GET', config.appOrigin, undefined, cookie));
  expect(draft.status).toBe(200);
  api.close();
});

/** A store whose method calls are counted, to prove a refused request never reaches it. */
function countingStore(calls: { count: number }) {
  return (path: string) =>
    new Proxy(new WebsiteStore(path), {
      get(target, property, receiver) {
        const value: unknown = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') return value;
        return (...parameters: unknown[]): unknown => {
          calls.count += 1;
          const answer: unknown = Reflect.apply(value, target, parameters);
          return answer;
        };
      },
    });
}

function fromSource(
  url: string,
  method: string,
  origin: string,
  address: string,
  cookie?: string,
): Request {
  return new Request(`http://localhost:3101${url}`, {
    method,
    headers: { origin, 'x-forwarded-for': address, ...(cookie ? { cookie } : {}) },
  });
}

test('the general window bounds a windowless route per source before any store call', async () => {
  const { config } = fixture();
  const calls = { count: 0 };
  let now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const api = mountApi({
    ...config,
    trustedProxyHops: 1,
    clock: () => now,
    openStore: countingStore(calls),
  });
  const intake = await api.fetch(
    new Request('http://localhost:3101/intakes', {
      method: 'POST',
      headers: {
        origin: config.publicOrigin,
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.9',
      },
      body: JSON.stringify({ description: 'A booking tool' }),
    }),
  );
  expect(intake.status).toBe(201);
  const cookie = intake.headers.get('set-cookie')?.split(';')[0];
  expect(
    (await api.fetch(fromSource('/conversation', 'OPTIONS', config.appOrigin, '203.0.113.9')))
      .status,
  ).toBe(204);
  expect(
    (await api.fetch(fromSource('/entry', 'GET', config.appOrigin, '203.0.113.9', cookie))).status,
  ).toBe(200);
  for (let index = 0; index < 117; index += 1)
    expect(
      (await api.fetch(fromSource('/conversation', 'GET', config.appOrigin, '203.0.113.9', cookie)))
        .status,
    ).toBe(200);
  now += 15_000;
  const before = calls.count;
  const limited = await api.fetch(
    fromSource('/conversation', 'GET', config.appOrigin, '203.0.113.9', cookie),
  );
  expect(limited.status).toBe(429);
  expect(await limited.json()).toEqual({ code: 'rate_limited' });
  // Proof: deleting the Retry-After header from rateRefusal failed this assertion.
  expect(limited.headers.get('retry-after')).toBe('45');
  expect(calls.count).toBe(before);
  // Proof: keying the general window on the path admitted the 121st request above.
  expect(
    (await api.fetch(fromSource('/conversation', 'GET', config.appOrigin, '198.51.100.7', cookie)))
      .status,
  ).toBe(200);
  now += 45_000;
  expect(
    (await api.fetch(fromSource('/conversation', 'GET', config.appOrigin, '203.0.113.9', cookie)))
      .status,
  ).toBe(200);
  api.close();
});

test('the global general window refuses a new source once full and exempts health', async () => {
  const { config } = fixture();
  let now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const api = mountApi({ ...config, trustedProxyHops: 1, clock: () => now });
  const address = (index: number) =>
    `10.${String(Math.floor(index / 62_500))}.${String(Math.floor(index / 250) % 250)}.${String(index % 250)}`;
  for (let index = 0; index < 2_999; index += 1)
    expect(
      (await api.fetch(fromSource('/entry', 'GET', config.publicOrigin, address(index)))).status,
    ).toBe(200);
  for (let index = 0; index < 5; index += 1) {
    const health = await api.fetch(new Request('http://localhost:3101/health'));
    expect(health.status).toBe(200);
  }
  expect(
    (await api.fetch(fromSource('/entry', 'GET', config.publicOrigin, address(2_999)))).status,
  ).toBe(200);
  const refused = await api.fetch(fromSource('/entry', 'GET', config.publicOrigin, '192.0.2.1'));
  expect(refused.status).toBe(429);
  expect(refused.headers.get('retry-after')).toBe('60');
  now += 60_000;
  expect(
    (await api.fetch(fromSource('/entry', 'GET', config.publicOrigin, address(0)))).status,
  ).toBe(200);
  api.close();
});

function oidcConfig(config: WebsiteApiConfig): Partial<WebsiteApiConfig> {
  const issuer = 'https://identity.example.test';
  return {
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
      throw new Error(`Unexpected OIDC call for ${config.appOrigin}`);
    },
  };
}

function countRows(databasePath: string, table: string): number {
  const database = new Database(databasePath, { readonly: true });
  try {
    return (
      database.query<{ count: number }, []>(`SELECT count(*) AS count FROM ${table}`).get()
        ?.count ?? -1
    );
  } finally {
    database.close();
  }
}

test('the OIDC start window refuses the 31st start without a login row', async () => {
  const { config } = fixture();
  const now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const api = mountApi({ ...config, ...oidcConfig(config), clock: () => now });
  for (let index = 0; index < 30; index += 1)
    expect((await api.fetch(request('/session/oidc/start', 'GET', config.appOrigin))).status).toBe(
      302,
    );
  const limited = await api.fetch(request('/session/oidc/start', 'GET', config.appOrigin));
  expect(limited.status).toBe(429);
  expect(limited.headers.get('retry-after')).toBe('60');
  expect(countRows(config.databasePath, 'oidc_login')).toBe(30);
  api.close();
});

test('an admitted OIDC start sweeps logins expired eleven minutes later', async () => {
  const { config } = fixture();
  let now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const api = mountApi({ ...config, ...oidcConfig(config), clock: () => now });
  expect((await api.fetch(request('/session/oidc/start', 'GET', config.appOrigin))).status).toBe(
    302,
  );
  now += 11 * 60_000;
  expect((await api.fetch(request('/session/oidc/start', 'GET', config.appOrigin))).status).toBe(
    302,
  );
  // Proof: removing the sweep from createOidcLogin left two rows here.
  expect(countRows(config.databasePath, 'oidc_login')).toBe(1);
  api.close();
});

function onlySourceHash(databasePath: string, scope: string): string {
  const database = new Database(databasePath, { readonly: true });
  try {
    const row = database
      .query<{ key_hash: string }, [string]>(
        'SELECT key_hash FROM admission_count WHERE scope = ? LIMIT 1',
      )
      .get(scope);
    if (!row) throw new Error(`No ${scope} count`);
    return row.key_hash;
  } finally {
    database.close();
  }
}

test('draft caps answer 429 with Retry-After to UTC midnight and set no cookie', async () => {
  const { config } = fixture();
  const now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const api = mountApi({ ...config, clock: () => now });
  const intake = () =>
    api.fetch(request('/intakes', 'POST', config.publicOrigin, { description: 'A booking tool' }));
  expect((await intake()).status).toBe(201);
  const source = onlySourceHash(config.databasePath, 'draft:source');
  const database = new Database(config.databasePath);
  database
    .query("UPDATE admission_count SET count = 20 WHERE scope = 'draft:source' AND key_hash = ?")
    .run(source);
  database.close();
  const bySource = await intake();
  expect(bySource.status).toBe(429);
  expect(await bySource.json()).toEqual({ code: 'draft_source_limit' });
  expect(bySource.headers.get('retry-after')).toBe('43200');
  expect(bySource.headers.get('set-cookie')).toBeNull();
  expect(bySource.headers.get('access-control-allow-origin')).toBe(config.publicOrigin);
  const other = await api.fetch(
    request('/intakes', 'POST', config.publicOrigin, { description: 'A dashboard' }),
    '198.51.100.7',
  );
  expect(other.status).toBe(201);
  const updateSite = new Database(config.databasePath);
  updateSite.query("UPDATE admission_count SET count = 2000 WHERE scope = 'draft:site'").run();
  updateSite.close();
  const bySite = await api.fetch(
    request('/intakes', 'POST', config.publicOrigin, { description: 'Another tool' }),
    '192.0.2.44',
  );
  expect(bySite.status).toBe(429);
  expect(await bySite.json()).toEqual({ code: 'draft_site_limit' });
  expect(bySite.headers.get('set-cookie')).toBeNull();
  expect(countRows(config.databasePath, 'intake_draft')).toBe(2);
  api.close();
});

test('proposal caps answer 429 with their codes and leave no submission', async () => {
  const { config } = fixture();
  const now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const api = mountApi({ ...config, clock: () => now });
  const propose = async (email: string, address: string) => {
    const { cookie, csrf } = await beginDraftFrom(api, address);
    return api.fetch(
      request(
        '/proposals',
        'POST',
        config.appOrigin,
        { email, brief: 'A calendar', idempotencyKey: crypto.randomUUID() },
        cookie,
        csrf,
      ),
      address,
    );
  };
  expect((await propose('first@example.test', '203.0.113.1')).status).toBe(201);
  const source = onlySourceHash(config.databasePath, 'proposal:source');
  const database = new Database(config.databasePath);
  database
    .query("UPDATE admission_count SET count = 5 WHERE scope = 'proposal:source' AND key_hash = ?")
    .run(source);
  database.close();
  const bySource = await propose('second@example.test', '203.0.113.1');
  expect(bySource.status).toBe(429);
  expect(await bySource.json()).toEqual({ code: 'proposal_source_limit' });
  expect(bySource.headers.get('retry-after')).toBe('43200');
  for (const address of ['203.0.113.2', '203.0.113.3'])
    expect((await propose('Same@Example.test', address)).status).toBe(201);
  const byEmail = await propose('same@example.test', '203.0.113.4');
  expect(byEmail.status).toBe(201);
  const fourth = await propose('SAME@example.test', '203.0.113.5');
  expect(fourth.status).toBe(429);
  expect(await fourth.json()).toEqual({ code: 'proposal_email_limit' });
  const site = new Database(config.databasePath);
  site.query("UPDATE admission_count SET count = 200 WHERE scope = 'proposal:site'").run();
  site.close();
  const bySite = await propose('new@example.test', '203.0.113.6');
  expect(bySite.status).toBe(429);
  expect(await bySite.json()).toEqual({ code: 'proposal_site_limit' });
  expect(countRows(config.databasePath, 'proposal_submission')).toBe(4);
  api.close();
});

async function beginDraftFrom(api: ReturnType<typeof createWebsiteApi>, address: string) {
  const intake = await api.fetch(
    request('/intakes', 'POST', 'http://localhost:4321', { description: 'A booking tool' }),
    address,
  );
  expect(intake.status).toBe(201);
  const cookie = intake.headers.get('set-cookie')?.split(';')[0] ?? '';
  const draft = await api.fetch(
    request('/draft', 'GET', 'http://localhost:4201', undefined, cookie),
    address,
  );
  const fields = (await draft.json()) as { csrfToken: string };
  return { cookie, csrf: fields.csrfToken };
}

function login(password: string): Request {
  return request('/operator/session', 'POST', 'http://localhost:4201', { password });
}

function loginRows(databasePath: string) {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database
      .query<
        { scope: string; failures: number; window_opened_at: number; locked_until: number | null },
        []
      >('SELECT scope, failures, window_opened_at, locked_until FROM login_failure ORDER BY scope')
      .all();
  } finally {
    database.close();
  }
}

function lockoutApi(clock: () => number) {
  const { config } = fixture();
  const verifier = { calls: 0 };
  const api = mountApi({
    ...config,
    clock,
    verifyPassword: (password, hash) => {
      verifier.calls += 1;
      return Bun.password.verify(password, hash);
    },
  });
  return { api, config, verifier };
}

test('the sixth guess from one source is locked out before verification, even when correct', async () => {
  const now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const { api, config, verifier } = lockoutApi(() => now);
  for (let index = 0; index < 5; index += 1)
    expect((await api.fetch(login('wrong-password'), '203.0.113.9')).status).toBe(401);
  expect(verifier.calls).toBe(5);
  const locked = await api.fetch(login(config.operatorPassword), '203.0.113.9');
  expect(locked.status).toBe(429);
  expect(await locked.json()).toEqual({ code: 'login_locked' });
  expect(locked.headers.get('retry-after')).toBe('900');
  expect(locked.headers.get('set-cookie')).toBeNull();
  // Proof: moving the lock check after the verify made this count 6.
  expect(verifier.calls).toBe(5);
  expect(countRows(config.databasePath, 'operator_session')).toBe(0);
  expect((await api.fetch(login(config.operatorPassword), '198.51.100.7')).status).toBe(201);
  api.close();
});

test('twenty failures from twenty sources lock the account but not an existing session', async () => {
  const now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const { api, config } = lockoutApi(() => now);
  const signedIn = await api.fetch(login(config.operatorPassword), '192.0.2.200');
  expect(signedIn.status).toBe(201);
  const operatorCookie = signedIn.headers.get('set-cookie')?.split(';')[0];
  for (let index = 0; index < 20; index += 1)
    expect((await api.fetch(login('wrong-password'), `203.0.113.${String(index)}`)).status).toBe(
      401,
    );
  // Proof: skipping the account scope in recordLoginFailure answered 201 here.
  const locked = await api.fetch(login(config.operatorPassword), '198.51.100.99');
  expect(locked.status).toBe(429);
  expect(await locked.json()).toEqual({ code: 'login_locked' });
  expect(locked.headers.get('retry-after')).toBe('3600');
  expect(
    (
      await api.fetch(
        request('/operator/session', 'GET', config.appOrigin, undefined, operatorCookie),
        '192.0.2.200',
      )
    ).status,
  ).toBe(200);
  api.close();
});

test('a source lock expires after fifteen minutes and a success clears only the source row', async () => {
  let now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const { api, config } = lockoutApi(() => now);
  for (let index = 0; index < 5; index += 1)
    expect((await api.fetch(login('wrong-password'), '203.0.113.9')).status).toBe(401);
  now += 15 * 60_000;
  expect((await api.fetch(login(config.operatorPassword), '203.0.113.9')).status).toBe(201);
  expect(loginRows(config.databasePath)).toEqual([
    {
      scope: 'account',
      failures: 5,
      window_opened_at: Date.UTC(2026, 9, 7, 12, 0, 0),
      locked_until: null,
    },
  ]);
  api.close();
});

test('a failure window resets after it ends', async () => {
  let now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const { api, config } = lockoutApi(() => now);
  for (let index = 0; index < 4; index += 1)
    expect((await api.fetch(login('wrong-password'), '203.0.113.9')).status).toBe(401);
  now += 16 * 60_000;
  expect((await api.fetch(login('wrong-password'), '203.0.113.9')).status).toBe(401);
  expect(loginRows(config.databasePath).find((row) => row.scope === 'source')).toEqual({
    scope: 'source',
    failures: 1,
    window_opened_at: now,
    locked_until: null,
  });
  expect((await api.fetch(login(config.operatorPassword), '203.0.113.9')).status).toBe(201);
  api.close();
});
