import { isCanonicalDomain } from '@wbs/domain';

import type { AuditedAct } from './organization-audit';
import type { SessionPolicy } from './session-policies';

/** The Auth0 strategies an enterprise connection may use. */
export type EnterpriseStrategy = 'samlp' | 'oidc';

/**
 * One Auth0 enterprise connection recorded on one verified domain claim
 * (`organization-sso`, ADR 0049). Its subject prefix is
 * `{strategy}|{auth0Connection}|`; see {@link subjectPrefixOf}.
 */
export interface EnterpriseConnection {
  readonly id: string;
  readonly organizationId: string;
  readonly domainClaimId: string;
  /** The claim's canonical lowercase ASCII IDNA domain. */
  readonly domain: string;
  readonly auth0Connection: string;
  readonly strategy: EnterpriseStrategy;
  readonly loginSlug: string;
  readonly enforced: boolean;
  /** When a super-admin's routed link proved the prefix; null while unproven. */
  readonly provenAt: number | null;
  readonly provenBy: string | null;
  /** When a routed link last returned a subject without the prefix. */
  readonly lastPrefixMismatchAt: number | null;
}

/** What a super-admin submits to record a connection. */
export interface EnterpriseConnectionDraft {
  readonly domainClaimId: string;
  readonly auth0Connection: string;
  readonly strategy: EnterpriseStrategy;
  readonly loginSlug: string;
}

/** A change to a connection's configuration; enforcement changes separately. */
export interface EnterpriseConnectionChange {
  readonly auth0Connection?: string;
  readonly strategy?: EnterpriseStrategy;
  readonly loginSlug?: string;
}

/** Refusals every super-admin connection write shares. */
export type ConnectionAuthorityRefusal = 'inactive' | 'forbidden' | 'not_found';

/** Where login routing sends a browser. */
export interface EnterpriseRoute {
  readonly connectionId: string;
  readonly organizationId: string;
  readonly auth0Connection: string;
  /** The routed organization's session policy; null when it has none. */
  readonly policy: SessionPolicy | null;
}

/** A proven connection whose prefix a subject carries. */
export interface ProvenConnection {
  readonly connectionId: string;
  readonly organizationId: string;
  readonly domain: string;
  readonly prefix: string;
}

/**
 * The whole subject prefix of a connection, including the final `|`, so
 * `acme-saml` never matches `acme-saml-2` (`organization-sso`, A29).
 */
export function subjectPrefixOf(
  connection: Pick<EnterpriseConnection, 'strategy' | 'auth0Connection'>,
): string {
  return `${connection.strategy}|${connection.auth0Connection}|`;
}

/**
 * Whether `subject` carries `connection`'s whole prefix.
 *
 * Proof: comparing without the trailing `|` made `refuses a longer connection
 * name sharing the prefix` in `enterprise-connections.test.ts` admit
 * `samlp|acme-saml-2|x`; watched 2026-10-12.
 */
export function carriesSubjectPrefix(
  subject: string,
  connection: Pick<EnterpriseConnection, 'strategy' | 'auth0Connection'>,
): boolean {
  return subject.startsWith(subjectPrefixOf(connection));
}

/** The strategies whose subjects an enterprise connection's IdP issues. */
const ENTERPRISE_SUBJECT = /^(?:samlp|oidc)\|/;

/** Whether `subject` was issued through an enterprise strategy (`samlp|` or `oidc|`). */
export function isEnterpriseSubject(subject: string): boolean {
  return ENTERPRISE_SUBJECT.test(subject);
}

/**
 * The canonical lowercase ASCII IDNA domain of `email`, by the claim rules,
 * or null when it has none.
 */
export function canonicalEmailDomain(email: string | null): string | null {
  if (email === null) return null;
  const separator = email.lastIndexOf('@');
  if (separator <= 0) return null;
  const domain = email.slice(separator + 1).toLowerCase();
  if (!/^[\p{L}\p{M}\p{N}.-]+$/u.test(domain)) return null;
  try {
    const host = new URL(`http://${domain}`).hostname;
    return isCanonicalDomain(host) ? host : null;
  } catch {
    // A domain the URL parser refuses is no domain: the modeled null.
    return null;
  }
}

/**
 * Whether an enterprise identity's `email` is attested (`organization-sso`
 * requirement 3, D4): its subject carries a proven connection's prefix
 * (`proven`, from {@link EnterpriseConnections.provenFor}) and the email's
 * canonical domain is that connection's verified domain.
 */
