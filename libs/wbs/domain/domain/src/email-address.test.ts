import { describe, expect, it } from 'bun:test';

import { canonicalEmailAddress, isSameMailbox } from './email-address';
import { canonicalDomain } from './public-email-domain';

describe('canonicalDomain', () => {
  it('applies UTS #46 non-transitional processing to lowercase A-labels', () => {
    expect(canonicalDomain('Bücher.example')).toBe('xn--bcher-kva.example');
    expect(canonicalDomain('Bücher.example')).toBe('xn--bcher-kva.example');
    expect(canonicalDomain('faß.de')).toBe('xn--fa-hia.de');
    expect(canonicalDomain('ς.example')).toBe('xn--3xa.example');
    expect(canonicalDomain('ＥＸＡＭＰＬＥ．org')).toBe('example.org');
    expect(canonicalDomain('xn--BCHER-kva.example')).toBe('xn--bcher-kva.example');
  });

  it('refuses invalid IDNA labels, addresses and URL-shaped input', () => {
    for (const domain of [
      'xn--a.example',
      'a‍b.example',
      '-bad.example',
      'a_b.example',
      'a..b.example',
      '127.0.0.1',
      '0x7f.1',
      '%65xample.com',
      'example.com\\evil.com',
      'http://example.org',
      'exa mple.org',
      '',
    ])
      expect(canonicalDomain(domain)).toBeNull();
  });
});

describe('canonicalEmailAddress', () => {
  it('keeps the local part byte-exact and canonicalizes the domain', () => {
    expect(canonicalEmailAddress(' Ada.Lovelace+wbs@Bücher.example ')).toEqual({
      ok: true,
      address: 'Ada.Lovelace+wbs@xn--bcher-kva.example',
    });
    expect(canonicalEmailAddress('A.B+c@faß.de')).toEqual({
      ok: true,
      address: 'A.B+c@xn--fa-hia.de',
    });
  });

  it('refuses a local part that would need SMTPUTF8', () => {
    for (const email of [
      '\u00e9tienne@example.org',
      'e\u0301tienne@example.org',
      '\u7528\u6237@example.org',
    ])
      expect(canonicalEmailAddress(email)).toEqual({ ok: false, refusal: 'smtputf8_required' });
  });

  it('NFC-normalises the local part before judging it', () => {
    expect(canonicalEmailAddress('\u212a@example.org')).toEqual({
      ok: true,
      address: 'K@example.org',
    });
  });

  it('refuses malformed addresses and invalid domains', () => {
    for (const email of [
      'missing-at',
      '@example.org',
      'ada@',
      'a b@example.org',
      'a@b@example.org',
      'ada@xn--a.example',
      'ada@-bad.example',
      'ada@localhost',
      'ada@bücher',
      'ada@127.0.0.1',
      'ada@%65xample.org',
      `${'a'.repeat(250)}@x.org`,
    ])
      expect(canonicalEmailAddress(email)).toEqual({ ok: false, refusal: 'malformed' });
  });
});

describe('isSameMailbox', () => {
  it('matches canonical addresses as the SQLite lower(email) index does', () => {
    expect(isSameMailbox('Ada@xn--bcher-kva.example', 'ada@xn--bcher-kva.example')).toBe(true);
    expect(isSameMailbox('ada+x@example.org', 'ada@example.org')).toBe(false);
    expect(isSameMailbox('a.da@example.org', 'ada@example.org')).toBe(false);
  });
});
