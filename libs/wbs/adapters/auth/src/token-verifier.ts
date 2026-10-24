import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { discovery } from 'openid-client';

import { issuerUrlFromEnv } from './issuer-url';

export interface JwtClaims {
  sub: string;
  [claim: string]: unknown;
}

/**
 * Turns a token into verified claims.
 *
 * @throws JOSE credential errors when signature or claims do not verify.
 * Unexpected discovery, network and key-store failures propagate separately.
 */
export interface TokenVerifier {
  verify(token: string): Promise<JwtClaims>;
}

export interface JwksTokenVerifierOptions {
  audience: string;
  issuer: string;
  jwksUri: URL;
}

/**
 * Verifies RS256 access tokens against an issuer's cached remote JWKS.
 */
export class JwksTokenVerifier implements TokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly options: JwksTokenVerifierOptions) {
    this.jwks = createRemoteJWKSet(options.jwksUri);
  }

  async verify(token: string): Promise<JwtClaims> {
    const { payload } = await jwtVerify(token, this.jwks, {
      algorithms: ['RS256'],
      audience: this.options.audience,
      issuer: this.options.issuer,
    });
    if (typeof payload.sub !== 'string' || payload.sub === '') {
      throw new errors.JWTClaimValidationFailed(
        'verified token has no subject',
        payload,
        'sub',
        'missing',
      );
    }
    return { ...payload, sub: payload.sub };
  }
}

/**
 * A {@link TokenVerifier} of the deployment's configured issuer that also
 * answers that issuer's Issuer Identifier, as discovery published it (never
 * `AUTH_ISSUER_DISCOVERY_URL` as written: the two may differ by a trailing
 * slash). A trusted issuer may never be this one (`wbs-machine-credentials`
 * A16), and a token of it never reaches one (A13).
 */
export interface ConfiguredTokenVerifier extends TokenVerifier {
  /** @throws when discovery fails, as {@link TokenVerifier.verify} does. */
  issuer(): Promise<string>;
}

/**
 * Builds a lazy verifier from the same discovery contract as the browser flow.
 *
 * @throws at composition, through {@link issuerUrlFromEnv}, when the issuer
 *   URL could never be discovered, and when a required key is missing.
 */
export function oidcTokenVerifierFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): ConfiguredTokenVerifier {
  const issuerUrl = issuerUrlFromEnv(env);
  const audience = required(env, 'AUTH_AUDIENCE');
  const clientId = required(env, 'AUTH_CLIENT_ID');
  const clientSecret = required(env, 'AUTH_CLIENT_SECRET');
  let verifier: Promise<{ issuer: string; verifier: JwksTokenVerifier }> | undefined;
  const discovered = () => {
    verifier ??= discovery(issuerUrl, clientId, clientSecret).then((configuration) => {
      const metadata = configuration.serverMetadata();
      if (metadata.jwks_uri === undefined) throw new Error('OIDC discovery has no jwks_uri');
      return {
        issuer: metadata.issuer,
        verifier: new JwksTokenVerifier({
          audience,
          issuer: metadata.issuer,
          jwksUri: new URL(metadata.jwks_uri),
        }),
      };
    });
    return verifier;
  };

  return {
    async verify(token) {
      return (await discovered()).verifier.verify(token);
    },
    async issuer() {
      return (await discovered()).issuer;
    },
  };
}

function required(env: Readonly<Record<string, string | undefined>>, key: string): string {
  const value = env[key];
  if (value === undefined || value === '') throw new Error(`${key} is required in AUTH_MODE=oidc`);
  return value;
}
