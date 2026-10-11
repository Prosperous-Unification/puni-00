import { createHash } from 'node:crypto';

import type { OidcCredentialEvidence } from '@wbs/auth';
import type { AuthenticatedUser, VerifiedOrganizationCredential } from '@wbs/contracts';
import type { AuthService } from '@wbs/core/service/auth.service';
import { errors, jwtVerify } from 'jose';

export type VerifiedCredentialOf = (
  token: string,
  principal: AuthenticatedUser,
) => Promise<VerifiedOrganizationCredential | null>;

/** Exact native browser evidence; caller identity is established by verification. */
export type VerifiedNativeBrowserCredential = Omit<VerifiedOrganizationCredential, 'kind'> & {
  readonly kind: 'native';
};

async function verifyNative(
  auth: AuthService,
  key: Uint8Array,
  token: string,
  principal: AuthenticatedUser,
  now: () => number,
): Promise<VerifiedNativeBrowserCredential | null> {
  let claims: Awaited<ReturnType<typeof jwtVerify>>['payload'];
  let credentialType: string | undefined;
  try {
    const verified = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      currentDate: new Date(now()),
      requiredClaims: ['sub', 'iat', 'exp', 'jti'],
    });
    claims = verified.payload;
    credentialType = verified.protectedHeader.typ;
  } catch (cause) {
    if (cause instanceof errors.JOSEError) return null;
    throw cause;
  }
  // Proof: a same-key JWT declaring wbs-delegation+jwt was accepted as native
  // browser evidence before this purpose check (0/1, 2026-10-01).
  if (credentialType !== undefined && credentialType.toLowerCase() !== 'jwt') return null;
  // Proof: omitting jti let the pre-change same-second native token bind;
  // the legacy/expired-token negative refuses it. The account recheck keeps
  // a valid signature from retaining a deleted or disabled login.
  if (
    typeof claims.jti !== 'string' ||
    claims.jti.length === 0 ||
    // Proof: a signed exp of 1e300 passed JOSE verification and supplied
    // unbounded browser evidence until this finite future bound (0/1).
    typeof claims.exp !== 'number' ||
    !Number.isSafeInteger(claims.exp) ||
    !Number.isSafeInteger(claims.exp * 1000) ||
    claims.exp * 1000 <= now() ||
    claims.sub !== principal.id ||
    (await auth.passwordSessionUser(token))?.id !== principal.id
  )
    return null;
  return {
    kind: 'native',
    userId: principal.id,
    expiresAt: claims.exp * 1000,
    digest: createHash('sha256').update(token, 'utf8').digest('hex'),
  };
}

/** Read-only token-to-native-evidence adapter for common browser logout. */
export function nativeBrowserCredentialEvidence(
  auth: AuthService,
  sessionKey: string,
  now: () => number = Date.now,
): (token: string) => Promise<VerifiedNativeBrowserCredential | null> {
  const key = new TextEncoder().encode(sessionKey);
  return async (token) => {
    const user = await auth.passwordSessionUser(token);
    if (user === null) return null;
    return verifyNative(
      auth,
      key,
      token,
      { id: user.id, username: user.username, scopes: [] },
      now,
    );
  };
}

export function organizationCredentialEvidence(
  auth: AuthService,
  sessionKey: string,
  upstream?: (token: string) => Promise<OidcCredentialEvidence | null>,
  now: () => number = Date.now,
): VerifiedCredentialOf {
  const key = new TextEncoder().encode(sessionKey);
  return async (token, principal) => {
    if (upstream !== undefined) {
      const evidence = await upstream(token);
      if (evidence !== null) {
        // The exact verified pair, never an email match, must resolve to the
        // account that authenticated the request.
        const user = await auth.resolveOidcIdentity(evidence.identity);
        if (user?.id !== principal.id) return null;
        return {
          kind: 'oidc',
          userId: principal.id,
          expiresAt: evidence.expiresAt,
          digest: evidence.digest,
        };
      }
    }
    return verifyNative(auth, key, token, principal, now);
  };
}
