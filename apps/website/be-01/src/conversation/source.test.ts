import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { readWebsiteApiConfig } from '../runtime-config';
import { createWebsiteApi, type WebsiteApiConfig } from '../server';
import { createSourceHasher, selectSourcePrefix } from './source';

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

/** Posts one intake from `forwardedFor` behind a loopback gateway socket. */
function postIntake(forwardedFor = '198.51.100.200'): Request {
  return new Request('http://localhost:3101/intakes', {
    method: 'POST',
    headers: {
      origin: publicOrigin,
      'content-type': 'application/json',
      'x-forwarded-for': forwardedFor,
    },
    body: JSON.stringify({ description: 'A booking tool for a bike workshop' }),
  });
}

async function beginConversation(api: ReturnType<typeof createWebsiteApi>) {
  const intake = await api.fetch(postIntake(), '127.0.0.1');
  expect(intake.status).toBe(201);
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

test('IPv6 sources are their /64 prefix and an IPv4-mapped address is its IPv4 address', () => {
  expect(selectSourcePrefix('2001:db8:1:2::1')).toBe('2001:0db8:0001:0002::/64');
  expect(selectSourcePrefix('2001:db8:1:2:ffff:eeee:dddd:cccc')).toBe('2001:0db8:0001:0002::/64');
  expect(selectSourcePrefix('2001:db8:1:3::1')).toBe('2001:0db8:0001:0003::/64');
  expect(selectSourcePrefix('::1')).toBe('0000:0000:0000:0000::/64');
  expect(selectSourcePrefix('fe80::1%eth0')).toBe('fe80:0000:0000:0000::/64');
  expect(selectSourcePrefix('::ffff:203.0.113.9')).toBe('203.0.113.9');
  expect(selectSourcePrefix('203.0.113.9')).toBe('203.0.113.9');
  expect(() => selectSourcePrefix('unknown')).toThrow('not an IP address');
  const salt = new Uint8Array(32).fill(7);
  const hash = createSourceHasher(() => salt);
  const now = Date.UTC(2026, 9, 6, 12);
  expect(hash('2001:db8:1:2::1', now)).toBe(hash('2001:db8:1:2:aaaa::9', now));
  expect(hash('2001:db8:1:2::1', now)).not.toBe(hash('2001:db8:1:3::1', now));
});

test('two API processes on one database derive the same source for one address and day', async () => {
  const config = baseConfig({ trustedProxyHops: 1 });
  const blue = createWebsiteApi(config);
  const green = createWebsiteApi(config);
  const first = await beginConversation(blue);
  const second = await beginConversation(green);
  expect((await blue.fetch(postInitial(first, '203.0.113.9'), '127.0.0.1')).status).toBe(200);
  expect((await green.fetch(postInitial(second, '203.0.113.9'), '127.0.0.1')).status).toBe(200);
  const [blueSource, greenSource] = sources(config.databasePath);
  // Proof: a random per-process salt made the two processes store different sources here.
  expect(greenSource).toBe(blueSource);
  blue.close();
  green.close();
});

test('one source exhausting its request window leaves other sources admitted', async () => {
  const config = baseConfig({ trustedProxyHops: 1 });
  const api = createWebsiteApi(config);
  for (let index = 0; index < 30; index += 1)
    expect((await api.fetch(postIntake('203.0.113.9'), '127.0.0.1')).status).toBe(201);
  const limited = await api.fetch(postIntake('203.0.113.9'), '127.0.0.1');
  expect(limited.status).toBe(429);
  expect(await limited.json()).toEqual({ code: 'rate_limited' });
  // Proof: keying the window only on the path made this other source's intake answer 429.
  expect((await api.fetch(postIntake('198.51.100.7'), '127.0.0.1')).status).toBe(201);
  const missing = await api.fetch(
    new Request('http://localhost:3101/intakes', {
      method: 'POST',
      headers: { origin: publicOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'No forwarded hop' }),
    }),
    '127.0.0.1',
  );
  expect(missing.status).toBe(400);
  expect(await missing.json()).toEqual({ code: 'source_unavailable' });
  api.close();
});

test('the global request backstop refuses every source once it is full', async () => {
  const config = baseConfig({ trustedProxyHops: 1 });
  const api = createWebsiteApi(config);
  for (let index = 0; index < 300; index += 1) {
    const address = `198.51.${String(Math.floor(index / 250))}.${String(index % 250)}`;
    expect((await api.fetch(postIntake(address), '127.0.0.1')).status).toBe(201);
  }
  expect((await api.fetch(postIntake('192.0.2.1'), '127.0.0.1')).status).toBe(429);
  api.close();
});
