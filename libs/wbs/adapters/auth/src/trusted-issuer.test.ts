import type { TrustedIssuerVerdict } from '@wbs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { base64url, exportJWK, generateKeyPair, type JWTPayload, SignJWT } from 'jose';

import { type IssuerFetch, trustedIssuerDiscovery, TrustedIssuerKeySets } from './trusted-issuer';

const ISSUER = 'https://ci.example.test';
const AUDIENCE = 'wbs:org:a';
const HMAC_SECRET = new TextEncoder().encode('a-shared-secret-an-issuer-published-by-mistake');

let privateKey: CryptoKey;
let publicJwk: Record<string, unknown>;
let server: ReturnType<typeof Bun.serve>;
let fetches: string[];
/** What `/<name>/.well-known/openid-configuration` answers, by name. */
const documents = new Map<string, () => Response>();
/** What `/<name>/jwks` answers, by name; the RSA key set when absent. */
const keySets = new Map<string, () => Response>();

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), alg: 'RS256', kid: 'k1', use: 'sig' };
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request) => {
      const { pathname } = new URL(request.url);
      fetches.push(pathname);
      const name = pathname.split('/')[1] ?? '';
      if (pathname.endsWith('/jwks'))
        return keySets.get(name)?.() ?? Response.json({ keys: [publicJwk] });
      return documents.get(name)?.() ?? new Response('none', { status: 404 });
    },
  });
});

afterAll(async () => {
  await server.stop(true);
});

beforeEach(() => {
  fetches = [];
});

/** Routes `https://<name>.test/…` to the local server's `/<name>/…`. */
const localFetch: IssuerFetch = (url, init) => {
  fetches.push(`fetch ${url}`);
  const target = new URL(url);
  const name = target.host.replace(/\.test$/, '');
  return fetch(`http://127.0.0.1:${String(server.port)}/${name}${target.pathname}`, init);
};

/** A fetch that never answers and ignores its signal. */
const silentFetch: IssuerFetch = () => new Promise<Response>(() => undefined);

/** An RS256 token of ISSUER for AUDIENCE, valid for a minute unless `claims` says otherwise. */
function sign(claims: JWTPayload = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: 'repo:acme/wbs',
    iss: ISSUER,
    aud: AUDIENCE,
    iat: now,
    exp: now + 60,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .sign(privateKey);
}

function verifier(options: Partial<ConstructorParameters<typeof TrustedIssuerKeySets>[0]> = {}) {
  const reports: Record<string, unknown>[] = [];
  const keys = new TrustedIssuerKeySets({
    fetch: localFetch,
    report: (fields) => {
      reports.push(fields);
    },
    ...options,
  });
  const verify = (token: string, name = 'ci', audience = AUDIENCE) =>
    keys.verify(token, { issuer: ISSUER, jwksUri: `https://${name}.test/jwks`, audience });
  return { keys, verify, reports };
}

/** A verified verdict for the default subject, whatever `exp` its token carried. */
const VERIFIED: TrustedIssuerVerdict = {
  kind: 'verified',
  subject: 'repo:acme/wbs',
  // An asymmetric matcher stands in for the number: any `exp` matches.
  expiresAt: expect.any(Number) as number,
};
const INVALID = { kind: 'invalid' } as const;
const UNAVAILABLE = { kind: 'key_set_unavailable' } as const;

