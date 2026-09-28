import { canonicalEmailAddress } from '@wbs/domain';

/**
 * An activated OIDC address in the password path's canonical form
 * ({@link canonicalEmailAddress}), then lowercased: activated OIDC rows have
 * always been stored fully lowercase and are matched with `lower(email) = ?`.
 * Addresses the password path refuses (SMTPUTF8 local parts, URL-shaped,
 * dotless or invalid IDNA domains) have no address here either.
 *
 * The pre-activation legacy lookup in `UserRepository` still uses
 * `normalizeEmail` so existing Auth0 rows keep resolving until activation.
 */
export function canonicalOidcEmail(email: string | null): string | null {
  if (email === null) return null;
  const canonical = canonicalEmailAddress(email);
  // Proof: 2026-09-29, returning the lowercased submitted address instead made
  // all three `stores no address for …` cases and all five `does not route a
  // URL-shaped callback email …` cases store an address (23 pass, 8 fail).
  if (!canonical.ok) return null;
  // Proof: 2026-09-29, dropping this lowercase made `stores activated OIDC
  // domains in canonical ASCII IDNA form` store `Ada@xn--bcher-kva.example`, and
  // the `lower(email) = ?` holder checks missed a verified-email collision.
  return canonical.address.toLowerCase();
}
