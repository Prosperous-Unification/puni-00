import { describe, expect, it } from 'bun:test';

import { oidcIdentityFromClaims } from './oidc-identity';

describe('oidcIdentityFromClaims', () => {
  it('normalizes identity and maps only the selected environment groups', () => {
    expect(
      oidcIdentityFromClaims(
        {
          iss: 'https://issuer.example',
          sub: 'subject-1',
          email: 'DANY@PUNI.SHOW',
          email_verified: true,
          wbs_groups: [
            'dev:wbs:read',
            'dev:wbs:write',
            'dev:wbs:editor',
            'prod:wbs:write',
            'dev:other:write',
          ],
        },
        { groupPrefix: 'dev', groupsClaim: 'wbs_groups' },
      ),
    ).toEqual({
      issuer: 'https://issuer.example',
      subject: 'subject-1',
      email: 'dany@puni.show',
      emailVerified: true,
      scopes: ['read', 'write', 'editor'],
      groupsClaimed: true,
    });
  });

  it('does not trust email or groups with the wrong claim types', () => {
    expect(
      oidcIdentityFromClaims(
        {
          iss: 'https://issuer.example',
          sub: 'subject-1',
          email: 42,
          email_verified: 'true',
          custom_groups: 'dev:wbs:write',
        },
        { groupPrefix: 'dev', groupsClaim: 'custom_groups' },
      ),
    ).toEqual({
      issuer: 'https://issuer.example',
      subject: 'subject-1',
      email: null,
      emailVerified: false,
      scopes: [],
      groupsClaimed: true,
    });
  });

  it('rejects claims without an issuer or subject', () => {
    expect(() =>
      oidcIdentityFromClaims(
        { iss: 'https://issuer.example', wbs_groups: [] },
        { groupPrefix: 'dev', groupsClaim: 'wbs_groups' },
      ),
    ).toThrow('OIDC claims require string iss and sub');
  });

  it('rejects malformed email instead of normalizing it into an account key', () => {
    expect(
      oidcIdentityFromClaims(
        { iss: 'https://issuer.example', sub: 'subject-1', email: 'not-an-email' },
        { groupPrefix: 'dev', groupsClaim: 'wbs_groups' },
      ).email,
    ).toBeNull();
  });

  // Proof: answering true regardless made `refuses an unlinked machine token as
  // unknown_identity, minting no account` mint an account (watched 2026-10-20).
  it('tells a token without the groups claim from one with an empty claim', () => {
    const claims = { iss: 'https://issuer.example', sub: 'claire-m2m@clients' };
    const options = { groupPrefix: 'dev', groupsClaim: 'wbs_groups' };
    expect(oidcIdentityFromClaims(claims, options).groupsClaimed).toBe(false);
    expect(oidcIdentityFromClaims({ ...claims, wbs_groups: [] }, options).groupsClaimed).toBe(true);
  });
});
