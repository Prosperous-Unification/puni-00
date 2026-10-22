import { expect, it } from 'bun:test';
import { generateKeyPair, jwtVerify, SignJWT } from 'jose';

import { delegationVerifier } from './delegation';
import { delegationIssuer } from './delegation-issuer';

async function rejectionOf(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending;
    return null;
  } catch (cause) {
    return cause;
  }
}

it('issues a direct context with a native identity and fixed audience', async () => {
  const keys = await generateKeyPair('RS256');
  const issue = delegationIssuer(
    keys.privateKey,
    (_credential, organizationId) =>
      Promise.resolve({
        kind: 'verified-first-party-credential',
        delegated: false,
        credentialExpiresAt: 1_100_000,
        userId: 'ada',
        organizationId: organizationId ?? '',
        scopeCeiling: ['read'],
      }),
    () => Promise.resolve(true),
    () => 1_000_000,
  );
  const token = await issue('native-session', 'wbs-be-01/direct', ['read'], 'org-a');
  const verified = await jwtVerify(token, keys.publicKey, { currentDate: new Date(1_000_000) });
  expect(verified.payload.aud).toBe('wbs-be-01/direct');
  expect(verified.payload['identity_kind']).toBe('first_party');
  expect(verified.payload['upstream_iss']).toBeUndefined();
  expect(verified.payload['org']).toBe('org-a');
  expect(verified.payload.exp! - verified.payload.iat!).toBe(100);
  const verify = delegationVerifier(
    keys.publicKey,
    () => Promise.resolve(null),
    () => Promise.resolve(true),
    () => 1_000_000,
    (userId) => Promise.resolve(userId === 'ada' ? { id: 'ada', username: 'ada' } : null),
  );
  expect((await verify(token, 'wbs-be-01/direct')).kind).toBe('verified');
  expect((await verify(token, 'wbs-be-01/via-mcp-01')).kind).toBe('refused');
  const swapped = delegationVerifier(
    keys.publicKey,
    () => Promise.resolve(null),
    () => Promise.resolve(true),
    () => 1_000_000,
    () => Promise.resolve({ id: 'bob', username: 'bob' }),
  );
  expect((await swapped(token, 'wbs-be-01/direct')).kind).toBe('refused');
  expect(
    await rejectionOf(
      delegationVerifier(
        keys.publicKey,
        () => Promise.resolve(null),
        () => Promise.resolve(true),
        () => 1_000_000,
      )(token, 'wbs-be-01/direct'),
    ),
  ).toHaveProperty('message', 'direct account lookup unavailable');
  expect(
    (
      await delegationVerifier(
        keys.publicKey,
        () => Promise.resolve(null),
        () => Promise.resolve(true),
        () => 1_000_000,
        () => Promise.resolve(null),
      )(token, 'wbs-be-01/direct')
    ).kind,
  ).toBe('refused');
  expect(
    (
      await delegationVerifier(
        keys.publicKey,
        () => Promise.resolve(null),
        () => Promise.resolve(true),
        () => 1_101_000,
        (userId) => Promise.resolve({ id: userId, username: userId }),
      )(token, 'wbs-be-01/direct')
    ).kind,
  ).toBe('refused');
  expect(
    await rejectionOf(issue('native-session', 'wbs-be-01/direct', ['write'], 'org-a')),
  ).toBeInstanceOf(Error);
  expect(
    await rejectionOf(issue('native-session', 'wbs-be-01/via-gw-01', ['read'], 'org-a')),
  ).toBeInstanceOf(Error);
  const nonmember = delegationIssuer(
    keys.privateKey,
    (_credential, organizationId) =>
      Promise.resolve({
        kind: 'verified-first-party-credential',
        delegated: false,
        credentialExpiresAt: 1_100_000,
        userId: 'ada',
        organizationId: organizationId ?? '',
        scopeCeiling: ['read'],
      }),
    () => Promise.resolve(false),
    () => 1_000_000,
  );
  expect(
    await rejectionOf(nonmember('native-session', 'wbs-be-01/direct', ['read'], 'org-a')),
  ).toBeInstanceOf(Error);
  const delegated = delegationIssuer(
    keys.privateKey,
    (_credential, organizationId) =>
      Promise.resolve({
        kind: 'verified-first-party-credential',
        delegated: true,
        credentialExpiresAt: 1_100_000,
        userId: 'ada',
        organizationId: organizationId ?? '',
        scopeCeiling: ['read'],
      }),
    () => Promise.resolve(true),
    () => 1_000_000,
  );
  expect(
    await rejectionOf(delegated('delegated', 'wbs-be-01/direct', ['read'], 'org-a')),
  ).toBeInstanceOf(Error);
});

