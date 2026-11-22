import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { solveBrowserCheck } from '@website/contracts';
import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { readWebsiteApiConfig } from './runtime-config';
import { createWebsiteApi, type WebsiteApiConfig } from './server';

const secret = 'a'.repeat(64);
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function config(
  overrides: Partial<WebsiteApiConfig> = {},
): WebsiteApiConfig & { testingResetSecret: string } {
  const directory = mkdtempSync(join(tmpdir(), 'puni-testing-reset-'));
  directories.push(directory);
  return {
    databasePath: join(directory, 'website.sqlite'),
    publicOrigin: 'http://localhost:4321',
    appOrigin: 'http://localhost:4201',
    appManualUrl: 'http://localhost:4201/manual',
    secureCookies: false,
    apiBindHost: '127.0.0.1',
    demoAuth: true,
    testingResetSecret: secret,
    ...overrides,
  };
}

function reset(
  token: string | null = secret,
  origin = 'http://localhost:4201',
  cookie = '',
): Request {
  return new Request('http://localhost:3101/testing/reset', {
    method: 'POST',
    headers: { origin, cookie, ...(token === null ? {} : { 'X-Puni-Test-Reset': token }) },
  });
}

function rows(path: string, table: string): number {
  const database = new Database(path, { readonly: true });
  try {
    return database.query<{ n: number }, []>(`SELECT count(*) AS n FROM ${table}`).get()?.n ?? -1;
  } finally {
    database.close();
  }
}

test('an authorized reset mints a fresh browser allowance without requiring a draft', async () => {
  const settings = config();
  const api = createWebsiteApi(settings);
  try {
    const response = await api.fetch(reset(), '127.0.0.1');
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toMatch(/puni_browser=[a-f0-9]{64};.*HttpOnly/);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(rows(settings.databasePath, 'testing_allowance')).toBe(1);
  } finally {
    api.close();
  }
});

test.each([null, 'b'.repeat(64)])(
  'missing or wrong testing secret changes no allowance',
  async (token) => {
    const settings = config();
    const api = createWebsiteApi(settings);
    try {
      const response = await api.fetch(reset(token), '127.0.0.1');
      expect(response.status).toBe(403);
      expect(response.headers.has('set-cookie')).toBe(false);
      expect(rows(settings.databasePath, 'testing_allowance')).toBe(0);
    } finally {
      api.close();
    }
  },
);

test('a foreign Origin cannot reset an allowance even with the operator secret', async () => {
  const settings = config();
  const api = createWebsiteApi(settings);
  try {
    expect((await api.fetch(reset(secret, 'https://foreign.example'), '127.0.0.1')).status).toBe(
      403,
    );
    expect(rows(settings.databasePath, 'testing_allowance')).toBe(0);
  } finally {
    api.close();
  }
});

test('an unconfigured reset endpoint is unavailable', async () => {
  const api = createWebsiteApi({ ...config(), testingResetSecret: undefined });
  try {
    expect((await api.fetch(reset(), '127.0.0.1')).status).toBe(404);
  } finally {
    api.close();
  }
});

test('testing reset accepts both exact preview hostnames and rejects crossed or hostile origins', () => {
  for (const appOrigin of ['https://dev.app.puni.dev', 'https://dev.request.puni.dev']) {
    expect(
      readWebsiteApiConfig({
        WEBSITE_TEST_RESET_SECRET: secret,
        APP_ORIGIN: appOrigin,
        PUBLIC_ORIGIN: 'https://dev.puni.dev',
        TRUSTED_PROXY_HOPS: '1',
        TRUSTED_PROXY_PEERS: '127.0.0.1/32',
      }).testingResetSecret,
    ).toBe(secret);
  }
  for (const [publicOrigin, appOrigin] of [
    ['https://dev.puni.dev', 'https://dev.request.puni.dev.evil.example'],
    ['https://puni.dev', 'https://dev.request.puni.dev'],
    ['https://puni.dev', 'https://request.puni.dev'],
  ]) {
    expect(() =>
      readWebsiteApiConfig({
        WEBSITE_TEST_RESET_SECRET: secret,
        APP_ORIGIN: appOrigin,
        PUBLIC_ORIGIN: publicOrigin,
        TRUSTED_PROXY_HOPS: '1',
        TRUSTED_PROXY_PEERS: '127.0.0.1/32',
      }),
    ).toThrow('preview');
  }
});

