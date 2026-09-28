import type { OrganizationRole } from '@wbs/domain';

import type { WriteStamp } from './write-stamp';

export type InvitationRefusal =
  | 'onboarding_inactive'
  | 'forbidden'
  | 'not_found'
  | 'recipient_mismatch'
  | 'email_verification_required'
  | 'invitation_invalid';

export type InvitationAnswer<T> =
  { ok: true; value: T } | { ok: false; refusal: InvitationRefusal };

export interface InvitationSummary {
  id: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  expiresAt: number;
  revokedAt: number | null;
  consumedAt: number | null;
}

/** Invitation operations recheck activation and mutable authority inside their SQLite transactions. */
export interface Invitation {
  list(organizationId: string, actorId: string): Promise<InvitationAnswer<InvitationSummary[]>>;
  issue(
    organizationId: string,
    actorId: string,
    email: string,
    role: InvitationSummary['role'],
    digest: string,
    expiresAt: number,
    stamp: WriteStamp,
  ): Promise<InvitationAnswer<InvitationSummary>>;
  revoke(
    organizationId: string,
    actorId: string,
    id: string,
    stamp: WriteStamp,
  ): Promise<InvitationAnswer<null>>;
  /** Marks an unsent invitation unusable after the injected delivery port throws. */
  failDelivery(id: string, now: number): Promise<void>;
  accept(
    userId: string,
    digest: string,
    stamp: WriteStamp,
  ): Promise<InvitationAnswer<{ organizationId: string; role: OrganizationRole }>>;
}
