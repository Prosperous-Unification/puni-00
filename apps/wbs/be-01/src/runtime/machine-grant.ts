import { type MachineGrantTerms, MOST_MACHINE_GRANT_SECONDS } from '@wbs/core';
import type { GrantableMachineSource } from '@wbs/domain';
import { decodeJwt, decodeProtectedHeader, errors, jwtVerify, SignJWT } from 'jose';

/** The `typ` a machine grant declares; nothing else is one (`wbs-mcp-agent-surface` M3). */
export const MACHINE_GRANT_TOKEN_TYPE = 'wbs-machine-grant+jwt';

/** The only audience a machine grant is issued for and verified against. */
export const MACHINE_GRANT_AUDIENCE = 'wbs-be-01/machine-grant';

/** The issuer a grant names: WBS itself, as a delegation does. */
const MACHINE_GRANT_ISSUER = 'wbs';

/** The shortest signing secret accepted, the bound every other WBS HMAC key has. */
const LEAST_SECRET_CHARACTERS = 32;

/**
 * The fewest distinct characters a signing secret may hold: a cheap floor that
 * refuses a repeated character or a short cycle, which a length check alone
 * admits. A random hex secret holds 16, a base64 one far more.
 */
const LEAST_DISTINCT_CHARACTERS = 10;

/** How far a grant's `iat` may run ahead of this replica's clock (replica skew). */
export const GRANT_CLOCK_TOLERANCE_SECONDS = 60;

/** The message a `kid` is the HMAC of, so the `kid` reveals nothing of the key. */
const KID_LABEL = new TextEncoder().encode('wbs-machine-grant-kid');

/** One HMAC grant key and the `kid` that selects it. */
export interface MachineGrantKey {
  readonly kid: string;
  readonly key: CryptoKey;
}

/**
 * The keys grants are signed with and verified by: never the delegation key.
 * `previous` stays configured for at least {@link MOST_MACHINE_GRANT_SECONDS}
 * after a rotation, so a planned rotation refuses no live grant.
 */
export interface MachineGrantKeys {
  readonly current: MachineGrantKey;
  readonly previous: MachineGrantKey | null;
}

/**
 * Imports `WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT` and `_PREVIOUS`. Each `kid`
 * is derived from its key (the first 16 base64url characters of
 * HMAC-SHA256(key, "wbs-machine-grant-kid")), so a configured `kid` can never
 * disagree with its key and a published `kid` says nothing about it.
 *
 * @throws when a secret is shorter than 32 characters or holds fewer than 10
 * distinct characters, or when both are one secret.
 */
export async function importMachineGrantKeys(secrets: {
  readonly current: string;
  readonly previous: string | null;
}): Promise<MachineGrantKeys> {
  const current = await importKey(secrets.current, 'WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT');
  const previous =
    secrets.previous === null
      ? null
      : await importKey(secrets.previous, 'WBS_MACHINE_GRANT_SIGNING_KEY_PREVIOUS');
  // Proof: with this guard removed, `refuses a previous key equal to the
  // current one` (machine-grant.test.ts) imported the pair; watched 2026-10-26.
  if (previous !== null && previous.kid === current.kid)
    throw new Error('the previous machine grant key must differ from the current one');
  return { current, previous };
}

/**
 * Refuses a service secret shorter than 32 characters or holding fewer than 10
 * distinct ones: the floor every grant key and `MCP_BE_INTERNAL_SECRET` meet.
 *
 * Proof: with the distinct-character check removed, `refuses a secret of too
 * few distinct characters` (machine-grant.test.ts) imported 'g' repeated 32
 * times; watched 2026-10-26.
 *
 * @throws naming `setting`, never the value.
 */
export function assertServiceSecretStrength(secret: string, setting: string): void {
  if (secret.length < LEAST_SECRET_CHARACTERS)
    throw new Error(`${setting} must be at least ${String(LEAST_SECRET_CHARACTERS)} characters`);
  if (new Set(secret).size < LEAST_DISTINCT_CHARACTERS)
    throw new Error(
      `${setting} must hold at least ${String(LEAST_DISTINCT_CHARACTERS)} distinct characters`,
    );
}

