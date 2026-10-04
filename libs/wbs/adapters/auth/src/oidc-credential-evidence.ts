import { createHash } from 'node:crypto';

import type { OidcIdentity } from '@wbs/contracts';

import { oidcIdentityFromClaims, type OidcIdentityOptions } from './oidc-identity';
import { isInvalidCredential } from './oidc-verifier';
import type { TokenVerifier } from './token-verifier';

export interface OidcCredentialEvidence {
  readonly kind: 'oidc';
  readonly identity: OidcIdentity;
  readonly expiresAt: number;
  readonly digest: string;
}

export function oidcCredentialEvidence(
  verifier: TokenVerifier,
  options: OidcIdentityOptions,
  now: () => number = Date.now,
): (token: string) => Promise<OidcCredentialEvidence | null> {
  return async (token) => {
    let claims;
    try {
      claims = await verifier.verify(token);
    } catch (cause) {
      if (isInvalidCredential(cause)) return null;
      throw cause;
    }
    const expiresAt = claims['exp'];
    // The identity-only adapter remains compatible with upstream tokens
    // without exp. A browser organization binding has the stronger contract.
    // Proof: deleting this check made the missing/malformed/past-expiry
    // evidence test accept all four injected claims.
    if (
      typeof expiresAt !== 'number' ||
      !Number.isSafeInteger(expiresAt) ||
      // Proof: verified MAX_SAFE_INTEGER seconds made the browser expiry
      // exceed safe millisecond precision until this check (0/1).
      !Number.isSafeInteger(expiresAt * 1000) ||
      expiresAt * 1000 <= now()
    )
      return null;
    let identity: OidcIdentity;
    try {
      identity = oidcIdentityFromClaims(claims, options);
    } catch (cause) {
      if (isInvalidCredential(cause)) return null;
      throw cause;
    }
    return {
      kind: 'oidc',
      identity,
      expiresAt: expiresAt * 1000,
      digest: createHash('sha256').update(token, 'utf8').digest('hex'),
    };
  };
}