it('refuses an unknown signed identity variant', async () => {
  const keys = await generateKeyPair('RS256');
  const token = await new SignJWT({
    org: 'org-a',
    client: 'client',
    grant: 'grant',
    scope: 'read',
    upstream_iss: 'issuer',
    upstream_sub: 'subject',
    identity_kind: 'unknown',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'wbs-delegation+jwt' })
    .setIssuer('wbs')
    .setSubject('ada')
    .setAudience('wbs-be-01/via-mcp-01')
    .setJti(crypto.randomUUID())
    .setIssuedAt(1000)
    .setExpirationTime(1100)
    .sign(keys.privateKey);
  const verify = delegationVerifier(
    keys.publicKey,
    () => Promise.resolve({ id: 'ada', username: 'ada' }),
    () => Promise.resolve(true),
    () => 1_000_000,
  );
  expect((await verify(token, 'wbs-be-01/via-mcp-01')).kind).toBe('refused');
});

it('refuses signed first-party tokens carrying upstream identity claims', async () => {
  const keys = await generateKeyPair('RS256');
  const token = await new SignJWT({
    org: 'org-a',
    scope: 'read',
    identity_kind: 'first_party',
    upstream_iss: 'https://idp.test',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'wbs-delegation+jwt' })
    .setIssuer('wbs')
    .setSubject('ada')
    .setAudience('wbs-be-01/direct')
    .setJti(crypto.randomUUID())
    .setIssuedAt(1000)
    .setExpirationTime(1100)
    .sign(keys.privateKey);
  const verify = delegationVerifier(
    keys.publicKey,
    () => Promise.resolve(null),
    () => Promise.resolve(true),
    () => 1_000_000,
    () => Promise.resolve({ id: 'ada', username: 'ada' }),
  );
  expect((await verify(token, 'wbs-be-01/direct')).kind).toBe('refused');
});

it('refuses signed first-party tokens for MCP and gateway audiences', async () => {
  const keys = await generateKeyPair('RS256');
  const verify = delegationVerifier(
    keys.publicKey,
    () => Promise.resolve(null),
    () => Promise.resolve(true),
    () => 1_000_000,
    () => Promise.resolve({ id: 'ada', username: 'ada' }),
  );
  const outcomes = [];
  for (const audience of ['wbs-be-01/via-mcp-01', 'wbs-be-01/via-gw-01'] as const) {
    const token = await new SignJWT({ org: 'org-a', scope: 'read', identity_kind: 'first_party' })
      .setProtectedHeader({ alg: 'RS256', typ: 'wbs-delegation+jwt' })
      .setIssuer('wbs')
      .setSubject('ada')
      .setAudience(audience)
      .setJti(crypto.randomUUID())
      .setIssuedAt(1000)
      .setExpirationTime(1100)
      .sign(keys.privateKey);
    outcomes.push((await verify(token, audience)).kind);
  }
  expect(outcomes).toEqual(['refused', 'refused']);
});

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

/** A signed MCP delegation for ada with `claims` added; time is fixed at 1000 s. */
async function consentToken(
  keys: CryptoKeyPair,
  claims: Record<string, string>,
  scope = 'read write editor',
): Promise<string> {
  return new SignJWT({
    org: 'org-a',
    scope,
    client: 'client-1',
    grant: 'family-claire',
    upstream_iss: 'https://idp.test/',
    upstream_sub: 'auth0|ada',
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'wbs-delegation+jwt' })
    .setIssuer('wbs')
    .setSubject('ada')
    .setAudience('wbs-be-01/via-mcp-01')
    .setJti(crypto.randomUUID())
    .setIssuedAt(1000)
    .setExpirationTime(1100)
    .sign(keys.privateKey);
}

