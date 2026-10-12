import { describe, expect, it } from 'bun:test';

import { carriesSubjectPrefix, subjectPrefixOf } from './enterprise-connections';

const acme = { strategy: 'samlp', auth0Connection: 'acme-saml' } as const;

describe('the subject prefix', () => {
  it('is the strategy and connection with the final bar', () => {
    expect(subjectPrefixOf(acme)).toBe('samlp|acme-saml|');
  });

  it('admits the fixture subject', () => {
    expect(carriesSubjectPrefix('samlp|acme-saml|alice@acme.test', acme)).toBe(true);
  });

  it('refuses a longer connection name sharing the prefix', () => {
    expect(carriesSubjectPrefix('samlp|acme-saml-2|alice@acme.test', acme)).toBe(false);
  });

  it('refuses another connection, another strategy, no connection and a social subject', () => {
    for (const subject of [
      'samlp|other|alice@acme.test',
      'oidc|acme-saml|alice@acme.test',
      'samlp|alice@acme.test',
      'google-oauth2|1',
      'samlp|acme-saml',
    ])
      expect(carriesSubjectPrefix(subject, acme)).toBe(false);
  });
});
