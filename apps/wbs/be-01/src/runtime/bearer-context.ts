import type { DelegationIssuer, DelegationSourceResolver, OrganizationAccess } from '@wbs/core';
import type { AuthService } from '@wbs/core/service/auth.service';
import { errors, jwtVerify } from 'jose';

import { DelegationSourceIneligible } from './delegation-issuer';

/** A presented credential is absent, invalid or not a native WBS session. */
export class InvalidNativeCredential extends Error {}

/** The only expected outcomes of requesting a direct organization bearer. */
export type BearerContextOutcome =
  | { readonly kind: 'issued'; readonly token: string }
  | { readonly kind: 'inactive' | 'invalid_binding' | 'forbidden' };

/** One request-bound credential exchange; production supplies the refusing binding. */
export type IssueBearerContext = (
  credential: string,
  organizationId: string,
) => Promise<BearerContextOutcome>;

/** Production refusal until the organization activation sequence is authorized. */
// Proof (2026-09-28): replacing this refusal with an issued token made
// `context route stays inert before activation and production binding`
// answer 200 instead of 403.
export const REFUSE_BEARER_CONTEXT: IssueBearerContext = () =>
  Promise.resolve({ kind: 'inactive' });

/** Verifies a native credential, durable activation and current membership before issue. */
export function bearerContextIssuer(
  resolveSource: DelegationSourceResolver,
  organizations: OrganizationAccess,
  issue: DelegationIssuer,
  activationState: () => 'pre_activation' | 'activated',
): IssueBearerContext {
  return async (credential, organizationId) => {
    let source;
    try {
      source = await resolveSource(credential, organizationId);
    } catch (cause) {
      // Proof (2026-09-28): classifying an invalid session as forbidden made
      // `issues a native direct context only for its own current membership`
      // answer 403 instead of 401 for an invalid bearer.
      if (cause instanceof InvalidNativeCredential) return { kind: 'invalid_binding' };
      throw cause;
    }
    // Proof (2026-09-28): bypassing this source-kind/delegation refusal made
    // `refuses direct issuance before activation, without membership, or from
    // a delegated source` issue a bearer for its delegated source.
    if (source.kind !== 'verified-first-party-credential' || source.delegated)
      return { kind: 'forbidden' };
    // Proof (2026-09-28): replacing this check with `activated` made
    // `enabled context issuance reports inactive before activation` answer forbidden.
    if (activationState() === 'pre_activation') return { kind: 'inactive' };
    // Proof (2026-09-28): dropping organization_activation made `issues a
    // native direct context only for its own current membership` answer 500
    // rather than issue or classify the missing trusted marker as inactive.
    const resolved = await organizations.resolve({
      id: source.userId,
      delegation: { organizationId, audience: 'wbs-be-01/direct' },
    });
    // Proof (2026-09-28): turning this refusal into an issued result made
    // `refuses direct issuance before activation, without membership, or from
    // a delegated source` issue for a nonmember.
    if (!resolved.ok) return { kind: 'forbidden' };
    try {
      const token = await issue(
        credential,
        'wbs-be-01/direct',
        source.scopeCeiling,
        organizationId,
      );
      return { kind: 'issued', token };
    } catch (cause) {
      if (cause instanceof InvalidNativeCredential) return { kind: 'invalid_binding' };
      // Proof (2026-09-28): removing this modeled refusal made `refuses direct
      // issuance before activation, without membership, or from a delegated
      // source` throw instead of answer forbidden for an over-scoped source.
      if (cause instanceof DelegationSourceIneligible) return { kind: 'forbidden' };
      throw cause;
    }
  };
}

/** Verifies the native session signature, expiry and current account before binding it. */
export function nativeCredentialSource(
  auth: AuthService,
  sessionKey: string,
  now: () => number = Date.now,
): DelegationSourceResolver {
  // Proof (2026-09-28): substituting wrong-key made `binds a native session
  // to its own user and requested organization` reject its valid session.
  const key = new TextEncoder().encode(sessionKey);
  return async (credential, organizationId) => {
    let claims: Awaited<ReturnType<typeof jwtVerify>>['payload'];
    try {
      ({ payload: claims } = await jwtVerify(credential, key, {
        algorithms: ['HS256'],
        // Proof (2026-09-28): using epoch zero made `refuses an expired
        // native credential even when account lookup still succeeds` accept it.
        currentDate: new Date(now()),
        requiredClaims: ['sub', 'iat', 'exp'],
      }));
    } catch (cause) {
      // A failed native signature is a modeled credential refusal.
      if (cause instanceof errors.JOSEError)
        throw new InvalidNativeCredential('invalid native session');
      throw cause;
    }
    const principal = await auth.authenticate(credential);
    // Proof (2026-09-28): dropping the subject/account match made `refuses a
    // substituted account behind a valid native credential` resolve.
    if (
      principal === null ||
      principal.id !== claims.sub ||
      typeof claims.exp !== 'number' ||
      // Proof (2026-09-28): dropping the organization requirement made `binds
      // a native session to its own user and requested organization` return
      // a source with an empty selection.
      typeof organizationId !== 'string' ||
      organizationId.length === 0
    )
      throw new InvalidNativeCredential('invalid native session binding');
    return {
      kind: 'verified-first-party-credential',
      delegated: false,
      credentialExpiresAt: claims.exp * 1000,
      userId: principal.id,
      organizationId,
      scopeCeiling: principal.scopes,
    };
  };
}

/** One native credential from a browser session or Bearer header; malformed or ambiguous is null. */
export function bearerContextCredential(headers: Headers): string | null {
  const rawCookies = headers.get('cookie') ?? '';
  const sessionCookies = rawCookies.split(';').filter((part) => {
    const separator = part.indexOf('=');
    return separator > 0 && part.slice(0, separator).trim() === '__Host-wbs_access';
  });
  const authorization = headers.get('authorization');
  const bearer = authorization?.startsWith('Bearer ') === true ? authorization.slice(7) : null;
  // Proof (2026-09-28): the old decoder accepted a Bearer beside malformed
  // `%E0%A4%A`, and the mounted test issued a token.
  if (sessionCookies.length > 0 && authorization !== null) return null;
  let cookie: string | null = null;
  // Proof (2026-09-28): changing this exact-one condition to `> 0` made
  // `refuses ambiguous browser and bearer credentials` return `first` for
  // two named session cookies instead of null.
  if (sessionCookies.length === 1) {
    const sessionCookie = sessionCookies[0];
    try {
      cookie = decodeURIComponent(sessionCookie.slice(sessionCookie.indexOf('=') + 1));
    } catch (cause) {
      // Proof (2026-09-28): rethrowing the malformed cookie's URIError made
      // `refuses ambiguous browser and bearer credentials` fail by throwing.
      if (cause instanceof URIError) return null;
      throw cause;
    }
  }
  return cookie ?? bearer;
}