test('reset configuration requires a 256-bit token and exact preview or loopback origins', () => {
  for (const token of ['', 'short', 'z'.repeat(64)])
    expect(() => readWebsiteApiConfig({ WEBSITE_TEST_RESET_SECRET: token })).toThrow(
      'WEBSITE_TEST_RESET_SECRET',
    );
  expect(readWebsiteApiConfig({ WEBSITE_TEST_RESET_SECRET: secret })).toMatchObject({
    testingResetSecret: secret,
  });
  expect(() =>
    readWebsiteApiConfig({
      WEBSITE_TEST_RESET_SECRET: secret,
      APP_ORIGIN: 'https://app.puni.dev',
      PUBLIC_ORIGIN: 'https://puni.dev',
    }),
  ).toThrow('preview');
  expect(() =>
    createWebsiteApi(
      config({
        demoAuth: false,
        appOrigin: 'https://app.puni.dev',
        publicOrigin: 'https://puni.dev',
        appManualUrl: 'https://app.puni.dev/manual',
        trustedProxyHops: 1,
      }),
    ),
  ).toThrow('preview');
});

async function conversation(api: ReturnType<typeof createWebsiteApi>, cookie: string) {
  const response = await api.fetch(
    new Request('http://localhost:3101/conversation', {
      headers: { origin: 'http://localhost:4201', cookie },
    }),
    '127.0.0.1',
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    csrfToken: string;
    visitorTurnsRemaining: number;
    turns: { role: string; content: string }[];
    initialOperation: { idempotencyKey: string };
    stage: string;
  };
}

test('reset reopens the claimed exhausted conversation and retains its complete history', async () => {
  const settings = config();
  const api = createWebsiteApi(settings);
  try {
    const intake = await api.fetch(
      new Request('http://localhost:3101/intakes', {
        method: 'POST',
        headers: { origin: 'http://localhost:4321', 'content-type': 'application/json' },
        body: JSON.stringify({ description: 'A workshop booking app' }),
      }),
      '127.0.0.1',
    );
    const cookie = intake.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    let view = await conversation(api, cookie);
    for (let turn = 0; turn < 8; turn += 1) {
      const response = await api.fetch(
        new Request('http://localhost:3101/conversation/stream', {
          method: 'POST',
          headers: {
            origin: 'http://localhost:4201',
            cookie,
            'X-Puni-CSRF': view.csrfToken,
            'content-type': 'application/json',
          },
          body: JSON.stringify(
            turn === 0
              ? { initial: true, idempotencyKey: view.initialOperation.idempotencyKey }
              : {
                  message: `More detail ${String(turn)}`,
                  idempotencyKey: `reset-turn-${String(turn)}`,
                },
          ),
        }),
        '127.0.0.1',
      );
      expect(response.status).toBe(200);
      await response.text();
    }
    view = await conversation(api, cookie);
    expect(view.visitorTurnsRemaining).toBe(0);
    const response = await api.fetch(reset(secret, 'http://localhost:4201', cookie), '127.0.0.1');
    expect(response.status).toBe(204);
    const after = await conversation(api, cookie);
    expect(after.visitorTurnsRemaining).toBe(8);
    expect(after.turns).toEqual(view.turns);
    const next = await api.fetch(
      new Request('http://localhost:3101/conversation/stream', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:4201',
          cookie,
          'X-Puni-CSRF': after.csrfToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message: 'Continue my test', idempotencyKey: 'after-reset-key' }),
      }),
      '127.0.0.1',
    );
    expect(next.status).toBe(200);
    await next.text();
  } finally {
    api.close();
  }
});

