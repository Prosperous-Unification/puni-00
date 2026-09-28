import type { EmailAddressRefusal } from '@wbs/domain';

/** The typed 400 for each {@link EmailAddressRefusal}. */
export function refusedAddress(refusal: EmailAddressRefusal) {
  // Proof: 2026-09-28, answering invalid_body here made mounted `rejects
  // malformed addresses at both HTTP boundaries` and `rejects malformed
  // recipient addresses and a super-admin offer` receive invalid_body.
  if (refusal === 'smtputf8_required')
    return { ok: false, status: 400, body: { error: 'unsupported_email' } } as const;
  return { ok: false, status: 400, body: { error: 'invalid_body' } } as const;
}
