import { inMemoryUsers } from '@wbs/store-memory/auth-fixture';
import { expect, test } from 'bun:test';

import { clockOf } from '../../ports/clock';
import { AccountResource } from './account.resource';

test('direct account resource reports an absent OIDC identity store', () => {
  const account = new AccountResource({
    users: inMemoryUsers(),
    clock: clockOf({ now: () => 1, newId: () => 'candidate' }),
  });
  expect(() =>
    account.resolveIdentity({
      issuer: 'https://id.example',
      subject: 'subject',
      email: null,
      emailVerified: false,
      scopes: ['read'],
    }),
  ).toThrow('OIDC identity store is not configured');
});