test('reset immediately aborts its active provider and retains the full charged reservation', async () => {
  let signal: AbortSignal | null = null;
  const settings = config({
    demoAuth: false,
    openRouterEnabled: true,
    openRouterKey: 'fixture-only',
    openRouterModel: 'openai/gpt-4.1-mini',
    openRouterProvider: 'azure/swedencentral',
    openRouterInputUsdPerMillion: 0.44,
    openRouterOutputUsdPerMillion: 1.76,
    openRouterInputCeilingUsdPerMillion: 0.44,
    openRouterOutputCeilingUsdPerMillion: 1.76,
    openRouterPrivacyVerified: true,
    providerFetch: (_url, init) => {
      if (!init.signal) throw new Error('Provider request has no cancellation signal');
      signal = init.signal;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: ' +
                  JSON.stringify({
                    id: 'gen-reset',
                    model: 'openai/gpt-4.1-mini',
                    choices: [
                      {
                        index: 0,
                        delta: { role: 'assistant', content: 'Partial reply' },
                        finish_reason: null,
                      },
                    ],
                  }) +
                  '\n\n',
              ),
            );
            init.signal?.addEventListener('abort', () => {
              controller.error(new DOMException('Aborted', 'AbortError'));
            });
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    },
  });
  const api = createWebsiteApi(settings);
  try {
    const intake = await api.fetch(
      new Request('http://localhost:3101/intakes', {
        method: 'POST',
        headers: { origin: 'http://localhost:4321', 'content-type': 'application/json' },
        body: JSON.stringify({ description: 'A booking app' }),
      }),
      '127.0.0.1',
    );
    const cookie = intake.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const viewResponse = await api.fetch(
      new Request('http://localhost:3101/conversation', {
        headers: { origin: 'http://localhost:4201', cookie },
      }),
      '127.0.0.1',
    );
    const view = (await viewResponse.json()) as {
      csrfToken: string;
      initialOperation: { idempotencyKey: string };
      challenge: { salt: string; challenge: string; signature: string; maxnumber: number };
    };
    const number = solveBrowserCheck(
      view.challenge.salt,
      view.challenge.challenge,
      view.challenge.maxnumber,
    );
    if (number === null) throw new Error('Unsolvable browser check');
    const response = await api.fetch(
      new Request('http://localhost:3101/conversation/stream', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:4201',
          cookie,
          'X-Puni-CSRF': view.csrfToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          initial: true,
          idempotencyKey: view.initialOperation.idempotencyKey,
          check: {
            salt: view.challenge.salt,
            challenge: view.challenge.challenge,
            signature: view.challenge.signature,
            number,
          },
        }),
      }),
      '127.0.0.1',
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response stream');
    let text = '';
    while (!text.includes('Partial reply')) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error('Provider ended before partial text');
      text += new TextDecoder().decode(chunk.value);
    }
    const resetResponse = await api.fetch(
      reset(secret, 'http://localhost:4201', cookie),
      '127.0.0.1',
    );
    expect(resetResponse.status).toBe(204);
    expect(signal).not.toBeNull();
    // Callback assignment is observed by the assertion above; Bun's control flow cannot see it.
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
    while (!(await reader.read()).done);
    const database = new Database(settings.databasePath, { readonly: true });
    try {
      const charged = database
        .query<{ reserved: number; settled: number; state: string }, []>(
          'SELECT reserved_micro_usd AS reserved, settled_micro_usd AS settled, state FROM paid_attempt',
        )
        .get();
      expect(charged?.state).toBe('unknown');
      expect(charged?.settled).toBeGreaterThan(0);
      expect(charged?.settled).toBe(charged?.reserved);
    } finally {
      database.close();
    }
  } finally {
    api.close();
  }
});
