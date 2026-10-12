import type { AuditedAct } from './organization-audit';

/** At most this many live provisioning tokens per organization (Auth0's rotation model). */
export const MOST_LIVE_PROVISIONING_TOKENS = 2;

/** How long a rotated token keeps authenticating beside its successor. */
export const PROVISIONING_ROTATION_OVERLAP_MS = 24 * 60 * 60 * 1000;

/** A provisioning token as a super-admin lists it: never its secret or digest. */
export interface ProvisioningTokenSummary {
  readonly id: string;
  readonly createdAt: number;
  readonly expiresAt: number | null;
  readonly revokedAt: number | null;
}

/** The organization a live token selects, and who issued it (the row stamp's author). */
export interface AuthenticatedProvisioning {
  readonly tokenId: string;
  readonly organizationId: string;
  readonly issuedBy: string;
}

/**
 * Per-organization SCIM provisioning tokens (`organization-scim`). Only a
 * SHA-256 digest reaches the store. A token is live at `at` when it is not
 * revoked and has no expiry or one later than `at`. Every write rechecks
 * activation and the actor's super-admin role and writes its audit row in one
 * immediate transaction.
 *
 * @throws when trusted state is missing, unreadable or malformed.
 */
export interface ProvisioningTokens {
  list(
    organizationId: string,
    actorId: string,
  ): Promise<readonly ProvisioningTokenSummary[] | 'inactive' | 'forbidden'>;
  /** Refused without a proven connection, or when two tokens are live at `act.stamp.at`. */
  issue(
    organizationId: string,
    actorId: string,
    id: string,
    digest: string,
    act: AuditedAct,
  ): Promise<
    | { readonly kind: 'issued'; readonly token: ProvisioningTokenSummary }
    | { readonly kind: 'inactive' | 'forbidden' | 'sso_connection_unproven' | 'token_limit' }
  >;
  /**
   * Issues a successor and makes `tokenId` expire {@link PROVISIONING_ROTATION_OVERLAP_MS}
   * after `act.stamp.at`. Refused when that would leave more than two live.
   */
  rotate(
    organizationId: string,
    actorId: string,
    tokenId: string,
    successorId: string,
    successorDigest: string,
    act: AuditedAct,
  ): Promise<
    | { readonly kind: 'rotated'; readonly token: ProvisioningTokenSummary }
    | {
        readonly kind:
          'inactive' | 'forbidden' | 'not_found' | 'sso_connection_unproven' | 'token_limit';
      }
  >;
  /** Immediate; a token already revoked or expired is `not_found`. */
  revoke(
    organizationId: string,
    actorId: string,
    tokenId: string,
    act: AuditedAct,
  ): Promise<'revoked' | 'inactive' | 'forbidden' | 'not_found'>;
  /** The live token with `digest` at `at`; null for every other case alike. */
  authenticate(digest: string, at: number): Promise<AuthenticatedProvisioning | null>;
}
