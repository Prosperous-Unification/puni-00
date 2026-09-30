import { expect, it } from 'bun:test';
import { generateKeyPair, jwtVerify } from 'jose';

import { delegationIssuer } from './delegation-issuer';

it('caps a verified source to five minutes and its credential expiry', async () => {
  const keys = await generateKeyPair('RS256');
  const issue = delegationIssuer(
    keys.privateKey,
    (credential) => {
      if (credential === 'long') return Promise.resolve(source);
      if (credential === 'short')
        return Promise.resolve({ ...source, credentialExpiresAt: 1_090_000 });
      throw new Error('unknown credential');
    },
    () => Promise.resolve(true),
    () => 1_000_000,
  );
  const source = {
    kind: 'verified-wbs-credential',
    delegated: false,
    credentialExpiresAt: 1_500_000,
    userId: 'ada',
    organizationId: 'org-a',
    client: 'client',
    grant: 'family',
    upstreamIssuer: 'https://idp.test',
    upstreamSubject: 'ada',
    scopeCeiling: ['read', 'write'],
  } as const;
  const token = await issue('long', 'wbs-be-01/via-gw-01', ['read']);
  const verified = await jwtVerify(token, keys.publicKey, { currentDate: new Date(1_000_000) });
  expect(verified.payload.exp! - verified.payload.iat!).toBe(300);
  expect(verified.payload.aud).toBe('wbs-be-01/via-gw-01');
  expect(verified.payload['scope']).toBe('read');
  const shorter = await issue('short', 'wbs-be-01/via-mcp-01', ['read', 'write']);
  const shortClaims = await jwtVerify(shorter, keys.publicKey, {
    currentDate: new Date(1_000_000),
  });
  expect(shortClaims.payload.exp! - shortClaims.payload.iat!).toBe(90);
  expect(shortClaims.payload['scope']).toBe('read write');
  expect(shortClaims.payload.jti).not.toBe(verified.payload.jti);
});

it('refuses delegated, expired, unbound, over-scoped or nonmember sources', async () => {
  const keys = await generateKeyPair('RS256');
  const source = {
    kind: 'verified-wbs-credential' as const,
    delegated: false,
    credentialExpiresAt: 1_100_000,
    userId: 'ada',
    organizationId: 'org-a',
    client: 'client',
    grant: 'family',
    upstreamIssuer: 'issuer',
    upstreamSubject: 'subject',
    scopeCeiling: ['read', 'write'] as const,
  };
  const issue = delegationIssuer(
    keys.privateKey,
    (credential) => Promise.resolve(JSON.parse(credential)),
    () => Promise.resolve(true),
    () => 1_000_000,
  );
  for (const blocked of [
    { ...source, delegated: true },
    { ...source, credentialExpiresAt: 1_000_000 },
    { ...source, upstreamSubject: '' },
    { ...source, organizationId: '' },
  ]) {
    let failure: unknown;
    try {
      await issue(JSON.stringify(blocked), 'wbs-be-01/via-mcp-01', ['read']);
    } catch (caught) {
      failure = caught;
    }
    expect(failure).toBeInstanceOf(Error);
  }
  let scopeFailure: unknown;
  try {
    await issue(JSON.stringify(source), 'wbs-be-01/via-mcp-01', ['editor']);
  } catch (caught) {
    scopeFailure = caught;
  }
  expect(scopeFailure).toBeInstanceOf(Error);
  const nonmember = delegationIssuer(
    keys.privateKey,
    (credential) => Promise.resolve(JSON.parse(credential)),
    () => Promise.resolve(false),
    () => 1_000_000,
  );
  let membershipFailure: unknown;
  try {
    await nonmember(JSON.stringify(source), 'wbs-be-01/via-mcp-01', ['read']);
  } catch (caught) {
    membershipFailure = caught;
  }
  expect(membershipFailure).toBeInstanceOf(Error);
});

it('refuses forged source claims before signing', async () => {
  const keys = await generateKeyPair('RS256');
  const issue = delegationIssuer(
    keys.privateKey,
    () => Promise.reject(new Error('credential was not verified')),
    () => Promise.resolve(true),
    () => 1_000_000,
  );
  const forged = {
    kind: 'verified-wbs-credential',
    delegated: false,
    credentialExpiresAt: 1_100_000,
    userId: 'ada',
    organizationId: 'org-a',
    client: 'client',
    grant: 'family',
    upstreamIssuer: 'issuer',
    upstreamSubject: 'subject',
    scopeCeiling: ['read'],
  };
  // Runtime callers can lie about TypeScript types; only the resolver may establish claims.
  let failure: unknown;
  try {
    await issue(forged as unknown as string, 'wbs-be-01/via-gw-01', ['read']);
  } catch (caught) {
    failure = caught;
  }
  expect(failure).toEqual(new Error('credential was not verified'));
});
