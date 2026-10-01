import { expect, test } from 'bun:test';

import { oidcCredentialEvidence } from './oidc-credential-evidence';

const options = { groupPrefix: 'dev', groupsClaim: 'groups' };
const claims = {
  iss: 'https://issuer.example',
  sub: 'subject-1',
  exp: 1100,
  email: 'ada@example.com',
  email_verified: true,
  groups: ['dev:wbs:read'],
};

test('evidence comes from verified OIDC claims and exact token bytes', async () => {
  const source = oidcCredentialEvidence(
    { verify: () => Promise.resolve(claims) },
    options,
    () => 1_000_000,
  );
  const first = await source('signed-upstream-token');
  const replacement = await source('signed-upstream-token-2');
  expect(first).toMatchObject({
    kind: 'oidc',
    expiresAt: 1_100_000,
    identity: { issuer: 'https://issuer.example', subject: 'subject-1', scopes: ['read'] },
  });
  expect(first?.digest).toMatch(/^[a-f0-9]{64}$/);
  expect(first?.digest).not.toBe(replacement?.digest);
});

test('OIDC evidence refuses missing, malformed and past expiry after verification', async () => {
  for (const exp of [undefined, '1100', NaN, 1000, Number.MAX_SAFE_INTEGER]) {
    const source = oidcCredentialEvidence(
      { verify: () => Promise.resolve({ ...claims, exp }) },
      options,
      () => 1_000_000,
    );
    expect(await source('signed-upstream-token')).toBeNull();
  }
});

test('OIDC evidence propagates infrastructure failure', async () => {
  const source = oidcCredentialEvidence(
    { verify: () => Promise.reject(new Error('JWKS offline')) },
    options,
    () => 1_000_000,
  );
  let failure: unknown;
  try {
    await source('signed-upstream-token');
  } catch (caught) {
    failure = caught;
  }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toBe('JWKS offline');
});
