import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseAnalyticsRegionResponse } from '@website/contracts';
import { afterEach, expect, test } from 'bun:test';

import { loadCountryDatabase } from './country-database';
import { createWebsiteApi, type WebsiteApiConfig } from './server';

const directories: string[] = [];
const apis: ReturnType<typeof createWebsiteApi>[] = [];
afterEach(() => {
  for (const api of apis.splice(0)) api.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function createApi(overrides: Partial<WebsiteApiConfig> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'puni-region-'));
  directories.push(directory);
  const api = createWebsiteApi({
    databasePath: join(directory, 'website.sqlite'),
    appOrigin: 'http://app.test',
    publicOrigin: 'http://site.test',
    appManualUrl: 'http://app.test/manual',
    secureCookies: false,
    trustedProxyHops: 1,
    countryDatabase: loadCountryDatabase(),
    clock: () => Date.UTC(2026, 10, 2),
    ...overrides,
  });
  apis.push(api);
  return api;
}
function createRegionRequest(headers: Record<string, string> = {}) {
  return new Request('http://api.test/analytics/region', {
    headers: { 'x-forwarded-for': '80.158.1.1', ...headers },
  });
}

test('regional endpoint uses selected hop and ignores country hints and forged XFF prefixes', async () => {
  const database = loadCountryDatabase();
  const resolvedAddresses: string[] = [];
  const api = createApi({
    countryDatabase: {
      resolveRegion(address, now) {
        resolvedAddresses.push(address);
        return database.resolveRegion(address, now);
      },
    },
  });
  for (const origin of ['http://app.test', 'http://site.test']) {
    const response = await api.fetch(
      createRegionRequest({
        origin,
        'x-forwarded-for': '8.8.8.8, 80.158.1.1',
        'cf-ipcountry': 'US',
        'x-country-code': 'US',
      }),
      '127.0.0.1',
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(await response.json()).toEqual({
      region: 'consent-required',
      database: {
        month: '2026-11',
        refreshDue: '2026-12-01',
        updateDue: false,
      },
    });
  }
  const ipv6 = await api.fetch(
    createRegionRequest({ 'x-forwarded-for': '2a00:1450:4001:800::200e' }),
    '127.0.0.1',
  );
  expect(parseAnalyticsRegionResponse(await ipv6.json()).region).toBe('consent-required');
  expect(resolvedAddresses).toEqual(['80.158.1.1', '80.158.1.1', '2a00:1450:4001:800::200e']);
});

test('same-origin GET works and untrusted forwarding cannot replace the socket address', async () => {
  const api = createApi({ trustedProxyHops: 0 });
  const response = await api.fetch(
    createRegionRequest({ 'cf-ipcountry': 'US', 'x-forwarded-for': '8.8.8.8' }),
    '80.158.1.1',
  );
  expect(response.status).toBe(200);
  expect(parseAnalyticsRegionResponse(await response.json()).region).toBe('consent-required');
});

test('missing trusted hop and foreign origin are typed refusals', async () => {
  const api = createApi();
  const missing = await api.fetch(new Request('http://api.test/analytics/region'), '8.8.8.8');
  expect(missing.status).toBe(400);
  expect(missing.headers.get('cache-control')).toBe('no-store');
  expect(await missing.json()).toEqual({ code: 'source_unavailable' });
  const foreign = await api.fetch(
    createRegionRequest({ origin: 'http://foreign.test' }),
    '127.0.0.1',
  );
  expect(foreign.status).toBe(403);
  expect(foreign.headers.get('cache-control')).toBe('no-store');
  expect(await foreign.json()).toEqual({ code: 'origin_forbidden' });
});

test('programmatic API without injected database explicitly reports unknown and null database', async () => {
  const api = createApi({ countryDatabase: undefined });
  const response = await api.fetch(createRegionRequest(), '127.0.0.1');
  expect(await response.json()).toEqual({ region: 'unknown', database: null });
});

test('regional requests consume the existing general request window', async () => {
  const api = createApi();
  for (let count = 0; count < 120; count++)
    expect((await api.fetch(createRegionRequest(), '127.0.0.1')).status).toBe(200);
  const limited = await api.fetch(createRegionRequest(), '127.0.0.1');
  expect(limited.status).toBe(429);
  expect(await limited.json()).toEqual({ code: 'rate_limited' });
  expect(
    (await api.fetch(createRegionRequest({ 'x-forwarded-for': '8.8.8.8' }), '127.0.0.1')).status,
  ).toBe(200);
});