describe('TrustedIssuerKeySets', () => {
  it('peeks at iss, sub and aud without verifying, and at nothing in a non-JWT', async () => {
    const { keys } = verifier();
    expect(keys.peek(await sign())).toEqual({
      issuer: ISSUER,
      subject: 'repo:acme/wbs',
      audiences: [AUDIENCE],
    });
    expect(keys.peek(await sign({ aud: ['a', 'b'] }))?.audiences).toEqual(['a', 'b']);
    expect(keys.peek(await sign({ aud: undefined }))?.audiences).toEqual([]);
    expect(keys.peek('opaque-provider-token')).toBeNull();
    expect(keys.peek('a.b.c')).toBeNull();
  });

  // Proof: with the eviction removed from `keySetOf`, this saw 3 of the 4
  // expected fetches; watched 2026-10-22.
  it('keeps at most maxKeySets key sets, least recently used dropped first', async () => {
    const { verify } = verifier({ maxKeySets: 2 });
    const token = await sign();
    for (const name of ['one', 'two', 'one', 'three', 'one', 'two'])
      expect(await verify(token, name)).toEqual(VERIFIED);
    // one, two fetched; one cached; three evicts two; one cached; two again.
    expect(fetches.filter((each) => each.startsWith('fetch '))).toEqual([
      'fetch https://one.test/jwks',
      'fetch https://two.test/jwks',
      'fetch https://three.test/jwks',
      'fetch https://two.test/jwks',
    ]);
  });

  it('refuses a token for another audience', async () => {
    const { verify } = verifier();
    expect(await verify(await sign({ aud: 'wbs:org:b' }))).toEqual(INVALID);
    expect(await verify(await sign({ aud: ['wbs:org:b', AUDIENCE] }))).toEqual(VERIFIED);
  });

  // Proof: with the `algorithms` option removed from `verify`, the HS256
  // token threw `JOSENotSupported` instead of answering invalid; watched
  // 2026-10-22.
  it('refuses alg none and an HS256 token signed with a published oct key', async () => {
    keySets.set('octs', () =>
      Response.json({
        keys: [publicJwk, { kty: 'oct', kid: 'h1', k: base64url.encode(HMAC_SECRET) }],
      }),
    );
    const { verify } = verifier();
    const now = Math.floor(Date.now() / 1000);
    const hmac = await new SignJWT({
      sub: 'repo:acme/wbs',
      iss: ISSUER,
      aud: AUDIENCE,
      exp: now + 60,
    })
      .setProtectedHeader({ alg: 'HS256', kid: 'h1' })
      .sign(HMAC_SECRET);
    expect(await verify(hmac, 'octs')).toEqual(INVALID);
    const encode = (part: object) => base64url.encode(JSON.stringify(part));
    const unsigned = `${encode({ alg: 'none' })}.${encode({ sub: 'repo:acme/wbs', iss: ISSUER, aud: AUDIENCE, exp: now + 60 })}.`;
    expect(await verify(unsigned, 'octs')).toEqual(INVALID);
  });

  // Proof: with the non-empty `sub` check removed from `verify`, this
  // answered verified with subject ''; watched 2026-10-22.
  it('refuses an empty sub', async () => {
    const { verify } = verifier();
    expect(await verify(await sign({ sub: '' }))).toEqual(INVALID);
    expect(await verify(await sign({ sub: undefined }))).toEqual(INVALID);
  });

  // Proof: with `exp` dropped from `requiredClaims`, the token without `exp`
  // verified; with the lifetime check removed, the ten-year token verified;
  // watched 2026-10-22.
  it('refuses a token without exp or living longer than an hour', async () => {
    const { verify } = verifier();
    const now = Math.floor(Date.now() / 1000);
    expect(await verify(await sign({ exp: undefined }))).toEqual(INVALID);
    expect(await verify(await sign({ exp: now + 10 * 365 * 24 * 60 * 60 }))).toEqual(INVALID);
    expect(await verify(await sign({ exp: now + 61 * 60 }))).toEqual(INVALID);
    // The verified `exp` is carried out: it caps a machine grant issued for it.
    expect(await verify(await sign({ exp: now + 59 * 60 }))).toEqual({
      ...VERIFIED,
      expiresAt: now + 59 * 60,
    });
  });

  // Proof: with the status check removed from `fetchKeySet`, the `erring`
  // key set (a usable body behind a 500) verified the token; watched
  // 2026-10-22.
  it('refuses a key set answered by a redirect or a 404, and reports it', async () => {
    keySets.set(
      'moved',
      () => new Response(null, { status: 302, headers: { location: 'https://moved.test/x' } }),
    );
    keySets.set('gone', () => new Response('none', { status: 404 }));
    // A usable key set behind an error status is still no answer.
    keySets.set('erring', () => Response.json({ keys: [publicJwk] }, { status: 500 }));
    const { verify, reports } = verifier();
    const token = await sign();
    expect(await verify(token, 'moved')).toEqual(UNAVAILABLE);
    expect(await verify(token, 'gone')).toEqual(UNAVAILABLE);
    expect(await verify(token, 'erring')).toEqual(UNAVAILABLE);
    expect(reports.map((each) => each['jwksUri'])).toEqual([
      'https://moved.test/jwks',
      'https://gone.test/jwks',
      'https://erring.test/jwks',
    ]);
    expect(fetches).not.toContain('/moved/x');
  });

  // Proof: with the failure short-circuit removed from `verify`, the second
  // verification inside the cooldown fetched again (3 fetches, not 2);
  // watched 2026-10-22.
  it('fetches a failing key set at most once per cooldown', async () => {
    keySets.set('flaky', () => new Response('down', { status: 503 }));
    let at = Date.now();
    const { verify } = verifier({ now: () => at });
    const token = await sign();
    expect(await verify(token, 'flaky')).toEqual(UNAVAILABLE);
    at += 10_000;
    expect(await verify(token, 'flaky')).toEqual(UNAVAILABLE);
    at += 21_000;
    expect(await verify(token, 'flaky')).toEqual(UNAVAILABLE);
    expect(fetches.filter((each) => each === 'fetch https://flaky.test/jwks')).toHaveLength(2);
  });

  // Proof: with the race removed from `fetchKeySet`, this hung past its
  // 2 s test timeout; watched 2026-10-22.
  it(
    'ends a key-set fetch that never answers at its timeout',
    async () => {
      const { verify, reports } = verifier({ fetch: silentFetch, timeoutMs: 50 });
      expect(await verify(await sign())).toEqual(UNAVAILABLE);
      expect(reports).toHaveLength(1);
    },
    { timeout: 2_000 },
  );

  // Proof: with the cap removed from `cappedJson`, the token verified
  // against the 300 KB key set; watched 2026-10-22.
  it('refuses a key set larger than its cap', async () => {
    keySets.set('huge', () => Response.json({ keys: [publicJwk], padding: 'x'.repeat(300_000) }));
    const { verify } = verifier();
    expect(await verify(await sign(), 'huge')).toEqual(UNAVAILABLE);
  });
});

