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

/** Current local account behind a native WBS session context. */
export type LocalUserOf = (
  userId: string,
) => Promise<{ readonly id: string; readonly username: string } | null>;

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

/** Resolves after one verified use commits; false means a replay. */
export type ConsumeDelegation = (
  issuer: string,
  jti: string,
  expiresAt: number,
  now: number,
) => Promise<boolean>;

/** Whether `token` declares itself a delegation, without believing anything else it says. */
export function declaresDelegation(token: string): boolean {
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
 * organization, a `jti` and known scopes; be issued no later than now. MCP
 * and gateway tokens also carry a client, grant and upstream pair mapped to
 * the local user, and consume `(issuer,jti)` once in shared SQLite. Direct
 * contexts instead name `identity_kind: first_party`, omit upstream claims,
 * resolve the current local account and remain reusable until their capped
 * expiry. Current membership is checked by OrganizationAccess on each use.
 *
 * @throws anything other than a JOSE refusal or a malformed claim, such as an
 * unusable key or a failing identity lookup: unknown, not a refusal.
 */
export function delegationVerifier(
  key: CryptoKey,
  mappedUserOf: MappedUserOf,
  consume: ConsumeDelegation,
  now: () => number = Date.now,
  localUserOf?: LocalUserOf,
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
        // Proof (2026-09-28): using epoch zero here made `issues a direct
        // context with a native identity and fixed audience` accept an
        // expired direct context.
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
    const claims = parseClaims(payload, now);
    if (claims === null) return { kind: 'refused' };
    if (claims.kind === 'upstream' && audience === 'wbs-be-01/direct') return { kind: 'refused' };
    // jose accepts audience arrays for general JWTs; WBS issues exactly one
    // scalar audience and refuses any broader shape here.
    // Proof (2026-09-28): removing this check made `refuses a signed array
    // audience that includes the MCP route` answer 200 instead of 401.
    // Proof (2026-09-28): bypassing both JOSE audience admission and this
    // scalar check made `issues a direct context with a native identity and
    // fixed audience` verify a direct token as MCP.
    if (payload['aud'] !== audience) return { kind: 'refused' };
    const mapped =
      claims.kind === 'first_party'
        ? await localUserOf?.(claims.userId)
        : await mappedUserOf(claims.upstream);
    // Proof: accepting any mapped upstream identity made `refuses a delegation
    // whose upstream identity maps to someone else` in
    // `delegation.controller.db.test.ts` fail; watched 2026-09-28.
    // Proof (2026-09-28): bypassing this match made `issues a direct context
    // with a native identity and fixed audience` verify a token when local
    // lookup returned bob for ada.
    if (mapped?.id !== claims.userId) return { kind: 'refused' };
    // Proof (2026-09-28): removing this await made `consumes an MCP delegation
    // once even when the project is missing` answer 404 twice. The store's
    // conflict mutation separately failed the two-connection race test.
    if (
      claims.kind !== 'first_party' &&
      !(await consume(DELEGATION_ISSUER, claims.jti, claims.expiresAt, Math.floor(now() / 1000)))
    )
      return { kind: 'refused' };
    return {
      kind: 'verified',
      principal: {
        id: mapped.id,
        username: mapped.username,
        scopes: claims.scopes,
        delegation:
          claims.kind === 'first_party'
            ? { organizationId: claims.organizationId, audience: 'wbs-be-01/direct' }
            : {
                organizationId: claims.organizationId,
                audience,
                client: claims.client,
                grant: claims.grant,
              },
      },
    };
  };
}

interface SharedClaims {
  readonly userId: string;
  readonly organizationId: string;
  readonly jti: string;
  readonly expiresAt: number;
  readonly scopes: readonly WbsScope[];
}

type DelegationClaims =
  | (SharedClaims & { readonly kind: 'first_party' })
  | (SharedClaims & {
      readonly kind: 'upstream';
      readonly client: string;
      readonly grant: string;
      readonly upstream: { readonly issuer: string; readonly subject: string };
    });

/** The claims a verified delegation must carry, or null when one is missing or malformed. */
function parseClaims(payload: Record<string, unknown>, now: () => number): DelegationClaims | null {
  const {
    sub,
    org,
    client,
    grant,
    jti,
    scope,
    upstream_iss,
    upstream_sub,
    identity_kind,
    iat,
    exp,
  } = payload;
  if (
    !isFilled(sub) ||
    !isFilled(org) ||
    !isFilled(jti) ||
    typeof scope !== 'string' ||
    typeof iat !== 'number' ||
    typeof exp !== 'number'
  )
    return null;
  // Proof: skipping this bound made `refuses a delegation longer than five
  // minutes` in `delegation.controller.db.test.ts` fail; watched 2026-09-28.
  if (!Number.isInteger(iat) || !Number.isInteger(exp) || exp - iat > MOST_DELEGATION_SECONDS)
    return null;
  // Together with JOSE's own `exp` check this also refuses a lifetime of zero
  // or less: `exp <= iat <= now` is expired.
  // Proof: skipping this made `refuses a delegation issued in the future, of
  // no lifetime, or with no grant` in `delegation.controller.db.test.ts`
  // fail; so did dropping the grant claim check; watched 2026-09-28.
  if (iat * 1000 > now()) return null;
  const scopes = scope.split(' ');
  if (!scopes.every((named): named is WbsScope => (SCOPES as readonly string[]).includes(named)))
    return null;
  const shared = {
    userId: sub,
    organizationId: org,
    jti,
    expiresAt: exp,
    scopes,
  };
  if (identity_kind === 'first_party') {
    if (
      payload['aud'] !== 'wbs-be-01/direct' ||
      client !== undefined ||
      grant !== undefined ||
      upstream_iss !== undefined ||
      upstream_sub !== undefined
    )
      return null;
    return { ...shared, kind: 'first_party' };
  }
  // Proof (2026-09-28): bypassing this guard made `refuses an unknown signed
  // identity variant` verify a token claiming an unrecognized identity kind.
  if (identity_kind !== undefined) return null;
  if (!isFilled(client) || !isFilled(grant) || !isFilled(upstream_iss) || !isFilled(upstream_sub))
    return null;
  if (payload['aud'] === 'wbs-be-01/direct') return null;
  return {
    ...shared,
    kind: 'upstream',
    client,
    grant,
    upstream: { issuer: upstream_iss, subject: upstream_sub },
  };
}

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
