import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { readWebsiteApiConfig } from '../runtime-config';
import { createWebsiteApi, type WebsiteApiConfig } from '../server';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const appOrigin = 'http://localhost:4201';
const publicOrigin = 'http://localhost:4321';

function baseConfig(overrides: Partial<WebsiteApiConfig> = {}): WebsiteApiConfig {
  const directory = mkdtempSync(join(tmpdir(), 'puni-source-'));
  directories.push(directory);
  return {
    databasePath: join(directory, 'website.sqlite'),
    apiBindHost: '127.0.0.1',
    publicOrigin,
    appOrigin,
    appManualUrl: `${appOrigin}/manual`,
    secureCookies: false,
    demoAuth: true,
    ...overrides,
  };
}

async function beginConversation(api: ReturnType<typeof createWebsiteApi>) {
  const intake = await api.fetch(
    new Request('http://localhost:3101/intakes', {
      method: 'POST',
      headers: { origin: publicOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'A booking tool for a bike workshop' }),
    }),
  );
  const cookie = intake.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Intake set no claim cookie');
  const view = (await (
    await api.fetch(
      new Request('http://localhost:3101/conversation', { headers: { origin: appOrigin, cookie } }),
    )
  ).json()) as { csrfToken: string; initialOperation: { idempotencyKey: string } };
  return { cookie, csrf: view.csrfToken, key: view.initialOperation.idempotencyKey };
}

function postInitial(
  conversation: { cookie: string; csrf: string; key: string },
  forwardedFor?: string,
): Request {
  return new Request('http://localhost:3101/conversation/stream', {
    method: 'POST',
    headers: {
      origin: appOrigin,
      cookie: conversation.cookie,
      'x-puni-csrf': conversation.csrf,
      'content-type': 'application/json',
      ...(forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor }),
    },
    body: JSON.stringify({ idempotencyKey: conversation.key, initial: true }),
  });
}

function sources(databasePath: string): string[] {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database
      .query<{ source_hash: string }, []>('SELECT source_hash FROM conversation ORDER BY rowid')
      .all()
      .map(({ source_hash }) => source_hash);
  } finally {
    database.close();
  }
}

test('a trusted gateway hop identifies the source and a missing hop is refused', async () => {
  const config = baseConfig({ trustedProxyHops: 1 });
  const api = createWebsiteApi(config);
  const first = await beginConversation(api);
  // Proof: falling back to the socket address made this missing-hop request answer 200.
  const missing = await api.fetch(postInitial(first), '127.0.0.1');
  expect(missing.status).toBe(400);
  expect(await missing.json()).toEqual({ code: 'source_unavailable' });
  expect(sources(config.databasePath)).toEqual([]);
  const malformed = await api.fetch(postInitial(first, '203.0.113.9, unknown'), '127.0.0.1');
  expect(malformed.status).toBe(400);
  expect(sources(config.databasePath)).toEqual([]);

  const accepted = await api.fetch(postInitial(first, '198.51.100.1, 203.0.113.9'), '127.0.0.1');
  expect(accepted.status).toBe(200);
  const second = await beginConversation(api);
  expect((await api.fetch(postInitial(second, '192.0.2.55, 203.0.113.9'))).status).toBe(200);
  const third = await beginConversation(api);
  expect((await api.fetch(postInitial(third, '203.0.113.10'))).status).toBe(200);
  const [firstSource, secondSource, thirdSource] = sources(config.databasePath);
  expect(firstSource).toMatch(/^[0-9a-f]{64}$/);
  expect(firstSource).not.toContain('203.0.113.9');
  expect(secondSource).toBe(firstSource);
  expect(thirdSource).not.toBe(firstSource);
  api.close();
});

test('without trusted hops the socket address is the source and its absence is refused', async () => {
  const config = baseConfig();
  const api = createWebsiteApi(config);
  const conversation = await beginConversation(api);
  const missing = await api.fetch(postInitial(conversation, '203.0.113.9'));
  expect(missing.status).toBe(400);
  expect(sources(config.databasePath)).toEqual([]);
  expect((await api.fetch(postInitial(conversation, '203.0.113.9'), '127.0.0.1')).status).toBe(200);
  expect(sources(config.databasePath)).toHaveLength(1);
  api.close();
});

test('an https app origin refuses to start without trusted proxy hops', () => {
  const https = {
    appOrigin: 'https://app.example.test',
    appManualUrl: 'https://app.example.test/manual',
    publicOrigin: 'https://example.test',
    demoAuth: false,
  };
  // Proof: removing the startup refusal let this https API construct without hops.
  expect(() => createWebsiteApi(baseConfig(https))).toThrow('trustedProxyHops');
  expect(() => createWebsiteApi(baseConfig({ ...https, trustedProxyHops: -1 }))).toThrow(
    'nonnegative integer',
  );
  createWebsiteApi(baseConfig({ ...https, trustedProxyHops: 1 })).close();
});

test('the runtime configuration refuses malformed provider, flag and hop settings', () => {
  expect(readWebsiteApiConfig({ TRUSTED_PROXY_HOPS: '1' }).trustedProxyHops).toBe(1);
  expect(readWebsiteApiConfig({}).trustedProxyHops).toBeUndefined();
  expect(() => readWebsiteApiConfig({ TRUSTED_PROXY_HOPS: 'one' })).toThrow('TRUSTED_PROXY_HOPS');
  expect(() => readWebsiteApiConfig({ OPENROUTER_INPUT_USD_PER_MILLION: 'cheap' })).toThrow(
    'OPENROUTER_INPUT_USD_PER_MILLION',
  );
  expect(() => readWebsiteApiConfig({ OPENROUTER_OUTPUT_USD_PER_MILLION: '0' })).toThrow(
    'OPENROUTER_OUTPUT_USD_PER_MILLION',
  );
  expect(() => readWebsiteApiConfig({ OPENROUTER_ENABLED: 'yes' })).toThrow('OPENROUTER_ENABLED');
  expect(() => readWebsiteApiConfig({ OPENROUTER_PRIVACY_VERIFIED: '2' })).toThrow(
    'OPENROUTER_PRIVACY_VERIFIED',
  );
  expect(
    readWebsiteApiConfig({
      OPENROUTER_ENABLED: '1',
      OPENROUTER_PRIVACY_VERIFIED: '1',
      OPENROUTER_INPUT_USD_PER_MILLION: '0.44',
      OPENROUTER_OUTPUT_USD_PER_MILLION: '1.76',
    }),
  ).toMatchObject({
    openRouterEnabled: true,
    openRouterPrivacyVerified: true,
    openRouterInputUsdPerMillion: 0.44,
    openRouterOutputUsdPerMillion: 1.76,
  });
});
