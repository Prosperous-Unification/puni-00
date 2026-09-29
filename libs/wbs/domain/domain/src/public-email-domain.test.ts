import { describe, expect, it } from 'bun:test';

import { isCanonicalDomain, isClaimableDomain } from './public-email-domain';
import reviewed from './public-email-policy.v1.json';

const policy = {
  revision: reviewed.revision,
  providers: new Set(reviewed.providers),
  relays: new Set(reviewed.relays),
  suffixes: new Set(reviewed.suffixes),
};

describe('isClaimableDomain', () => {
  // Proof: dropping the provider check made this receive true for every
  // provider; watched 2026-09-28.
  it('never lets a public mailbox provider be claimed', () => {
    for (const domain of ['gmail.com', 'outlook.com', 'proton.me', 'ukr.net', 'icloud.com'])
      expect(isClaimableDomain(domain, policy)).toBe(false);
  });

  // Proof: dropping the suffix check, then the single-label check, each made
  // this receive true; watched 2026-09-28.
  it('never lets a public suffix or a top-level domain be claimed', () => {
    for (const domain of ['co.uk', 'com.au', 'github.io', 'co.in', 'appspot.com', 'com', 'dev'])
      expect(isClaimableDomain(domain, policy)).toBe(false);
  });

  it('lets a company domain and its exact subdomain be claimed', () => {
    for (const domain of ['example.org', 'puni.dev', 'mail.example.org', 'example.co.uk'])
      expect(isClaimableDomain(domain, policy)).toBe(true);
  });

  // Proof: skipping the canonical check made this receive false instead of a
  // throw; watched 2026-09-28.
  it('throws on a domain that is not canonical', () => {
    for (const domain of [
      'Gmail.com',
      'gmail.com.',
      'gmail.com\n',
      '',
      'exa mple.org',
      'bücher.de',
      'xn--a.com',
    ])
      expect(() => isClaimableDomain(domain, policy)).toThrow('not canonical');
  });

  it('accepts IDNA-encoded labels as canonical', () => {
    expect(isCanonicalDomain('xn--bcher-kva.de')).toBe(true);
  });
});