/**
 * Every reason `settings` would fail be-01's boot of an activated store, by
 * the same checks boot runs: the dedicated secret's strength and the grant
 * keys' import. Empty when they would pass. The activation CLI's preflight.
 */
export async function machineGrantSettingsFaultsOf(settings: {
  readonly internalSecret: string | null;
  readonly grantSigningKeys: { readonly current: string; readonly previous: string | null } | null;
}): Promise<string[]> {
  const faults: string[] = [];
  try {
    if (settings.internalSecret !== null)
      assertServiceSecretStrength(settings.internalSecret, 'MCP_BE_INTERNAL_SECRET');
  } catch (cause) {
    faults.push(cause instanceof Error ? cause.message : 'MCP_BE_INTERNAL_SECRET is unusable');
  }
  try {
    if (settings.grantSigningKeys !== null) await importMachineGrantKeys(settings.grantSigningKeys);
  } catch (cause) {
    faults.push(cause instanceof Error ? cause.message : 'the machine grant keys are unusable');
  }
  return faults;
}

async function importKey(secret: string, setting: string): Promise<MachineGrantKey> {
  assertServiceSecretStrength(secret, setting);
  const bytes = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const tag = new Uint8Array(await crypto.subtle.sign('HMAC', key, KID_LABEL));
  return { kid: Buffer.from(tag).toString('base64url').slice(0, 16), key };
}

/** Whether `token` declares itself a machine grant, without believing anything else it says. */
export function declaresMachineGrant(token: string): boolean {
  try {
    return decodeProtectedHeader(token).typ === MACHINE_GRANT_TOKEN_TYPE;
  } catch (cause) {
    if (cause instanceof errors.JOSEError || cause instanceof TypeError) return false;
    throw cause;
  }
}

/**
 * Signs one grant under the current key: `sub` the credential, with its
 * person, organization, scopes, source and opted-in run, `iat` and `exp`
 * from the terms be-01 alone decided, and a fresh `jti`.
 */
export function signMachineGrant(
  keys: MachineGrantKeys,
  terms: MachineGrantTerms,
  source: GrantableMachineSource,
): Promise<string> {
  return new SignJWT({
    person_id: terms.personId,
    org: terms.organizationId,
    scope: terms.scopes.join(' '),
    source,
    ...(terms.runId === null ? {} : { run_id: terms.runId }),
  })
    .setProtectedHeader({ alg: 'HS256', typ: MACHINE_GRANT_TOKEN_TYPE, kid: keys.current.kid })
    .setIssuer(MACHINE_GRANT_ISSUER)
    .setAudience(MACHINE_GRANT_AUDIENCE)
    .setSubject(terms.credentialId)
    .setJti(crypto.randomUUID())
    .setIssuedAt(terms.issuedAt)
    .setExpirationTime(terms.expiresAt)
    .sign(keys.current.key);
}

/** What a verified grant names; its scopes are not trusted, the reread decides them. */
export interface MachineGrantClaims {
  readonly credentialId: string;
  readonly personId: string;
  readonly organizationId: string;
  readonly runId: string | null;
  readonly expiresAt: number;
}

/** How a presented grant was judged. */
export type MachineGrantVerdict =
  | { readonly kind: 'verified'; readonly claims: MachineGrantClaims }
  | { readonly kind: 'unknown_grant_key' }
  | { readonly kind: 'refused' };

export type MachineGrantVerifier = (token: string) => Promise<MachineGrantVerdict>;

/**
 * Verifies machine grants (`wbs-mcp-agent-surface` M3) with the grant keys
 * alone: the `kid` selects the current or previous key, else
 * `unknown_grant_key` (a rotation mcp-01 answers with a re-fetch). A verified
 * grant must declare {@link MACHINE_GRANT_TOKEN_TYPE}, name issuer `wbs` and
 * exactly the audience {@link MACHINE_GRANT_AUDIENCE} as a scalar, be
 * unexpired, issued no later than now, live at most
 * {@link MOST_MACHINE_GRANT_SECONDS}, and carry its credential, person,
 * organization and `jti`. Nothing is consumed: a grant is reusable until
 * `exp`, and admission rereads its credential at every use.
 *
 * @throws anything but a JOSE refusal or a malformed claim.
 */