/** The live consent credential of family-claire, pinned to claire and bound to ada. */
const CLAIRE_CONSENT = {
  id: 'credential-claire',
  organizationId: 'org-a',
  personId: 'claire',
  source: 'mcp_consent',
  boundAccountId: 'ada',
  revokedAt: null,
  trustedIssuerId: null,
  mcpFamilyId: 'family-claire',
  secrets: [],
} as const;

it('admits a consent delegation as its agent, capped to read and write', async () => {
  const keys = await generateKeyPair('RS256');
  const verify = delegationVerifier(
    keys.publicKey,
    () => Promise.resolve({ id: 'ada', username: 'ada' }),
    () => Promise.resolve(true),
    () => 1_000_000,
    undefined,
    (id) => Promise.resolve(id === 'credential-claire' ? CLAIRE_CONSENT : null),
  );
  const outcome = await verify(
    await consentToken(keys, { credential_id: 'credential-claire', person_id: 'claire' }),
    'wbs-be-01/via-mcp-01',
  );
  expect(outcome).toMatchObject({
    kind: 'verified',
    principal: {
      id: 'ada',
      scopes: ['read', 'write'],
      authentication: {
        kind: 'consent',
        issuer: 'https://idp.test/',
        subject: 'auth0|ada',
        credentialId: 'credential-claire',
        personId: 'claire',
      },
    },
  });
  // Another person than the credential's, a revoked credential, another family's and an
  // absent one are refused.
  for (const [claims, record] of [
    [{ credential_id: 'credential-claire', person_id: 'codex' }, CLAIRE_CONSENT],
    [
      { credential_id: 'credential-claire', person_id: 'claire' },
      { ...CLAIRE_CONSENT, revokedAt: 5 },
    ],
    [
      { credential_id: 'credential-claire', person_id: 'claire' },
      { ...CLAIRE_CONSENT, mcpFamilyId: 'family-other' },
    ],
    [
      { credential_id: 'credential-claire', person_id: 'claire' },
      { ...CLAIRE_CONSENT, boundAccountId: 'bob' },
    ],
    [{ credential_id: 'credential-claire', person_id: 'claire' }, null],
  ] as const) {
    const refusing = delegationVerifier(
      keys.publicKey,
      () => Promise.resolve({ id: 'ada', username: 'ada' }),
      () => Promise.resolve(true),
      () => 1_000_000,
      undefined,
      () => Promise.resolve(record),
    );
    expect((await refusing(await consentToken(keys, claims), 'wbs-be-01/via-mcp-01')).kind).toBe(
      'refused',
    );
  }
  // A consent delegation reaching a composition without the reader is a wiring fault.
  expect(
    await rejectionOf(
      delegationVerifier(
        keys.publicKey,
        () => Promise.resolve({ id: 'ada', username: 'ada' }),
        () => Promise.resolve(true),
        () => 1_000_000,
      )(
        await consentToken(keys, { credential_id: 'credential-claire', person_id: 'claire' }),
        'wbs-be-01/via-mcp-01',
      ),
    ),
  ).toHaveProperty(
    'message',
    'a consent delegation was presented but consent credentials are not wired',
  );
});

it('refuses a consent delegation that names a person without its credential', async () => {
  const keys = await generateKeyPair('RS256');
  const verify = delegationVerifier(
    keys.publicKey,
    () => Promise.resolve({ id: 'ada', username: 'ada' }),
    () => Promise.resolve(true),
    () => 1_000_000,
    undefined,
    () => Promise.resolve(CLAIRE_CONSENT),
  );
  const halves: Record<string, string>[] = [
    { person_id: 'claire' },
    { credential_id: 'credential-claire' },
  ];
  for (const claims of halves)
    expect((await verify(await consentToken(keys, claims), 'wbs-be-01/via-mcp-01')).kind).toBe(
      'refused',
    );
});
