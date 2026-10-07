import { expect, test } from 'bun:test';
import { decodeJwt } from 'jose';

import { organizationCookieBinding } from './organization-cookie';

const credential = {
  kind: 'native' as const,
  userId: 'ada',
  digest: 'a'.repeat(64),
  expiresAt: 1_100_000,
};

test('binds one selected organization to the exact current credential and user', async () => {
  const binding = organizationCookieBinding('k'.repeat(64), () => 1_000_000);
  const issued = await binding.issue(credential, 'org-a');
  expect(decodeJwt(issued.value).exp).toBe(1100);
  expect(await binding.read(issued.value, credential)).toBe('org-a');
  expect(await binding.read(issued.value, { ...credential, userId: 'bob' })).toBeNull();
  expect(await binding.read(issued.value, { ...credential, digest: 'b'.repeat(64) })).toBeNull();
  expect(await binding.read(issued.value, { ...credential, kind: 'oidc' })).toBeNull();
  expect(await binding.read(`${issued.value}x`, credential)).toBeNull();
  expect(issued.maxAge).toBe(100);
});

test('ends a selection at the access credential expiry', async () => {
  let current = 1_000_000;
  const binding = organizationCookieBinding('k'.repeat(64), () => current);
  const issued = await binding.issue(credential, 'org-a');
  current = 1_100_000;
  expect(await binding.read(issued.value, credential)).toBeNull();
  expect(binding.issue({ ...credential, expiresAt: current }, 'org-a')).rejects.toThrow();
});