describe('trustedIssuerDiscovery', () => {
  const discovery = trustedIssuerDiscovery({ fetch: localFetch });

  it('answers the jwks_uri of a document naming the same issuer, from one GET', async () => {
    documents.set('same', () =>
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
    documents.set('other', () =>
      Response.json({ issuer: 'https://elsewhere.test', jwks_uri: 'https://other.test/keys' }),
    );
    expect(await discovery.discover('https://other.test')).toEqual({ kind: 'mismatch' });
  });

  // Proof: with the length bound removed, the `long` document discovered its
  // 2049-character jwks_uri; with `isPublicIssuerUrl` removed, `plain`
  // discovered its HTTP one; with the cap removed from `cappedJson`, the key
  // set case failed first; watched 2026-10-22.
  it('answers unreachable for every document it cannot use', async () => {
    const document = (name: string, extra: Record<string, unknown>) => {
      documents.set(name, () => Response.json({ issuer: `https://${name}.test`, ...extra }));
    };
    documents.set('down', () => new Response('down', { status: 503 }));
    documents.set('moved', () => new Response(null, { status: 302, headers: { location: '/x' } }));
    documents.set('text', () => new Response('not json', { status: 200 }));
    documents.set('list', () => Response.json([]));
    document('nokeys', {});
    document('plain', { jwks_uri: 'http://plain.test/keys' });
    document('long', {
      jwks_uri: `https://long.test/${'k'.repeat(2049 - 'https://long.test/'.length)}`,
    });
    document('private', { jwks_uri: 'https://10.0.0.1/keys' });
    document('local', { jwks_uri: 'https://keys.internal/jwks' });
    document('hugedoc', { jwks_uri: 'https://hugedoc.test/keys', padding: 'x'.repeat(70_000) });
    for (const name of [
      'down',
      'moved',
      'text',
      'list',
      'nokeys',
      'plain',
      'long',
      'private',
      'local',
      'hugedoc',
      'absent',
    ])
      expect({ name, outcome: await discovery.discover(`https://${name}.test`) }).toEqual({
        name,
        outcome: { kind: 'unreachable' },
      });
    const unroutable = trustedIssuerDiscovery({
      fetch: () => Promise.reject(new TypeError('getaddrinfo ENOTFOUND')),
    });
    expect(await unroutable.discover('https://gone.test')).toEqual({ kind: 'unreachable' });
  });

  // Proof: with the race removed from `discover`, this hung past its 2 s
  // test timeout; watched 2026-10-22.
  it(
    'ends a discovery that never answers at its timeout',
    async () => {
      const silent = trustedIssuerDiscovery({ fetch: silentFetch, timeoutMs: 50 });
      expect(await silent.discover('https://silent.test')).toEqual({ kind: 'unreachable' });
    },
    { timeout: 2_000 },
  );
});
