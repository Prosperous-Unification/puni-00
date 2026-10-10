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
    settleAlerts: () => api.settleAlerts(),
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

test('Build redirect rejects a foreign target', () => {
  const { config } = fixture();
  // Proof: relaxing the fixed Build URL guard allows a native intake to redirect off-site.
  expect(() => mountApi({ ...config, appBuildUrl: 'https://foreign.example/studio' })).toThrow(
    'Build redirect must be fixed',
  );
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
    visitorTurnLimit: 8,
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
  // Every lock answers the longest lock's wait, so the scope cannot be inferred.
  expect(locked.headers.get('retry-after')).toBe('3600');
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

/** A lockout API whose verifier is slow, so concurrent guesses overlap inside it. */
function slowLockoutApi(clock: () => number) {
  const { config } = fixture();
  const verifier = { calls: 0 };
  const api = mountApi({
    ...config,
    clock,
    verifyPassword: async (password) => {
      verifier.calls += 1;
      await Bun.sleep(50);
      return password === config.operatorPassword;
    },
  });
  return { api, config, verifier };
}

test('a concurrent burst from one source reaches the verifier at most five times', async () => {
  const now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const { api, verifier } = slowLockoutApi(() => now);
  const answers = await Promise.all(
    Array.from({ length: 30 }, () => api.fetch(login('wrong-password'), '203.0.113.9')),
  );
  // Proof: reading the lock and recording the failure around the verify let all 30 reach it.
  expect(verifier.calls).toBe(5);
  expect(answers.filter((answer) => answer.status === 401)).toHaveLength(5);
  expect(answers.filter((answer) => answer.status === 429)).toHaveLength(25);
  api.close();
});

test('a concurrent multi-source burst reaches the verifier at most twenty times', async () => {
  const now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const { api, verifier } = slowLockoutApi(() => now);
  await Promise.all(
    Array.from({ length: 40 }, (_unused, index) =>
      api.fetch(login('wrong-password'), `198.51.100.${String(index)}`),
    ),
  );
  expect(verifier.calls).toBe(20);
  api.close();
});

test('a successful login refunds its reserved account attempt', async () => {
  const now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const { api, config } = slowLockoutApi(() => now);
  for (let index = 0; index < 19; index += 1)
    expect((await api.fetch(login('wrong-password'), `198.51.100.${String(index)}`)).status).toBe(
      401,
    );
  expect((await api.fetch(login(config.operatorPassword), '192.0.2.1')).status).toBe(201);
  expect(loginRows(config.databasePath).find((row) => row.scope === 'account')).toMatchObject({
    failures: 19,
    locked_until: null,
  });
  expect((await api.fetch(login(config.operatorPassword), '192.0.2.2')).status).toBe(201);
  api.close();
});

test('the lock answer does not reveal which scope locked', async () => {
  const now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const source = slowLockoutApi(() => now);
  for (let index = 0; index < 5; index += 1)
    await source.api.fetch(login('wrong-password'), '203.0.113.9');
  const bySource = await source.api.fetch(login('wrong-password'), '203.0.113.9');
  const account = slowLockoutApi(() => now);
  for (let index = 0; index < 20; index += 1)
    await account.api.fetch(login('wrong-password'), `198.51.100.${String(index)}`);
  const byAccount = await account.api.fetch(login('wrong-password'), '192.0.2.9');
  expect([bySource.status, byAccount.status]).toEqual([429, 429]);
  expect(await bySource.json()).toEqual(await byAccount.json());
  // Proof: answering the remaining time of the lock gave 900 here and 3600 for the account.
  expect(bySource.headers.get('retry-after')).toBe(byAccount.headers.get('retry-after'));
  source.api.close();
  account.api.close();
});

test('a failing delivery record is reported, never an unhandled rejection', async () => {
  const { config } = fixture();
  const reported: unknown[][] = [];
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);
  const realError = console.error;
  console.error = (...parts: unknown[]) => {
    reported.push(parts);
  };
  try {
    const api = mountApi({
      ...config,
      guardrailWebhookUrl: 'https://ntfy.example.test/puni',
      alertFetch: () => new Response(''),
      openStore: (path) =>
        new Proxy(new WebsiteStore(path), {
          get(target, property, receiver) {
            const value: unknown = Reflect.get(target, property, receiver);
            if (property === 'markAlertDelivery')
              return () => {
                throw new Error('Injected delivery record failure');
              };
            if (typeof value !== 'function') return value;
            return (...parameters: unknown[]): unknown => {
              const answer: unknown = Reflect.apply(value, target, parameters);
              return answer;
            };
          },
        }),
    });
    const operator = await api.fetch(login(config.operatorPassword));
    const cookie = operator.headers.get('set-cookie')?.split(';')[0];
    const { csrfToken } = (await operator.json()) as { csrfToken: string };
    expect(
      (
        await api.fetch(
          request(
            '/operator/inference/pause',
            'POST',
            config.appOrigin,
            undefined,
            cookie,
            csrfToken,
          ),
        )
      ).status,
    ).toBe(201);
    await api.settleAlerts();
    await Bun.sleep(10);
    // Proof: without the catch on the delivery chain the injected failure was an unhandled rejection.
    expect(unhandled).toEqual([]);
    expect(String(reported[0]?.[0])).toContain('inference_paused');
    api.close();
  } finally {
    process.off('unhandledRejection', onUnhandled);
    console.error = realError;
  }
});

test('repeated conversation reads reuse the day salt and write nothing', async () => {
  const { config } = fixture();
  const salts = { reads: 0 };
  const api = mountApi({
    ...config,
    openRouterEnabled: true,
    openRouterKey: 'fixture-only',
    openRouterModel: 'fixture/model',
    openRouterProvider: 'Fixture',
    openRouterInputUsdPerMillion: 1,
    openRouterOutputUsdPerMillion: 2,
    openRouterPrivacyVerified: true,
    openStore: (path) =>
      new Proxy(new WebsiteStore(path), {
        get(target, property, receiver) {
          const value: unknown = Reflect.get(target, property, receiver);
          if (typeof value !== 'function') return value;
          return (...parameters: unknown[]): unknown => {
            if (property === 'readSourceSalt') salts.reads += 1;
            const answer: unknown = Reflect.apply(value, target, parameters);
            return answer;
          };
        },
      }),
  });
  const { cookie } = await beginDraft(api);
  const readsAfterIntake = salts.reads;
  for (let index = 0; index < 5; index += 1) {
    const view = await api.fetch(
      request('/conversation', 'GET', config.appOrigin, undefined, cookie),
    );
    expect(((await view.json()) as { challenge: unknown }).challenge).not.toBeNull();
  }
  // Proof: reading the salt through the store on every GET counted five more salt writes.
  expect(salts.reads).toBe(readsAfterIntake);
  api.close();
});

/** Every table's row count, so a test can show that a request wrote nothing. */
function countEveryTable(databasePath: string): Record<string, number> {
  const database = new Database(databasePath, { readonly: true });
  try {
    const tables = database
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all();
    return Object.fromEntries(
      tables.map(({ name }) => [
        name,
        database.query<{ count: number }, []>(`SELECT count(*) AS count FROM "${name}"`).get()
          ?.count ?? -1,
      ]),
    );
  } finally {
    database.close();
  }
}

test('retired prospect routes answer 404 and write nothing', async () => {
  const { config } = fixture();
  // The loopback demo provider is on, which once made `/session/demo` sign a visitor in.
  const api = mountApi({ ...config, demoAuth: true });
  const { cookie, csrf } = await beginDraft(api);
  const before = countEveryTable(config.databasePath);
  const retired = [
    ['GET', '/session'],
    ['DELETE', '/session'],
    ['GET', '/session/oidc/start'],
    ['GET', '/session/oidc/callback?state=a&code=b'],
    ['GET', '/api/session/oidc/callback?state=a&code=b'],
    ['POST', '/session/demo'],
    ['GET', '/chat'],
    ['POST', '/chat'],
    ['POST', '/chat/stream'],
    ['POST', '/chat/cancel'],
    ['POST', '/concept'],
    ['POST', '/concept/revision'],
  ] as const;
  for (const [method, path] of retired) {
    const body =
      method === 'POST'
        ? { email: 'owner@example.test', message: 'Hello', idempotencyKey: 'retired-key-1' }
        : undefined;
    // Proof: leaving /chat/stream mounted answered 401 prospect_unauthorized here instead of 404.
    const response = await api.fetch(request(path, method, config.appOrigin, body, cookie, csrf));
    const answer: unknown = await response.json();
    expect({ method, path, status: response.status, body: answer }).toEqual({
      method,
      path,
      status: 404,
      body: { code: 'not_found' },
    });
    expect(response.headers.get('set-cookie')).toBeNull();
  }
  expect(countEveryTable(config.databasePath)).toEqual(before);
  api.close();
});
