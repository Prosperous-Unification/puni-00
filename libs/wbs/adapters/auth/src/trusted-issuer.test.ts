import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { type IssuerFetch, trustedIssuerDiscovery, TrustedIssuerKeySets } from './trusted-issuer';

const ISSUER = 'https://ci.example.test';

let privateKey: CryptoKey;
let server: ReturnType<typeof Bun.serve>;
let fetches: string[];
/** What `/<name>/.well-known/openid-configuration` answers, by name. */
const documents = new Map<string, Response | (() => Response)>();

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const publicJwk = await exportJWK(pair.publicKey);
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request) => {
      const { pathname } = new URL(request.url);
      fetches.push(pathname);
      if (pathname.endsWith('/jwks'))
        return Response.json({ keys: [{ ...publicJwk, alg: 'RS256', kid: 'k1', use: 'sig' }] });
      const name = pathname.split('/')[1] ?? '';
      const answer = documents.get(name);
      if (answer === undefined) return new Response('none', { status: 404 });
      return typeof answer === 'function' ? answer() : answer.clone();
    },
  });
});

afterAll(async () => {
  await server.stop(true);
});

/** Routes `https://<name>.test/…` to the local server's `/<name>/…`. */
const localFetch: IssuerFetch = (url, init) => {
  fetches.push(`fetch ${url}`);
  const target = new URL(url);
  const name = target.host.replace(/\.test$/, '');
  return fetch(`http://127.0.0.1:${String(server.port)}/${name}${target.pathname}`, init);
};

function sign(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: 'repo:acme/wbs' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(privateKey);
}

describe('TrustedIssuerKeySets', () => {
  it('peeks at iss and sub without verifying, and at nothing in a non-JWT', async () => {
    const keySets = new TrustedIssuerKeySets({ fetch: localFetch, report: () => undefined });
    expect(keySets.peek(await sign())).toEqual({ issuer: ISSUER, subject: 'repo:acme/wbs' });
    expect(keySets.peek('opaque-provider-token')).toBeNull();
    expect(keySets.peek('a.b.c')).toBeNull();
  });

  // Proof: with the eviction removed from `keySetOf`, this saw 3 of the 4
  // expected fetches; watched 2026-10-22.
  it('keeps at most maxKeySets key sets, least recently used dropped first', async () => {
    fetches = [];
    const keySets = new TrustedIssuerKeySets({
      fetch: localFetch,
      report: () => undefined,
      maxKeySets: 2,
    });
    const token = await sign();
    const verify = (name: string) =>
      keySets.verify(token, {
        issuer: ISSUER,
        jwksUri: `https://${name}.test/jwks`,
        audience: null,
      });
    for (const name of ['one', 'two', 'one', 'three', 'one', 'two'])
      expect(await verify(name)).toEqual({ kind: 'verified', subject: 'repo:acme/wbs' });
    // one, two fetched; one cached; three evicts two; one cached; two again.
    expect(fetches.filter((each) => each.startsWith('fetch '))).toEqual([
      'fetch https://one.test/jwks',
      'fetch https://two.test/jwks',
      'fetch https://three.test/jwks',
      'fetch https://two.test/jwks',
    ]);
  });
});

describe('trustedIssuerDiscovery', () => {
  const discovery = trustedIssuerDiscovery({ fetch: localFetch });

  it('answers the jwks_uri of a document naming the same issuer, from one GET', async () => {
    fetches = [];
    documents.set(
      'same',
      Response.json({ issuer: 'https://same.test/', jwks_uri: 'https://same.test/keys' }),
    );
    expect(await discovery.discover('https://same.test/')).toEqual({
      kind: 'discovered',
      jwksUri: 'https://same.test/keys',
    });
    expect(fetches).toEqual([
      'fetch https://same.test/.well-known/openid-configuration',
      '/same/.well-known/openid-configuration',
    ]);
  });

  it('answers mismatch for a document naming another issuer', async () => {
    documents.set(
      'other',
      Response.json({ issuer: 'https://elsewhere.test', jwks_uri: 'https://other.test/keys' }),
    );
    expect(await discovery.discover('https://other.test')).toEqual({ kind: 'mismatch' });
  });

  it('answers unreachable for every document it cannot use', async () => {
    documents.set('down', new Response('down', { status: 503 }));
    documents.set('moved', new Response(null, { status: 302, headers: { location: '/x' } }));
    documents.set('text', new Response('not json', { status: 200 }));
    documents.set('list', Response.json([]));
    documents.set('nokeys', Response.json({ issuer: 'https://nokeys.test' }));
    documents.set(
      'plain',
      Response.json({ issuer: 'https://plain.test', jwks_uri: 'http://plain.test/keys' }),
    );
    for (const name of ['down', 'moved', 'text', 'list', 'nokeys', 'plain', 'absent'])
      expect(await discovery.discover(`https://${name}.test`)).toEqual({ kind: 'unreachable' });
    const unroutable = trustedIssuerDiscovery({
      fetch: () => Promise.reject(new TypeError('getaddrinfo ENOTFOUND')),
    });
    expect(await unroutable.discover('https://gone.test')).toEqual({ kind: 'unreachable' });
  });
});
