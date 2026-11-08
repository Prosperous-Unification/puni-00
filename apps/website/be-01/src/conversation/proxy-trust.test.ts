import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { readWebsiteApiConfig } from '../runtime-config';
import { createWebsiteApi, type WebsiteApiConfig } from '../server';
import { selectSourcePrefix } from './source';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function config(
  peers: readonly string[] = ['10.42.0.0/24'],
): WebsiteApiConfig & { trustedProxyPeers: readonly string[] } {
  const directory = mkdtempSync(join(tmpdir(), 'puni-proxy-trust-'));
  directories.push(directory);
  return {
    databasePath: join(directory, 'website.sqlite'),
    publicOrigin: 'http://localhost:4321',
    appOrigin: 'http://localhost:4201',
    appManualUrl: 'http://localhost:4201/manual',
    secureCookies: false,
    trustedProxyHops: 1,
    trustedProxyPeers: peers,
  };
}

function intake(): Request {
  return new Request('http://localhost:3101/intakes', {
    method: 'POST',
    headers: {
      origin: 'http://localhost:4321',
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.7',
    },
    body: JSON.stringify({ description: 'A scheduling portal' }),
  });
}

test('an untrusted socket cannot choose a forwarded source on a mounted intake', async () => {
  const api = createWebsiteApi(config());
  try {
    const response = await api.fetch(intake(), '203.0.113.9');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: 'source_unavailable' });
    expect(response.headers.has('set-cookie')).toBe(false);
    expect((await api.fetch(intake(), '10.42.0.7')).status).toBe(201);
  } finally {
    api.close();
  }
});

test.each([undefined, 'not-an-address', '10.43.0.7'])(
  'missing or invalid gateway peer %s is refused',
  async (peer) => {
    const api = createWebsiteApi(config());
    try {
      expect((await api.fetch(intake(), peer)).status).toBe(400);
    } finally {
      api.close();
    }
  },
);

test('IPv4-mapped socket spellings match the explicit IPv4 gateway range', async () => {
  const api = createWebsiteApi(config());
  try {
    expect((await api.fetch(intake(), '::ffff:10.42.0.8')).status).toBe(201);
    expect((await api.fetch(intake(), '::ffff:a2a:9')).status).toBe(201);
  } finally {
    api.close();
  }
});

test.each(['', '0.0.0.0/0', '::/0', 'proxy.internal', '10.42.0.0/33', '::1/129', '10.42.0.0/-1'])(
  'malformed or unrestricted trusted peers %s refuse startup',
  (peer) => {
    expect(() => createWebsiteApi(config([peer]))).toThrow('TRUSTED_PROXY_PEERS');
  },
);

test('runtime forwarded deployments require an explicit trusted peer boundary', () => {
  expect(() => readWebsiteApiConfig({ TRUSTED_PROXY_HOPS: '1' })).toThrow('TRUSTED_PROXY_PEERS');
  expect(
    readWebsiteApiConfig({
      TRUSTED_PROXY_HOPS: '1',
      TRUSTED_PROXY_PEERS: '10.42.0.0/16,127.0.0.1/32',
    }),
  ).toMatchObject({ trustedProxyPeers: ['10.42.0.0/16', '127.0.0.1/32'] });
});

test.each(['::ffff:192.0.2.1', '::ffff:c000:201', '0:0:0:0:0:ffff:c000:0201'])(
  'mapped source spelling %s retains the same IPv4 allowance',
  (address) => {
    expect(selectSourcePrefix(address)).toBe('192.0.2.1');
  },
);
