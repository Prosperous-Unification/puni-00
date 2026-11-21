import type { InitialAccess, InitialAccessRole, Permission } from '@wbs/domain';

import type { SecurityPrincipal } from './security-principal';
import type { WriteStamp } from './write-stamp';

export type InvitationRefusal =
  | 'onboarding_inactive'
  | 'forbidden'
  | 'insufficient_scope'
  | 'not_found'
  | 'recipient_mismatch'
  | 'email_verification_required'
  | 'invitation_invalid';
export type InvitationAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: InvitationRefusal; readonly permission?: Permission };

/** Public addressed offer; token material, storage selection and compatibility role stay private. */
export interface InvitationSummary {
  readonly id: string;
  readonly email: string;
  readonly initialRoleId: InitialAccessRole | null;
  readonly expiresAt: number;
  readonly revokedAt: number | null;
  readonly consumedAt: number | null;
}

/** Personal offers and their current-grant admission share each existing mutation owner. */
export interface Invitation {
  list(
    organizationId: string,
    principal: SecurityPrincipal,
  ): Promise<InvitationAnswer<InvitationSummary[]>>;
  /** Retains principal, fresh selection and stamp before its queued immediate owner; P11 grants nothing until acceptance. */
  issue(
    organizationId: string,
    principal: SecurityPrincipal,
    email: string,
    initialAccess: InitialAccess,
    digest: string,
    expiresAt: number,
    stamp: WriteStamp,
  ): Promise<InvitationAnswer<InvitationSummary>>;
  /** Current manage_members cancels any pending offer; actual grants/members are untouched. */
  revoke(
    organizationId: string,
    principal: SecurityPrincipal,
    id: string,
    stamp: WriteStamp,
  ): Promise<InvitationAnswer<null>>;
  /** Internal delivery compensation owns only the just-issued offer, even if issuer authority changed afterward. */
  failDelivery(id: string, now: number): Promise<void>;
  /**
   * A personal recipient consumes under one immediate owner. The owner samples now
   * after acquiring the write lock and again after awaited issuer authorization;
   * its final completion time owns consumedAt, membership, new grant and audit stamps.
   * Historical issuance time/issuer stay unchanged. Existing membership receives no upgrade.
   * Durable personally issued provenance permits only the stored issuer account projection
   * for current P11 revalidation; no credential or recipient identity is substituted.
   * @throws on missing issuer/selection or trusted grant state, and any late audit failure.
   */
  accept(
    principal: SecurityPrincipal,
    digest: string,
    now: () => number,
  ): Promise<InvitationAnswer<{ readonly organizationId: string }>>;
}
