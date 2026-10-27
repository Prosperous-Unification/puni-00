import type { IssuerFetch } from '@wbs/auth';
import { exportJWK, generateKeyPair, type JWTPayload, SignJWT } from 'jose';

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

interface PublishedKey {
  readonly kid: string;
  readonly privateKey: SigningKey;
  readonly jwk: Record<string, unknown>;
}

async function newKey(kid: string): Promise<PublishedKey> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  return {
    kid,
    privateKey,
    jwk: { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' },
  };
}

/**
 * One OIDC issuer served by {@link LocalOidcIssuers} at `https://<host>`: its
 * discovery document and its key set, with switches for every refusal a test
 * needs and counters of what was fetched.
 */
export class LocalIssuer {
  /** What the discovery document says `issuer` is; the issuer's own URL unless a test disagrees. */
  discoveryIssuer: string;
  discoveryStatus = 200;
  jwksStatus = 200;
  discoveryFetches = 0;
  jwksFetches = 0;
  constructor(
    readonly url: string,
    private key: PublishedKey,
  ) {
    this.discoveryIssuer = url;
  }

  get jwksUri(): string {
    return `${this.url}/jwks`;
  }

  /** Publishes only a new key under a new `kid`, as an issuer's key rotation does. */
  async rotate(kid: string): Promise<void> {
    this.key = await newKey(kid);
  }

  /**
   * A JWT this issuer signs with its current key: `iss` its URL, `iat` now,
   * `exp` in five minutes, unless `claims` says otherwise.
   */
  sign(claims: JWTPayload): Promise<string> {
    return signWith(this.key, { iss: this.url, ...claims });
  }

  /** {@link sign}, declaring `typ` in the protected header (ID-JAG, `at+jwt`, `JWT`). */
  signTyped(claims: JWTPayload, typ: string): Promise<string> {
    return signWith(this.key, { iss: this.url, ...claims }, typ);
  }

  answer(path: string): Response {
    if (path === '/.well-known/openid-configuration') {
      this.discoveryFetches += 1;
      if (this.discoveryStatus !== 200)
        return new Response('down', { status: this.discoveryStatus });
      return Response.json({ issuer: this.discoveryIssuer, jwks_uri: this.jwksUri });
    }
    if (path === '/jwks') {
      this.jwksFetches += 1;
      if (this.jwksStatus !== 200) return new Response('down', { status: this.jwksStatus });
      return Response.json({ keys: [this.key.jwk] });
    }
    return new Response('not found', { status: 404 });
  }
}

async function signWith(key: PublishedKey, claims: JWTPayload, typ?: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iat: now, exp: now + 300, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: key.kid, ...(typ === undefined ? {} : { typ }) })
    .sign(key.privateKey);
}

/**
 * Local OIDC issuers for tests, served by one in-process HTTP server on
 * 127.0.0.1: no request ever leaves the host. Trusted issuers must be HTTPS
 * (`organization_trusted_issuer`'s CHECK), so each issuer is named
 * `https://<host>` and {@link fetch} routes those URLs to the server; any
 * other URL fails as an unreachable host does.
 */
export class LocalOidcIssuers {
  private readonly issuers = new Map<string, LocalIssuer>();
  private readonly server: ReturnType<typeof Bun.serve>;

  constructor() {
    this.server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: (request) => {
        const { pathname } = new URL(request.url);
        const [, host = '', ...rest] = pathname.split('/');
        const issuer = this.issuers.get(host);
        if (issuer === undefined) return new Response('no such issuer', { status: 404 });
        return issuer.answer(`/${rest.join('/')}`);
      },
    });
  }

  /** A new issuer at `https://<host>` publishing one key, `kid`. */
  async add(host: string, kid = 'key-1'): Promise<LocalIssuer> {
    const issuer = new LocalIssuer(`https://${host}`, await newKey(kid));
    this.issuers.set(host, issuer);
    return issuer;
  }

  /** A JWT claiming `issuer` but signed by a key no issuer publishes, under `kid`. */
  async forge(issuer: LocalIssuer, claims: JWTPayload, kid = 'key-1'): Promise<string> {
    return signWith(await newKey(kid), { iss: issuer.url, ...claims });
  }

  /**
   * The plain-HTTP address of `issuer`'s key set on the local server, for a
   * verifier that fetches with the global `fetch` (the configured sign-in
   * issuer's {@link JwksTokenVerifier} in a harness).
   */
  directJwksUrl(issuer: LocalIssuer): URL {
    return new URL(`http://127.0.0.1:${String(this.server.port)}/${new URL(issuer.url).host}/jwks`);
  }

  /** The fetch the adapters under test use: `https://<host>/…` reaches the local server. */
  readonly fetch: IssuerFetch = (url, init) => {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !this.issuers.has(target.host))
      return Promise.reject(new TypeError(`unroutable in tests: ${url}`));
    const port = String(this.server.port);
    return fetch(`http://127.0.0.1:${port}/${target.host}${target.pathname}`, init);
  };

  async stop(): Promise<void> {
    await this.server.stop(true);
  }
}
