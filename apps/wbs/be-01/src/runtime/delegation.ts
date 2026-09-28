import type { AuthenticatedUser, DelegationAudience, WbsScope } from '@wbs/contracts';
import { decodeProtectedHeader, errors, jwtVerify } from 'jose';

/** The `typ` a WBS-signed delegation token declares; nothing else is one. */
export const DELEGATION_TOKEN_TYPE = 'wbs-delegation+jwt';

/** The issuer a delegation must name: WBS itself, never the upstream provider. */
export const DELEGATION_ISSUER = 'wbs';

/** The longest lifetime a delegation may claim, from `iat` to `exp`. */
export const MOST_DELEGATION_SECONDS = 300;

const SCOPES: readonly WbsScope[] = ['read', 'write', 'editor'];

/** The account an upstream `(issuer, subject)` is mapped to, or null when none. */
export type MappedUserOf = (pair: {
  readonly issuer: string;
  readonly subject: string;
}) => Promise<{ readonly id: string; readonly username: string } | null>;

/**
 * What a bearer credential turned out to be: not a delegation at all (the
 * session path decides), a verified delegation, or a delegation refused.
 */
export type DelegationOutcome =
  | { readonly kind: 'not_delegation' }
  | { readonly kind: 'verified'; readonly principal: AuthenticatedUser }
  | { readonly kind: 'refused' };

/** Verifies one presented bearer credential as a delegation to `audience`. */
export type DelegationVerifier = (
  token: string,
  audience: DelegationAudience,
) => Promise<DelegationOutcome>;

/**
 * Verifies WBS-signed delegation tokens (task 2.5) with a dedicated RS256
 * public key, never the session HMAC key or the internal secret.
 *
 * A token is a delegation exactly when its protected header declares
 * {@link DELEGATION_TOKEN_TYPE}; such a token is judged here alone and a
 * refusal never falls back to session authentication. A verified token must:
 * name issuer {@link DELEGATION_ISSUER} and the audience the route's policy
 * expects (never one the caller chooses); live at most
 * {@link MOST_DELEGATION_SECONDS} and not be expired; carry a local user, an
 * organization, a client, a `jti` and known scopes; and bind an upstream
 * `(issuer, subject)` that maps to that same local user. Scopes only narrow.
 *
 * @throws anything other than a JOSE refusal or a malformed claim, such as an
 * unusable key or a failing identity lookup: unknown, not a refusal.
 */
/** Whether `token` declares itself a delegation, without believing anything else it says. */
function declaresDelegation(token: string): boolean {
  try {
    return decodeProtectedHeader(token).typ === DELEGATION_TOKEN_TYPE;
  } catch (cause) {
    if (cause instanceof errors.JOSEError || cause instanceof TypeError) return false;
    throw cause;
  }
}

/**
 * The verifier of a deployment with no delegation key: every delegation is
 * refused, and no other credential is touched. Production wires this until
 * WBS issues delegations (tasks 2.5 and 6.x), so the path stays inert.
 */
export const REFUSE_DELEGATIONS: DelegationVerifier = (token) =>
  Promise.resolve(declaresDelegation(token) ? { kind: 'refused' } : { kind: 'not_delegation' });

export function delegationVerifier(
  key: CryptoKey,
  mappedUserOf: MappedUserOf,
  now: () => number = Date.now,
): DelegationVerifier {
  return async (token, audience) => {
    if (!declaresDelegation(token)) return { kind: 'not_delegation' };
    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(token, key, {
        algorithms: ['RS256'],
        typ: DELEGATION_TOKEN_TYPE,
        issuer: DELEGATION_ISSUER,
        // Proof: dropping this made `refuses a gateway or unknown audience`
        // in `delegation.controller.db.test.ts` answer 200; watched 2026-09-28.
        audience,
        currentDate: new Date(now()),
        requiredClaims: ['sub', 'iat', 'exp', 'jti'],
      }));
    } catch (cause) {
      // Proof: answering `not_delegation` here sent refused delegations to the
      // session path, failing `refuses a gateway or unknown audience` and
      // `refuses an expired, re-signed or forged-organization delegation` in
      // `delegation.controller.db.test.ts`; watched 2026-09-28.
      if (cause instanceof errors.JOSEError) return { kind: 'refused' };
      throw cause;
    }
    const claims = parseClaims(payload);
    if (claims === null) return { kind: 'refused' };
    const mapped = await mappedUserOf(claims.upstream);
    // Proof: accepting any mapped upstream identity made `refuses a delegation
    // whose upstream identity maps to someone else` in
    // `delegation.controller.db.test.ts` fail; watched 2026-09-28.
    if (mapped?.id !== claims.userId) return { kind: 'refused' };
    return {
      kind: 'verified',
      principal: {
        id: mapped.id,
        username: mapped.username,
        scopes: claims.scopes,
        delegation: { organizationId: claims.organizationId, audience, client: claims.client },
      },
    };
  };
}

interface DelegationClaims {
  readonly userId: string;
  readonly organizationId: string;
  readonly client: string;
  readonly scopes: readonly WbsScope[];
  readonly upstream: { readonly issuer: string; readonly subject: string };
}

/** The claims a verified delegation must carry, or null when one is missing or malformed. */
function parseClaims(payload: Record<string, unknown>): DelegationClaims | null {
  const { sub, org, client, scope, upstream_iss, upstream_sub, iat, exp } = payload;
  if (
    !isFilled(sub) ||
    !isFilled(org) ||
    !isFilled(client) ||
    !isFilled(upstream_iss) ||
    !isFilled(upstream_sub) ||
    typeof scope !== 'string' ||
    typeof iat !== 'number' ||
    typeof exp !== 'number'
  )
    return null;
  // Proof: skipping this bound made `refuses a delegation longer than five
  // minutes` in `delegation.controller.db.test.ts` fail; watched 2026-09-28.
  if (exp - iat > MOST_DELEGATION_SECONDS) return null;
  const scopes = scope.split(' ');
  if (!scopes.every((named): named is WbsScope => (SCOPES as readonly string[]).includes(named)))
    return null;
  return {
    userId: sub,
    organizationId: org,
    client,
    scopes,
    upstream: { issuer: upstream_iss, subject: upstream_sub },
  };
}

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
