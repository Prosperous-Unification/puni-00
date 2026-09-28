import { normalizeEmail } from '@wbs/auth';
import { isCanonicalDomain } from '@wbs/domain';

/** Rejects URL-shaped domains before normalizing an activated OIDC address to ASCII IDNA. */
export function canonicalOidcEmail(email: string | null): string | null {
  if (email === null) return null;
  const normalized = normalizeEmail(email);
  if (normalized === null) return null;
  const separator = normalized.lastIndexOf('@');
  const mailbox = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
  // Proof: 2026-09-28, skipping this check made `does not route a URL-shaped
  // callback email to a claimed organization` admit a path as a domain.
  if (!/^[\p{L}\p{M}\p{N}.-]+$/u.test(domain)) return null;
  let host: string;
  try {
    // Proof: 2026-09-28, retaining the Unicode domain here failed `stores
    // activated OIDC domains in canonical ASCII IDNA form`.
    host = new URL(`http://${domain}`).hostname;
  } catch {
    return null;
  }
  if (!isCanonicalDomain(host)) return null;
  return `${mailbox}@${host}`;
}
