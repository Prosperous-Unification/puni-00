import type { InitialAccess, Permission } from '@wbs/domain';

import type { SecurityPrincipal } from './security-principal';
import type { WriteStamp } from './write-stamp';

/** Client-visible refusal words for join-request administration. */
export type JoinRequestRefusal =
  | 'onboarding_inactive'
  | 'forbidden'
  | 'insufficient_scope'
  | 'not_found'
  | 'request_resolved'
  | 'domain_changed';

/** A decision or its typed refusal. */
export type JoinRequestAnswer<T> =
  | { ok: true; value: T }
  | { ok: false; refusal: JoinRequestRefusal; readonly permission?: Permission };

/** Public request fields; invitation token material remains private. */
export interface JoinRequestSummary {
  id: string;
  email: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: number;
}

/** Resolves requests under current authority and domain evidence in immediate transactions. */
export interface JoinRequest {
  list(
    organizationId: string,
    principal: SecurityPrincipal,
  ): Promise<JoinRequestAnswer<JoinRequestSummary[]>>;
  approve(
    organizationId: string,
    principal: SecurityPrincipal,
    id: string,
    initialAccess: InitialAccess,
    digest: string,
    expiresAt: number,
    stamp: WriteStamp,
  ): Promise<JoinRequestAnswer<{ invitationId: string; email: string }>>;
  deny(
    organizationId: string,
    principal: SecurityPrincipal,
    id: string,
    stamp: WriteStamp,
  ): Promise<JoinRequestAnswer<null>>;
  /** Revokes a failed offer and reopens its request unless a newer request is pending. */
  failDelivery(id: string, invitationId: string, stamp: WriteStamp): Promise<void>;
}
