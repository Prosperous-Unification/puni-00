/**
 * Mailbox providers whose addresses anyone can register, reviewed 2026-09-28.
 *
 * A snapshot rather than a fetched list, so a claim decision never depends on
 * the network. It is deliberately short: the providers that account for
 * nearly all personal sign-ups. Importing a maintained list (for example the
 * MIT-licensed `free-email-domains`) with its revision and checksum is
 * follow-up work for tasks 5.x; until then a provider missing here can be
 * claimed only after DNS proof of the domain, which a free-mail user cannot
 * produce.
 */
const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'aol.com',
  'fastmail.com',
  'gmail.com',
  'gmx.com',
  'gmx.de',
  'gmx.net',
  'googlemail.com',
  'hey.com',
  'hotmail.com',
  'hotmail.co.uk',
  'icloud.com',
  'inbox.ru',
  'live.com',
  'mac.com',
  'mail.com',
  'mail.ru',
  'me.com',
  'msn.com',
  'outlook.com',
  'pm.me',
  'proton.me',
  'protonmail.com',
  'qq.com',
  'rambler.ru',
  'tutanota.com',
  'ukr.net',
  'web.de',
  'yahoo.co.uk',
  'yahoo.com',
  'yandex.com',
  'yandex.ru',
  'zoho.com',
]);

/**
 * Multi-label public suffixes under which anyone can register a name,
 * reviewed 2026-09-28 against the Public Suffix List. A single label (a
 * top-level domain) is always public, so only suffixes of two labels or more
 * are listed.
 */
const PUBLIC_SUFFIXES: ReadonlySet<string> = new Set([
  'co.jp',
  'co.nz',
  'co.uk',
  'co.za',
  'com.au',
  'com.br',
  'com.cn',
  'com.mx',
  'com.tr',
  'com.ua',
  'github.io',
  'gov.uk',
  'kiev.ua',
  'net.au',
  'org.au',
  'org.uk',
]);

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Whether `domain` is a canonical host name: lowercase ASCII (IDNA already
 * applied), labels of letters, digits and inner hyphens, no trailing dot, at
 * most 253 characters.
 */
export function isCanonicalDomain(domain: string): boolean {
  if (domain.length === 0 || domain.length > 253) return false;
  return domain.split('.').every((label) => LABEL.test(label));
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
 * @throws when `domain` is not canonical: the caller must canonicalize (IDNA,
 * lowercase) at its boundary, and a raw value here is a programming error.
 */
export function isClaimableDomain(domain: string): boolean {
  if (!isCanonicalDomain(domain)) throw new Error(`domain is not canonical: ${domain}`);
  if (!domain.includes('.')) return false;
  return !PUBLIC_EMAIL_DOMAINS.has(domain) && !PUBLIC_SUFFIXES.has(domain);
}
