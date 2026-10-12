import { describe, expect, it } from 'bun:test';

import { type CredentialRuleFacts, credentialRuleRefusal } from './credential-rules';

const OPENED = Date.UTC(2026, 9, 12, 8);
const none: CredentialRuleFacts = { enforced: [], policy: null, lifecycle: null };
const enforcing: CredentialRuleFacts = {
  ...none,
  enforced: [{ prefix: 'samlp|acme-saml|', loginSlug: 'acme' }],
};
const sso = {
  kind: 'upstream',
  issuer: 'https://idp.test/',
  subject: 'samlp|acme-saml|m',
} as const;
const social = {
  kind: 'upstream',
  issuer: 'https://idp.test/',
  subject: 'google-oauth2|7',
} as const;
const browser = { authentication: sso, delegated: false };

describe('the credential rules', () => {
  it('admit anyone in an organization with neither enforcement nor policy', () => {
    expect(credentialRuleRefusal('org-a', none, { delegated: false }, OPENED)).toBeNull();
  });

  it('admit an identity carrying the enforced prefix', () => {
    expect(credentialRuleRefusal('org-a', enforcing, browser, OPENED)).toBeNull();
  });

  it('refuse a social identity in an enforced organization', () => {
    expect(
      credentialRuleRefusal('org-a', enforcing, { authentication: social, delegated: false }, 1),
    ).toEqual({
      refusal: 'sso_required',
      organizationId: 'org-a',
      login: '/api/auth/login?organization=acme',
      link: true,
    });
  });

  it('refuse a password session, a direct context and a longer connection name', () => {
    for (const credential of [
      { authentication: { kind: 'first_party', issuedAt: 1 } as const, delegated: false },
      { delegated: true },
      {
        authentication: { ...sso, subject: 'samlp|acme-saml-2|m' },
        delegated: false,
      },
    ])
      expect(credentialRuleRefusal('org-a', enforcing, credential, 1)?.refusal).toBe(
        'sso_required',
      );
  });

  it('admit a delegation carrying the prefix when there is no policy', () => {
    expect(
      credentialRuleRefusal('org-a', enforcing, { ...browser, delegated: true }, 1),
    ).toBeNull();
  });

  describe('under a session policy', () => {
    const facts = (lifecycle: CredentialRuleFacts['lifecycle']): CredentialRuleFacts => ({
      ...none,
      policy: { maxSessionSeconds: 28_800, reauthenticateAfterSeconds: 3_600 },
      lifecycle,
    });
    const fresh = facts({ openedAt: OPENED, reauthenticatedAt: OPENED + 28_000_000 });

    it('admits the exact bound and refuses one millisecond more', () => {
      expect(credentialRuleRefusal('org-a', fresh, browser, OPENED + 28_800_000)).toBeNull();
      expect(credentialRuleRefusal('org-a', fresh, browser, OPENED + 28_800_001)).toMatchObject({
        refusal: 'reauthentication_required',
        reason: 'max_session',
        login: '/api/auth/login?reauthenticate=org-a',
      });
      const reauthenticated = facts({ openedAt: OPENED, reauthenticatedAt: OPENED });
      expect(
        credentialRuleRefusal('org-a', reauthenticated, browser, OPENED + 3_600_000),
      ).toBeNull();
      expect(
        credentialRuleRefusal('org-a', reauthenticated, browser, OPENED + 3_600_001),
      ).toMatchObject({ reason: 'reauthenticate_after' });
    });

    it('refuses an unknown time', () => {
      for (const lifecycle of [
        null,
        { openedAt: null, reauthenticatedAt: OPENED },
        { openedAt: OPENED, reauthenticatedAt: null },
      ])
        expect(credentialRuleRefusal('org-a', facts(lifecycle), browser, OPENED + 1)?.refusal).toBe(
          'reauthentication_required',
        );
    });

    it('reads a password session times from its issue', () => {
      const password = { authentication: { kind: 'first_party', issuedAt: OPENED } as const };
      expect(
        credentialRuleRefusal('org-a', facts(null), { ...password, delegated: false }, OPENED + 1),
      ).toBeNull();
      expect(
        credentialRuleRefusal(
          'org-a',
          facts(null),
          { ...password, delegated: false },
          OPENED + 3_600_001,
        ),
      ).toMatchObject({ reason: 'reauthenticate_after' });
    });

    it('refuses a delegation, which carries no authentication time yet', () => {
      expect(
        credentialRuleRefusal('org-a', fresh, { ...browser, delegated: true }, OPENED + 1)?.refusal,
      ).toBe('reauthentication_required');
    });
  });
});
