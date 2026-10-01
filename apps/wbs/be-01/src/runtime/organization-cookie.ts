import type { VerifiedOrganizationCredential } from '@wbs/contracts';
import { errors, jwtVerify, SignJWT } from 'jose';

/**
 * Signs a purpose-specific browser selection no longer than its access token.
 * Verification uses the exact credential digest, kind and local user; neither
 * this cookie nor a caller's organization header establishes membership.
 */
export function organizationCookieBinding(keyMaterial: string, now: () => number = Date.now) {
  const key = new TextEncoder().encode(keyMaterial);
  return {
    async issue(credential: VerifiedOrganizationCredential, organizationId: string) {
      const issuedAt = Math.floor(now() / 1000);
      const expiresAt = Math.floor(credential.expiresAt / 1000);
      if (
        credential.userId.length === 0 ||
        organizationId.length === 0 ||
        !/^[a-f0-9]{64}$/.test(credential.digest) ||
        !Number.isFinite(credential.expiresAt) ||
        expiresAt <= issuedAt
      )
        throw new Error('organization selection requires a live verified credential');
      const value = await new SignJWT({
        org: organizationId,
        digest: credential.digest,
        kind: credential.kind,
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'wbs-organization+jwt' })
        .setIssuer('wbs')
        .setAudience('wbs-organization')
        .setSubject(credential.userId)
        .setIssuedAt(issuedAt)
        // Proof: extending this expiry by 60 seconds made the decoded
        // selection expiry 1160 instead of the credential's 1100 (0/1).
        .setExpirationTime(expiresAt)
        .sign(key);
      return { value, maxAge: expiresAt - issuedAt };
    },
    async read(value: string, credential: VerifiedOrganizationCredential): Promise<string | null> {
      let claims: Awaited<ReturnType<typeof jwtVerify>>['payload'];
      try {
        ({ payload: claims } = await jwtVerify(value, key, {
          algorithms: ['HS256'],
          typ: 'wbs-organization+jwt',
          issuer: 'wbs',
          audience: 'wbs-organization',
          currentDate: new Date(now()),
          requiredClaims: ['sub', 'iat', 'exp'],
        }));
      } catch (cause) {
        if (cause instanceof errors.JOSEError) return null;
        throw cause;
      }
      // Proof: removing the subject, digest or kind comparison made the
      // cross-user, replacement-token or cross-kind substitutions pass the
      // `binds one selected organization` negative, respectively.
      if (
        claims.sub !== credential.userId ||
        claims['digest'] !== credential.digest ||
        claims['kind'] !== credential.kind ||
        typeof claims['org'] !== 'string' ||
        claims['org'].length === 0 ||
        typeof claims.exp !== 'number' ||
        claims.exp * 1000 > credential.expiresAt ||
        !Number.isFinite(credential.expiresAt) ||
        credential.expiresAt <= now()
      )
        return null;
      return claims['org'];
    },
  };
}

/** Distinguishes an absent selection from a malformed or duplicate carrier. */
export function organizationCookieCarrier(
  headers: Headers,
): { readonly kind: 'absent' | 'invalid' } | { readonly kind: 'present'; readonly value: string } {
  const name = '__Host-wbs_organization';
  const named = (headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    // Proof: with only the exact `name=` match, a malformed `name =bad`
    // beside a valid carrier was ignored and mounted POST selected (200/401).
    .filter(
      (part) =>
        part.startsWith(name) &&
        (part.length === name.length || /^[\t ]*=/.test(part.slice(name.length))),
    );
  if (named.length === 0) return { kind: 'absent' };
  // Proof: ignoring a duplicate let mounted POST /api/organization/active
  // issue a new cookie beside a conflicting old pair (200 instead of 401).
  if (named.length !== 1 || !named[0].startsWith(`${name}=`)) return { kind: 'invalid' };
  try {
    const value = decodeURIComponent(named[0].slice(name.length + 1));
    return value.length === 0 ? { kind: 'invalid' } : { kind: 'present', value };
  } catch (cause) {
    if (cause instanceof URIError) return { kind: 'invalid' };
    throw cause;
  }
}
