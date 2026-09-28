import { expect, test } from 'bun:test';
import { SignJWT } from 'jose';

import { AuthService } from '../service/auth.service';
import { inMemoryUsers } from '../testing/auth-fixture';
import { testClock } from '../testing/clock-fixture';
import {
  bearerContextCredential,
  bearerContextIssuer,
  nativeCredentialSource,
} from './bearer-context';
import { bunPasswordHasher, joseTokenCodec } from './bun-runtime';
import { DelegationSourceIneligible } from './delegation-issuer';

async function rejectionOf(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending;
    return null;
  } catch (cause) {
    return cause;
  }
}

test('refuses ambiguous browser and bearer credentials', () => {
  const headers = new Headers({
    cookie: '__Host-wbs_access=browser',
    authorization: 'Bearer other',
  });
  expect(bearerContextCredential(headers)).toBeNull();
  expect(
    bearerContextCredential(
      new Headers({ cookie: '__Host-wbs_access=browser', authorization: 'Basic other' }),
    ),
  ).toBeNull();
});

test('binds a native session to its own user and requested organization', async () => {
  const key = crypto.randomUUID() + crypto.randomUUID();
  const auth = new AuthService({
    clock: testClock,
    users: inMemoryUsers(),
    tokens: joseTokenCodec(key),
    passwords: bunPasswordHasher,
  });
  const registered = await auth.register('ada', 'correct-horse');
  if (!registered.ok) throw new Error('registration fixture failed');
  const source = await nativeCredentialSource(auth, key)(registered.value.token, 'org-a');
  expect(source.kind).toBe('verified-first-party-credential');
  expect(source.userId).toBe(registered.value.user.id);
  expect(source.organizationId).toBe('org-a');
  expect(source.scopeCeiling).toEqual(['read', 'write', 'editor']);
  expect(
    await rejectionOf(nativeCredentialSource(auth, key)(registered.value.token, '')),
  ).toBeInstanceOf(Error);
  expect(
    await rejectionOf(
      nativeCredentialSource(auth, crypto.randomUUID())(registered.value.token, 'org-a'),
    ),
  ).toBeInstanceOf(Error);
});

test('refuses a substituted account behind a valid native credential', async () => {
  const key = crypto.randomUUID() + crypto.randomUUID();
  const now = Date.now();
  const credential = await new SignJWT({ username: 'bob' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('bob-id')
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + 300)
    .sign(new TextEncoder().encode(key));
  const substituted = {
    authenticate: () => Promise.resolve({ id: 'ada-id', username: 'ada', scopes: ['read'] }),
  } as unknown as AuthService;
  expect(
    await rejectionOf(nativeCredentialSource(substituted, key)(credential, 'org-a')),
  ).toHaveProperty('message', 'invalid native session binding');
});

test('refuses an expired native credential even when account lookup still succeeds', async () => {
  const key = crypto.randomUUID() + crypto.randomUUID();
  const credential = await new SignJWT({ username: 'ada' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('ada-id')
    .setIssuedAt(1000)
    .setExpirationTime(1010)
    .sign(new TextEncoder().encode(key));
  const staleAccount = {
    authenticate: () => Promise.resolve({ id: 'ada-id', username: 'ada', scopes: ['read'] }),
  } as unknown as AuthService;
  expect(
    await rejectionOf(
      nativeCredentialSource(staleAccount, key, () => 1_020_000)(credential, 'org-a'),
    ),
  ).toBeInstanceOf(Error);
});

test('refuses direct issuance before activation, without membership, or from a delegated source', async () => {
  const source = {
    kind: 'verified-first-party-credential',
    delegated: false,
    credentialExpiresAt: Date.now() + 30_000,
    userId: 'ada',
    organizationId: 'org-a',
    scopeCeiling: ['read'],
  } as const;
  const issuer = () => Promise.resolve('signed');
  const inactive = bearerContextIssuer(
    () => Promise.resolve(source),
    { resolve: () => Promise.resolve({ ok: true, access: { kind: 'legacy' } }) },
    issuer,
  );
  expect(await inactive('native', 'org-a')).toEqual({ kind: 'inactive' });
  const foreign = bearerContextIssuer(
    () => Promise.resolve(source),
    { resolve: () => Promise.resolve({ ok: false, refusal: 'not_a_member' }) },
    issuer,
  );
  expect(await foreign('native', 'org-a')).toEqual({ kind: 'forbidden' });
  const delegated = bearerContextIssuer(
    () => Promise.resolve({ ...source, delegated: true }),
    {
      resolve: () =>
        Promise.resolve({
          ok: true,
          access: {
            kind: 'scoped',
            scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
          },
        }),
    },
    issuer,
  );
  expect(await delegated('delegated', 'org-a')).toEqual({ kind: 'forbidden' });
  const overScoped = bearerContextIssuer(
    () => Promise.resolve(source),
    {
      resolve: () =>
        Promise.resolve({
          ok: true,
          access: {
            kind: 'scoped',
            scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
          },
        }),
    },
    () => Promise.reject(new DelegationSourceIneligible('scope exceeds credential')),
  );
  expect(await overScoped('native', 'org-a')).toEqual({ kind: 'forbidden' });
});

test('takes a browser session or bearer credential without trusting organization headers', () => {
  expect(bearerContextCredential(new Headers({ cookie: '__Host-wbs_access=browser' }))).toBe(
    'browser',
  );
  expect(bearerContextCredential(new Headers({ authorization: 'Bearer direct' }))).toBe('direct');
  expect(
    bearerContextCredential(
      new Headers({ authorization: 'Bearer direct', 'x-wbs-organization': 'forged' }),
    ),
  ).toBe('direct');
});
