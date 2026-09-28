import { confirmEmailChallenge, createEmailChallenge } from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type { EmailDelivery } from '../ports/email-delivery';
import type { EmailVerification } from '../ports/email-verification';
import type { Digest } from '../ports/runtime';
import { bind, type HttpReply } from './endpoint';

/** Creates a 256-bit opaque token; the injected digest port hashes it for storage. */
function createToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** Mounted, activation-gated password email challenge endpoints. */
export function emailVerificationRoutes(
  verification: EmailVerification,
  delivery: EmailDelivery,
  clock: Pick<Clock, 'now'>,
  digest: Digest,
) {
  return [
    bind(
      createEmailChallenge,
      async ({ principal, body }): Promise<HttpReply<typeof createEmailChallenge>> => {
        // Proof: 2026-09-28, bypassing this guard failed `refuses delegated onboarding discovery and writes` on challenge issuance.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        const email = body.email.trim().toLowerCase();
        // Proof: 2026-09-28, bypassing syntax and ASCII checks separately failed
        // `rejects malformed addresses at both HTTP boundaries` on issuance.
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          !/^[\x21-\x7e]+$/.test(email) ||
          email.length > 254
        )
          return { ok: false, status: 400, body: { error: 'invalid_body' } };
        const token = createToken();
        // Proof: 2026-09-28, storing the raw token failed `keeps the password account ID after a delivered single-use challenge`.
        const answer = await verification.issue(
          principal.id,
          email,
          await digest.sha256(token),
          clock.now(),
        );
        if (!answer.ok) {
          switch (answer.refusal) {
            case 'onboarding_inactive':
              return { ok: false, status: 403, body: { error: 'onboarding_inactive' } };
            case 'password_account_required':
              return { ok: false, status: 403, body: { error: 'password_account_required' } };
            case 'address_conflict':
              return { ok: false, status: 409, body: { error: 'address_conflict' } };
            case 'challenge_invalid':
              throw new Error('issue returned a confirmation refusal');
          }
        }
        try {
          await delivery.deliver(email, token);
        } catch {
          // Proof: 2026-09-28, marking failed delivery as delivered failed `refuses failed delivery and address conflict without verifying either account`.
          await verification.recordDelivery(answer.value.id, false);
          return { ok: false, status: 503, body: { error: 'delivery_failed' } };
        }
        await verification.recordDelivery(answer.value.id, true);
        return { ok: true, status: 201, body: { expiresAt: answer.value.expiresAt } };
      },
    ),
    bind(
      confirmEmailChallenge,
      async ({ principal, body }): Promise<HttpReply<typeof confirmEmailChallenge>> => {
        // Proof: 2026-09-28, bypassing this guard failed `refuses delegated onboarding discovery and writes` on confirmation.
        if (principal.delegation !== undefined)
          return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
        const email = body.email.trim().toLowerCase();
        // Proof: 2026-09-28, bypassing syntax and ASCII checks separately failed
        // `rejects malformed addresses at both HTTP boundaries` on confirmation.
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          !/^[\x21-\x7e]+$/.test(email) ||
          email.length > 254
        )
          return { ok: false, status: 400, body: { error: 'invalid_body' } };
        const answer = await verification.confirm(
          principal.id,
          email,
          await digest.sha256(body.token),
          clock.now(),
        );
        if (!answer.ok) {
          switch (answer.refusal) {
            case 'onboarding_inactive':
              return { ok: false, status: 403, body: { error: 'onboarding_inactive' } };
            case 'password_account_required':
              return { ok: false, status: 403, body: { error: 'password_account_required' } };
            case 'address_conflict':
            case 'challenge_invalid':
              return { ok: false, status: 409, body: { error: answer.refusal } };
          }
        }
        return { ok: true, status: 200, body: answer.value };
      },
    ),
  ] as const;
}