export function machineGrantVerifier(
  keys: MachineGrantKeys,
  now: () => number,
): MachineGrantVerifier {
  return async (token) => {
    let kid: unknown;
    try {
      ({ kid } = decodeProtectedHeader(token));
    } catch (cause) {
      if (cause instanceof errors.JOSEError || cause instanceof TypeError)
        return { kind: 'refused' };
      throw cause;
    }
    const key =
      kid === keys.current.kid
        ? keys.current.key
        : keys.previous !== null && kid === keys.previous.kid
          ? keys.previous.key
          : null;
    if (key === null) return { kind: 'unknown_grant_key' };
    let payload: Record<string, unknown>;
    // The grant keys alone, HS256 alone: never the delegation key.
    // Proof: with an RS256 retry against a delegation key added to the catch
    // below, `refuses a grant signed with the delegation key under the current
    // grant kid` (machine-grant.controller.db.test.ts) answered 200 for the
    // forgery; watched 2026-10-26.
    try {
      ({ payload } = await jwtVerify(token, key, {
        algorithms: ['HS256'],
        typ: MACHINE_GRANT_TOKEN_TYPE,
        issuer: MACHINE_GRANT_ISSUER,
        audience: MACHINE_GRANT_AUDIENCE,
        currentDate: new Date(now()),
        clockTolerance: GRANT_CLOCK_TOLERANCE_SECONDS,
        requiredClaims: ['sub', 'iat', 'exp', 'jti'],
      }));
    } catch (cause) {
      if (cause instanceof errors.JOSEError) return { kind: 'refused' };
      throw cause;
    }
    const claims = parseClaims(payload, now());
    return claims === null ? { kind: 'refused' } : { kind: 'verified', claims };
  };
}

function parseClaims(payload: Record<string, unknown>, now: number): MachineGrantClaims | null {
  const { sub, person_id, org, run_id, iat, exp, aud } = payload;
  // jose admits an array naming the audience; a grant names exactly one.
  // Proof: with this check removed, `refuses a grant whose audience is an
  // array naming the grant audience` (machine-grant.test.ts) verified it;
  // watched 2026-10-26.
  if (aud !== MACHINE_GRANT_AUDIENCE) return null;
  if (!isFilled(sub) || !isFilled(person_id) || !isFilled(org)) return null;
  if (run_id !== undefined && !isFilled(run_id)) return null;
  if (typeof iat !== 'number' || typeof exp !== 'number') return null;
  if (!Number.isInteger(iat) || !Number.isInteger(exp)) return null;
  // An `iat` ahead of this replica by more than the skew tolerance was never
  // issued by a replica that shares the clock.
  // Proof: with this check removed, `refuses a grant issued more than 60 s in
  // the future, and admits one 30 s ahead` (machine-grant.test.ts) verified the
  // far-future grant; watched 2026-10-26.
  if (iat * 1000 > now + GRANT_CLOCK_TOLERANCE_SECONDS * 1000) return null;
  if (exp - iat > MOST_MACHINE_GRANT_SECONDS) return null;
  return {
    credentialId: sub,
    personId: person_id,
    organizationId: org,
    runId: isFilled(run_id) ? run_id : null,
    expiresAt: exp,
  };
}

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * The `typ` a presented workload assertion declares: null for none. Read only
 * to refuse what is not a plain JWT (ID-JAG, RFC 9068 access tokens) before any
 * verification; nothing is admitted on it.
 */
export function assertionTypeOf(
  assertion: string,
): { readonly kind: 'jwt'; readonly typ: string | null } | { readonly kind: 'malformed' } {
  try {
    const { typ } = decodeProtectedHeader(assertion);
    // A JWT whose payload does not decode is no assertion at all.
    decodeJwt(assertion);
    return { kind: 'jwt', typ: typ ?? null };
  } catch (cause) {
    if (cause instanceof errors.JOSEError || cause instanceof TypeError)
      return { kind: 'malformed' };
    throw cause;
  }
}
