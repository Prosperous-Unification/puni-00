import { AuthService } from '@wbs/core/service/auth.service';
import { expect, test } from 'bun:test';
import { SignJWT } from 'jose';

import { inMemoryUsers } from '../testing/auth-fixture';
import { testClock } from '../testing/clock-fixture';
import { bunPasswordHasher, joseTokenCodec } from './bun-runtime';
import { organizationCredentialEvidence } from './organization-credential';

test('native evidence verifies account, jti, expiry and exact credential bytes', async () => {
  const key = 'k'.repeat(64);
  const auth = new AuthService({
    clock: testClock,
    users: inMemoryUsers(),
    tokens: joseTokenCodec(key),
    passwords: bunPasswordHasher,
  });
  const registered = await auth.register('ada', 'correct-horse');
  if (!registered.ok) throw new Error('registration failed');
  const principal = await auth.authenticate(registered.value.token);
  if (principal === null) throw new Error('session authentication failed');
  const evidenceOf = organizationCredentialEvidence(auth, key);
  const evidence = await evidenceOf(registered.value.token, principal);
  expect(evidence).toMatchObject({ kind: 'native', userId: principal.id });
  expect(evidence?.digest).toMatch(/^[a-f0-9]{64}$/);
  expect(evidence?.expiresAt).toBeGreaterThan(Date.now());
  expect(await evidenceOf(registered.value.token, { ...principal, id: 'other' })).toBeNull();
  expect(await evidenceOf(`${registered.value.token}x`, principal)).toBeNull();
});

test('legacy native token without jti and expired token cannot bind an organization', async () => {
  const key = 'k'.repeat(64);
  const auth = new AuthService({
    clock: testClock,
    users: inMemoryUsers(),
    tokens: joseTokenCodec(key),
    passwords: bunPasswordHasher,
  });
  const registered = await auth.register('ada', 'correct-horse');
  if (!registered.ok) throw new Error('registration failed');
  const principal = await auth.authenticate(registered.value.token);
  if (principal === null) throw new Error('session authentication failed');
  const now = Math.floor(Date.now() / 1000);
  const legacy = await new SignJWT({ username: principal.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(principal.id)
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(new TextEncoder().encode(key));
  const expired = await new SignJWT({ username: principal.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(principal.id)
    .setJti(crypto.randomUUID())
    .setIssuedAt(now - 120)
    .setExpirationTime(now - 60)
    .sign(new TextEncoder().encode(key));
  const unbounded = await new SignJWT({ username: principal.username, exp: 1e300 })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(principal.id)
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .sign(new TextEncoder().encode(key));
  const evidenceOf = organizationCredentialEvidence(auth, key);
  expect(await evidenceOf(legacy, principal)).toBeNull();
  expect(await evidenceOf(expired, principal)).toBeNull();
  expect(await evidenceOf(unbounded, principal)).toBeNull();
});
