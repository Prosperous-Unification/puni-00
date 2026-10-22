import type { MachineCredentialActorRefusal } from './machine-credentials';
import type { AuditedAct } from './organization-audit';

/**
 * What a JWT says about itself before any verification: its `iss` and `sub`
 * as sent. Only routing reads it (`wbs-machine-credentials` A13); nothing is
 * admitted on it.
 */
export interface UnverifiedJwtClaims {
  readonly issuer: string;
  /** Null when the token carries no string `sub`. */
  readonly subject: string | null;
}

/** What one trusted-issuer token must verify against. */
export interface TrustedIssuerExpectation {
  readonly issuer: string;
  readonly jwksUri: string;
  /** Checked against `aud` when set; null checks no audience. */
  readonly audience: string | null;
}

/**
 * How a trusted-issuer token was judged: verified with its subject, refused
 * as a credential (`invalid`: signature, algorithm, `iss`, `aud`, `exp`,
 * `nbf`, a missing `sub`, an unknown key after one refresh), or refused
 * because its key set could not be fetched, which the adapter has already
 * reported.
 */
export type TrustedIssuerVerdict =
  | { readonly kind: 'verified'; readonly subject: string }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'key_set_unavailable' };

/**
 * Verifies JWTs of trusted issuers (`wbs-machine-credentials` A13 step 3):
 * one key set per JWKS URL, cached, refreshed at most once per token on an
 * unknown `kid` and never more often than its cooldown.
 */
export interface TrustedIssuerTokens {
  /** The token's unverified `iss` and `sub`; null when it is no JWT or has no string `iss`. */
  peek(token: string): UnverifiedJwtClaims | null;
  /**
   * @throws on anything but a credential failure or a key-set fetch failure,
   * both of which are verdicts.
   */
  verify(token: string, expected: TrustedIssuerExpectation): Promise<TrustedIssuerVerdict>;
}

/**
 * The outcome of fetching `<issuer>/.well-known/openid-configuration` once
 * (A16): its `jwks_uri` when the document's `issuer` equals the given one,
 * `mismatch` when it names another, `unreachable` when no usable document
 * (no answer, not 200, not JSON, no HTTPS `jwks_uri`) came back.
 */
export type TrustedIssuerDiscoveryOutcome =
  | { readonly kind: 'discovered'; readonly jwksUri: string }
  | { readonly kind: 'mismatch' }
  | { readonly kind: 'unreachable' };

/** Fetches one issuer's discovery document at registration (A16). */
export interface TrustedIssuerDiscovery {
  discover(issuer: string): Promise<TrustedIssuerDiscoveryOutcome>;
}

/** One trusted issuer as its administrators list it. */
export interface TrustedIssuerSummary {
  readonly id: string;
  readonly issuer: string;
  readonly jwksUri: string;
  readonly defaultAudience: string | null;
  readonly ssoConnectionId: string | null;
  readonly createdAt: number;
  readonly createdBy: string | null;
  /** Unrevoked credentials naming it: what refuses its removal. */
  readonly machineCredentials: number;
}

/** A trusted issuer to register: the caller's id and the discovered key set URL. */
export interface TrustedIssuerDraft {
  readonly id: string;
  readonly issuer: string;
  readonly jwksUri: string;
  readonly defaultAudience: string | null;
  readonly ssoConnectionId: string | null;
}

/**
 * Why registering an issuer is refused by what the organization already
 * holds: `unknown_sso_connection` for a connection of another organization or
 * none, `issuer_not_oidc` for a `samlp` one, `sso_connection_unproven` for an
 * unproven one, `issuer_taken` when the organization already trusts the URL.
 */
export type TrustedIssuerRegistrationRefusal =
  | MachineCredentialActorRefusal
  | 'unknown_sso_connection'
  | 'issuer_not_oidc'
  | 'sso_connection_unproven'
  | 'issuer_taken';

/**
 * Trusted issuer administration (`wbs-machine-credentials` A16, A17), for
 * `admin` and `super_admin` only: an issuer admits subjects for every person
 * of the organization, so it is not a member's act (`forbidden` for a member
 * or a viewer, `inactive` before activation). Every write rechecks in one
 * immediate transaction with its `organization_audit` row.
 *
 * @throws when trusted state is malformed, and when the audit row cannot be
 * written (the act is then rolled back).
 */
export interface TrustedIssuerAdministration {
  list(
    organizationId: string,
    actorId: string,
  ): Promise<readonly TrustedIssuerSummary[] | MachineCredentialActorRefusal>;
  /**
   * The refusal registering `issuer` would meet now, read without writing,
   * so discovery is fetched only for an admin who could register it; `ready`
   * otherwise. {@link register} checks everything again.
   */
  checkRegistration(
    organizationId: string,
    actorId: string,
    issuer: string,
    ssoConnectionId: string | null,
  ): Promise<TrustedIssuerRegistrationRefusal | 'ready'>;
  register(
    organizationId: string,
    actorId: string,
    draft: TrustedIssuerDraft,
    act: AuditedAct,
  ): Promise<
    | { readonly kind: 'registered'; readonly issuer: TrustedIssuerSummary }
    | { readonly kind: TrustedIssuerRegistrationRefusal }
  >;
  /**
   * Removes the trusted issuer `id` of the organization. `not_found` for
   * another organization's or none; `in_use` with the count while unrevoked
   * credentials name it. Revoked credentials naming it are deleted with it
   * (their audit rows stay), because `trusted_issuer_id` has no `ON DELETE`.
   */
  remove(
    organizationId: string,
    actorId: string,
    id: string,
    act: AuditedAct,
  ): Promise<
    | 'removed'
    | MachineCredentialActorRefusal
    | 'not_found'
    | { readonly kind: 'in_use'; readonly machineCredentials: number }
  >;
}

/** Administration for an app composed without it: every act answers as before activation. */
export const INACTIVE_TRUSTED_ISSUER_ADMINISTRATION: TrustedIssuerAdministration = {
  list: () => Promise.resolve('inactive'),
  checkRegistration: () => Promise.resolve('inactive'),
  register: () => Promise.resolve({ kind: 'inactive' }),
  remove: () => Promise.resolve('inactive'),
};
