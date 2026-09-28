import { getPublicSuffix } from 'tldts';

/** A reviewed policy revision. Store adapters must verify its manifest before use. */
export interface PublicEmailPolicy {
  readonly revision: string;
  readonly providers: ReadonlySet<string>;
  readonly relays: ReadonlySet<string>;
  readonly suffixes: ReadonlySet<string>;
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Whether `domain` is a canonical host name: lowercase ASCII (IDNA already
 * applied), labels of letters, digits and inner hyphens, no trailing dot, at
 * most 253 characters, and a valid IDNA form — the WHATWG URL host parser
 * gives it back unchanged, so a malformed A-label such as `xn--a` is refused.
 */
export function isCanonicalDomain(domain: string): boolean {
  if (domain.length === 0 || domain.length > 253) return false;
  if (!domain.split('.').every((label) => LABEL.test(label))) return false;
  // Proof: skipping this round trip made `throws on a domain that is not
  // canonical` accept `xn--a.com`; watched 2026-09-28.
  return URL.canParse(`http://${domain}`) && new URL(`http://${domain}`).hostname === domain;
}

/**
 * Turns a submitted host into the one exact DNS name domain claims and email
 * addresses share, or `null` when it is not a DNS name.
 *
 * Mapping is the WHATWG URL host parser's UTS #46 processing: non-transitional
 * (`faß.de` becomes `xn--fa-hia.de`, not `fass.de`), NFC, width and case
 * folded, punycoded to lowercase A-labels. The parser skips STD3 and hyphen
 * checks and decodes `%` escapes, so URL delimiters, `%` and `\` are refused
 * before it runs and {@link isCanonicalDomain} judges what it returns. One
 * trailing dot is dropped; IPv4 literals and single ASCII labels are refused.
 */
export function canonicalDomain(submitted: string): string | null {
  const raw = submitted.trim().replace(/\.$/, '');
  // Proof: 2026-09-28, allowing `%` or `\\` separately made mounted
  // `canonicalizes exact IDNA names and refuses malformed, provider, relay and
  // suffix domains` accept a rewritten host with 201 instead of 400. Re-observed
  // after the move here: allowing `%` made that test answer 201 and
  // `refuses invalid IDNA labels, addresses and URL-shaped input` return example.com.
  if (!/^[^\s:/?#@%\\]+$/.test(raw)) return null;
  const host = URL.parse(`http://${raw}`)?.hostname;
  if (host === undefined) return null;
  if (/^\d+(?:\.\d+){3}$/.test(host) || (host === raw && !host.includes('.'))) return null;
  // Proof: 2026-09-28, returning the parsed host unjudged made `refuses invalid
  // IDNA labels, addresses and URL-shaped input` return -bad.example and mounted
  // `rejects malformed addresses at both HTTP boundaries` issue 201.
  return isCanonicalDomain(host) ? host : null;
}

/**
 * Whether an organization may ever claim `domain` as its own (tasks 5.x) and
 * route sign-ups by it (4.3). Never for a public mailbox provider, a public
 * suffix or a top-level domain, whose addresses belong to no organization.
 *
 * Only the exact domain is judged: a subdomain of a claimable domain is its
 * own claim. A person with an address at a public provider can still create
 * an organization; creation claims nothing.
 *
 * The caller must supply a validated policy. Store adapters use
 * `loadPublicEmailPolicy`; maintenance is in `docs/runbook-public-email-policy.md`.
 *
 * @throws when `domain` is not canonical: the caller must canonicalize (IDNA,
 * lowercase) at its boundary, and a raw value here is a programming error.
 */
export function isClaimableDomain(domain: string, policy: PublicEmailPolicy): boolean {
  if (!isCanonicalDomain(domain)) throw new Error(`domain is not canonical: ${domain}`);
  if (!domain.includes('.')) return false;
  // The pinned tldts 7.4.12 PSL includes ICANN and private suffixes; the
  // checked asset remains an additional reviewed deny rule.
  // Proof: 2026-09-28, bypassing this comparison made `never lets a public
  // suffix or a top-level domain be claimed` admit co.in and appspot.com.
  if (getPublicSuffix(domain, { allowPrivateDomains: true }) === domain) return false;
  // Proof: 2026-09-28, bypassing provider and relay separately made the
  // mounted `canonicalizes exact IDNA` test issue gmail.com or Apple relay;
  // bypassing the suffix override made `honors a checked suffix override
  // beyond the pinned PSL` issue shared-mail.example.org.
  return (
    !policy.providers.has(domain) && !policy.relays.has(domain) && !policy.suffixes.has(domain)
  );
}
