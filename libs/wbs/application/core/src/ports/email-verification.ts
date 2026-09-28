export type EmailChallengeRefusal =
  'onboarding_inactive' | 'password_account_required' | 'address_conflict' | 'challenge_invalid';

export type EmailChallengeAnswer<T> =
  { ok: true; value: T } | { ok: false; refusal: EmailChallengeRefusal };

/** Stores address-bound challenges and consumes only delivered proofs atomically. */
export interface EmailVerification {
  issue(
    userId: string,
    email: string,
    digest: string,
    now: number,
  ): Promise<EmailChallengeAnswer<{ id: string; expiresAt: number }>>;
  recordDelivery(id: string, delivered: boolean): Promise<void>;
  confirm(
    userId: string,
    email: string,
    digest: string,
    now: number,
  ): Promise<EmailChallengeAnswer<{ email: string; verified: true }>>;
}
