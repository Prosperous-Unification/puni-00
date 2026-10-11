import type { AuditedAct } from './organization-audit';

/**
 * One SCIM `User` of one organization (`organization-scim`). Active and
 * unbound is a pending membership, which grants nothing until the first
 * matching SSO sign-in binds it.
 */
export interface ScimUser {
  readonly id: string;
  readonly organizationId: string;
  /** Canonical: lowercase local part, lowercase ASCII IDNA domain. */
  readonly userName: string;
  readonly externalId: string | null;
  readonly active: boolean;
  /** The bound local account, or null while pending or never activated. */
  readonly userId: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** What a SCIM client provisions; `userName` already canonical. */
export interface ScimUserDraft {
  readonly userName: string;
  readonly externalId: string | null;
  readonly active: boolean;
}

/** The PATCH `replace` operations WBS supports. */
export interface ScimUserChange {
  readonly active?: boolean;
  readonly externalId?: string | null;
  readonly userName?: string;
}

/**
 * Why a SCIM write was refused, in RFC 7644 terms:
 * - `not_found`: absent, or another organization's (one answer for both);
 * - `invalid_value`: the user name's domain has no connection here;
 * - `uniqueness`: the user name is already provisioned here;
 * - `mutability`: the user name of a bound record cannot change;
 * - `last_super_admin`: deprovisioning would leave no super-admin.
 */
export type ScimRefusal =
  'not_found' | 'invalid_value' | 'uniqueness' | 'mutability' | 'last_super_admin';

/** A filter the subset supports: `userName eq` or `externalId eq`. */
export type ScimUserFilter =
  | { readonly attribute: 'userName'; readonly value: string }
  | { readonly attribute: 'externalId'; readonly value: string };

/** One activation a sign-in or link completed. */
export interface PendingMembershipActivation {
  readonly organizationId: string;
  readonly scimUserId: string;
}

/**
 * SCIM users of the organization a provisioning token selected. Deprovisioning
 * (`active=false` or delete of a bound record) deletes that user's membership
 * in this organization only, with the same final-super-admin guard as a
 * super-admin removal, and writes the audit row, in one immediate transaction.
 * Membership deletion is the revocation: every resolution, delegation
 * verification and gateway lease rechecks current membership.
 *
 * @throws when trusted state is missing, unreadable or malformed.
 */
export interface ScimUsers {
  list(organizationId: string, filter: ScimUserFilter | null): Promise<readonly ScimUser[]>;
  find(organizationId: string, id: string): Promise<ScimUser | null>;
  provision(
    organizationId: string,
    id: string,
    draft: ScimUserDraft,
    act: AuditedAct,
  ): Promise<
    | { readonly kind: 'provisioned'; readonly user: ScimUser }
    | { readonly kind: 'invalid_value' | 'uniqueness' }
  >;
  update(
    organizationId: string,
    id: string,
    change: ScimUserChange,
    act: AuditedAct,
  ): Promise<
    { readonly kind: 'updated'; readonly user: ScimUser } | { readonly kind: ScimRefusal }
  >;
  remove(
    organizationId: string,
    id: string,
    act: AuditedAct,
  ): Promise<'deleted' | 'not_found' | 'last_super_admin'>;
  /**
   * Activates the pending membership a sign-in or link completes: the
   * authenticating pair carries the prefix of a proven connection, and the
   * canonical email equals a pending record's user name on that connection's
   * domain. Creates a `member` membership, or keeps an existing one's role,
   * binds the pair and writes one audit row per activation, together.
   */
  activate(
    userId: string,
    pair: { readonly issuer: string; readonly subject: string },
    canonicalEmail: string | null,
    act: Omit<AuditedAct, 'auditId'> & { readonly auditIds: () => string },
  ): Promise<readonly PendingMembershipActivation[]>;
}
