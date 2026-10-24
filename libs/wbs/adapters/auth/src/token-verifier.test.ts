import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { Configuration } from 'openid-client';

import { JwksTokenVerifier, oidcTokenVerifierFromEnv } from './token-verifier';

const ISSUER = 'https://idp.example.test/oauth2/default';
const AUDIENCE = 'api://wbs';
let privateKey: CryptoKey;
let jwksUri: URL;
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const publicJwk = await exportJWK(pair.publicKey);
  server = Bun.serve({
    port: 0,
    fetch: () =>
      Response.json({
        keys: [{ ...publicJwk, alg: 'RS256', kid: 'fixture-key', use: 'sig' }],
      }),
  });
  jwksUri = new URL(`http://127.0.0.1:${String(server.port)}/jwks`);
});

afterAll(() => {
  void server.stop(true);
});

async function tokenWith(
  options: {
    audience?: string;
    expiresAt?: number;
    issuer?: string;
  } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ sub: 'user-1' })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(options.expiresAt ?? now + 300)
    .sign(privateKey);
}

function verifier(): JwksTokenVerifier {
  return new JwksTokenVerifier({ audience: AUDIENCE, issuer: ISSUER, jwksUri });
}

describe('JwksTokenVerifier', () => {
  it('accepts a locally signed RS256 token from the configured issuer and audience', async () => {
    expect((await verifier().verify(await tokenWith())).sub).toBe('user-1');
  });

  it('rejects a token for another audience', async () => {
    expect(verifier().verify(await tokenWith({ audience: 'api://other' }))).rejects.toThrow(
      /aud|audience/i,
    );
  });

  it('rejects a token from another issuer', async () => {
    expect(
      verifier().verify(await tokenWith({ issuer: 'https://other.example.test' })),
    ).rejects.toThrow(/iss|issuer/i);
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifier().verify(await tokenWith({ expiresAt: now - 60 }))).rejects.toThrow(
      /exp|expired/i,
    );
  });
});

describe('oidcTokenVerifierFromEnv', () => {
  const env = {
    AUTH_ISSUER_DISCOVERY_URL: ISSUER,
    AUTH_AUDIENCE: AUDIENCE,
    AUTH_CLIENT_ID: 'client',
    AUTH_CLIENT_SECRET: 'secret',
  };

  it('discovers again once a failed discovery cools down, instead of failing until restart', async () => {
    let clock = 0;
    let loads = 0;
    const verifier = oidcTokenVerifierFromEnv(env, {
      now: () => clock,
      discover: () => {
        loads += 1;
        if (loads === 1) return Promise.reject(new Error('discovery unavailable'));
        return Promise.resolve({
          serverMetadata: () => ({ issuer: ISSUER, jwks_uri: 'https://idp.example.test/keys' }),
        } as unknown as Configuration);
      },
    });

    let failure: unknown;
    try {
      await verifier.issuer();
    } catch (cause) {
      failure = cause;
    }
    expect((failure as Error).message).toBe('discovery unavailable');
    clock = 60_000;
    expect(await verifier.issuer()).toBe(ISSUER);
    expect(loads).toBe(2);
  });
});