export function isAttestedEmail(email: string | null, proven: ProvenConnection | null): boolean {
  return proven !== null && canonicalEmailDomain(email) === proven.domain;
}

/** A verified upstream identity a routed link returned. */
export interface RoutedIdentity {
  readonly issuer: string;
  readonly subject: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
}

/**
 * What a link routed through a connection's slug did (D5). `linked` added the
 * pair, and proved the connection when its actor could; the refusals added
 * nothing.
 */
export type RoutedLink =
  | { readonly kind: 'linked' }
  | {
      readonly kind:
        | 'not_found'
        | 'inactive'
        | 'sso_prefix_mismatch'
        | 'sso_connection_taken'
        | 'identity_collision'
        | 'email_collision'
        | 'invalid_account';
    };

/**
 * Enterprise connection records. Every write rechecks activation and the
 * actor's current super-admin role inside its own immediate transaction, and
 * writes its one audit row there, so a refused or failed audit leaves nothing.
 *
 * @throws when trusted state (the marker, a membership role, a stored record)
 * is missing, unreadable or malformed.
 */
export interface EnterpriseConnections {
  list(
    organizationId: string,
    actorId: string,
  ): Promise<readonly EnterpriseConnection[] | 'inactive' | 'forbidden'>;
  create(
    organizationId: string,
    actorId: string,
    draft: EnterpriseConnectionDraft,
    id: string,
    act: AuditedAct,
  ): Promise<
    | { readonly kind: 'created'; readonly connection: EnterpriseConnection }
    | {
        readonly kind:
          | ConnectionAuthorityRefusal
          | 'domain_not_verified'
          | 'sso_connection_exists'
          | 'login_slug_taken';
      }
  >;
  /**
   * Changing the Auth0 connection or strategy of a proven record clears its
   * proof and enforcement: the old proof says nothing about the new prefix.
   */
  update(
    organizationId: string,
    actorId: string,
    connectionId: string,
    change: EnterpriseConnectionChange,
    act: AuditedAct,
  ): Promise<
    | { readonly kind: 'updated'; readonly connection: EnterpriseConnection }
    | { readonly kind: ConnectionAuthorityRefusal | 'login_slug_taken' }
  >;
  /**
   * Switches enforcement. `actorSubject` is the upstream subject that
   * authenticated the actor's current credential, or null for a first-party
   * one; switching on is refused unless it carries the connection's prefix.
   */
  setEnforced(
    organizationId: string,
    actorId: string,
    connectionId: string,
    enforced: boolean,
    actorSubject: string | null,
    act: AuditedAct,
  ): Promise<
    | { readonly kind: 'changed'; readonly connection: EnterpriseConnection }
    | {
        readonly kind:
          | ConnectionAuthorityRefusal
          | 'sso_connection_unproven'
          | 'enforcement_would_lock_out_actor';
      }
  >;
  /** Refused while the organization has a live provisioning token at `act.stamp.at`. */
  remove(
    organizationId: string,
    actorId: string,
    connectionId: string,
    act: AuditedAct,
  ): Promise<'deleted' | ConnectionAuthorityRefusal | 'provisioning_active'>;
  /** The connection a login slug names, whatever its claim's status. */
  routeBySlug(slug: string): Promise<EnterpriseRoute | null>;
  /** The connection on a `verified` claim of `domain`; a suspended claim routes nothing. */
  routeByDomain(domain: string): Promise<EnterpriseRoute | null>;
  /** The proven connection whose whole prefix `subject` carries, if any. */
  provenFor(subject: string): Promise<ProvenConnection | null>;
  /**
   * Completes a link routed through `connectionId` for `userId`, in one
   * immediate transaction (D5). A subject without the connection's whole
   * prefix records the mismatch time and links nothing. Otherwise the pair is
   * linked, and, when the email is on the connection's domain and `userId` is
   * a current super-admin of its organization, the connection is proven with
   * one audit row. The email is verified only when attested afterwards
   * ({@link isAttestedEmail}). A second organization's proof of an already
   * proven Auth0 connection is `sso_connection_taken` and links nothing.
   */
  linkThroughConnection(
    userId: string,
    connectionId: string,
    identity: RoutedIdentity,
    act: AuditedAct,
  ): Promise<RoutedLink>;
}
