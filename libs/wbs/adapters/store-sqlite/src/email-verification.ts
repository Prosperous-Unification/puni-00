import type { EmailChallengeAnswer, EmailVerification } from '@wbs/core';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnUpdate } from './audit';
import type { Gate } from './gate';
import { readOrganizationActivation } from './organization-activation';
import { emailChallenge, externalIdentity, users } from './schema';

/** SQLite challenge state, including a second immediate transaction after delivery. */
export class EmailVerificationRepository implements EmailVerification {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /** Issues one 30-minute challenge for a password-only account. */
  async issue(
    userId: string,
    email: string,
    digest: string,
    now: number,
  ): Promise<EmailChallengeAnswer<{ id: string; expiresAt: number }>> {
    return this.gate.enter(async () =>
      Promise.resolve(
        this.db.transaction(
          (tx) => {
            // Proof: 2026-09-28, bypassing this marker failed `refuses inactive writes and unauthenticated or delegated callers`.
            if (readOrganizationActivation(tx) !== 'activated')
              return { ok: false, refusal: 'onboarding_inactive' };
            const account = tx
              .select({ passwordHash: users.passwordHash })
              .from(users)
              .where(eq(users.id, userId))
              .get();
            if (account === undefined) throw new Error(`signed-in user ${userId} is absent`);
            // Proof: 2026-09-28, bypassing the password predicate or mapping the
            // external identity lookup to another user separately failed
            // `requires a password account and checks activation on confirmation`.
            if (
              account.passwordHash === null ||
              tx
                .select({ userId: externalIdentity.userId })
                .from(externalIdentity)
                .where(eq(externalIdentity.userId, userId))
                .get() !== undefined
            )
              return { ok: false, refusal: 'password_account_required' };
            // Proof: 2026-09-28, querying another address or omitting lower()
            // separately failed `refuses failed delivery and address conflict without verifying either account`.
            if (
              tx
                .select({ id: users.id })
                .from(users)
                .where(and(sql`lower(${users.email}) = ${email}`, ne(users.id, userId)))
                .get() !== undefined
            )
              return { ok: false, refusal: 'address_conflict' };
            // Proof: 2026-09-28, writing NULL instead of a revocation failed `revokes an earlier challenge when another is issued`.
            tx.update(emailChallenge)
              .set({ revokedAt: now })
              .where(and(eq(emailChallenge.userId, userId), isNull(emailChallenge.revokedAt)))
              .run();
            const id = crypto.randomUUID();
            const expiresAt = now + 30 * 60 * 1000;
            tx.insert(emailChallenge)
              .values({
                id,
                userId,
                email,
                tokenDigest: digest,
                expiresAt,
                deliveryState: 'pending',
                createdAt: now,
              })
              .run();
            return { ok: true, value: { id, expiresAt } };
          },
          { behavior: 'immediate' },
        ),
      ),
    );
  }

  /** Records the sink outcome; failed delivery can never confirm. */
  async recordDelivery(id: string, delivered: boolean): Promise<void> {
    await this.gate.enter(() => {
      this.db.transaction(
        (tx) => {
          const changed = tx
            .update(emailChallenge)
            .set({ deliveryState: delivered ? 'delivered' : 'failed' })
            .where(and(eq(emailChallenge.id, id), eq(emailChallenge.deliveryState, 'pending')))
            .run();
          // Proof: 2026-09-28, deleting the pending row from the injected sink
          // then bypassing this count failed `throws when the pending challenge disappears during injected delivery`.
          if (changed.changes !== 1) throw new Error(`challenge ${id} lost pending delivery state`);
        },
        { behavior: 'immediate' },
      );
      return Promise.resolve();
    });
  }

  /** Consumes a delivered, current, address-bound proof in the same write as the user update. Reads time after acquiring the SQLite write lock. */
  async confirm(
    userId: string,
    email: string,
    digest: string,
    now: () => number,
  ): Promise<EmailChallengeAnswer<{ email: string; verified: true }>> {
    return this.gate.enter(async () =>
      Promise.resolve(
        this.db.transaction(
          (tx) => {
            // Proof: 2026-09-28, sampling before BEGIN IMMEDIATE made
            // `refuses a challenge that expires while confirmation waits for a separate writer`
            // return 200 after the lock holder advanced expiry past that sample.
            const checkedAt = now();
            // Proof: 2026-09-28, bypassing this marker failed `requires a password account and checks activation on confirmation`.
            if (readOrganizationActivation(tx) !== 'activated')
              return { ok: false, refusal: 'onboarding_inactive' };
            const account = tx
              .select({ passwordHash: users.passwordHash })
              .from(users)
              .where(eq(users.id, userId))
              .get();
            if (account === undefined) throw new Error(`signed-in user ${userId} is absent`);
            // Proof: 2026-09-28, bypassing the password predicate or mapping the
            // external identity lookup to another user separately failed
            // `requires a password account and checks activation on confirmation`.
            if (
              account.passwordHash === null ||
              tx
                .select({ userId: externalIdentity.userId })
                .from(externalIdentity)
                .where(eq(externalIdentity.userId, userId))
                .get() !== undefined
            )
              return { ok: false, refusal: 'password_account_required' };
            const challenge = tx
              .select()
              .from(emailChallenge)
              .where(eq(emailChallenge.tokenDigest, digest))
              .get();
            // Proof: 2026-09-28, accepting pending delivery, bypassing the user
            // binding, requested-address binding, expiry, revocation or
            // consumption separately failed the mounted mismatch, pending,
            // wrong-account, reissue and sequential replay cases.
            if (
              challenge?.userId !== userId ||
              challenge.email !== email ||
              challenge.deliveryState !== 'delivered' ||
              challenge.consumedAt !== null ||
              challenge.revokedAt !== null ||
              challenge.expiresAt <= checkedAt
            )
              return { ok: false, refusal: 'challenge_invalid' };
            // Proof: 2026-09-28, bypassing this collision read or omitting
            // lower() failed `rechecks address ownership when confirming after another account adopts it`.
            if (
              tx
                .select({ id: users.id })
                .from(users)
                .where(and(sql`lower(${users.email}) = ${challenge.email}`, ne(users.id, userId)))
                .get() !== undefined
            )
              return { ok: false, refusal: 'address_conflict' };
            tx.update(emailChallenge)
              .set({ consumedAt: checkedAt })
              .where(eq(emailChallenge.id, challenge.id))
              .run();
            // Proof: 2026-09-28, an abort trigger on this update left
            // consumption uncommitted; omitting this update failed both the
            // mounted ID-preservation and rollback tests.
            tx.update(users)
              // Proof: 2026-09-28, omitting auditOnUpdate left updated_at at 1
              // and failed `keeps the password account ID after a delivered single-use challenge`.
              .set({
                email: challenge.email,
                emailVerified: true,
                ...auditOnUpdate({ at: checkedAt }),
              })
              .where(eq(users.id, userId))
              .run();
            return { ok: true, value: { email: challenge.email, verified: true } };
          },
          // Proof: 2026-09-28, replacing IMMEDIATE with DEFERRED and holding
          // both readers after challenge lookup made `serializes competing address
          // confirmations across processes` fail when a worker exited on SQLITE_BUSY.
          { behavior: 'immediate' },
        ),
      ),
    );
  }
}
