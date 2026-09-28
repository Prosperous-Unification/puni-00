import { canonicalDomain } from './public-email-domain';

/**
 * Why a submitted address has no canonical form. `smtputf8_required` is a
 * well-formed internationalized local part that WBS cannot deliver to, since
 * it sends only to ASCII mailboxes.
 */
export type EmailAddressRefusal = 'malformed' | 'smtputf8_required';

export type EmailAddressAnswer =
  | { readonly ok: true; readonly address: string }
  | { readonly ok: false; readonly refusal: EmailAddressRefusal };

/**
 * The one stored and delivered form of a submitted address.
 *
 * The domain goes through {@link canonicalDomain}, so an address at
 * `Bücher.example` names the claim on `xn--bcher-kva.example`. The local part is
 * NFC-normalised and otherwise kept byte-exact: no case folding and no dot or
 * plus stripping, because only the receiving host knows its mailbox rules. A
 * non-ASCII local part would need SMTPUTF8 and is refused. The whole canonical
 * address is at most 254 characters.
 *
 * Canonical forms are compared with {@link isSameMailbox}, not `===`.
 */
export function canonicalEmailAddress(submitted: string): EmailAddressAnswer {
  const trimmed = submitted.trim();
  const separator = trimmed.lastIndexOf('@');
  // Proof: 2026-09-28, skipping NFC made `NFC-normalises the local part before
  // judging it` refuse the Kelvin sign as smtputf8_required.
  const mailbox = trimmed.slice(0, separator).normalize('NFC');
  // Proof: 2026-09-28, checking only for a missing `@` made `refuses malformed
  // addresses and invalid domains` answer smtputf8_required, not malformed.
  if (separator <= 0 || /[\s@]/u.test(mailbox)) return { ok: false, refusal: 'malformed' };
  // Proof: 2026-09-28, bypassing this check made `refuses a local part that
  // would need SMTPUTF8` fail and mounted `rejects malformed addresses at both
  // HTTP boundaries` receive 201 instead of 400.
  if (!/^[\x21-\x7e]+$/.test(mailbox)) return { ok: false, refusal: 'smtputf8_required' };
  const domain = canonicalDomain(trimmed.slice(separator + 1));
  // Proof: 2026-09-28, admitting a null domain made `refuses malformed
  // addresses and invalid domains` fail and mounted `rejects malformed addresses
  // at both HTTP boundaries` receive 201; admitting a dotless one made the unit
  // test fail on its only dotless case, ada@bücher.
  if (!domain?.includes('.')) return { ok: false, refusal: 'malformed' };
  const address = `${mailbox}@${domain}`;
  // Proof: 2026-09-28, bypassing this limit made the unit malformed-address
  // test and mounted `rejects malformed recipient addresses and a super-admin
  // offer` accept a 256-character address (201).
  if (address.length > 254) return { ok: false, refusal: 'malformed' };
  return { ok: true, address };
}

/**
 * Whether two canonical addresses name one mailbox for ownership: equal after
 * lowercasing, exactly as the SQLite `users_email_normalized` index on
 * `lower(email)` decides. Canonical local parts are ASCII and domains are
 * lowercase A-labels, so JavaScript and SQLite `lower()` agree on them.
 */
export function isSameMailbox(left: string, right: string): boolean {
  // Proof: 2026-09-28, comparing exactly made `matches canonical addresses as
  // the SQLite lower(email) index does` and mounted `invites an
  // internationalized domain byte-exact and accepts its case-variant
  // recipient` fail (403 recipient_mismatch).
  return left.toLowerCase() === right.toLowerCase();
}
