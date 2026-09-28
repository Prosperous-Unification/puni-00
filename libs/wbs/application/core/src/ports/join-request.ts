import type { WriteStamp } from './write-stamp';

/** Client-visible refusal words for join-request administration. */
export type JoinRequestRefusal =
  'onboarding_inactive' | 'forbidden' | 'not_found' | 'request_resolved' | 'domain_changed';

/** A decision or its typed refusal. */
export type JoinRequestAnswer<T> =
  { ok: true; value: T } | { ok: false; refusal: JoinRequestRefusal };

/** Public request fields; invitation token material remains private. */
export interface JoinRequestSummary {
  id: string;
  email: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: number;
}

/** Resolves requests under current authority and domain evidence in immediate transactions. */
export interface JoinRequest {
  list(organizationId: string, actorId: string): Promise<JoinRequestAnswer<JoinRequestSummary[]>>;
  approve(
    organizationId: string,
    actorId: string,
    id: string,
    role: 'viewer' | 'member',
    digest: string,
    expiresAt: number,
    stamp: WriteStamp,
  ): Promise<JoinRequestAnswer<{ invitationId: string; email: string }>>;
  deny(
    organizationId: string,
    actorId: string,
    id: string,
    stamp: WriteStamp,
  ): Promise<JoinRequestAnswer<null>>;
  /** Revokes a failed offer and reopens its request unless a newer request is pending. */
  failDelivery(id: string, invitationId: string, stamp: WriteStamp): Promise<void>;
}
