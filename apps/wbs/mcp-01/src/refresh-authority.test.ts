import { randomBytes } from 'node:crypto';

import { expect, it } from 'bun:test';

import { matchesRefreshAuthority } from './refresh-authority';
import { McpSessionStore } from './session-store';

it('refuses an authority whose consent credential differs from the family', () => {
  const store = new McpSessionStore(':memory:', [randomBytes(32)]);
  const now = Date.now();
  const consent = { personId: 'p-claire', credentialId: 'credential-claire' };
  store.recordPendingConsent('family-claire', consent.credentialId, now + 60_000);
  store.createFamily(
    {
      familyId: 'family-claire',
      clientId: 'client-1',
      subject: 'auth0|ada',
      scope: 'wbs:read',
      upstreamAccessToken: 'upstream',
      upstreamExpiresAt: now + 60_000,
      idleExpiresAt: now + 60_000,
      absoluteExpiresAt: now + 60_000,
      binding: { organizationId: 'org-a', userId: 'u-ada', issuer: 'https://idp.test/' },
      consent,
    },
    'session-claire',
    now + 60_000,
    'refresh-claire',
    now,
  );
  const family = store.family('family-claire');
  if (family?.binding === undefined) throw new Error('no bound family');
  const authority = { ...family, binding: family.binding };
  expect(matchesRefreshAuthority(authority, family)).toBe(true);
  expect(
    matchesRefreshAuthority(
      { ...authority, consent: { ...consent, credentialId: 'credential-other' } },
      family,
    ),
  ).toBe(false);
  expect(matchesRefreshAuthority({ ...authority, consent: undefined }, family)).toBe(false);
  store.close();
});
